# Website Scraper Agent Scratchpad

Use this scratchpad as a template to design and implement a web scraper agent that:

* Fetches a table of contents (TOC) page
* Extracts all sidebar links matching a CSS selector
* Visits each link and retrieves the main text content
* Aggregates the content into a single output file (e.g., `llm.txt`)

---

## 1. Project Overview

**Goal:** Build an automated agent/script to collect documentation pages from a website and compile them into a single text file for LLM ingestion.

**Input:**

* `TOC_URL`: URL of the landing page with the sidebar (e.g., `https://readme.com/taostats/docs`)
* `SIDEBAR_SELECTOR`: CSS selector for sidebar links (e.g., `a.Sidebar-link_parent`)

**Output:**

* `llm.txt`: A text file containing concatenated page content, separated by source URLs.

---

## 2. Environment Setup

```bash
mkdir scraper-agent
cd scraper-agent
npm init -y
npm install axios cheerio
```

> Optionally, consider using ES modules or CommonJS based on your preference.

---

## 3. Dependencies

```json
{
  "dependencies": {
    "axios": "^1.x",
    "cheerio": "^1.x"
  }
}
```

---

## 4. High-Level Steps

1. **Initialize**: Read input arguments (`TOC_URL`, `SIDEBAR_SELECTOR`, `OUTPUT_FILE`).
2. **Fetch TOC**: Use `axios` to GET `TOC_URL`.
3. **Extract Links**: Parse HTML with `cheerio` and select elements matching `SIDEBAR_SELECTOR`, resolving to absolute URLs.
4. **Iterate Links**: For each URL:

   * Fetch page HTML
   * Parse and extract main content (adjust selector)
   * Clean and normalize text
   * Append to buffer with separator
5. **Write Output**: Write buffer to `OUTPUT_FILE`.
6. **Error Handling**: Log or retry on failures.

---

## 5. Code Outline

```js
import axios from 'axios';
import cheerio from 'cheerio';
import { promises as fs } from 'fs';
import { URL } from 'url'; // URL is correctly imported

/**
 * Fetch all links from the TOC page using an optional dynamic selector.
 * @param {string} tocUrl - The URL of the table of contents page.
 * @param {string} [elementSelector] - Optional CSS selector for sidebar links (targeting the <a> elements directly).
 *                                    If not provided, all <a> tags will be targeted.
 * @returns {Promise<string[]>} - Array of absolute, deduplicated URLs.
 */
async function fetchLinks(tocUrl, elementSelector) {
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
async function fetchPageText(pageUrl, contentSelector = 'body') {
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
async function run(tocUrl, selector, output = 'llm.txt', contentSelector = 'body') { // Added contentSelector
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

// ES Module-friendly entry point
// Get command line arguments
const args = process.argv.slice(2); // First two are node executable and script path
const [tocUrlArg, selectorArg, outputArg, contentSelectorArg] = args;

if (!tocUrlArg) { // tocUrlArg is mandatory, selectorArg is now optional
  console.error('Usage: node scrape.js <TOC_URL> [SIDEBAR_SELECTOR] [OUTPUT_FILE] [CONTENT_SELECTOR]');
  process.exit(1);
}

// Call the run function
// selectorArg can be undefined, and run/fetchLinks will handle it
run(tocUrlArg, selectorArg, outputArg, contentSelectorArg).catch(console.error);
```

## 6. Agent Integration

If controlling this via another agent (e.g., a task runner or LLM-driven orchestrator), outline prompts:

1. **Task**: *"Fetch TOC page and extract deep links"*
2. **Task**: *"Download each link and extract text content"*
3. **Task**: *"Aggregate text and save to `llm.txt`"*

Example agent prompt:

```
You are a scraping agent. Given a URL and a CSS selector, extract all matching links, fetch each link's content, and store it in a text file. Respond with status and errors.
```

---

## 7. Testing & Validation

* **Unit tests**: mock HTTP responses and verify link extraction and text parsing.
* **Integration test**: run against a sample site and inspect `llm.txt`.

---

## 8. Next Steps

* Add concurrency control (e.g., `Promise.allSettled` with limits)
* Implement retries/backoff for network errors
* Allow custom content selectors per page type
* Dockerize for consistent environments
* Add logging and progress indicators

---

*Keep iterating!*
