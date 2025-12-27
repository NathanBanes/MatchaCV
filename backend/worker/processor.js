const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });

const queueModule = require('../queue/queue');
const queue = queueModule.queue;
const db = require('../database/connection');
const s3Storage = require('../utils/s3Storage');
const resumeParser = require('../utils/resumeParser');
const jobAnalyzer = require('../utils/jobAnalyzer');
const atsScorer = require('../utils/atsScorer');
const suggestionGenerator = require('../utils/suggestionGenerator');

// Helper function to notify server via HTTP (triggers Socket.IO emission)
async function notifyServer(jobId, event, data) {
    try {
        const http = require('http');
        const serverUrl = process.env.SERVER_URL || 'http://localhost:3000';
        
        if (event === 'complete') {
            const url = `${serverUrl}/api/job/${jobId}/notify-complete`;
            const postData = JSON.stringify({ results: data });
            
            const options = {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Content-Length': Buffer.byteLength(postData)
                }
            };
            
            return new Promise((resolve, reject) => {
                console.log(`Worker: Sending notification to ${url}`);
                const req = http.request(url, options, (res) => {
                    let body = '';
                    res.on('data', (chunk) => { body += chunk; });
                    res.on('end', () => {
                        console.log(`Worker: Notification response: ${res.statusCode} - ${body}`);
                        if (res.statusCode === 200) {
                            try {
                                resolve(JSON.parse(body));
                            } catch (parseError) {
                                console.warn(`Worker: Failed to parse response: ${parseError.message}`);
                                resolve(null);
                            }
                        } else {
                            console.warn(`Worker: Notification failed with status ${res.statusCode}: ${body}`);
                            resolve(null); // Don't fail the job if notification fails
                        }
                    });
                });
                
                req.on('error', (error) => {
                    console.error(`Worker: Failed to notify server: ${error.message}`);
                    console.error(`Worker: Error details:`, error);
                    resolve(null); // Don't fail the job if notification fails
                });
                
                req.setTimeout(5000, () => {
                    console.warn(`Worker: Notification request timed out`);
                    req.destroy();
                    resolve(null);
                });
                
                req.write(postData);
                req.end();
            });
        }
    } catch (error) {
        console.warn(`Worker: Notification error: ${error.message}`);
        return null; // Don't fail the job if notification fails
    }
}

/**
 * Process a resume analysis job
 */
async function processJob(job) {
    const { jobId, s3FileKey, originalFilename, jobPostingType, jobUrl, jobPaste } = job.data;
    
    console.log(`Worker: Processing job ${jobId}`);
    
    try {
        // Update job status to processing
        await db.updateJobStatus(jobId, 'processing');
        
        // Status updates are handled by polling in the frontend

        // Download file from S3 to temporary location
        const fs = require('fs');
        const tempDir = path.join(__dirname, '..', 'uploads', 'temp');
        if (!fs.existsSync(tempDir)) {
            fs.mkdirSync(tempDir, { recursive: true });
        }
        const tempFilePath = path.join(tempDir, `${jobId}-${originalFilename}`);
        
        try {
            await s3Storage.downloadFile(s3FileKey, tempFilePath);
        } catch (downloadError) {
            console.error(`Worker: Failed to download file from S3: ${downloadError.message}`);
            throw new Error(`Failed to download resume from storage: ${downloadError.message}`);
        }

        // Status updates are handled by polling in the frontend

        // Parse resume
        const resumeText = await resumeParser.parseResume(tempFilePath, originalFilename);

        // Status updates are handled by polling in the frontend

        // Analyze job description
        let jobDescription = '';
        if (jobPostingType === 'url' && jobUrl) {
            jobDescription = await jobAnalyzer.extractFromUrl(jobUrl);
        } else if (jobPostingType === 'paste' && jobPaste) {
            jobDescription = jobPaste;
        }

        if (!jobDescription || jobDescription.trim().length === 0) {
            throw new Error('Could not extract job description');
        }

        // Status updates are handled by polling in the frontend

        // Extract keywords from job description
        const jobKeywords = jobAnalyzer.extractKeywords(jobDescription);

        // Status updates are handled by polling in the frontend

        // Score resume against job description
        const score = atsScorer.calculateScore(resumeText, jobKeywords);

        // Status updates are handled by polling in the frontend

        // Generate suggestions (async with AI support)
        const suggestions = await suggestionGenerator.generateSuggestions(
            resumeText,
            jobKeywords,
            jobDescription,
            score
        );

        // Prepare results
        const results = {
            score: score,
            suggestions: suggestions,
            keywordMatch: {
                found: score.keywordMatches,
                total: jobKeywords.all.length,
                percentage: score.overallScore
            }
        };

        // Save results to database
        await db.saveResults(jobId, {
            score,
            suggestions,
            keywordMatches: results.keywordMatch
        });

        // Clean up temporary file
        if (fs.existsSync(tempFilePath)) {
            fs.unlinkSync(tempFilePath);
        }

        // Notify server to emit completion via WebSocket
        console.log(`Worker: Notifying server of job completion for ${jobId}`);
        try {
            const notifyResult = await notifyServer(jobId, 'complete', {
                results: {
                    success: true,
                    score: results.score,
                    suggestions: results.suggestions,
                    keywordMatch: results.keywordMatch
                }
            });
            if (notifyResult) {
                console.log(`Worker: Server notification successful for ${jobId}`);
            } else {
                console.warn(`Worker: Server notification failed for ${jobId} (but job completed)`);
            }
        } catch (notifyError) {
            console.error(`Worker: Error notifying server for ${jobId}:`, notifyError.message);
        }

        console.log(`Worker: Job ${jobId} completed successfully`);
        
        return results;

    } catch (error) {
        console.error(`Worker: Job ${jobId} failed:`, error);
        
        // Update job status to failed
        await db.updateJobStatus(jobId, 'failed', error.message);

        // Error notification - frontend will detect via polling

        // Clean up temporary file if it exists
        const tempDir = path.join(__dirname, '..', 'uploads', 'temp');
        const tempFilePath = path.join(tempDir, `${jobId}-${originalFilename}`);
        if (fs.existsSync(tempFilePath)) {
            fs.unlinkSync(tempFilePath);
        }

        throw error;
    }
}

// Process jobs from the queue (only if queue is initialized)
if (queue) {
    queue.process(async (job) => {
        console.log(`Worker: Starting to process job ${job.id}`);
        return await processJob(job);
    });

    // Handle job completion
    queue.on('completed', (job, result) => {
        console.log(`Worker: Job ${job.id} completed with result`);
    });

    // Handle job failure
    queue.on('failed', (job, err) => {
        console.error(`Worker: Job ${job.id} failed:`, err.message);
    });
} else {
    console.error('Worker: Queue is not initialized. Cannot process jobs.');
    console.error('Worker: Please ensure Redis is configured and running.');
}

// Graceful shutdown
process.on('SIGTERM', async () => {
    console.log('Worker: SIGTERM received, shutting down gracefully...');
    if (queue) {
        await queue.close();
    }
    // No Socket.IO client to disconnect
    if (db && db.close) {
        await db.close();
    }
    process.exit(0);
});

process.on('SIGINT', async () => {
    console.log('Worker: SIGINT received, shutting down gracefully...');
    if (queue) {
        await queue.close();
    }
    // No Socket.IO client to disconnect
    if (db && db.close) {
        await db.close();
    }
    process.exit(0);
});

console.log('Worker: Resume analysis worker started');
console.log('Worker: Waiting for jobs...');

