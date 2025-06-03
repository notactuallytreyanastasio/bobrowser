// Reading Tracker Background Service Worker
// Handles communication between content scripts and the Electron app

class ReadingTrackerBackground {
  constructor() {
    this.electronAppUrl = 'http://localhost:3001'; // We'll add an API server to the Electron app
    this.init();
  }

  init() {
    // Listen for messages from content scripts
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      this.handleMessage(message, sender, sendResponse);
      return true; // Keep message channel open for async responses
    });

    // Listen for tab updates to detect navigation
    chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
      if (changeInfo.status === 'complete' && tab.url) {
        this.onPageLoaded(tab);
      }
    });

    console.log('Reading Tracker Background: Initialized');
  }

  async handleMessage(message, sender, sendResponse) {
    try {
      switch (message.action) {
        case 'pageIsReadable':
          await this.handlePageReadable(message, sender);
          break;
          
        case 'saveArticle':
          await this.handleSaveArticle(message, sender);
          break;
          
        case 'getStoredArticles':
          const articles = await this.getStoredArticles();
          sendResponse({ articles });
          break;
          
        default:
          console.log('Reading Tracker Background: Unknown message action', message.action);
      }
    } catch (error) {
      console.error('Reading Tracker Background: Error handling message', error);
      sendResponse({ error: error.message });
    }
  }

  async handlePageReadable(message, sender) {
    console.log('Reading Tracker Background: Page is readable', message.url);
    
    // Store readable page info
    await this.storeReadablePage({
      url: message.url,
      title: message.title,
      tabId: sender.tab.id,
      detectedAt: new Date().toISOString()
    });

    // Optionally update badge or icon to indicate readable page
    this.updateBadge(sender.tab.id, 'readable');
  }

  async handleSaveArticle(message, sender) {
    console.log('Reading Tracker Background: Saving article', message.data.title);
    
    try {
      // First, save to local extension storage as backup
      await this.saveToLocalStorage(message.data);
      
      // Then send to Electron app
      await this.sendToElectronApp(message.data);
      
      // Update badge to show saved status
      this.updateBadge(sender.tab.id, 'saved');
      
      // Show notification
      this.showNotification('Article Saved', `"${message.data.title}" has been saved to your reading library`);
      
    } catch (error) {
      console.error('Reading Tracker Background: Failed to save article', error);
      
      // Still save locally even if Electron app communication fails
      await this.saveToLocalStorage(message.data);
      this.showNotification('Article Saved Locally', 'Article saved to extension storage');
    }
  }

  async saveToLocalStorage(articleData) {
    const key = `article_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    return new Promise((resolve) => {
      chrome.storage.local.set({
        [key]: articleData
      }, resolve);
    });
  }

  async sendToElectronApp(articleData) {
    // Send article data to the Electron app's API endpoint
    const response = await fetch(`${this.electronAppUrl}/api/articles`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(articleData)
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    return response.json();
  }

  async storeReadablePage(pageData) {
    return new Promise((resolve) => {
      chrome.storage.local.get(['readablePages'], (result) => {
        const readablePages = result.readablePages || [];
        readablePages.push(pageData);
        
        // Keep only last 100 readable pages
        if (readablePages.length > 100) {
          readablePages.splice(0, readablePages.length - 100);
        }
        
        chrome.storage.local.set({ readablePages }, resolve);
      });
    });
  }

  async getStoredArticles() {
    return new Promise((resolve) => {
      chrome.storage.local.get(null, (items) => {
        const articles = [];
        for (const [key, value] of Object.entries(items)) {
          if (key.startsWith('article_')) {
            articles.push(value);
          }
        }
        
        // Sort by saved date, newest first
        articles.sort((a, b) => new Date(b.savedAt) - new Date(a.savedAt));
        resolve(articles);
      });
    });
  }

  updateBadge(tabId, status) {
    const badgeConfigs = {
      readable: { text: '📖', color: '#4285f4' },
      saved: { text: '✓', color: '#34a853' },
      error: { text: '!', color: '#ea4335' }
    };

    const config = badgeConfigs[status];
    if (config) {
      chrome.action.setBadgeText({
        text: config.text,
        tabId: tabId
      });
      
      chrome.action.setBadgeBackgroundColor({
        color: config.color,
        tabId: tabId
      });
      
      // Clear badge after 3 seconds
      setTimeout(() => {
        chrome.action.setBadgeText({
          text: '',
          tabId: tabId
        });
      }, 3000);
    }
  }

  showNotification(title, message) {
    // Note: Notifications require permission in manifest
    if (chrome.notifications) {
      chrome.notifications.create({
        type: 'basic',
        iconUrl: 'icon48.png',
        title: title,
        message: message
      });
    }
  }

  onPageLoaded(tab) {
    // Reset badge when navigating to new page
    chrome.action.setBadgeText({
      text: '',
      tabId: tab.id
    });
  }
}

// Initialize background service worker
new ReadingTrackerBackground();