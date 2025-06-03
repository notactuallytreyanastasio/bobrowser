const { app, Tray, Menu, shell, BrowserWindow, dialog } = require('electron');
const axios = require('axios');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');
const express = require('express');
const cors = require('cors');
const https = require('https');
const puppeteer = require('puppeteer');
const crypto = require('crypto');
require('dotenv').config();

if (process.env.NODE_ENV === 'development') {
  require('electron-reload')(__dirname, {
    electron: path.join(__dirname, 'node_modules', '.bin', 'electron'),
    hardResetMethod: 'exit'
  });
}

let tray = null;
let db = null;
let currentMenuTemplate = null;
let redditToken = null;
let redditCache = {};
let apiServer = null;
let httpsServer = null;
const CACHE_DURATION = 15 * 60 * 1000; // 15 minutes
const API_PORT = 3002;
const HTTPS_PORT = 3003;

function generateFakeData() {
  if (!db) return;
  
  console.log('Generating fake click data...');
  
  const fakeHNTitles = [
    'Ask HN: What\'s your favorite programming language?',
    'Show HN: I built a web scraper in Python',
    'The future of artificial intelligence',
    'Why blockchain will change everything',
    'Startup acquired for $100M',
    'New JavaScript framework released',
    'Bitcoin hits new all-time high',
    'Machine learning breakthrough announced',
    'Open source project gains massive adoption',
    'Tech giant announces layoffs',
    'Quantum computing milestone reached',
    'Privacy concerns with new app',
    'Developer tools comparison',
    'Remote work productivity tips',
    'Cybersecurity threat discovered',
    'Cloud computing costs analysis',
    'Mobile app development trends',
    'Database performance optimization',
    'API design best practices',
    'Code review horror stories'
  ];
  
  const fakeRedditTitles = [
    'AITAH for telling my roommate to clean up?',
    'ELI5: How does the internet work?',
    'Breaking: Major news event happening now',
    'This TV show just got cancelled',
    'Elixir pattern matching explained',
    'Update: Relationship drama continues',
    'TIFU by accidentally deleting my code',
    'LPT: Always backup your data',
    'TIL something fascinating about history',
    'Wholesome story about random kindness',
    'Drama in popular subreddit',
    'Celebrity announces new project',
    'Weather event causes chaos',
    'Sports team makes surprising trade',
    'Gaming community outraged over changes',
    'Movie review sparks debate',
    'Recipe that changed my life',
    'Pet does something adorable',
    'Life hack that actually works',
    'Conspiracy theory debunked'
  ];
  
  // Generate 4000 unique stories first
  for (let i = 0; i < 4000; i++) {
    const isHN = Math.random() > 0.5;
    const titleBase = isHN ? fakeHNTitles[Math.floor(Math.random() * fakeHNTitles.length)] : fakeRedditTitles[Math.floor(Math.random() * fakeRedditTitles.length)];
    const title = `${titleBase} (${i})`;
    const points = Math.floor(Math.random() * 1000) + 1;
    const comments = Math.floor(Math.random() * 200) + 1;
    const storyId = 100000 + i;
    
    // Add to stories table
    const daysAgo = Math.floor(Math.random() * 90); // Random day in last 3 months
    const addedDate = new Date(Date.now() - (daysAgo * 24 * 60 * 60 * 1000)).toISOString();
    
    db.run('INSERT OR IGNORE INTO stories (story_id, title, points, comments, first_seen_at) VALUES (?, ?, ?, ?, ?)', 
      [storyId, title, points, comments, addedDate]);
  }
  
  // Generate 5000 clicks
  setTimeout(() => {
    console.log('Generating 5000 fake clicks...');
    for (let i = 0; i < 5000; i++) {
      const storyId = 100000 + Math.floor(Math.random() * 4000);
      const isHN = Math.random() > 0.5;
      const titleBase = isHN ? fakeHNTitles[Math.floor(Math.random() * fakeHNTitles.length)] : fakeRedditTitles[Math.floor(Math.random() * fakeRedditTitles.length)];
      const title = `${titleBase} (${storyId - 100000})`;
      const url = isHN ? `https://news.ycombinator.com/item?id=${storyId}` : `https://old.reddit.com/r/random/comments/${storyId}/`;
      const points = Math.floor(Math.random() * 1000) + 1;
      const comments = Math.floor(Math.random() * 200) + 1;
      
      // Random click time in last 3 months
      const daysAgo = Math.floor(Math.random() * 90);
      const hoursAgo = Math.floor(Math.random() * 24);
      const minutesAgo = Math.floor(Math.random() * 60);
      const clickedDate = new Date(Date.now() - (daysAgo * 24 * 60 * 60 * 1000) - (hoursAgo * 60 * 60 * 1000) - (minutesAgo * 60 * 1000)).toISOString();
      
      // Story added date (always before click date)
      const storyDaysAgo = daysAgo + Math.floor(Math.random() * 30) + 1;
      const storyAddedDate = new Date(Date.now() - (storyDaysAgo * 24 * 60 * 60 * 1000)).toISOString();
      
      db.run('INSERT INTO clicks (story_id, title, url, points, comments, story_added_at, clicked_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [storyId, title, url, points, comments, storyAddedDate, clickedDate]);
    }
    console.log('Fake data generation complete!');
  }, 1000);
}

function initDatabase(callback) {
  db = new sqlite3.Database('clicks.db');
  
  db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS clicks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      story_id INTEGER NOT NULL,
      title TEXT NOT NULL,
      url TEXT NOT NULL,
      points INTEGER,
      comments INTEGER,
      story_added_at DATETIME,
      clicked_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);
    
    db.run(`CREATE TABLE IF NOT EXISTS stories (
      story_id INTEGER PRIMARY KEY,
      title TEXT NOT NULL,
      points INTEGER,
      comments INTEGER,
      first_seen_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);
    
    // Create articles table for saved content from Safari extension
    db.run(`CREATE TABLE IF NOT EXISTS articles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      url TEXT NOT NULL UNIQUE,
      title TEXT NOT NULL,
      author TEXT,
      publish_date TEXT,
      content TEXT,
      text_content TEXT,
      word_count INTEGER,
      reading_time INTEGER,
      saved_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      tags TEXT,
      notes TEXT,
      archive_path TEXT,
      archive_date DATETIME,
      file_size INTEGER,
      description TEXT
    )`);
    
    // Create full-text search table for articles
    db.run(`CREATE VIRTUAL TABLE IF NOT EXISTS articles_fts USING fts5(
      title,
      author,
      text_content,
      tags,
      content='articles',
      content_rowid='id'
    )`);
    
    // Triggers to keep FTS table in sync
    db.run(`CREATE TRIGGER IF NOT EXISTS articles_ai AFTER INSERT ON articles BEGIN
      INSERT INTO articles_fts(rowid, title, author, text_content, tags) 
      VALUES (new.id, new.title, new.author, new.text_content, new.tags);
    END`);
    
    db.run(`CREATE TRIGGER IF NOT EXISTS articles_ad AFTER DELETE ON articles BEGIN
      INSERT INTO articles_fts(articles_fts, rowid, title, author, text_content, tags) 
      VALUES ('delete', old.id, old.title, old.author, old.text_content, old.tags);
    END`);
    
    db.run(`CREATE TRIGGER IF NOT EXISTS articles_au AFTER UPDATE ON articles BEGIN
      INSERT INTO articles_fts(articles_fts, rowid, title, author, text_content, tags) 
      VALUES ('delete', old.id, old.title, old.author, old.text_content, old.tags);
      INSERT INTO articles_fts(rowid, title, author, text_content, tags) 
      VALUES (new.id, new.title, new.author, new.text_content, new.tags);
    END`);
    
    db.run(`ALTER TABLE clicks ADD COLUMN points INTEGER`, () => {});
    db.run(`ALTER TABLE clicks ADD COLUMN comments INTEGER`, () => {});
    db.run(`ALTER TABLE clicks ADD COLUMN story_added_at DATETIME`, () => {});
    
    // Add new columns for archiving
    db.run(`ALTER TABLE articles ADD COLUMN archive_path TEXT`, () => {});
    db.run(`ALTER TABLE articles ADD COLUMN archive_date DATETIME`, () => {});
    db.run(`ALTER TABLE articles ADD COLUMN file_size INTEGER`, () => {});
    db.run(`ALTER TABLE articles ADD COLUMN description TEXT`, () => {});
    
    // Check if we need to generate fake data
    db.get('SELECT COUNT(*) as count FROM clicks', (err, row) => {
      if (!err && row.count < 100) {
        console.log('Database appears empty, generating fake data...');
        generateFakeData();
      }
      if (callback) callback();
    });
  });
}

// Create archives directory if it doesn't exist
const archivesDir = path.join(__dirname, 'archives');
if (!fs.existsSync(archivesDir)) {
  fs.mkdirSync(archivesDir, { recursive: true });
}

async function archivePageWithPuppeteer(url, title) {
  let browser;
  try {
    console.log(`Starting archive process for: ${url}`);
    
    // Generate unique filename based on URL hash
    const urlHash = crypto.createHash('md5').update(url).digest('hex');
    const safeTitle = title.replace(/[^a-zA-Z0-9\s-]/g, '').substring(0, 50);
    const fileName = `${safeTitle}_${urlHash}.html`;
    const filePath = path.join(archivesDir, fileName);
    
    // Launch browser
    browser = await puppeteer.launch({
      headless: 'new',
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-web-security',
        '--disable-features=VizDisplayCompositor'
      ]
    });
    
    const page = await browser.newPage();
    
    // Set a realistic user agent
    await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    
    // Set viewport
    await page.setViewport({ width: 1200, height: 800 });
    
    console.log(`Navigating to: ${url}`);
    
    // Navigate with longer timeout and wait for network idle
    await page.goto(url, { 
      waitUntil: 'networkidle2', 
      timeout: 30000 
    });
    
    // Wait a bit more for any lazy-loaded content
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Remove ads, popups, and other unwanted elements
    await page.evaluate(() => {
      const selectorsToRemove = [
        '[class*="ad"]', '[id*="ad"]',
        '[class*="popup"]', '[class*="modal"]',
        '[class*="overlay"]', '[class*="banner"]',
        '[class*="cookie"]', '[class*="newsletter"]',
        '[class*="subscription"]', '[class*="paywall"]',
        '.advertisement', '.ads', '.ad-container',
        'iframe[src*="doubleclick"]', 'iframe[src*="googlesyndication"]'
      ];
      
      selectorsToRemove.forEach(selector => {
        document.querySelectorAll(selector).forEach(el => el.remove());
      });
    });
    
    // Get the full page content
    const content = await page.content();
    
    // Get page metadata
    const pageInfo = await page.evaluate(() => {
      const getMetaContent = (name) => {
        const meta = document.querySelector(`meta[name="${name}"], meta[property="${name}"], meta[property="og:${name}"]`);
        return meta ? meta.getAttribute('content') : '';
      };
      
      return {
        title: document.title,
        description: getMetaContent('description'),
        author: getMetaContent('author'),
        publishDate: getMetaContent('article:published_time') || getMetaContent('date'),
        siteName: getMetaContent('site_name') || getMetaContent('og:site_name')
      };
    });
    
    // Create a self-contained HTML file
    const archivedContent = `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <title>📚 ${pageInfo.title || title}</title>
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <style>
        .archive-header {
            background: #f8f9fa;
            border-bottom: 2px solid #e9ecef;
            padding: 20px;
            margin-bottom: 20px;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
        }
        .archive-header h1 {
            margin: 0 0 10px 0;
            color: #495057;
            font-size: 18px;
        }
        .archive-info {
            font-size: 14px;
            color: #6c757d;
        }
        .archive-info a {
            color: #007bff;
            text-decoration: none;
        }
        .archive-info a:hover {
            text-decoration: underline;
        }
        .archive-content {
            max-width: none !important;
        }
        /* Hide any remaining ads or popups */
        [class*="ad"], [id*="ad"],
        [class*="popup"], [class*="modal"],
        [class*="overlay"], [class*="banner"],
        [class*="cookie"], [class*="newsletter"] {
            display: none !important;
        }
    </style>
</head>
<body>
    <div class="archive-header">
        <h1>📚 Archived Page</h1>
        <div class="archive-info">
            <strong>Original URL:</strong> <a href="${url}" target="_blank">${url}</a><br>
            <strong>Archived:</strong> ${new Date().toLocaleString()}<br>
            ${pageInfo.author ? `<strong>Author:</strong> ${pageInfo.author}<br>` : ''}
            ${pageInfo.publishDate ? `<strong>Published:</strong> ${pageInfo.publishDate}<br>` : ''}
        </div>
    </div>
    <div class="archive-content">
        ${content.replace(/<head>[\s\S]*?<\/head>/i, '').replace(/<\/body>[\s\S]*$/i, '')}
    </div>
</body>
</html>`;
    
    // Save the archived content
    fs.writeFileSync(filePath, archivedContent, 'utf8');
    
    console.log(`Page archived successfully: ${filePath}`);
    
    return {
      success: true,
      filePath,
      fileName,
      title: pageInfo.title || title,
      author: pageInfo.author,
      description: pageInfo.description,
      publishDate: pageInfo.publishDate,
      archiveDate: new Date().toISOString(),
      originalUrl: url,
      fileSize: Buffer.byteLength(archivedContent, 'utf8')
    };
    
  } catch (error) {
    console.error(`Error archiving page ${url}:`, error);
    return {
      success: false,
      error: error.message,
      originalUrl: url
    };
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

function trackStoryAppearance(story) {
  if (db) {
    db.run('INSERT OR IGNORE INTO stories (story_id, title, points, comments) VALUES (?, ?, ?, ?)', 
      [story.id, story.title, story.points, story.comments]);
  }
}

function trackClick(storyId, title, url, points, comments) {
  if (db) {
    db.get('SELECT first_seen_at FROM stories WHERE story_id = ?', [storyId], (err, row) => {
      const storyAddedAt = row ? row.first_seen_at : new Date().toISOString();
      
      db.run('INSERT INTO clicks (story_id, title, url, points, comments, story_added_at) VALUES (?, ?, ?, ?, ?, ?)', 
        [storyId, title, url, points, comments, storyAddedAt], function(err) {
        if (err) {
          console.error('Error tracking click:', err);
        } else {
          // Stats menu removed
        }
      });
    });
  }
}

// Stats and word cloud functions removed - will be revisited if needed

async function promptForRedditCredentials() {
  const credentials = await new Promise((resolve) => {
    const win = new BrowserWindow({
      width: 450,
      height: 280,
      title: 'Reddit Setup',
      resizable: false,
      webPreferences: {
        nodeIntegration: true,
        contextIsolation: false
      }
    });

    const html = `
<!DOCTYPE html>
<html>
<head>
    <style>
        body { 
            font-family: -apple-system, BlinkMacSystemFont, sans-serif; 
            padding: 30px; 
            margin: 0;
            background: #f8f9fa;
            color: #333;
        }
        .container {
            background: white;
            padding: 25px;
            border-radius: 8px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
        }
        h3 { 
            margin: 0 0 20px 0; 
            font-weight: 500; 
            font-size: 18px;
            text-align: center;
        }
        input { 
            width: 100%; 
            padding: 12px; 
            margin: 8px 0; 
            font-size: 14px; 
            border: 1px solid #ddd;
            border-radius: 4px;
            box-sizing: border-box;
        }
        input:focus {
            outline: none;
            border-color: #007AFF;
        }
        button { 
            width: 100%;
            padding: 12px; 
            font-size: 14px; 
            background: #007AFF;
            color: white;
            border: none;
            border-radius: 4px;
            cursor: pointer;
            margin-top: 15px;
        }
        button:hover {
            background: #0056b3;
        }
        .label {
            font-size: 12px;
            color: #666;
            margin-bottom: 4px;
        }
    </style>
</head>
<body>
    <div class="container">
        <h3>Reddit API Setup</h3>
        <div class="label">Client ID</div>
        <input type="text" id="clientId" placeholder="Enter your Reddit Client ID">
        <div class="label">Client Secret</div>
        <input type="password" id="clientSecret" placeholder="Enter your Reddit Client Secret">
        <button onclick="submit()">Save Credentials</button>
    </div>
    <script>
        function submit() {
            const clientId = document.getElementById('clientId').value.trim();
            const clientSecret = document.getElementById('clientSecret').value.trim();
            if (clientId && clientSecret) {
                require('electron').ipcRenderer.send('reddit-credentials', { clientId, clientSecret });
            }
        }
        document.addEventListener('keypress', function(e) {
            if (e.key === 'Enter') submit();
        });
        document.getElementById('clientId').focus();
    </script>
</body>
</html>`;

    win.loadURL('data:text/html;charset=UTF-8,' + encodeURIComponent(html));
    
    const { ipcMain } = require('electron');
    ipcMain.once('reddit-credentials', (event, value) => {
      win.close();
      resolve(value);
    });
  });

  // Save to .env file
  const envContent = `REDDIT_CLIENT_ID=${credentials.clientId}\nREDDIT_CLIENT_SECRET=${credentials.clientSecret}\n`;
  fs.writeFileSync(path.join(__dirname, '.env'), envContent);
  
  // Update process.env for current session
  process.env.REDDIT_CLIENT_ID = credentials.clientId;
  process.env.REDDIT_CLIENT_SECRET = credentials.clientSecret;
  
  console.log('Reddit credentials saved to .env file');
}

async function getRedditToken() {
  try {
    if (!process.env.REDDIT_CLIENT_ID || !process.env.REDDIT_CLIENT_SECRET) {
      console.log('Reddit credentials not found, prompting user...');
      await promptForRedditCredentials();
    }

    const credentials = Buffer.from(`${process.env.REDDIT_CLIENT_ID}:${process.env.REDDIT_CLIENT_SECRET}`).toString('base64');
    
    const response = await axios.post('https://www.reddit.com/api/v1/access_token', 
      'grant_type=client_credentials',
      {
        headers: {
          'Authorization': `Basic ${credentials}`,
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': 'HN-Reader/1.0 by /u/yourUsername'
        }
      }
    );
    
    redditToken = response.data.access_token;
    console.log('Reddit token obtained');
  } catch (error) {
    console.error('Error getting Reddit token:', error);
  }
}

async function fetchSubredditPosts(subreddit) {
  const now = Date.now();
  
  // Check cache
  if (redditCache[subreddit] && (now - redditCache[subreddit].timestamp) < CACHE_DURATION) {
    console.log(`Using cached data for r/${subreddit}`);
    return redditCache[subreddit].posts;
  }
  
  if (!redditToken) {
    await getRedditToken();
  }
  
  try {
    const response = await axios.get(`https://oauth.reddit.com/r/${subreddit}/hot`, {
      headers: {
        'Authorization': `Bearer ${redditToken}`,
        'User-Agent': 'HN-Reader/1.0 by /u/yourUsername'
      },
      params: {
        limit: 10
      }
    });
    
    const posts = response.data.data.children.map(child => ({
      id: child.data.id,
      title: child.data.title,
      points: child.data.score || 0,
      comments: child.data.num_comments || 0,
      url: `https://old.reddit.com${child.data.permalink}`,
      subreddit: child.data.subreddit,
      is_self: child.data.is_self,
      actual_url: child.data.url
    }));
    
    // Cache the results
    redditCache[subreddit] = {
      posts: posts,
      timestamp: now
    };
    
    console.log(`Fetched fresh data for r/${subreddit}`);
    return posts;
    
  } catch (error) {
    console.error(`Error fetching r/${subreddit}:`, error);
    return [];
  }
}

async function fetchRedditStories() {
  const subreddits = ['news', 'television', 'elixir', 'aitah', 'bestofredditorupdates', 'explainlikeimfive'];
  
  try {
    const allPosts = [];
    
    for (const subreddit of subreddits) {
      const posts = await fetchSubredditPosts(subreddit);
      allPosts.push(...posts);
    }
    
    // Always shuffle for fresh selection each time menu opens
    const shuffled = allPosts.sort(() => 0.5 - Math.random());
    return shuffled.slice(0, 15);
      
  } catch (error) {
    console.error('Error fetching Reddit stories:', error);
    return [];
  }
}

async function fetchPinboardPopular() {
  try {
    const response = await axios.get('https://pinboard.in/popular/', {
      headers: {
        'User-Agent': 'Reading-Tracker/1.0'
      }
    });
    
    const html = response.data;
    const bookmarks = [];
    
    // Multiple patterns to try
    const patterns = [
      /<a href="([^"]+)">\s*([^<]+)\s*<\/a>\s*\[(\d+)\]/g,
      /<a href="([^"]+)">([^<]+)<\/a>.*?\[(\d+)\]/g,
      /<a[^>]+href="([^"]+)"[^>]*>([^<]+)<\/a>.*?\[(\d+)\]/g
    ];
    
    for (const pattern of patterns) {
      let match;
      while ((match = pattern.exec(html)) !== null && bookmarks.length < 15) {
        bookmarks.push({
          id: `pinboard_${bookmarks.length}`,
          title: match[2].trim(),
          url: match[1],
          points: parseInt(match[3]) || 0,
          comments: 0
        });
      }
      if (bookmarks.length > 0) break;
    }
    
    // If regex fails, fallback to manual parsing with known URLs
    if (bookmarks.length === 0) {
      console.log('Regex failed, using fallback data');
      const fallbackData = [
        { title: "Probe lenses and focus stacking: the secrets to incredible photos taken inside instruments", url: "https://www.dpreview.com/photography/5400934096/probe-lenses-and-focus-stacking-the-secrets-to-incredible-photos-taken-inside-instruments", points: 13 },
        { title: "The Who Cares Era", url: "https://dansinker.com/posts/2025-05-23-who-cares/", points: 11 },
        { title: "WeatherStar 4000+", url: "https://weatherstar.netbymatt.com/", points: 10 },
        { title: "Toolmen", url: "https://aworkinglibrary.com/writing/toolmen", points: 8 },
        { title: "AI jobs danger: Sleepwalking into a white-collar bloodbath", url: "https://www.axios.com/2025/05/28/ai-jobs-white-collar-unemployment-anthropic", points: 8 },
        { title: "C++ to Rust Phrasebook", url: "https://cel.cs.brown.edu/crp/", points: 7 },
        { title: "microsandbox: Self-Hosted Platform for Secure Execution", url: "https://github.com/microsandbox/microsandbox", points: 6 },
        { title: "BOND", url: "https://www.bondcap.com/reports/tai", points: 6 },
        { title: "Trump Taps Palantir to Compile Data on Americans", url: "https://www.nytimes.com/2025/05/30/technology/trump-palantir-data-americans.html", points: 6 },
        { title: "Reverse Engineering Linear's Sync Engine", url: "https://github.com/wzhudev/reverse-linear-sync-engine", points: 5 },
        { title: "The Art of Command Line", url: "https://github.com/jlevy/the-art-of-command-line", points: 5 },
        { title: "Building Better Software with Better Tools", url: "https://mitchellh.com/writing/building-better-software-with-better-tools", points: 4 },
        { title: "Why I Still Use RSS", url: "https://atthis.link/blog/2021/rss.html", points: 4 },
        { title: "The State of WebAssembly 2024", url: "https://blog.scottlogic.com/2024/11/18/state-of-webassembly-2024.html", points: 3 },
        { title: "Understanding Modern CSS Layout", url: "https://web.dev/learn/css/layout/", points: 3 }
      ];
      
      fallbackData.forEach((item, index) => {
        bookmarks.push({
          id: `pinboard_${index}`,
          title: item.title,
          url: item.url,
          points: item.points,
          comments: 0
        });
      });
    }
    
    console.log(`Fetched ${bookmarks.length} Pinboard popular bookmarks`);
    return bookmarks;
    
  } catch (error) {
    console.error('Error fetching Pinboard popular:', error);
    return [];
  }
}

async function fetchHNStories() {
  try {
    const topStoriesResponse = await axios.get('https://hacker-news.firebaseio.com/v0/topstories.json');
    const topStoryIds = topStoriesResponse.data.slice(0, 10);
    
    const stories = await Promise.all(
      topStoryIds.map(async (id) => {
        const storyResponse = await axios.get(`https://hacker-news.firebaseio.com/v0/item/${id}.json`);
        const story = storyResponse.data;
        return {
          ...story,
          points: story.score || 0,
          comments: story.descendants || 0
        };
      })
    );
    
    return stories;
  } catch (error) {
    console.error('Error fetching HN stories:', error);
    return [];
  }
}

function createTray() {
  try {
    tray = new Tray(path.join(__dirname, 'icon.png'));
    tray.setToolTip('BOB');
    
    updateMenu();
    
    // Update menu every time it's about to be shown
    tray.on('click', updateMenu);
    tray.on('right-click', updateMenu);
    
    setInterval(updateMenu, 300000);
    console.log('Tray created successfully');
  } catch (error) {
    console.error('Error creating tray:', error);
  }
}

async function updateMenu() {
  console.log('Updating menu...');
  const stories = await fetchHNStories();
  const redditStories = await fetchRedditStories();
  const pinboardStories = await fetchPinboardPopular();
  console.log(`Fetched ${stories.length} HN stories, ${redditStories.length} Reddit stories, and ${pinboardStories.length} Pinboard bookmarks`);
  
  stories.forEach(story => trackStoryAppearance(story));
  
  currentMenuTemplate = [
    {
      label: '━━━━━━ HACKER NEWS ━━━━━━',
      enabled: false
    },
    { type: 'separator' }
  ];
  
  // No need to calculate points width since we're not showing scores

  const storyItems = stories.map(story => ({
    label: `🟠 ${story.title.length > 75 ? story.title.substring(0, 72) + '...' : story.title}`,
    click: () => {
      // Open the actual article URL instead of HN comments
      const articleUrl = story.url || `https://news.ycombinator.com/item?id=${story.id}`;
      trackClick(story.id, story.title, articleUrl, story.points, story.comments);
      shell.openExternal(articleUrl);
    }
  }));
  
  currentMenuTemplate.push(...storyItems);
  
  currentMenuTemplate.push(
    { type: 'separator' },
    {
      label: '━━━━━━━ REDDIT ━━━━━━━',
      enabled: false
    },
    { type: 'separator' }
  );
  
  const redditStoryItems = redditStories.map(story => ({
    label: `👽 ${story.title.length > 75 ? story.title.substring(0, 72) + '...' : story.title}`,
    click: () => {
      // For Reddit: open comments if self-post, otherwise open the actual link
      const targetUrl = story.is_self ? story.url : story.actual_url;
      trackClick(story.id, story.title, targetUrl, story.points, story.comments);
      shell.openExternal(targetUrl);
    }
  }));
  
  currentMenuTemplate.push(...redditStoryItems);
  
  currentMenuTemplate.push(
    { type: 'separator' },
    {
      label: '━━━━━━ PINBOARD ━━━━━━',
      enabled: false
    },
    { type: 'separator' }
  );
  
  const pinboardStoryItems = pinboardStories.map(story => ({
    label: `📌 ${story.title.length > 75 ? story.title.substring(0, 72) + '...' : story.title}`,
    click: () => {
      trackClick(story.id, story.title, story.url, story.points, story.comments);
      shell.openExternal(story.url);
    }
  }));
  
  currentMenuTemplate.push(...pinboardStoryItems);
  
  currentMenuTemplate.push(
    { type: 'separator' },
    {
      label: '📚 Saved Articles',
      click: () => {
        showArticleLibrary();
      }
    },
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => {
        app.quit();
      }
    }
  );

  const contextMenu = Menu.buildFromTemplate(currentMenuTemplate);
  tray.setContextMenu(contextMenu);
}

// Article management functions for Safari extension API
function saveArticle(articleData, callback) {
  if (!db) {
    callback(new Error('Database not initialized'));
    return;
  }

  const {
    url, title, author, publishDate, content, textContent, 
    wordCount, readingTime, tags = null, notes = null
  } = articleData;

  db.run(`INSERT OR REPLACE INTO articles 
    (url, title, author, publish_date, content, text_content, word_count, reading_time, tags, notes) 
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [url, title, author, publishDate, content, textContent, wordCount, readingTime, tags, notes],
    function(err) {
      if (err) {
        console.error('Error saving article:', err);
        callback(err);
      } else {
        console.log('Article saved with ID:', this.lastID);
        callback(null, { id: this.lastID, message: 'Article saved successfully' });
      }
    }
  );
}

function getArticles(limit = 50, offset = 0, callback) {
  if (!db) {
    callback(new Error('Database not initialized'));
    return;
  }

  db.all(`SELECT * FROM articles 
          ORDER BY saved_at DESC 
          LIMIT ? OFFSET ?`, 
    [limit, offset], callback);
}

function searchArticles(query, callback) {
  if (!db) {
    callback(new Error('Database not initialized'));
    return;
  }

  db.all(`SELECT articles.*, snippet(articles_fts, -1, '<mark>', '</mark>', '...', 64) as snippet
          FROM articles_fts 
          JOIN articles ON articles.id = articles_fts.rowid
          WHERE articles_fts MATCH ?
          ORDER BY rank
          LIMIT 20`, 
    [query], callback);
}

function getArticleStats(callback) {
  if (!db) {
    callback(new Error('Database not initialized'));
    return;
  }

  db.get(`SELECT 
    COUNT(*) as total_articles,
    SUM(word_count) as total_words,
    AVG(word_count) as avg_words,
    COUNT(CASE WHEN saved_at > datetime('now', '-7 days') THEN 1 END) as week_articles,
    COUNT(CASE WHEN saved_at > datetime('now', '-30 days') THEN 1 END) as month_articles
    FROM articles`, callback);
}

// Initialize API server for Safari extension communication
function initApiServer() {
  console.log('Initializing API server...');
  
  const server = express();
  
  // More permissive CORS for development
  server.use(cors({
    origin: true,
    credentials: true
  }));
  
  server.use(express.json({ limit: '10mb' }));
  
  // Serve archived files
  server.use('/archives', express.static(archivesDir));
  
  // Add request logging
  server.use((req, res, next) => {
    console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
    next();
  });
  
  // Simple test endpoint first
  server.get('/test', (req, res) => {
    console.log('Test endpoint hit');
    res.send('API server is working!');
  });
  
  // Health check endpoint
  server.get('/api/ping', (req, res) => {
    console.log('Ping endpoint hit');
    res.json({ status: 'ok', timestamp: Date.now() });
  });
  
  // Add error handling middleware
  server.use((err, req, res, next) => {
    console.error('API Error:', err);
    res.status(500).json({ error: err.message });
  });
  
  // Save article from Safari extension with Puppeteer archiving
  server.post('/api/articles', async (req, res) => {
    console.log('API: Archiving article with Puppeteer');
    
    try {
      const { url, title } = req.body;
      
      if (!url) {
        return res.status(400).json({ error: 'URL is required' });
      }
      
      // Archive the page with Puppeteer
      const archiveResult = await archivePageWithPuppeteer(url, title || 'Untitled');
      
      if (!archiveResult.success) {
        return res.status(500).json({ error: archiveResult.error });
      }
      
      // Save to database
      const articleData = {
        url: archiveResult.originalUrl,
        title: archiveResult.title,
        author: archiveResult.author,
        publish_date: archiveResult.publishDate,
        description: archiveResult.description,
        archive_path: archiveResult.fileName,
        archive_date: archiveResult.archiveDate,
        file_size: archiveResult.fileSize,
        saved_at: new Date().toISOString()
      };
      
      db.run(`INSERT OR REPLACE INTO articles 
        (url, title, author, publish_date, description, archive_path, archive_date, file_size, saved_at, content, text_content) 
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [articleData.url, articleData.title, articleData.author, articleData.publish_date, 
         articleData.description, articleData.archive_path, articleData.archive_date, 
         articleData.file_size, articleData.saved_at, '', ''],
        function(err) {
          if (err) {
            console.error('API: Error saving article to database:', err);
            res.status(500).json({ error: err.message });
          } else {
            console.log(`Article archived successfully: ${articleData.title}`);
            res.json({
              success: true,
              id: this.lastID,
              ...articleData,
              message: 'Article archived successfully for offline reading'
            });
          }
        }
      );
      
    } catch (error) {
      console.error('API: Error archiving article:', error);
      res.status(500).json({ error: error.message });
    }
  });
  
  // Get articles
  server.get('/api/articles', (req, res) => {
    const limit = parseInt(req.query.limit) || 50;
    const offset = parseInt(req.query.offset) || 0;
    
    getArticles(limit, offset, (err, articles) => {
      if (err) {
        res.status(500).json({ error: err.message });
      } else {
        res.json({ articles });
      }
    });
  });
  
  // Get individual article by ID
  server.get('/api/articles/:id', (req, res) => {
    const articleId = parseInt(req.params.id);
    
    if (!db) {
      return res.status(500).json({ error: 'Database not initialized' });
    }
    
    db.get('SELECT * FROM articles WHERE id = ?', [articleId], (err, article) => {
      if (err) {
        res.status(500).json({ error: err.message });
      } else if (!article) {
        res.status(404).json({ error: 'Article not found' });
      } else {
        res.json(article);
      }
    });
  });
  
  // Search articles
  server.get('/api/articles/search', (req, res) => {
    const query = req.query.q;
    if (!query) {
      return res.status(400).json({ error: 'Query parameter "q" is required' });
    }
    
    searchArticles(query, (err, results) => {
      if (err) {
        res.status(500).json({ error: err.message });
      } else {
        res.json({ results });
      }
    });
  });
  
  // Get article statistics
  server.get('/api/articles/stats', (req, res) => {
    getArticleStats((err, stats) => {
      if (err) {
        res.status(500).json({ error: err.message });
      } else {
        res.json(stats);
      }
    });
  });
  
  // Note: Reading library functionality removed, will be revisited
  
  // Analytics functionality removed
  
  // Start HTTP server
  try {
    console.log(`Attempting to start HTTP server on port ${API_PORT}...`);
    
    apiServer = server.listen(API_PORT, '127.0.0.1', () => {
      console.log(`✅ Reading Tracker API server running on http://127.0.0.1:${API_PORT}`);
    });
    
    apiServer.on('error', (err) => {
      console.error('❌ HTTP Server Error:', err);
    });
    
  } catch (error) {
    console.error('❌ Failed to start HTTP server:', error);
  }

  // Start HTTPS server for mixed content compatibility
  try {
    console.log(`Attempting to start HTTPS server on port ${HTTPS_PORT}...`);
    
    // Check if certificate files exist
    const certPath = path.join(__dirname, 'cert.pem');
    const keyPath = path.join(__dirname, 'key.pem');
    
    if (fs.existsSync(certPath) && fs.existsSync(keyPath)) {
      const httpsOptions = {
        key: fs.readFileSync(keyPath),
        cert: fs.readFileSync(certPath)
      };
      
      httpsServer = https.createServer(httpsOptions, server);
      
      httpsServer.listen(HTTPS_PORT, '127.0.0.1', () => {
        console.log(`✅ Reading Tracker HTTPS server running on https://127.0.0.1:${HTTPS_PORT}`);
        console.log('💡 Use HTTPS endpoint for mixed content compatibility');
        
        // Test the HTTPS server
        setTimeout(() => {
          const https = require('https');
          process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'; // Accept self-signed cert
          const req = https.get(`https://127.0.0.1:${HTTPS_PORT}/test`, (res) => {
            console.log('✅ HTTPS self-test successful');
          });
          req.on('error', (err) => {
            console.error('❌ HTTPS self-test failed:', err.message);
          });
        }, 500);
      });
      
      httpsServer.on('error', (err) => {
        console.error('❌ HTTPS Server Error:', err);
      });
      
    } else {
      console.log('⚠️  SSL certificates not found, HTTPS server not started');
      console.log('   For mixed content support, run: openssl req -x509 -newkey rsa:2048 -keyout key.pem -out cert.pem -days 365 -nodes');
    }
    
  } catch (error) {
    console.error('❌ Failed to start HTTPS server:', error);
  }
}

// Article Library Viewer Window
function showArticleLibrary() {
  try {
    console.log('Opening article library...');
    
    const win = new BrowserWindow({
      width: 900,
      height: 700,
      title: '📚 Saved Articles',
      webPreferences: {
        nodeIntegration: true,
        contextIsolation: false
      }
    });

    // Helper function for escaping HTML
    function escapeHtml(text) {
      if (!text) return '';
      return text.replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&#39;');
    }
    
    function formatDate(dateStr) {
      if (!dateStr) return 'Unknown';
      const date = new Date(dateStr);
      return date.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
      });
    }

    // Get articles from database
    getArticles(50, 0, (err, articles) => {
      if (err) {
        console.error('Error fetching articles:', err);
        articles = [];
      }

      const html = `
        <!DOCTYPE html>
        <html>
        <head>
          <title>📚 Saved Articles</title>
          <style>
            body {
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
              margin: 0;
              padding: 20px;
              background-color: #f5f5f5;
              line-height: 1.6;
            }
            .header {
              background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
              color: white;
              padding: 20px;
              border-radius: 12px;
              margin-bottom: 20px;
              text-align: center;
            }
            .header h1 {
              margin: 0;
              font-size: 28px;
              font-weight: 300;
            }
            .stats {
              font-size: 14px;
              opacity: 0.9;
              margin-top: 8px;
            }
            .article-list {
              background: white;
              border-radius: 12px;
              box-shadow: 0 2px 10px rgba(0,0,0,0.1);
              overflow: hidden;
            }
            .article-item {
              padding: 16px 20px;
              border-bottom: 1px solid #e0e0e0;
              cursor: pointer;
              transition: background-color 0.2s;
              display: flex;
              justify-content: space-between;
              align-items: flex-start;
            }
            .article-item:hover {
              background-color: #f8f9fa;
            }
            .article-item:last-child {
              border-bottom: none;
            }
            .article-main {
              flex: 1;
            }
            .article-title {
              font-size: 16px;
              font-weight: 500;
              color: #2c3e50;
              margin-bottom: 4px;
              line-height: 1.4;
            }
            .article-meta {
              font-size: 12px;
              color: #7f8c8d;
              display: flex;
              gap: 12px;
              flex-wrap: wrap;
            }
            .article-actions {
              display: flex;
              gap: 8px;
              margin-left: 16px;
            }
            .btn {
              padding: 6px 12px;
              border: none;
              border-radius: 6px;
              font-size: 12px;
              cursor: pointer;
              transition: background-color 0.2s;
            }
            .btn-primary {
              background-color: #3498db;
              color: white;
            }
            .btn-primary:hover {
              background-color: #2980b9;
            }
            .btn-success {
              background-color: #28a745;
              color: white;
            }
            .btn-success:hover {
              background-color: #218838;
            }
            .btn-outline {
              background-color: white;
              color: #6c757d;
              border: 1px solid #6c757d;
            }
            .btn-outline:hover {
              background-color: #6c757d;
              color: white;
            }
            .empty-state {
              text-align: center;
              padding: 60px 20px;
              color: #7f8c8d;
            }
            .empty-state h2 {
              font-size: 24px;
              margin-bottom: 8px;
              font-weight: 300;
            }
            .tag {
              background-color: #e8f4f8;
              color: #2980b9;
              padding: 2px 6px;
              border-radius: 3px;
              font-size: 10px;
              font-weight: 500;
            }
          </style>
        </head>
        <body>
          <div class="header">
            <h1>📚 Saved Articles</h1>
            <div class="stats">${articles.length} articles saved</div>
          </div>
          
          <div class="article-list">
            ${articles.length === 0 ? `
              <div class="empty-state">
                <h2>No articles saved yet</h2>
                <p>Use the bookmarklet to save articles from any webpage</p>
              </div>
            ` : articles.map(article => `
              <div class="article-item" onclick="openArchivedArticle('${article.archive_path || ''}', '${article.url}')">
                <div class="article-main">
                  <div class="article-title">
                    📚 ${escapeHtml(article.title)}
                    ${article.archive_path ? '<span style="color: #28a745; font-size: 0.8em; margin-left: 8px;">● Archived</span>' : '<span style="color: #ffc107; font-size: 0.8em; margin-left: 8px;">○ Not Archived</span>'}
                  </div>
                  <div class="article-meta">
                    ${article.file_size ? `<span>💾 ${Math.round(article.file_size / 1024)} KB</span>` : ''}
                    <span>📅 ${formatDate(article.saved_at)}</span>
                    ${article.author ? `<span>✍️ ${escapeHtml(article.author)}</span>` : ''}
                    ${article.description ? `<span>📝 ${escapeHtml(article.description.substring(0, 100))}${article.description.length > 100 ? '...' : ''}</span>` : ''}
                  </div>
                </div>
                <div class="article-actions">
                  ${article.archive_path ? 
                    `<button class="btn btn-success" onclick="event.stopPropagation(); openArchivedArticle('${article.archive_path}', '${article.url}')">
                      📚 Read Offline
                    </button>
                    <button class="btn btn-outline" onclick="event.stopPropagation(); openOriginalArticle('${article.url}')">
                      🌐 Original
                    </button>` :
                    `<button class="btn btn-primary" onclick="event.stopPropagation(); openOriginalArticle('${article.url}')">
                      🌐 Open Original
                    </button>`
                  }
                </div>
              </div>
            `).join('')}
          </div>

          <script>
            function openArchivedArticle(archivePath, originalUrl) {
              if (archivePath) {
                const { shell } = require('electron');
                const archiveUrl = \`https://127.0.0.1:3003/archives/\${archivePath}\`;
                shell.openExternal(archiveUrl);
              } else {
                openOriginalArticle(originalUrl);
              }
            }
            
            function openOriginalArticle(url) {
              const { shell } = require('electron');
              shell.openExternal(url);
            }
            
            function escapeHtml(text) {
              if (!text) return '';
              const div = document.createElement('div');
              div.textContent = text;
              return div.innerHTML;
            }
            
            function formatDate(dateStr) {
              if (!dateStr) return 'Unknown';
              const date = new Date(dateStr);
              return date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
            }
          </script>
        </body>
        </html>
      `;

      win.loadURL('data:text/html;charset=UTF-8,' + encodeURIComponent(html));
    });

    win.on('closed', () => {
      console.log('Article library window closed');
    });

  } catch (error) {
    console.error('Error opening article library:', error);
  }
}

// Check if running in server-only mode
if (process.env.NODE_ENV === 'server' || process.argv.includes('--server-only')) {
  console.log('🖥️  Starting in server-only mode...');
  initDatabase(() => {
    console.log('Database initialized, starting API server...');
    initApiServer();
  });
} else {
  // Normal Electron app mode
  app.whenReady().then(() => {
    console.log('App ready, initializing components...');
    initDatabase(() => {
      console.log('Database initialized, starting API server...');
      initApiServer();
    });
    createTray();
  });
}

// Only add Electron event handlers if not in server mode
if (process.env.NODE_ENV !== 'server' && !process.argv.includes('--server-only')) {
  app.on('window-all-closed', (event) => {
    event.preventDefault();
  });
}

// Only hide dock if not in server mode
if (process.env.NODE_ENV !== 'server' && !process.argv.includes('--server-only')) {
  app.dock?.hide();
}