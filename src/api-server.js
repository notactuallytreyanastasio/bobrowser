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

  // Database browser endpoints
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

  // Bag of Links - Hidden gems with low appearance rates and no clicks
  server.get('/api/database/bag-of-links', (req, res) => {
    const db = getDatabase();
    if (!db) {
      return res.status(500).json({ error: 'Database not initialized' });
    }

    db.all(`SELECT 
      l.*,
      COALESCE((SELECT COUNT(*) FROM clicks c WHERE c.link_id = l.id), 0) as total_clicks,
      COALESCE((SELECT COUNT(*) FROM clicks c WHERE c.link_id = l.id AND c.click_type = 'article'), 0) as article_clicks,
      COALESCE((SELECT COUNT(*) FROM clicks c WHERE c.link_id = l.id AND c.click_type = 'engage'), 0) as engagements
    FROM links l 
    WHERE COALESCE((SELECT COUNT(*) FROM clicks c WHERE c.link_id = l.id AND c.click_type = 'article'), 0) = 0
    ORDER BY l.times_appeared ASC, RANDOM()
    LIMIT 100`, [], (err, rows) => {
      if (err) {
        res.status(500).json({ error: err.message });
      } else {
        res.json({ links: rows });
      }
    });
  });

  // Curated Bag - 3 unclicked links from each source with high show counts + 1 random
  server.get('/api/database/curated-bag', (req, res) => {
    const db = getDatabase();
    if (!db) {
      return res.status(500).json({ error: 'Database not initialized' });
    }

    // Simplified approach - get all unclicked links, then process them
    db.all(`SELECT 
      l.*,
      COALESCE((SELECT COUNT(*) FROM clicks c WHERE c.link_id = l.id), 0) as total_clicks,
      COALESCE((SELECT COUNT(*) FROM clicks c WHERE c.link_id = l.id AND c.click_type = 'article'), 0) as article_clicks,
      COALESCE((SELECT COUNT(*) FROM clicks c WHERE c.link_id = l.id AND c.click_type = 'engage'), 0) as engagements
    FROM links l 
    WHERE COALESCE((SELECT COUNT(*) FROM clicks c WHERE c.link_id = l.id AND c.click_type = 'article'), 0) = 0
    ORDER BY l.times_appeared DESC`, [], (err, rows) => {
      if (err) {
        console.error('Error in curated bag query:', err);
        return res.status(500).json({ error: err.message });
      }

      try {
        // Group by source
        const bySource = {
          hn: rows.filter(r => r.source === 'hn').slice(0, 3),
          reddit: rows.filter(r => r.source === 'reddit').slice(0, 3),
          pinboard: rows.filter(r => r.source === 'pinboard').slice(0, 3)
        };

        // Get 1 random from all unclicked
        const randomLink = rows[Math.floor(Math.random() * rows.length)];

        // Combine all links
        let allLinks = [...bySource.hn, ...bySource.reddit, ...bySource.pinboard];
        if (randomLink && !allLinks.find(link => link.id === randomLink.id)) {
          allLinks.push(randomLink);
        }

        // Remove source information and randomize order for presentation
        const processedLinks = allLinks.map(link => {
          const { source, ...linkWithoutSource } = link;
          return linkWithoutSource;
        });

        // Shuffle the array to mix sources randomly
        for (let i = processedLinks.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [processedLinks[i], processedLinks[j]] = [processedLinks[j], processedLinks[i]];
        }

        res.json({ links: processedLinks });
      } catch (error) {
        console.error('Error processing curated bag:', error);
        res.status(500).json({ error: 'Error processing results' });
      }
    });
  });

  // Unread stories
  server.get('/api/database/unread', (req, res) => {
    const db = getDatabase();
    if (!db) {
      return res.status(500).json({ error: 'Database not initialized' });
    }

    db.all(`SELECT 
      l.*,
      (SELECT COUNT(*) FROM clicks c WHERE c.link_id = l.id) as total_clicks,
      (SELECT COUNT(*) FROM clicks c WHERE c.link_id = l.id AND c.click_type = 'article') as article_clicks,
      (SELECT COUNT(*) FROM clicks c WHERE c.link_id = l.id AND c.click_type = 'engage') as engagements
    FROM links l 
    WHERE l.viewed = 0 OR l.viewed IS NULL
    ORDER BY RANDOM()
    LIMIT 100`, [], (err, rows) => {
      if (err) {
        res.status(500).json({ error: err.message });
      } else {
        res.json({ links: rows });
      }
    });
  });

  // Recent clicked articles
  server.get('/api/database/recent', (req, res) => {
    const db = getDatabase();
    if (!db) {
      return res.status(500).json({ error: 'Database not initialized' });
    }

    db.all(`SELECT 
      l.*,
      (SELECT COUNT(*) FROM clicks c WHERE c.link_id = l.id) as total_clicks,
      (SELECT COUNT(*) FROM clicks c WHERE c.link_id = l.id AND c.click_type = 'article') as article_clicks,
      (SELECT COUNT(*) FROM clicks c WHERE c.link_id = l.id AND c.click_type = 'engage') as engagements,
      (SELECT MAX(c.clicked_at) FROM clicks c WHERE c.link_id = l.id AND c.click_type = 'article') as last_clicked
    FROM links l 
    WHERE (SELECT COUNT(*) FROM clicks c WHERE c.link_id = l.id AND c.click_type = 'article') > 0
    ORDER BY last_clicked DESC
    LIMIT 100`, [], (err, rows) => {
      if (err) {
        res.status(500).json({ error: err.message });
      } else {
        res.json({ links: rows });
      }
    });
  });

  // All links
  server.get('/api/database/all', (req, res) => {
    const db = getDatabase();
    if (!db) {
      return res.status(500).json({ error: 'Database not initialized' });
    }

    db.all(`SELECT 
      l.*,
      (SELECT COUNT(*) FROM clicks c WHERE c.link_id = l.id) as total_clicks,
      (SELECT COUNT(*) FROM clicks c WHERE c.link_id = l.id AND c.click_type = 'article') as article_clicks,
      (SELECT COUNT(*) FROM clicks c WHERE c.link_id = l.id AND c.click_type = 'engage') as engagements
    FROM links l 
    ORDER BY l.last_seen_at DESC
    LIMIT 100`, [], (err, rows) => {
      if (err) {
        res.status(500).json({ error: err.message });
      } else {
        res.json({ links: rows });
      }
    });
  });

  // Get all tags with counts
  server.get('/api/database/tags', (req, res) => {
    const db = getDatabase();
    if (!db) {
      return res.status(500).json({ error: 'Database not initialized' });
    }

    // Query to get all tags and their occurrence counts from the links table
    db.all(`SELECT 
      tags,
      COUNT(*) as count
    FROM links 
    WHERE tags IS NOT NULL AND tags != ''
    GROUP BY tags
    ORDER BY count DESC, tags ASC`, [], (err, rows) => {
      if (err) {
        res.status(500).json({ error: err.message });
      } else {
        // Parse comma-separated tags and count them
        const tagCounts = {};
        
        rows.forEach(row => {
          if (row.tags) {
            const tags = row.tags.split(',').map(tag => tag.trim()).filter(tag => tag);
            tags.forEach(tag => {
              tagCounts[tag] = (tagCounts[tag] || 0) + row.count;
            });
          }
        });
        
        // Convert to array and sort by count descending
        const sortedTags = Object.entries(tagCounts)
          .map(([tag, count]) => ({ tag, count }))
          .sort((a, b) => b.count - a.count);
        
        res.json({ tags: sortedTags });
      }
    });
  });

  // Get random unclicked links from past week (default view)
  server.get('/api/database/discover', (req, res) => {
    const db = getDatabase();
    if (!db) {
      return res.status(500).json({ error: 'Database not initialized' });
    }

    // Get 25 random unclicked links from the past week
    db.all(`SELECT 
      l.*,
      COALESCE((SELECT COUNT(*) FROM clicks c WHERE c.link_id = l.id), 0) as total_clicks,
      COALESCE((SELECT COUNT(*) FROM clicks c WHERE c.link_id = l.id AND c.click_type = 'article'), 0) as article_clicks,
      COALESCE((SELECT COUNT(*) FROM clicks c WHERE c.link_id = l.id AND c.click_type = 'engage'), 0) as engagements
    FROM links l 
    WHERE COALESCE((SELECT COUNT(*) FROM clicks c WHERE c.link_id = l.id AND c.click_type = 'article'), 0) = 0
    AND l.last_seen_at >= datetime('now', '-7 days')
    ORDER BY RANDOM()
    LIMIT 25`, [], (err, rows) => {
      if (err) {
        console.error('Database error in discover:', err);
        res.status(500).json({ error: err.message });
      } else {
        res.json({ links: rows });
      }
    });
  });

  // Track click from database browser
  server.post('/api/database/track-click', (req, res) => {
    const { url, storyId, source, clickType = 'article' } = req.body;
    
    if (!url) {
      return res.status(400).json({ error: 'URL is required' });
    }

    const { trackArticleClick, markLinkAsViewed } = require('./database');
    
    try {
      // Track the click
      if (clickType === 'article') {
        trackArticleClick(storyId, source);
        markLinkAsViewed(storyId, source);
      }
      
      res.json({ success: true, message: 'Click tracked successfully' });
    } catch (error) {
      console.error('Error tracking click:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Analytics endpoints
  
  // Clicks per day
  server.get('/api/analytics/clicks-per-day', (req, res) => {
    const db = getDatabase();
    if (!db) {
      return res.status(500).json({ error: 'Database not initialized' });
    }

    db.all(`SELECT 
      DATE(clicked_at) as date,
      COUNT(*) as click_count
    FROM clicks 
    WHERE clicked_at IS NOT NULL
    GROUP BY DATE(clicked_at)
    ORDER BY date DESC
    LIMIT 30`, [], (err, rows) => {
      if (err) {
        res.status(500).json({ error: err.message });
      } else {
        res.json({ data: rows });
      }
    });
  });

  // Clicks per day per source
  server.get('/api/analytics/clicks-per-day-per-source', (req, res) => {
    const db = getDatabase();
    if (!db) {
      return res.status(500).json({ error: 'Database not initialized' });
    }

    db.all(`SELECT 
      DATE(c.clicked_at) as date,
      l.source,
      COUNT(*) as click_count
    FROM clicks c
    JOIN links l ON c.link_id = l.id
    WHERE c.clicked_at IS NOT NULL AND l.source IS NOT NULL
    GROUP BY DATE(c.clicked_at), l.source
    ORDER BY date DESC, l.source
    LIMIT 90`, [], (err, rows) => {
      if (err) {
        res.status(500).json({ error: err.message });
      } else {
        res.json({ data: rows });
      }
    });
  });

  // Tag statistics
  server.get('/api/analytics/tag-stats', (req, res) => {
    const db = getDatabase();
    if (!db) {
      return res.status(500).json({ error: 'Database not initialized' });
    }

    // Get tag usage stats
    db.all(`SELECT 
      tags,
      COUNT(*) as story_count,
      SUM(CASE WHEN viewed = 1 THEN 1 ELSE 0 END) as viewed_count,
      SUM(engagement_count) as total_engagements,
      AVG(times_appeared) as avg_appearances
    FROM links 
    WHERE tags IS NOT NULL AND tags != ''
    GROUP BY tags
    ORDER BY story_count DESC
    LIMIT 50`, [], (err, rows) => {
      if (err) {
        res.status(500).json({ error: err.message });
      } else {
        // Parse comma-separated tags and aggregate stats
        const tagStats = {};
        
        rows.forEach(row => {
          if (row.tags) {
            const tags = row.tags.split(',').map(tag => tag.trim()).filter(tag => tag);
            tags.forEach(tag => {
              if (!tagStats[tag]) {
                tagStats[tag] = {
                  tag: tag,
                  story_count: 0,
                  viewed_count: 0,
                  total_engagements: 0,
                  total_appearances: 0
                };
              }
              tagStats[tag].story_count += row.story_count;
              tagStats[tag].viewed_count += row.viewed_count || 0;
              tagStats[tag].total_engagements += row.total_engagements || 0;
              tagStats[tag].total_appearances += (row.avg_appearances || 0) * row.story_count;
            });
          }
        });

        // Convert to array and add calculated metrics
        const sortedStats = Object.values(tagStats).map(stat => ({
          ...stat,
          engagement_rate: stat.story_count > 0 ? (stat.total_engagements / stat.story_count).toFixed(2) : 0,
          view_rate: stat.story_count > 0 ? (stat.viewed_count / stat.story_count * 100).toFixed(1) : 0,
          avg_appearances: stat.story_count > 0 ? (stat.total_appearances / stat.story_count).toFixed(1) : 0
        })).sort((a, b) => b.story_count - a.story_count);

        res.json({ data: sortedStats });
      }
    });
  });

  // Background tagging endpoints
  server.get('/api/background-tagging/status', (req, res) => {
    const { getTaggingStatus } = require('./background-tagger');
    res.json(getTaggingStatus());
  });

  server.post('/api/background-tagging/trigger', (req, res) => {
    const { triggerManualTagging } = require('./background-tagger');
    triggerManualTagging()
      .then(() => res.json({ success: true, message: 'Manual tagging triggered' }))
      .catch(err => res.status(500).json({ error: err.message }));
  });

  server.post('/api/background-tagging/retag-all', (req, res) => {
    const { retagAllStories } = require('./background-tagger');
    retagAllStories()
      .then((result) => res.json({ success: true, message: 'Re-tagging all stories started', ...result }))
      .catch(err => res.status(500).json({ error: err.message }));
  });

  // Debug/Pulse check endpoint
  server.get('/api/debug/pulse-check', (req, res) => {
    const db = getDatabase();
    if (!db) {
      return res.status(500).json({ error: 'Database not initialized' });
    }

    // Get all stats in parallel
    const queries = [
      // Top 10 tags
      new Promise((resolve) => {
        db.all(`SELECT 
          tags,
          COUNT(*) as story_count
        FROM links 
        WHERE tags IS NOT NULL AND tags != ''
        GROUP BY tags
        ORDER BY story_count DESC
        LIMIT 20`, [], (err, rows) => {
          if (err) {
            resolve([]);
          } else {
            // Parse comma-separated tags and aggregate
            const tagCounts = {};
            rows.forEach(row => {
              if (row.tags) {
                const tags = row.tags.split(',').map(tag => tag.trim()).filter(tag => tag);
                tags.forEach(tag => {
                  tagCounts[tag] = (tagCounts[tag] || 0) + row.story_count;
                });
              }
            });
            const sortedTags = Object.entries(tagCounts)
              .map(([tag, count]) => ({ tag, count }))
              .sort((a, b) => b.count - a.count)
              .slice(0, 10);
            resolve(sortedTags);
          }
        });
      }),

      // Top 5 clicked links
      new Promise((resolve) => {
        db.all(`SELECT 
          c.title,
          COUNT(*) as click_count
        FROM clicks c
        GROUP BY c.story_id, c.title
        ORDER BY click_count DESC
        LIMIT 5`, [], (err, rows) => {
          resolve(err ? [] : rows);
        });
      }),

      // Top 5 viewed links
      new Promise((resolve) => {
        db.all(`SELECT 
          title,
          times_appeared as view_count
        FROM links 
        WHERE viewed = 1
        ORDER BY times_appeared DESC
        LIMIT 5`, [], (err, rows) => {
          resolve(err ? [] : rows);
        });
      }),

      // Overall stats
      new Promise((resolve) => {
        db.get(`SELECT 
          COUNT(*) as total_links,
          SUM(CASE WHEN tags IS NOT NULL AND tags != '' THEN 1 ELSE 0 END) as tagged_links,
          SUM(CASE WHEN viewed = 1 THEN 1 ELSE 0 END) as viewed_links
        FROM links`, [], (err, row) => {
          resolve(err ? {} : row);
        });
      }),

      // Click stats
      new Promise((resolve) => {
        db.get(`SELECT COUNT(*) as total_clicks FROM clicks`, [], (err, row) => {
          resolve(err ? {} : row);
        });
      }),

      // Source breakdown
      new Promise((resolve) => {
        db.all(`SELECT 
          source,
          COUNT(*) as count
        FROM links 
        GROUP BY source 
        ORDER BY count DESC`, [], (err, rows) => {
          resolve(err ? [] : rows);
        });
      })
    ];

    Promise.all(queries).then(([topTags, topClicked, topViewed, linkStats, clickStats, sources]) => {
      const totalTags = topTags.length > 0 ? topTags.reduce((sum, tag) => sum + tag.count, 0) : 0;
      const uniqueTags = topTags.length;

      res.json({
        topTags,
        topClicked,
        topViewed,
        stats: {
          totalLinks: linkStats.total_links || 0,
          taggedLinks: linkStats.tagged_links || 0,
          viewedLinks: linkStats.viewed_links || 0,
          totalClicks: clickStats.total_clicks || 0,
          uniqueTags: uniqueTags,
          untaggedLinks: (linkStats.total_links || 0) - (linkStats.tagged_links || 0)
        },
        sources,
        rates: {
          clickRate: linkStats.total_links > 0 ? ((clickStats.total_clicks || 0) / linkStats.total_links * 100).toFixed(1) : '0',
          viewRate: linkStats.total_links > 0 ? ((linkStats.viewed_links || 0) / linkStats.total_links * 100).toFixed(1) : '0',
          tagRate: linkStats.total_links > 0 ? ((linkStats.tagged_links || 0) / linkStats.total_links * 100).toFixed(1) : '0'
        }
      });
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
      if (err.code === 'EADDRINUSE') {
        console.error(`Port ${API_PORT} is already in use. Please close other instances.`);
      }
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