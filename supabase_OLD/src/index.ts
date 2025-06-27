#!/usr/bin/env bun
import { ragClient } from './tools/rag-client';
import type { SearchOptions } from './types';

/**
 * Simple RAG System - Main Entry Point
 * 
 * This provides a programmatic interface to the RAG system.
 * For CLI usage, use the manage script: `bun run manage <command>`
 */

export { ragClient } from './tools/rag-client';
export { huggingface } from './huggingface';
export { supabase } from './supabase';
export * from './types';

/**
 * Simple API interface for the RAG system
 */
export class SimpleRAG {
  
  /**
   * Search the knowledge base
   */
  async search(query: string, options: SearchOptions = {}) {
    return await ragClient.search(query, options);
  }

  /**
   * Add knowledge to the database
   */
  async add(content: string, options: { tags?: string[], source?: string, priority?: number } = {}) {
    return await ragClient.addKnowledge(content, options);
  }

  /**
   * Get formatted search results
   */
  async searchFormatted(query: string, options: SearchOptions = {}) {
    const results = await this.search(query, options);
    return await ragClient.formatResults(results);
  }

  /**
   * Get knowledge base statistics
   */
  async getStats() {
    return await ragClient.getStats();
  }

  /**
   * Test system connections
   */
  async testConnections() {
    return await ragClient.testConnections();
  }
}

// Default export for convenience
export const rag = new SimpleRAG();

// If run directly, show usage examples
if (require.main === module || process.argv[1] === __filename) {
  console.log('🚀 Simple RAG System');
  console.log('');
  console.log('Usage Examples:');
  console.log('');
  console.log('📦 Import in your code:');
  console.log('  import { rag } from "./src/index.ts";');
  console.log('  const results = await rag.search("your query");');
  console.log('');
  console.log('🔧 CLI Commands:');
  console.log('  bun run manage test      # Test connections');
  console.log('  bun run manage search    # Search knowledge');
  console.log('  bun run manage add       # Add knowledge');
  console.log('  bun run manage stats     # View statistics');
  console.log('');
  console.log('⚡ Quick Test:');
  console.log('  bun run setup            # Initial setup with sample data');
  console.log('');
}
