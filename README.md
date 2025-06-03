# BOB - Reading Tracker & Story Aggregator

A macOS menu bar application that aggregates stories from Hacker News, Reddit, and Pinboard, while tracking your reading patterns and providing offline article storage.

## Features

- 📰 **Multi-Source Aggregation** - Hacker News, Reddit, and Pinboard stories in one place
- 📊 **Reading Analytics** - Track clicks, story impressions, and reading patterns  
- 🔖 **Story Tagging** - Organize stories with custom tags
- 💾 **Offline Storage** - Save articles for offline reading
- 🌐 **API Server** - HTTP/HTTPS endpoints for external integrations
- 🎯 **Menu Bar Access** - Quick access via macOS system tray

## Quick Start

```bash
# Install dependencies
npm install

# Start the application
npm start
```

The menu bar icon will appear in your system tray. Right-click to access stories from different sources.

## Setup

### Basic Installation

```bash
git clone <this-repo>
cd mac_hn
npm install
npm start
```

### Reddit Integration (Optional)

For Reddit stories, you'll need API credentials:

1. Go to [reddit.com/prefs/apps](https://www.reddit.com/prefs/apps)
2. Create a new "Script" application
3. Note your Client ID and Secret
4. Create a `.env` file:

```env
REDDIT_CLIENT_ID=your_client_id
REDDIT_CLIENT_SECRET=your_client_secret
REDDIT_SUBREDDITS=news,programming,technology  # optional
```

Or use the setup dialog that appears when first starting without credentials.

### API Server (Optional)

The app includes HTTP/HTTPS servers for external integrations:

```bash
# Generate SSL certificates for HTTPS support
openssl req -x509 -newkey rsa:4096 -keyout key.pem -out cert.pem -days 365 -nodes \
  -subj "/C=US/ST=State/L=City/O=BOB/CN=localhost"
```

Servers run on:
- HTTP: `http://127.0.0.1:3002`
- HTTPS: `https://127.0.0.1:3003`

## Usage

### Menu Bar Interface

Right-click the BOB icon in your menu bar to access:

- **Hacker News** - Latest HN stories
- **Reddit** - Stories from configured subreddits  
- **Pinboard** - Popular bookmarks
- **Article Library** - Saved articles with search
- **Reading Analytics** - View your reading patterns

### Story Management

- **Click stories** to open in your browser (automatically tracked)
- **Tag stories** for organization
- **Save articles** for offline reading
- **Search saved content** via the Article Library

### Command Line Tools

```bash
# Check saved articles
node check-articles.js

# Get latest article content  
node get-latest-article.js

# Open latest article in Safari
node open-latest-article.js
```

## Technical Details

### Architecture

- **Electron** - Desktop application framework
- **SQLite** - Local data storage with FTS5 search
- **Express** - API server for external integrations
- **Modular design** - Separated concerns across modules

### Database Schema

```sql
-- Story tracking
CREATE TABLE stories (
    story_id INTEGER PRIMARY KEY,
    title TEXT NOT NULL,
    points INTEGER,
    comments INTEGER,
    first_seen_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Click analytics  
CREATE TABLE clicks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    story_id INTEGER NOT NULL,
    title TEXT NOT NULL,
    url TEXT NOT NULL,
    clicked_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Article storage (full-text searchable)
CREATE VIRTUAL TABLE articles_fts USING fts5(...);
```

### Configuration

Environment variables (`.env`):

```env
# Reddit API
REDDIT_CLIENT_ID=your_id
REDDIT_CLIENT_SECRET=your_secret  
REDDIT_SUBREDDITS=news,programming

# Server settings
API_PORT=3002
HTTPS_PORT=3003
CACHE_DURATION=900000  # 15 minutes

# Optional
USER_AGENT=BOB-Reader/1.0
ENABLE_API_SERVER=true
```

## Development

### Project Structure

```
mac_hn/
├── main.js              # Electron entry point
├── src/
│   ├── api-server.js    # HTTP/HTTPS servers
│   ├── api-sources.js   # HN/Reddit/Pinboard APIs
│   ├── config.js        # Configuration
│   ├── database.js      # SQLite operations
│   ├── menu.js          # Tray menu management  
│   └── ui.js            # User interface components
├── package.json
└── archives/            # Archived articles
```

### Adding Features

**New Story Sources:**
- Add fetch functions in `src/api-sources.js`
- Update menu generation in `src/menu.js`

**New UI Features:**
- Add interface functions in `src/ui.js` 
- Update menu items in `src/menu.js`

**Database Changes:**
- Modify schema in `src/database.js`
- Add migration logic as needed

### Development Mode

```bash
# Run with hot reload
npm run dev

# Debug mode
NODE_ENV=development npm start
```

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/ping` | Health check |
| `POST` | `/api/articles` | Save article |
| `GET` | `/api/articles` | List saved articles |
| `GET` | `/api/articles/search?q=term` | Search articles |

## Troubleshooting

**Menu bar icon not appearing:**
- Check macOS permissions for the app
- Restart the application

**Reddit stories not loading:**
- Verify API credentials in `.env`
- Check rate limiting (wait a few minutes)

**Database errors:**
- Stop app: `pkill -f electron`
- Restart: `npm start`

## License

ISC License

---

*BOB: Your personal reading command center* 📚