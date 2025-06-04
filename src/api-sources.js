/**
 * API data sources for fetching stories from HN, Reddit, and Pinboard
 */

const axios = require('axios');
const { BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');
const { CACHE_DURATION, USER_AGENT, DEFAULT_SUBREDDITS } = require('./config');

let redditToken = null;
let redditCache = {};

/**
 * Prompt user for Reddit API credentials
 */
async function promptForRedditCredentials() {
  const credentials = await new Promise((resolve) => {
    const win = new BrowserWindow({
      width: 450,
      height: 280,
      title: 'Reddit Setup',
      resizable: false,
      webPreferences: {
        nodeIntegration: true,
        contextIsolation: false
      }
    });

    const html = `
<!DOCTYPE html>
<html>
<head>
    <style>
        body { 
            font-family: -apple-system, BlinkMacSystemFont, sans-serif; 
            padding: 30px; 
            margin: 0;
            background: #f8f9fa;
            color: #333;
        }
        .container {
            background: white;
            padding: 25px;
            border-radius: 8px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
        }
        h3 { 
            margin: 0 0 20px 0; 
            font-weight: 500; 
            font-size: 18px;
            text-align: center;
        }
        input { 
            width: 100%; 
            padding: 12px; 
            margin: 8px 0; 
            font-size: 14px; 
            border: 1px solid #ddd;
            border-radius: 4px;
            box-sizing: border-box;
        }
        input:focus {
            outline: none;
            border-color: #007AFF;
        }
        button { 
            width: 100%;
            padding: 12px; 
            font-size: 14px; 
            background: #007AFF;
            color: white;
            border: none;
            border-radius: 4px;
            cursor: pointer;
            margin-top: 15px;
        }
        button:hover {
            background: #0056b3;
        }
        button:disabled {
            background: #ccc;
            cursor: not-allowed;
        }
        .label {
            font-size: 12px;
            color: #666;
            margin-bottom: 4px;
        }
        .error {
            color: #d32f2f;
            font-size: 12px;
            margin-top: 8px;
            text-align: center;
        }
        .success {
            color: #388e3c;
            font-size: 12px;
            margin-top: 8px;
            text-align: center;
        }
    </style>
</head>
<body>
    <div class="container">
        <h3>Reddit API Setup</h3>
        <div class="label">Client ID</div>
        <input type="text" id="clientId" placeholder="Enter your Reddit Client ID">
        <div class="label">Client Secret</div>
        <input type="password" id="clientSecret" placeholder="Enter your Reddit Client Secret">
        <button id="submitBtn" onclick="submit()">Save Credentials</button>
        <div id="message"></div>
    </div>
    <script>
        function showMessage(text, isError = false) {
            const message = document.getElementById('message');
            message.textContent = text;
            message.className = isError ? 'error' : 'success';
        }
        
        function submit() {
            const clientId = document.getElementById('clientId').value.trim();
            const clientSecret = document.getElementById('clientSecret').value.trim();
            
            if (!clientId || !clientSecret) {
                showMessage('Please enter both Client ID and Client Secret', true);
                return;
            }
            
            const submitBtn = document.getElementById('submitBtn');
            submitBtn.disabled = true;
            submitBtn.textContent = 'Testing credentials...';
            showMessage('Validating credentials...');
            
            require('electron').ipcRenderer.send('reddit-credentials', { clientId, clientSecret });
        }
        
        // Listen for validation results
        require('electron').ipcRenderer.on('reddit-validation-result', (event, result) => {
            const submitBtn = document.getElementById('submitBtn');
            submitBtn.disabled = false;
            submitBtn.textContent = 'Save Credentials';
            
            if (result.success) {
                showMessage('Credentials saved successfully!');
                setTimeout(() => {
                    try {
                        window.close();
                    } catch (e) {
                        // Window might already be closed, ignore
                    }
                }, 1500);
            } else {
                showMessage(result.error || 'Invalid credentials. Please check and try again.', true);
            }
        });
        document.addEventListener('keypress', function(e) {
            if (e.key === 'Enter') submit();
        });
        document.getElementById('clientId').focus();
    </script>
</body>
</html>`;

    win.loadURL('data:text/html;charset=UTF-8,' + encodeURIComponent(html));
    
    const { ipcMain } = require('electron');
    ipcMain.once('reddit-credentials', async (event, value) => {
      // Test the credentials before saving
      try {
        const testCredentials = Buffer.from(`${value.clientId}:${value.clientSecret}`).toString('base64');
        
        const response = await axios.post('https://www.reddit.com/api/v1/access_token', 
          'grant_type=client_credentials',
          {
            headers: {
              'Authorization': `Basic ${testCredentials}`,
              'Content-Type': 'application/x-www-form-urlencoded',
              'User-Agent': USER_AGENT
            }
          }
        );
        
        if (response.data.access_token) {
          // Credentials are valid, save them
          event.sender.send('reddit-validation-result', { success: true });
          setTimeout(() => {
            try {
              if (!win.isDestroyed()) {
                win.close();
              }
              resolve(value);
            } catch (e) {
              // Window might already be destroyed, just resolve
              resolve(value);
            }
          }, 1500);
        }
      } catch (error) {
        let errorMessage = 'Invalid credentials. Please check and try again.';
        
        if (error.response) {
          switch (error.response.status) {
            case 401:
              errorMessage = 'Invalid Client ID or Secret. Please verify your credentials.';
              break;
            case 429:
              errorMessage = 'Rate limited. Please wait a moment and try again.';
              break;
            default:
              errorMessage = `Reddit API error: ${error.response.statusText}`;
          }
        } else if (error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED') {
          errorMessage = 'Network error. Please check your internet connection.';
        }
        
        console.error('Reddit credential validation failed:', error);
        event.sender.send('reddit-validation-result', { 
          success: false, 
          error: errorMessage 
        });
      }
    });
  });

  // Save to userData directory instead of app bundle
  const { app } = require('electron');
  const userDataPath = app.getPath('userData');
  const envPath = path.join(userDataPath, '.env');
  
  const envContent = `REDDIT_CLIENT_ID=${credentials.clientId}\nREDDIT_CLIENT_SECRET=${credentials.clientSecret}\n`;
  fs.writeFileSync(envPath, envContent);
  console.log('✅ Reddit credentials saved to:', envPath);
  
  // Update process.env for current session
  process.env.REDDIT_CLIENT_ID = credentials.clientId;
  process.env.REDDIT_CLIENT_SECRET = credentials.clientSecret;
}

/**
 * Get Reddit API token
 */
async function getRedditToken() {
  try {
    if (!process.env.REDDIT_CLIENT_ID || !process.env.REDDIT_CLIENT_SECRET) {
      console.log('Reddit credentials not found, prompting user...');
      await promptForRedditCredentials();
    }

    const credentials = Buffer.from(`${process.env.REDDIT_CLIENT_ID}:${process.env.REDDIT_CLIENT_SECRET}`).toString('base64');
    
    const response = await axios.post('https://www.reddit.com/api/v1/access_token', 
      'grant_type=client_credentials',
      {
        headers: {
          'Authorization': `Basic ${credentials}`,
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': USER_AGENT
        }
      }
    );
    
    redditToken = response.data.access_token;
    console.log('✅ Reddit token obtained successfully');
  } catch (error) {
    console.error('❌ Error getting Reddit token:', error.response?.status, error.response?.statusText);
    // Clear invalid credentials so user will be prompted again
    if (error.response?.status === 401) {
      process.env.REDDIT_CLIENT_ID = '';
      process.env.REDDIT_CLIENT_SECRET = '';
      redditToken = null;
      // Delete .env file from userData directory so user gets prompted again
      try {
        const { app } = require('electron');
        const userDataPath = app.getPath('userData');
        const envPath = path.join(userDataPath, '.env');
        fs.unlinkSync(envPath);
        console.log('🗑️ Cleared invalid Reddit credentials');
      } catch (e) {
        // File might not exist, ignore
        console.log('ℹ️ No credential file to clear');
      }
    }
    throw error;
  }
}

/**
 * Fetch posts from a specific subreddit
 */
async function fetchSubredditPosts(subreddit) {
  const now = Date.now();
  
  // Check cache
  if (redditCache[subreddit] && (now - redditCache[subreddit].timestamp) < CACHE_DURATION) {
    return redditCache[subreddit].posts;
  }
  
  if (!redditToken) {
    await getRedditToken();
  }
  
  try {
    const response = await axios.get(`https://oauth.reddit.com/r/${subreddit}/hot`, {
      headers: {
        'Authorization': `Bearer ${redditToken}`,
        'User-Agent': USER_AGENT
      },
      params: {
        limit: 10
      }
    });
    
    const posts = response.data.data.children.map(child => ({
      id: child.data.id,
      title: child.data.title,
      points: child.data.score || 0,
      comments: child.data.num_comments || 0,
      url: `https://old.reddit.com${child.data.permalink}`,
      subreddit: child.data.subreddit,
      is_self: child.data.is_self,
      actual_url: child.data.url
    }));
    
    // Cache the results
    redditCache[subreddit] = {
      posts: posts,
      timestamp: now
    };
    
    return posts;
    
  } catch (error) {
    console.error(`Error fetching r/${subreddit}:`, error);
    return [];
  }
}

/**
 * Fetch stories from configured Reddit subreddits
 */
async function fetchRedditStories() {
  const subreddits = DEFAULT_SUBREDDITS;
  
  try {
    const allPosts = [];
    
    for (const subreddit of subreddits) {
      const posts = await fetchSubredditPosts(subreddit);
      allPosts.push(...posts);
    }
    
    // Always shuffle for fresh selection each time menu opens
    const shuffled = allPosts.sort(() => 0.5 - Math.random());
    return shuffled.slice(0, 15);
      
  } catch (error) {
    console.error('Error fetching Reddit stories:', error);
    return [];
  }
}

/**
 * Fetch popular bookmarks from Pinboard
 */
async function fetchPinboardPopular() {
  try {
    const response = await axios.get('https://pinboard.in/popular/', {
      headers: {
        'User-Agent': USER_AGENT
      }
    });
    
    const html = response.data;
    const bookmarks = [];
    
    // Updated pattern for new Pinboard HTML structure
    // Format: <a class="bookmark_title" href="URL">TITLE</a> ... <a class="bookmark_count">COUNT</a>
    const pattern = /<a[^>]+href="([^"]+)"[^>]*>([^<]+)<\/a>.*?>(\d+)<\/a>/g;
    
    let match;
    while ((match = pattern.exec(html)) !== null && bookmarks.length < 15) {
      bookmarks.push({
        id: `pinboard_${bookmarks.length}`,
        title: match[2].trim(),
        url: match[1],
        points: parseInt(match[3]) || 0,
        comments: 0
      });
    }
    
    // If regex parsing fails, return empty array rather than hardcoded fallback data
    if (bookmarks.length === 0) {
      console.warn('Pinboard parsing failed - no bookmarks found');
    }
    
    return bookmarks;
    
  } catch (error) {
    console.error('Error fetching Pinboard popular:', error);
    return [];
  }
}

/**
 * Fetch top stories from Hacker News API
 */
async function fetchHNStories() {
  try {
    const topStoriesResponse = await axios.get('https://hacker-news.firebaseio.com/v0/topstories.json');
    const topStoryIds = topStoriesResponse.data.slice(0, 20); // Fetch 20 to ensure we have enough
    
    const stories = await Promise.all(
      topStoryIds.map(async (id) => {
        const storyResponse = await axios.get(`https://hacker-news.firebaseio.com/v0/item/${id}.json`);
        const story = storyResponse.data;
        return {
          ...story,
          points: story.score || 0,
          comments: story.descendants || 0
        };
      })
    );
    
    return stories;
  } catch (error) {
    console.error('Error fetching HN stories:', error);
    return [];
  }
}

module.exports = {
  fetchHNStories,
  fetchRedditStories,
  fetchPinboardPopular
};