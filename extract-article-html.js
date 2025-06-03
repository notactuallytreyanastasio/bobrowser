// Extract just the HTML content of the most recent article
const sqlite3 = require('sqlite3').verbose();

const db = new sqlite3.Database('clicks.db');

db.get(`SELECT content FROM articles ORDER BY saved_at DESC LIMIT 1`, (err, article) => {
  if (err) {
    console.error('Error:', err);
    return;
  }
  
  if (!article) {
    console.log('No articles found');
    db.close();
    return;
  }
  
  // Output just the HTML content
  console.log(article.content);
  
  db.close();
});