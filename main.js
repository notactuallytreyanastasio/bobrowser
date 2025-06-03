/**
 * BOB - A reading tracker and article aggregator
 * 
 * Features:
 * - Aggregates stories from Hacker News, Reddit, and Pinboard
 * - Tracks reading patterns and story impressions
 * - Provides system tray menu for quick access
 * - API server for Safari extension integration
 * - Article archiving and offline reading (disabled pending implementation)
 * 
 * @author Reading Tracker
 * @version 1.0.0
 */

// Core dependencies
const { app } = require('electron');
const path = require('path');

// Local modules
const { initDatabase } = require('./src/database');
const { createTray } = require('./src/menu');
const { initApiServer } = require('./src/api-server');

// Development hot reload
if (process.env.NODE_ENV === 'development') {
  require('electron-reload')(__dirname, {
    electron: path.join(__dirname, 'node_modules', '.bin', 'electron'),
    hardResetMethod: 'exit'
  });
}


// Application initialization
app.whenReady().then(() => {
  initDatabase(() => {
    createTray();
    // Initialize API server for Safari extension
    if (process.env.ENABLE_API_SERVER !== 'false') {
      initApiServer();
    }
  });
});

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