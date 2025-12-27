const Queue = require('bull');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });

// Redis connection configuration
let redisConfig;
let resumeAnalysisQueue;

try {
    if (process.env.REDIS_URL) {
        // Use REDIS_URL if provided (for cloud services)
        try {
            // Parse URL to ensure it's valid
            const url = new URL(process.env.REDIS_URL);
            redisConfig = {
                host: url.hostname,
                port: parseInt(url.port || '6379', 10),
                password: url.password || undefined,
                db: parseInt((url.pathname || '/0').substring(1) || '0', 10),
                maxRetriesPerRequest: null, // Required for Bull
            };
        } catch (urlError) {
            // If URL parsing fails, try using it as-is (some Redis URLs might not be standard)
            console.warn('Queue: Could not parse REDIS_URL, using as connection string:', urlError.message);
            redisConfig = process.env.REDIS_URL;
        }
    } else {
        // Otherwise use host/port configuration
        const host = process.env.REDIS_HOST || 'localhost';
        const port = parseInt(process.env.REDIS_PORT || '6379', 10);
        const password = process.env.REDIS_PASSWORD || undefined;
        const db = parseInt(process.env.REDIS_DB || '0', 10);
        
        // Validate db is between 0-15
        const validDb = Math.max(0, Math.min(15, db));
        
        redisConfig = {
            host,
            port,
            password,
            db: validDb,
            maxRetriesPerRequest: null, // Required for Bull
            enableReadyCheck: false, // Don't wait for ready check
            lazyConnect: true, // Connect lazily
        };
    }

    // Create Bull queue for resume analysis jobs
    resumeAnalysisQueue = new Queue('resume-analysis', {
        redis: redisConfig,
        defaultJobOptions: {
            attempts: 3,
            backoff: {
                type: 'exponential',
                delay: 2000, // Start with 2 seconds
            },
            removeOnComplete: {
                age: 24 * 3600, // Keep completed jobs for 24 hours
                count: 1000, // Keep max 1000 completed jobs
            },
            removeOnFail: {
                age: 7 * 24 * 3600, // Keep failed jobs for 7 days
            },
        },
    });
    
    console.log('Queue: Bull queue initialized');
    
    // Queue event handlers (only if queue is initialized)
    resumeAnalysisQueue.on('error', (error) => {
        console.error('Queue: Error:', error);
        // Don't crash the app if Redis is unavailable - async processing will just fail gracefully
    });

    // Handle Redis connection events
    resumeAnalysisQueue.on('ready', () => {
        console.log('Queue: Redis connection ready');
    });

    resumeAnalysisQueue.on('close', () => {
        console.log('Queue: Redis connection closed');
    });

    resumeAnalysisQueue.on('waiting', (jobId) => {
        console.log(`Queue: Job ${jobId} is waiting`);
    });

    resumeAnalysisQueue.on('active', (job) => {
        console.log(`Queue: Job ${job.id} is now active`);
    });

    resumeAnalysisQueue.on('stalled', (job) => {
        console.log(`Queue: Job ${job.id} has stalled`);
    });

    resumeAnalysisQueue.on('completed', (job, result) => {
        console.log(`Queue: Job ${job.id} completed successfully`);
    });

    resumeAnalysisQueue.on('failed', (job, err) => {
        console.error(`Queue: Job ${job.id} failed:`, err.message);
    });

    resumeAnalysisQueue.on('paused', () => {
        console.log('Queue: Queue paused');
    });

    resumeAnalysisQueue.on('resumed', () => {
        console.log('Queue: Queue resumed');
    });
    
} catch (error) {
    console.error('Queue: Failed to initialize queue:', error.message);
    console.warn('Queue: Async job processing will be unavailable. Using sync endpoint only.');
    // Create a dummy queue object to prevent crashes
    resumeAnalysisQueue = null;
}

/**
 * Add a job to the queue
 * @param {Object} jobData - Job data
 * @returns {Promise<Job>} Bull job instance
 */
async function addJob(jobData) {
    if (!resumeAnalysisQueue) {
        throw new Error('Queue is not initialized. Redis may not be configured or available.');
    }
    
    try {
        const job = await resumeAnalysisQueue.add(jobData, {
            jobId: jobData.jobId, // Use jobId from database as Bull job ID
            priority: 1, // Default priority
        });
        console.log(`Queue: Job added with ID: ${job.id}`);
        return job;
    } catch (error) {
        console.error('Queue: Error adding job:', error);
        throw new Error(`Failed to add job to queue: ${error.message}`);
    }
}

/**
 * Get job by ID
 * @param {string} jobId - Job ID
 * @returns {Promise<Job|null>} Bull job instance or null
 */
async function getJob(jobId) {
    if (!resumeAnalysisQueue) {
        return null;
    }
    
    try {
        const job = await resumeAnalysisQueue.getJob(jobId);
        return job;
    } catch (error) {
        console.error('Queue: Error getting job:', error);
        return null;
    }
}

/**
 * Get job status
 * @param {string} jobId - Job ID
 * @returns {Promise<Object>} Job state and progress
 */
async function getJobStatus(jobId) {
    if (!resumeAnalysisQueue) {
        return null;
    }
    
    try {
        const job = await resumeAnalysisQueue.getJob(jobId);
        if (!job) {
            return null;
        }

        const state = await job.getState();
        const progress = job.progress();
        const returnvalue = job.returnvalue;
        const failedReason = job.failedReason;

        return {
            id: job.id,
            state,
            progress,
            returnvalue,
            failedReason,
            timestamp: job.timestamp,
            processedOn: job.processedOn,
            finishedOn: job.finishedOn,
        };
    } catch (error) {
        console.error('Queue: Error getting job status:', error);
        return null;
    }
}

/**
 * Clean up old jobs
 * @returns {Promise<void>}
 */
async function cleanJobs() {
    if (!resumeAnalysisQueue) {
        return;
    }
    
    try {
        await resumeAnalysisQueue.clean(24 * 3600 * 1000, 'completed', 100);
        await resumeAnalysisQueue.clean(7 * 24 * 3600 * 1000, 'failed', 100);
        console.log('Queue: Cleaned old jobs');
    } catch (error) {
        console.error('Queue: Error cleaning jobs:', error);
    }
}

/**
 * Close the queue connection
 * @returns {Promise<void>}
 */
async function close() {
    if (resumeAnalysisQueue) {
        await resumeAnalysisQueue.close();
    }
}

module.exports = {
    queue: resumeAnalysisQueue,
    addJob,
    getJob,
    getJobStatus,
    cleanJobs,
    close,
};

