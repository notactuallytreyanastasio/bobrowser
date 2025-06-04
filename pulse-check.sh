#!/bin/bash

# Pulse Check Script for BOBrowser Database
# Provides quick stats and insights

# Configuration
DB_PATH="$HOME/Library/Application Support/mac_hn/clicks.db"
API_URL="http://127.0.0.1:3002"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

echo -e "${CYAN}🔍 BOBrowser Pulse Check${NC}"
echo -e "${CYAN}========================${NC}"
echo

# Check if database exists
if [ ! -f "$DB_PATH" ]; then
    echo -e "${RED}❌ Database not found at: $DB_PATH${NC}"
    exit 1
fi

# Check if API server is running
if ! curl -s "$API_URL/api/ping" > /dev/null 2>&1; then
    echo -e "${YELLOW}⚠️  API server not running, using direct database queries${NC}"
    USE_API=false
else
    echo -e "${GREEN}✅ API server is running${NC}"
    USE_API=true
fi

echo

# 1. TOP TAGS
echo -e "${PURPLE}🏷️  TOP 10 TAGS${NC}"
echo "───────────────"
if [ "$USE_API" = true ]; then
    curl -s "$API_URL/api/analytics/tag-stats" | jq -r '.data | sort_by(-.story_count) | .[0:10] | .[] | "\(.story_count)x \(.tag)"' 2>/dev/null || echo "API request failed"
else
    echo "Database-only tag parsing not fully implemented - use API mode"
fi
echo

# 2. 5 MOST CLICKED LINKS
echo -e "${BLUE}🔗 TOP 5 MOST CLICKED LINKS${NC}"
echo "─────────────────────────────"
sqlite3 "$DB_PATH" "
SELECT 
    COUNT(*) || ' clicks - ' || SUBSTR(title, 1, 60) || CASE WHEN LENGTH(title) > 60 THEN '...' ELSE '' END as info
FROM clicks 
GROUP BY story_id, title
ORDER BY COUNT(*) DESC
LIMIT 5;
" 2>/dev/null || echo "Database query failed"
echo

# 3. 5 MOST VIEWED LINKS  
echo -e "${GREEN}👀 TOP 5 MOST VIEWED LINKS${NC}"
echo "──────────────────────────"
sqlite3 "$DB_PATH" "
SELECT 
    times_appeared || ' views - ' || SUBSTR(title, 1, 60) || CASE WHEN LENGTH(title) > 60 THEN '...' ELSE '' END as info
FROM links 
WHERE viewed = 1
ORDER BY times_appeared DESC
LIMIT 5;
" 2>/dev/null || echo "Database query failed"
echo

# 4. ALL TAGS COUNT
echo -e "${YELLOW}📊 TAGS OVERVIEW${NC}"
echo "─────────────────"
if [ "$USE_API" = true ]; then
    TOTAL_TAGS=$(curl -s "$API_URL/api/analytics/tag-stats" | jq '.data | length' 2>/dev/null)
else
    # Simple approach: count comma-separated tags
    TOTAL_TAGS=$(sqlite3 "$DB_PATH" "
    SELECT COUNT(DISTINCT tag) FROM (
        SELECT TRIM(SUBSTR(tags, 1, INSTR(tags||',', ',')-1)) as tag FROM links WHERE tags IS NOT NULL AND tags != ''
        UNION ALL
        SELECT TRIM(SUBSTR(SUBSTR(tags, INSTR(tags, ',')+1)||',', 1, INSTR(SUBSTR(tags, INSTR(tags, ',')+1)||',', ',')-1)) as tag 
        FROM links WHERE tags IS NOT NULL AND tags != '' AND INSTR(tags, ',') > 0
    ) WHERE tag != '';
    " 2>/dev/null || echo "0")
fi

TAGGED_STORIES=$(sqlite3 "$DB_PATH" "SELECT COUNT(*) FROM links WHERE tags IS NOT NULL AND tags != '';" 2>/dev/null)

echo -e "Total unique tags: ${YELLOW}$TOTAL_TAGS${NC}"
echo -e "Stories with tags: ${YELLOW}$TAGGED_STORIES${NC}"
echo

# 5. ALL LINKS COUNT
echo -e "${RED}📈 LINKS OVERVIEW${NC}"
echo "──────────────────"
TOTAL_LINKS=$(sqlite3 "$DB_PATH" "SELECT COUNT(*) FROM links;" 2>/dev/null)
TOTAL_CLICKS=$(sqlite3 "$DB_PATH" "SELECT COUNT(*) FROM clicks;" 2>/dev/null)
VIEWED_LINKS=$(sqlite3 "$DB_PATH" "SELECT COUNT(*) FROM links WHERE viewed = 1;" 2>/dev/null)
UNTAGGED_LINKS=$(sqlite3 "$DB_PATH" "SELECT COUNT(*) FROM links WHERE tags IS NULL OR tags = '';" 2>/dev/null)

echo -e "Total links: ${RED}$TOTAL_LINKS${NC}"
echo -e "Total clicks: ${RED}$TOTAL_CLICKS${NC}"
echo -e "Viewed links: ${RED}$VIEWED_LINKS${NC}"
echo -e "Untagged links: ${RED}$UNTAGGED_LINKS${NC}"
echo

# QUICK STATS
echo -e "${CYAN}⚡ QUICK STATS${NC}"
echo "──────────────"
if [ "$TOTAL_LINKS" -gt 0 ]; then
    CLICK_RATE=$(echo "scale=1; $TOTAL_CLICKS * 100 / $TOTAL_LINKS" | bc 2>/dev/null || echo "N/A")
    VIEW_RATE=$(echo "scale=1; $VIEWED_LINKS * 100 / $TOTAL_LINKS" | bc 2>/dev/null || echo "N/A")
    TAG_RATE=$(echo "scale=1; $TAGGED_STORIES * 100 / $TOTAL_LINKS" | bc 2>/dev/null || echo "N/A")
    
    echo -e "Click rate: ${CYAN}${CLICK_RATE}%${NC}"
    echo -e "View rate: ${CYAN}${VIEW_RATE}%${NC}"
    echo -e "Tag rate: ${CYAN}${TAG_RATE}%${NC}"
fi

# SOURCES BREAKDOWN
echo
echo -e "${PURPLE}📡 SOURCES BREAKDOWN${NC}"
echo "────────────────────"
sqlite3 "$DB_PATH" "
SELECT 
    source || ': ' || COUNT(*) || ' links'
FROM links 
GROUP BY source 
ORDER BY COUNT(*) DESC;
" 2>/dev/null || echo "Database query failed"

echo
echo -e "${GREEN}✅ Pulse check complete!${NC}"