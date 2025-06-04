/**
 * Background tagging service using Claude AI
 * Automatically tags untagged links in the database
 */

const { getDatabase, addMultipleTagsToStory } = require('./database');
const { generateTagSuggestions } = require('./claude-integration');

let taggingInterval = null;
let isTagging = false;

/**
 * Start the background tagging service
 */
function startBackgroundTagging() {
  if (taggingInterval) {
    console.log('🏷️ Background tagging already running');
    return;
  }

  console.log('🏷️ Starting background tagging service (runs every hour)');
  
  // Run immediately on start
  processUntaggedLinks();
  
  // Set up hourly interval
  taggingInterval = setInterval(() => {
    processUntaggedLinks();
  }, 60 * 60 * 1000); // 1 hour
}

/**
 * Stop the background tagging service
 */
function stopBackgroundTagging() {
  if (taggingInterval) {
    clearInterval(taggingInterval);
    taggingInterval = null;
    console.log('🏷️ Background tagging service stopped');
  }
}

/**
 * Process untagged links in batches
 */
async function processUntaggedLinks() {
  if (isTagging) {
    console.log('🏷️ Background tagging already in progress, skipping...');
    return;
  }

  isTagging = true;
  console.log('🏷️ Starting background tagging process...');

  try {
    const db = getDatabase();
    if (!db) {
      console.error('❌ Database not available for background tagging');
      return;
    }

    // Get untagged links (limit to 10 per batch to be respectful)
    const untaggedLinks = await getUntaggedLinks(10);
    
    if (untaggedLinks.length === 0) {
      console.log('✅ No untagged links found - all caught up!');
      return;
    }

    console.log(`🏷️ Processing ${untaggedLinks.length} untagged links...`);

    for (const link of untaggedLinks) {
      try {
        await tagSingleLink(link);
        // Add a small delay between requests to be respectful
        await sleep(2000);
      } catch (error) {
        console.error(`❌ Error tagging link ${link.id}:`, error.message);
      }
    }

    console.log('✅ Background tagging batch completed');
  } catch (error) {
    console.error('❌ Error in background tagging process:', error);
  } finally {
    isTagging = false;
  }
}

/**
 * Get untagged links from the database
 */
function getUntaggedLinks(limit = 10) {
  return new Promise((resolve, reject) => {
    const db = getDatabase();
    
    db.all(`
      SELECT id, story_id, title, url, source, points, comments, times_appeared
      FROM links 
      WHERE (tags IS NULL OR tags = '') 
      AND title IS NOT NULL 
      AND title != ''
      ORDER BY times_appeared DESC, last_seen_at DESC
      LIMIT ?
    `, [limit], (err, rows) => {
      if (err) {
        reject(err);
      } else {
        resolve(rows);
      }
    });
  });
}

/**
 * Tag a single link using Claude
 */
async function tagSingleLink(link) {
  console.log(`🤖 Generating tags for: "${link.title}"`);
  
  try {
    const result = await generateTagSuggestions(link.title, link.url);
    
    if (result.success && result.tags && result.tags.length > 0) {
      console.log(`✅ Generated ${result.tags.length} tags for "${link.title}": ${result.tags.join(', ')}`);
      
      // Add tags to the story
      addMultipleTagsToStory(link.story_id, result.tags);
      
      return { success: true, tags: result.tags };
    } else {
      console.log(`⚠️ No tags generated for "${link.title}": ${result.error || 'Unknown reason'}`);
      return { success: false, error: result.error };
    }
  } catch (error) {
    console.error(`❌ Error generating tags for "${link.title}":`, error.message);
    throw error;
  }
}

/**
 * Helper function to sleep
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Get the current status of the background tagging service
 */
function getTaggingStatus() {
  return {
    isRunning: taggingInterval !== null,
    isCurrentlyTagging: isTagging,
    nextRun: taggingInterval ? Date.now() + (60 * 60 * 1000) : null
  };
}

/**
 * Manually trigger a tagging run (for testing/admin purposes)
 */
async function triggerManualTagging() {
  console.log('🏷️ Manual tagging triggered');
  await processUntaggedLinks();
}

/**
 * Re-tag all stories in the database (fresh start)
 */
async function retagAllStories() {
  if (isTagging) {
    throw new Error('Background tagging already in progress');
  }

  isTagging = true;
  console.log('🔄 Starting fresh re-tagging of ALL stories...');

  try {
    const db = getDatabase();
    if (!db) {
      throw new Error('Database not available');
    }

    // First, clear all existing tags
    await clearAllTags();
    
    // Get all stories (not just untagged ones)
    const allStories = await getAllStories();
    console.log(`📊 Found ${allStories.length} total stories to re-tag`);

    if (allStories.length === 0) {
      return { storiesProcessed: 0, message: 'No stories found to tag' };
    }

    let processed = 0;
    let successful = 0;
    let failed = 0;

    // Process in batches of 5 to be more aggressive but still respectful
    for (let i = 0; i < allStories.length; i += 5) {
      const batch = allStories.slice(i, i + 5);
      console.log(`🏷️ Processing batch ${Math.floor(i/5) + 1}/${Math.ceil(allStories.length/5)} (${batch.length} stories)`);

      // Process batch in parallel but with delays
      const batchPromises = batch.map(async (story, index) => {
        // Stagger the requests within the batch
        await sleep(index * 1000);
        
        try {
          await tagSingleLink(story);
          successful++;
          return { success: true, story: story.title };
        } catch (error) {
          failed++;
          console.error(`❌ Failed to tag "${story.title}":`, error.message);
          return { success: false, story: story.title, error: error.message };
        }
      });

      await Promise.all(batchPromises);
      processed += batch.length;
      
      // Longer delay between batches to be respectful
      if (i + 5 < allStories.length) {
        console.log(`⏳ Waiting 10 seconds before next batch...`);
        await sleep(10000);
      }
    }

    const result = {
      storiesProcessed: processed,
      successful: successful,
      failed: failed,
      message: `Re-tagging complete: ${successful}/${processed} stories successfully tagged`
    };

    console.log(`✅ Fresh re-tagging completed: ${successful}/${processed} stories successfully tagged`);
    return result;

  } catch (error) {
    console.error('❌ Error in re-tagging process:', error);
    throw error;
  } finally {
    isTagging = false;
  }
}

/**
 * Clear all tags from the database
 */
function clearAllTags() {
  return new Promise((resolve, reject) => {
    const db = getDatabase();
    
    db.serialize(() => {
      db.run('UPDATE links SET tags = NULL', (err) => {
        if (err) {
          reject(err);
        } else {
          console.log('🗑️ Cleared all tags from links table');
          resolve();
        }
      });
    });
  });
}

/**
 * Get all stories from the database (for fresh re-tagging)
 */
function getAllStories() {
  return new Promise((resolve, reject) => {
    const db = getDatabase();
    
    db.all(`
      SELECT id, story_id, title, url, source, points, comments, times_appeared
      FROM links 
      WHERE title IS NOT NULL 
      AND title != ''
      ORDER BY times_appeared DESC, last_seen_at DESC
    `, [], (err, rows) => {
      if (err) {
        reject(err);
      } else {
        resolve(rows);
      }
    });
  });
}

module.exports = {
  startBackgroundTagging,
  stopBackgroundTagging,
  processUntaggedLinks,
  getTaggingStatus,
  triggerManualTagging,
  retagAllStories
};