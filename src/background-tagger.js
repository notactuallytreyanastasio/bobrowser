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

module.exports = {
  startBackgroundTagging,
  stopBackgroundTagging,
  processUntaggedLinks,
  getTaggingStatus,
  triggerManualTagging
};