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
  const dbPath = path.join(__dirname, '..', 'clicks.db');
  console.log('Database path:', dbPath);
  db = new sqlite3.Database(dbPath);
  
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
    
    db.run(`ALTER TABLE clicks ADD COLUMN points INTEGER`, () => {});
    db.run(`ALTER TABLE clicks ADD COLUMN comments INTEGER`, () => {});
    db.run(`ALTER TABLE clicks ADD COLUMN story_added_at DATETIME`, () => {});
    
    // Add archive URL columns to existing tables
    db.run(`ALTER TABLE clicks ADD COLUMN archive_url TEXT`, () => {});
    db.run(`ALTER TABLE stories ADD COLUMN url TEXT`, () => {});
    db.run(`ALTER TABLE stories ADD COLUMN archive_url TEXT`, () => {});
    db.run(`ALTER TABLE stories ADD COLUMN tags TEXT`, () => {});
    db.run(`ALTER TABLE clicks ADD COLUMN tags TEXT`, () => {});
    db.run(`ALTER TABLE stories ADD COLUMN impression_count INTEGER DEFAULT 0`, () => {});
    
    // Create unique index on URL to prevent duplicates
    db.run(`CREATE UNIQUE INDEX IF NOT EXISTS idx_stories_url ON stories(url)`, () => {});
    
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
 * Track when a story appears in the menu (impression tracking)
 */
function trackStoryAppearance(story) {
  if (db) {
    const archiveUrl = generateArchiveSubmissionUrl(story.url);
    
    // Convert story ID to integer - use hash for string IDs
    let storyId;
    if (typeof story.id === 'number') {
      storyId = story.id;
    } else {
      // For string IDs (like Reddit or Pinboard), create a hash
      storyId = hashStringToInt(story.id);
    }
    
    // Try to insert new story, ignore if URL already exists due to unique constraint
    db.run('INSERT OR IGNORE INTO stories (story_id, title, url, archive_url, points, comments, impression_count) VALUES (?, ?, ?, ?, ?, ?, 1)', 
      [storyId, story.title, story.url, archiveUrl, story.points, story.comments], function(err) {
        if (err) {
          console.error('Error inserting story:', err);
        } else if (this.changes === 0) {
          // Story already exists, increment impression count
          db.run('UPDATE stories SET impression_count = impression_count + 1, points = ?, comments = ? WHERE url = ?', 
            [story.points, story.comments, story.url], (updateErr) => {
              if (updateErr) {
                console.error('Error updating impression count:', updateErr);
              }
            });
        }
      });
  }
}

/**
 * Track when a user clicks on a story
 */
function trackClick(storyId, title, url, points, comments) {
  if (db) {
    // Convert story ID to integer - use hash for string IDs
    let normalizedStoryId;
    if (typeof storyId === 'number') {
      normalizedStoryId = storyId;
    } else {
      normalizedStoryId = hashStringToInt(storyId);
    }
    
    const archiveUrl = generateArchiveSubmissionUrl(url);
    db.get('SELECT first_seen_at FROM stories WHERE story_id = ?', [normalizedStoryId], (err, row) => {
      const storyAddedAt = row ? row.first_seen_at : new Date().toISOString();
      
      db.run('INSERT INTO clicks (story_id, title, url, archive_url, points, comments, story_added_at) VALUES (?, ?, ?, ?, ?, ?, ?)', 
        [normalizedStoryId, title, url, archiveUrl, points, comments, storyAddedAt], function(err) {
        if (err) {
          console.error('Error tracking click:', err);
        }
      });
    });
  }
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
    
    // Get current tags for the story
    db.get('SELECT tags FROM stories WHERE story_id = ?', [normalizedStoryId], (err, row) => {
      if (!err) {
        let currentTags = [];
        if (row && row.tags) {
          currentTags = row.tags.split(',').map(t => t.trim()).filter(t => t);
        }
        
        // Add new tag if not already present
        if (!currentTags.includes(cleanTag)) {
          currentTags.push(cleanTag);
          const updatedTags = currentTags.join(',');
          
          db.run('UPDATE stories SET tags = ? WHERE story_id = ?', [updatedTags, normalizedStoryId], (err) => {
            if (err) {
              console.error('Error adding tag:', err);
            }
          });
        }
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
    
    db.get('SELECT tags FROM stories WHERE story_id = ?', [normalizedStoryId], (err, row) => {
      if (err) {
        callback(err, []);
      } else {
        const tags = row && row.tags ? row.tags.split(',').map(t => t.trim()).filter(t => t) : [];
        callback(null, tags);
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

function trackArticleClick(articleId, callback) {
  if (!db) {
    if (callback) callback(new Error('Database not initialized'));
    return;
  }

  db.run(`UPDATE articles 
          SET click_count = click_count + 1, last_clicked_at = CURRENT_TIMESTAMP 
          WHERE id = ?`, 
    [articleId], 
    function(err) {
      if (err) {
        console.error('Error tracking article click:', err);
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
    
    db.run('DELETE FROM stories', (err) => {
      if (err) console.error('Error clearing stories:', err);
      console.log('Database cleared successfully');
      if (callback) callback();
    });
  });
}

module.exports = {
  initDatabase,
  generateArchiveSubmissionUrl,
  generateArchiveDirectUrl,
  trackStoryAppearance,
  trackClick,
  addTagToStory,
  getStoryTags,
  removeTagFromStory,
  getAllUniqueTags,
  searchStoriesByTags,
  saveArticle,
  getArticles,
  searchArticles,
  getArticleStats,
  trackArticleClick,
  getDatabase,
  clearModuleCache,
  clearAllData
};