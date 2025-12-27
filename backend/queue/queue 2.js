const Queue = require('bull');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

// Redis connection configuration
const redisConfig = {
    host: process.env.REDIS_HOST || 'localhost',
    port: process.env.REDIS_PORT || 6379,
    password: process.env.REDIS_PASSWORD || undefined,
};

// Use REDIS_URL if provided, otherwise use host/port
const redisUrl = process.env.REDIS_URL || `redis://${redisConfig.host}:${redisConfig.port}`;

// Create Bull queue for resume analysis jobs
const resumeAnalysisQueue = new Queue('resume-analysis', {
    redis: redisUrl,
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

// Queue event handlers
resumeAnalysisQueue.on('error', (error) => {
    console.error('Queue: Error:', error);
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

/**
 * Add a job to the queue
 * @param {Object} jobData - Job data
 * @returns {Promise<Job>} Bull job instance
 */
async function addJob(jobData) {
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
    await resumeAnalysisQueue.close();
}

module.exports = {
    queue: resumeAnalysisQueue,
    addJob,
    getJob,
    getJobStatus,
    cleanJobs,
    close,
};

