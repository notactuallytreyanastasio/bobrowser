# Reading Tracker Safari Extension

This Safari Web Extension automatically detects readable content and saves articles to your personal reading library.

## Features

- **Smart Content Detection**: Automatically identifies readable articles and blog posts
- **Reading Behavior Tracking**: Monitors reading time and saves articles when you finish reading
- **Manual Save Option**: Click the extension icon to manually save any article
- **Full-Text Search**: Saved articles are indexed for instant searching
- **Reading Analytics**: View your reading patterns and statistics

## How it Works

1. **Content Detection**: The extension scans each page for article-like content using multiple heuristics
2. **Reading Tracking**: Monitors scroll behavior and time spent to detect when you're actually reading
3. **Auto-Save**: Automatically saves articles after 10+ seconds of reading activity
4. **Clean Content**: Extracts the main article content, removing ads and navigation
5. **Sync with App**: Communicates with the main Reading Tracker app via local API

## Development Setup

### 1. Build the Extension

The extension files are ready in `ReadingTracker.safariextension/`. You'll need to:

1. Open Safari and enable Developer menu (Safari > Preferences > Advanced > Show Develop menu)
2. Go to Develop > Allow Unsigned Extensions
3. Load the extension: Develop > Web Extension Converter...
4. Select the `ReadingTracker.safariextension` folder

### 2. Testing

1. Start the main Reading Tracker app (`npm start`)
2. Visit any article page (try a blog post or news article)
3. The extension should detect readable content and show a badge
4. Start reading by scrolling through the article
5. After 10 seconds of reading, the article will auto-save
6. Check the Reading Library in the menu bar app

### 3. Manual Save

- Click the extension icon while on any page
- Click "Save Current Article" if the page contains readable content
- View saved articles in the popup or main app

## Extension Files

- `manifest.json` - Extension configuration and permissions
- `content.js` - Main content detection and reading tracking logic
- `background.js` - Service worker for API communication
- `popup.html/js` - Extension popup interface

## API Endpoints

The extension communicates with the Electron app via these endpoints:

- `POST /api/articles` - Save article content
- `GET /api/articles` - Retrieve saved articles
- `GET /api/articles/search` - Full-text search
- `GET /api/articles/stats` - Reading statistics

## Content Extraction

The extension uses multiple strategies to extract clean article content:

1. **Semantic HTML**: Looks for `<article>` tags and `role="article"`
2. **CSS Selectors**: Common article container classes
3. **Readability Algorithm**: Content scoring based on text density and link ratio
4. **Metadata Extraction**: Author, publish date, and title from meta tags

## Privacy

- All data stays local on your machine
- No external services or tracking
- Content is only saved when you explicitly read it
- Full control over your reading data

## Browser Compatibility

Built for Safari with Manifest V3 standards. The extension uses:

- Content Scripts for page analysis
- Service Worker for background processing
- Local storage for offline article access
- Native messaging for app communication