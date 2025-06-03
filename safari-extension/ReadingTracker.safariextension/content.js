// Reading Tracker Content Script
// Detects reader-friendly content and communicates with the main app

class ReadingTracker {
  constructor() {
    this.isReaderModeActive = false;
    this.articleContent = null;
    this.readingStartTime = null;
    this.readingThreshold = 10000; // 10 seconds minimum reading time
    this.init();
  }

  init() {
    // Check if page has readable content
    this.detectReadableContent();
    
    // Monitor for reader mode indicators
    this.monitorReaderMode();
    
    // Track reading behavior
    this.trackReadingBehavior();
    
    // Listen for messages from popup/background
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      if (message.action === 'getPageContent') {
        sendResponse({
          content: this.extractContent(),
          url: window.location.href,
          title: document.title
        });
      } else if (message.action === 'saveCurrentArticle') {
        this.saveArticle();
      }
    });
  }

  detectReadableContent() {
    // Check for article indicators
    const articleElements = document.querySelectorAll('article, [role="article"], .article, .post, .entry');
    const hasArticleStructure = articleElements.length > 0;
    
    // Check for reader mode meta tags or classes
    const readerModeIndicators = [
      'reader-mode',
      'reader-view', 
      'readability',
      '.reader',
      '[data-reader]'
    ];
    
    const hasReaderIndicators = readerModeIndicators.some(selector => 
      document.querySelector(selector) !== null
    );

    // Detect if Safari's reader mode is likely active
    // (Safari adds specific styling when reader mode is on)
    const bodyStyle = window.getComputedStyle(document.body);
    const isReaderStyling = bodyStyle.maxWidth && 
                           parseInt(bodyStyle.maxWidth) < 800 &&
                           bodyStyle.margin === 'auto';

    this.isReaderModeActive = hasReaderIndicators || isReaderStyling;
    
    if (hasArticleStructure || this.isReaderModeActive) {
      console.log('Reading Tracker: Readable content detected');
      this.markAsReadable();
    }
  }

  monitorReaderMode() {
    // Watch for dynamic changes that might indicate reader mode activation
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (mutation.type === 'attributes' && 
            (mutation.attributeName === 'class' || mutation.attributeName === 'style')) {
          this.detectReadableContent();
        }
      });
    });

    observer.observe(document.body, {
      attributes: true,
      attributeFilter: ['class', 'style']
    });
  }

  trackReadingBehavior() {
    // Start tracking when user begins reading
    let isReading = false;
    let readingTimer = null;

    const startReading = () => {
      if (!isReading && this.isReadableContent()) {
        isReading = true;
        this.readingStartTime = Date.now();
        console.log('Reading Tracker: Started reading session');
      }
    };

    const stopReading = () => {
      if (isReading) {
        const readingTime = Date.now() - this.readingStartTime;
        if (readingTime > this.readingThreshold) {
          console.log(`Reading Tracker: Finished reading (${readingTime}ms)`);
          this.onReadingComplete();
        }
        isReading = false;
        this.readingStartTime = null;
      }
    };

    // Track scroll behavior (indicates reading)
    let scrollTimeout;
    document.addEventListener('scroll', () => {
      startReading();
      clearTimeout(scrollTimeout);
      scrollTimeout = setTimeout(stopReading, 3000); // Stop if no scroll for 3s
    });

    // Track page visibility
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        stopReading();
      }
    });

    // Track beforeunload (leaving page)
    window.addEventListener('beforeunload', stopReading);
  }

  isReadableContent() {
    const textContent = document.body.innerText || '';
    const wordCount = textContent.split(/\s+/).length;
    return wordCount > 300; // Minimum word count for an "article"
  }

  extractContent() {
    // Try multiple strategies to get clean content
    let content = null;
    
    // Strategy 1: Look for article elements
    const articleEl = document.querySelector('article, [role="article"]');
    if (articleEl) {
      content = this.cleanHTML(articleEl.innerHTML);
    }
    
    // Strategy 2: Use Readability-style extraction
    if (!content) {
      content = this.extractMainContent();
    }
    
    // Strategy 3: Fallback to body content
    if (!content) {
      content = this.cleanHTML(document.body.innerHTML);
    }

    return {
      html: content,
      text: this.extractText(content),
      title: this.extractTitle(),
      author: this.extractAuthor(),
      publishDate: this.extractPublishDate(),
      wordCount: this.getWordCount(content)
    };
  }

  extractMainContent() {
    // Simple content extraction similar to Readability
    const contentSelectors = [
      'article',
      '[role="article"]',
      '.article',
      '.post',
      '.entry',
      '.content',
      '.main',
      '#content',
      '#main'
    ];

    for (const selector of contentSelectors) {
      const element = document.querySelector(selector);
      if (element && this.isContentElement(element)) {
        return this.cleanHTML(element.innerHTML);
      }
    }

    return null;
  }

  isContentElement(element) {
    const text = element.innerText || '';
    const wordCount = text.split(/\s+/).length;
    const linkDensity = element.querySelectorAll('a').length / Math.max(wordCount, 1);
    
    return wordCount > 100 && linkDensity < 0.3;
  }

  cleanHTML(html) {
    // Remove scripts, styles, and other non-content elements
    const temp = document.createElement('div');
    temp.innerHTML = html;
    
    // Remove unwanted elements
    const unwanted = temp.querySelectorAll('script, style, nav, header, footer, aside, .advertisement, .ad, .social, .share');
    unwanted.forEach(el => el.remove());
    
    return temp.innerHTML;
  }

  extractText(html) {
    const temp = document.createElement('div');
    temp.innerHTML = html;
    return temp.innerText || temp.textContent;
  }

  extractTitle() {
    // Try multiple title sources
    return document.querySelector('h1')?.textContent ||
           document.querySelector('[property="og:title"]')?.content ||
           document.querySelector('title')?.textContent ||
           'Untitled Article';
  }

  extractAuthor() {
    const authorSelectors = [
      '[property="article:author"]',
      '[name="author"]',
      '.author',
      '.byline',
      '[rel="author"]'
    ];

    for (const selector of authorSelectors) {
      const element = document.querySelector(selector);
      if (element) {
        return element.content || element.textContent;
      }
    }

    return null;
  }

  extractPublishDate() {
    const dateSelectors = [
      '[property="article:published_time"]',
      '[property="article:modified_time"]',
      'time[datetime]',
      '.date',
      '.published'
    ];

    for (const selector of dateSelectors) {
      const element = document.querySelector(selector);
      if (element) {
        return element.getAttribute('datetime') || 
               element.getAttribute('content') || 
               element.textContent;
      }
    }

    return null;
  }

  getWordCount(content) {
    const text = this.extractText(content);
    return text.split(/\s+/).filter(word => word.length > 0).length;
  }

  markAsReadable() {
    // Send message to background script that this page is readable
    chrome.runtime.sendMessage({
      action: 'pageIsReadable',
      url: window.location.href,
      title: document.title
    });
  }

  onReadingComplete() {
    // User has finished reading - automatically save the article
    console.log('Reading Tracker: Auto-saving article after reading session');
    this.saveArticle();
  }

  async saveArticle() {
    const content = this.extractContent();
    
    // Send to background script to save
    chrome.runtime.sendMessage({
      action: 'saveArticle',
      data: {
        url: window.location.href,
        title: content.title,
        author: content.author,
        publishDate: content.publishDate,
        content: content.html,
        textContent: content.text,
        wordCount: content.wordCount,
        savedAt: new Date().toISOString(),
        readingTime: this.readingStartTime ? Date.now() - this.readingStartTime : null
      }
    });

    console.log('Reading Tracker: Article saved', content.title);
  }
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => new ReadingTracker());
} else {
  new ReadingTracker();
}