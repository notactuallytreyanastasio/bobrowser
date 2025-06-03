// Get the most recently saved article's HTML content
const sqlite3 = require('sqlite3').verbose();

const db = new sqlite3.Database('clicks.db');

console.log('🔍 Fetching most recently saved article...\n');

db.get(`SELECT 
    id,
    title, 
    author, 
    url, 
    word_count, 
    saved_at,
    content,
    text_content
    FROM articles 
    ORDER BY saved_at DESC 
    LIMIT 1`, (err, article) => {
  
  if (err) {
    console.error('❌ Error:', err);
    return;
  }
  
  if (!article) {
    console.log('📭 No articles found in database');
    db.close();
    return;
  }
  
  console.log('📰 MOST RECENT ARTICLE:');
  console.log('═'.repeat(80));
  console.log(`📄 Title: ${article.title}`);
  console.log(`✍️  Author: ${article.author || 'Unknown'}`);
  console.log(`🔗 URL: ${article.url}`);
  console.log(`📊 Words: ${article.word_count || 0}`);
  console.log(`📅 Saved: ${new Date(article.saved_at).toLocaleString()}`);
  console.log(`🆔 ID: ${article.id}`);
  console.log('═'.repeat(80));
  
  console.log('\n📝 PLAIN TEXT PREVIEW:');
  console.log('─'.repeat(80));
  const preview = (article.text_content || '').substring(0, 300);
  console.log(preview + (preview.length === 300 ? '...' : ''));
  console.log('─'.repeat(80));
  
  console.log('\n🌐 SAVED HTML CONTENT:');
  console.log('─'.repeat(80));
  console.log(article.content);
  console.log('─'.repeat(80));
  
  console.log('\n✅ Complete HTML content shown above');
  console.log(`💡 To save to file: node get-latest-article.js > latest-article.html`);
  
  db.close();
});