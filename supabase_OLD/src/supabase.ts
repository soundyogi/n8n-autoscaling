import { createClient, SupabaseClient } from '@supabase/supabase-js';
import type { SearchResult, AddKnowledgeOptions, UpdateKnowledgeOptions } from './types';
import 'dotenv/config';

class SupabaseService {
  private serviceClient: SupabaseClient;

  constructor() {
    const supabaseUrl = process.env.SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_KEY;

    if (!supabaseUrl || !serviceKey) {
      throw new Error('Missing required Supabase environment variables (URL and SERVICE_KEY)');
    }

    // Use service client for all operations to avoid RLS complications
    this.serviceClient = createClient(supabaseUrl, serviceKey);
  }

  get service() { 
    return this.serviceClient; 
  }

  // Compatibility getter - now points to service client
  get public() { 
    return this.serviceClient; 
  }

  // Search knowledge using vector similarity
  async searchKnowledge(options: {
    embedding: number[];
    threshold?: number;
    count?: number;
    min_priority?: number;
    tags_filter?: string[];
    source_filter?: string;
    recent_first?: boolean;
  }): Promise<SearchResult[]> {
    // Always use service client for consistency
    const client = this.serviceClient;
    const {
      embedding,
      threshold = 0.6,
      count = 10,
      min_priority = 1,
      tags_filter,
      source_filter,
      recent_first = false
    } = options;

    try {
      const functionName = recent_first ? 'search_knowledge_recent' : 'search_knowledge';
      
      // Ensure embedding is properly formatted as a vector string for pgvector
      const vectorString = `[${embedding.join(',')}]`;
      
      // Match parameter order from SQL file
      // The order is: p_query_embedding, p_filter_source, p_match_count, p_match_threshold, p_min_priority
      const { data, error } = await client.rpc(functionName, {
        p_query_embedding: vectorString,
        p_filter_source: source_filter,
        p_match_count: count,
        p_match_threshold: threshold,
        p_min_priority: min_priority
      });

      if (error) {
        console.error('Search error:', error);
        throw new Error(`Search failed: ${error.message}`);
      }

      return data || [];
    } catch (error) {
      console.error('Error searching knowledge:', error);
      throw error;
    }
  }

  // Convenient text-based search that generates embeddings automatically
  async searchKnowledgeByText(
    query: string,
    options: {
      threshold?: number;
      count?: number;
      min_priority?: number;
      tags_filter?: string[];
      source_filter?: string;
      recent_first?: boolean;
    } = {}
  ): Promise<SearchResult[]> {
    // Import huggingface here to avoid circular dependencies
    const { huggingface } = await import('./huggingface.js');
    
    // Generate embedding for the query text
    const embedding = await huggingface.generateEmbedding(query);
    
    // Call the existing searchKnowledge function with the embedding
    return this.searchKnowledge({
      embedding,
      ...options
    });
  }

  // Add new knowledge entry
  async addKnowledge(options: AddKnowledgeOptions & { embedding: number[] }): Promise<string> {
    const { content, embedding, metadata = {}, tags = [], source, priority = 1 } = options;

    try {
      // Convert embedding array to PostgreSQL vector format string
      const vectorString = `[${embedding.join(',')}]`;
      
      const { data, error } = await this.serviceClient
        .from('knowledge_base')
        .insert({
          content,
          embedding: vectorString, // Pass as vector string for PostgreSQL
          metadata,
          tags,
          source,
          priority
        })
        .select('id')
        .single();

      if (error) {
        console.error('Add knowledge error:', error);
        throw new Error(`Failed to add knowledge: ${error.message}`);
      }

      return data.id; // Returns the new UUID
    } catch (error) {
      console.error('Error adding knowledge:', error);
      throw error;
    }
  }

  // Update existing knowledge entry
  async updateKnowledge(id: string, options: UpdateKnowledgeOptions & { embedding?: number[] }): Promise<boolean> {
    const { content, embedding, metadata, tags, source, priority } = options;

    try {
      // Process embedding if present to ensure proper vector format
      let vectorString = undefined;
      if (embedding !== undefined) {
        vectorString = `[${embedding.join(',')}]`;
      }
      
      const { data, error } = await this.serviceClient.rpc('update_knowledge', {
        p_knowledge_id: id,
        p_new_content: content,
        p_new_embedding: vectorString, // Pass as vector string
        p_new_metadata: metadata,
        p_new_tags: tags,
        p_new_priority: priority
      });

      if (error) {
        console.error('Update knowledge error:', error);
        throw new Error(`Failed to update knowledge: ${error.message}`);
      }

      return data === true;
    } catch (error) {
      console.error('Error updating knowledge:', error);
      throw error;
    }
  }

  // Delete knowledge entry
  async deleteKnowledge(id: string): Promise<boolean> {
    try {
      const { error } = await this.serviceClient
        .from('knowledge_base')
        .delete()
        .eq('id', id);

      if (error) {
        console.error('Delete knowledge error:', error);
        throw new Error(`Failed to delete knowledge: ${error.message}`);
      }

      return true;
    } catch (error) {
      console.error('Error deleting knowledge:', error);
      throw error;
    }
  }

  // Get knowledge base statistics
  async getStats(): Promise<{
    total_entries: number;
    recent_entries: number;
    high_priority_entries: number;
    avg_priority: number;
  }> {
    try {
      // Use direct query since the function return type doesn't match our needs
      const { data, error } = await this.serviceClient
        .from('knowledge_base')
        .select('priority, created_at');

      if (error) {
        console.error('Stats error:', error);
        throw new Error(`Failed to get stats: ${error.message}`);
      }

      const entries = data || [];
      const total_entries = entries.length;
      const recent_entries = entries.filter(entry => 
        new Date(entry.created_at) > new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
      ).length;
      const high_priority_entries = entries.filter(entry => entry.priority >= 4).length;
      const avg_priority = entries.length > 0 
        ? entries.reduce((sum, entry) => sum + entry.priority, 0) / entries.length 
        : 0;

      return {
        total_entries,
        recent_entries,
        high_priority_entries,
        avg_priority
      };
    } catch (error) {
      console.error('Error getting stats:', error);
      throw error;
    }
  }

  // Test the connection
  async testConnection(): Promise<boolean> {
    try {
      // Simple query to test if we can access the knowledge_base table
      const { data, error } = await this.serviceClient
        .from('knowledge_base')
        .select('id')
        .limit(1);

      if (error) {
        console.error('Supabase connection test error:', error);
        return false;
      }

      console.log('Supabase connection test successful');
      return true;
    } catch (error) {
      console.error('Supabase connection test failed:', error);
      return false;
    }
  }
}

export const supabase = new SupabaseService();