import * as scrape from '../src/scrape.js';

const url = "https://modelcontextprotocol.io/"

/*
const links = await scrape.fetchLinks(url, {
  // includePatterns: ['/developers'],    // Only scrape these paths
  excludePatterns: ['/login', '/auth'],  // Skip these paths
  contentSelector: 'article',     // Where to find content
  maxLinks: 100,                          // Limit number of pages
  singleFile: true,                      // Combine into one file
  concurrency: 3                   // Concurrent requests
});
console.log(links);
*/


const site = await scrape.fetchPageMarkdown("https://github.com/modelcontextprotocol/typescript-sdk");
console.log(site);