// Test setup file

// Mock electron module for testing
jest.mock('electron', () => ({
  app: {
    getPath: jest.fn(() => require('path').join(__dirname, '..', 'test-data'))
  },
  BrowserWindow: jest.fn(() => ({
    loadURL: jest.fn(),
    webContents: {
      send: jest.fn()
    }
  })),
  ipcMain: {
    on: jest.fn(),
    removeAllListeners: jest.fn()
  }
}));

// Mock sqlite3 for testing
jest.mock('sqlite3', () => ({
  verbose: () => ({
    Database: jest.fn(() => ({
      serialize: jest.fn((callback) => callback()),
      run: jest.fn((sql, params, callback) => {
        if (typeof params === 'function') {
          params(null);
        } else if (callback) {
          callback(null);
        }
      }),
      get: jest.fn((sql, params, callback) => {
        callback(null, { id: 1, title: 'Test' });
      }),
      all: jest.fn((sql, params, callback) => {
        callback(null, [{ id: 1, title: 'Test' }]);
      }),
      close: jest.fn()
    }))
  })
}));

// Setup test environment
beforeEach(() => {
  // Clear all mocks before each test
  jest.clearAllMocks();
});