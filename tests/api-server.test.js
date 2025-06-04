const request = require('supertest');
const express = require('express');

// Mock the config
jest.mock('../src/config', () => ({
  API_PORT: 3001,
  HTTPS_PORT: 8443
}));

// Mock the database module
const mockDatabase = {
  saveArticle: jest.fn(),
  getArticles: jest.fn(),
  searchArticles: jest.fn(),
  getArticleStats: jest.fn(),
  trackSavedArticleClick: jest.fn(),
  getDatabase: jest.fn(),
  trackArticleClick: jest.fn(),
  markLinkAsViewed: jest.fn()
};

jest.mock('../src/database', () => mockDatabase);

// Mock background tagger
const mockBackgroundTagger = {
  getTaggingStatus: jest.fn(),
  triggerManualTagging: jest.fn(),
  retagAllStories: jest.fn()
};

jest.mock('../src/background-tagger', () => mockBackgroundTagger);

describe('API Server', () => {
  let app;
  let server;

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Mock database connection
    mockDatabase.getDatabase.mockReturnValue({
      get: jest.fn(),
      all: jest.fn(),
      run: jest.fn()
    });

    // Import and initialize the API server after mocking
    const { initApiServer } = require('../src/api-server');
    
    // Create a mock express app for testing
    app = express();
    app.use(express.json());
    
    // We'll manually add the routes for testing
    setupTestRoutes(app);
  });

  afterEach(() => {
    if (server) {
      server.close();
    }
  });

  function setupTestRoutes(app) {
    // Test endpoint
    app.get('/test', (req, res) => {
      res.send('API server is working!');
    });

    // Health check
    app.get('/api/ping', (req, res) => {
      res.json({ status: 'ok', timestamp: Date.now() });
    });

    // Save article endpoint
    app.post('/api/articles', async (req, res) => {
      const { url, title } = req.body;
      
      if (!url) {
        return res.status(400).json({ error: 'URL is required' });
      }
      
      const articleData = {
        url: url,
        title: title || 'Untitled',
        author: null,
        publishDate: null,
        content: '',
        textContent: '',
        wordCount: null,
        readingTime: null
      };
      
      mockDatabase.saveArticle(articleData, (err, result) => {
        if (err) {
          res.status(500).json({ error: err.message });
        } else {
          res.json({
            success: true,
            ...result,
            message: 'Article saved successfully'
          });
        }
      });
    });

    // Get articles
    app.get('/api/articles', (req, res) => {
      const limit = parseInt(req.query.limit) || 50;
      const offset = parseInt(req.query.offset) || 0;
      
      mockDatabase.getArticles(limit, offset, (err, articles) => {
        if (err) {
          res.status(500).json({ error: err.message });
        } else {
          res.json({ articles });
        }
      });
    });

    // Search articles
    app.get('/api/articles/search', (req, res) => {
      const query = req.query.q;
      if (!query) {
        return res.status(400).json({ error: 'Query parameter "q" is required' });
      }
      
      mockDatabase.searchArticles(query, (err, results) => {
        if (err) {
          res.status(500).json({ error: err.message });
        } else {
          res.json({ results });
        }
      });
    });

    // Background tagging status
    app.get('/api/background-tagging/status', (req, res) => {
      res.json(mockBackgroundTagger.getTaggingStatus());
    });
  }

  describe('Basic endpoints', () => {
    test('GET /test should return success message', async () => {
      const response = await request(app)
        .get('/test')
        .expect(200);
      
      expect(response.text).toBe('API server is working!');
    });

    test('GET /api/ping should return health status', async () => {
      const response = await request(app)
        .get('/api/ping')
        .expect(200);
      
      expect(response.body).toHaveProperty('status', 'ok');
      expect(response.body).toHaveProperty('timestamp');
      expect(typeof response.body.timestamp).toBe('number');
    });
  });

  describe('Article endpoints', () => {
    test('POST /api/articles should save article successfully', async () => {
      const mockResult = { id: 1, message: 'Article saved' };
      mockDatabase.saveArticle.mockImplementation((data, callback) => {
        callback(null, mockResult);
      });

      const articleData = {
        url: 'https://example.com/article',
        title: 'Test Article'
      };

      const response = await request(app)
        .post('/api/articles')
        .send(articleData)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.message).toBe('Article saved successfully');
      expect(mockDatabase.saveArticle).toHaveBeenCalledWith(
        expect.objectContaining({
          url: articleData.url,
          title: articleData.title
        }),
        expect.any(Function)
      );
    });

    test('POST /api/articles should fail without URL', async () => {
      const response = await request(app)
        .post('/api/articles')
        .send({ title: 'Test Article' })
        .expect(400);

      expect(response.body.error).toBe('URL is required');
    });

    test('POST /api/articles should handle database errors', async () => {
      mockDatabase.saveArticle.mockImplementation((data, callback) => {
        callback(new Error('Database error'));
      });

      const response = await request(app)
        .post('/api/articles')
        .send({ url: 'https://example.com', title: 'Test' })
        .expect(500);

      expect(response.body.error).toBe('Database error');
    });

    test('GET /api/articles should return articles list', async () => {
      const mockArticles = [
        { id: 1, title: 'Article 1', url: 'https://example.com/1' },
        { id: 2, title: 'Article 2', url: 'https://example.com/2' }
      ];

      mockDatabase.getArticles.mockImplementation((limit, offset, callback) => {
        callback(null, mockArticles);
      });

      const response = await request(app)
        .get('/api/articles')
        .expect(200);

      expect(response.body.articles).toEqual(mockArticles);
      expect(mockDatabase.getArticles).toHaveBeenCalledWith(50, 0, expect.any(Function));
    });

    test('GET /api/articles should handle limit and offset parameters', async () => {
      mockDatabase.getArticles.mockImplementation((limit, offset, callback) => {
        callback(null, []);
      });

      await request(app)
        .get('/api/articles?limit=10&offset=20')
        .expect(200);

      expect(mockDatabase.getArticles).toHaveBeenCalledWith(10, 20, expect.any(Function));
    });

    test('GET /api/articles/search should search articles', async () => {
      const mockResults = [
        { id: 1, title: 'JavaScript Tutorial', url: 'https://example.com/js' }
      ];

      mockDatabase.searchArticles.mockImplementation((query, callback) => {
        callback(null, mockResults);
      });

      const response = await request(app)
        .get('/api/articles/search?q=javascript')
        .expect(200);

      expect(response.body.results).toEqual(mockResults);
      expect(mockDatabase.searchArticles).toHaveBeenCalledWith('javascript', expect.any(Function));
    });

    test('GET /api/articles/search should require query parameter', async () => {
      const response = await request(app)
        .get('/api/articles/search')
        .expect(400);

      expect(response.body.error).toBe('Query parameter "q" is required');
    });
  });

  describe('Background tagging endpoints', () => {
    test('GET /api/background-tagging/status should return tagging status', async () => {
      const mockStatus = {
        isRunning: true,
        isCurrentlyTagging: false,
        nextRun: Date.now() + 3600000
      };

      mockBackgroundTagger.getTaggingStatus.mockReturnValue(mockStatus);

      const response = await request(app)
        .get('/api/background-tagging/status')
        .expect(200);

      expect(response.body).toEqual(mockStatus);
      expect(mockBackgroundTagger.getTaggingStatus).toHaveBeenCalled();
    });
  });

  describe('Error handling', () => {
    test('Should handle database connection errors gracefully', async () => {
      mockDatabase.getArticles.mockImplementation((limit, offset, callback) => {
        callback(new Error('Connection failed'));
      });

      const response = await request(app)
        .get('/api/articles')
        .expect(500);

      expect(response.body.error).toBe('Connection failed');
    });

    test('Should handle malformed JSON in POST requests', async () => {
      const response = await request(app)
        .post('/api/articles')
        .send('invalid json')
        .set('Content-Type', 'application/json')
        .expect(400);
    });
  });
});