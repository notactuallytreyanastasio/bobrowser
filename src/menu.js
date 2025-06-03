/**
 * Tray menu creation and management
 */

const { Tray, Menu, shell } = require('electron');
const path = require('path');
const { fetchHNStories, fetchRedditStories, fetchPinboardPopular } = require('./api-sources');
const { 
  trackStoryAppearance, 
  trackClick, 
  getAllUniqueTags, 
  addTagToStory,
  getStoryTags,
  generateArchiveSubmissionUrl,
  generateArchiveDirectUrl,
  searchStoriesByTags
} = require('./database');
const { promptForCustomTag, showArticleLibrary, promptForTagSearch, showDatabaseBrowser, showArticleBrowser } = require('./ui');

let tray = null;
let currentSearchQuery = '';

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
    submenu: [
      {
        label: '🚀 Open Article + Archive',
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
          trackClick(story.id, story.title, story.url, story.points, story.comments, commentsUrl);
          
          // 1. Open archive.ph submission URL (triggers archiving)
          shell.openExternal(archiveSubmissionUrl);
          
          // 2. Open direct archive.ph link
          setTimeout(() => {
            shell.openExternal(archiveDirectUrl);
          }, 200);
          
          // 3. Open the original article
          setTimeout(() => {
            shell.openExternal(story.url);
          }, 400);
        }
      },
      { type: 'separator' },
      {
        label: '🏷️ Add Tag',
        submenu: [
          {
            label: '✏️ Custom Tag...',
            click: () => {
              promptForCustomTag(story.id, story.title);
            }
          }
        ]
      },
      { type: 'separator' },
      {
        label: '🔗 Open Original',
        click: () => {
          shell.openExternal(story.url);
        }
      },
      {
        label: '📚 Open Archive',
        click: () => {
          const archiveDirectUrl = generateArchiveDirectUrl(story.url);
          shell.openExternal(archiveDirectUrl);
        }
      }
    ]
  }));
}

/**
 * Create system tray icon and initialize menu
 */
function createTray() {
  try {
    tray = new Tray(path.join(__dirname, '..', 'icon.png'));
    tray.setToolTip('BOB');
    
    updateMenu();
    
    // Update menu every time it's about to be shown
    tray.on('click', updateMenu);
    tray.on('right-click', updateMenu);
    
    setInterval(updateMenu, 300000);
  } catch (error) {
    console.error('Error creating tray:', error);
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
  
  const stories = await fetchHNStories();
  const redditStories = await fetchRedditStories();
  const pinboardStories = await fetchPinboardPopular();
  
  console.log('Fetched stories:', stories.length, 'HN,', redditStories.length, 'Reddit,', pinboardStories.length, 'Pinboard');
  
  stories.forEach(story => trackStoryAppearance(story));
  redditStories.forEach(story => trackStoryAppearance(story));
  pinboardStories.forEach(story => trackStoryAppearance(story));
  
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

    menuTemplate.push(
      {
        label: `━━━ SEARCH RESULTS: "${currentSearchQuery}" ━━━`,
        enabled: false
      },
      { type: 'separator' }
    );

    const searchItems = createSearchResultItems(searchResults);
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

  menuTemplate.push(
    {
      label: '━━━━━━ HACKER NEWS ━━━━━━',
      enabled: false
    },
    { type: 'separator' }
  );
  
  const storyItems = stories.map((story, index) => {
    console.log(`Creating HN story item ${index}:`, story.title);
    return {
      label: `🟠 ${story.title.length > 75 ? story.title.substring(0, 72) + '...' : story.title}`,
      submenu: [
        {
          label: '🚀 Open Article + Archive + Discussion',
          click: () => {
            console.log('HN story clicked:', story.title);
            // Open the actual article URL + HN discussion + archive
            const articleUrl = story.url || `https://news.ycombinator.com/item?id=${story.id}`;
            const hnDiscussionUrl = `https://news.ycombinator.com/item?id=${story.id}`;
            
            console.log('HN story URL:', articleUrl);
            
            const archiveSubmissionUrl = generateArchiveSubmissionUrl(articleUrl);
            const archiveDirectUrl = generateArchiveDirectUrl(articleUrl);
            const hnCommentsUrl = `https://news.ycombinator.com/item?id=${story.id}`;
            trackClick(story.id, story.title, articleUrl, story.points, story.comments, hnCommentsUrl);
            
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
          }
        },
        { type: 'separator' },
        {
          label: '🏷️ Add Tag',
          submenu: [
            {
              label: '✏️ Custom Tag...',
              click: () => {
                promptForCustomTag(story.id, story.title);
              }
            },
            { type: 'separator' },
            { label: 'Available Tags:', enabled: false },
            { type: 'separator' },
            ...availableTags.map(tag => ({
              label: tag,
              click: () => {
                addTagToStory(story.id, tag);
                setTimeout(updateMenu, 100);
              }
            }))
          ]
        },
        { type: 'separator' },
        {
          label: '🔗 Open Original',
          click: () => {
            const articleUrl = story.url || `https://news.ycombinator.com/item?id=${story.id}`;
            shell.openExternal(articleUrl);
          }
        },
        {
          label: '📚 Open Archive',
          click: () => {
            const articleUrl = story.url || `https://news.ycombinator.com/item?id=${story.id}`;
            const archiveDirectUrl = generateArchiveDirectUrl(articleUrl);
            shell.openExternal(archiveDirectUrl);
          }
        }
      ]
    };
  });
  
  menuTemplate.push(...storyItems);
  
  menuTemplate.push(
    { type: 'separator' },
    {
      label: '━━━━━━━ REDDIT ━━━━━━━',
      enabled: false
    },
    { type: 'separator' }
  );
  
  const redditStoryItems = redditStories.map(story => ({
    label: `👽 ${story.title.length > 75 ? story.title.substring(0, 72) + '...' : story.title}`,
    submenu: [
      {
        label: '🚀 Open Article + Archive + Discussion',
        click: () => {
          console.log('Reddit story clicked:', story.title);
          // For Reddit: open archive + actual content + Reddit discussion
          const targetUrl = story.is_self ? story.url : story.actual_url;
          const redditCommentsUrl = story.url; // Reddit discussion URL
          const archiveSubmissionUrl = generateArchiveSubmissionUrl(targetUrl);
          const archiveDirectUrl = generateArchiveDirectUrl(targetUrl);
          trackClick(story.id, story.title, targetUrl, story.points, story.comments, redditCommentsUrl);
          
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
      },
      { type: 'separator' },
      {
        label: '🏷️ Add Tag',
        submenu: [
          {
            label: '✏️ Custom Tag...',
            click: () => {
              promptForCustomTag(story.id, story.title);
            }
          },
          { type: 'separator' },
          { label: 'Available Tags:', enabled: false },
          { type: 'separator' },
          ...availableTags.map(tag => ({
            label: tag,
            click: () => {
              addTagToStory(story.id, tag);
              setTimeout(updateMenu, 100);
            }
          })),
          { type: 'separator' },
          {
            label: 'reddit',
            click: () => {
              addTagToStory(story.id, 'reddit');
              setTimeout(updateMenu, 100);
            }
          }
        ]
      },
      { type: 'separator' },
      {
        label: '🔗 Open Article Only',
        click: () => {
          const targetUrl = story.is_self ? story.url : story.actual_url;
          shell.openExternal(targetUrl);
        }
      },
      {
        label: '💬 Open Reddit Discussion',
        click: () => {
          shell.openExternal(story.url);
        }
      },
      {
        label: '📚 Open Archive',
        click: () => {
          const targetUrl = story.is_self ? story.url : story.actual_url;
          const archiveDirectUrl = generateArchiveDirectUrl(targetUrl);
          shell.openExternal(archiveDirectUrl);
        }
      }
    ]
  }));
  
  menuTemplate.push(...redditStoryItems);
  
  menuTemplate.push(
    { type: 'separator' },
    {
      label: '━━━━━━ PINBOARD ━━━━━━',
      enabled: false
    },
    { type: 'separator' }
  );
  
  const pinboardStoryItems = pinboardStories.map(story => ({
    label: `📌 ${story.title.length > 75 ? story.title.substring(0, 72) + '...' : story.title}`,
    submenu: [
      {
        label: '🚀 Open Article + Archive',
        click: () => {
          console.log('Pinboard story clicked:', story.title);
          // For Pinboard: open archive + article (no discussion)
          const archiveSubmissionUrl = generateArchiveSubmissionUrl(story.url);
          const archiveDirectUrl = generateArchiveDirectUrl(story.url);
          trackClick(story.id, story.title, story.url, story.points, story.comments, null);
          
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
      },
      { type: 'separator' },
      {
        label: '🏷️ Add Tag',
        submenu: [
          {
            label: '✏️ Custom Tag...',
            click: () => {
              promptForCustomTag(story.id, story.title);
            }
          },
          { type: 'separator' },
          { label: 'Available Tags:', enabled: false },
          { type: 'separator' },
          ...availableTags.map(tag => ({
            label: tag,
            click: () => {
              addTagToStory(story.id, tag);
              setTimeout(updateMenu, 100);
            }
          })),
          { type: 'separator' },
          {
            label: 'pinboard',
            click: () => {
              addTagToStory(story.id, 'pinboard');
              setTimeout(updateMenu, 100);
            }
          }
        ]
      },
      { type: 'separator' },
      {
        label: '🔗 Open Original',
        click: () => {
          shell.openExternal(story.url);
        }
      },
      {
        label: '📚 Open Archive',
        click: () => {
          const archiveDirectUrl = generateArchiveDirectUrl(story.url);
          shell.openExternal(archiveDirectUrl);
        }
      }
    ]
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
    { type: 'separator' },
    {
      label: '🔍 Search Stories by Tags',
      click: () => {
        promptForTagSearch((query) => {
          currentSearchQuery = query;
          updateMenu(); // Refresh menu with search results
        });
      }
    },
    { type: 'separator' }
  );

  // Add development menu items if in dev mode
  if (process.env.NODE_ENV === 'development') {
    menuTemplate.push(
      {
        label: '🔄 Reload App',
        click: () => {
          const { clearModuleCache } = require('./database');
          clearModuleCache();
          updateMenu();
          console.log('App modules reloaded');
        }
      },
      {
        label: '🗑️ Clear Database',
        click: () => {
          const { clearAllData } = require('./database');
          clearAllData(() => {
            updateMenu();
            console.log('Database cleared and menu refreshed');
          });
        }
      },
      { type: 'separator' }
    );
  }

  menuTemplate.push(
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