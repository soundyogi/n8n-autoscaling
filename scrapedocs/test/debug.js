import axios from 'axios';
import * as cheerio from 'cheerio';

const url = "https://docs.macrocosmos.ai/";

console.log('Fetching page...');
const { data } = await axios.get(url);
const $ = cheerio.load(data);

console.log('All links on page:');
const allLinks = $('a[href]');
console.log(`Total a[href] elements found: ${allLinks.length}`);

const links = new Set();
const baseUrl = new URL(url);

allLinks.each((i, el) => {
  const href = $(el).attr('href');
  console.log(`Link ${i}: ${href}`);
  
  if (!href || href.startsWith('#') || href.startsWith('mailto:')) {
    console.log(`  -> Skipped (anchor/mailto/empty)`);
    return;
  }

  try {
    const absoluteUrl = new URL(href, url);
    console.log(`  -> Absolute URL: ${absoluteUrl.href}`);
    
    // Same domain check
    if (absoluteUrl.hostname !== baseUrl.hostname) {
      console.log(`  -> Skipped (different domain: ${absoluteUrl.hostname} vs ${baseUrl.hostname})`);
      return;
    }
    
    const path = absoluteUrl.pathname;
    console.log(`  -> Path: ${path}`);
    
    // Include patterns check
    const includePatterns =  [""] // ['/docs', '/api', '/reference', '/guide'];
    if (includePatterns.length > 0) {
      const matches = includePatterns.some(pattern => path.includes(pattern));
      if (!matches) {
        console.log(`  -> Skipped (doesn't match include patterns)`);
        return;
      }
    }
    
    // Exclude patterns check
    const excludePatterns = ['/login', '/auth', '/signup'];
    if (excludePatterns.some(pattern => path.includes(pattern))) {
      console.log(`  -> Skipped (matches exclude patterns)`);
      return;
    }
    
    // Remove hash for deduplication
    absoluteUrl.hash = '';
    links.add(absoluteUrl.href);
    console.log(`  -> ADDED: ${absoluteUrl.href}`);
    
  } catch (e) {
    console.log(`  -> Skipped (invalid URL: ${e.message})`);
  }
});

console.log(`\nFinal results: ${links.size} unique links`);
console.log(Array.from(links));
