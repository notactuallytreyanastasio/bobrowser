/**
 * Configuration constants and environment setup
 */

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
