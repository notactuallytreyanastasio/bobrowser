// Test bookmarklet for Puppeteer archiving
// Copy this entire function and paste it as a bookmarklet, or run it in browser console

(function() {
  const currentUrl = window.location.href;
  const currentTitle = document.title;
  
  console.log('Saving article:', currentTitle);
  
  fetch('https://127.0.0.1:3003/api/articles', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      url: currentUrl,
      title: currentTitle
    })
  })
  .then(response => response.json())
  .then(data => {
    if (data.success) {
      alert('✅ Article archived successfully! You can now read it offline.');
      console.log('Archive result:', data);
    } else {
      alert('❌ Failed to archive: ' + (data.error || 'Unknown error'));
    }
  })
  .catch(error => {
    console.error('Archive error:', error);
    alert('❌ Archive failed: ' + error.message);
  });
})();