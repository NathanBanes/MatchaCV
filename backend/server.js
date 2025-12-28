const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

// Debug: Check if API key is loaded
console.log('Server: Working directory:', __dirname);
console.log('Server: Checking environment variables...');
console.log('Server: OPENAI_API_KEY exists:', !!process.env.OPENAI_API_KEY);
if (process.env.OPENAI_API_KEY) {
    console.log('Server: OPENAI_API_KEY length:', process.env.OPENAI_API_KEY.length);
    console.log('Server: OPENAI_API_KEY starts with:', process.env.OPENAI_API_KEY.substring(0, 15) + '...');
} else {
    console.log('Server: WARNING - No OPENAI_API_KEY found!');
    console.log('Server: Check if .env file exists in:', __dirname);
}

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const multer = require('multer');
const cors = require('cors');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const resumeParser = require('./utils/resumeParser');
const jobAnalyzer = require('./utils/jobAnalyzer');
const atsScorer = require('./utils/atsScorer');
const suggestionGenerator = require('./utils/suggestionGenerator');
const s3Storage = require('./utils/s3Storage');
const db = require('./database/connection');
const queue = require('./queue/queue');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: process.env.FRONTEND_URL || '*', // Use FRONTEND_URL from env or allow all
        methods: ['GET', 'POST']
    }
});

const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors({
    origin: process.env.FRONTEND_URL || '*',
    credentials: true
}));
app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'frontend'))); // Serve static files from frontend folder

// Create uploads directory if it doesn't exist
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
}

// Configure multer for temporary file storage (before S3 upload)
const storage = multer.memoryStorage(); // Use memory storage for S3 upload

const upload = multer({
    storage: storage,
    limits: {
        fileSize: 10 * 1024 * 1024 // 10MB limit
    },
    fileFilter: (req, file, cb) => {
        const allowedTypes = ['.pdf', '.doc', '.docx'];
        const ext = path.extname(file.originalname).toLowerCase();
        if (allowedTypes.includes(ext)) {
            cb(null, true);
        } else {
            cb(new Error('Invalid file type. Only PDF, DOC, and DOCX files are allowed.'));
        }
    }
});

// Async API endpoint for resume analysis (new architecture)
app.post('/api/analyze', upload.single('resumeFile'), async (req, res) => {
    try {
        // Validate required environment variables
        if (!process.env.AWS_ACCESS_KEY_ID || !process.env.AWS_SECRET_ACCESS_KEY || !process.env.AWS_S3_BUCKET) {
            return res.status(500).json({ 
                error: 'AWS S3 not configured', 
                message: 'Please configure AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, and AWS_S3_BUCKET in your .env file' 
            });
        }

        // Check database connection before proceeding
        if (!process.env.DATABASE_URL) {
            console.warn('DATABASE_URL not configured, falling back to sync endpoint');
            // Don't return error, let it fall through to sync processing
            // The frontend will handle sync responses
        } else {
            // Test database connection
            try {
                await db.query('SELECT 1');
            } catch (dbTestError) {
                console.error('Database connection test failed:', dbTestError.message);
                console.warn('Falling back to sync processing mode');
                // Continue to sync endpoint instead of failing
            }
        }

        if (!process.env.REDIS_URL && !process.env.REDIS_HOST) {
            return res.status(500).json({ 
                error: 'Redis not configured', 
                message: 'Please configure REDIS_URL or REDIS_HOST in your .env file' 
            });
        }

        if (!req.file) {
            return res.status(400).json({ error: 'No resume file uploaded' });
        }

        const { jobPostingType, jobUrl, jobPaste } = req.body;

        if (!jobPostingType || (!jobUrl && !jobPaste)) {
            return res.status(400).json({ error: 'Job posting is required' });
        }

        // Generate job ID
        const jobId = uuidv4();
        
        // Save file temporarily to upload to S3
        const tempFilePath = path.join(uploadsDir, `${jobId}-${req.file.originalname}`);
        fs.writeFileSync(tempFilePath, req.file.buffer);

        try {
            // Generate S3 key
            const s3Key = s3Storage.generateS3Key(jobId, req.file.originalname);

            // Upload to S3 with error handling
            let s3Result;
            try {
                s3Result = await s3Storage.uploadFile(
                    tempFilePath,
                    s3Key,
                    req.file.mimetype || 'application/octet-stream'
                );
            } catch (s3Error) {
                console.error('S3 upload error:', s3Error);
                if (fs.existsSync(tempFilePath)) {
                    fs.unlinkSync(tempFilePath);
                }
                return res.status(500).json({ 
                    error: 'Failed to upload file to storage', 
                    message: s3Error.message 
                });
            }

            // Clean up temp file
            if (fs.existsSync(tempFilePath)) {
                fs.unlinkSync(tempFilePath);
            }

            // Create job record in database with error handling
            let job;
            try {
                // Test database connection first
                if (!process.env.DATABASE_URL) {
                    throw new Error('DATABASE_URL not configured');
                }
                
                // Test connection
                await db.query('SELECT 1');
                
                job = await db.createJob({
                    userSession: req.headers['x-session-id'] || null,
                    s3FileUrl: s3Result.url,
                    s3FileKey: s3Key,
                    originalFilename: req.file.originalname,
                    jobPostingType,
                    jobUrl: jobUrl || null,
                    jobPaste: jobPaste || null
                });
            } catch (dbError) {
                console.error('Database error:', dbError.message);
                console.warn('Database unavailable, falling back to synchronous processing');
                
                // Fallback: Process synchronously and return results directly
                try {
                    // Download file from S3 to process
                    const syncTempPath = path.join(uploadsDir, `sync-${jobId}-${req.file.originalname}`);
                    await s3Storage.downloadFile(s3Key, syncTempPath);
                    
                    // Parse resume
                    const resumeText = await resumeParser.parseResume(syncTempPath, req.file.originalname);
                    
                    // Analyze job description
                    let jobDescription = '';
                    if (jobPostingType === 'url' && jobUrl) {
                        jobDescription = await jobAnalyzer.extractFromUrl(jobUrl);
                    } else if (jobPostingType === 'paste' && jobPaste) {
                        jobDescription = jobPaste;
                    }
                    
                    if (!jobDescription || jobDescription.trim().length === 0) {
                        fs.unlinkSync(syncTempPath);
                        await s3Storage.deleteFile(s3Key);
                        return res.status(400).json({ error: 'Could not extract job description' });
                    }
                    
                    // Extract keywords
                    const jobKeywords = jobAnalyzer.extractKeywords(jobDescription);
                    
                    // Score resume
                    const score = atsScorer.calculateScore(resumeText, jobKeywords);
                    
                    // Generate suggestions
                    const suggestions = await suggestionGenerator.generateSuggestions(resumeText, jobKeywords, jobDescription, score);
                    
                    // Clean up
                    fs.unlinkSync(syncTempPath);
                    await s3Storage.deleteFile(s3Key);
                    
                    // Return sync response (frontend will handle this)
                    return res.json({
                        success: true,
                        score: score,
                        suggestions: suggestions,
                        keywordMatch: {
                            found: score.keywordMatches,
                            total: jobKeywords.all.length,
                            percentage: score.overallScore
                        }
                    });
                } catch (syncError) {
                    console.error('Sync processing error:', syncError);
                    // Clean up S3 file
                    try {
                        await s3Storage.deleteFile(s3Key);
                    } catch (deleteError) {
                        console.error('Failed to delete S3 file:', deleteError);
                    }
                    return res.status(500).json({ 
                        error: 'Failed to process resume', 
                        message: syncError.message 
                    });
                }
            }

            // Add job to queue with error handling
            try {
                await queue.addJob({
                    jobId: job.job_id,
                    s3FileKey: s3Key,
                    originalFilename: req.file.originalname,
                    jobPostingType,
                    jobUrl: jobUrl || null,
                    jobPaste: jobPaste || null
                });
            } catch (queueError) {
                console.error('Queue error:', queueError);
                // Update job status to failed
                try {
                    await db.updateJobStatus(job.job_id, 'failed', `Queue error: ${queueError.message}`);
                } catch (updateError) {
                    console.error('Failed to update job status:', updateError);
                }
                return res.status(500).json({ 
                    error: 'Failed to queue job', 
                    message: queueError.message 
                });
            }

            // Return job ID immediately
            res.json({
                success: true,
                jobId: job.job_id,
                status: 'pending',
                message: 'Job queued for processing'
            });

        } catch (error) {
            console.error('Unexpected error in /api/analyze:', error);
            console.error('Error stack:', error.stack);
            // Clean up temp file on error
            if (fs.existsSync(tempFilePath)) {
                try {
                    fs.unlinkSync(tempFilePath);
                } catch (unlinkError) {
                    console.error('Failed to clean up temp file:', unlinkError);
                }
            }
            return res.status(500).json({ 
                error: 'Unexpected error', 
                message: error.message || 'An unexpected error occurred',
                details: process.env.NODE_ENV === 'development' ? error.stack : undefined
            });
        }

    } catch (error) {
        console.error('Analysis error:', error);
        res.status(500).json({ 
            error: 'Analysis failed', 
            message: error.message || 'An error occurred during analysis' 
        });
    }
});

// Fallback synchronous endpoint (for backward compatibility)
app.post('/api/analyze-sync', upload.single('resumeFile'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No resume file uploaded' });
        }

        const { jobPostingType, jobUrl, jobPaste } = req.body;

        if (!jobPostingType || (!jobUrl && !jobPaste)) {
            return res.status(400).json({ error: 'Job posting is required' });
        }

        // Save file temporarily
        const tempFilePath = path.join(uploadsDir, `sync-${Date.now()}-${req.file.originalname}`);
        fs.writeFileSync(tempFilePath, req.file.buffer);

        try {
            // Parse resume
            const resumeText = await resumeParser.parseResume(tempFilePath, req.file.originalname);
            
            // Analyze job description
            let jobDescription = '';
            if (jobPostingType === 'url' && jobUrl) {
                jobDescription = await jobAnalyzer.extractFromUrl(jobUrl);
            } else if (jobPostingType === 'paste' && jobPaste) {
                jobDescription = jobPaste;
            }

            if (!jobDescription || jobDescription.trim().length === 0) {
                fs.unlinkSync(tempFilePath);
                return res.status(400).json({ error: 'Could not extract job description' });
            }

            // Extract keywords from job description
            const jobKeywords = jobAnalyzer.extractKeywords(jobDescription);

            // Score resume against job description
            const score = atsScorer.calculateScore(resumeText, jobKeywords);

            // Generate suggestions (now async with AI support)
            const suggestions = await suggestionGenerator.generateSuggestions(resumeText, jobKeywords, jobDescription, score);

            // Clean up uploaded file
            fs.unlinkSync(tempFilePath);

            // Return results
            res.json({
                success: true,
                score: score,
                suggestions: suggestions,
                keywordMatch: {
                    found: score.keywordMatches,
                    total: jobKeywords.all.length,
                    percentage: score.overallScore
                }
            });

        } catch (error) {
            // Clean up file if it exists
            if (fs.existsSync(tempFilePath)) {
                fs.unlinkSync(tempFilePath);
            }
            throw error;
        }

    } catch (error) {
        console.error('Analysis error:', error);
        res.status(500).json({ 
            error: 'Analysis failed', 
            message: error.message || 'An error occurred during analysis' 
        });
    }
});

// Get job status endpoint
app.get('/api/job/:jobId', async (req, res) => {
    try {
        const { jobId } = req.params;
        
        // Validate UUID format
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        if (!uuidRegex.test(jobId)) {
            return res.status(400).json({ error: 'Invalid job ID format' });
        }

        let job;
        try {
            job = await db.getJob(jobId);
        } catch (dbError) {
            console.error('Database error in getJob:', dbError);
            return res.status(500).json({ 
                error: 'Database error', 
                message: 'Failed to retrieve job from database' 
            });
        }
        
        if (!job) {
            return res.status(404).json({ error: 'Job not found' });
        }

        res.json({
            jobId: job.job_id,
            status: job.status,
            createdAt: job.created_at,
            updatedAt: job.updated_at,
            errorMessage: job.error_message
        });
    } catch (error) {
        console.error('Get job error:', error);
        res.status(500).json({ 
            error: 'Failed to get job status', 
            message: error.message || 'An unexpected error occurred' 
        });
    }
});

// Get job results endpoint
app.get('/api/job/:jobId/results', async (req, res) => {
    try {
        const { jobId } = req.params;
        
        // Validate UUID format
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        if (!uuidRegex.test(jobId)) {
            return res.status(400).json({ error: 'Invalid job ID format' });
        }

        let results;
        try {
            results = await db.getResults(jobId);
        } catch (dbError) {
            console.error('Database error in getResults:', dbError);
            return res.status(500).json({ 
                error: 'Database error', 
                message: 'Failed to retrieve results from database' 
            });
        }
        
        if (!results) {
            return res.status(404).json({ error: 'Results not found. Job may still be processing.' });
        }

        // Parse JSONB fields if they're strings
        let score = results.score;
        let suggestions = results.suggestions;
        let keywordMatches = results.keywordMatches;
        
        if (typeof score === 'string') {
            try {
                score = JSON.parse(score);
            } catch (e) {
                console.error('Failed to parse score JSON:', e);
            }
        }
        if (typeof suggestions === 'string') {
            try {
                suggestions = JSON.parse(suggestions);
            } catch (e) {
                console.error('Failed to parse suggestions JSON:', e);
            }
        }
        if (typeof keywordMatches === 'string') {
            try {
                keywordMatches = JSON.parse(keywordMatches);
            } catch (e) {
                console.error('Failed to parse keywordMatches JSON:', e);
            }
        }
        
        res.json({
            success: true,
            jobId: results.jobId,
            status: results.status,
            score: score,
            suggestions: suggestions,
            keywordMatch: keywordMatches, // Use keywordMatch (singular) for frontend compatibility
            completedAt: results.completedAt,
            createdAt: results.createdAt
        });
    } catch (error) {
        console.error('Get results error:', error);
        res.status(500).json({ 
            error: 'Failed to get results', 
            message: error.message || 'An unexpected error occurred' 
        });
    }
});

// Health check endpoint
app.get('/api/health', (req, res) => {
    res.json({ 
        status: 'ok',
        hasOpenAIKey: !!process.env.OPENAI_API_KEY,
        openAIKeyLength: process.env.OPENAI_API_KEY ? process.env.OPENAI_API_KEY.length : 0
    });
});

// Test OpenAI connection endpoint
app.get('/api/test-ai', async (req, res) => {
    try {
        const OpenAI = require('openai');
        if (!process.env.OPENAI_API_KEY) {
            return res.json({ error: 'No OPENAI_API_KEY found in environment' });
        }
        
        const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
        const completion = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [{ role: "user", content: "Say 'AI is working' if you can read this." }],
            max_tokens: 10
        });
        
        res.json({ 
            success: true, 
            message: completion.choices[0].message.content,
            model: completion.model
        });
    } catch (error) {
        res.json({ 
            error: 'OpenAI API test failed', 
            message: error.message,
            code: error.code,
            status: error.status
        });
    }
});

// Endpoint for worker to notify server of job completion (triggers Socket.IO emission)
app.post('/api/job/:jobId/notify-complete', async (req, res) => {
    try {
        const { jobId } = req.params;
        const { results } = req.body;
        
        console.log(`Server: Received completion notification for job ${jobId}`);
        console.log(`Server: Results data:`, JSON.stringify(results).substring(0, 200));
        
        // Validate UUID format
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        if (!uuidRegex.test(jobId)) {
            console.error(`Server: Invalid job ID format: ${jobId}`);
            return res.status(400).json({ error: 'Invalid job ID format' });
        }
        
        // Emit completion event via Socket.IO
        console.log(`Server: Emitting job:complete to room job:${jobId}`);
        emitJobComplete(jobId, results || {});
        console.log(`Server: Socket.IO emission completed for job ${jobId}`);
        
        res.json({ success: true, message: 'Notification sent' });
    } catch (error) {
        console.error('Server: Notify complete error:', error);
        console.error('Server: Error stack:', error.stack);
        res.status(500).json({ 
            error: 'Failed to notify', 
            message: error.message 
        });
    }
});

// WebSocket connection handling
io.on('connection', (socket) => {
    console.log('WebSocket: Client connected:', socket.id);

    // Client joins a room for a specific job
    socket.on('join:job', (jobId) => {
        if (jobId) {
            socket.join(`job:${jobId}`);
            console.log(`WebSocket: Client ${socket.id} joined room job:${jobId}`);
            socket.emit('joined', { jobId, room: `job:${jobId}` });
        }
    });

    // Client leaves a job room
    socket.on('leave:job', (jobId) => {
        if (jobId) {
            socket.leave(`job:${jobId}`);
            console.log(`WebSocket: Client ${socket.id} left room job:${jobId}`);
        }
    });

    socket.on('disconnect', () => {
        console.log('WebSocket: Client disconnected:', socket.id);
    });
});

// Helper function to emit job status updates
function emitJobStatus(jobId, status, data = {}) {
    io.to(`job:${jobId}`).emit('job:status', {
        jobId,
        status,
        ...data,
        timestamp: new Date().toISOString()
    });
}

// Helper function to emit job completion
function emitJobComplete(jobId, results) {
    const room = `job:${jobId}`;
    const eventData = {
        jobId,
        results,
        timestamp: new Date().toISOString()
    };
    
    console.log(`Server: Emitting to room ${room}`);
    console.log(`Server: Event data:`, JSON.stringify(eventData).substring(0, 300));
    
    // Get the number of clients in the room
    const roomClients = io.sockets.adapter.rooms.get(room);
    const clientCount = roomClients ? roomClients.size : 0;
    console.log(`Server: Room ${room} has ${clientCount} client(s)`);
    
    io.to(room).emit('job:complete', eventData);
    console.log(`Server: Emitted job:complete event to room ${room}`);
}

// Background job processor (fallback if worker isn't running)
// Check for pending jobs every 1 second and process them if worker isn't available
let backgroundProcessorInterval = null;
let isProcessing = false; // Prevent concurrent processing

// Track which jobs are currently being processed to avoid duplicates
const processingJobs = new Set();

async function processPendingJobs() {
    // Prevent concurrent execution
    if (isProcessing) {
        return;
    }
    
    try {
        isProcessing = true;
        
        // Get pending jobs older than 0.5 seconds (process very quickly)
        const pendingJobs = await db.query(`
            SELECT * FROM jobs 
            WHERE status = 'pending' 
            AND created_at < NOW() - INTERVAL '0.5 seconds'
            ORDER BY created_at ASC
            LIMIT 1
        `);
        
        // Also check for jobs stuck in processing for more than 2 minutes
        const stuckJobs = await db.query(`
            SELECT * FROM jobs 
            WHERE status = 'processing' 
            AND updated_at < NOW() - INTERVAL '2 minutes'
            ORDER BY updated_at ASC
            LIMIT 1
        `);
        
        const jobsToProcess = [...pendingJobs.rows, ...stuckJobs.rows];
        
        if (jobsToProcess.length > 0) {
            const job = jobsToProcess[0];
            const age = (Date.now() - new Date(job.created_at).getTime()) / 1000;
            
            console.log(`Background processor: Found job ${job.job_id.substring(0, 8)}... (age: ${Math.round(age)}s, status: ${job.status})`);
            console.log(`Background processor: Starting to process job ${job.job_id} (worker may not be running)`);
            
            // Prevent processing the same job multiple times
            // Check if job is already being processed by another instance
            const currentStatus = await db.getJob(job.job_id);
            if (currentStatus) {
                if (currentStatus.status === 'completed' || currentStatus.status === 'failed') {
                    console.log(`Background processor: Job ${job.job_id} already ${currentStatus.status}, skipping`);
                    isProcessing = false;
                    return;
                }
                // If status is 'processing', check if it's been stuck for more than 30 seconds
                if (currentStatus.status === 'processing') {
                    const processingAge = (Date.now() - new Date(currentStatus.updated_at).getTime()) / 1000;
                    if (processingAge < 30) {
                        console.log(`Background processor: Job ${job.job_id} is being processed (${Math.round(processingAge)}s ago), skipping`);
                        isProcessing = false;
                        return;
                    }
                    console.log(`Background processor: Job ${job.job_id} stuck in processing for ${Math.round(processingAge)}s, retrying`);
                }
            }
            
            try {
                // Update status to processing
                await db.updateJobStatus(job.job_id, 'processing');
                emitJobStatus(job.job_id, 'processing', { message: 'Processing resume...' });
                
                // Download from S3
                const tempDir = path.join(uploadsDir, 'temp');
                if (!fs.existsSync(tempDir)) {
                    fs.mkdirSync(tempDir, { recursive: true });
                }
                const tempFilePath = path.join(tempDir, `${job.job_id}-${job.original_filename}`);
                await s3Storage.downloadFile(job.s3_file_key, tempFilePath);
                
                emitJobStatus(job.job_id, 'processing', { message: 'Parsing resume...' });
                
                // Parse resume
                const resumeText = await resumeParser.parseResume(tempFilePath, job.original_filename);
                
                emitJobStatus(job.job_id, 'processing', { message: 'Analyzing job description...' });
                
                // Analyze job description
                let jobDescription = '';
                if (job.job_posting_type === 'url' && job.job_url) {
                    jobDescription = await jobAnalyzer.extractFromUrl(job.job_url);
                } else if (job.job_posting_type === 'paste' && job.job_paste) {
                    jobDescription = job.job_paste;
                }
                
                if (!jobDescription || jobDescription.trim().length === 0) {
                    throw new Error('Could not extract job description');
                }
                
                emitJobStatus(job.job_id, 'processing', { message: 'Calculating ATS score...' });
                
                // Extract keywords
                const jobKeywords = jobAnalyzer.extractKeywords(jobDescription);
                
                // Score resume
                const score = atsScorer.calculateScore(resumeText, jobKeywords);
                
                emitJobStatus(job.job_id, 'processing', { message: 'Generating suggestions...' });
                
                // Generate suggestions
                const suggestions = await suggestionGenerator.generateSuggestions(resumeText, jobKeywords, jobDescription, score);
                
                // Save results
                await db.saveResults(job.job_id, {
                    score,
                    suggestions,
                    keywordMatches: {
                        found: score.keywordMatches,
                        total: jobKeywords.all.length,
                        percentage: score.overallScore
                    }
                });
                
                // Clean up
                if (fs.existsSync(tempFilePath)) {
                    fs.unlinkSync(tempFilePath);
                }
                
                // Emit completion (format matches what frontend expects)
                emitJobComplete(job.job_id, {
                    results: {
                        success: true,
                        score,
                        suggestions,
                        keywordMatch: {
                            found: score.keywordMatches,
                            total: jobKeywords.all.length,
                            percentage: score.overallScore
                        }
                    }
                });
                
                console.log(`Background processor: Job ${job.job_id} completed successfully`);
                processingJobs.delete(job.job_id);
                // Note: saveResults already updates status to 'completed'
            } catch (error) {
                console.error(`Background processor: Job ${job.job_id} failed:`, error);
                console.error(`Background processor: Error stack:`, error.stack);
                await db.updateJobStatus(job.job_id, 'failed', error.message);
                emitJobStatus(job.job_id, 'failed', { error: error.message });
                processingJobs.delete(job.job_id);
            }
        } else {
            // No jobs to process - log occasionally for debugging
            // Log every 10th check (every ~10 seconds)
            const logCount = Math.floor(Date.now() / 10000) % 10;
            if (logCount === 0) {
                console.log('Background processor: No pending jobs to process');
            }
        }
    } catch (error) {
        console.error('Background processor error:', error);
        console.error('Error stack:', error.stack);
    } finally {
        isProcessing = false;
    }
}

// Start background processor to handle stuck jobs (runs regardless of worker status)
console.log('Background processor: Starting (will process stuck jobs)');
console.log('Background processor: Will check for jobs every 0.5 seconds');
// Process immediately on startup, then check every 0.5 seconds
setTimeout(() => {
    console.log('Background processor: Running initial check...');
    processPendingJobs();
}, 500); // Wait 0.5 seconds then process
backgroundProcessorInterval = setInterval(() => {
    processPendingJobs();
}, 500); // Check every 0.5 seconds for faster processing

// Export io for use in worker
module.exports.io = io;
module.exports.emitJobStatus = emitJobStatus;
module.exports.emitJobComplete = emitJobComplete;

server.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
    console.log(`WebSocket server ready for connections`);
    if (!queue.queue) {
        console.log('⚠️  Worker not running - using background processor');
    }
});

