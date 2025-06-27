#!/usr/bin/env node

import { run as runAxiosCheerio } from './src/scrape.js';
import { run as runPuppeteer } from './src/scrape-puppeteer.js';

function showUsage() {
  console.log(`
🕷️  Documentation Scraper
==============================

Usage: node scraper.js [method] <url> [options]

Methods:
  fast       Use Axios + Cheerio (faster, static content only)
  dynamic    Use Puppeteer (slower, handles dynamic content)
  auto       Try fast first, fallback to dynamic if needed

Examples:
  node scraper.js fast https://docs.example.com
  node scraper.js dynamic https://docs.macrocosmos.ai
  node scraper.js auto https://docs.example.com

Options:
  --single-file     Save all content in one markdown file
  --max-links=N     Maximum number of links to process (default: 30)
  --wait-time=N     Time to wait for dynamic content in ms (default: 3000)
  --prefer-markdown Try to download raw .md files first (default: true)
  --no-markdown     Disable markdown detection, use HTML only
  `);
}

async function main() {
  const args = process.argv.slice(2);
  
  if (args.length < 2) {
    showUsage();
    process.exit(1);
  }

  const [method, url, ...options] = args;
  
  if (!['fast', 'dynamic', 'auto'].includes(method)) {
    console.error('❌ Invalid method. Use: fast, dynamic, or auto');
    showUsage();
    process.exit(1);
  }

  // Parse options
  const opts = {
    singleFile: options.includes('--single-file'),
    maxLinks: parseInt(options.find(opt => opt.startsWith('--max-links='))?.split('=')[1]) || 30,
    waitTime: parseInt(options.find(opt => opt.startsWith('--wait-time='))?.split('=')[1]) || 3000,
    preferMarkdown: !options.includes('--no-markdown')
  };

  console.log(`🚀 Starting scraper with method: ${method.toUpperCase()}\n`);

  try {
    if (method === 'fast') {
      await runAxiosCheerio(url, {
        maxLinks: opts.maxLinks,
        singleFile: opts.singleFile,
        preferMarkdown: opts.preferMarkdown
      });
    } else if (method === 'dynamic') {
      await runPuppeteer(url, {
        maxLinks: opts.maxLinks,
        singleFile: opts.singleFile,
        waitTime: opts.waitTime,
        concurrency: 2, // Lower for browser instances
        preferMarkdown: opts.preferMarkdown
      });
    } else if (method === 'auto') {
      console.log('🔄 Trying fast method first...\n');
      
      // Try a single page with fast method first
      const { fetchPageMarkdown: fetchFast } = await import('./src/scrape.js');
      const fastResult = await fetchFast(url);
      
      if (fastResult && fastResult.wordCount > 100) {
        console.log('✅ Fast method works well, using Axios + Cheerio\n');
        await runAxiosCheerio(url, {
          maxLinks: opts.maxLinks,
          singleFile: opts.singleFile,
          preferMarkdown: opts.preferMarkdown
        });
      } else {
        console.log('⚠️  Fast method insufficient, switching to Puppeteer\n');
        await runPuppeteer(url, {
          maxLinks: opts.maxLinks,
          singleFile: opts.singleFile,
          waitTime: opts.waitTime,
          concurrency: 2
        });
      }
    }
  } catch (error) {
    console.error(`❌ Error: ${error.message}`);
    process.exit(1);
  }
}

main();
