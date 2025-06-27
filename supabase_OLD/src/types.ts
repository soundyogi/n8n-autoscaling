export interface KnowledgeEntry {
  id: string;
  content: string;
  metadata: Record<string, any>;
  embedding: number[];
  created_at: string;
  updated_at: string;
  tags: string[];
  source?: string;
  priority: number; // 1-5, for importance/recency
}

export interface SearchResult {
  id: string;
  content: string;
  metadata: Record<string, any>;
  similarity: number;
  source?: string;
  created_at: string;
  priority: number;
  tags: string[];
}

export interface SearchOptions {
  threshold?: number;
  count?: number;
  metadata_filter?: Record<string, any>;
  tags_filter?: string[];
  source_filter?: string;
  min_priority?: number;
  recent_first?: boolean; // Sort by recency vs similarity
}

export interface AddKnowledgeOptions {
  content: string;
  metadata?: Record<string, any>;
  tags?: string[];
  source?: string;
  priority?: number;
}

export interface UpdateKnowledgeOptions {
  content?: string;
  metadata?: Record<string, any>;
  tags?: string[];
  source?: string;
  priority?: number;
}
