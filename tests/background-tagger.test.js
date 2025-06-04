// Mock database module
const mockDatabase = {
  getDatabase: jest.fn(),
  addMultipleTagsToStory: jest.fn()
};

jest.mock('../src/database', () => mockDatabase);

// Mock Claude integration
const mockClaudeIntegration = {
  generateTagSuggestions: jest.fn()
};

jest.mock('../src/claude-integration', () => mockClaudeIntegration);

describe('Background Tagger', () => {
  let backgroundTagger;
  let mockDb;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    
    // Setup mock database
    mockDb = {
      all: jest.fn(),
      run: jest.fn(),
      serialize: jest.fn((callback) => callback())
    };
    
    mockDatabase.getDatabase.mockReturnValue(mockDb);
    
    // Reset modules to get fresh instance
    jest.resetModules();
    backgroundTagger = require('../src/background-tagger');
  });

  afterEach(() => {
    jest.useRealTimers();
    // Stop any running tagging services
    backgroundTagger.stopBackgroundTagging();
  });

  describe('Service lifecycle', () => {
    test('should start background tagging service', () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      
      backgroundTagger.startBackgroundTagging();
      
      expect(consoleSpy).toHaveBeenCalledWith('🏷️ Starting background tagging service (runs every hour)');
      expect(setInterval).toHaveBeenCalledWith(expect.any(Function), 60 * 60 * 1000);
      
      consoleSpy.mockRestore();
    });

    test('should not start service if already running', () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      
      backgroundTagger.startBackgroundTagging();
      backgroundTagger.startBackgroundTagging();
      
      expect(consoleSpy).toHaveBeenCalledWith('🏷️ Background tagging already running');
      
      consoleSpy.mockRestore();
    });

    test('should stop background tagging service', () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      
      backgroundTagger.startBackgroundTagging();
      backgroundTagger.stopBackgroundTagging();
      
      expect(consoleSpy).toHaveBeenCalledWith('🏷️ Background tagging service stopped');
      expect(clearInterval).toHaveBeenCalled();
      
      consoleSpy.mockRestore();
    });

    test('should get tagging status when not running', () => {
      const status = backgroundTagger.getTaggingStatus();
      
      expect(status).toEqual({
        isRunning: false,
        isCurrentlyTagging: false,
        nextRun: null
      });
    });

    test('should get tagging status when running', () => {
      backgroundTagger.startBackgroundTagging();
      const status = backgroundTagger.getTaggingStatus();
      
      expect(status.isRunning).toBe(true);
      expect(status.isCurrentlyTagging).toBe(false);
      expect(status.nextRun).toBeGreaterThan(Date.now());
    });
  });

  describe('Untagged links processing', () => {
    test('should process untagged links successfully', async () => {
      const mockUntaggedLinks = [
        { id: 1, story_id: 101, title: 'JavaScript Tutorial', url: 'https://example.com/js' },
        { id: 2, story_id: 102, title: 'React Guide', url: 'https://example.com/react' }
      ];

      // Mock database query for untagged links
      mockDb.all.mockImplementation((sql, params, callback) => {
        callback(null, mockUntaggedLinks);
      });

      // Mock successful Claude integration
      mockClaudeIntegration.generateTagSuggestions.mockResolvedValue({
        success: true,
        tags: ['javascript', 'tutorial', 'programming']
      });

      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      
      await backgroundTagger.processUntaggedLinks();
      
      expect(mockDb.all).toHaveBeenCalledWith(
        expect.stringContaining('tags IS NULL OR tags = \'\''),
        [10],
        expect.any(Function)
      );
      
      expect(mockClaudeIntegration.generateTagSuggestions).toHaveBeenCalledTimes(2);
      expect(mockDatabase.addMultipleTagsToStory).toHaveBeenCalledTimes(2);
      
      expect(consoleSpy).toHaveBeenCalledWith('✅ Background tagging batch completed');
      
      consoleSpy.mockRestore();
    });

    test('should handle no untagged links', async () => {
      mockDb.all.mockImplementation((sql, params, callback) => {
        callback(null, []);
      });

      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      
      await backgroundTagger.processUntaggedLinks();
      
      expect(consoleSpy).toHaveBeenCalledWith('✅ No untagged links found - all caught up!');
      expect(mockClaudeIntegration.generateTagSuggestions).not.toHaveBeenCalled();
      
      consoleSpy.mockRestore();
    });

    test('should handle database not available', async () => {
      mockDatabase.getDatabase.mockReturnValue(null);
      
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
      
      await backgroundTagger.processUntaggedLinks();
      
      expect(consoleErrorSpy).toHaveBeenCalledWith('❌ Database not available for background tagging');
      
      consoleErrorSpy.mockRestore();
    });

    test('should handle tagging already in progress', async () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      
      // Start one process
      const promise1 = backgroundTagger.processUntaggedLinks();
      // Try to start another
      const promise2 = backgroundTagger.processUntaggedLinks();
      
      // Mock empty result to finish quickly
      mockDb.all.mockImplementation((sql, params, callback) => {
        callback(null, []);
      });
      
      await Promise.all([promise1, promise2]);
      
      expect(consoleSpy).toHaveBeenCalledWith('🏷️ Background tagging already in progress, skipping...');
      
      consoleSpy.mockRestore();
    });

    test('should handle Claude integration failures', async () => {
      const mockLinks = [
        { id: 1, story_id: 101, title: 'Test Article', url: 'https://example.com' }
      ];

      mockDb.all.mockImplementation((sql, params, callback) => {
        callback(null, mockLinks);
      });

      // Mock Claude failure
      mockClaudeIntegration.generateTagSuggestions.mockRejectedValue(
        new Error('Claude API error')
      );

      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
      
      await backgroundTagger.processUntaggedLinks();
      
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        '❌ Error tagging link 1:',
        'Claude API error'
      );
      
      consoleErrorSpy.mockRestore();
    });
  });

  describe('Manual tagging operations', () => {
    test('should trigger manual tagging', async () => {
      mockDb.all.mockImplementation((sql, params, callback) => {
        callback(null, []);
      });

      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      
      await backgroundTagger.triggerManualTagging();
      
      expect(consoleSpy).toHaveBeenCalledWith('🏷️ Manual tagging triggered');
      
      consoleSpy.mockRestore();
    });

    test('should re-tag all stories', async () => {
      const mockAllStories = [
        { id: 1, story_id: 101, title: 'Story 1', url: 'https://example.com/1' },
        { id: 2, story_id: 102, title: 'Story 2', url: 'https://example.com/2' }
      ];

      // Mock clearing tags
      mockDb.run.mockImplementation((sql, callback) => {
        if (callback) callback(null);
      });

      // Mock getting all stories
      mockDb.all.mockImplementation((sql, params, callback) => {
        callback(null, mockAllStories);
      });

      // Mock successful tagging
      mockClaudeIntegration.generateTagSuggestions.mockResolvedValue({
        success: true,
        tags: ['test', 'article']
      });

      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      
      const result = await backgroundTagger.retagAllStories();
      
      expect(result.storiesProcessed).toBe(2);
      expect(result.successful).toBe(2);
      expect(result.failed).toBe(0);
      
      expect(consoleSpy).toHaveBeenCalledWith('🔄 Starting fresh re-tagging of ALL stories...');
      expect(consoleSpy).toHaveBeenCalledWith('🗑️ Cleared all tags from links table');
      
      consoleSpy.mockRestore();
    });

    test('should handle re-tagging when already in progress', async () => {
      // Start a process
      const promise1 = backgroundTagger.processUntaggedLinks();
      
      // Try to start re-tagging
      await expect(backgroundTagger.retagAllStories()).rejects.toThrow(
        'Background tagging already in progress'
      );

      // Mock empty result to finish the first process
      mockDb.all.mockImplementation((sql, params, callback) => {
        callback(null, []);
      });
      
      await promise1;
    });

    test('should handle partial failures in re-tagging', async () => {
      const mockStories = [
        { id: 1, story_id: 101, title: 'Good Story', url: 'https://example.com/good' },
        { id: 2, story_id: 102, title: 'Bad Story', url: 'https://example.com/bad' }
      ];

      mockDb.run.mockImplementation((sql, callback) => {
        if (callback) callback(null);
      });

      mockDb.all.mockImplementation((sql, params, callback) => {
        callback(null, mockStories);
      });

      // Mock one success, one failure
      mockClaudeIntegration.generateTagSuggestions
        .mockResolvedValueOnce({ success: true, tags: ['good'] })
        .mockRejectedValueOnce(new Error('Tagging failed'));

      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
      
      const result = await backgroundTagger.retagAllStories();
      
      expect(result.successful).toBe(1);
      expect(result.failed).toBe(1);
      expect(result.storiesProcessed).toBe(2);
      
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        '❌ Failed to tag "Bad Story":',
        'Tagging failed'
      );
      
      consoleErrorSpy.mockRestore();
    });
  });

  describe('Error handling', () => {
    test('should handle database errors gracefully', async () => {
      mockDb.all.mockImplementation((sql, params, callback) => {
        callback(new Error('Database connection lost'));
      });

      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
      
      await backgroundTagger.processUntaggedLinks();
      
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        '❌ Error in background tagging process:',
        expect.any(Error)
      );
      
      consoleErrorSpy.mockRestore();
    });

    test('should handle clearing tags failure in re-tagging', async () => {
      mockDb.run.mockImplementation((sql, callback) => {
        callback(new Error('Clear tags failed'));
      });

      await expect(backgroundTagger.retagAllStories()).rejects.toThrow('Clear tags failed');
    });

    test('should handle getting all stories failure', async () => {
      mockDb.run.mockImplementation((sql, callback) => {
        callback(null); // Clear tags succeeds
      });

      mockDb.all.mockImplementation((sql, params, callback) => {
        callback(new Error('Get stories failed'));
      });

      await expect(backgroundTagger.retagAllStories()).rejects.toThrow('Get stories failed');
    });
  });

  describe('Timing and intervals', () => {
    test('should run tagging at correct intervals', () => {
      backgroundTagger.startBackgroundTagging();
      
      // Fast-forward time to trigger interval
      jest.advanceTimersByTime(60 * 60 * 1000);
      
      // Verify interval was set correctly
      expect(setInterval).toHaveBeenCalledWith(
        expect.any(Function),
        60 * 60 * 1000
      );
    });

    test('should include delays between tagging requests', async () => {
      const mockLinks = [
        { id: 1, story_id: 101, title: 'Article 1', url: 'https://example.com/1' },
        { id: 2, story_id: 102, title: 'Article 2', url: 'https://example.com/2' }
      ];

      mockDb.all.mockImplementation((sql, params, callback) => {
        callback(null, mockLinks);
      });

      mockClaudeIntegration.generateTagSuggestions.mockResolvedValue({
        success: true,
        tags: ['test']
      });

      const startTime = Date.now();
      
      await backgroundTagger.processUntaggedLinks();
      
      // Verify setTimeout was called for delays
      expect(setTimeout).toHaveBeenCalledWith(expect.any(Function), 2000);
    });
  });
});