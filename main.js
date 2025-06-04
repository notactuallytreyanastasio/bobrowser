/**
 * BOB - A reading tracker and article aggregator
 * 
 * Features:
 * - Aggregates stories from Hacker News, Reddit, and Pinboard
 * - Tracks reading patterns and story impressions
 * - Provides system tray menu for quick access
 * - API server for external integrations
 * - Article archiving and offline reading (disabled pending implementation)
 * 
 * @author Reading Tracker
 * @version 1.0.0
 */

// Core dependencies
const { app } = require('electron');
const path = require('path');
const { Module } = require('module');

// Local modules
const { initDatabase } = require('./src/database');
const { createTray } = require('./src/menu');
const { initApiServer } = require('./src/api-server');

// Development hot reload
if (process.env.NODE_ENV === 'development') {
  require('electron-reload')(__dirname, {
    electron: path.join(__dirname, 'node_modules', '.bin', 'electron'),
    hardResetMethod: 'exit',
    ignored: /node_modules|[\/\\]\.|clicks\.db/
  });
  
  // Clear module cache on reload to ensure fresh modules
  const originalRequire = Module.prototype.require;
  Module.prototype.require = function(...args) {
    // Clear cache for our src modules on each require
    const modulePath = args[0];
    if (modulePath.startsWith('./src/') || modulePath.startsWith('../')) {
      const resolved = require.resolve(modulePath);
      if (resolved.includes(__dirname)) {
        delete require.cache[resolved];
      }
    }
    return originalRequire.apply(this, args);
  };
}


// Application initialization
app.whenReady().then(() => {
  console.log('🚀 App ready, initializing...');
  initDatabase(() => {
    console.log('💾 Database initialized, creating tray...');
    createTray();
    // Initialize API server
    if (process.env.ENABLE_API_SERVER !== 'false') {
      console.log('🌐 Starting API server...');
      initApiServer();
    }
    
    // Setup IPC handlers
    setupIpcHandlers();
    console.log('✅ App initialization complete');
  });
});

// Setup IPC handlers for cross-window communication
function setupIpcHandlers() {
  const { ipcMain } = require('electron');
  const { showTagSuggestionWindow } = require('./src/claude-integration');
  
  // Handle Claude tagging request from database browser
  ipcMain.on('show-claude-tags', (event, data) => {
    const { storyId, title, url, source } = data;
    showTagSuggestionWindow(storyId, title, url, source);
  });
}

// Only add Electron event handlers if not in server mode
if (process.env.NODE_ENV !== 'server' && !process.argv.includes('--server-only')) {
  app.on('window-all-closed', (event) => {
    event.preventDefault();
  });
}

// Only hide dock if not in server mode
if (process.env.NODE_ENV !== 'server' && !process.argv.includes('--server-only')) {
  app.dock?.hide();
}