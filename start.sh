#!/bin/bash

# 📖 Reading Tracker Startup Script
# This script starts everything you need for the reading tracker

set -e  # Exit on any error

echo "🚀 Starting Reading Tracker..."
echo ""

# Check if we're in the right directory
if [ ! -f "main.js" ]; then
    echo "❌ Error: main.js not found. Please run this script from the mac_hn directory."
    exit 1
fi

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "❌ Error: Node.js is not installed. Please install Node.js first."
    exit 1
fi

# Check if dependencies are installed
if [ ! -d "node_modules" ]; then
    echo "📦 Installing dependencies..."
    npm install
    echo ""
fi

# Kill any existing node processes for this project
echo "🧹 Cleaning up any existing processes..."
pkill -f "node main.js" 2>/dev/null || true
sleep 2

# Start the server
echo "🖥️  Starting Reading Tracker server..."
echo "   - HTTP API: http://127.0.0.1:3002"
echo "   - HTTPS API: https://127.0.0.1:3003"
echo ""

# Start in background and capture PID
NODE_ENV=server node main.js &
SERVER_PID=$!

# Wait a moment for server to start
sleep 3

# Check if server started successfully
if kill -0 $SERVER_PID 2>/dev/null; then
    echo "✅ Server started successfully (PID: $SERVER_PID)"
    echo ""
    echo "📖 Bookmarklet Setup:"
    echo "   1. Open: file://$(pwd)/reader-confirm-bookmarklet.html"
    echo "   2. Copy the bookmarklet code"
    echo "   3. Create a new bookmark in Safari and paste the code as URL"
    echo ""
    echo "🧪 Testing:"
    echo "   1. Visit any article (try news.ycombinator.com)"
    echo "   2. Switch to Reader View"
    echo "   3. Click your bookmarklet"
    echo ""
    echo "📊 Check saved articles:"
    echo "   sqlite3 clicks.db \"SELECT title, word_count FROM articles ORDER BY id DESC LIMIT 5;\""
    echo ""
    echo "🛑 To stop the server:"
    echo "   kill $SERVER_PID"
    echo "   OR press Ctrl+C if running in foreground"
    echo ""
    
    # Open the bookmarklet setup page
    if command -v open &> /dev/null; then
        echo "🌐 Opening bookmarklet setup page..."
        open "file://$(pwd)/reader-confirm-bookmarklet.html"
    fi
    
    # Keep script running so we can see server logs
    echo "💡 Server logs (press Ctrl+C to stop):"
    echo "----------------------------------------"
    wait $SERVER_PID
else
    echo "❌ Failed to start server"
    exit 1
fi