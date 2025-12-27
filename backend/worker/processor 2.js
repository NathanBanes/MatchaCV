const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const { queue } = require('../queue/queue');
const db = require('../database/connection');
const s3Storage = require('../utils/s3Storage');
const resumeParser = require('../utils/resumeParser');
const jobAnalyzer = require('../utils/jobAnalyzer');
const atsScorer = require('../utils/atsScorer');
const suggestionGenerator = require('../utils/suggestionGenerator');
const { io: socketIOClient } = require('socket.io-client');

// Handle case where Socket.IO server might not be available
let io = null;
try {
    io = socketIOClient(`http://localhost:${process.env.PORT || 3000}`, {
        transports: ['websocket', 'polling'],
        reconnection: false, // Don't auto-reconnect in worker
        timeout: 5000
    });

    io.on('connect', () => {
        console.log('Worker: Connected to Socket.IO server');
    });

    io.on('disconnect', () => {
        console.log('Worker: Disconnected from Socket.IO server');
    });

    io.on('connect_error', (error) => {
        console.warn('Worker: Socket.IO connection error (continuing without WebSocket):', error.message);
        io = null; // Disable WebSocket if connection fails
    });
} catch (error) {
    console.warn('Worker: Failed to initialize Socket.IO client (continuing without WebSocket):', error.message);
    io = null;
}

// Connect to Socket.IO server as a client to emit events
const io = socketIOClient(`http://localhost:${process.env.PORT || 3000}`, {
    transports: ['websocket', 'polling']
});

io.on('connect', () => {
    console.log('Worker: Connected to Socket.IO server');
});

io.on('disconnect', () => {
    console.log('Worker: Disconnected from Socket.IO server');
});

io.on('connect_error', (error) => {
    console.error('Worker: Socket.IO connection error:', error.message);
});

/**
 * Process a resume analysis job
 */
async function processJob(job) {
    const { jobId, s3FileKey, originalFilename, jobPostingType, jobUrl, jobPaste } = job.data;
    
    console.log(`Worker: Processing job ${jobId}`);
    
    try {
        // Update job status to processing
        await db.updateJobStatus(jobId, 'processing');
        
        // Emit status update via WebSocket (if available)
        if (io && io.connected) {
            io.emit('job:status', {
                jobId,
                status: 'processing',
                message: 'Downloading resume from storage...',
                timestamp: new Date().toISOString()
            });
        }

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

        if (io && io.connected) {
            io.emit('job:status', {
                jobId,
                status: 'processing',
                message: 'Parsing resume...',
                timestamp: new Date().toISOString()
            });
        }

        // Parse resume
        const resumeText = await resumeParser.parseResume(tempFilePath, originalFilename);

        if (io && io.connected) {
            io.emit('job:status', {
                jobId,
                status: 'processing',
                message: 'Analyzing job description...',
                timestamp: new Date().toISOString()
            });
        }

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

        if (io && io.connected) {
            io.emit('job:status', {
                jobId,
                status: 'processing',
                message: 'Extracting keywords...',
                timestamp: new Date().toISOString()
            });
        }

        // Extract keywords from job description
        const jobKeywords = jobAnalyzer.extractKeywords(jobDescription);

        if (io && io.connected) {
            io.emit('job:status', {
                jobId,
                status: 'processing',
                message: 'Calculating ATS score...',
                timestamp: new Date().toISOString()
            });
        }

        // Score resume against job description
        const score = atsScorer.calculateScore(resumeText, jobKeywords);

        if (io && io.connected) {
            io.emit('job:status', {
                jobId,
                status: 'processing',
                message: 'Generating suggestions...',
                timestamp: new Date().toISOString()
            });
        }

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
        const fs = require('fs');
        if (fs.existsSync(tempFilePath)) {
            fs.unlinkSync(tempFilePath);
        }

        // Emit completion via WebSocket (if available)
        if (io && io.connected) {
            io.emit('job:complete', {
                jobId,
                results: {
                    success: true,
                    ...results
                },
                timestamp: new Date().toISOString()
            });
        }

        console.log(`Worker: Job ${jobId} completed successfully`);
        
        return results;

    } catch (error) {
        console.error(`Worker: Job ${jobId} failed:`, error);
        
        // Update job status to failed
        await db.updateJobStatus(jobId, 'failed', error.message);

        // Emit error via WebSocket (if available)
        if (io && io.connected) {
            io.emit('job:error', {
                jobId,
                error: error.message,
                timestamp: new Date().toISOString()
            });
        }

        // Clean up temporary file if it exists
        const fs = require('fs');
        const tempDir = path.join(__dirname, '..', 'uploads', 'temp');
        const tempFilePath = path.join(tempDir, `${jobId}-${originalFilename}`);
        if (fs.existsSync(tempFilePath)) {
            fs.unlinkSync(tempFilePath);
        }

        throw error;
    }
}

// Process jobs from the queue
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

// Graceful shutdown
process.on('SIGTERM', async () => {
    console.log('Worker: SIGTERM received, shutting down gracefully...');
    await queue.close();
    if (io) {
        io.disconnect();
    }
    await db.close();
    process.exit(0);
});

process.on('SIGINT', async () => {
    console.log('Worker: SIGINT received, shutting down gracefully...');
    await queue.close();
    if (io) {
        io.disconnect();
    }
    await db.close();
    process.exit(0);
});

console.log('Worker: Resume analysis worker started');
console.log('Worker: Waiting for jobs...');

