import axios from 'axios';
import * as cheerio from 'cheerio';
import { promises as fs } from 'fs';
import { URL } from 'url'; // URL is correctly imported

/**
 * Fetch all links from the TOC page using an optional dynamic selector.
 * @param {string} tocUrl - The URL of the table of contents page.
 * @param {string} [elementSelector] - Optional CSS selector for sidebar links (targeting the <a> elements directly).
 *                                    If not provided, all <a> tags will be targeted.
 * @returns {Promise<string[]>} - Array of absolute, deduplicated URLs.
 */
export async function fetchLinks(tocUrl, elementSelector) {
  try {
    const { data } = await axios.get(tocUrl);
    const $ = cheerio.load(data);
    const uniqueLinks = new Set();

    let linkElements;
    if (elementSelector) {
      console.log(`Using selector "${elementSelector}" to find links.`);
      linkElements = $(elementSelector); // Assumes elementSelector targets <a> tags
    } else {
      console.log("No selector provided, finding all <a> tags.");
      linkElements = $('a'); // Get all <a> tags if no selector
    }

    linkElements.each((i, el) => {
      const href = $(el).attr('href');
      if (href) {
        try {
          const absoluteUrl = new URL(href, tocUrl).href;
          uniqueLinks.add(absoluteUrl);
        } catch (urlError) {
          // Log and skip invalid URLs (e.g., 'mailto:', 'javascript:', relative paths that fail to resolve)
          console.warn(`Skipping invalid or non-HTTP(S) URL '${href}' on page ${tocUrl}: ${urlError.message}`);
        }
      }
    });
    
    return Array.from(uniqueLinks);
  } catch (error) {
    console.error(`Error fetching or parsing ${tocUrl}: ${error.message}`);
    return []; // Return empty array on error
  }
}

/**
 * Fetch text content from a page using a dynamic selector.
 * @param {string} pageUrl - The URL of the page to fetch.
 * @param {string} contentSelector - CSS selector for the main content (default: 'body').
 * @returns {Promise<string>} - Text content.
 */
export async function fetchPageText(pageUrl, contentSelector = 'body') {
  console.log(contentSelector)
  const res = await axios.get(pageUrl);
  const $ = cheerio.load(res.data);
  return $(contentSelector).text().trim();
}

/**
 * Orchestrator: fetch links, iterate pages, aggregate text, and write to file.
 * @param {string} tocUrl - Table of contents URL.
 * @param {string} [selector] - Optional sidebar link selector.
 * @param {string} output - Output filename (default: 'llm.txt').
 * @param {string} contentSelector - CSS selector for the main content on detail pages.
 */
export async function run(tocUrl, selector, contentSelector = 'body', output = 'llm.txt') { // Added contentSelector
  console.log(`Fetching links from ${tocUrl} using selector "${selector}"...`);
  const links = await fetchLinks(tocUrl, selector);
  
  if (links.length === 0) {
    console.log('No links found or error fetching TOC. Exiting.');
    return;
  }
  console.log(`Found ${links.length} links.`);

  let buffer = '';
  for (const link of links) {
    console.log(`→ Fetching ${link}`);
    try {
      // Pass contentSelector to fetchPageText
      const text = await fetchPageText(link, contentSelector); 
      buffer += `
---
# Source URL: ${link}

${text}
`;
    } catch (err) {
      console.warn(`Failed to fetch or process ${link}: ${err.message}`);
    }
  }

  console.log(`Writing output to ${output}...`);
  await fs.writeFile(output, buffer.trim(), 'utf8'); // trim buffer before writing
  console.log('Done!');
}

// Only run the function if this file is executed directly (not imported as a module)
if (import.meta.url.endsWith(process.argv[1]) || import.meta.url === `file://${process.argv[1]}`) {
  // ES Module-friendly entry point
  // Get command line arguments
  const args = process.argv.slice(2); // First two are node executable and script path
  const [tocUrlArg, selectorArg, contentSelectorArg, outputArg] = args;

  if (!tocUrlArg) { // tocUrlArg is mandatory, selectorArg is now optional
    console.error('Usage: node scrape.js <TOC_URL> [SIDEBAR_SELECTOR] [CONTENT_SELECTOR] [OUTPUT_FILE]');
    process.exit(1);
  }

  // Call the run function
  run(tocUrlArg, selectorArg, contentSelectorArg, outputArg).catch(console.error);
}
