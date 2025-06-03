# Reading Tracker

A comprehensive personal reading analytics and archival system for macOS. Track what you read, save articles for offline access, and build a searchable personal knowledge base.

## Overview

Reading Tracker is more than just a bookmark manager. It's a complete solution for:

- 📚 **Personal Reading Analytics** - Track your reading habits over time
- 🔖 **Smart Article Archival** - Save complete articles with clean formatting
- 🔍 **Full-Text Search** - Find anything you've read, instantly
- 📊 **Reading Statistics** - Understand your reading patterns and preferences
- 🌐 **Cross-Platform Access** - Works on any website through bookmarklets
- 🎨 **Beautiful Reading Library** - Browse your saved content with ease

### The Complete System

1. **Menu Bar App** (Electron) - Shows HN/Reddit feeds + reading library
2. **API Server** (Express) - HTTP/HTTPS endpoints for article saving
3. **SQLite Database** - Local storage with full-text search
4. **Bookmarklet** - One-click article saving from any website
5. **Article Viewer** - Clean, reader-mode display of saved content

---

## Quick Start

```bash
# Clone and install
git clone <this-repo>
cd reading-tracker
npm install

# Start the app
npm start
```

**That's it!** The menu bar app will start, and you can begin using the bookmarklet to save articles.

For the complete experience (Reddit integration, Safari extension), continue with the full setup below.

---

## Complete Setup Guide

### 1. Initial Installation

```bash
# Install dependencies
npm install

# Create SSL certificates for HTTPS support
openssl req -x509 -newkey rsa:4096 -keyout key.pem -out cert.pem -days 365 -nodes \
  -subj "/C=US/ST=State/L=City/O=ReadingTracker/CN=localhost"

# Start the application
npm start
```

### 2. Reddit Integration (Optional)

To get Reddit content in your feeds, you'll need Reddit API credentials:

#### A. Create Reddit App

1. Go to [reddit.com/prefs/apps](https://www.reddit.com/prefs/apps)
2. Click "Create App" or "Create Another App"
3. Fill out the form:
   - **Name**: Reading Tracker
   - **App type**: Script
   - **Description**: Personal reading tracker
   - **About URL**: (leave blank)
   - **Redirect URI**: (leave blank)
4. Click "Create app"

#### B. Get Your Credentials

After creating the app, you'll see:
- **Client ID**: The string under your app name (looks like: `abc123xyz`)
- **Client Secret**: The "secret" value (looks like: `def456uvw-XYZ789`)

#### C. Configure the App

When you first start Reading Tracker, if Reddit credentials aren't found, you'll see a setup dialog. Enter your credentials there, or manually create a `.env` file:

```env
REDDIT_CLIENT_ID=your_client_id_here
REDDIT_CLIENT_SECRET=your_client_secret_here
```

### 3. Network Configuration

Reading Tracker runs two servers to handle different scenarios:

- **HTTP Server**: `http://127.0.0.1:3002` (for HTTP websites)
- **HTTPS Server**: `https://127.0.0.1:3003` (for HTTPS websites)

#### Firewall Setup

If you're having connection issues, you may need to allow these ports:

**macOS Firewall:**
```bash
# Allow the ports (if needed)
sudo pfctl -f /etc/pf.conf
```

**Check if ports are accessible:**
```bash
# Test HTTP
curl http://127.0.0.1:3002/api/ping

# Test HTTPS (will show certificate warning, that's normal)
curl -k https://127.0.0.1:3003/api/ping
```

### 4. Bookmarklet Setup

#### A. Trust HTTPS Certificate (One-time)

1. **Start Reading Tracker** (`npm start`)
2. **Open Safari** and go to: `https://127.0.0.1:3003/test`
3. **Safari will show a security warning** - this is expected for self-signed certificates
4. **Click "Advanced"** → **"Proceed to 127.0.0.1"**
5. **Certificate is now trusted** for this session

#### B. Install Bookmarklet

1. **Open** `https-bookmarklet.html` in Safari (generated when you start the app)
2. **Drag the bookmarklet** to your Safari bookmarks bar
3. **Choose the version** you prefer:
   - **HTTPS Bookmarklet**: For secure sites (recommended)
   - **Auto-Detect**: Automatically chooses HTTP/HTTPS

#### C. Test the Bookmarklet

1. **Visit any article page** (blog, news site, etc.)
2. **Click your bookmarklet** in the bookmarks bar
3. **Look for notifications**:
   - ✅ Green: "Article saved!"
   - ❌ Red: Error (check console)

### 5. Safari Extension (Advanced)

For a more integrated experience, you can set up the actual Safari extension:

#### A. Enable Safari Developer Mode

```bash
# Enable internal debug menu
defaults write com.apple.Safari IncludeInternalDebugMenu 1
```

Restart Safari, then:
1. **Safari > Preferences > Advanced**
2. **Check "Show Develop menu in menu bar"**
3. **Develop > Allow Unsigned Extensions** (if available)

#### B. Safari Extension Limitations

⚠️ **Important**: Modern Safari requires extensions to be packaged as macOS apps and signed. For development, the **bookmarklet approach is recommended** as it provides the same functionality without Safari's restrictions.

The bookmarklet works on 100% of websites and is much easier to set up.

---

## Usage Guide

### Menu Bar App

**Right-click the menu bar icon** to access:

- **HN/Reddit Feeds** - Latest stories with click tracking
- **Reading Library** - Browse saved articles with search
- **Word Cloud** - Visualize your reading patterns
- **Link Stats** - See your most-clicked stories

### Saving Articles

1. **Visit any webpage** with article content
2. **Click your bookmarklet** 
3. **Article is automatically saved** with clean formatting
4. **View in Reading Library** or search later

### Reading Library

Access via menu bar → "READING LIBRARY":

- **Browse articles** - Chronological list with excerpts
- **Search content** - Full-text search across all saved articles
- **Click to read** - Opens saved content in clean viewer
- **Access originals** - Links to original URLs when needed

### Command Line Tools

Several utility scripts are included:

```bash
# Check saved articles
node check-articles.js

# Get latest article HTML
node get-latest-article.js

# Open latest article in Safari
node open-latest-article.js

# Extract HTML for external use
node extract-article-html.js > my-article.html
```

---

## Technical Architecture

### Database Schema

```sql
-- Article content storage
CREATE TABLE articles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    url TEXT NOT NULL UNIQUE,
    title TEXT NOT NULL,
    author TEXT,
    publish_date TEXT,
    content TEXT NOT NULL,           -- Full HTML
    text_content TEXT NOT NULL,      -- Plain text
    word_count INTEGER,
    reading_time INTEGER,
    saved_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    tags TEXT,
    notes TEXT
);

-- Full-text search index
CREATE VIRTUAL TABLE articles_fts USING fts5(
    title, author, text_content, tags,
    content='articles', content_rowid='id'
);

-- Click tracking for feeds
CREATE TABLE clicks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    story_id INTEGER NOT NULL,
    title TEXT NOT NULL,
    url TEXT NOT NULL,
    points INTEGER,
    comments INTEGER,
    story_added_at DATETIME,
    clicked_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Story appearance tracking
CREATE TABLE stories (
    story_id INTEGER PRIMARY KEY,
    title TEXT NOT NULL,
    points INTEGER,
    comments INTEGER,
    first_seen_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

### API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/ping` | Health check |
| `POST` | `/api/articles` | Save article |
| `GET` | `/api/articles` | List articles |
| `GET` | `/api/articles/:id` | Get specific article |
| `GET` | `/api/articles/search?q=term` | Search articles |
| `GET` | `/api/articles/stats` | Reading statistics |
| `POST` | `/api/open/library` | Open reading library |
| `POST` | `/api/open/analytics` | Open analytics view |

### Network Ports

- **3002**: HTTP API server
- **3003**: HTTPS API server (with self-signed certificate)

### Content Extraction

The bookmarklet uses multiple strategies for clean content extraction:

1. **Semantic HTML** - `<article>`, `[role="article"]`
2. **Common Selectors** - `.content`, `.post`, `.entry`, `main`
3. **Content Scoring** - Text density vs link ratio analysis
4. **Metadata Extraction** - Author, publish date, title from meta tags
5. **Cleanup** - Removes ads, navigation, scripts

---

## Troubleshooting

### Bookmarklet Issues

**"Mixed Content" Errors:**
- Use HTTPS bookmarklet on HTTPS sites
- Trust the certificate at `https://127.0.0.1:3003/test`

**"Connection Refused":**
- Ensure Reading Tracker app is running
- Check that ports 3002/3003 aren't blocked

**No Notifications:**
- Open Safari's Developer Console (`Cmd+Option+C`)
- Look for JavaScript errors
- Verify API connectivity with test buttons

### Reddit Integration

**"Invalid Credentials":**
- Double-check Client ID and Secret from Reddit
- Ensure app type is set to "Script"
- Try regenerating the secret

**"Rate Limited":**
- Reddit API has usage limits
- Wait a few minutes and try again
- The app caches results to reduce API calls

### Database Issues

**"Database locked":**
```bash
# Stop the app and restart
pkill -f electron
npm start
```

**Corrupted database:**
```bash
# Backup and recreate
cp clicks.db clicks.db.backup
rm clicks.db
npm start  # Will recreate with empty database
```

### Safari Extension

**Extension not appearing:**
- Safari extensions must be packaged as macOS apps
- Use the bookmarklet instead - it provides identical functionality
- Check `SAFARI_SETUP.md` for detailed extension instructions

---

## Development

### Project Structure

```
reading-tracker/
├── main.js                 # Electron main process
├── package.json            # Dependencies and scripts
├── clicks.db              # SQLite database
├── cert.pem               # HTTPS certificate
├── key.pem                # HTTPS private key
├── .env                   # Reddit API credentials
├── safari-extension/      # Safari extension files
│   └── ReadingTracker.safariextension/
├── *.html                 # Test and setup pages
└── *.js                   # Utility scripts
```

### Adding Features

**New Content Sources:**
- Add feed fetching in `main.js`
- Update menu generation in `updateMenu()`

**New API Endpoints:**
- Add routes in `initApiServer()`
- Update database schema as needed

**UI Improvements:**
- Modify HTML templates in `showArticleLibrary()` and related functions
- Update CSS for better styling

### Environment Variables

```env
# Required for Reddit integration
REDDIT_CLIENT_ID=your_client_id
REDDIT_CLIENT_SECRET=your_client_secret

# Optional development settings
NODE_ENV=development          # Enables hot reload
DEBUG=true                   # Extra logging
```

---

## Privacy & Security

### Data Storage

- **Everything stays local** - No cloud services or external analytics
- **SQLite database** - Standard, portable format
- **Full control** - Export, backup, or delete data anytime

### Network Security

- **Self-signed certificates** - For HTTPS support
- **Local-only servers** - Bound to 127.0.0.1 (localhost)
- **No external requests** - Except for feed APIs (HN, Reddit)

### Content Sanitization

- **Script removal** - Dangerous scripts stripped from saved content
- **Link safety** - External links open in new tabs
- **XSS protection** - Content properly escaped in viewers

---

## FAQ

**Q: Why not just use browser bookmarks?**
A: Reading Tracker saves the actual article content, making it searchable and preserving it against link rot. It also provides analytics on your reading habits.

**Q: Does this work on mobile?**
A: The menu bar app is macOS-only, but saved articles can be accessed from any device. A mobile companion app could be developed.

**Q: Can I export my data?**
A: Yes! The SQLite database is standard format. Use the included scripts or any SQLite client to export your data.

**Q: Why both HTTP and HTTPS servers?**
A: Modern browsers block HTTP requests from HTTPS pages (mixed content). Running both protocols ensures the bookmarklet works on any website.

**Q: Is this similar to Instapaper/Pocket?**
A: Similar concept but with more focus on analytics, full local control, and integration with your browsing habits through the HN/Reddit feeds.

**Q: Can I customize the article viewer?**
A: Yes! Edit the HTML template in `showSavedArticle()` function in `main.js`.

---

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

### Development Setup

```bash
# Install with dev dependencies
npm install

# Run with auto-reload
NODE_ENV=development npm start

# Run tests
npm test
```

---

## License

MIT License - see LICENSE file for details.

---

## Acknowledgments

- **Hacker News API** - For providing free access to HN data
- **Reddit API** - For content feeds
- **Electron** - For cross-platform desktop app framework
- **SQLite FTS5** - For fast full-text search
- **Express.js** - For the API server

---

*Reading Tracker: Because what you read shapes who you become.* 📚