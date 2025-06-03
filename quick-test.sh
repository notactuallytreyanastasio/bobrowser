#!/bin/bash

# 🧪 Quick Test Script - Check if everything is working

echo "🧪 Reading Tracker Quick Test"
echo "=============================="

# Check if server is running
if curl -s http://127.0.0.1:3002/api/ping > /dev/null; then
    echo "✅ HTTP Server: Running (port 3002)"
else
    echo "❌ HTTP Server: Not running"
fi

if curl -sk https://127.0.0.1:3003/api/ping > /dev/null; then
    echo "✅ HTTPS Server: Running (port 3003)"  
else
    echo "❌ HTTPS Server: Not running"
fi

# Check database
if [ -f "clicks.db" ]; then
    ARTICLE_COUNT=$(sqlite3 clicks.db "SELECT COUNT(*) FROM articles;")
    echo "✅ Database: $ARTICLE_COUNT articles saved"
    
    echo ""
    echo "📚 Recent articles:"
    sqlite3 clicks.db "SELECT id, title, word_count, substr(saved_at, 1, 16) as saved FROM articles ORDER BY id DESC LIMIT 3;" | while IFS='|' read -r id title words saved; do
        echo "   #$id: $title ($words words) - $saved"
    done
else
    echo "❌ Database: clicks.db not found"
fi

echo ""
echo "🔗 Bookmarklet: file://$(pwd)/csp-safe-bookmarklet.html"