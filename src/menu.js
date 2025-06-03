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
          trackArticleClick(story.id, 'search');
          
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
  
  const allStories = await fetchHNStories();
  const allRedditStories = await fetchRedditStories();
  const allPinboardStories = await fetchPinboardPopular();
  
  // Increased story limits for more content
  const stories = allStories.slice(0, 16); // Top 16 HN stories (doubled)
  const redditStories = allRedditStories.slice(0, 12); // Top 12 Reddit stories (doubled)
  const pinboardStories = allPinboardStories.slice(0, 5); // Top 5 Pinboard stories (+2)
  
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

  menuTemplate.push(
    {
      label: `━━━ HACKER NEWS (${stories.length}) ━━━`,
      enabled: false
    }
  );
  
  const storyItems = stories.map((story, index) => {
    console.log(`Creating HN story item ${index}:`, story.title);
    return {
      label: `🟠 ${story.title.length > 75 ? story.title.substring(0, 72) + '...' : story.title}`,
      submenu: [
        {
          label: story.url ? '🚀 Open Article + Archive + Discussion' : '💬 Open HN Discussion',
          click: () => {
            console.log('HN story clicked:', story.title);
            const hnDiscussionUrl = `https://news.ycombinator.com/item?id=${story.id}`;
            trackArticleClick(story.id, 'hn');
            
            if (story.url) {
              // External link: Open article + archive + discussion
              const articleUrl = story.url;
              console.log('HN story URL:', articleUrl);
              
              const archiveSubmissionUrl = generateArchiveSubmissionUrl(articleUrl);
              const archiveDirectUrl = generateArchiveDirectUrl(articleUrl);
              
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
                trackEngagement(story.id, 'hn'); // Track engagement when user tags
                addTagToStory(story.id, tag);
                setTimeout(updateMenu, 100);
              }
            }))
          ]
        },
        { type: 'separator' },
        ...(story.url ? [
          {
            label: '🔗 Open Original Article',
            click: () => {
              trackArticleClick(story.id, 'hn');
              shell.openExternal(story.url);
            }
          },
          {
            label: '📚 Open Archive',
            click: () => {
              trackArchiveClick(story.id, 'hn');
              const archiveDirectUrl = generateArchiveDirectUrl(story.url);
              shell.openExternal(archiveDirectUrl);
            }
          }
        ] : []),
        {
          label: '💬 Open HN Discussion',
          click: () => {
            trackCommentsClick(story.id, 'hn');
            const hnDiscussionUrl = `https://news.ycombinator.com/item?id=${story.id}`;
            shell.openExternal(hnDiscussionUrl);
          }
        }
      ]
    };
  });
  
  menuTemplate.push(...storyItems);
  
  menuTemplate.push(
    { type: 'separator' },
    {
      label: `━━━ REDDIT (${redditStories.length}) ━━━`,
      enabled: false
    }
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
          trackArticleClick(story.id, 'reddit');
          
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
              trackEngagement(story.id, 'reddit'); // Track engagement when user tags
              addTagToStory(story.id, tag);
              setTimeout(updateMenu, 100);
            }
          })),
          { type: 'separator' },
          {
            label: 'reddit',
            click: () => {
              trackEngagement(story.id, 'reddit'); // Track engagement when user tags
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
      label: `━━━ PINBOARD (${pinboardStories.length}) ━━━`,
      enabled: false
    }
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
          trackArticleClick(story.id, 'pinboard');
          
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
              trackEngagement(story.id, 'pinboard'); // Track engagement when user tags
              addTagToStory(story.id, tag);
              setTimeout(updateMenu, 100);
            }
          })),
          { type: 'separator' },
          {
            label: 'pinboard',
            click: () => {
              trackEngagement(story.id, 'pinboard'); // Track engagement when user tags
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