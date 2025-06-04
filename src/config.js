/**
 * Configuration constants and environment setup
 */

// Load environment variables from userData directory for packaged apps
function loadUserDataEnv() {
  try {
    const { app } = require('electron');
    const fs = require('fs');
    const path = require('path');
    
    if (app && app.getPath) {
      const userDataPath = app.getPath('userData');
      const envPath = path.join(userDataPath, '.env');
      
      if (fs.existsSync(envPath)) {
        const envContent = fs.readFileSync(envPath, 'utf8');
        const lines = envContent.split('\n');
        
        lines.forEach(line => {
          const [key, value] = line.split('=');
          if (key && value) {
            process.env[key] = value;
          }
        });
        
        console.log('✅ Loaded credentials from userData directory');
      } else {
        console.log('ℹ️ No .env file found in userData directory');
      }
    }
  } catch (error) {
    console.log('ℹ️ Not in Electron context, using standard dotenv');
  }
}

// Try to load from userData first, then fall back to standard dotenv
loadUserDataEnv();
require('dotenv').config();

// Configuration constants - can be overridden by environment variables
const CACHE_DURATION = parseInt(process.env.CACHE_DURATION) || 15 * 60 * 1000; // 15 minutes
const API_PORT = parseInt(process.env.API_PORT) || 3002;
const HTTPS_PORT = parseInt(process.env.HTTPS_PORT) || 3003;
const USER_AGENT = process.env.USER_AGENT || 'Reading-Tracker/1.0';
const DEFAULT_SUBREDDITS = process.env.REDDIT_SUBREDDITS ? 
  process.env.REDDIT_SUBREDDITS.split(',') : 
  ['news', 'television', 'elixir', 'aitah', 'bestofredditorupdates', 'explainlikeimfive', 'technology', 'askreddit', 'gadgets', 'gaming'];

module.exports = {
  CACHE_DURATION,
  API_PORT,
  HTTPS_PORT,
  USER_AGENT,
  DEFAULT_SUBREDDITS
};
