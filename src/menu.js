/**
 * Tray menu creation and management
 */

const { Tray, Menu, shell } = require('electron');
const path = require('path');
const { fetchHNStories, fetchRedditStories, fetchPinboardPopular } = require('./api-sources');
const { 
  trackStoryAppearance, 
  trackLinkAppearance,
  trackEngagement,
  trackExpansion,
  trackArticleClick,
  trackCommentsClick,
  trackArchiveClick,
  trackClick, 
  getAllUniqueTags, 
  addTagToStory,
  getStoryTags,
  generateArchiveSubmissionUrl,
  generateArchiveDirectUrl,
  saveArchiveUrl,
  searchStoriesByTags
} = require('./database');
const { promptForCustomTag, showArticleLibrary, promptForTagSearch, showDatabaseBrowser, showArticleBrowser } = require('./ui');
const { showTagSuggestionWindow, generateTagSuggestions } = require('./claude-integration');

let tray = null;
let currentSearchQuery = '';

/**
 * Automatically generate and apply AI tags for a story
 */
async function autoGenerateAndApplyTags(storyId, title, url, source) {
  try {
    console.log(`🤖 Auto-generating tags for: ${title}`);
    const result = await generateTagSuggestions(title, url);
    
    if (result.success && result.tags.length > 0) {
      // Apply all suggested tags automatically in one operation
      const { addMultipleTagsToStory, trackEngagement } = require('./database');
      
      // Log individual tags for visibility
      result.tags.forEach(tag => {
        console.log(`🏷️ Auto-applied tag: ${tag}`);
      });
      
      // Add all tags at once to avoid race conditions
      addMultipleTagsToStory(storyId, result.tags);
      
      // Track engagement for AI tagging
      trackEngagement(storyId, source);
      
      console.log(`✅ Auto-applied ${result.tags.length} AI tags [${result.source}]: ${result.tags.join(', ')}`);
      
      // Refresh menu to show new tags
      setTimeout(updateMenu, 100);
    } else {
      console.log('❌ No AI tags generated');
    }
  } catch (error) {
    console.error('Error in auto-tagging:', error);
  }
}

/**
 * Create menu items for search results
 */
function createSearchResultItems(searchResults) {
  if (!searchResults || searchResults.length === 0) {
    return [{
      label: '🔍 No stories found for these tags',
      enabled: false
    }];
  }

  return searchResults.map(story => ({
    label: `🔍 ${story.title.length > 75 ? story.title.substring(0, 72) + '...' : story.title} [${story.tags.join(', ')}]`,
    click: () => {
      console.log('Search result clicked:', story.title);
      console.log('Story URL:', story.url);
      
      if (!story.url) {
        console.error('Story has no URL:', story);
        return;
      }
      
      const archiveSubmissionUrl = generateArchiveSubmissionUrl(story.url);
      const archiveDirectUrl = generateArchiveDirectUrl(story.url);
      // For search results, comments URL might be stored or generated
      let commentsUrl = story.comments_url;
      if (!commentsUrl && story.url.includes('reddit.com')) {
        commentsUrl = story.url;
      } else if (!commentsUrl && typeof story.id === 'number') {
        commentsUrl = `https://news.ycombinator.com/item?id=${story.id}`;
      }
      trackArticleClick(story.id, 'search');
      
      // Auto-generate and apply AI tags when link is clicked
      autoGenerateAndApplyTags(story.id, story.title, story.url, 'search');
      
      // Save archive URLs to database
      saveArchiveUrl(story.id, story.url, archiveDirectUrl, 'search');
      
      // 1. Open archive.ph submission URL (triggers archiving)
      shell.openExternal(archiveSubmissionUrl);
      
      // 2. Open direct archive.ph link
      setTimeout(() => {
        shell.openExternal(archiveDirectUrl);
      }, 200);
      
      // 3. Open comments if available
      if (commentsUrl && commentsUrl !== story.url) {
        setTimeout(() => {
          shell.openExternal(commentsUrl);
        }, 400);
      }
      
      // 4. Open the original article LAST (becomes active tab)
      setTimeout(() => {
        shell.openExternal(story.url);
      }, 600);
    }
  }));
}

/**
 * Create system tray icon and initialize menu
 */
function createTray() {
  console.log('🎯 Creating tray icon...');
  try {
    const { nativeImage } = require('electron');
    
    // Create a simple monochrome 16x16 tray icon using Canvas-like approach
    // This creates a small circle that should work reliably across platforms
    const size = 16;
    const canvas = Buffer.alloc(size * size * 4); // RGBA buffer
    
    // Fill with transparent background
    for (let i = 0; i < canvas.length; i += 4) {
      canvas[i] = 0;     // R
      canvas[i + 1] = 0; // G  
      canvas[i + 2] = 0; // B
      canvas[i + 3] = 0; // A (transparent)
    }
    
    // Draw a simple filled circle in the center
    const centerX = size / 2;
    const centerY = size / 2;
    const radius = 6;
    
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const distance = Math.sqrt((x - centerX) ** 2 + (y - centerY) ** 2);
        if (distance <= radius) {
          const idx = (y * size + x) * 4;
          canvas[idx] = 255;     // R (white)
          canvas[idx + 1] = 255; // G (white)  
          canvas[idx + 2] = 255; // B (white)
          canvas[idx + 3] = 255; // A (opaque)
        }
      }
    }
    
    // Create the image from raw RGBA buffer
    const trayIcon = nativeImage.createFromBuffer(canvas, {
      width: size,
      height: size
    });
    
    if (trayIcon.isEmpty()) {
      console.warn('⚠️ Created icon is empty, using fallback');
      // Ultra-simple fallback - just create a 1x1 white pixel and resize
      const fallbackCanvas = Buffer.from([255, 255, 255, 255]); // Single white pixel
      const fallbackIcon = nativeImage.createFromBuffer(fallbackCanvas, {
        width: 1,
        height: 1
      });
      tray = new Tray(fallbackIcon.resize({ width: 16, height: 16 }));
    } else {
      tray = new Tray(trayIcon);
    }
    
    console.log('✅ Tray icon created successfully');
    tray.setToolTip('BOB');
    
    updateMenu();
    
    // Update menu every time it's about to be shown
    tray.on('click', () => {
      console.log('🖱️ Tray clicked');
      updateMenu();
    });
    tray.on('right-click', () => {
      console.log('🖱️ Tray right-clicked');
      updateMenu();
    });
    
    // Update menu every 5 minutes
    setInterval(() => {
      console.log('⏰ Periodic menu update');
      updateMenu();
    }, 300000);
    
    console.log('🎉 Tray setup complete');
  } catch (error) {
    console.error('❌ Error creating tray:', error);
    console.error('Stack trace:', error.stack);
    
    // Try to create a fallback tray with minimal setup
    try {
      console.log('🔄 Attempting fallback tray creation...');
      const { nativeImage } = require('electron');
      const emptyIcon = nativeImage.createEmpty();
      tray = new Tray(emptyIcon);
      tray.setToolTip('BOB (fallback)');
      console.log('✅ Fallback tray created');
    } catch (fallbackError) {
      console.error('❌ Fallback tray creation also failed:', fallbackError);
    }
  }
}

/**
 * Update the tray menu with fresh stories from all sources
 */
async function updateMenu() {
  console.log('updateMenu called');
  
  // Get all available tags first for dynamic menus
  const availableTags = await new Promise((resolve) => {
    const baseTags = ['tech', 'ai', 'programming', 'business', 'science', 'news', 'interesting', 'later', 'important'];
    getAllUniqueTags((err, allTags) => {
      if (err || !allTags.length) {
        resolve(baseTags);
      } else {
        resolve([...new Set([...baseTags, ...allTags])].sort());
      }
    });
  });
  
  const allStories = await fetchHNStories();
  const allRedditStories = await fetchRedditStories();
  const allPinboardStories = await fetchPinboardPopular();
  
  // Story distribution optimized for menu length
  const stories = allStories.slice(0, 13); // Top 13 HN stories
  const redditStories = allRedditStories.slice(0, 15); // Top 15 Reddit stories
  const pinboardStories = allPinboardStories.slice(0, 12); // Top 12 Pinboard stories
  
  console.log('Limited stories for menu:', stories.length, 'HN,', redditStories.length, 'Reddit,', pinboardStories.length, 'Pinboard');
  console.log('Total fetched:', allStories.length, 'HN,', allRedditStories.length, 'Reddit,', allPinboardStories.length, 'Pinboard');
  
  // Track all stories appearing in the menu with their specific sources
  stories.forEach(story => trackLinkAppearance(story, 'hn'));
  redditStories.forEach(story => trackLinkAppearance(story, 'reddit'));
  pinboardStories.forEach(story => trackLinkAppearance(story, 'pinboard'));
  
  const menuTemplate = [];

  // If there's an active search, show search results first
  if (currentSearchQuery && currentSearchQuery.trim()) {
    const searchResults = await new Promise((resolve) => {
      searchStoriesByTags(currentSearchQuery, (err, results) => {
        if (err) {
          console.error('Search error:', err);
          resolve([]);
        } else {
          resolve(results);
        }
      });
    });

    const limitedSearchResults = searchResults.slice(0, 10); // Limit search results
    
    menuTemplate.push(
      {
        label: `━━━ SEARCH: "${currentSearchQuery}" (${limitedSearchResults.length}/${searchResults.length}) ━━━`,
        enabled: false
      },
      { type: 'separator' }
    );

    const searchItems = createSearchResultItems(limitedSearchResults);
    menuTemplate.push(...searchItems);

    menuTemplate.push(
      { type: 'separator' },
      {
        label: '❌ Clear Search',
        click: () => {
          currentSearchQuery = '';
          updateMenu();
        }
      },
      { type: 'separator' }
    );
  }

  
  const storyItems = stories.map((story, index) => {
    console.log(`Creating HN story item ${index}:`, story.title);
    return {
      label: `🟠 ${story.title.length > 75 ? story.title.substring(0, 72) + '...' : story.title}`,
      click: () => {
        console.log('HN story clicked:', story.title);
        const hnDiscussionUrl = `https://news.ycombinator.com/item?id=${story.id}`;
        trackArticleClick(story.id, 'hn');
        
        // Auto-generate and apply AI tags when link is clicked
        autoGenerateAndApplyTags(story.id, story.title, story.url, 'hn');
        
        if (story.url) {
          // External link: Open archive + discussion + article (in that order)
          const articleUrl = story.url;
          console.log('HN story URL:', articleUrl);
          
          const archiveSubmissionUrl = generateArchiveSubmissionUrl(articleUrl);
          const archiveDirectUrl = generateArchiveDirectUrl(articleUrl);
          
          // Save archive URLs to database
          saveArchiveUrl(story.id, articleUrl, archiveDirectUrl, 'hn');
          
          // 1. Open archive.ph submission URL (triggers archiving)
          shell.openExternal(archiveSubmissionUrl);
          
          // 2. Open direct archive.ph link
          setTimeout(() => {
            shell.openExternal(archiveDirectUrl);
          }, 200);
          
          // 3. Open HN discussion
          setTimeout(() => {
            shell.openExternal(hnDiscussionUrl);
          }, 400);
          
          // 4. Open the original article LAST (becomes active tab)
          setTimeout(() => {
            shell.openExternal(articleUrl);
          }, 600);
        } else {
          // Self post: Just open HN discussion
          console.log('HN self post, opening discussion:', hnDiscussionUrl);
          shell.openExternal(hnDiscussionUrl);
        }
      }
    };
  });
  
  menuTemplate.push(...storyItems);
  
  const redditStoryItems = redditStories.map(story => ({
    label: `👽 ${story.title.length > 75 ? story.title.substring(0, 72) + '...' : story.title}`,
    click: () => {
      console.log('Reddit story clicked:', story.title);
      // For Reddit: open archive + actual content + Reddit discussion (in that order)
      const targetUrl = story.is_self ? story.url : story.actual_url;
      const redditCommentsUrl = story.url; // Reddit discussion URL
      const archiveSubmissionUrl = generateArchiveSubmissionUrl(targetUrl);
      const archiveDirectUrl = generateArchiveDirectUrl(targetUrl);
      trackArticleClick(story.id, 'reddit');
      
      // Auto-generate and apply AI tags when link is clicked
      autoGenerateAndApplyTags(story.id, story.title, targetUrl, 'reddit');
      
      // Save archive URLs to database
      saveArchiveUrl(story.id, targetUrl, archiveDirectUrl, 'reddit');
      
      // 1. Open archive.ph submission URL (triggers archiving)
      shell.openExternal(archiveSubmissionUrl);
      
      // 2. Open direct archive.ph link
      setTimeout(() => {
        shell.openExternal(archiveDirectUrl);
      }, 200);
      
      // 3. Open Reddit discussion page
      setTimeout(() => {
        shell.openExternal(story.url); // This is always the Reddit discussion URL
      }, 400);
      
      // 4. Open the actual article content LAST (becomes active tab)
      setTimeout(() => {
        shell.openExternal(targetUrl);
      }, 600);
    }
  }));
  
  menuTemplate.push(...redditStoryItems);
  
  const pinboardStoryItems = pinboardStories.map(story => ({
    label: `📌 ${story.title.length > 75 ? story.title.substring(0, 72) + '...' : story.title}`,
    click: () => {
      console.log('Pinboard story clicked:', story.title);
      // For Pinboard: open archive + article (no discussion)
      const archiveSubmissionUrl = generateArchiveSubmissionUrl(story.url);
      const archiveDirectUrl = generateArchiveDirectUrl(story.url);
      trackArticleClick(story.id, 'pinboard');
      
      // Auto-generate and apply AI tags when link is clicked
      autoGenerateAndApplyTags(story.id, story.title, story.url, 'pinboard');
      
      // Save archive URLs to database
      saveArchiveUrl(story.id, story.url, archiveDirectUrl, 'pinboard');
      
      // 1. Open archive.ph submission URL (triggers archiving)
      shell.openExternal(archiveSubmissionUrl);
      
      // 2. Open direct archive.ph link
      setTimeout(() => {
        shell.openExternal(archiveDirectUrl);
      }, 200);
      
      // 3. Open the original article LAST (becomes active tab)
      setTimeout(() => {
        shell.openExternal(story.url);
      }, 400);
    }
  }));
  
  menuTemplate.push(...pinboardStoryItems);
  
  menuTemplate.push(
    { type: 'separator' },
    {
      label: '🗄️ Database Browser',
      click: () => {
        showDatabaseBrowser();
      }
    },
    {
      label: '🔍 Search by Tags',
      click: () => {
        promptForTagSearch((query) => {
          currentSearchQuery = query;
          updateMenu(); // Refresh menu with search results
        });
      }
    }
  );

  // Add development menu items if in dev mode
  if (process.env.NODE_ENV === 'development') {
    menuTemplate.push(
      { type: 'separator' },
      {
        label: '🔄 Reload',
        click: () => {
          const { clearModuleCache } = require('./database');
          clearModuleCache();
          updateMenu();
          console.log('App modules reloaded');
        }
      },
      {
        label: '🗑️ Clear DB',
        click: () => {
          const { clearAllData } = require('./database');
          clearAllData(() => {
            updateMenu();
            console.log('Database cleared and menu refreshed');
          });
        }
      }
    );
  }

  menuTemplate.push(
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => {
        const { app } = require('electron');
        app.quit();
      }
    }
  );

  console.log('Building menu with', menuTemplate.length, 'items');
  const contextMenu = Menu.buildFromTemplate(menuTemplate);
  tray.setContextMenu(contextMenu);
  console.log('Menu set successfully');
}

module.exports = {
  createTray,
  updateMenu
};