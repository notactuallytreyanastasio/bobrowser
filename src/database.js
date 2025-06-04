/**
 * Database operations and initialization
 */

const sqlite3 = require('sqlite3').verbose();

let db = null;

/**
 * Convert string to a consistent integer hash
 */
function hashStringToInt(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return Math.abs(hash);
}

/**
 * Extract domain from URL
 */
function extractDomain(url) {
  try {
    const urlObj = new URL(url);
    return urlObj.hostname;
  } catch (error) {
    console.warn('Invalid URL:', url);
    return null;
  }
}

/**
 * Initialize SQLite database with required tables and schema
 * @param {Function} callback - Callback function to execute after initialization
 */
function initDatabase(callback) {
  const path = require('path');
  const fs = require('fs');
  const { app } = require('electron');
  
  // Use Electron's userData directory for database storage
  const userDataPath = app.getPath('userData');
  const dbPath = path.join(userDataPath, 'clicks.db');
  
  // Ensure the userData directory exists
  if (!fs.existsSync(userDataPath)) {
    fs.mkdirSync(userDataPath, { recursive: true });
  }
  
  console.log('Database path:', dbPath);
  db = new sqlite3.Database(dbPath);
  
  db.serialize(() => {
    // Legacy clicks table (keeping existing structure for migration)
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
    
    // Links table for tracking story appearances and engagement
    db.run(`CREATE TABLE IF NOT EXISTS links (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      story_id INTEGER NOT NULL,
      title TEXT NOT NULL,
      url TEXT NOT NULL,
      comments_url TEXT,
      source TEXT NOT NULL,
      points INTEGER,
      comments INTEGER,
      viewed BOOLEAN DEFAULT FALSE,
      viewed_at DATETIME,
      engaged BOOLEAN DEFAULT FALSE,
      engaged_at DATETIME,
      engagement_count INTEGER DEFAULT 0,
      first_seen_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      last_seen_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      times_appeared INTEGER DEFAULT 1,
      archive_url TEXT,
      tags TEXT
    )`, () => {});
    
    // Main stories table (consolidated from old links table)
    db.run(`CREATE TABLE IF NOT EXISTS stories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      story_id INTEGER NOT NULL,
      title TEXT NOT NULL,
      url TEXT NOT NULL,
      comments_url TEXT,
      source TEXT NOT NULL,
      points INTEGER,
      comments INTEGER,
      viewed BOOLEAN DEFAULT FALSE,
      viewed_at DATETIME,
      engaged BOOLEAN DEFAULT FALSE,
      engaged_at DATETIME,
      engagement_count INTEGER DEFAULT 0,
      first_seen_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      last_seen_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      times_appeared INTEGER DEFAULT 1,
      archive_url TEXT
    )`, () => {});
    
    // New normalized tags table
    db.run(`CREATE TABLE IF NOT EXISTS tags (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      story_id INTEGER NOT NULL,
      tag TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (story_id) REFERENCES stories(id),
      UNIQUE(story_id, tag)
    )`, () => {});
    
    // Create index for fast tag lookups
    db.run(`CREATE INDEX IF NOT EXISTS idx_tags_story_id ON tags(story_id)`, () => {});
    db.run(`CREATE INDEX IF NOT EXISTS idx_tags_tag ON tags(tag)`, () => {});
    
    // Create articles table for saved content
    db.run(`CREATE TABLE IF NOT EXISTS articles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      url TEXT NOT NULL UNIQUE,
      title TEXT NOT NULL,
      domain TEXT,
      click_count INTEGER DEFAULT 0,
      author TEXT,
      publish_date TEXT,
      content TEXT,
      text_content TEXT,
      word_count INTEGER,
      reading_time INTEGER,
      saved_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      last_clicked_at DATETIME,
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
    
    // Migration: Copy data from links table to new stories table if needed
    db.run(`INSERT OR IGNORE INTO stories (story_id, title, url, comments_url, source, points, comments, 
            viewed, viewed_at, engaged, engaged_at, engagement_count, first_seen_at, last_seen_at, times_appeared)
            SELECT story_id, title, url, comments_url, source, points, comments, 
            viewed, viewed_at, engaged, engaged_at, engagement_count, first_seen_at, last_seen_at, times_appeared
            FROM links WHERE EXISTS (SELECT name FROM sqlite_master WHERE type='table' AND name='links')`, () => {});
    
    // Migration: Extract tags from old stories/links tables into new tags table
    db.all(`SELECT id, story_id, tags FROM stories WHERE tags IS NOT NULL AND tags != ''`, [], (err, rows) => {
      if (!err && rows) {
        rows.forEach(row => {
          if (row.tags) {
            const tags = row.tags.split(',').map(tag => tag.trim()).filter(tag => tag);
            tags.forEach(tag => {
              db.run(`INSERT OR IGNORE INTO tags (story_id, tag) VALUES (?, ?)`, [row.id, tag]);
            });
          }
        });
      }
    });
    
    // Legacy table support - keep old columns for migration
    db.run(`ALTER TABLE clicks ADD COLUMN points INTEGER`, () => {});
    db.run(`ALTER TABLE clicks ADD COLUMN comments INTEGER`, () => {});
    db.run(`ALTER TABLE clicks ADD COLUMN story_added_at DATETIME`, () => {});
    db.run(`ALTER TABLE clicks ADD COLUMN archive_url TEXT`, () => {});
    db.run(`ALTER TABLE clicks ADD COLUMN tags TEXT`, () => {});
    db.run(`ALTER TABLE clicks ADD COLUMN comments_url TEXT`, () => {});
    db.run(`ALTER TABLE clicks ADD COLUMN link_id INTEGER`, () => {});
    db.run(`ALTER TABLE clicks ADD COLUMN click_type TEXT`, () => {});
    
    // Add new columns to articles table for existing databases
    db.run(`ALTER TABLE articles ADD COLUMN domain TEXT`, () => {});
    db.run(`ALTER TABLE articles ADD COLUMN click_count INTEGER DEFAULT 0`, () => {});
    db.run(`ALTER TABLE articles ADD COLUMN last_clicked_at DATETIME`, () => {});
    
    if (callback) callback();
  });
}

/**
 * Generate archive.ph submission URL to force archiving
 */
function generateArchiveSubmissionUrl(originalUrl) {
  if (!originalUrl) {
    console.warn('generateArchiveSubmissionUrl: originalUrl is null or undefined');
    return 'https://archive.ph';
  }
  return `https://dgy3yyibpm3nn7.archive.ph/?url=${encodeURIComponent(originalUrl)}`;
}

/**
 * Generate direct archive.ph URL for accessing archived version
 */
function generateArchiveDirectUrl(originalUrl) {
  if (!originalUrl) {
    console.warn('generateArchiveDirectUrl: originalUrl is null or undefined');
    return 'https://archive.ph';
  }
  return `https://archive.ph/${encodeURIComponent(originalUrl)}`;
}

/**
 * Save archive URL to database for a story
 */
function saveArchiveUrl(storyId, originalUrl, archiveUrl, source) {
  if (!db) return;
  
  console.log(`💾 SAVING ARCHIVE URL: Story ${storyId} [${source}] -> ${archiveUrl}`);
  
  // Update the links table with archive URL
  db.run(`UPDATE links SET archive_url = ? WHERE story_id = ? AND source = ?`, 
    [archiveUrl, storyId, source], (err) => {
      if (err) {
        console.error('Error saving archive URL to links:', err);
      } else {
        console.log(`✅ Archive URL saved for story ${storyId}`);
      }
    });
    
  // Also save to clicks table for the most recent click
  db.run(`UPDATE clicks SET archive_url = ? WHERE id = (
    SELECT id FROM clicks WHERE story_id = ? ORDER BY clicked_at DESC LIMIT 1
  )`, 
    [archiveUrl, storyId], (err) => {
      if (err) {
        console.error('Error saving archive URL to clicks:', err);
      }
    });
}

/**
 * Track when a story appears in the menu - adds to links table
 */
function trackLinkAppearance(story, source) {
  if (!db) return;
  
  // Handle stories without URLs (like HN text posts)
  let storyUrl = story.url;
  if (!storyUrl) {
    if (source === 'hn' && typeof story.id === 'number') {
      // For HN text posts, use the HN discussion URL as the main URL
      storyUrl = `https://news.ycombinator.com/item?id=${story.id}`;
    } else {
      console.warn('Skipping story without URL:', story.title);
      return;
    }
  }
  
  // Convert story ID to integer - use hash for string IDs
  let storyId;
  if (typeof story.id === 'number') {
    storyId = story.id;
  } else {
    storyId = hashStringToInt(story.id);
  }
  
  // Generate comments URL based on source
  let commentsUrl = null;
  if (story.comments_url) {
    commentsUrl = story.comments_url;
  } else if (source === 'reddit') {
    commentsUrl = storyUrl; // For Reddit, the URL is the comments page
  } else if (source === 'hn' && typeof story.id === 'number') {
    commentsUrl = `https://news.ycombinator.com/item?id=${story.id}`;
  }
  
  
  // Check if link already exists
  db.get('SELECT id, times_appeared FROM links WHERE story_id = ? AND source = ?', [storyId, source], (err, row) => {
    if (err) {
      console.error('Error checking existing link:', err);
      return;
    }
    
    if (row) {
      // Link exists, update it
      db.run(`UPDATE links SET 
        title = ?, 
        points = ?, 
        comments = ?, 
        comments_url = ?,
        last_seen_at = CURRENT_TIMESTAMP,
        times_appeared = times_appeared + 1
        WHERE id = ?`, 
        [story.title || 'Untitled', story.points, story.comments, commentsUrl, row.id], (updateErr) => {
          if (updateErr) {
            console.error('Error updating link:', updateErr);
          }
        });
    } else {
      // New link, insert it
      console.log(`💾 PERSISTING NEW LINK TO DATABASE: [${source.toUpperCase()}] Story ID: ${storyId}`);
      db.run(`INSERT INTO links (
        story_id, title, url, comments_url, source, points, comments
      ) VALUES (?, ?, ?, ?, ?, ?, ?)`, 
        [storyId, story.title || 'Untitled', storyUrl, commentsUrl, source, story.points, story.comments], 
        function(err) {
          if (err) {
            console.error('Error inserting link:', err);
          } else {
            console.log(`✅ NEW LINK PERSISTED: Database ID ${this.lastID}, Story ID: ${storyId}, Source: ${source.toUpperCase()}, Title: "${story.title || 'Untitled'}"`);
          }
        });
    }
  });
}

/**
 * Legacy function - now calls trackLinkAppearance
 */
function trackStoryAppearance(story) {
  // Determine source from URL or story properties
  let source = 'unknown';
  if (story.url && story.url.includes('reddit.com')) {
    source = 'reddit';
  } else if (typeof story.id === 'number') {
    source = 'hn';
  } else if (story.url && (story.url.includes('pinboard.in') || story.source === 'pinboard')) {
    source = 'pinboard';
  }
  
  trackLinkAppearance(story, source);
}

/**
 * Track when a user engages with a story (expands submenu, hovers, shows interest)
 */
function trackEngagement(storyId, source) {
  if (!db) return;
  
  // Convert story ID to integer - use hash for string IDs
  let normalizedStoryId;
  if (typeof storyId === 'number') {
    normalizedStoryId = storyId;
  } else {
    normalizedStoryId = hashStringToInt(storyId);
  }
  
  console.log(`🎯 ENGAGEMENT TRACKED: [${source.toUpperCase()}] Story ID: ${normalizedStoryId}`);
  
  // Update the link with engagement data
  db.run(`UPDATE links SET 
    engaged = TRUE, 
    engaged_at = CURRENT_TIMESTAMP,
    engagement_count = engagement_count + 1
    WHERE story_id = ? AND source = ?`, 
    [normalizedStoryId, source], (err) => {
      if (err) {
        console.error('Error tracking engagement:', err);
      } else {
        console.log(`✅ ENGAGEMENT RECORDED: [${source.toUpperCase()}] Story ID: ${normalizedStoryId}`);
      }
    });
}

/**
 * Track when a user expands a story menu (shows the submenu) - now tracks engagement
 */
function trackExpansion(storyId, source) {
  trackEngagement(storyId, source);
}

/**
 * Track when a user clicks through to an article
 */
function trackArticleClick(storyId, source) {
  console.log(`🔗 ARTICLE CLICK: [${source.toUpperCase()}] Story ID: ${storyId}`);
  trackClickEvent(storyId, source, 'article');
  markLinkAsViewed(storyId, source);
}

/**
 * Track when a user clicks through to comments
 */
function trackCommentsClick(storyId, source) {
  console.log(`💬 COMMENTS CLICK: [${source.toUpperCase()}] Story ID: ${storyId}`);
  trackClickEvent(storyId, source, 'comments');
}

/**
 * Track when a user clicks through to archive
 */
function trackArchiveClick(storyId, source) {
  console.log(`📚 ARCHIVE CLICK: [${source.toUpperCase()}] Story ID: ${storyId}`);
  trackClickEvent(storyId, source, 'archive');
}

/**
 * Internal function to track specific click events
 */
function trackClickEvent(storyId, source, clickType) {
  if (!db) return;
  
  // Convert story ID to integer - use hash for string IDs
  let normalizedStoryId;
  if (typeof storyId === 'number') {
    normalizedStoryId = storyId;
  } else {
    normalizedStoryId = hashStringToInt(storyId);
  }
  
  console.log(`🎪 CLICK EVENT: [${source.toUpperCase()}] Story ID: ${normalizedStoryId}, Type: ${clickType}`);
  
  // Find the link data for insertion
  db.get('SELECT id, story_id, title, url FROM links WHERE story_id = ? AND source = ?', [normalizedStoryId, source], (err, row) => {
    if (err) {
      console.error('Error finding link for click tracking:', err);
      return;
    }
    
    if (row) {
      // Record the click with all required legacy fields
      console.log(`💾 PERSISTING CLICK TO DATABASE: Link ID ${row.id}, Type: ${clickType}`);
      db.run('INSERT INTO clicks (story_id, title, url, link_id, click_type, clicked_at) VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)', 
        [row.story_id, row.title, row.url, row.id, clickType], (insertErr) => {
        if (insertErr) {
          console.error('Error tracking click:', insertErr);
        } else {
          console.log(`✅ CLICK PERSISTED: Link ID ${row.id}, Type: ${clickType}, Story ID: ${normalizedStoryId}`);
        }
      });
    } else {
      console.warn('No link found for click tracking:', normalizedStoryId, source);
    }
  });
}

/**
 * Mark a link as viewed and update viewed_at timestamp
 */
function markLinkAsViewed(storyId, source) {
  if (!db) return;
  
  // Convert story ID to integer - use hash for string IDs
  let normalizedStoryId;
  if (typeof storyId === 'number') {
    normalizedStoryId = storyId;
  } else {
    normalizedStoryId = hashStringToInt(storyId);
  }
  
  console.log(`👀 MARKING LINK AS VIEWED: [${source.toUpperCase()}] Story ID: ${normalizedStoryId}`);
  
  db.run('UPDATE links SET viewed = TRUE, viewed_at = CURRENT_TIMESTAMP WHERE story_id = ? AND source = ?', 
    [normalizedStoryId, source], (err) => {
      if (err) {
        console.error('Error marking link as viewed:', err);
      } else {
        console.log(`✅ LINK MARKED AS VIEWED: [${source.toUpperCase()}] Story ID: ${normalizedStoryId}`);
      }
    });
}

/**
 * Legacy function - now calls trackArticleClick
 */
function trackClick(storyId, title, url, points, comments, commentsUrl = null) {
  // Determine source from URL
  let source = 'unknown';
  if (url && url.includes('reddit.com')) {
    source = 'reddit';
  } else if (typeof storyId === 'number') {
    source = 'hn';
  } else if (url && url.includes('pinboard.in')) {
    source = 'pinboard';
  }
  
  trackArticleClick(storyId, source);
}

function addTagToStory(storyId, tag) {
  if (db && tag && tag.trim()) {
    const cleanTag = tag.trim().toLowerCase();
    
    // Convert story ID to integer - use hash for string IDs
    let normalizedStoryId;
    if (typeof storyId === 'number') {
      normalizedStoryId = storyId;
    } else {
      normalizedStoryId = hashStringToInt(storyId);
    }
    
    // Get current tags for the story from links table
    db.get('SELECT tags FROM links WHERE story_id = ?', [normalizedStoryId], (err, row) => {
      if (!err) {
        let currentTags = [];
        if (row && row.tags) {
          currentTags = row.tags.split(',').map(t => t.trim()).filter(t => t);
        }
        
        // Add new tag if not already present
        if (!currentTags.includes(cleanTag)) {
          currentTags.push(cleanTag);
          const updatedTags = currentTags.join(',');
          
          // Update the links table
          db.run('UPDATE links SET tags = ? WHERE story_id = ?', [updatedTags, normalizedStoryId], (err) => {
            if (err) {
              console.error('Error adding tag to links:', err);
            } else {
              console.log(`✅ Tag "${cleanTag}" added to story ${normalizedStoryId} in links table`);
            }
          });
        } else {
          console.log(`⚠️ Tag "${cleanTag}" already exists for story ${normalizedStoryId}`);
        }
      } else {
        console.warn(`⚠️ Story ${normalizedStoryId} not found in links table for tagging`);
      }
    });
  }
}

function addMultipleTagsToStory(storyId, tags) {
  if (db && tags && tags.length > 0) {
    // Convert story ID to integer - use hash for string IDs
    let normalizedStoryId;
    if (typeof storyId === 'number') {
      normalizedStoryId = storyId;
    } else {
      normalizedStoryId = hashStringToInt(storyId);
    }
    
    // Get current tags for the story from links table
    db.get('SELECT tags FROM links WHERE story_id = ?', [normalizedStoryId], (err, row) => {
      if (!err) {
        let currentTags = [];
        if (row && row.tags) {
          currentTags = row.tags.split(',').map(t => t.trim()).filter(t => t);
        }
        
        // Add all new tags that aren't already present
        const cleanTags = tags.map(tag => tag.trim().toLowerCase()).filter(tag => tag);
        const newTags = cleanTags.filter(tag => !currentTags.includes(tag));
        
        if (newTags.length > 0) {
          const allTags = [...currentTags, ...newTags];
          const updatedTags = allTags.join(',');
          
          // Update the links table
          db.run('UPDATE links SET tags = ? WHERE story_id = ?', [updatedTags, normalizedStoryId], (err) => {
            if (err) {
              console.error('Error adding tags to links:', err);
            } else {
              console.log(`✅ Added ${newTags.length} tags to story ${normalizedStoryId}: ${newTags.join(', ')}`);
            }
          });
        } else {
          console.log(`⚠️ All tags already exist for story ${normalizedStoryId}`);
        }
      } else {
        console.warn(`⚠️ Story ${normalizedStoryId} not found in links table for tagging`);
      }
    });
  }
}

function getStoryTags(storyId, callback) {
  if (db) {
    // Convert story ID to integer - use hash for string IDs
    let normalizedStoryId;
    if (typeof storyId === 'number') {
      normalizedStoryId = storyId;
    } else {
      normalizedStoryId = hashStringToInt(storyId);
    }
    
    // Get the internal story ID first
    db.get('SELECT id FROM stories WHERE story_id = ?', [normalizedStoryId], (err, storyRow) => {
      if (err) {
        callback(err, []);
        return;
      }
      
      if (storyRow) {
        // Get tags from normalized tags table
        db.all('SELECT tag FROM tags WHERE story_id = ? ORDER BY created_at', [storyRow.id], (err, tagRows) => {
          if (err) {
            callback(err, []);
          } else {
            const tags = tagRows.map(row => row.tag);
            callback(null, tags);
          }
        });
      } else {
        callback(null, []);
      }
    });
  } else {
    callback(null, []);
  }
}

function removeTagFromStory(storyId, tagToRemove) {
  if (db && tagToRemove) {
    // Convert story ID to integer - use hash for string IDs
    let normalizedStoryId;
    if (typeof storyId === 'number') {
      normalizedStoryId = storyId;
    } else {
      normalizedStoryId = hashStringToInt(storyId);
    }
    
    db.get('SELECT tags FROM stories WHERE story_id = ?', [normalizedStoryId], (err, row) => {
      if (!err && row && row.tags) {
        const currentTags = row.tags.split(',').map(t => t.trim()).filter(t => t);
        const updatedTags = currentTags.filter(tag => tag !== tagToRemove.trim().toLowerCase());
        const newTagsString = updatedTags.join(',');
        
        db.run('UPDATE stories SET tags = ? WHERE story_id = ?', [newTagsString, normalizedStoryId], (err) => {
          if (err) {
            console.error('Error removing tag:', err);
          }
        });
      }
    });
  }
}

function getAllUniqueTags(callback) {
  if (db) {
    db.all('SELECT DISTINCT tags FROM stories WHERE tags IS NOT NULL AND tags != ""', (err, rows) => {
      if (err) {
        callback(err, []);
        return;
      }
      
      // Parse all tag strings and create a unique set
      const allTags = new Set();
      
      rows.forEach(row => {
        if (row.tags) {
          const tags = row.tags.split(',').map(t => t.trim()).filter(t => t);
          tags.forEach(tag => allTags.add(tag));
        }
      });
      
      // Convert to sorted array
      const uniqueTags = Array.from(allTags).sort();
      callback(null, uniqueTags);
    });
  } else {
    callback(null, []);
  }
}

function saveArticle(articleData, callback) {
  if (!db) {
    callback(new Error('Database not initialized'));
    return;
  }

  const {
    url, title, author, publishDate, content, textContent, 
    wordCount, readingTime, tags = null, notes = null
  } = articleData;

  const domain = extractDomain(url);

  db.run(`INSERT OR REPLACE INTO articles 
    (url, title, domain, author, publish_date, content, text_content, word_count, reading_time, tags, notes) 
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [url, title, domain, author, publishDate, content, textContent, wordCount, readingTime, tags, notes],
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

function trackSavedArticleClick(articleId, callback) {
  if (!db) {
    if (callback) callback(new Error('Database not initialized'));
    return;
  }

  console.log(`📖 SAVED ARTICLE CLICK: Article ID: ${articleId}`);

  db.run(`UPDATE articles 
          SET click_count = click_count + 1, last_clicked_at = CURRENT_TIMESTAMP 
          WHERE id = ?`, 
    [articleId], 
    function(err) {
      if (err) {
        console.error('Error tracking article click:', err);
      } else {
        console.log(`✅ SAVED ARTICLE CLICK TRACKED: Article ID: ${articleId}`);
      }
      if (callback) callback(err);
    }
  );
}

function getArticles(limit = 50, offset = 0, callback) {
  if (!db) {
    callback(new Error('Database not initialized'));
    return;
  }

  db.all(`SELECT * FROM articles 
          ORDER BY click_count DESC, saved_at DESC 
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

function searchStoriesByTags(tagQuery, callback) {
  if (!db) {
    callback(new Error('Database not initialized'));
    return;
  }

  if (!tagQuery || !tagQuery.trim()) {
    callback(null, []);
    return;
  }

  // Parse comma-separated tags and clean them
  const searchTags = tagQuery.split(',').map(tag => tag.trim().toLowerCase()).filter(tag => tag);
  
  if (searchTags.length === 0) {
    callback(null, []);
    return;
  }

  // Build WHERE clause for OR conditions on tags
  const tagConditions = searchTags.map(() => 'tags LIKE ?').join(' OR ');
  const tagParams = searchTags.map(tag => `%${tag}%`);
  
  const query = `
    SELECT story_id, title, url, points, comments, tags, impression_count, first_seen_at
    FROM stories 
    WHERE (${tagConditions}) AND tags IS NOT NULL AND tags != ''
    ORDER BY impression_count DESC, first_seen_at DESC
    LIMIT 20
  `;

  db.all(query, tagParams, (err, rows) => {
    if (err) {
      console.error('Error searching stories by tags:', err);
      callback(err, []);
    } else {
      // Transform database rows to story format and filter out stories without URLs
      const stories = rows
        .map(row => ({
          id: row.story_id,
          title: row.title,
          url: row.url,
          points: row.points || 0,
          comments: row.comments || 0,
          tags: row.tags ? row.tags.split(',').map(t => t.trim()).filter(t => t) : [],
          impression_count: row.impression_count || 0,
          first_seen_at: row.first_seen_at
        }))
        .filter(story => story.url && story.url.trim()); // Filter out stories without valid URLs
      
      callback(null, stories);
    }
  });
}

function getDatabase() {
  return db;
}

/**
 * Clear module cache for development hot reloading
 */
function clearModuleCache() {
  if (process.env.NODE_ENV === 'development') {
    const srcPath = require('path').join(__dirname);
    Object.keys(require.cache).forEach(key => {
      if (key.startsWith(srcPath)) {
        delete require.cache[key];
        console.log('Cleared cache for:', key);
      }
    });
  }
}

/**
 * Clear all data from the database (development only)
 */
function clearAllData(callback) {
  if (process.env.NODE_ENV !== 'development') {
    console.error('clearAllData can only be used in development mode');
    return;
  }
  
  if (!db) {
    console.error('Database not initialized');
    return;
  }

  db.serialize(() => {
    db.run('DELETE FROM articles_fts', (err) => {
      if (err) console.error('Error clearing articles_fts:', err);
    });
    
    db.run('DELETE FROM articles', (err) => {
      if (err) console.error('Error clearing articles:', err);
    });
    
    db.run('DELETE FROM clicks', (err) => {
      if (err) console.error('Error clearing clicks:', err);
    });
    
    db.run('DELETE FROM links', (err) => {
      if (err) console.error('Error clearing links:', err);
    });
    
    db.run('DELETE FROM stories', (err) => {
      if (err) console.error('Error clearing stories:', err);
      console.log('Database cleared successfully');
      if (callback) callback();
    });
  });
}

/**
 * Clear all tags from the database
 */
function clearAllTags(callback) {
  if (!db) {
    console.error('Database not initialized');
    if (callback) callback(new Error('Database not initialized'));
    return;
  }

  console.log('🗑️ Clearing all tags from database...');
  
  db.serialize(() => {
    // Clear tags from stories table
    db.run('UPDATE stories SET tags = NULL', (err) => {
      if (err) {
        console.error('Error clearing tags from stories:', err);
      } else {
        console.log('✅ Tags cleared from stories table');
      }
    });
    
    // Clear tags from links table
    db.run('UPDATE links SET tags = NULL', (err) => {
      if (err) {
        console.error('Error clearing tags from links:', err);
      } else {
        console.log('✅ Tags cleared from links table');
      }
    });
    
    // Clear tags from clicks table
    db.run('UPDATE clicks SET tags = NULL', (err) => {
      if (err) {
        console.error('Error clearing tags from clicks:', err);
      } else {
        console.log('✅ Tags cleared from clicks table');
        console.log('🎉 All tags cleared successfully');
        if (callback) callback();
      }
    });
  });
}

module.exports = {
  initDatabase,
  generateArchiveSubmissionUrl,
  generateArchiveDirectUrl,
  saveArchiveUrl,
  trackStoryAppearance,
  trackLinkAppearance,
  trackEngagement,
  trackExpansion,
  trackArticleClick,
  trackCommentsClick,
  trackArchiveClick,
  trackClick,
  markLinkAsViewed,
  addTagToStory,
  getStoryTags,
  removeTagFromStory,
  getAllUniqueTags,
  searchStoriesByTags,
  saveArticle,
  getArticles,
  searchArticles,
  getArticleStats,
  trackSavedArticleClick,
  getDatabase,
  clearModuleCache,
  clearAllData,
  clearAllTags,
  addMultipleTagsToStory
};