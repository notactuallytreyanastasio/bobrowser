const { spawn } = require('child_process');

// Mock child_process
jest.mock('child_process');

// Mock axios for HTTP API calls
const mockAxios = {
  post: jest.fn()
};
jest.mock('axios', () => mockAxios);

// Mock electron modules
const mockBrowserWindow = {
  loadURL: jest.fn(),
  webContents: {
    send: jest.fn()
  }
};

const mockIpcMain = {
  on: jest.fn(),
  removeAllListeners: jest.fn()
};

jest.mock('electron', () => ({
  BrowserWindow: jest.fn(() => mockBrowserWindow),
  ipcMain: mockIpcMain
}));

// Mock fs for file existence checks
const mockFs = {
  existsSync: jest.fn()
};
jest.mock('fs', () => mockFs);

describe('Claude Integration', () => {
  let claudeIntegration;
  let mockExec;

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Setup exec mock
    mockExec = jest.fn();
    require('child_process').exec = mockExec;
    
    // Reset modules
    jest.resetModules();
    claudeIntegration = require('../src/claude-integration');
  });

  describe('Claude Desktop availability check', () => {
    test('should detect Claude CLI in PATH', async () => {
      mockExec.mockImplementation((command, callback) => {
        if (command === 'which claude') {
          callback(null, '/usr/local/bin/claude\n', '');
        }
      });

      const available = await claudeIntegration.checkClaudeDesktopAvailable();
      
      expect(available).toBe(true);
      expect(mockExec).toHaveBeenCalledWith('which claude', expect.any(Function));
    });

    test('should detect Claude Desktop app when CLI not found', async () => {
      mockExec.mockImplementation((command, callback) => {
        if (command === 'which claude') {
          callback(new Error('not found'), '', 'command not found');
        }
      });

      mockFs.existsSync.mockImplementation((path) => {
        return path === '/Applications/Claude.app';
      });

      const available = await claudeIntegration.checkClaudeDesktopAvailable();
      
      expect(available).toBe(true);
      expect(mockFs.existsSync).toHaveBeenCalledWith('/Applications/Claude.app');
    });

    test('should check alternative locations for Claude app', async () => {
      mockExec.mockImplementation((command, callback) => {
        callback(new Error('not found'), '', '');
      });

      mockFs.existsSync.mockImplementation((path) => {
        return path === '/System/Applications/Claude.app';
      });

      const available = await claudeIntegration.checkClaudeDesktopAvailable();
      
      expect(available).toBe(true);
      expect(mockFs.existsSync).toHaveBeenCalledWith('/Applications/Claude.app');
      expect(mockFs.existsSync).toHaveBeenCalledWith('/System/Applications/Claude.app');
    });

    test('should return false when Claude not found anywhere', async () => {
      mockExec.mockImplementation((command, callback) => {
        callback(new Error('not found'), '', '');
      });

      mockFs.existsSync.mockReturnValue(false);

      const available = await claudeIntegration.checkClaudeDesktopAvailable();
      
      expect(available).toBe(false);
    });
  });

  describe('Tag suggestions generation', () => {
    test('should generate tags when Claude is available', async () => {
      // Mock Claude availability check
      mockExec.mockImplementation((command, callback) => {
        if (command === 'which claude') {
          callback(null, '/usr/local/bin/claude', '');
        } else if (command.includes('echo') && command.includes('claude --print')) {
          callback(null, 'javascript, react, tutorial, web development, frontend', '');
        }
      });

      const result = await claudeIntegration.generateTagSuggestions(
        'Building a React App with JavaScript',
        'https://example.com/react-tutorial'
      );

      expect(result.success).toBe(true);
      expect(result.tags).toEqual(['javascript', 'react', 'tutorial', 'web development', 'frontend']);
      expect(result.source).toBe('claude-cli');
    });

    test('should handle Claude CLI failures with AppleScript fallback', async () => {
      mockExec
        .mockImplementationOnce((command, callback) => {
          // Claude availability check succeeds
          callback(null, '/usr/local/bin/claude', '');
        })
        .mockImplementationOnce((command, callback) => {
          // Claude CLI call fails
          callback(new Error('CLI timeout'), '', '');
        })
        .mockImplementationOnce((command, callback) => {
          // AppleScript process check
          callback(null, 'Claude', '');
        })
        .mockImplementationOnce((command, callback) => {
          // AppleScript execution
          callback(null, 'python, machine learning, ai, tutorial', '');
        });

      const result = await claudeIntegration.generateTagSuggestions(
        'Introduction to Machine Learning with Python'
      );

      expect(result.success).toBe(true);
      expect(result.tags).toEqual(['python', 'machine learning', 'ai', 'tutorial']);
      expect(result.source).toBe('claude-applescript');
    });

    test('should return error when Claude is not available', async () => {
      mockExec.mockImplementation((command, callback) => {
        callback(new Error('not found'), '', '');
      });

      mockFs.existsSync.mockReturnValue(false);

      const result = await claudeIntegration.generateTagSuggestions('Test Article');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Claude Desktop not available');
      expect(result.tags).toEqual([]);
    });

    test('should handle HTTP API fallback', async () => {
      mockExec.mockImplementation((command, callback) => {
        if (command === 'which claude') {
          callback(null, '/usr/local/bin/claude', '');
        } else {
          callback(new Error('CLI failed'), '', '');
        }
      });

      mockAxios.post.mockResolvedValue({
        data: { response: 'nodejs, backend, api, rest, server' }
      });

      const result = await claudeIntegration.generateTagSuggestions(
        'Building REST APIs with Node.js'
      );

      expect(result.success).toBe(true);
      expect(result.tags).toEqual(['nodejs', 'backend', 'api', 'rest', 'server']);
      expect(result.source).toContain('claude-http');
    });

    test('should handle HTTP API failures', async () => {
      mockExec.mockImplementation((command, callback) => {
        if (command === 'which claude') {
          callback(null, '/usr/local/bin/claude', '');
        } else {
          callback(new Error('CLI failed'), '', '');
        }
      });

      mockAxios.post.mockRejectedValue(new Error('Network error'));

      const result = await claudeIntegration.generateTagSuggestions('Test Article');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Claude integration failed');
    });
  });

  describe('Response parsing', () => {
    test('should parse comma-separated tags correctly', async () => {
      mockExec
        .mockImplementationOnce((command, callback) => {
          callback(null, '/usr/local/bin/claude', '');
        })
        .mockImplementationOnce((command, callback) => {
          callback(null, 'Here are some tags:\njavascript, react, frontend, web development\nThese should help categorize the article.', '');
        });

      const result = await claudeIntegration.generateTagSuggestions('React Tutorial');

      expect(result.success).toBe(true);
      expect(result.tags).toEqual(['javascript', 'react', 'frontend', 'web development']);
    });

    test('should handle markdown formatting in response', async () => {
      mockExec
        .mockImplementationOnce((command, callback) => {
          callback(null, '/usr/local/bin/claude', '');
        })
        .mockImplementationOnce((command, callback) => {
          callback(null, '```\npython, data-science, pandas, analysis\n```', '');
        });

      const result = await claudeIntegration.generateTagSuggestions('Data Analysis with Pandas');

      expect(result.success).toBe(true);
      expect(result.tags).toEqual(['python', 'data-science', 'pandas', 'analysis']);
    });

    test('should handle responses with explanatory text', async () => {
      mockExec
        .mockImplementationOnce((command, callback) => {
          callback(null, '/usr/local/bin/claude', '');
        })
        .mockImplementationOnce((command, callback) => {
          callback(null, 'Based on the article title, here are suggested tags:\nkubernetes, devops, containers, orchestration, cloud\nThese tags will help with categorization.', '');
        });

      const result = await claudeIntegration.generateTagSuggestions('Kubernetes for DevOps');

      expect(result.success).toBe(true);
      expect(result.tags).toEqual(['kubernetes', 'devops', 'containers', 'orchestration', 'cloud']);
    });

    test('should fallback to word extraction when no comma-separated tags', async () => {
      mockExec
        .mockImplementationOnce((command, callback) => {
          callback(null, '/usr/local/bin/claude', '');
        })
        .mockImplementationOnce((command, callback) => {
          callback(null, 'This article is about database performance optimization using indexes', '');
        });

      const result = await claudeIntegration.generateTagSuggestions('Database Performance');

      expect(result.success).toBe(true);
      expect(result.tags.length).toBeGreaterThan(0);
      expect(result.tags).toContain('database');
    });

    test('should handle empty or invalid responses', async () => {
      mockExec
        .mockImplementationOnce((command, callback) => {
          callback(null, '/usr/local/bin/claude', '');
        })
        .mockImplementationOnce((command, callback) => {
          callback(null, '', '');
        });

      const result = await claudeIntegration.generateTagSuggestions('Test Article');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Claude integration failed');
    });

    test('should limit tag count and length', async () => {
      mockExec
        .mockImplementationOnce((command, callback) => {
          callback(null, '/usr/local/bin/claude', '');
        })
        .mockImplementationOnce((command, callback) => {
          const longTags = Array.from({ length: 15 }, (_, i) => `tag${i}`).join(', ');
          callback(null, longTags, '');
        });

      const result = await claudeIntegration.generateTagSuggestions('Many Tags Article');

      expect(result.success).toBe(true);
      expect(result.tags.length).toBeLessThanOrEqual(8);
    });
  });

  describe('Tag suggestion window', () => {
    test('should create tag suggestion window with correct parameters', () => {
      const storyId = 123;
      const title = 'Test Article';
      const url = 'https://example.com';
      const source = 'hn';

      claudeIntegration.showTagSuggestionWindow(storyId, title, url, source);

      expect(mockBrowserWindow.loadURL).toHaveBeenCalledWith(
        expect.stringContaining('data:text/html')
      );
    });

    test('should handle IPC events for tag generation', () => {
      claudeIntegration.showTagSuggestionWindow(123, 'Test', 'https://example.com', 'hn');

      expect(mockIpcMain.removeAllListeners).toHaveBeenCalledWith('generate-tags');
      expect(mockIpcMain.removeAllListeners).toHaveBeenCalledWith('apply-ai-tags');
      expect(mockIpcMain.on).toHaveBeenCalledWith('generate-tags', expect.any(Function));
      expect(mockIpcMain.on).toHaveBeenCalledWith('apply-ai-tags', expect.any(Function));
    });
  });

  describe('Error handling', () => {
    test('should handle network timeouts gracefully', async () => {
      mockExec
        .mockImplementationOnce((command, callback) => {
          callback(null, '/usr/local/bin/claude', '');
        })
        .mockImplementationOnce((command, options, callback) => {
          // Simulate timeout
          callback(new Error('Command timeout'), '', '');
        });

      mockAxios.post.mockRejectedValue(new Error('Request timeout'));

      const result = await claudeIntegration.generateTagSuggestions('Test Article');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Claude integration failed');
    });

    test('should handle malformed Claude responses', async () => {
      mockExec
        .mockImplementationOnce((command, callback) => {
          callback(null, '/usr/local/bin/claude', '');
        })
        .mockImplementationOnce((command, callback) => {
          callback(null, '{"invalid": "json"', '');
        });

      const result = await claudeIntegration.generateTagSuggestions('Test Article');

      expect(result.success).toBe(false);
    });

    test('should handle AppleScript execution failures', async () => {
      mockExec
        .mockImplementationOnce((command, callback) => {
          callback(null, '/usr/local/bin/claude', '');
        })
        .mockImplementationOnce((command, callback) => {
          callback(new Error('CLI failed'), '', '');
        })
        .mockImplementationOnce((command, callback) => {
          callback(null, 'Claude', ''); // Process check succeeds
        })
        .mockImplementationOnce((command, callback) => {
          callback(new Error('AppleScript failed'), '', '');
        });

      const result = await claudeIntegration.generateTagSuggestions('Test Article');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Claude integration failed');
    });
  });

  describe('Integration with different Claude setups', () => {
    test('should work with Claude CLI in different paths', async () => {
      mockExec.mockImplementation((command, callback) => {
        if (command === 'which claude') {
          callback(null, '/opt/homebrew/bin/claude\n', '');
        } else if (command.includes('claude --print')) {
          callback(null, 'docker, containers, deployment', '');
        }
      });

      const result = await claudeIntegration.generateTagSuggestions('Docker Tutorial');

      expect(result.success).toBe(true);
      expect(result.tags).toEqual(['docker', 'containers', 'deployment']);
    });

    test('should handle Claude Desktop in alternative locations', async () => {
      mockExec.mockImplementation((command, callback) => {
        callback(new Error('not found'), '', '');
      });

      mockFs.existsSync.mockImplementation((path) => {
        return path === '~/Applications/Claude.app';
      });

      const available = await claudeIntegration.checkClaudeDesktopAvailable();
      
      expect(available).toBe(true);
    });
  });
});