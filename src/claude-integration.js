/**
 * Claude Desktop integration for AI-powered tag suggestions
 */

const { spawn } = require('child_process');
const { BrowserWindow } = require('electron');

/**
 * Check if Claude Desktop is available on the system
 */
async function checkClaudeDesktopAvailable() {
  return new Promise((resolve) => {
    // Check if claude command is available in PATH
    const { exec } = require('child_process');
    console.log('🔍 Checking for Claude CLI in PATH...');
    exec('which claude', (error, stdout, stderr) => {
      if (error) {
        console.log('❌ Claude CLI not found in PATH:', error.message);
        console.log('🔍 Checking for Claude Desktop app...');
        // Check if Claude Desktop app is installed
        const fs = require('fs');
        const claudeAppPath = '/Applications/Claude.app';
        if (fs.existsSync(claudeAppPath)) {
          console.log('✅ Claude Desktop app found at /Applications/Claude.app');
          resolve(true);
        } else {
          console.log('❌ Claude Desktop app not found at /Applications/Claude.app');
          console.log('🔍 Checking alternative locations...');
          // Check other possible locations
          const altPaths = [
            '/System/Applications/Claude.app',
            '/Applications/Utilities/Claude.app',
            '~/Applications/Claude.app'
          ];
          let found = false;
          for (const path of altPaths) {
            if (fs.existsSync(path)) {
              console.log(`✅ Found Claude Desktop at ${path}`);
              found = true;
              break;
            }
          }
          if (!found) {
            console.log('❌ Claude Desktop not found in any location');
          }
          resolve(found);
        }
      } else {
        console.log('✅ Claude CLI found at:', stdout.trim());
        resolve(true);
      }
    });
  });
}

/**
 * Generate tag suggestions using Claude Desktop
 */
async function generateTagSuggestions(title, url = null) {
  try {
    // Check if Claude is available
    console.log('🔍 Checking Claude Desktop availability...');
    const claudeAvailable = await checkClaudeDesktopAvailable();
    if (!claudeAvailable) {
      console.log('❌ Claude Desktop not available - no tags will be generated');
      return {
        success: false,
        tags: [],
        error: 'Claude Desktop not available'
      };
    } else {
      console.log('✅ Claude Desktop detected, attempting real AI integration...');
    }

    // Construct the prompt for Claude
    const prompt = `Based on this article title${url ? ' and URL' : ''}, suggest 4-6 relevant tags that would help categorize and find this content later.

Title: "${title}"${url ? `\nURL: ${url}` : ''}

Please provide tags that are:
- Descriptive and specific
- Useful for categorization
- Common enough to group similar articles
- A mix of topics, technologies, and themes
- NOT synonyms with one another

Return only the tags as a comma-separated list, no explanations.`;

    console.log('🤖 Generating Claude AI tag suggestions for:', title);

    // Try to use Claude Desktop API first
    try {
      console.log('🚀 Attempting Claude Desktop API call...');
      const claudeResponse = await callClaudeDesktop(prompt);
      if (claudeResponse.success) {
        console.log(`🎉 SUCCESS! Claude Desktop responded via ${claudeResponse.source}`);
        return claudeResponse;
      } else {
        console.log('⚠️ Claude Desktop API returned unsuccessful response');
      }
    } catch (claudeError) {
      console.log('❌ Claude Desktop API failed:', claudeError.message);
    }

    // No fallback - if Claude fails, return no tags
    console.log('❌ Claude integration failed - no tags will be generated');
    return {
      success: false,
      tags: [],
      error: 'Claude integration failed'
    };

  } catch (error) {
    console.error('Error generating tag suggestions:', error);
    return {
      success: false,
      error: error.message,
      tags: []
    };
  }
}

/**
 * Call Claude Desktop API to generate tag suggestions
 */
async function callClaudeDesktop(prompt) {
  return new Promise(async (resolve, reject) => {
    // Try multiple methods to communicate with Claude Desktop

    // Method 1: Try HTTP API first (if Claude Desktop exposes one)
    try {
      console.log('🌐 Trying Claude HTTP API...');
      const apiResponse = await tryClaudeHttpAPI(prompt);
      if (apiResponse.success) {
        console.log(`✅ HTTP API succeeded on ${apiResponse.source}`);
        resolve(apiResponse);
        return;
      }
    } catch (apiError) {
      console.log('❌ Claude HTTP API failed:', apiError.message);
    }

    // Method 2: Try using claude CLI command if available
    const { exec } = require('child_process');

    // Escape the prompt for shell command
    const escapedPrompt = prompt.replace(/"/g, '\\"').replace(/\n/g, '\\n');

    // Try claude CLI
    console.log('💻 Trying Claude CLI...');
    exec(`echo "${escapedPrompt}" | claude --print --output-format=text`, {
      timeout: 15000, // 15 second timeout
      maxBuffer: 1024 * 1024 // 1MB buffer
    }, (error, stdout, stderr) => {
      if (error) {
        console.log('❌ Claude CLI failed:', error.message);
        // Try alternative method
        console.log('📱 Trying AppleScript method...');
        tryClaudeDesktopAppleScript(prompt, resolve, reject);
      } else if (stderr) {
        console.log('⚠️ Claude CLI stderr:', stderr);
        console.log('📱 Trying AppleScript method...');
        tryClaudeDesktopAppleScript(prompt, resolve, reject);
      } else {
        // Parse Claude's response
        try {
          console.log('✅ Claude CLI succeeded, parsing response...');
          const tags = parseClaudeResponse(stdout);
          resolve({
            success: true,
            tags: tags,
            source: 'claude-cli'
          });
        } catch (parseError) {
          console.log('❌ Failed to parse Claude CLI response:', parseError.message);
          console.log('📱 Trying AppleScript method...');
          tryClaudeDesktopAppleScript(prompt, resolve, reject);
        }
      }
    });
  });
}

/**
 * Try to use Claude Desktop's HTTP API (if available)
 */
async function tryClaudeHttpAPI(prompt) {
  return new Promise((resolve, reject) => {
    const axios = require('axios');

    // Common ports that Claude Desktop might use
    const possiblePorts = [3000, 8080, 9000, 52000, 52001];

    let attemptCount = 0;

    const tryPort = (port) => {
      axios.post(`http://localhost:${port}/api/chat`, {
        message: prompt,
        max_tokens: 100
      }, {
        timeout: 10000,
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'MacHN-TagGenerator/1.0'
        }
      })
      .then(response => {
        try {
          const tags = parseClaudeResponse(response.data.response || response.data.message || response.data);
          resolve({
            success: true,
            tags: tags,
            source: `claude-http-${port}`
          });
        } catch (parseError) {
          attemptCount++;
          if (attemptCount < possiblePorts.length) {
            tryPort(possiblePorts[attemptCount]);
          } else {
            reject(new Error('No working HTTP API found'));
          }
        }
      })
      .catch(error => {
        attemptCount++;
        if (attemptCount < possiblePorts.length) {
          tryPort(possiblePorts[attemptCount]);
        } else {
          reject(new Error('No working HTTP API found'));
        }
      });
    };

    tryPort(possiblePorts[0]);
  });
}

/**
 * Try using AppleScript to communicate with Claude Desktop app
 */
function tryClaudeDesktopAppleScript(prompt, resolve, reject) {
  const { exec } = require('child_process');

  // First check if Claude app is running
  exec('osascript -e \'tell application "System Events" to return name of every application process\'', (checkError, processes) => {
    if (checkError || !processes.includes('Claude')) {
      console.log('Claude Desktop app is not running');
      reject(new Error('Claude Desktop app is not running'));
      return;
    }

    // Clean prompt for AppleScript
    const cleanPrompt = prompt
      .replace(/"/g, '\\"')
      .replace(/\n/g, '\\n')
      .substring(0, 500); // Limit length to avoid issues

    // AppleScript to interact with Claude Desktop
    const appleScript = `
      tell application "Claude"
        activate
      end tell

      delay 1

      tell application "System Events"
        tell process "Claude"
          -- Clear any existing text
          keystroke "a" using command down
          keystroke "${cleanPrompt}"

          -- Send the message
          key code 36

          -- Wait for response
          delay 3

          -- Try to select and copy the response
          keystroke "a" using command down
          keystroke "c" using command down

          delay 0.5
        end tell
      end tell

      return the clipboard
    `;

    exec(`osascript -e '${appleScript}'`, { timeout: 25000 }, (error, stdout, stderr) => {
      if (error) {
        console.log('AppleScript method failed:', error.message);
        reject(new Error('All Claude Desktop communication methods failed'));
      } else {
        try {
          const tags = parseClaudeResponse(stdout);
          resolve({
            success: true,
            tags: tags,
            source: 'claude-applescript'
          });
        } catch (parseError) {
          console.log('Failed to parse AppleScript Claude response:', parseError.message);
          reject(new Error('Failed to parse Claude response from AppleScript'));
        }
      }
    });
  });
}

/**
 * Parse Claude's response to extract tags
 */
function parseClaudeResponse(response) {
  if (!response || typeof response !== 'string') {
    throw new Error('Invalid Claude response');
  }

  // Clean up the response
  let cleanResponse = response.trim();

  // Remove any markdown formatting
  cleanResponse = cleanResponse.replace(/```[\s\S]*?```/g, '');
  cleanResponse = cleanResponse.replace(/`([^`]+)`/g, '$1');

  // Look for comma-separated tags
  let tags = [];

  // Try to find a line that looks like comma-separated tags
  const lines = cleanResponse.split('\n');
  for (const line of lines) {
    const trimmedLine = line.trim();

    // Skip empty lines and lines that look like explanatory text
    if (!trimmedLine ||
        trimmedLine.toLowerCase().includes('here are') ||
        trimmedLine.toLowerCase().includes('based on') ||
        trimmedLine.toLowerCase().includes('suggested tags') ||
        trimmedLine.length > 200) {
      continue;
    }

    // Check if this line contains comma-separated words
    if (trimmedLine.includes(',')) {
      const potentialTags = trimmedLine.split(',')
        .map(tag => tag.trim().toLowerCase())
        .filter(tag => tag.length > 0 && tag.length < 30)
        .filter(tag => !/[.!?]/.test(tag)) // Filter out sentences
        .slice(0, 8); // Max 8 tags

      if (potentialTags.length >= 2) {
        tags = potentialTags;
        break;
      }
    }
  }

  // If no comma-separated tags found, try to extract individual words
  if (tags.length === 0) {
    const words = cleanResponse.toLowerCase()
      .replace(/[^\w\s-]/g, ' ')
      .split(/\s+/)
      .filter(word => word.length > 2 && word.length < 20)
      .slice(0, 6);

    if (words.length > 0) {
      tags = words;
    }
  }

  // Fallback: if still no tags, throw error
  if (tags.length === 0) {
    throw new Error('No valid tags found in Claude response');
  }

  return tags;
}

/**
 * Mock tag generation for development (fallback when Claude is unavailable)
 */
// Mock function removed - only Claude tagging is supported
// async function generateMockSuggestions(title) { ... }

/**
 * Show tag suggestion window
 */
function showTagSuggestionWindow(storyId, title, url, source) {
  const win = new BrowserWindow({
    width: 400,
    height: 140,
    title: 'AI Tags',
    resizable: false,
    alwaysOnTop: true,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <title>AI Tags</title>
      <style>
        body {
          font-family: system-ui, sans-serif;
          padding: 8px;
          margin: 0;
          background: #fff;
          font-size: 11px;
        }
        .loading {
          text-align: center;
          padding: 15px;
          color: #666;
          font-size: 10px;
        }
        .tags-container {
          margin: 8px 0;
        }
        .tag-suggestion {
          display: inline-block;
          background: #e3f2fd;
          color: #1976d2;
          padding: 3px 8px;
          margin: 2px;
          border-radius: 10px;
          font-size: 10px;
          cursor: pointer;
          border: 1px solid transparent;
        }
        .tag-suggestion:hover {
          background: #bbdefb;
        }
        .tag-suggestion.selected {
          background: #1976d2;
          color: white;
          border-color: #0d47a1;
        }
        .buttons {
          display: flex;
          gap: 6px;
          justify-content: flex-end;
          margin-top: 8px;
          padding-top: 6px;
          border-top: 1px solid #eee;
        }
        .btn {
          padding: 4px 12px;
          border: none;
          border-radius: 3px;
          cursor: pointer;
          font-size: 10px;
          font-weight: 500;
        }
        .btn-secondary {
          background: #6c757d;
          color: white;
        }
        .btn-primary {
          background: #007bff;
          color: white;
        }
        .btn:hover {
          opacity: 0.9;
        }
        .btn:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }
        .error {
          color: #dc3545;
          font-size: 10px;
          padding: 8px;
        }
      </style>
    </head>
    <body>
      <div id="content">
        <div class="loading">
          Generating tags...
        </div>
      </div>

      <div class="buttons">
        <button class="btn btn-secondary" onclick="window.close()">Cancel</button>
        <button class="btn btn-primary" id="applyBtn" onclick="applySelectedTags()" disabled>Apply</button>
      </div>

      <script>
        const { ipcRenderer } = require('electron');
        let selectedTags = new Set();
        let storyId = ${storyId};
        let storySource = '${source}';

        // Generate tag suggestions when window loads
        window.addEventListener('DOMContentLoaded', () => {
          // Request tag suggestions from main process
          ipcRenderer.send('generate-tags', {
            title: '${title.replace(/'/g, "\\'")}',
            url: '${url || ''}'
          });
        });

        // Listen for tag suggestions from main process
        ipcRenderer.on('tags-generated', (event, result) => {
          if (result.success) {
            displayTagSuggestions(result.tags);
          } else {
            showError('Failed to generate tag suggestions: ' + (result.error || 'Unknown error'));
          }
        });

        function displayTagSuggestions(tags) {
          const content = document.getElementById('content');

          if (tags.length === 0) {
            content.innerHTML = '<div class="error">No tags generated</div>';
            return;
          }

          const tagsHtml = tags.map(tag =>
            \`<span class="tag-suggestion" onclick="toggleTag('\${tag}')">\${tag}</span>\`
          ).join('');

          content.innerHTML = \`
            <div class="tags-container">
              \${tagsHtml}
            </div>
          \`;
        }

        function toggleTag(tag) {
          const tagElement = event.target;

          if (selectedTags.has(tag)) {
            selectedTags.delete(tag);
            tagElement.classList.remove('selected');
          } else {
            selectedTags.add(tag);
            tagElement.classList.add('selected');
          }

          // Update apply button state
          const applyBtn = document.getElementById('applyBtn');
          applyBtn.disabled = selectedTags.size === 0;
        }

        function applySelectedTags() {
          if (selectedTags.size === 0) return;

          const tagsArray = Array.from(selectedTags);
          console.log('Applying tags:', tagsArray, 'to story:', storyId);

          // Send message to main process to apply tags
          ipcRenderer.send('apply-ai-tags', {
            storyId: storyId,
            source: storySource,
            tags: tagsArray
          });

          window.close();
        }

        function showError(message) {
          document.getElementById('content').innerHTML = \`
            <div class="error">\${message}</div>
          \`;
        }
      </script>
    </body>
    </html>
  `;

  win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));

  // Handle IPC events
  const { ipcMain } = require('electron');

  // Handle tag generation request
  ipcMain.removeAllListeners('generate-tags');
  ipcMain.on('generate-tags', async (event, data) => {
    try {
      const result = await generateTagSuggestions(data.title, data.url);
      event.reply('tags-generated', result);
    } catch (error) {
      event.reply('tags-generated', {
        success: false,
        error: error.message,
        tags: []
      });
    }
  });

  // Handle tag application
  ipcMain.removeAllListeners('apply-ai-tags');
  ipcMain.on('apply-ai-tags', (event, data) => {
    console.log('Applying AI-generated tags:', data);

    // Apply each tag to the story
    const { addTagToStory, trackEngagement } = require('./database');

    data.tags.forEach(tag => {
      addTagToStory(data.storyId, tag);
    });

    // Track engagement for using AI tags
    trackEngagement(data.storyId, data.source);

    // Refresh the menu to show updated tags
    const { updateMenu } = require('./menu');
    setTimeout(updateMenu, 100);
  });
}

module.exports = {
  checkClaudeDesktopAvailable,
  generateTagSuggestions,
  showTagSuggestionWindow
};