import { fetchPageMarkdown } from '../src/scrape-puppeteer.js';

async function testMacrocosmosPage() {
  console.log('Testing Puppeteer scraper with Macrocosmos docs...\n');
  
  const url = 'https://docs.macrocosmos.ai/subnet-status-update';
  
  const result = await fetchPageMarkdown(url, {
    contentSelector: 'main, article, .content, #content, [role="main"]',
    waitTime: 5000, // Wait longer for content to load
    waitForSelector: null, // We'll try without specific selector first
    removeSelectors: ['nav', 'header', 'footer', '.sidebar', '.navigation', '.breadcrumb', '.toc']
  });
  
  if (result) {
    console.log('✅ Success! Content extracted:');
    console.log('Title:', result.title);
    console.log('Word count:', result.wordCount);
    console.log('Content preview:');
    console.log(result.content.substring(0, 500) + '...');
  } else {
    console.log('❌ Failed to extract content');
  }
}

testMacrocosmosPage().catch(console.error);
