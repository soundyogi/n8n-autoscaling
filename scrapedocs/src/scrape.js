import axios from 'axios';
import * as cheerio from 'cheerio';
import { promises as fs } from 'fs';
import { URL } from 'url';

/**
 * Convert HTML elements to markdown format
 */
function htmlToMarkdown($, element) {
  let markdown = '';
  
  $(element).contents().each((i, node) => {
    if (node.type === 'text') {
      markdown += $(node).text();
    } else if (node.type === 'tag') {
      const $node = $(node);
      const tagName = node.tagName.toLowerCase();
      
      switch (tagName) {
        case 'h1':
        case 'h2':
        case 'h3':
        case 'h4':
        case 'h5':
        case 'h6':
          const level = '#'.repeat(parseInt(tagName[1]));
          markdown += `\n\n${level} ${$node.text().trim()}\n\n`;
          break;
          
        case 'p':
          markdown += `\n\n${htmlToMarkdown($, node).trim()}\n\n`;
          break;
          
        case 'strong':
        case 'b':
          markdown += `**${$node.text()}**`;
          break;
          
        case 'em':
        case 'i':
          markdown += `*${$node.text()}*`;
          break;
          
        case 'code':
          if ($node.parent().is('pre')) {
            // Handle code blocks
            markdown += `\`\`\`\n${$node.text()}\n\`\`\`\n\n`;
          } else {
            // Inline code
            markdown += `\`${$node.text()}\``;
          }
          break;
          
        case 'pre':
          // Skip if already handled by code tag
          if (!$node.find('code').length) {
            markdown += `\`\`\`\n${$node.text()}\n\`\`\`\n\n`;
          } else {
            markdown += htmlToMarkdown($, node);
          }
          break;
          
        case 'a':
          const href = $node.attr('href');
          const text = $node.text();
          if (href && href !== text) {
            markdown += `[${text}](${href})`;
          } else {
            markdown += text;
          }
          break;
          
        case 'ul':
        case 'ol':
          markdown += '\n';
          $node.children('li').each((i, li) => {
            const bullet = tagName === 'ul' ? '-' : `${i + 1}.`;
            markdown += `${bullet} ${$(li).text().trim()}\n`;
          });
          markdown += '\n';
          break;
          
        case 'blockquote':
          const lines = $node.text().trim().split('\n');
          markdown += '\n' + lines.map(line => `> ${line}`).join('\n') + '\n\n';
          break;
          
        case 'br':
          markdown += '\n';
          break;
          
        default:
          // For other tags, just get the text content
          markdown += htmlToMarkdown($, node);
          break;
      }
    }
  });
  
  return markdown;
}

/**
 * Generate potential raw markdown URLs from a documentation URL
 */
function generateMarkdownUrls(url) {
  const markdownUrls = [];
  
  try {
    const urlObj = new URL(url);
    const path = urlObj.pathname;
    
    // GitHub/GitLab patterns
    if (urlObj.hostname.includes('github.com')) {
      // Convert github.com URLs to raw.githubusercontent.com
      const rawUrl = url
        .replace('github.com', 'raw.githubusercontent.com')
        .replace('/blob/', '/')
        .replace('/tree/', '/');
      markdownUrls.push(rawUrl + '.md');
      markdownUrls.push(rawUrl + '/README.md');
      markdownUrls.push(rawUrl + '/index.md');
    } else if (urlObj.hostname.includes('gitlab.com')) {
      // GitLab raw URLs
      const rawUrl = url.replace('/-/blob/', '/-/raw/');
      markdownUrls.push(rawUrl + '.md');
      markdownUrls.push(rawUrl + '/README.md');
    } else {
      // Generic patterns - try appending .md
      markdownUrls.push(url + '.md');
      markdownUrls.push(url + '/README.md');
      markdownUrls.push(url + '/index.md');
      
      // Try replacing common doc paths
      if (path.includes('/docs/')) {
        const mdUrl = url.replace(/\/docs\//, '/docs/').replace(/\/$/, '') + '.md';
        markdownUrls.push(mdUrl);
      }
    }
    
    return [...new Set(markdownUrls)]; // Remove duplicates
  } catch (e) {
    return [];
  }
}

/**
 * Attempt to fetch raw markdown content directly
 */
async function fetchRawMarkdown(url) {
  const markdownUrls = generateMarkdownUrls(url);
  
  for (const mdUrl of markdownUrls) {
    try {
      console.log(`  🔍 Trying markdown: ${mdUrl}`);
      const response = await axios.get(mdUrl, {
        timeout: 8000,
        headers: { 
          'User-Agent': 'Mozilla/5.0 (Documentation Scraper)',
          'Accept': 'text/plain, text/markdown, */*'
        },
        validateStatus: (status) => status === 200
      });
      
      // Check if response is actually markdown
      const content = response.data;
      if (typeof content === 'string' && 
          content.length > 50 && 
          !content.trim().startsWith('<')) {
        
        console.log(`  ✅ Found markdown: ${mdUrl}`);
        
        // Extract title from markdown content
        const titleMatch = content.match(/^#\s+(.+)$/m);
        const title = titleMatch ? titleMatch[1].trim() : 
                     url.split('/').pop() || 'Untitled';
        
        return {
          url: mdUrl,
          originalUrl: url,
          title: title.replace(/[<>:"/\\|?*]/g, '_'),
          content: content.trim(),
          wordCount: content.split(/\s+/).length,
          isRawMarkdown: true
        };
      }
    } catch (error) {
      // Silently continue to next URL
      console.log(`  ❌ Not found: ${mdUrl}`);
    }
  }
  
  return null;
}

/**
 * Fetch and filter links from a page
 */
export async function fetchLinks(tocUrl, options = {}) {
  const {
    selector,
    includePatterns = [''],
    excludePatterns = ['/login', '/auth', '/signup'],
    sameDomain = true,
    maxLinks = 50
  } = options;

  try {
    console.log(`Fetching links from: ${tocUrl}`);
    const { data } = await axios.get(tocUrl);
    const $ = cheerio.load(data);
    const baseUrl = new URL(tocUrl);
    const links = new Set();

    const linkElements = selector ? $(selector) : $('a[href]');
    
    linkElements.each((i, el) => {
      const href = $(el).attr('href');
      if (!href || href.startsWith('#') || href.startsWith('mailto:')) return;

      try {
        const absoluteUrl = new URL(href, tocUrl);
        
        // Same domain check
        if (sameDomain && absoluteUrl.hostname !== baseUrl.hostname) return;
        
        const path = absoluteUrl.pathname;
        
        // Include patterns check
        if (includePatterns.length > 0) {
          const matches = includePatterns.some(pattern => path.includes(pattern));
          if (!matches) return;
        }
        
        // Exclude patterns check
        if (excludePatterns.some(pattern => path.includes(pattern))) return;
        
        // Remove hash for deduplication
        absoluteUrl.hash = '';
        links.add(absoluteUrl.href);
        
        if (links.size >= maxLinks) return false;
      } catch (e) {
        // Skip invalid URLs
      }
    });
    
    const linkArray = Array.from(links);
    console.log(`Found ${linkArray.length} valid links`);
    return linkArray;
    
  } catch (error) {
    console.error(`Error fetching links: ${error.message}`);
    return [];
  }
}

/**
 * Fetch page content and convert to markdown
 */
export async function fetchPageMarkdown(url, contentSelector = 'main, article, .content, #content', options = {}) {
  const { preferMarkdown = true } = options;
  
  // Try to fetch raw markdown first if enabled
  if (preferMarkdown) {
    console.log(`Fetching: ${url}`);
    const markdownResult = await fetchRawMarkdown(url);
    if (markdownResult) {
      return markdownResult;
    }
    console.log(`  ℹ️  No markdown found, falling back to HTML scraping`);
  }
  
  try {
    console.log(`  🌐 Fetching HTML: ${url}`);
    const { data } = await axios.get(url, {
      timeout: 10000,
      headers: { 'User-Agent': 'Mozilla/5.0 (Documentation Scraper)' }
    });
    
    const $ = cheerio.load(data);
    
    // Try to find content with the selector
    let contentElement = $(contentSelector).first();
    if (contentElement.length === 0) {
      contentElement = $('body');
    }
    
    // Get title
    const title = $('h1').first().text().trim() || 
                 $('title').text().trim() || 
                 url.split('/').pop() || 
                 'Untitled';
    
    // Convert to markdown
    const markdown = htmlToMarkdown($, contentElement[0]);
    
    // Clean up excessive whitespace
    const cleanMarkdown = markdown
      .replace(/\n\s*\n\s*\n/g, '\n\n')  // Remove excessive line breaks
      .replace(/^\s+|\s+$/g, '')          // Trim
      .replace(/ +/g, ' ');               // Remove excessive spaces
    
    if (cleanMarkdown.length < 100) {
      console.warn(`Skipping ${url} - insufficient content`);
      return null;
    }
    
    return {
      url,
      title: title.replace(/[<>:"/\\|?*]/g, '_'), // Clean title for filename
      content: cleanMarkdown,
      wordCount: cleanMarkdown.split(/\s+/).length
    };
    
  } catch (error) {
    console.error(`Failed to fetch ${url}: ${error.message}`);
    return null;
  }
}

/**
 * Generate filename from URL
 */
function urlToFilename(url) {
  try {
    const urlObj = new URL(url);
    let path = urlObj.pathname;
    
    // Remove leading/trailing slashes and replace slashes with underscores
    path = path.replace(/^\/+|\/+$/g, '').replace(/\//g, '_');
    
    // Remove or replace invalid filename characters
    path = path.replace(/[<>:"|?*]/g, '_');
    
    // If path is empty, use the hostname
    if (!path) {
      path = urlObj.hostname.replace(/\./g, '_');
    }
    
    // Ensure it ends with .md
    if (!path.endsWith('.md')) {
      path += '.md';
    }
    
    return path;
  } catch (e) {
    // Fallback for invalid URLs
    return 'page.md';
  }
}

/**
 * Main scraping function
 */
export async function run(tocUrl, options = {}) {
  const {
    linkSelector,
    contentSelector = 'main, article, .content, #content',
    includePatterns = [''],
    excludePatterns = ['/login', '/auth'],
    maxLinks = 30,
    singleFile = false,
    concurrency = 3,
    preferMarkdown = true
  } = options;

  console.log('🚀 Starting documentation scraper...\n');

  // Create output directory based on website name
  const baseUrl = new URL(tocUrl);
  const websiteName = baseUrl.hostname.replace(/^www\./, '').replace(/\./g, '_');
  const outputDir = `./${websiteName}`;

  try {
    await fs.mkdir(outputDir, { recursive: true });
  } catch (e) {
    // Directory might already exist
  }

  // Fetch links
  const links = await fetchLinks(tocUrl, {
    selector: linkSelector,
    includePatterns,
    excludePatterns,
    maxLinks
  });

  if (links.length === 0) {
    console.log('❌ No links found');
    return;
  }

  console.log(`📄 Processing ${links.length} pages...\n`);

  // Process pages with concurrency control
  const results = [];
  const executing = [];

  for (const url of links) {
    const promise = fetchPageMarkdown(url, contentSelector, { preferMarkdown })
      .then(result => {
        executing.splice(executing.indexOf(promise), 1);
        return result;
      });
    
    results.push(promise);
    executing.push(promise);

    if (executing.length >= concurrency) {
      await Promise.race(executing);
    }
  }

  const allResults = await Promise.all(results);
  const successfulResults = allResults.filter(r => r !== null);

  console.log(`\n✅ Successfully scraped ${successfulResults.length} pages`);

  if (successfulResults.length === 0) {
    console.log('No content extracted');
    return;
  }

  // Save results
  if (singleFile) {
    await saveSingleFile(successfulResults, `${outputDir}/documentation.md`);
  } else {
    await saveMultipleFiles(successfulResults, outputDir);
  }

  // Summary
  const totalWords = successfulResults.reduce((sum, r) => sum + r.wordCount, 0);
  console.log(`\n📊 Summary:`);
  console.log(`   • Pages: ${successfulResults.length}`);
  console.log(`   • Words: ${totalWords.toLocaleString()}`);
  console.log(`   • Output: ${outputDir}/`);
}

/**
 * Save as single markdown file
 */
async function saveSingleFile(results, filepath) {
  let content = `# Documentation\n\n`;
  content += `Generated: ${new Date().toISOString()}\n`;
  content += `Pages: ${results.length}\n\n`;
  content += `---\n\n`;

  for (const result of results) {
    content += `# ${result.title}\n\n`;
    content += `**Source:** ${result.url}\n\n`;
    content += `${result.content}\n\n`;
    content += `---\n\n`;
  }

  await fs.writeFile(filepath, content, 'utf8');
  console.log(`📁 Saved: ${filepath}`);
}

/**
 * Save as multiple markdown files
 */
async function saveMultipleFiles(results, outputDir) {
  for (const result of results) {
    const filename = urlToFilename(result.url);
    const filepath = `${outputDir}/${filename}`;
    
    const content = `# ${result.title}\n\n**Source:** ${result.url}\n\n${result.content}`;
    
    await fs.writeFile(filepath, content, 'utf8');
    console.log(`📄 Saved: ${filename}`);
  }
  
  console.log(`\n📁 Saved ${results.length} markdown files to: ${outputDir}/`);
}

// CLI usage
if (import.meta.url.endsWith(process.argv[1]) || import.meta.url === `file://${process.argv[1]}`) {
  const [tocUrl] = process.argv.slice(2);
  
  if (!tocUrl) {
    console.error('Usage: node scrape.js <URL>');
    console.error('Example: node scrape.js https://docs.example.com');
    process.exit(1);
  }

  run(tocUrl).catch(console.error);
}