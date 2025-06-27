# Scrapedocs - AI Memory

## Project Overview
**Type:** Node.js web documentation scraper  
**Runtime:** Node.js with ES modules  
**Primary Dependencies:** axios, cheerio, puppeteer  
**Purpose:** Smart web scraper that extracts documentation from websites and converts to clean markdown files

## Architecture

### Core Components
- `scraper.js` - Main CLI entry point with method routing (fast/dynamic/auto)
- `src/scrape.js` - Axios + Cheerio implementation (static content, faster)
- `src/scrape-puppeteer.js` - Puppeteer implementation (dynamic content, slower)
- `src/index.js` - Common utilities and exports

### Key Features
- Smart link filtering for documentation discovery
- **Markdown Detection**: Automatic detection and download of raw .md files
- HTML to markdown conversion with formatting preservation
- Concurrent processing for efficiency
- Error resilience and fallback mechanisms
- Organized output with URL-based naming
- CLI options for markdown preferences (--prefer-markdown, --no-markdown)

## File Structure Analysis

### Source Files
- **scraper.js**: CLI router supporting 3 methods (fast/dynamic/auto)
- **src/scrape.js**: Core scraping logic with HTML→markdown conversion
- **src/scrape-puppeteer.js**: Puppeteer-based scraper for dynamic content
- **src/index.js**: Common utilities and module exports

### Configuration
- **package.json**: ES modules enabled, dependencies: axios, cheerio, puppeteer
- **Dockerfile**: Containerization support with Puppeteer dependencies

### Documentation & Planning
- **README.md**: User-facing documentation with quick start guide
- **docs/scratchpad.md**: Development planning and implementation notes

### Testing
- **test/** directory with multiple test files:
  - `clitest.sh`, `debug.js`, `e2e.js`, `test-puppeteer.js`, `test.js`

## Known Issues & QA Concerns

### Missing Test Coverage
- No `/test` folder structure following project standards
- Test files exist but unclear if they follow consistent patterns
- Need to verify test coverage for core scraping functions

### Code Quality Areas to Review
1. **Input validation** - URL validation and sanitization
2. **Error handling** - Graceful degradation for network failures
3. **Resource management** - Puppeteer browser cleanup
4. **Configuration** - Environment variable support

## Latest Developments

### ✅ Markdown Detection Feature (June 2025)
Successfully implemented automatic raw markdown detection:

**Features Added:**
- `generateMarkdownUrls()` - Smart URL pattern generation for GitHub, GitLab, generic docs
- `fetchRawMarkdown()` - Direct markdown download with validation
- Enhanced `fetchPageMarkdown()` with markdown-first approach
- CLI options: `--prefer-markdown` (default), `--no-markdown`

**Test Results:**
- Successfully tested with https://api.readme.dev/docs/getting-started
- Found 4/5 pages as raw markdown with significant quality improvement
- Graceful fallback to HTML scraping when markdown unavailable
- All CLI methods (fast/dynamic/auto) support markdown detection

**Quality Improvements:**
- Raw markdown preserves original formatting and structure
- Eliminates HTML parsing artifacts
- Faster processing for markdown-available content
- Better preservation of code blocks and special formatting

**Implementation Details:**
- `generateMarkdownUrls()` - Creates potential .md URLs from doc links (GitHub, GitLab patterns)
- `fetchRawMarkdown()` - Downloads raw markdown with 8s timeout and content validation
- Enhanced `fetchPageMarkdown()` - Markdown-first approach with HTML fallback
- CLI integration - `--prefer-markdown` (default), `--no-markdown` options
- Backward compatible - All existing functionality preserved

**Production Status:** ✅ Complete and tested - Ready for production use
1. **Error Handling**: Verify comprehensive error handling in scraping functions
2. **Rate Limiting**: Check if scraper implements proper delays/rate limiting
3. **Memory Management**: Large documentation sites could cause memory issues
4. **Security**: Validate URL handling and XSS prevention in HTML parsing

### Documentation Gaps
- Missing API documentation for programmatic usage
- No clear examples for different website types
- Unclear how to handle authentication or complex navigation

## Dependencies & Versions
- **axios**: ^1.9.0 (HTTP client)
- **cheerio**: ^1.0.0 (Server-side jQuery for HTML parsing)
- **puppeteer**: ^24.9.0 (Headless Chrome automation)

## Development Notes
- Project uses ES modules (`"type": "module"`)
- Puppeteer requires additional system dependencies (handled in Dockerfile)
- Output organized by domain name with URL-based filenames
- Supports both single-file and multi-file output modes

## Recent Session Activity
- Initial memory creation and project analysis
- Identified need for comprehensive QA review
- Need to assess test coverage and code quality standards
