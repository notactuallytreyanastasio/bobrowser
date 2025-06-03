// Reading Tracker Popup Script

class ReadingTrackerPopup {
  constructor() {
    this.currentTab = null;
    this.isPageReadable = false;
    this.init();
  }

  async init() {
    await this.getCurrentTab();
    await this.checkPageStatus();
    await this.loadStats();
    await this.loadRecentArticles();
    this.setupEventListeners();
    this.hideLoading();
  }

  async getCurrentTab() {
    return new Promise((resolve) => {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        this.currentTab = tabs[0];
        resolve();
      });
    });
  }

  async checkPageStatus() {
    if (!this.currentTab) return;

    try {
      // Send message to content script to check if page is readable
      const response = await chrome.tabs.sendMessage(this.currentTab.id, {
        action: 'getPageContent'
      });

      if (response && response.content) {
        this.isPageReadable = true;
        this.updatePageStatus(true, 'Page is readable and ready to save');
      } else {
        this.updatePageStatus(false, 'Page does not appear to contain readable article content');
      }
    } catch (error) {
      console.log('Could not check page content:', error);
      this.updatePageStatus(false, 'Unable to analyze this page');
    }
  }

  updatePageStatus(isReadable, message) {
    const statusEl = document.getElementById('page-status');
    const iconEl = statusEl.querySelector('.status-icon');
    const textEl = statusEl.querySelector('.status-text');

    if (isReadable) {
      statusEl.className = 'status readable';
      iconEl.textContent = '📖';
      textEl.textContent = message;
    } else {
      statusEl.className = 'status not-readable';
      iconEl.textContent = '⚠️';
      textEl.textContent = message;
    }

    // Enable/disable save button based on readability
    const saveButton = document.getElementById('save-article');
    saveButton.disabled = !isReadable;
  }

  async loadStats() {
    try {
      const response = await chrome.runtime.sendMessage({ action: 'getStoredArticles' });
      const articles = response.articles || [];

      // Calculate stats
      const totalArticles = articles.length;
      const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      const weekArticles = articles.filter(article => 
        new Date(article.savedAt) > oneWeekAgo
      ).length;

      const totalWords = articles.reduce((sum, article) => 
        sum + (article.wordCount || 0), 0
      );

      // Update UI
      document.getElementById('total-articles').textContent = totalArticles.toLocaleString();
      document.getElementById('week-articles').textContent = weekArticles.toLocaleString();
      document.getElementById('total-words').textContent = totalWords.toLocaleString();

    } catch (error) {
      console.error('Error loading stats:', error);
    }
  }

  async loadRecentArticles() {
    try {
      const response = await chrome.runtime.sendMessage({ action: 'getStoredArticles' });
      const articles = response.articles || [];
      
      const recentList = document.getElementById('recent-list');
      recentList.innerHTML = '';

      if (articles.length === 0) {
        recentList.innerHTML = '<div style="text-align: center; color: #666; font-size: 12px; padding: 16px;">No articles saved yet</div>';
        return;
      }

      // Show last 3 articles
      const recentArticles = articles.slice(0, 3);
      
      recentArticles.forEach(article => {
        const item = document.createElement('div');
        item.className = 'article-item';
        
        const savedDate = new Date(article.savedAt);
        const timeAgo = this.getTimeAgo(savedDate);
        
        item.innerHTML = `
          <div class="article-title">${this.escapeHtml(article.title)}</div>
          <div class="article-meta">
            <span>${timeAgo}</span>
            <span>${article.wordCount || 0} words</span>
          </div>
        `;
        
        item.addEventListener('click', () => {
          chrome.tabs.create({ url: article.url });
        });
        
        recentList.appendChild(item);
      });

    } catch (error) {
      console.error('Error loading recent articles:', error);
    }
  }

  setupEventListeners() {
    // Save article button
    document.getElementById('save-article').addEventListener('click', async () => {
      await this.saveCurrentArticle();
    });

    // View library button
    document.getElementById('view-library').addEventListener('click', () => {
      // Open the Electron app's library view
      this.openElectronApp('/library');
    });

    // Open stats button
    document.getElementById('open-stats').addEventListener('click', () => {
      // Open the Electron app's analytics view
      this.openElectronApp('/analytics');
    });
  }

  async saveCurrentArticle() {
    if (!this.currentTab || !this.isPageReadable) return;

    const saveButton = document.getElementById('save-article');
    const originalText = saveButton.textContent;
    
    try {
      saveButton.textContent = '💾 Saving...';
      saveButton.disabled = true;

      // Send message to content script to save the article
      await chrome.tabs.sendMessage(this.currentTab.id, {
        action: 'saveCurrentArticle'
      });

      saveButton.textContent = '✅ Saved!';
      
      // Refresh stats and recent articles
      setTimeout(async () => {
        await this.loadStats();
        await this.loadRecentArticles();
        saveButton.textContent = originalText;
        saveButton.disabled = false;
      }, 1500);

    } catch (error) {
      console.error('Error saving article:', error);
      saveButton.textContent = '❌ Error';
      setTimeout(() => {
        saveButton.textContent = originalText;
        saveButton.disabled = false;
      }, 2000);
    }
  }

  openElectronApp(path = '') {
    // Try to communicate with the Electron app
    // This will open the app if it's running, or show a message if not
    fetch('http://localhost:3001/api/ping')
      .then(() => {
        // App is running, open the specific view
        fetch(`http://localhost:3001/api/open${path}`, { method: 'POST' });
      })
      .catch(() => {
        // App is not running, show instructions
        this.showAppNotRunningMessage();
      });
  }

  showAppNotRunningMessage() {
    alert('Reading Tracker app is not running. Please start the menu bar app to view your library and analytics.');
  }

  getTimeAgo(date) {
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    
    return date.toLocaleDateString();
  }

  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  hideLoading() {
    document.getElementById('loading').style.display = 'none';
    document.getElementById('main-content').style.display = 'block';
  }
}

// Initialize popup when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => new ReadingTrackerPopup());
} else {
  new ReadingTrackerPopup();
}