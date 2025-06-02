const { app, Tray, Menu, shell, BrowserWindow } = require('electron');
const axios = require('axios');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();

if (process.env.NODE_ENV === 'development') {
  require('electron-reload')(__dirname, {
    electron: path.join(__dirname, 'node_modules', '.bin', 'electron'),
    hardResetMethod: 'exit'
  });
}

let tray = null;
let db = null;
let currentMenuTemplate = null;

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

async function fetchHNStories() {
  try {
    const topStoriesResponse = await axios.get('https://hacker-news.firebaseio.com/v0/topstories.json');
    const topStoryIds = topStoriesResponse.data.slice(0, 25);
    
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
    
    setInterval(updateMenu, 300000);
    console.log('Tray created successfully');
  } catch (error) {
    console.error('Error creating tray:', error);
  }
}

async function updateMenu() {
  console.log('Updating menu...');
  const stories = await fetchHNStories();
  console.log(`Fetched ${stories.length} stories`);
  
  stories.forEach(story => trackStoryAppearance(story));
  
  currentMenuTemplate = [
    {
      label: '━━━━━━ HACKER NEWS ━━━━━━',
      enabled: false
    },
    { type: 'separator' }
  ];
  
  const storyItems = stories.map(story => ({
    label: `▲${story.points.toString().padStart(4, '\u00A0')}\u00A0\u00A0${story.title.length > 40 ? story.title.substring(0, 37) + '...' : story.title}`,
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