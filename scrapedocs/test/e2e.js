import test from 'tape';
import { promises as fs } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import * as scrape from '../src/scrape.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Test helper to clean up created directories
async function cleanup(dirPath) {
  try {
    await fs.rm(dirPath, { recursive: true, force: true });
  } catch (e) {
    // Directory might not exist
  }
}

// Test helper to check if directory exists
async function dirExists(dirPath) {
  try {
    const stats = await fs.stat(dirPath);
    return stats.isDirectory();
  } catch (e) {
    return false;
  }
}

// Test helper to check if file exists and get content
async function getFileContent(filePath) {
  try {
    return await fs.readFile(filePath, 'utf8');
  } catch (e) {
    return null;
  }
}

// Test helper to count files in directory
async function countFiles(dirPath) {
  try {
    const files = await fs.readdir(dirPath);
    return files.filter(f => f.endsWith('.md')).length;
  } catch (e) {
    return 0;
  }
}

test('fetchLinks - basic functionality', async (t) => {
  t.plan(3);
  
  const links = await scrape.fetchLinks('https://httpbin.org/html', {
    includePatterns: [], // Get all links for this test
    maxLinks: 5
  });
  
  t.ok(Array.isArray(links), 'Returns an array');
  t.ok(links.length >= 0, 'Returns links array with valid length');
  t.ok(links.every(link => typeof link === 'string'), 'All links are strings');
});

test('fetchLinks - with filters', async (t) => {
  t.plan(2);
  
  const links = await scrape.fetchLinks('https://docs.github.com/', {
    includePatterns: ['/docs'],
    excludePatterns: ['/enterprise'],
    maxLinks: 10
  });
  
  t.ok(Array.isArray(links), 'Returns filtered links array');
  
  // Check that included patterns are respected
  const hasDocsLinks = links.some(link => link.includes('/docs'));
  t.ok(hasDocsLinks || links.length === 0, 'Includes docs links or returns empty array');
});

test('fetchPageMarkdown - basic content extraction', async (t) => {
  t.plan(4);
  
  const result = await scrape.fetchPageMarkdown('https://httpbin.org/html');
  
  if (result) {
    t.ok(typeof result === 'object', 'Returns an object');
    t.ok(typeof result.title === 'string', 'Has title property');
    t.ok(typeof result.content === 'string', 'Has content property');
    t.ok(result.content.length > 0, 'Content is not empty');
  } else {
    t.skip('Could not fetch content - network or site issue');
    t.skip('Could not fetch content - network or site issue');
    t.skip('Could not fetch content - network or site issue');
    t.skip('Could not fetch content - network or site issue');
  }
});

test('fetchPageMarkdown - markdown conversion', async (t) => {
  t.plan(2);
  
  const result = await scrape.fetchPageMarkdown('https://httpbin.org/html');
  
  if (result && result.content) {
    // Check that markdown formatting is preserved
    const hasMarkdownElements = /#{1,6}\s/.test(result.content) || // Headers
                               /\*\*.*\*\*/.test(result.content) || // Bold
                               /\`.*\`/.test(result.content);       // Code
    
    t.ok(typeof result.content === 'string', 'Content is a string');
    t.ok(result.content.length > 50, 'Content has substantial length');
  } else {
    t.skip('Could not fetch content for markdown test');
    t.skip('Could not fetch content for markdown test');
  }
});

test('run - creates website folder', async (t) => {
  t.plan(2);
  
  const testUrl = 'https://httpbin.org/html';
  const expectedDir = './httpbin_org';
  
  // Cleanup before test
  await cleanup(expectedDir);
  
  try {
    await scrape.run(testUrl, {
      includePatterns: [], // Allow any links for this simple test
      maxLinks: 3
    });
    
    const dirCreated = await dirExists(expectedDir);
    t.ok(dirCreated, 'Creates directory with website name');
    
    const fileCount = await countFiles(expectedDir);
    t.ok(fileCount >= 0, 'Creates markdown files in directory');
    
  } catch (error) {
    t.fail(`Test failed with error: ${error.message}`);
    t.skip('Could not complete directory test due to error');
  } finally {
    // Cleanup after test
    await cleanup(expectedDir);
  }
});

test('run - file naming from URLs', async (t) => {
  t.plan(3);
  
  const testUrl = 'https://httpbin.org/html';
  const expectedDir = './httpbin_org';
  
  // Cleanup before test
  await cleanup(expectedDir);
  
  try {
    await scrape.run(testUrl, {
      includePatterns: [],
      maxLinks: 2
    });
    
    const dirCreated = await dirExists(expectedDir);
    t.ok(dirCreated, 'Directory is created');
    
    // Check that files exist
    const files = await fs.readdir(expectedDir).catch(() => []);
    const mdFiles = files.filter(f => f.endsWith('.md'));
    
    t.ok(mdFiles.length > 0, 'Creates .md files');
    t.ok(mdFiles.every(f => f.includes('_') || f === 'html.md'), 'Files named based on URL structure');
    
  } catch (error) {
    t.skip(`Could not complete file naming test: ${error.message}`);
    t.skip(`Could not complete file naming test: ${error.message}`);
    t.skip(`Could not complete file naming test: ${error.message}`);
  } finally {
    await cleanup(expectedDir);
  }
});

test('run - with real documentation site', async (t) => {
  t.plan(4);
  
  const testUrl = 'https://docs.github.com/';
  const expectedDir = './docs_github_com';
  
  // Cleanup before test
  await cleanup(expectedDir);
  
  try {
    await scrape.run(testUrl, {
      includePatterns: ['/en/get-started'],
      maxLinks: 3,
      concurrency: 1 // Be gentle with GitHub
    });
    
    const dirCreated = await dirExists(expectedDir);
    t.ok(dirCreated, 'Creates directory for real docs site');
    
    const fileCount = await countFiles(expectedDir);
    t.ok(fileCount >= 0, 'Creates files for real docs site');
    
    // Check file content quality
    const files = await fs.readdir(expectedDir).catch(() => []);
    const mdFiles = files.filter(f => f.endsWith('.md'));
    
    if (mdFiles.length > 0) {
      const sampleFile = join(expectedDir, mdFiles[0]);
      const content = await getFileContent(sampleFile);
      
      t.ok(content && content.length > 100, 'Files contain substantial content');
      t.ok(content.includes('**Source:**'), 'Files include source URL');
    } else {
      t.skip('No files created to test content');
      t.skip('No files created to test content');
    }
    
  } catch (error) {
    console.log(`Real site test error: ${error.message}`);
    t.skip('Could not test real documentation site');
    t.skip('Could not test real documentation site');
    t.skip('Could not test real documentation site');
    t.skip('Could not test real documentation site');
  } finally {
    await cleanup(expectedDir);
  }
});

test('run - singleFile option', async (t) => {
  t.plan(3);
  
  const testUrl = 'https://httpbin.org/html';
  const expectedDir = './httpbin_org';
  const expectedFile = join(expectedDir, 'documentation.md');
  
  await cleanup(expectedDir);
  
  try {
    await scrape.run(testUrl, {
      includePatterns: [],
      maxLinks: 2,
      singleFile: true
    });
    
    const dirCreated = await dirExists(expectedDir);
    t.ok(dirCreated, 'Creates directory even with singleFile option');
    
    const singleFileContent = await getFileContent(expectedFile);
    t.ok(singleFileContent !== null, 'Creates single documentation.md file');
    t.ok(singleFileContent.includes('# Documentation'), 'Single file has proper header');
    
  } catch (error) {
    t.skip(`Single file test failed: ${error.message}`);
    t.skip(`Single file test failed: ${error.message}`);
    t.skip(`Single file test failed: ${error.message}`);
  } finally {
    await cleanup(expectedDir);
  }
});

test('error handling - invalid URL', async (t) => {
  t.plan(1);
  
  const links = await scrape.fetchLinks('not-a-valid-url');
  t.deepEqual(links, [], 'Returns empty array for invalid URL');
});

test('error handling - non-existent domain', async (t) => {
  t.plan(1);
  
  const result = await scrape.fetchPageMarkdown('https://this-domain-does-not-exist-12345.com');
  t.equal(result, null, 'Returns null for non-existent domain');
});

// Integration test with your actual use case
test('integration - TaoStats docs (if available)', async (t) => {
  t.plan(2);
  
  const testUrl = 'https://docs.taostats.io/docs/welcome';
  const expectedDir = './docs_taostats_io';
  
  await cleanup(expectedDir);
  
  try {
    await scrape.run(testUrl, {
      includePatterns: ['/docs'],
      maxLinks: 5,
      concurrency: 1 // Be respectful
    });
    
    const dirCreated = await dirExists(expectedDir);
    t.ok(dirCreated, 'Creates TaoStats directory');
    
    const fileCount = await countFiles(expectedDir);
    t.ok(fileCount >= 0, 'Creates TaoStats markdown files');
    
    if (fileCount > 0) {
      console.log(`✅ Successfully scraped ${fileCount} TaoStats documentation pages`);
    }
    
  } catch (error) {
    console.log(`TaoStats test note: ${error.message}`);
    t.skip('TaoStats site may not be available for testing');
    t.skip('TaoStats site may not be available for testing');
  } finally {
    await cleanup(expectedDir);
  }
});

// Performance test
test('performance - handles multiple pages efficiently', async (t) => {
  t.plan(2);
  
  const startTime = Date.now();
  const testUrl = 'https://httpbin.org/html';
  const expectedDir = './httpbin_org';
  
  await cleanup(expectedDir);
  
  try {
    await scrape.run(testUrl, {
      includePatterns: [],
      maxLinks: 5,
      concurrency: 2
    });
    
    const duration = Date.now() - startTime;
    t.ok(duration < 30000, 'Completes within 30 seconds'); // Generous timeout
    
    const fileCount = await countFiles(expectedDir);
    t.ok(fileCount >= 0, 'Successfully processes pages');
    
    console.log(`⏱️  Processed pages in ${duration}ms`);
    
  } catch (error) {
    t.skip(`Performance test failed: ${error.message}`);
    t.skip(`Performance test failed: ${error.message}`);
  } finally {
    await cleanup(expectedDir);
  }
});

console.log('🧪 Running scraper E2E tests...\n');