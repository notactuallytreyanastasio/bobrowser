/**
 * UI windows and dialogs
 */

const { BrowserWindow, shell } = require('electron');
const { addTagToStory, getArticles, trackSavedArticleClick, getDatabase } = require('./database');

/**
 * Show custom tag input dialog
 */
function promptForCustomTag(storyId, storyTitle) {
  // Create a simple HTML form for tag input
  const tagInputWindow = new BrowserWindow({
    width: 400,
    height: 200,
    title: 'Add Custom Tag',
    resizable: false,
    alwaysOnTop: true,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <title>Add Custom Tag</title>
      <style>
        body {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
          padding: 20px;
          margin: 0;
          background: #f8f9fa;
        }
        .container {
          background: white;
          padding: 20px;
          border-radius: 8px;
          box-shadow: 0 2px 10px rgba(0,0,0,0.1);
        }
        h3 {
          margin: 0 0 15px 0;
          color: #333;
        }
        .story-title {
          font-size: 12px;
          color: #666;
          margin-bottom: 15px;
          font-style: italic;
        }
        input[type="text"] {
          width: 100%;
          padding: 8px 12px;
          border: 2px solid #ddd;
          border-radius: 4px;
          font-size: 14px;
          margin-bottom: 15px;
          box-sizing: border-box;
        }
        input[type="text"]:focus {
          outline: none;
          border-color: #007bff;
        }
        .buttons {
          display: flex;
          gap: 10px;
          justify-content: flex-end;
        }
        button {
          padding: 8px 16px;
          border: 1px solid #ddd;
          border-radius: 4px;
          background: white;
          cursor: pointer;
          font-size: 14px;
        }
        .btn-primary {
          background: #007bff;
          color: white;
          border-color: #007bff;
        }
        .btn-primary:hover {
          background: #0056b3;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <h3>Add Custom Tag</h3>
        <div class="story-title">${storyTitle}</div>
        <input type="text" id="tagInput" placeholder="Enter tag name..." autocomplete="off">
        <div class="buttons">
          <button onclick="window.close()">Cancel</button>
          <button class="btn-primary" onclick="addTag()">Add Tag</button>
        </div>
      </div>
      
      <script>
        const { ipcRenderer } = require('electron');
        
        function addTag() {
          const tagInput = document.getElementById('tagInput');
          const tag = tagInput.value.trim();
          
          if (tag) {
            ipcRenderer.send('add-custom-tag', ${storyId}, tag);
            window.close();
          }
        }
        
        // Focus input and allow Enter key
        document.addEventListener('DOMContentLoaded', () => {
          const input = document.getElementById('tagInput');
          input.focus();
          
          input.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
              addTag();
            }
          });
        });
      </script>
    </body>
    </html>
  `;

  tagInputWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
  
  // Handle the custom tag addition
  const { ipcMain } = require('electron');
  ipcMain.removeAllListeners('add-custom-tag'); // Remove previous listeners
  ipcMain.on('add-custom-tag', (event, storyId, tag) => {
    // Track engagement when user adds custom tag
    const { trackEngagement } = require('./database');
    let source = 'unknown';
    // Try to determine source - this is a best guess
    if (storyTitle && storyTitle.includes('reddit')) source = 'reddit';
    else if (typeof storyId === 'number') source = 'hn';
    else source = 'pinboard';
    
    trackEngagement(storyId, source);
    addTagToStory(storyId, tag);
    tagInputWindow.close();
    // Refresh the menu after adding the tag
    const { updateMenu } = require('./menu');
    setTimeout(updateMenu, 100);
  });
}

/**
 * Show the article library window with saved articles
 */
function showArticleLibrary() {
  try {
    
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
            <h1>🗃️ Article Archive</h1>
            <div class="stats">${articles.length} articles archived • ${articles.filter(a => a.archive_path).length} offline ready</div>
          </div>
          
          <div class="archive-form" style="
            background: white;
            padding: 20px;
            margin-bottom: 20px;
            border-radius: 12px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
          ">
            <h3 style="margin-top: 0;">Archive New Article</h3>
            <div style="display: flex; gap: 10px;">
              <input type="url" id="urlInput" placeholder="Enter URL to archive..." style="
                flex: 1;
                padding: 12px;
                border: 2px solid #e0e0e0;
                border-radius: 8px;
                font-size: 14px;
              ">
              <button onclick="archiveUrl()" style="
                padding: 12px 20px;
                background: #28a745;
                color: white;
                border: none;
                border-radius: 8px;
                font-size: 14px;
                cursor: pointer;
                white-space: nowrap;
              ">🗃️ Archive</button>
            </div>
            <div id="archiveStatus" style="margin-top: 10px; font-size: 14px;"></div>
          </div>
          
          <div class="article-list">
            ${articles.length === 0 ? `
              <div class="empty-state">
                <h2>No articles archived yet</h2>
                <p>Enter a URL above to archive your first article for offline reading</p>
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
                const archiveUrl = \`http://127.0.0.1:3002/archives/\${archivePath}\`;
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
            
            async function archiveUrl() {
              const urlInput = document.getElementById('urlInput');
              const statusDiv = document.getElementById('archiveStatus');
              const url = urlInput.value.trim();
              
              if (!url) {
                statusDiv.innerHTML = '<span style="color: #dc3545;">❌ Please enter a URL</span>';
                return;
              }
              
              if (!url.startsWith('http://') && !url.startsWith('https://')) {
                statusDiv.innerHTML = '<span style="color: #dc3545;">❌ URL must start with http:// or https://</span>';
                return;
              }
              
              statusDiv.innerHTML = '<span style="color: #007bff;">🗃️ Archiving... This may take a few seconds</span>';
              
              try {
                // Use the HTTP endpoint instead of HTTPS from within Electron
                const response = await fetch('http://127.0.0.1:3002/api/articles', {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json',
                  },
                  body: JSON.stringify({
                    url: url,
                    title: 'Untitled'
                  })
                });
                
                const result = await response.json();
                
                if (result.success) {
                  statusDiv.innerHTML = \`<span style="color: #28a745;">✅ Successfully archived "\${result.title}"</span>\`;
                  urlInput.value = '';
                  
                  // Reload the page after 2 seconds to show the new article
                  setTimeout(() => {
                    location.reload();
                  }, 2000);
                } else {
                  statusDiv.innerHTML = \`<span style="color: #dc3545;">❌ Failed to archive: \${result.error || 'Unknown error'}</span>\`;
                }
              } catch (error) {
                console.error('Archive error:', error);
                statusDiv.innerHTML = \`<span style="color: #dc3545;">❌ Network error: \${error.message}</span>\`;
              }
            }
            
            // Allow Enter key to trigger archiving
            document.addEventListener('DOMContentLoaded', function() {
              document.getElementById('urlInput').addEventListener('keypress', function(e) {
                if (e.key === 'Enter') {
                  archiveUrl();
                }
              });
            });
          </script>
        </body>
        </html>
      `;

      win.loadURL('data:text/html;charset=UTF-8,' + encodeURIComponent(html));
    });

    win.on('closed', () => {});

  } catch (error) {
    console.error('Error opening article library:', error);
  }
}

/**
 * Show tag search input dialog
 */
function promptForTagSearch(callback) {
  const searchWindow = new BrowserWindow({
    width: 500,
    height: 150,
    title: 'Search Stories by Tags',
    resizable: false,
    alwaysOnTop: true,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <title>Search Stories by Tags</title>
      <style>
        body {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
          padding: 20px;
          margin: 0;
          background: #f8f9fa;
        }
        .container {
          background: white;
          padding: 20px;
          border-radius: 8px;
          box-shadow: 0 2px 10px rgba(0,0,0,0.1);
        }
        h3 {
          margin: 0 0 15px 0;
          color: #333;
        }
        .help-text {
          font-size: 12px;
          color: #666;
          margin-bottom: 15px;
        }
        input[type="text"] {
          width: 100%;
          padding: 12px;
          border: 2px solid #ddd;
          border-radius: 6px;
          font-size: 14px;
          margin-bottom: 15px;
          box-sizing: border-box;
        }
        input[type="text"]:focus {
          outline: none;
          border-color: #007bff;
        }
        .buttons {
          display: flex;
          gap: 10px;
          justify-content: flex-end;
        }
        button {
          padding: 10px 20px;
          border: 1px solid #ddd;
          border-radius: 6px;
          background: white;
          cursor: pointer;
          font-size: 14px;
        }
        .btn-primary {
          background: #007bff;
          color: white;
          border-color: #007bff;
        }
        .btn-primary:hover {
          background: #0056b3;
        }
        .btn-secondary {
          background: #6c757d;
          color: white;
          border-color: #6c757d;
        }
        .btn-secondary:hover {
          background: #545b62;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <h3>🔍 Search Stories by Tags</h3>
        <div class="help-text">Enter comma-separated tags (e.g., "tech,ai" or "programming,business")</div>
        <input type="text" id="searchInput" placeholder="tech,food,programming..." autocomplete="off">
        <div class="buttons">
          <button onclick="clearSearch()">Clear Search</button>
          <button onclick="window.close()">Cancel</button>
          <button class="btn-primary" onclick="doSearch()">Search</button>
        </div>
      </div>
      
      <script>
        const { ipcRenderer } = require('electron');
        
        function doSearch() {
          const searchInput = document.getElementById('searchInput');
          const query = searchInput.value.trim();
          
          ipcRenderer.send('tag-search', query);
          window.close();
        }
        
        function clearSearch() {
          ipcRenderer.send('tag-search', '');
          window.close();
        }
        
        // Focus input and allow Enter key
        document.addEventListener('DOMContentLoaded', () => {
          const input = document.getElementById('searchInput');
          input.focus();
          
          input.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
              doSearch();
            }
          });
        });
      </script>
    </body>
    </html>
  `;

  searchWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
  
  // Handle the search
  const { ipcMain } = require('electron');
  ipcMain.removeAllListeners('tag-search'); // Remove previous listeners
  ipcMain.on('tag-search', (event, query) => {
    callback(query);
    searchWindow.close();
  });
}

/**
 * Show database browser window with click history
 */
function showDatabaseBrowser() {
  try {
    console.log('showDatabaseBrowser: Starting...');
    
    const win = new BrowserWindow({
      width: 1400,
      height: 900,
      title: '🗄️ Database Browser',
      webPreferences: {
        nodeIntegration: true,
        contextIsolation: false
      }
    });

    const db = getDatabase();
    console.log('Database object:', db ? 'exists' : 'null');
    if (!db) {
      console.error('Database not initialized');
      win.loadURL('data:text/html,<h1>Database Error</h1><p>Database not initialized</p>');
      return;
    }

    // Load the enhanced database browser interface
    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>🗄️ Database Browser</title>
        <style>
          body { 
            font-family: system-ui, sans-serif;
            margin: 0; 
            padding: 8px; 
            background: #fff;
            font-size: 12px;
          }
          .controls {
            display: flex;
            gap: 8px;
            margin-bottom: 8px;
            padding: 8px;
            background: #f5f5f5;
            border-radius: 4px;
          }
          .filters {
            display: flex;
            gap: 6px;
            margin-bottom: 12px;
            padding: 6px 8px;
            background: #f0f0f0;
            border-radius: 4px;
          }
          .btn {
            background: #666;
            color: white;
            border: none;
            padding: 4px 8px;
            border-radius: 2px;
            cursor: pointer;
            font-size: 9px;
            font-weight: 500;
            text-transform: uppercase;
          }
          .btn:hover {
            background: #555;
          }
          .btn.active {
            background: #333;
          }
          .filter-btn {
            background: #666;
            color: white;
            border: none;
            padding: 4px 8px;
            border-radius: 2px;
            cursor: pointer;
            font-size: 9px;
            font-weight: 500;
            text-transform: uppercase;
          }
          .filter-btn:hover {
            background: #555;
          }
          .filter-btn.active {
            background: #333;
          }
          .source-filters {
            display: flex;
            gap: 6px;
            margin-bottom: 12px;
            padding: 6px 8px;
            background: #f0f0f0;
            border-radius: 4px;
          }
          .source-btn {
            background: #666;
            color: white;
            border: none;
            padding: 4px 8px;
            border-radius: 2px;
            cursor: pointer;
            font-size: 9px;
            font-weight: 500;
            text-transform: uppercase;
          }
          .source-btn:hover {
            background: #555;
          }
          .source-btn.active {
            background: #333;
          }
          .loading {
            padding: 20px;
            text-align: left;
            color: #666;
            font-size: 12px;
          }
          table {
            width: 100%;
            border-collapse: collapse;
            font-size: 11px;
          }
          th {
            background: #f0f0f0;
            padding: 6px 8px;
            text-align: left;
            font-weight: 600;
            color: #333;
            border-bottom: 1px solid #ddd;
            font-size: 10px;
            text-transform: uppercase;
          }
          td {
            padding: 4px 8px;
            border-bottom: 1px solid #eee;
            vertical-align: top;
            text-align: left;
          }
          tr:hover {
            background-color: #f9f9f9;
          }
          .title-link {
            color: #0066cc;
            text-decoration: none;
            font-weight: 500;
            display: inline;
          }
          .title-link:hover {
            text-decoration: underline;
          }
          .title-link.viewed {
            color: #666;
          }
          .title-link.engaged {
            color: #ff6b35;
          }
          .comments-link {
            color: #888;
            text-decoration: none;
            font-size: 10px;
            margin-left: 6px;
            display: inline;
          }
          .comments-link:hover {
            text-decoration: underline;
          }
          .source-badge {
            display: inline-block;
            padding: 2px 4px;
            border-radius: 2px;
            font-size: 9px;
            font-weight: bold;
            text-transform: uppercase;
            color: white;
          }
          .source-hn { background: #ff6600; }
          .source-reddit { background: #ff4500; }
          .source-pinboard { background: #0066cc; }
          .source-unknown { background: #666; }
          .meta {
            font-size: 10px;
            color: #666;
          }
          .stats {
            display: flex;
            gap: 4px;
            font-size: 9px;
            flex-wrap: wrap;
          }
          .stat {
            background: #e3f2fd;
            color: #1976d2;
            padding: 1px 3px;
            border-radius: 2px;
            font-weight: 500;
          }
          .empty-state {
            padding: 30px;
            text-align: left;
            color: #666;
            font-size: 12px;
          }
          .tags-section {
            margin-bottom: 12px;
            padding: 6px 8px;
            background: #f8f8f8;
            border-radius: 4px;
            border-top: 1px solid #e0e0e0;
          }
          .tags-header {
            font-size: 10px;
            font-weight: 600;
            color: #666;
            margin-bottom: 4px;
            text-transform: uppercase;
          }
          .tags-container {
            display: flex;
            flex-wrap: wrap;
            gap: 3px;
          }
          .tag-item {
            background: #e8e8e8;
            color: #444;
            padding: 2px 5px;
            border-radius: 2px;
            font-size: 8px;
            font-weight: 500;
            cursor: pointer;
            border: 1px solid #ddd;
          }
          .tag-item:hover {
            background: #d0d0d0;
            border-color: #bbb;
          }
          .tag-count {
            color: #666;
            font-weight: normal;
          }
        </style>
      </head>
      <body>
        <div class="controls">
          <button class="btn" onclick="loadBagOfLinks()">💎 Gems</button>
          <button class="btn" onclick="loadUnread()">📖 Unread</button>
          <button class="btn" onclick="loadRecent()">🕒 Recent</button>
          <button class="btn" onclick="loadAll()">📋 All</button>
        </div>
        
        <div class="filters">
          <button class="filter-btn" onclick="filterByDays(1)">1 DAY</button>
          <button class="filter-btn" onclick="filterByDays(7)">1 WEEK</button>
          <button class="filter-btn" onclick="filterByDays(30)">1 MONTH</button>
          <button class="filter-btn active" onclick="clearFilters()">ALL TIME</button>
        </div>
        
        <div class="source-filters">
          <button class="source-btn" onclick="filterBySource('reddit')">REDDIT</button>
          <button class="source-btn" onclick="filterBySource('hn')">HN</button>
          <button class="source-btn" onclick="filterBySource('pinboard')">PINBOARD</button>
          <button class="source-btn active" onclick="clearSourceFilter()">ALL SOURCES</button>
        </div>
        
        <div class="tags-section">
          <div class="tags-header">All Tags</div>
          <div id="tagsContainer" class="tags-container">
            <div class="loading" style="font-size: 8px; color: #999;">Loading tags...</div>
          </div>
        </div>
        
        <div id="results" class="loading">
          Loading 25 random unclicked links from the past week...
        </div>

        <script>
          const { shell } = require('electron');
          
          let currentLinks = []; // Store current results for filtering
          let currentTitle = ''; // Store current result set title
          
          // Load tags and discover view when page loads
          window.addEventListener('DOMContentLoaded', () => {
            loadTags();
            loadDiscover();
          });
          
          function openLink(url, storyId, source, title) {
            if (url) {
              // Check if this link has been clicked before by looking at the current link data
              const linkData = currentLinks.find(link => link.url === url);
              
              if (linkData && !linkData.viewed && linkData.total_clicks === 0) {
                // This is an unclicked link - trigger Claude tagging
                console.log('Triggering Claude tagging for unclicked link:', title);
                
                // Send IPC message to main process to show Claude tagging window
                const { ipcRenderer } = require('electron');
                ipcRenderer.send('show-claude-tags', {
                  storyId: storyId || linkData.story_id,
                  title: title || linkData.title,
                  url: url,
                  source: source || linkData.source
                });
              }
              
              // Track the click in the database
              trackLinkClick(url, storyId, source);
              
              // Open the link
              shell.openExternal(url);
            }
          }
          
          function trackLinkClick(url, storyId, source) {
            // Send click tracking to the API server
            fetch('http://127.0.0.1:3002/api/database/track-click', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                url: url,
                storyId: storyId,
                source: source,
                clickType: 'article'
              })
            }).catch(err => console.error('Error tracking click:', err));
          }
          
          function truncateTitle(title, maxLength = 100) {
            if (!title) return 'Untitled';
            return title.length > maxLength ? title.substring(0, maxLength) + '...' : title;
          }
          
          function formatDate(dateStr) {
            if (!dateStr) return 'Unknown';
            return new Date(dateStr).toLocaleDateString('en-US', {
              year: 'numeric',
              month: 'short',
              day: 'numeric',
              hour: '2-digit',
              minute: '2-digit'
            });
          }
          
          function setActiveButton(activeBtn) {
            document.querySelectorAll('.btn').forEach(btn => {
              btn.classList.remove('active');
            });
            activeBtn.classList.add('active');
          }
          
          function renderResults(links, title) {
            const resultsDiv = document.getElementById('results');
            
            // Store current results for filtering
            currentLinks = links;
            currentTitle = title;
            
            if (links.length === 0) {
              resultsDiv.innerHTML = \`
                <div class="empty-state">
                  No \${title.toLowerCase()} found
                </div>
              \`;
              return;
            }
            
            const tableHtml = \`
              <table>
                <thead>
                  <tr>
                    <th>Title</th>
                    <th>Source</th>
                    <th>Stats</th>
                    <th>Last Seen</th>
                  </tr>
                </thead>
                <tbody>
                  \${links.map(link => {
                    const sourceClass = 'source-' + (link.source || 'unknown');
                    const titleClass = link.viewed ? 'viewed' : (link.engaged ? 'engaged' : '');
                    const hasComments = link.comments_url && link.comments_url !== link.url;
                    
                    return \`
                      <tr>
                        <td>
                          <a href="#" onclick="openLink('\${link.url}', '\${link.story_id}', '\${link.source}', '\${link.title.replace(/'/g, "\\'")}')\" class="title-link \${titleClass}">
                            \${truncateTitle(link.title)}
                          </a>
                          \${hasComments ? \`<a href="#" onclick="openLink('\${link.comments_url}', '\${link.story_id}', '\${link.source}', '\${link.title.replace(/'/g, "\\'")}')\" class="comments-link">[comments]</a>\` : ''}
                        </td>
                        <td>
                          <span class="source-badge \${sourceClass}">\${link.source || 'unknown'}</span>
                        </td>
                        <td>
                          <div class="stats">
                            \${link.total_clicks > 0 ? \`<span class="stat">\${link.total_clicks} clicks</span>\` : ''}
                            \${link.engagement_count > 0 ? \`<span class="stat">\${link.engagement_count} engaged</span>\` : ''}
                            \${link.times_appeared > 1 ? \`<span class="stat">seen \${link.times_appeared}x</span>\` : ''}
                            \${link.points ? \`<span class="stat">\${link.points} pts</span>\` : ''}
                          </div>
                        </td>
                        <td>
                          <div class="meta">\${formatDate(link.last_seen_at)}</div>
                        </td>
                      </tr>
                    \`;
                  }).join('')}
                </tbody>
              </table>
            \`;
            
            resultsDiv.innerHTML = tableHtml;
          }
          
          function showLoading() {
            document.getElementById('results').innerHTML = '<div class="loading">Loading...</div>';
          }
          
          async function fetchData(endpoint) {
            try {
              const response = await fetch('http://127.0.0.1:3002' + endpoint);
              if (!response.ok) {
                throw new Error(\`HTTP \${response.status}: \${response.statusText}\`);
              }
              const data = await response.json();
              return data.links || [];
            } catch (error) {
              console.error('Fetch error:', error);
              document.getElementById('results').innerHTML = \`<div class="loading">Error: \${error.message}</div>\`;
              return [];
            }
          }
          
          async function loadTags() {
            try {
              const response = await fetch('http://127.0.0.1:3002/api/database/tags');
              if (!response.ok) {
                throw new Error(\`HTTP \${response.status}: \${response.statusText}\`);
              }
              const data = await response.json();
              renderTags(data.tags || []);
            } catch (error) {
              console.error('Tags fetch error:', error);
              document.getElementById('tagsContainer').innerHTML = \`<div class="loading" style="font-size: 8px; color: #999;">Error loading tags</div>\`;
            }
          }
          
          function renderTags(tags) {
            const container = document.getElementById('tagsContainer');
            
            if (tags.length === 0) {
              container.innerHTML = \`<div class="loading" style="font-size: 8px; color: #999;">No tags found</div>\`;
              return;
            }
            
            const tagsHtml = tags.map(tagData => \`
              <div class="tag-item" onclick="filterByTag('\${tagData.tag}')">
                \${tagData.tag} <span class="tag-count">(\${tagData.count})</span>
              </div>
            \`).join('');
            
            container.innerHTML = tagsHtml;
          }
          
          function filterByTag(tag) {
            // For now, just show an alert - you could implement tag filtering here
            alert(\`Filtering by tag: \${tag}\`);
          }
          
          async function loadBagOfLinks() {
            setActiveButton(event.target);
            showLoading();
            const links = await fetchData('/api/database/bag-of-links');
            renderResults(links, 'Hidden Gems');
          }
          
          async function loadUnread() {
            setActiveButton(event.target);
            showLoading();
            const links = await fetchData('/api/database/unread');
            renderResults(links, 'Unread Stories');
          }
          
          async function loadRecent() {
            setActiveButton(event.target);
            showLoading();
            const links = await fetchData('/api/database/recent');
            renderResults(links, 'Recently Clicked');
          }
          
          async function loadAll() {
            setActiveButton(event.target);
            showLoading();
            const links = await fetchData('/api/database/all');
            renderResults(links, 'All Links');
          }
          
          async function loadDiscover() {
            showLoading();
            const links = await fetchData('/api/database/discover');
            renderResults(links, '25 Random Unclicked Links (Past Week)');
          }
          
          function setActiveFilter(activeBtn) {
            document.querySelectorAll('.filter-btn').forEach(btn => {
              btn.classList.remove('active');
            });
            activeBtn.classList.add('active');
          }
          
          function filterByDays(days) {
            setActiveFilter(event.target);
            
            if (currentLinks.length === 0) {
              return; // No data to filter
            }
            
            const cutoffDate = new Date();
            cutoffDate.setDate(cutoffDate.getDate() - days);
            
            const filteredLinks = currentLinks.filter(link => {
              // Use last_seen_at as the primary date, fallback to first_seen_at
              const linkDate = new Date(link.last_seen_at || link.first_seen_at || 0);
              return linkDate >= cutoffDate;
            });
            
            renderFilteredResults(filteredLinks, \`\${currentTitle} (last \${days} day\${days > 1 ? 's' : ''})\`);
          }
          
          function clearFilters() {
            setActiveFilter(event.target);
            
            if (currentLinks.length === 0) {
              return; // No data to restore
            }
            
            renderFilteredResults(currentLinks, currentTitle);
          }
          
          function setActiveSourceFilter(activeBtn) {
            document.querySelectorAll('.source-btn').forEach(btn => {
              btn.classList.remove('active');
            });
            activeBtn.classList.add('active');
          }
          
          function filterBySource(source) {
            setActiveSourceFilter(event.target);
            
            if (currentLinks.length === 0) {
              return; // No data to filter
            }
            
            const filteredLinks = currentLinks.filter(link => {
              return link.source === source;
            });
            
            renderFilteredResults(filteredLinks, \`\${currentTitle} (\${source.toUpperCase()} only)\`);
          }
          
          function clearSourceFilter() {
            setActiveSourceFilter(event.target);
            
            if (currentLinks.length === 0) {
              return; // No data to restore
            }
            
            renderFilteredResults(currentLinks, currentTitle);
          }
          
          function renderFilteredResults(links, title) {
            const resultsDiv = document.getElementById('results');
            
            if (links.length === 0) {
              resultsDiv.innerHTML = \`
                <div class="empty-state">
                  No \${title.toLowerCase()} found
                </div>
              \`;
              return;
            }
            
            const tableHtml = \`
              <table>
                <thead>
                  <tr>
                    <th>Title</th>
                    <th>Source</th>
                    <th>Stats</th>
                    <th>Last Seen</th>
                  </tr>
                </thead>
                <tbody>
                  \${links.map(link => {
                    const sourceClass = 'source-' + (link.source || 'unknown');
                    const titleClass = link.viewed ? 'viewed' : (link.engaged ? 'engaged' : '');
                    const hasComments = link.comments_url && link.comments_url !== link.url;
                    
                    return \`
                      <tr>
                        <td>
                          <a href="#" onclick="openLink('\${link.url}')" class="title-link \${titleClass}">
                            \${truncateTitle(link.title)}
                          </a>
                          \${hasComments ? \`<a href="#" onclick="openLink('\${link.comments_url}')" class="comments-link">[comments]</a>\` : ''}
                        </td>
                        <td>
                          <span class="source-badge \${sourceClass}">\${link.source || 'unknown'}</span>
                        </td>
                        <td>
                          <div class="stats">
                            \${link.total_clicks > 0 ? \`<span class="stat">\${link.total_clicks} clicks</span>\` : ''}
                            \${link.engagement_count > 0 ? \`<span class="stat">\${link.engagement_count} engaged</span>\` : ''}
                            \${link.times_appeared > 1 ? \`<span class="stat">seen \${link.times_appeared}x</span>\` : ''}
                            \${link.points ? \`<span class="stat">\${link.points} pts</span>\` : ''}
                          </div>
                        </td>
                        <td>
                          <div class="meta">\${formatDate(link.last_seen_at)}</div>
                        </td>
                      </tr>
                    \`;
                  }).join('')}
                </tbody>
              </table>
            \`;
            
            resultsDiv.innerHTML = tableHtml;
          }
        </script>
      </body>
      </html>
    `;

    console.log('Loading enhanced database browser HTML...');
    win.loadURL('data:text/html;charset=UTF-8,' + encodeURIComponent(html));

    win.on('closed', () => {
      console.log('Database browser window closed');
    });

  } catch (error) {
    console.error('Error in showDatabaseBrowser:', error);
  }
}

/**
 * Show article browser window with saved articles ordered by clicks
 */
function showArticleBrowser() {
  try {
    const win = new BrowserWindow({
      width: 900,
      height: 700,
      title: '📚 Article Browser',
      webPreferences: {
        nodeIntegration: true,
        contextIsolation: false
      }
    });

    getArticles(100, 0, (err, articles) => {
      if (err) {
        console.error('Error fetching articles:', err);
        articles = [];
      }

      const html = `
        <!DOCTYPE html>
        <html>
        <head>
          <title>📚 Article Browser</title>
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
            .article {
              background: white;
              margin: 0;
              padding: 20px;
              border-bottom: 1px solid #e0e0e0;
              transition: background-color 0.2s;
            }
            .article:hover {
              background-color: #f8f9fa;
            }
            .article:last-child {
              border-bottom: none;
            }
            .article-title {
              color: #0066cc;
              text-decoration: none;
              font-weight: 600;
              font-size: 18px;
              line-height: 1.4;
              display: block;
              margin-bottom: 10px;
              cursor: pointer;
            }
            .article-title:hover {
              text-decoration: underline;
            }
            .article-meta {
              color: #666;
              font-size: 14px;
              display: flex;
              flex-wrap: wrap;
              gap: 15px;
              margin-bottom: 5px;
            }
            .domain {
              color: #888;
              font-size: 13px;
            }
            .click-count {
              background: #e3f2fd;
              color: #1976d2;
              padding: 4px 8px;
              border-radius: 12px;
              font-size: 11px;
              font-weight: bold;
            }
            .date {
              color: #888;
              font-size: 13px;
            }
            .search-box {
              width: 100%;
              padding: 12px;
              border: 2px solid #ddd;
              border-radius: 8px;
              font-size: 14px;
              margin-bottom: 20px;
              box-sizing: border-box;
            }
            .search-box:focus {
              outline: none;
              border-color: #667eea;
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
          </style>
        </head>
        <body>
          <div class="header">
            <h1>📚 Article Browser</h1>
            <div class="stats">${articles.length} articles saved • Ordered by clicks</div>
          </div>
          
          <input type="text" id="searchBox" class="search-box" placeholder="Search articles by title or domain...">
          
          <div class="article-list" id="articleList">
            ${articles.length === 0 ? `
              <div class="empty-state">
                <h2>No articles saved yet</h2>
                <p>Save articles through the API to see them here</p>
              </div>
            ` : articles.map(article => `
              <div class="article" data-title="${(article.title || '').toLowerCase()}" data-domain="${(article.domain || '').toLowerCase()}">
                <a href="#" class="article-title" onclick="trackAndOpenArticle(${article.id}, '${article.url}')">
                  ${article.title || 'Untitled'}
                </a>
                <div class="article-meta">
                  <span class="domain">${article.domain || extractDomain(article.url)}</span>
                  ${article.click_count > 0 ? `<span class="click-count">${article.click_count} clicks</span>` : ''}
                  <span class="date">Saved: ${formatDate(article.saved_at)}</span>
                </div>
              </div>
            `).join('')}
          </div>

          <script>
            const { shell } = require('electron');

            function formatDate(dateString) {
              if (!dateString) return 'Unknown';
              return new Date(dateString).toLocaleDateString('en-US', {
                year: 'numeric',
                month: 'short',
                day: 'numeric'
              });
            }

            function extractDomain(url) {
              try {
                return new URL(url).hostname;
              } catch {
                return 'Unknown domain';
              }
            }

            function trackAndOpenArticle(articleId, url) {
              // Track the click
              fetch('http://127.0.0.1:3002/api/articles/' + articleId + '/click', { 
                method: 'POST' 
              }).catch(err => console.error('Error tracking click:', err));
              
              // Open the URL
              shell.openExternal(url);
            }

            // Search functionality
            document.getElementById('searchBox').addEventListener('input', (e) => {
              const query = e.target.value.toLowerCase();
              const articles = document.querySelectorAll('.article');
              
              articles.forEach(article => {
                const title = article.dataset.title || '';
                const domain = article.dataset.domain || '';
                
                if (title.includes(query) || domain.includes(query)) {
                  article.style.display = 'block';
                } else {
                  article.style.display = 'none';
                }
              });
            });
          </script>
        </body>
        </html>
      `;

      win.loadURL('data:text/html;charset=UTF-8,' + encodeURIComponent(html));
    });

    win.on('closed', () => {});

  } catch (error) {
    console.error('Error opening article browser:', error);
  }
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

module.exports = {
  promptForCustomTag,
  showArticleLibrary,
  promptForTagSearch,
  showDatabaseBrowser,
  showArticleBrowser
};