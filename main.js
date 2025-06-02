const { app, Tray, Menu, shell, BrowserWindow, dialog } = require('electron');
const axios = require('axios');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');
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
const CACHE_DURATION = 15 * 60 * 1000; // 15 minutes

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

app.whenReady().then(() => {
  initDatabase();
  createTray();
});

app.on('window-all-closed', (event) => {
  event.preventDefault();
});

app.dock?.hide();