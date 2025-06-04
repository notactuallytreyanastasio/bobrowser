# BOBrowser
A Bob browser. I dont know, its a batching of links from places I am likely to click.

It presents itself as a simple tray icon in the system bar.

AI tags the stories you click for later reference.

Once clicked, you get some reading.

But there is more:

There is also a full archival system, link tagging, browsing of links, and browsing of tags.

It also tracks reading and impression history

### One-Click Everything
A single click opens everything: a page to archive the content, the comments section, and the article itself.

When an article is clicked, claude will tag it for you.

This is done with some generic string matching if you dont have claude available as a CLI tool.

### 📚 Comprehensive Archiving
Automatic archive.ph integration on every click.

The archival URLs are stored to the DB for easy reference, too.

### 📊 Advanced Tracking
- **Comprehensive database** tracking all interactions
- **Link appearances** vs **actual clicks** differentiation
- **Source attribution** (HN, Reddit, Pinboard, Search)
- **Archive URL persistence** for future reference

### 🔍 Smart Search & Filtering
- **Tag-based search** across all tracked stories
- **Database browser** with filtering options (Gems, Unread, Recent, All)
- **Time-based filtering** (1 day, 1 week, 1 month)
- **Cross-platform story discovery**

## 🛠️ Installation

### Prerequisites
- macOS
- Node.js (v20+)
- **Claude Desktop** (for AI tagging) - [Download here](https://claude.ai/download)
- **Claude Code (CLI)** (for AI tagging) - [Download here](https://www.anthropic.com/claude-code)

### Setup
```bash
# Clone the repository
git clone [repository-url]
cd mac_hn

# Install dependencies
npm install

# Start the application
npm start

# For development with hot reload
npm run dev
```

### Claude Desktop Integration
1. Install Claude Desktop from [claude.ai/download](https://claude.ai/download)
2. Ensure Claude CLI is available in your PATH
3. The app will automatically detect and use Claude for AI tagging
4. If Claude is unavailable, falls back to keyword-based tagging

### Reddit Integration (Optional)
For Reddit stories, you'll need API credentials:

1. Go to [reddit.com/prefs/apps](https://www.reddit.com/prefs/apps)
2. Create a new "Script" application
3. Note your Client ID and Secret
4. Create a `.env` file:

```env
REDDIT_CLIENT_ID=your_client_id
REDDIT_CLIENT_SECRET=your_client_secret
```

Or use the setup dialog that appears when first starting without credentials.

## 📖 Usage

### Basic Operation
1. **Click the menu bar icon** to see aggregated stories
2. **Click any story** to automatically:
   - Archive the content via archive.ph
   - Open comments/discussion
   - Open the original article
   - Generate and apply AI tags

### Story Sources
- **🟠 Hacker News**: Top stories with discussion links (12 stories)
- **👽 Reddit**: Configurable subreddits with comment threads (14 stories)  
- **📌 Pinboard**: Popular bookmarks from the community (11 stories)

### Database Browser
- Access via menu: `🗄️ Database Browser`
- **💎 Gems**: Hidden gems with low appearance rates
- **📖 Unread**: Stories you haven't clicked yet
- **🕒 Recent**: Recently clicked articles
- **📋 All**: Complete link database

### Search Functionality
- Use `🔍 Search by Tags` to find specific stories
- Supports comma-separated tag queries: `ai,programming`
- Search results show all matching stories with their tags

## ⚙️ Configuration

### Reddit Subreddits
Edit `src/config.js` to customize Reddit sources:
```javascript
const DEFAULT_SUBREDDITS = [
  'programming',
  'technology', 
  'MachineLearning',
  // Add your preferred subreddits
];
```

**Default subreddits:** news, television, elixir, aitah, bestofredditorupdates, explainlikeimfive

### Environment Variables
Create a `.env` file for configuration:

```env
# Reddit API
REDDIT_CLIENT_ID=your_id
REDDIT_CLIENT_SECRET=your_secret  

# Server settings
API_PORT=3002
HTTPS_PORT=3003
CACHE_DURATION=900000  # 15 minutes

# Optional
USER_AGENT=MacHN-Reader/1.0
```

## 🗄️ Database Schema

The app maintains a comprehensive SQLite database tracking:
- **Links**: All stories with appearance counts and metadata
- **Clicks**: User interactions with timestamps and context
- **Archive URLs**: Preservation links for offline access
- **Tags**: AI-generated and manual categorizations

## 🔧 Development

### Scripts
```bash
npm start          # Production mode
npm run dev        # Development mode
npm run hot        # Hot reload development
```

### API Server (Optional)
The app includes HTTP/HTTPS servers for database browser:

```bash
# Generate SSL certificates for HTTPS support
openssl req -x509 -newkey rsa:4096 -keyout key.pem -out cert.pem -days 365 -nodes \
  -subj "/C=US/ST=State/L=City/O=MacHN/CN=localhost"
```

Servers run on:
- HTTP: `http://127.0.0.1:3002`
- HTTPS: `https://127.0.0.1:3003`

## 🔍 API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/ping` | Health check |
| `GET` | `/database` | Database browser interface |
| `GET` | `/api/database/clicks` | All click history |
| `GET` | `/api/database/bag-of-links` | Hidden gems |
| `GET` | `/api/database/unread` | Unread stories |
| `GET` | `/api/database/recent` | Recently clicked |
| `GET` | `/api/database/all` | All tracked links |
| `GET` | `/api/database/tags` | All tags with occurrence counts |
| `GET` | `/api/database/discover` | 25 random unclicked links from past week |
