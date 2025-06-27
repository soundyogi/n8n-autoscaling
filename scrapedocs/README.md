# Documentation Scraper

A smart Node.js web scraper that extracts documentation from any website and converts it to clean markdown files. Perfect for creating local copies of API docs, guides, and technical documentation.

## Features

- 🎯 **Smart Link Filtering** - Automatically finds relevant documentation links
- 📝 **HTML to Markdown** - Preserves formatting (headers, code blocks, links, lists)
- 📁 **Organized Output** - Creates folders named after websites with URL-based filenames
- 🚀 **Concurrent Processing** - Efficiently scrapes multiple pages simultaneously
- 🛡️ **Error Resilient** - Continues scraping even if individual pages fail
- 🌐 **Universal** - Works with any documentation site (GitHub Docs, API docs, etc.)

## Quick Start

```bash
# Install dependencies
npm install axios cheerio puppeteer --save

sudo apt-get update && sudo apt-get install -y wget gnupg ca-certificates procps libxss1 libnss3 libatk-bridge2.0-0 libgtk-3-0 libgbm-dev libasound2

# Scrape any documentation site
node scrape.js https://docs.github.com

# Results in organized markdown files:
# docs_github_com/
#   ├── en_get-started_quickstart.md
#   ├── en_actions_learn-github-actions.md
#   └── api_rest_overview.md
```

## Installation

1. Clone or download the scraper
2. Install dependencies:
   ```bash
   npm install axios cheerio
   ```

## Usage

### Command Line
```bash
node scrape.js <URL>
```

### Programmatic Usage
```javascript
import * as scrape from './scrape.js';

// Basic usage
await scrape.run('https://docs.example.com');

// With custom options
await scrape.run('https://docs.example.com', {
  includePatterns: ['/docs', '/api'],    // Only scrape these paths
  excludePatterns: ['/login', '/auth'],  // Skip these paths
  contentSelector: 'article, main',     // Where to find content
  maxLinks: 20,                          // Limit number of pages
  singleFile: true,                      // Combine into one file
  concurrency: 3                         // Concurrent requests
});
```

## Configuration Options

| Option | Default | Description |
|--------|---------|-------------|
| `includePatterns` | `['/docs', '/api', '/reference']` | URL patterns to include |
| `excludePatterns` | `['/login', '/auth']` | URL patterns to exclude |
| `contentSelector` | `'main, article, .content, #content'` | CSS selector for main content |
| `maxLinks` | `30` | Maximum pages to scrape |
| `singleFile` | `false` | Combine all pages into one markdown file |
| `concurrency` | `3` | Number of simultaneous requests |

## Examples

### API Documentation
```bash
# Scrape REST API docs
node scrape.js https://docs.stripe.com/api

# Creates: docs_stripe_com/api_*.md files
```

### Technical Guides
```javascript
await scrape.run('https://nextjs.org/docs', {
  includePatterns: ['/docs'],
  contentSelector: 'main',
  maxLinks: 25
});
```

### Single Combined File
```javascript
await scrape.run('https://docs.python.org/3/', {
  singleFile: true,
  maxLinks: 15
});
```

## Output Structure

The scraper creates organized markdown files:

```
website_name/
├── docs_getting-started.md
├── api_authentication.md
├── reference_endpoints.md
└── guides_quickstart.md
```

Each file contains:
- Clean markdown formatting
- Preserved code blocks and syntax highlighting  
- Working internal links
- Source URL for reference

## Markdown Conversion

The scraper intelligently converts HTML to markdown:

- `<h1>-<h6>` → `# ## ### ####` headers
- `<strong>` → `**bold text**`
- `<em>` → `*italic text*`
- `<code>` → `` `inline code` ``
- `<pre>` → ``` code blocks ```
- `<a>` → `[text](url)` links
- `<ul><li>` → `- bullet lists`
- `<blockquote>` → `> quoted text`

## Testing

Run the comprehensive test suite:

```bash
# Install test dependencies
npm install --save-dev tape

# Run tests
npm test

# Or directly
node test/scraper.test.js
```

Tests include:
- E2E scraping with real websites
- Markdown conversion accuracy
- File organization
- Error handling
- Performance benchmarks

## Error Handling

The scraper gracefully handles:
- Network timeouts and failures
- Invalid URLs and redirects
- Missing content selectors
- Rate limiting (with retry logic)
- Malformed HTML

Failed pages are logged but don't stop the scraping process.

## Best Practices

1. **Be Respectful**: Use reasonable concurrency (2-3) and delays
2. **Test First**: Try with `maxLinks: 5` before full scraping
3. **Check robots.txt**: Respect site scraping policies
4. **Use Specific Selectors**: Target main content areas for cleaner output

## Dependencies

- [axios](https://www.npmjs.com/package/axios) - HTTP requests
- [cheerio](https://www.npmjs.com/package/cheerio) - HTML parsing and DOM manipulation

## Use Cases

- 📚 **Local Documentation** - Offline access to docs
- 🔍 **Documentation Analysis** - Feed docs to LLMs for analysis
- 📋 **Content Migration** - Convert old docs to markdown
- 🏗️ **Documentation Backups** - Preserve important technical content
- 🤖 **AI Training Data** - Prepare documentation for AI models

## Contributing

Feel free to submit issues and improvements! The scraper is designed to be simple, universal, and easily extensible.