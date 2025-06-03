// Simple script to check saved articles
const sqlite3 = require('sqlite3').verbose();

const db = new sqlite3.Database('clicks.db');

console.log('📚 Reading Tracker - Saved Articles\n');

// Check if articles table exists and has data
db.get('SELECT COUNT(*) as count FROM articles', (err, row) => {
  if (err) {
    console.log('❌ No articles table found yet');
    return;
  }
  
  const count = row.count;
  console.log(`📊 Total saved articles: ${count}\n`);
  
  if (count === 0) {
    console.log('ℹ️  No articles saved yet. Try using the bookmarklet!');
    db.close();
    return;
  }
  
  // Show recent articles
  db.all(`SELECT 
    title, 
    author, 
    url, 
    word_count, 
    saved_at,
    substr(text_content, 1, 100) as preview
    FROM articles 
    ORDER BY saved_at DESC 
    LIMIT 5`, (err, rows) => {
    
    if (err) {
      console.error('Error:', err);
      return;
    }
    
    console.log('📖 Recent Articles:');
    console.log('═'.repeat(80));
    
    rows.forEach((article, index) => {
      console.log(`\n${index + 1}. ${article.title}`);
      console.log(`   📅 ${new Date(article.saved_at).toLocaleString()}`);
      console.log(`   ✍️  ${article.author || 'Unknown author'}`);
      console.log(`   📊 ${article.word_count} words`);
      console.log(`   🔗 ${article.url}`);
      console.log(`   📝 ${article.preview}...`);
      console.log('─'.repeat(80));
    });
    
    console.log('\n✅ Articles are being saved successfully!');
    console.log('💡 Use the Reading Library in the menu bar to browse and search.');
    
    db.close();
  });
});