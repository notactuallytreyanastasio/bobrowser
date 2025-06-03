// Get the most recent article and open it in Safari
const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');
const { exec } = require('child_process');

const db = new sqlite3.Database('clicks.db');

console.log('🔍 Getting most recent article...');

db.get(`SELECT 
    id,
    title, 
    author, 
    url, 
    content,
    saved_at
    FROM articles 
    ORDER BY saved_at DESC 
    LIMIT 1`, (err, article) => {
  
  if (err) {
    console.error('❌ Error:', err);
    db.close();
    return;
  }
  
  if (!article) {
    console.log('📭 No articles found');
    db.close();
    return;
  }
  
  console.log(`📰 Found: "${article.title}" by ${article.author || 'Unknown'}`);
  console.log(`📅 Saved: ${new Date(article.saved_at).toLocaleString()}`);
  
  // Create a complete HTML document with proper DOCTYPE and styling
  const completeHTML = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${article.title.replace(/"/g, '&quot;')}</title>
    <style>
        /* Base styling for better readability if original styles are missing */
        body {
            max-width: 800px;
            margin: 0 auto;
            padding: 20px;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
            line-height: 1.6;
            color: #333;
            background: #fff;
        }
        
        /* Ensure links work properly */
        a {
            color: #007aff;
            text-decoration: none;
        }
        
        a:hover {
            text-decoration: underline;
        }
        
        /* Add a header indicating this is a saved article */
        .saved-article-header {
            background: #f0f8ff;
            border: 1px solid #007aff;
            border-radius: 8px;
            padding: 15px;
            margin-bottom: 30px;
            text-align: center;
            font-size: 14px;
            color: #0066cc;
        }
        
        .saved-article-header strong {
            color: #004499;
        }
    </style>
</head>
<body>
    <div class="saved-article-header">
        <strong>📚 Saved Article</strong> • Reading Tracker • 
        Saved on ${new Date(article.saved_at).toLocaleDateString()}
    </div>
    
    ${article.content}
    
    <script>
        // Make sure all links open in new tabs for better UX
        document.addEventListener('DOMContentLoaded', function() {
            const links = document.querySelectorAll('a[href^="http"]');
            links.forEach(link => {
                link.target = '_blank';
                link.rel = 'noopener noreferrer';
            });
        });
    </script>
</body>
</html>`;

  // Write to a temporary file
  const tempFilePath = '/tmp/reading-tracker-latest-article.html';
  
  fs.writeFile(tempFilePath, completeHTML, 'utf8', (writeErr) => {
    if (writeErr) {
      console.error('❌ Error writing file:', writeErr);
      db.close();
      return;
    }
    
    console.log('✅ Article saved to temp file');
    console.log('🌐 Opening in Safari...');
    
    // Open the file in Safari
    exec(`open -a Safari "${tempFilePath}"`, (execErr) => {
      if (execErr) {
        console.error('❌ Error opening Safari:', execErr);
        console.log('💡 You can manually open:', tempFilePath);
      } else {
        console.log('🎉 Article opened in Safari!');
      }
      
      db.close();
    });
  });
});