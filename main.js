const { app, Tray, Menu, shell, BrowserWindow, dialog } = require('electron');
const axios = require('axios');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');
const express = require('express');
const cors = require('cors');
const https = require('https');
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

function initDatabase() {
  db = new sqlite3.Database('clicks.db');
  
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
    content TEXT NOT NULL,
    text_content TEXT NOT NULL,
    word_count INTEGER,
    reading_time INTEGER,
    saved_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    tags TEXT,
    notes TEXT
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
  
  // Check if we need to generate fake data
  db.get('SELECT COUNT(*) as count FROM clicks', (err, row) => {
    if (!err && row.count < 100) {
      console.log('Database appears empty, generating fake data...');
      generateFakeData();
    }
  });
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
          updateStatsMenu();
        }
      });
    });
  }
}

function getClickStats(callback) {
  if (db) {
    db.all(`SELECT title, COUNT(*) as click_count 
            FROM clicks 
            GROUP BY story_id, title 
            ORDER BY click_count DESC 
            LIMIT 10`, callback);
  } else {
    callback(null, []);
  }
}

function generateWordCloudData(callback) {
  if (db) {
    db.all(`SELECT title, COUNT(*) as click_count 
            FROM clicks 
            GROUP BY story_id, title 
            ORDER BY click_count DESC
            LIMIT 20`, (err, stats) => {
      if (err) {
        callback(err, null);
        return;
      }

      const titleData = stats.map(stat => [
        stat.title.length > 60 ? stat.title.substring(0, 57) + '...' : stat.title,
        stat.click_count
      ]);

      callback(null, titleData);
    });
  } else {
    callback(null, []);
  }
}

function showWordCloud() {
  generateWordCloudData((err, wordData) => {
    if (err) {
      console.error('Error generating word cloud data:', err);
      return;
    }

    if (wordData.length === 0) {
      shell.beep();
      return;
    }

    const win = new BrowserWindow({
      width: 800,
      height: 600,
      title: 'Click Word Cloud',
      webPreferences: {
        nodeIntegration: true,
        contextIsolation: false
      }
    });

    const html = `
<!DOCTYPE html>
<html>
<head>
    <title>Title Cloud</title>
    <style>
        body { margin: 0; padding: 20px; font-family: Arial, sans-serif; background: #f0f0f0; }
        canvas { border: 1px solid #ccc; background: white; display: block; margin: 0 auto; }
        h1 { text-align: center; color: #333; }
    </style>
</head>
<body>
    <h1>Most Clicked Titles</h1>
    <canvas id="wordcloud" width="950" height="600"></canvas>
    <script>
        const canvas = document.getElementById('wordcloud');
        const ctx = canvas.getContext('2d');
        
        const titles = ${JSON.stringify(wordData)};
        
        function drawTitleCloud() {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            
            const colors = ['#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7', '#DDA0DD', '#98D8C8'];
            
            titles.sort((a, b) => b[1] - a[1]);
            
            const maxClicks = titles[0] ? titles[0][1] : 1;
            let yPos = 50;
            
            titles.forEach(([title, clickCount], index) => {
                const fontSize = Math.max(12, Math.min(36, (clickCount / maxClicks) * 30 + 12));
                ctx.font = 'bold ' + fontSize + 'px Arial';
                ctx.fillStyle = colors[index % colors.length];
                
                const textWidth = ctx.measureText(title).width;
                const x = Math.max(10, (canvas.width - textWidth) / 2);
                
                ctx.shadowColor = 'rgba(0,0,0,0.3)';
                ctx.shadowBlur = 2;
                ctx.shadowOffsetX = 1;
                ctx.shadowOffsetY = 1;
                
                ctx.fillText(title, x, yPos);
                
                ctx.shadowBlur = 0;
                
                ctx.font = '12px Arial';
                ctx.fillStyle = '#666';
                ctx.fillText(clickCount + ' clicks', x + textWidth + 10, yPos - 5);
                
                yPos += fontSize + 15;
                
                if (yPos > canvas.height - 30) return;
            });
        }
        
        drawTitleCloud();
    </script>
</body>
</html>`;

    win.loadURL('data:text/html;charset=UTF-8,' + encodeURIComponent(html));
  });
}

function updateStatsMenu() {
  if (!tray || !currentMenuTemplate) return;
  
  getClickStats((err, stats) => {
    if (err) {
      console.error('Error getting click stats:', err);
      return;
    }

    const statsSubmenu = stats.length > 0 
      ? stats.map(stat => ({
          label: `${stat.title.substring(0, 40)}... (${stat.click_count} clicks)`,
          enabled: false
        }))
      : [{ label: 'No clicks yet', enabled: false }];

    const statsMenuIndex = currentMenuTemplate.findIndex(item => item.label === 'LINK STATS');
    if (statsMenuIndex !== -1) {
      currentMenuTemplate[statsMenuIndex].submenu = statsSubmenu;
      const contextMenu = Menu.buildFromTemplate(currentMenuTemplate);
      tray.setContextMenu(contextMenu);
    }
  });
}

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
      subreddit: child.data.subreddit
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
    return shuffled.slice(0, 25);
      
  } catch (error) {
    console.error('Error fetching Reddit stories:', error);
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
    tray.setToolTip('HN Reader');
    
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
  console.log(`Fetched ${stories.length} HN stories and ${redditStories.length} Reddit stories`);
  
  stories.forEach(story => trackStoryAppearance(story));
  
  currentMenuTemplate = [
    {
      label: '━━━━━━ HACKER NEWS ━━━━━━',
      enabled: false
    },
    { type: 'separator' }
  ];
  
  // Calculate max points width across both HN and Reddit for consistent alignment
  const allStories = [...stories, ...redditStories];
  const maxPoints = Math.max(...allStories.map(s => s.points));
  const pointsWidth = Math.max(4, maxPoints.toString().length);

  const storyItems = stories.map(story => ({
    label: `▲${story.points.toString().padStart(pointsWidth, '\u00A0')}\u00A0\u00A0${story.title.length > 75 ? story.title.substring(0, 72) + '...' : story.title}`,
    click: () => {
      const url = `https://news.ycombinator.com/item?id=${story.id}`;
      trackClick(story.id, story.title, url, story.points, story.comments);
      shell.openExternal(url);
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
    label: `▲${story.points.toString().padStart(pointsWidth, '\u00A0')}\u00A0\u00A0${story.title.length > 75 ? story.title.substring(0, 72) + '...' : story.title}`,
    click: () => {
      trackClick(story.id, story.title, story.url, story.points, story.comments);
      shell.openExternal(story.url);
    }
  }));
  
  currentMenuTemplate.push(...redditStoryItems);
  
  currentMenuTemplate.push(
    { type: 'separator' },
    {
      label: 'LINK STATS',
      submenu: [
        {
          label: 'Loading stats...',
          enabled: false
        }
      ]
    },
    {
      label: 'WORD CLOUD',
      click: showWordCloud
    },
    {
      label: 'READING LIBRARY',
      click: showArticleLibrary
    },
    {
      label: 'Refresh',
      click: updateMenu
    },
    {
      label: 'Quit',
      click: () => {
        app.quit();
      }
    }
  );

  getClickStats((err, stats) => {
    if (err) {
      console.error('Error getting click stats:', err);
      return;
    }

    const statsSubmenu = stats.length > 0 
      ? stats.map(stat => ({
          label: `${stat.title.substring(0, 40)}... (${stat.click_count} clicks)`,
          enabled: false
        }))
      : [{ label: 'No clicks yet', enabled: false }];

    const statsMenuIndex = currentMenuTemplate.findIndex(item => item.label === 'LINK STATS');
    if (statsMenuIndex !== -1) {
      currentMenuTemplate[statsMenuIndex].submenu = statsSubmenu;
      const contextMenu = Menu.buildFromTemplate(currentMenuTemplate);
      tray.setContextMenu(contextMenu);
    }
  });
  
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
  
  // Save article from Safari extension
  server.post('/api/articles', (req, res) => {
    console.log('API: Saving article from Safari extension');
    
    saveArticle(req.body, (err, result) => {
      if (err) {
        console.error('API: Error saving article:', err);
        res.status(500).json({ error: err.message });
      } else {
        res.json(result);
      }
    });
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
  
  // Open specific views in the app
  server.post('/api/open/library', (req, res) => {
    showArticleLibrary();
    res.json({ message: 'Library opened' });
  });
  
  server.post('/api/open/analytics', (req, res) => {
    showWordCloud();
    res.json({ message: 'Analytics opened' });
  });
  
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

function showArticleLibrary() {
  const win = new BrowserWindow({
    width: 1000,
    height: 700,
    title: 'Reading Library',
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });

  const html = `
<!DOCTYPE html>
<html>
<head>
    <title>Reading Library</title>
    <style>
        body { 
          margin: 0; 
          padding: 20px; 
          font-family: -apple-system, BlinkMacSystemFont, sans-serif; 
          background: #f8f9fa; 
        }
        .header {
          background: white;
          padding: 20px;
          border-radius: 8px;
          margin-bottom: 20px;
          box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }
        .search-box {
          width: 100%;
          padding: 12px;
          font-size: 16px;
          border: 1px solid #ddd;
          border-radius: 6px;
          margin-bottom: 15px;
        }
        .article {
          background: white;
          padding: 20px;
          margin-bottom: 15px;
          border-radius: 8px;
          box-shadow: 0 2px 4px rgba(0,0,0,0.1);
          cursor: pointer;
          transition: transform 0.2s ease;
        }
        .article:hover {
          transform: translateY(-2px);
        }
        .article-title {
          font-size: 18px;
          font-weight: 600;
          margin-bottom: 8px;
          color: #333;
        }
        .article-meta {
          font-size: 14px;
          color: #666;
          margin-bottom: 10px;
        }
        .article-excerpt {
          font-size: 14px;
          line-height: 1.6;
          color: #555;
        }
        .loading {
          text-align: center;
          padding: 40px;
          color: #666;
        }
    </style>
</head>
<body>
    <div class="header">
        <h1>📚 Reading Library</h1>
        <input type="text" class="search-box" id="searchBox" placeholder="Search your saved articles...">
        <div id="stats"></div>
    </div>
    <div id="articles" class="loading">Loading articles...</div>
    
    <script>
        let allArticles = [];
        
        async function loadArticles() {
            try {
                const response = await fetch('http://127.0.0.1:3002/api/articles');
                const data = await response.json();
                allArticles = data.articles || [];
                displayArticles(allArticles);
                loadStats();
            } catch (error) {
                document.getElementById('articles').innerHTML = '<div style="text-align: center; color: red;">Error loading articles</div>';
            }
        }
        
        async function loadStats() {
            try {
                const response = await fetch('http://127.0.0.1:3002/api/articles/stats');
                const stats = await response.json();
                document.getElementById('stats').innerHTML = 
                  \`Total: \${stats.total_articles} articles • \${Math.round(stats.total_words/1000)}k words • Avg: \${Math.round(stats.avg_words)} words/article\`;
            } catch (error) {
                console.error('Error loading stats:', error);
            }
        }
        
        function displayArticles(articles) {
            const container = document.getElementById('articles');
            if (articles.length === 0) {
                container.innerHTML = '<div style="text-align: center; color: #666;">No articles found</div>';
                return;
            }
            
            container.innerHTML = articles.map(article => \`
                <div class="article" onclick="openArticle(\${article.id})">
                    <div class="article-title">\${escapeHtml(article.title)}</div>
                    <div class="article-meta">
                        \${article.author ? \`By \${escapeHtml(article.author)} • \` : ''}
                        \${new Date(article.saved_at).toLocaleDateString()} • 
                        \${article.word_count || 0} words
                    </div>
                    <div class="article-excerpt">\${escapeHtml((article.text_content || '').substring(0, 200))}...</div>
                    <div class="article-footer" style="margin-top: 8px; display: flex; justify-content: space-between; align-items: center;">
                        <small style="color: #999;">📚 Saved Content</small>
                        <a href="\${article.url}" target="_blank" rel="noopener noreferrer"
                           onclick="event.stopPropagation();" 
                           style="color: #007aff; text-decoration: none; font-size: 12px;">🔗 Original</a>
                    </div>
                </div>
            \`).join('');
        }
        
        function escapeHtml(text) {
            const div = document.createElement('div');
            div.textContent = text;
            return div.innerHTML;
        }
        
        function openArticle(articleId) {
            // Open the saved article content in a new window instead of external URL
            fetch(\`http://127.0.0.1:3002/api/articles/\${articleId}\`)
                .then(response => response.json())
                .then(article => {
                    if (article) {
                        showSavedArticle(article);
                    }
                })
                .catch(error => {
                    console.error('Error loading article:', error);
                });
        }
        
        function showSavedArticle(article) {
            // Since we're in the renderer process, we'll create a new window using window.open
            // and populate it with our article content
                
            // Create a clean article view HTML
            const articleHTML = \`
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <title>\${escapeHtml(article.title)}</title>
    <style>
        body {
            max-width: 700px;
            margin: 0 auto;
            padding: 40px 20px;
            font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Text', system-ui, sans-serif;
            line-height: 1.6;
            color: #333;
            background: #fff;
        }
        .article-header {
            border-bottom: 1px solid #eee;
            padding-bottom: 20px;
            margin-bottom: 30px;
        }
        .article-title {
            font-size: 28px;
            font-weight: 700;
            line-height: 1.3;
            margin: 0 0 15px 0;
            color: #1a1a1a;
        }
        .article-meta {
            color: #666;
            font-size: 14px;
            display: flex;
            gap: 15px;
            flex-wrap: wrap;
        }
        .article-content {
            font-size: 16px;
            line-height: 1.7;
        }
        .article-content h1, .article-content h2, .article-content h3 {
            margin-top: 30px;
            margin-bottom: 15px;
            color: #1a1a1a;
        }
        .article-content h1 { font-size: 24px; }
        .article-content h2 { font-size: 20px; }
        .article-content h3 { font-size: 18px; }
        .article-content p {
            margin-bottom: 16px;
        }
        .article-content img {
            max-width: 100%;
            height: auto;
            margin: 20px 0;
            border-radius: 4px;
        }
        .article-content blockquote {
            border-left: 3px solid #007aff;
            margin: 20px 0;
            padding-left: 20px;
            color: #555;
            font-style: italic;
        }
        .article-content code {
            background: #f5f5f5;
            padding: 2px 6px;
            border-radius: 3px;
            font-family: Monaco, monospace;
            font-size: 14px;
        }
        .article-content pre {
            background: #f8f9fa;
            padding: 15px;
            border-radius: 5px;
            overflow-x: auto;
            font-size: 14px;
        }
        .original-link {
            margin-top: 40px;
            padding-top: 20px;
            border-top: 1px solid #eee;
            text-align: center;
        }
        .original-link a {
            color: #007aff;
            text-decoration: none;
            font-size: 14px;
        }
        .original-link a:hover {
            text-decoration: underline;
        }
        .saved-indicator {
            background: #e8f5e8;
            color: #2d5a2d;
            padding: 8px 12px;
            border-radius: 4px;
            font-size: 12px;
            font-weight: 500;
            display: inline-block;
            margin-bottom: 20px;
        }
    </style>
</head>
<body>
    <div class="saved-indicator">📚 Saved Article • Reading Tracker</div>
    
    <div class="article-header">
        <h1 class="article-title">\${escapeHtml(article.title)}</h1>
        <div class="article-meta">
            \${article.author ? \`<span>By \${escapeHtml(article.author)}</span>\` : ''}
            \${article.publish_date ? \`<span>\${new Date(article.publish_date).toLocaleDateString()}</span>\` : ''}
            <span>Saved \${new Date(article.saved_at).toLocaleDateString()}</span>
            <span>\${article.word_count || 0} words</span>
            \${article.reading_time ? \`<span>\${Math.round(article.reading_time / 1000)}s reading time</span>\` : ''}
        </div>
    </div>
    
    <div class="article-content">
        \${article.content}
    </div>
    
    <div class="original-link">
        <a href="\${article.url}" target="_blank" rel="noopener noreferrer">
            📎 View Original Source
        </a>
    </div>
    
    <script>
        function escapeHtml(text) {
            const div = document.createElement('div');
            div.textContent = text;
            return div.innerHTML;
        }
        
        // Clean up any potentially problematic scripts in the saved content
        document.querySelectorAll('script').forEach(script => {
            if (!script.textContent.includes('escapeHtml')) {
                script.remove();
            }
        });
        
        // Make all external links open in new tabs
        document.querySelectorAll('a[href^="http"]').forEach(link => {
            link.target = '_blank';
            link.rel = 'noopener noreferrer';
        });
        
        // Add click handler for relative links to open in original domain
        document.querySelectorAll('a[href^="/"], a[href^="../"], a[href^="./"]').forEach(link => {
            const originalDomain = new URL('\${article.url}').origin;
            const absoluteUrl = new URL(link.href, originalDomain).href;
            link.href = absoluteUrl;
            link.target = '_blank';
            link.rel = 'noopener noreferrer';
        });
    </script>
</body>
</html>\`;

            // Create a new window with the article content
            const newWin = window.open('', '_blank', 'width=800,height=900,scrollbars=yes,resizable=yes');
            if (newWin) {
                newWin.document.write(articleHTML);
                newWin.document.close();
                newWin.focus();
            } else {
                // Fallback: if popup blocked, show in current window
                document.body.innerHTML = articleHTML;
            }
        }
        
        document.getElementById('searchBox').addEventListener('input', async (e) => {
            const query = e.target.value.trim();
            if (query) {
                try {
                    const response = await fetch(\`http://127.0.0.1:3002/api/articles/search?q=\${encodeURIComponent(query)}\`);
                    const data = await response.json();
                    displayArticles(data.results || []);
                } catch (error) {
                    console.error('Search error:', error);
                }
            } else {
                displayArticles(allArticles);
            }
        });
        
        loadArticles();
    </script>
</body>
</html>`;

  win.loadURL('data:text/html;charset=UTF-8,' + encodeURIComponent(html));
}

app.whenReady().then(() => {
  console.log('App ready, initializing components...');
  initDatabase();
  setTimeout(() => {
    console.log('Starting API server after database init...');
    initApiServer();
  }, 1000);
  createTray();
});

app.on('window-all-closed', (event) => {
  event.preventDefault();
});

app.dock?.hide();