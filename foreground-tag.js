#!/usr/bin/env node

/**
 * Foreground tagging script to watch the process in action
 */

const sqlite3 = require('sqlite3').verbose();
const { generateTagSuggestions } = require('./src/claude-integration');
const path = require('path');
const os = require('os');

// Direct database connection
const dbPath = path.join(os.homedir(), 'Library/Application Support/mac_hn/clicks.db');
const db = new sqlite3.Database(dbPath);

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function getUntaggedLinks(limit = 10) {
  return new Promise((resolve, reject) => {
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

function addMultipleTagsToStory(storyId, tags) {
  if (tags && tags.length > 0) {
    const cleanTags = tags.map(tag => tag.trim().toLowerCase()).filter(tag => tag);
    const tagsString = cleanTags.join(',');
    
    db.run('UPDATE links SET tags = ? WHERE story_id = ?', [tagsString, storyId], (err) => {
      if (err) {
        console.error('Error adding tags to database:', err);
      }
    });
  }
}

async function tagSingleLink(link) {
  console.log(`🤖 Generating tags for: "${link.title}"`);
  
  try {
    const result = await generateTagSuggestions(link.title, link.url);
    
    if (result.success && result.tags && result.tags.length > 0) {
      console.log(`✅ Generated ${result.tags.length} tags: ${result.tags.join(', ')}`);
      
      // Add tags to the story
      addMultipleTagsToStory(link.story_id, result.tags);
      
      return { success: true, tags: result.tags };
    } else {
      console.log(`⚠️ No tags generated: ${result.error || 'Unknown reason'}`);
      return { success: false, error: result.error };
    }
  } catch (error) {
    console.error(`❌ Error generating tags: ${error.message}`);
    throw error;
  }
}

async function runForegroundTagging() {
  console.log('🔄 Starting foreground tagging process...');
  
  try {
    const untaggedLinks = await getUntaggedLinks(20); // Get more to see the process
    
    if (untaggedLinks.length === 0) {
      console.log('✅ No untagged links found - all caught up!');
      return;
    }

    console.log(`📊 Found ${untaggedLinks.length} untagged links to process`);
    console.log('');

    let processed = 0;
    let successful = 0;
    let failed = 0;

    for (const link of untaggedLinks) {
      console.log(`\n--- Processing ${processed + 1}/${untaggedLinks.length} ---`);
      console.log(`Story ID: ${link.story_id}, Source: ${link.source}`);
      console.log(`Times appeared: ${link.times_appeared}`);
      
      try {
        await tagSingleLink(link);
        successful++;
      } catch (error) {
        console.error(`❌ Failed: ${error.message}`);
        failed++;
      }
      
      processed++;
      
      // Add delay between requests
      if (processed < untaggedLinks.length) {
        console.log('⏳ Waiting 3 seconds...');
        await sleep(3000);
      }
    }

    console.log(`\n🎉 Foreground tagging completed:`);
    console.log(`📊 Processed: ${processed}`);
    console.log(`✅ Successful: ${successful}`);
    console.log(`❌ Failed: ${failed}`);

  } catch (error) {
    console.error('❌ Error in foreground tagging process:', error);
  }
}

// Run the foreground tagging directly without Electron database init
console.log('💾 Using direct database connection');
runForegroundTagging().then(() => {
  console.log('🏁 Foreground tagging complete');
  db.close();
  process.exit(0);
}).catch(err => {
  console.error('Fatal error:', err);
  db.close();
  process.exit(1);
});