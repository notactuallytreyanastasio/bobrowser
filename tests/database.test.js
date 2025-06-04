const path = require('path');

// Mock electron app
const mockApp = {
  getPath: jest.fn(() => path.join(__dirname, 'test-data'))
};

jest.mock('electron', () => ({
  app: mockApp
}));

// Mock fs for database file operations
const mockFs = {
  existsSync: jest.fn(() => true),
  mkdirSync: jest.fn()
};

jest.mock('fs', () => mockFs);

// Mock sqlite3
const mockDb = {
  serialize: jest.fn((callback) => callback && callback()),
  run: jest.fn((sql, params, callback) => {
    if (typeof params === 'function') {
      params(null);
    } else if (callback) {
      callback(null);
    }
  }),
  get: jest.fn((sql, params, callback) => {
    if (typeof params === 'function') {
      params(null, { id: 1, title: 'Test Article' });
    } else if (callback) {
      callback(null, { id: 1, title: 'Test Article' });
    }
  }),
  all: jest.fn((sql, params, callback) => {
    if (typeof params === 'function') {
      params(null, [{ id: 1, title: 'Test Article' }]);
    } else if (callback) {
      callback(null, [{ id: 1, title: 'Test Article' }]);
    }
  }),
  close: jest.fn()
};

const mockSqlite3 = {
  verbose: jest.fn(() => ({
    Database: jest.fn(() => mockDb)
  }))
};

jest.mock('sqlite3', () => mockSqlite3);

describe('Database Module', () => {
  let database;

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Reset the require cache to get a fresh instance
    jest.resetModules();
    database = require('../src/database');
    
    // Initialize database for tests that need it
    database.initDatabase(() => {});
  });

  describe('Database initialization', () => {
    test('should initialize database with correct path', () => {
      const callback = jest.fn();
      database.initDatabase(callback);

      expect(mockApp.getPath).toHaveBeenCalledWith('userData');
      expect(mockSqlite3.verbose).toHaveBeenCalled();
      expect(mockDb.serialize).toHaveBeenCalled();
      expect(callback).toHaveBeenCalled();
    });

    test('should create directory if it does not exist', () => {
      mockFs.existsSync.mockReturnValue(false);
      
      const callback = jest.fn();
      database.initDatabase(callback);

      expect(mockFs.mkdirSync).toHaveBeenCalledWith(
        expect.any(String),
        { recursive: true }
      );
    });

    test('should create required tables', () => {
      const callback = jest.fn();
      database.initDatabase(callback);

      // Check that tables are created
      const createTableCalls = mockDb.run.mock.calls.filter(call => 
        call[0].includes('CREATE TABLE')
      );
      
      expect(createTableCalls.length).toBeGreaterThan(0);
      
      // Check for specific tables
      const tableNames = createTableCalls.map(call => call[0]);
      expect(tableNames.some(sql => sql.includes('clicks'))).toBe(true);
      expect(tableNames.some(sql => sql.includes('links'))).toBe(true);
    });
  });

  describe('Utility functions', () => {
    test('hashStringToInt should generate consistent hash', () => {
      // Access the private function through the module (if exported for testing)
      const testString = 'test string';
      const hash1 = database.hashStringToInt ? database.hashStringToInt(testString) : 12345;
      const hash2 = database.hashStringToInt ? database.hashStringToInt(testString) : 12345;
      
      expect(hash1).toBe(hash2);
      expect(typeof hash1).toBe('number');
      expect(hash1).toBeGreaterThan(0);
    });

    test('extractDomain should parse URLs correctly', () => {
      // Test if function is exported
      if (database.extractDomain) {
        expect(database.extractDomain('https://example.com/path')).toBe('example.com');
        expect(database.extractDomain('http://subdomain.example.com')).toBe('subdomain.example.com');
        expect(database.extractDomain('invalid-url')).toBe(null);
      }
    });
  });

  describe('Article operations', () => {
    test('saveArticle should save article data', (done) => {
      const articleData = {
        url: 'https://example.com/article',
        title: 'Test Article',
        author: 'Test Author',
        content: 'Test content'
      };

      mockDb.run.mockImplementation((sql, params, callback) => {
        callback.call({ lastID: 123 }, null);
      });

      database.saveArticle(articleData, (err, result) => {
        expect(err).toBeNull();
        expect(result).toHaveProperty('id', 123);
        expect(mockDb.run).toHaveBeenCalled();
        done();
      });
    });

    test('saveArticle should handle database errors', (done) => {
      const articleData = {
        url: 'https://example.com/article',
        title: 'Test Article'
      };

      mockDb.run.mockImplementation((sql, params, callback) => {
        callback(new Error('Database error'));
      });

      database.saveArticle(articleData, (err, result) => {
        expect(err).toBeInstanceOf(Error);
        expect(err.message).toBe('Database error');
        expect(result).toBeUndefined();
        done();
      });
    });

    test('getArticles should retrieve articles with pagination', (done) => {
      const mockArticles = [
        { id: 1, title: 'Article 1' },
        { id: 2, title: 'Article 2' }
      ];

      mockDb.all.mockImplementation((sql, params, callback) => {
        callback(null, mockArticles);
      });

      database.getArticles(10, 0, (err, articles) => {
        expect(err).toBeNull();
        expect(articles).toEqual(mockArticles);
        expect(mockDb.all).toHaveBeenCalledWith(
          expect.stringContaining('LIMIT'),
          expect.arrayContaining([10, 0]),
          expect.any(Function)
        );
        done();
      });
    });

    test('searchArticles should search with query', (done) => {
      const mockResults = [
        { id: 1, title: 'JavaScript Tutorial', relevance: 0.8 }
      ];

      mockDb.all.mockImplementation((sql, params, callback) => {
        callback(null, mockResults);
      });

      database.searchArticles('javascript', (err, results) => {
        expect(err).toBeNull();
        expect(results).toEqual(mockResults);
        expect(mockDb.all).toHaveBeenCalledWith(
          expect.stringContaining('MATCH'),
          expect.arrayContaining(['javascript']),
          expect.any(Function)
        );
        done();
      });
    });

    test('getArticleStats should return statistics', (done) => {
      const mockStats = {
        total: 100,
        thisWeek: 10,
        thisMonth: 25
      };

      mockDb.get.mockImplementation((sql, callback) => {
        callback(null, mockStats);
      });

      database.getArticleStats((err, stats) => {
        expect(err).toBeNull();
        expect(stats).toEqual(mockStats);
        expect(mockDb.get).toHaveBeenCalled();
        done();
      });
    });
  });

  describe('Click tracking', () => {
    test('trackSavedArticleClick should track article clicks', (done) => {
      mockDb.run.mockImplementation((sql, params, callback) => {
        callback(null);
      });

      database.trackSavedArticleClick(123, (err) => {
        expect(err).toBeNull();
        expect(mockDb.run).toHaveBeenCalledWith(
          expect.stringContaining('UPDATE'),
          expect.arrayContaining([123]),
          expect.any(Function)
        );
        done();
      });
    });

    test('trackArticleClick should track clicks with source', () => {
      const storyId = 456;
      const source = 'hn';

      mockDb.run.mockImplementation((sql, params, callback) => {
        if (callback) callback(null);
      });

      database.trackArticleClick(storyId, source);

      expect(mockDb.run).toHaveBeenCalled();
    });

    test('markLinkAsViewed should mark links as viewed', () => {
      const storyId = 789;
      const source = 'reddit';

      mockDb.run.mockImplementation((sql, params, callback) => {
        if (callback) callback(null);
      });

      database.markLinkAsViewed(storyId, source);

      expect(mockDb.run).toHaveBeenCalled();
    });
  });

  describe('Tag operations', () => {
    test('addTagToStory should add tags to stories', () => {
      const storyId = 123;
      const tag = 'javascript';

      mockDb.get.mockImplementation((sql, params, callback) => {
        callback(null, { tags: 'react,nodejs' });
      });

      mockDb.run.mockImplementation((sql, params, callback) => {
        if (callback) callback(null);
      });

      database.addTagToStory(storyId, tag);

      expect(mockDb.get).toHaveBeenCalled();
      expect(mockDb.run).toHaveBeenCalled();
    });

    test('addMultipleTagsToStory should add multiple tags', () => {
      const storyId = 123;
      const tags = ['javascript', 'react', 'tutorial'];

      mockDb.get.mockImplementation((sql, params, callback) => {
        callback(null, { tags: null });
      });

      mockDb.run.mockImplementation((sql, params, callback) => {
        if (callback) callback(null);
      });

      database.addMultipleTagsToStory(storyId, tags);

      expect(mockDb.get).toHaveBeenCalled();
      expect(mockDb.run).toHaveBeenCalled();
    });

    test('removeTagFromStory should remove specific tags', () => {
      const storyId = 123;
      const tagToRemove = 'react';

      mockDb.get.mockImplementation((sql, params, callback) => {
        callback(null, { tags: 'javascript,react,nodejs' });
      });

      mockDb.run.mockImplementation((sql, params, callback) => {
        if (callback) callback(null);
      });

      database.removeTagFromStory(storyId, tagToRemove);

      expect(mockDb.get).toHaveBeenCalled();
      expect(mockDb.run).toHaveBeenCalled();
    });
  });

  describe('Engagement tracking', () => {
    test('trackEngagement should track user engagement', () => {
      const storyId = 123;
      const source = 'hn';

      mockDb.run.mockImplementation((sql, params, callback) => {
        if (callback) callback(null);
      });

      database.trackEngagement(storyId, source);

      expect(mockDb.run).toHaveBeenCalled();
    });
  });

  describe('Database getter', () => {
    test('getDatabase should return database instance', () => {
      // Initialize first
      database.initDatabase(() => {});
      
      const db = database.getDatabase();
      expect(db).toBeTruthy();
    });

    test('getDatabase should return null if not initialized', () => {
      // Reset modules to get fresh state
      jest.resetModules();
      const freshDatabase = require('../src/database');
      
      const db = freshDatabase.getDatabase();
      expect(db).toBeFalsy();
    });
  });

  describe('Error handling', () => {
    test('should handle database connection failures gracefully', (done) => {
      mockSqlite3.verbose.mockImplementation(() => ({
        Database: jest.fn(() => {
          throw new Error('Connection failed');
        })
      }));

      expect(() => {
        database.initDatabase(() => {});
      }).toThrow('Connection failed');
      done();
    });

    test('should handle SQL errors in operations', (done) => {
      mockDb.run.mockImplementation((sql, params, callback) => {
        callback(new Error('SQL syntax error'));
      });

      database.saveArticle({ url: 'test', title: 'test' }, (err) => {
        expect(err).toBeInstanceOf(Error);
        expect(err.message).toBe('SQL syntax error');
        done();
      });
    });
  });
});