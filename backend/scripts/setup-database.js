#!/usr/bin/env node

/**
 * Database Setup Script
 * Automates the creation of the MatchaCV PostgreSQL database
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const readline = require('readline');

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

function question(query) {
    return new Promise(resolve => rl.question(query, resolve));
}

function execCommand(command, options = {}) {
    try {
        console.log(`\n> ${command}`);
        const output = execSync(command, { 
            encoding: 'utf-8',
            stdio: 'inherit',
            ...options 
        });
        return output;
    } catch (error) {
        console.error(`\n❌ Error executing: ${command}`);
        console.error(error.message);
        throw error;
    }
}

async function setupDatabase() {
    console.log('🚀 MatchaCV Database Setup\n');
    console.log('This script will:');
    console.log('  1. Create a PostgreSQL database named "matchacv"');
    console.log('  2. Create tables and indexes');
    console.log('  3. Set up triggers and functions');
    console.log('  4. Generate DATABASE_URL for your .env file\n');

    // Check if PostgreSQL is installed
    try {
        execSync('which psql', { stdio: 'ignore' });
    } catch (error) {
        console.error('❌ PostgreSQL is not installed or not in PATH');
        console.error('   Please install PostgreSQL first:');
        console.error('   brew install postgresql@14');
        process.exit(1);
    }

    // Get database credentials
    const dbName = await question('Database name (default: matchacv): ') || 'matchacv';
    const dbUser = await question('PostgreSQL username (default: your system username): ') || process.env.USER;
    const dbPassword = await question('PostgreSQL password (press Enter if no password): ') || '';

    console.log('\n📝 Setting up database...\n');

    try {
        // Create database
        console.log('1️⃣  Creating database...');
        try {
            if (dbPassword) {
                process.env.PGPASSWORD = dbPassword;
                execCommand(`psql -U ${dbUser} -d postgres -c "CREATE DATABASE ${dbName};"`, { stdio: 'pipe' });
            } else {
                execCommand(`psql -U ${dbUser} -d postgres -c "CREATE DATABASE ${dbName};"`, { stdio: 'pipe' });
            }
            console.log('   ✅ Database created');
        } catch (error) {
            if (error.message.includes('already exists')) {
                console.log('   ⚠️  Database already exists, continuing...');
            } else {
                throw error;
            }
        }

        // Run schema
        console.log('\n2️⃣  Running schema...');
        const schemaPath = path.join(__dirname, '..', 'database', 'schema.sql');
        
        if (!fs.existsSync(schemaPath)) {
            throw new Error(`Schema file not found: ${schemaPath}`);
        }

        if (dbPassword) {
            process.env.PGPASSWORD = dbPassword;
            execCommand(`psql -U ${dbUser} -d ${dbName} -f "${schemaPath}"`, { stdio: 'pipe' });
        } else {
            execCommand(`psql -U ${dbUser} -d ${dbName} -f "${schemaPath}"`, { stdio: 'pipe' });
        }
        console.log('   ✅ Schema applied');

        // Test connection
        console.log('\n3️⃣  Testing connection...');
        if (dbPassword) {
            process.env.PGPASSWORD = dbPassword;
            execCommand(`psql -U ${dbUser} -d ${dbName} -c "SELECT COUNT(*) FROM jobs;"`, { stdio: 'pipe' });
        } else {
            execCommand(`psql -U ${dbUser} -d ${dbName} -c "SELECT COUNT(*) FROM jobs;"`, { stdio: 'pipe' });
        }
        console.log('   ✅ Connection successful');

        // Generate DATABASE_URL
        console.log('\n4️⃣  Generating DATABASE_URL...');
        let databaseUrl;
        if (dbPassword) {
            databaseUrl = `postgresql://${dbUser}:${dbPassword}@localhost:5432/${dbName}`;
        } else {
            databaseUrl = `postgresql://${dbUser}@localhost:5432/${dbName}`;
        }

        console.log('\n✅ Database setup complete!\n');
        console.log('📋 Add this to your .env file:');
        console.log('─'.repeat(60));
        console.log(`DATABASE_URL=${databaseUrl}`);
        console.log('─'.repeat(60));
        console.log('\n💡 Tip: Make sure your .env file is in the project root directory');

    } catch (error) {
        console.error('\n❌ Setup failed:', error.message);
        console.error('\nTroubleshooting:');
        console.error('  - Make sure PostgreSQL is running: brew services start postgresql@14');
        console.error('  - Check your username and password');
        console.error('  - Try running: psql -U your_username -d postgres');
        process.exit(1);
    } finally {
        rl.close();
    }
}

// Run setup
setupDatabase().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
});

