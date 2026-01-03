#!/usr/bin/env node

/**
 * Setup Verification Script
 * Checks if all required services and configurations are set up
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const colors = {
    green: '\x1b[32m',
    red: '\x1b[31m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    reset: '\x1b[0m',
    bold: '\x1b[1m'
};

function checkmark(condition) {
    return condition ? `${colors.green}✅${colors.reset}` : `${colors.red}❌${colors.reset}`;
}

function warning(condition) {
    return condition ? `${colors.yellow}⚠️${colors.reset}` : `${colors.green}✅${colors.reset}`;
}

function checkCommand(command) {
    try {
        execSync(command, { stdio: 'ignore' });
        return true;
    } catch {
        return false;
    }
}

function checkEnvFile() {
    const envPath = path.join(__dirname, '..', '.env');
    if (!fs.existsSync(envPath)) {
        return { exists: false, vars: {} };
    }

    const envContent = fs.readFileSync(envPath, 'utf-8');
    const vars = {};
    envContent.split('\n').forEach(line => {
        const match = line.match(/^([^#=]+)=(.+)$/);
        if (match) {
            const key = match[1].trim();
            const value = match[2].trim();
            vars[key] = value;
        }
    });

    return { exists: true, vars };
}

async function verifySetup() {
    console.log(`${colors.bold}${colors.blue}🔍 MatchaCV Setup Verification${colors.reset}\n`);

    const env = checkEnvFile();
    let allGood = true;
    let warnings = [];

    // Check .env file exists
    console.log(`${colors.bold}1. Environment File${colors.reset}`);
    console.log(`   ${checkmark(env.exists)} .env file ${env.exists ? 'exists' : 'missing'}`);
    if (!env.exists) {
        console.log(`   ${colors.red}   Create a .env file in the project root${colors.reset}`);
        allGood = false;
    }
    console.log('');

    // Check AWS S3 Configuration
    console.log(`${colors.bold}2. AWS S3 Configuration${colors.reset}`);
    const awsAccessKey = env.vars.AWS_ACCESS_KEY_ID;
    const awsSecretKey = env.vars.AWS_SECRET_ACCESS_KEY;
    const awsBucket = env.vars.AWS_S3_BUCKET;
    const awsRegion = env.vars.AWS_REGION || 'us-east-1';

    console.log(`   ${checkmark(!!awsAccessKey)} AWS_ACCESS_KEY_ID ${awsAccessKey ? `(${awsAccessKey.substring(0, 8)}...)` : 'missing'}`);
    console.log(`   ${checkmark(!!awsSecretKey)} AWS_SECRET_ACCESS_KEY ${awsSecretKey ? '(set)' : 'missing'}`);
    console.log(`   ${checkmark(!!awsBucket)} AWS_S3_BUCKET ${awsBucket || 'missing'}`);
    console.log(`   ${checkmark(!!awsRegion)} AWS_REGION ${awsRegion || 'missing'}`);

    if (!awsAccessKey || !awsSecretKey || !awsBucket) {
        console.log(`   ${colors.yellow}   Run: npm run setup-redis (or configure manually)${colors.reset}`);
        allGood = false;
    }
    console.log('');

    // Check Database Configuration
    console.log(`${colors.bold}3. PostgreSQL Database${colors.reset}`);
    const dbUrl = env.vars.DATABASE_URL;
    const hasPostgres = checkCommand('which psql');

    console.log(`   ${checkmark(hasPostgres)} PostgreSQL installed`);
    console.log(`   ${checkmark(!!dbUrl)} DATABASE_URL ${dbUrl ? '(configured)' : 'missing'}`);

    if (dbUrl) {
        try {
            // Try to parse the connection string
            const url = new URL(dbUrl);
            console.log(`   ${colors.blue}   Database: ${url.pathname.substring(1)}${colors.reset}`);
        } catch (e) {
            console.log(`   ${colors.yellow}   Warning: DATABASE_URL format may be invalid${colors.reset}`);
        }
    }

    if (!hasPostgres) {
        console.log(`   ${colors.yellow}   Install: brew install postgresql@14${colors.reset}`);
        warnings.push('PostgreSQL not installed');
    }
    if (!dbUrl) {
        console.log(`   ${colors.yellow}   Run: npm run setup-db${colors.reset}`);
        allGood = false;
    }
    console.log('');

    // Check Redis Configuration
    console.log(`${colors.bold}4. Redis${colors.reset}`);
    const redisUrl = env.vars.REDIS_URL;
    const redisHost = env.vars.REDIS_HOST;
    const redisPort = env.vars.REDIS_PORT;
    const hasRedis = checkCommand('which redis-server');
    const redisRunning = checkCommand('redis-cli ping');

    console.log(`   ${checkmark(hasRedis)} Redis installed`);
    console.log(`   ${checkmark(redisRunning)} Redis server running`);
    console.log(`   ${checkmark(!!redisUrl || !!redisHost)} Redis configuration ${redisUrl || redisHost ? '(configured)' : 'missing'}`);

    if (!hasRedis) {
        console.log(`   ${colors.yellow}   Install: brew install redis${colors.reset}`);
        warnings.push('Redis not installed');
    }
    if (!redisRunning && hasRedis) {
        console.log(`   ${colors.yellow}   Start: brew services start redis${colors.reset}`);
        warnings.push('Redis not running');
    }
    if (!redisUrl && !redisHost) {
        console.log(`   ${colors.yellow}   Run: npm run setup-redis${colors.reset}`);
        allGood = false;
    }
    console.log('');

    // Check OpenAI (optional but recommended)
    console.log(`${colors.bold}5. OpenAI API (Optional)${colors.reset}`);
    const openaiKey = env.vars.OPENAI_API_KEY;
    console.log(`   ${warning(!!openaiKey)} OPENAI_API_KEY ${openaiKey ? '(configured)' : 'missing (optional)'}`);
    if (!openaiKey) {
        console.log(`   ${colors.yellow}   AI suggestions will use fallback mode${colors.reset}`);
        warnings.push('OpenAI API key not set (optional)');
    }
    console.log('');

    // Check Node Dependencies
    console.log(`${colors.bold}6. Node.js Dependencies${colors.reset}`);
    const nodeModulesExists = fs.existsSync(path.join(__dirname, '..', 'node_modules'));
    console.log(`   ${checkmark(nodeModulesExists)} node_modules ${nodeModulesExists ? 'installed' : 'missing'}`);
    if (!nodeModulesExists) {
        console.log(`   ${colors.yellow}   Run: npm install${colors.reset}`);
        allGood = false;
    }
    console.log('');

    // Summary
    console.log(`${colors.bold}${'='.repeat(60)}${colors.reset}`);
    if (allGood && warnings.length === 0) {
        console.log(`${colors.green}${colors.bold}✅ All required configurations are set!${colors.reset}`);
        console.log(`${colors.green}You're ready to run: npm start${colors.reset}`);
    } else if (allGood && warnings.length > 0) {
        console.log(`${colors.yellow}${colors.bold}⚠️  Setup complete with warnings${colors.reset}`);
        warnings.forEach(w => console.log(`   ${colors.yellow}• ${w}${colors.reset}`));
        console.log(`${colors.green}You can run: npm start${colors.reset}`);
    } else {
        console.log(`${colors.red}${colors.bold}❌ Setup incomplete${colors.reset}`);
        console.log(`${colors.yellow}Please fix the issues above before running the application${colors.reset}`);
    }
    console.log(`${colors.bold}${'='.repeat(60)}${colors.reset}\n`);

    // Quick start commands
    if (!allGood) {
        console.log(`${colors.bold}Quick Setup Commands:${colors.reset}`);
        if (!env.exists) {
            console.log(`   ${colors.blue}1. Create .env file (copy from .env.example if available)${colors.reset}`);
        }
        if (!awsAccessKey || !awsSecretKey || !awsBucket) {
            console.log(`   ${colors.blue}2. Configure AWS S3 credentials in .env${colors.reset}`);
        }
        if (!dbUrl) {
            console.log(`   ${colors.blue}3. Run: ${colors.bold}npm run setup-db${colors.reset}${colors.blue}${colors.reset}`);
        }
        if (!redisUrl && !redisHost) {
            console.log(`   ${colors.blue}4. Run: ${colors.bold}npm run setup-redis${colors.reset}${colors.blue}${colors.reset}`);
        }
        if (!nodeModulesExists) {
            console.log(`   ${colors.blue}5. Run: ${colors.bold}npm install${colors.reset}${colors.blue}${colors.reset}`);
        }
        console.log('');
    }
}

verifySetup().catch(error => {
    console.error('Error:', error);
    process.exit(1);
});

