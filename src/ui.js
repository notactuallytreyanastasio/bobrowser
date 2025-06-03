/**
 * UI windows and dialogs
 */

const { BrowserWindow, shell } = require('electron');
const { addTagToStory, getArticles } = require('./database');

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
    addTagToStory(storyId, tag);
    tagInputWindow.close();
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

module.exports = {
  promptForCustomTag,
  showArticleLibrary,
  promptForTagSearch
};