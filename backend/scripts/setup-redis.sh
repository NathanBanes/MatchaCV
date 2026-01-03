#!/bin/bash

# Redis Setup Script for MatchaCV
# This script helps set up Redis for local development

echo "🔴 Redis Setup for MatchaCV"
echo ""

# Check if Redis is installed
if command -v redis-server &> /dev/null; then
    echo "✅ Redis is already installed"
    redis-server --version
else
    echo "❌ Redis is not installed"
    echo ""
    echo "Installing Redis via Homebrew..."
    
    if command -v brew &> /dev/null; then
        brew install redis
        echo "✅ Redis installed successfully"
    else
        echo "❌ Homebrew is not installed"
        echo "Please install Homebrew first: https://brew.sh"
        exit 1
    fi
fi

echo ""
echo "📋 Starting Redis server..."

# Check if Redis is already running
if pgrep -x "redis-server" > /dev/null; then
    echo "✅ Redis server is already running"
else
    echo "Starting Redis server..."
    brew services start redis
    
    # Wait a moment for Redis to start
    sleep 2
    
    if pgrep -x "redis-server" > /dev/null; then
        echo "✅ Redis server started successfully"
    else
        echo "⚠️  Redis server may not have started. Try running: brew services start redis"
    fi
fi

echo ""
echo "🧪 Testing Redis connection..."
if redis-cli ping > /dev/null 2>&1; then
    echo "✅ Redis is responding to commands"
    echo ""
    echo "📋 Add this to your .env file:"
    echo "────────────────────────────────────────────────────────────"
    echo "REDIS_URL=redis://localhost:6379"
    echo "────────────────────────────────────────────────────────────"
    echo ""
    echo "Or alternatively:"
    echo "REDIS_HOST=localhost"
    echo "REDIS_PORT=6379"
    echo ""
    echo "✅ Redis setup complete!"
else
    echo "❌ Redis is not responding"
    echo "Try running: brew services restart redis"
    exit 1
fi

