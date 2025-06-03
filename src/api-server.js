/**
 * Express API server for external integrations
 */

const express = require('express');
const cors = require('cors');
const https = require('https');
const fs = require('fs');
const path = require('path');
const { API_PORT, HTTPS_PORT } = require('./config');
const { saveArticle, getArticles, searchArticles, getArticleStats, getDatabase } = require('./database');

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
      
      // TODO: Implement archivePageWithMonolith function for offline archiving
      // For now, just save the URL and title to database
      const articleData = {
        url: url,
        title: title || 'Untitled',
        author: null,
        publish_date: null,
        description: null,
        archive_path: null,
        archive_date: null,
        file_size: null,
        saved_at: new Date().toISOString()
      };
      
      const db = getDatabase();
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
            res.json({
              success: true,
              id: this.lastID,
              ...articleData,
              message: 'Article saved (archiving functionality disabled)'
            });
          }
        }
      );
      
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