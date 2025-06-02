const { app, Tray, Menu, shell } = require('electron');
const axios = require('axios');
const path = require('path');

let tray = null;

async function fetchHNStories() {
  try {
    const topStoriesResponse = await axios.get('https://hacker-news.firebaseio.com/v0/topstories.json');
    const topStoryIds = topStoriesResponse.data.slice(0, 25);
    
    const stories = await Promise.all(
      topStoryIds.map(async (id) => {
        const storyResponse = await axios.get(`https://hacker-news.firebaseio.com/v0/item/${id}.json`);
        return storyResponse.data;
      })
    );
    
    return stories;
  } catch (error) {
    console.error('Error fetching HN stories:', error);
    return [];
  }
}

function createTray() {
  tray = new Tray(path.join(__dirname, 'icon.png'));
  tray.setToolTip('HN Reader');
  
  updateMenu();
  
  setInterval(updateMenu, 300000);
}

async function updateMenu() {
  const stories = await fetchHNStories();
  
  const menuTemplate = stories.map(story => ({
    label: story.title.length > 50 ? story.title.substring(0, 47) + '...' : story.title,
    click: () => {
      shell.openExternal(`https://news.ycombinator.com/item?id=${story.id}`);
    }
  }));
  
  menuTemplate.push(
    { type: 'separator' },
    {
      label: 'Refresh',
      click: updateMenu
    },
    {
      label: 'Quit',
      click: () => {
        app.quit();
      }
    }
  );
  
  const contextMenu = Menu.buildFromTemplate(menuTemplate);
  tray.setContextMenu(contextMenu);
}

app.whenReady().then(() => {
  createTray();
});

app.on('window-all-closed', (event) => {
  event.preventDefault();
});

app.dock?.hide();