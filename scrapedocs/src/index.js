import * as scrape from './scrape.js';

const url = "https://api.readme.dev/docs/getting-started"

await scrape.run(url, {
  // includePatterns: ['/macrocosmos-sdk'],    // Only scrape these paths
  excludePatterns: ['/login', '/auth'],  // Skip these paths
  // contentSelector: 'article',     // Where to find content
  maxLinks: 100,                          // Limit number of pages
  singleFile: true,                      // Combine into one file
  concurrency: 3                         // Concurrent requests
});