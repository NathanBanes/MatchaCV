const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const db = require('./database/connection');
const queue = require('./queue/queue');

async function testSystem() {
    console.log('🔍 Testing System Components...\n');
    
    // Test 1: Database connection
    console.log('1. Testing Database Connection...');
    try {
        const result = await db.query('SELECT NOW() as current_time');
        console.log('   ✅ Database connected:', result.rows[0].current_time);
    } catch (error) {
        console.log('   ❌ Database error:', error.message);
        return;
    }
    
    // Test 2: Check pending jobs
    console.log('\n2. Checking Pending Jobs...');
    try {
        const pendingJobs = await db.query(`
            SELECT job_id, status, created_at, 
                   EXTRACT(EPOCH FROM (NOW() - created_at)) as age_seconds,
                   error_message
            FROM jobs 
            WHERE status = 'pending'
            ORDER BY created_at DESC
            LIMIT 5
        `);
        
        if (pendingJobs.rows.length === 0) {
            console.log('   ℹ️  No pending jobs found');
        } else {
            console.log(`   ⚠️  Found ${pendingJobs.rows.length} pending job(s):`);
            pendingJobs.rows.forEach(job => {
                console.log(`      - ${job.job_id.substring(0, 8)}... Status: ${job.status}, Age: ${Math.round(job.age_seconds)}s`);
                if (job.error_message) {
                    console.log(`        Error: ${job.error_message.substring(0, 100)}`);
                }
            });
        }
    } catch (error) {
        console.log('   ❌ Error checking jobs:', error.message);
    }
    
    // Test 3: Check all recent jobs
    console.log('\n3. Checking All Recent Jobs...');
    try {
        const allJobs = await db.query(`
            SELECT job_id, status, created_at, 
                   EXTRACT(EPOCH FROM (NOW() - created_at)) as age_seconds,
                   error_message
            FROM jobs 
            ORDER BY created_at DESC
            LIMIT 5
        `);
        
        if (allJobs.rows.length === 0) {
            console.log('   ℹ️  No jobs found in database');
        } else {
            console.log(`   Found ${allJobs.rows.length} recent job(s):`);
            allJobs.rows.forEach(job => {
                console.log(`      - ${job.job_id.substring(0, 8)}... Status: ${job.status}, Age: ${Math.round(job.age_seconds)}s`);
            });
        }
    } catch (error) {
        console.log('   ❌ Error checking jobs:', error.message);
    }
    
    // Test 4: Check queue status
    console.log('\n4. Checking Queue Status...');
    if (queue.queue) {
        try {
            const counts = await queue.queue.getJobCounts();
            console.log('   ✅ Queue initialized');
            console.log(`      Waiting: ${counts.waiting}`);
            console.log(`      Active: ${counts.active}`);
            console.log(`      Completed: ${counts.completed}`);
            console.log(`      Failed: ${counts.failed}`);
        } catch (error) {
            console.log('   ❌ Queue error:', error.message);
        }
    } else {
        console.log('   ⚠️  Queue not initialized (Redis may not be available)');
    }
    
    // Test 5: Check for jobs that should be processed
    console.log('\n5. Checking Jobs That Should Be Processed...');
    try {
        const jobsToProcess = await db.query(`
            SELECT * FROM jobs 
            WHERE status = 'pending' 
            AND created_at < NOW() - INTERVAL '1 second'
            ORDER BY created_at ASC
            LIMIT 3
        `);
        
        if (jobsToProcess.rows.length === 0) {
            console.log('   ℹ️  No jobs ready for processing');
        } else {
            console.log(`   ⚠️  Found ${jobsToProcess.rows.length} job(s) that should be processed:`);
            jobsToProcess.rows.forEach(job => {
                const age = (Date.now() - new Date(job.created_at).getTime()) / 1000;
                console.log(`      - ${job.job_id.substring(0, 8)}... Age: ${Math.round(age)}s`);
            });
        }
    } catch (error) {
        console.log('   ❌ Error:', error.message);
    }
    
    // Test 6: Check stuck processing jobs
    console.log('\n6. Checking Stuck Processing Jobs...');
    try {
        const stuckJobs = await db.query(`
            SELECT * FROM jobs 
            WHERE status = 'processing' 
            AND updated_at < NOW() - INTERVAL '2 minutes'
            ORDER BY updated_at ASC
            LIMIT 3
        `);
        
        if (stuckJobs.rows.length === 0) {
            console.log('   ℹ️  No stuck jobs found');
        } else {
            console.log(`   ⚠️  Found ${stuckJobs.rows.length} stuck job(s):`);
            stuckJobs.rows.forEach(job => {
                const age = (Date.now() - new Date(job.updated_at).getTime()) / 1000;
                console.log(`      - ${job.job_id.substring(0, 8)}... Stuck for: ${Math.round(age)}s`);
            });
        }
    } catch (error) {
        console.log('   ❌ Error:', error.message);
    }
    
    // Test 7: Check results
    console.log('\n7. Checking Completed Jobs with Results...');
    try {
        const completedJobs = await db.query(`
            SELECT j.job_id, j.status, r.score
            FROM jobs j
            LEFT JOIN analysis_results r ON j.job_id = r.job_id
            WHERE j.status = 'completed'
            ORDER BY j.created_at DESC
            LIMIT 3
        `);
        
        if (completedJobs.rows.length === 0) {
            console.log('   ℹ️  No completed jobs found');
        } else {
            console.log(`   ✅ Found ${completedJobs.rows.length} completed job(s)`);
        }
    } catch (error) {
        console.log('   ❌ Error:', error.message);
    }
    
    console.log('\n✅ System check complete!\n');
    process.exit(0);
}

testSystem().catch(error => {
    console.error('❌ Test failed:', error);
    process.exit(1);
});

