# Reading Tracker

A menu bar app for curating and tracking your reading habits across the web. Get content from Hacker News and Reddit, open articles in Safari's reader mode, and build a personal reading analytics database.

## What it does

**Content Discovery**
- Shows top stories from Hacker News and multiple Reddit subs in your menu bar
- Refreshes every 5 minutes with fresh content
- Clean interface with upvote counts and truncated titles

**Smart Reading**
- Opens links in Safari (your actual browser, not some embedded webview)
- Designed to work with Safari's reader mode for distraction-free reading
- Future: Automatically capture and store reader mode content for offline access

**Reading Analytics**
- SQLite database tracks every click with full context
- See which stories you actually read vs just browsed
- Word cloud visualization of your reading patterns
- Timeline of when stories appeared vs when you clicked them

## The roadmap

This app is building toward something bigger:

1. **Phase 1** (current): Menu bar content discovery + click tracking
2. **Phase 2** (next): Browser extension integration to capture reader mode content
3. **Phase 3**: Local library of saved articles with full-text search
4. **Phase 4**: Reading pattern analysis and content recommendations

## Why this matters

Too much content, too little retention. This app helps you:
- Track what you actually read (vs what you meant to read)
- Build a searchable personal library of articles
- Understand your reading patterns and interests
- Keep good content accessible even when links break

## Getting started

```bash
git clone this-repo
cd mac_hn
npm install
npm start
```

Look for the icon in your menu bar. Click stories to open them in Safari.

## What gets tracked

Every click captures:
- Article title, points, and comment count
- When the story first appeared in feeds
- When you actually clicked it
- URL and source (HN vs Reddit)

All stored locally in `clicks.db`. Your data stays yours.

## Browser extension integration (planned)

The next major feature: a Safari extension that automatically saves reader mode content when you finish reading an article. This creates a permanent, searchable archive of everything you've read.

Technical approach:
- Safari extension detects when reader mode is used
- Captures clean HTML/text content
- Syncs with the menu bar app's database
- Enables full-text search of your reading history

## Data structure

**stories** - tracks when content first appeared  
**clicks** - full context for every article you opened  
**articles** (planned) - saved reader mode content with full text

The analytics reveal patterns: What topics do you actually read vs just scroll past? How much time passes between seeing a story and clicking it? What's your reading velocity by day/week?

---

Built with Electron, using official APIs from HN and Reddit. Everything stays local until you decide otherwise.