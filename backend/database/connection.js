const { Pool } = require('pg');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });

// Create PostgreSQL connection pool
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
    max: 20, // Maximum number of clients in the pool
    idleTimeoutMillis: 30000, // Close idle clients after 30 seconds
    connectionTimeoutMillis: 2000, // Return an error after 2 seconds if connection could not be established
});

// Test connection on startup
pool.on('connect', () => {
    console.log('Database: Connected to PostgreSQL');
});

pool.on('error', (err) => {
    console.error('Database: Unexpected error on idle client', err);
    process.exit(-1);
});

/**
 * Execute a query
 * @param {string} text - SQL query text
 * @param {Array} params - Query parameters
 * @returns {Promise} Query result
 */
async function query(text, params) {
    const start = Date.now();
    try {
        const res = await pool.query(text, params);
        const duration = Date.now() - start;
        console.log('Database: Executed query', { text, duration, rows: res.rowCount });
        return res;
    } catch (error) {
        console.error('Database: Query error', { text, error: error.message });
        throw error;
    }
}

/**
 * Get a client from the pool for transactions
 * @returns {Promise<Client>} Database client
 */
async function getClient() {
    return await pool.connect();
}

/**
 * Create a new job record
 * @param {Object} jobData - Job data
 * @returns {Promise<Object>} Created job record
 */
async function createJob(jobData) {
    const {
        userSession,
        s3FileUrl,
        s3FileKey,
        originalFilename,
        jobPostingType,
        jobUrl,
        jobPaste
    } = jobData;

    const queryText = `
        INSERT INTO jobs (
            user_session, s3_file_url, s3_file_key, original_filename,
            job_posting_type, job_url, job_paste, status
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending')
        RETURNING *
    `;

    const values = [
        userSession || null,
        s3FileUrl,
        s3FileKey,
        originalFilename,
        jobPostingType,
        jobUrl || null,
        jobPaste || null
    ];

    const result = await query(queryText, values);
    return result.rows[0];
}

/**
 * Get job by ID
 * @param {string} jobId - Job UUID
 * @returns {Promise<Object|null>} Job record or null
 */
async function getJob(jobId) {
    const queryText = 'SELECT * FROM jobs WHERE job_id = $1';
    const result = await query(queryText, [jobId]);
    return result.rows[0] || null;
}

/**
 * Update job status
 * @param {string} jobId - Job UUID
 * @param {string} status - New status
 * @param {string} errorMessage - Optional error message
 * @returns {Promise<Object>} Updated job record
 */
async function updateJobStatus(jobId, status, errorMessage = null) {
    const queryText = `
        UPDATE jobs
        SET status = $1, error_message = $2
        WHERE job_id = $3
        RETURNING *
    `;
    const result = await query(queryText, [status, errorMessage, jobId]);
    return result.rows[0];
}

/**
 * Save analysis results
 * @param {string} jobId - Job UUID
 * @param {Object} results - Analysis results
 * @returns {Promise<Object>} Created result record
 */
async function saveResults(jobId, results) {
    const { score, suggestions, keywordMatches } = results;

    const queryText = `
        INSERT INTO analysis_results (job_id, score, suggestions, keyword_matches)
        VALUES ($1, $2, $3, $4)
        RETURNING *
    `;

    const values = [
        jobId,
        JSON.stringify(score),
        JSON.stringify(suggestions),
        JSON.stringify(keywordMatches)
    ];

    const result = await query(queryText, values);
    
    // Update job status to completed
    await updateJobStatus(jobId, 'completed');
    
    return result.rows[0];
}

/**
 * Get analysis results by job ID
 * @param {string} jobId - Job UUID
 * @returns {Promise<Object|null>} Results record or null
 */
async function getResults(jobId) {
    const queryText = `
        SELECT ar.*, j.*
        FROM analysis_results ar
        JOIN jobs j ON ar.job_id = j.job_id
        WHERE ar.job_id = $1
    `;
    const result = await query(queryText, [jobId]);
    
    if (result.rows.length === 0) {
        return null;
    }

    const row = result.rows[0];
    return {
        jobId: row.job_id,
        status: row.status,
        score: row.score,
        suggestions: row.suggestions,
        keywordMatches: row.keyword_matches,
        completedAt: row.completed_at,
        createdAt: row.created_at
    };
}

/**
 * Close the connection pool
 */
async function close() {
    await pool.end();
}

module.exports = {
    query,
    getClient,
    createJob,
    getJob,
    updateJobStatus,
    saveResults,
    getResults,
    close,
    pool
};

