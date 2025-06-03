/**
 * Express API server for external integrations
 */

const express = require('express');
const cors = require('cors');
const https = require('https');
const fs = require('fs');
const path = require('path');
const { API_PORT, HTTPS_PORT } = require('./config');
const { saveArticle, getArticles, searchArticles, getArticleStats, trackSavedArticleClick, getDatabase } = require('./database');

let apiServer = null;
let httpsServer = null;

/**
 * Initialize Express API server for external integrations
 */
function initApiServer() {
  
  const server = express();
  
  // More permissive CORS for development
  server.use(cors({
    origin: true,
    credentials: true
  }));
  
  server.use(express.json({ limit: '10mb' }));
  
  // TODO: Configure archives directory for serving archived files
  // server.use('/archives', express.static(archivesDir));
  
  // Add request logging for development
  if (process.env.NODE_ENV === 'development') {
    server.use((req, res, next) => {
      console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
      next();
    });
  }
  
  // Simple test endpoint
  server.get('/test', (req, res) => {
    res.send('API server is working!');
  });
  
  // Health check endpoint
  server.get('/api/ping', (req, res) => {
    res.json({ status: 'ok', timestamp: Date.now() });
  });
  
  // Add error handling middleware
  server.use((err, req, res, next) => {
    console.error('API Error:', err);
    res.status(500).json({ error: err.message });
  });
  
  // Save article endpoint - archiving functionality disabled until archivePageWithMonolith is implemented
  server.post('/api/articles', async (req, res) => {
    try {
      const { url, title } = req.body;
      
      if (!url) {
        return res.status(400).json({ error: 'URL is required' });
      }
      
      // Use the saveArticle function which includes domain extraction
      const articleData = {
        url: url,
        title: title || 'Untitled',
        author: null,
        publishDate: null,
        content: '',
        textContent: '',
        wordCount: null,
        readingTime: null
      };
      
      saveArticle(articleData, (err, result) => {
        if (err) {
          console.error('API: Error saving article:', err);
          res.status(500).json({ error: err.message });
        } else {
          res.json({
            success: true,
            ...result,
            message: 'Article saved successfully'
          });
        }
      });
      
    } catch (error) {
      console.error('API: Error saving article:', error);
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
    
    const db = getDatabase();
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

  // Track article click
  server.post('/api/articles/:id/click', (req, res) => {
    const articleId = parseInt(req.params.id);
    
    trackSavedArticleClick(articleId, (err) => {
      if (err) {
        res.status(500).json({ error: err.message });
      } else {
        res.json({ success: true, message: 'Click tracked' });
      }
    });
  });

  // Database browser endpoint
  server.get('/api/database/clicks', (req, res) => {
    const db = getDatabase();
    if (!db) {
      return res.status(500).json({ error: 'Database not initialized' });
    }

    db.all(`SELECT 
      c.id,
      c.story_id,
      c.title,
      c.url,
      c.points,
      c.comments,
      c.clicked_at,
      c.story_added_at,
      c.archive_url,
      c.tags,
      s.url as story_url
    FROM clicks c
    LEFT JOIN stories s ON c.story_id = s.story_id
    ORDER BY c.clicked_at DESC`, [], (err, rows) => {
      if (err) {
        res.status(500).json({ error: err.message });
      } else {
        res.json({ clicks: rows });
      }
    });
  });

  // Database browser interface
  server.get('/database', (req, res) => {
    res.send(`
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Database Browser</title>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            max-width: 1200px;
            margin: 0 auto;
            padding: 20px;
            background: #f5f5f5;
        }
        .header {
            text-align: center;
            margin-bottom: 30px;
        }
        .show-links-btn {
            background: #007AFF;
            color: white;
            border: none;
            padding: 15px 30px;
            border-radius: 8px;
            font-size: 16px;
            font-weight: 600;
            cursor: pointer;
            box-shadow: 0 2px 8px rgba(0,122,255,0.2);
            transition: all 0.2s ease;
        }
        .show-links-btn:hover {
            background: #0056b3;
            transform: translateY(-1px);
            box-shadow: 0 4px 12px rgba(0,122,255,0.3);
        }
        .clicks-container {
            display: none;
            margin-top: 30px;
        }
        .click-item {
            background: white;
            margin: 10px 0;
            padding: 20px;
            border-radius: 8px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
            border-left: 4px solid #007AFF;
        }
        .click-title {
            color: #0066cc;
            text-decoration: none;
            font-weight: 600;
            font-size: 18px;
            line-height: 1.4;
            display: block;
            margin-bottom: 10px;
        }
        .click-title:hover {
            text-decoration: underline;
        }
        .click-meta {
            display: flex;
            flex-wrap: wrap;
            gap: 15px;
            color: #666;
            font-size: 14px;
            margin-bottom: 10px;
        }
        .meta-item {
            display: flex;
            align-items: center;
            gap: 5px;
        }
        .discussion-link {
            color: #FF6B35;
            text-decoration: none;
            font-weight: 500;
        }
        .discussion-link:hover {
            text-decoration: underline;
        }
        .date {
            color: #888;
            font-size: 13px;
        }
        .stats {
            display: flex;
            gap: 20px;
            margin-top: 10px;
        }
        .stat {
            background: #f8f9fa;
            padding: 5px 10px;
            border-radius: 4px;
            font-size: 12px;
            color: #555;
        }
        .loading {
            text-align: center;
            color: #666;
            padding: 40px;
        }
        h1 {
            color: #333;
        }
        .count-badge {
            background: #28a745;
            color: white;
            padding: 4px 8px;
            border-radius: 12px;
            font-size: 11px;
            font-weight: bold;
            margin-left: 10px;
        }
    </style>
</head>
<body>
    <div class="header">
        <h1>🗄️ Database Browser</h1>
        <button class="show-links-btn" onclick="loadClicks()">SHOW ME THE LINKS</button>
    </div>
    
    <div id="clicksContainer" class="clicks-container">
        <div id="clicksContent" class="loading">Loading clicks...</div>
    </div>

    <script>
        function formatDate(dateString) {
            if (!dateString) return 'Unknown date';
            return new Date(dateString).toLocaleDateString('en-US', {
                year: 'numeric',
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
            });
        }

        function isRedditUrl(url) {
            return url && url.includes('reddit.com');
        }

        function getRedditDiscussionUrl(url) {
            // Convert Reddit links to comment page URLs
            if (url.includes('/comments/')) {
                return url;
            }
            // Handle other Reddit URL formats if needed
            return url;
        }

        function renderClicks(clicks) {
            const container = document.getElementById('clicksContent');
            
            if (clicks.length === 0) {
                container.innerHTML = '<div class="loading">No clicks found in database</div>';
                return;
            }

            container.innerHTML = \`
                <h2>📊 Click History <span class="count-badge">\${clicks.length} clicks</span></h2>
                \${clicks.map(click => \`
                    <div class="click-item">
                        <a href="\${click.url}" target="_blank" class="click-title">
                            \${click.title}
                        </a>
                        
                        <div class="click-meta">
                            <div class="meta-item">
                                <span>📅</span>
                                <span class="date">Clicked: \${formatDate(click.clicked_at)}</span>
                            </div>
                            
                            \${click.story_added_at ? \`
                                <div class="meta-item">
                                    <span>➕</span>
                                    <span class="date">Added: \${formatDate(click.story_added_at)}</span>
                                </div>
                            \` : ''}
                            
                            \${isRedditUrl(click.url) ? \`
                                <div class="meta-item">
                                    <span>💬</span>
                                    <a href="\${getRedditDiscussionUrl(click.url)}" target="_blank" class="discussion-link">
                                        Discussion
                                    </a>
                                </div>
                            \` : ''}
                        </div>
                        
                        <div class="stats">
                            \${click.points ? \`<span class="stat">👍 \${click.points} points</span>\` : ''}
                            \${click.comments ? \`<span class="stat">💬 \${click.comments} comments</span>\` : ''}
                            \${click.tags ? \`<span class="stat">🏷️ \${click.tags}</span>\` : ''}
                        </div>
                    </div>
                \`).join('')}
            \`;
        }

        function loadClicks() {
            const container = document.getElementById('clicksContainer');
            const content = document.getElementById('clicksContent');
            
            container.style.display = 'block';
            content.innerHTML = '<div class="loading">Loading clicks from database...</div>';
            
            fetch('/api/database/clicks')
                .then(response => response.json())
                .then(data => {
                    renderClicks(data.clicks);
                })
                .catch(err => {
                    console.error('Error loading clicks:', err);
                    content.innerHTML = '<div class="loading">Error loading clicks from database</div>';
                });
        }
    </script>
</body>
</html>
    `);
  });

  // Simple browser interface
  server.get('/browser', (req, res) => {
    res.send(`
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Article Browser</title>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            max-width: 800px;
            margin: 0 auto;
            padding: 20px;
            background: #f5f5f5;
        }
        .article {
            background: white;
            margin: 10px 0;
            padding: 15px;
            border-radius: 8px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }
        .article-title {
            color: #0066cc;
            text-decoration: none;
            font-weight: 500;
            font-size: 16px;
            line-height: 1.4;
        }
        .article-title:hover {
            text-decoration: underline;
        }
        .article-meta {
            color: #666;
            font-size: 12px;
            margin-top: 5px;
        }
        .domain {
            color: #888;
            font-size: 11px;
        }
        .click-count {
            background: #e3f2fd;
            color: #1976d2;
            padding: 2px 6px;
            border-radius: 10px;
            font-size: 10px;
            font-weight: bold;
            margin-left: 8px;
        }
        .search-box {
            width: 100%;
            padding: 10px;
            border: 1px solid #ddd;
            border-radius: 4px;
            margin-bottom: 20px;
            font-size: 14px;
        }
        h1 {
            color: #333;
            text-align: center;
        }
        .loading {
            text-align: center;
            color: #666;
        }
    </style>
</head>
<body>
    <h1>📚 Article Browser</h1>
    <input type="text" id="searchBox" class="search-box" placeholder="Search articles...">
    <div id="articles" class="loading">Loading articles...</div>

    <script>
        let articles = [];

        function formatDate(dateString) {
            return new Date(dateString).toLocaleDateString();
        }

        function trackClick(articleId, url) {
            fetch(\`/api/articles/\${articleId}/click\`, { method: 'POST' })
                .catch(err => console.error('Error tracking click:', err));
            window.open(url, '_blank');
        }

        function renderArticles(articlesToShow = articles) {
            const container = document.getElementById('articles');
            if (articlesToShow.length === 0) {
                container.innerHTML = '<div class="loading">No articles found</div>';
                return;
            }

            container.innerHTML = articlesToShow.map(article => \`
                <div class="article">
                    <a href="#" class="article-title" onclick="trackClick(\${article.id}, '\${article.url}'); return false;">
                        \${article.title}
                    </a>
                    <div class="article-meta">
                        <span class="domain">\${article.domain || new URL(article.url).hostname}</span>
                        \${article.click_count > 0 ? \`<span class="click-count">\${article.click_count} clicks</span>\` : ''}
                        <span style="margin-left: 8px;">Saved: \${formatDate(article.saved_at)}</span>
                    </div>
                </div>
            \`).join('');
        }

        function searchArticles(query) {
            if (!query.trim()) {
                renderArticles();
                return;
            }

            const filtered = articles.filter(article => 
                article.title.toLowerCase().includes(query.toLowerCase()) ||
                (article.domain && article.domain.toLowerCase().includes(query.toLowerCase()))
            );
            renderArticles(filtered);
        }

        // Load articles
        fetch('/api/articles')
            .then(response => response.json())
            .then(data => {
                articles = data.articles;
                renderArticles();
            })
            .catch(err => {
                console.error('Error loading articles:', err);
                document.getElementById('articles').innerHTML = '<div class="loading">Error loading articles</div>';
            });

        // Search functionality
        document.getElementById('searchBox').addEventListener('input', (e) => {
            searchArticles(e.target.value);
        });
    </script>
</body>
</html>
    `);
  });
  
  // Note: Reading library functionality removed, will be revisited
  
  // Analytics functionality removed
  
  // Start HTTP server
  try {
    apiServer = server.listen(API_PORT, '127.0.0.1', () => {
      if (process.env.NODE_ENV !== 'production') {
        console.log(`✅ Reading Tracker API server running on http://127.0.0.1:${API_PORT}`);
      }
    });
    
    apiServer.on('error', (err) => {
      console.error('❌ HTTP Server Error:', err);
    });
    
  } catch (error) {
    console.error('❌ Failed to start HTTP server:', error);
  }

  // Start HTTPS server for mixed content compatibility
  try {
    
    // Check if certificate files exist
    const certPath = path.join(__dirname, '..', 'cert.pem');
    const keyPath = path.join(__dirname, '..', 'key.pem');
    
    if (fs.existsSync(certPath) && fs.existsSync(keyPath)) {
      const httpsOptions = {
        key: fs.readFileSync(keyPath),
        cert: fs.readFileSync(certPath)
      };
      
      httpsServer = https.createServer(httpsOptions, server);
      
      httpsServer.listen(HTTPS_PORT, '127.0.0.1', () => {
        if (process.env.NODE_ENV !== 'production') {
          console.log(`✅ Reading Tracker HTTPS server running on https://127.0.0.1:${HTTPS_PORT}`);
        }
      });
      
      httpsServer.on('error', (err) => {
        console.error('❌ HTTPS Server Error:', err);
      });
      
    } else {
      if (process.env.NODE_ENV !== 'production') {
        console.log('⚠️  SSL certificates not found, HTTPS server not started');
      }
    }
    
  } catch (error) {
    console.error('❌ Failed to start HTTPS server:', error);
  }
}

function getApiServer() {
  return apiServer;
}

function getHttpsServer() {
  return httpsServer;
}

module.exports = {
  initApiServer,
  getApiServer,
  getHttpsServer
};