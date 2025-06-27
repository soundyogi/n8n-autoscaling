# Supabase RAG System - AI Memory

## Project Overview
Complete TypeScript-based RAG system using Supabase (PostgreSQL + pgvector) and HuggingFace embeddings. Status: **100% COMPLETE** with 26/26 tests passing.

## Key Architecture
- **Runtime**: Bun (TypeScript execution)
- **Database**: Supabase PostgreSQL with pgvector extension
- **Embeddings**: HuggingFace BAAI/bge-small-en-v1.5 (384-dimensional)
- **Vector Storage**: pgvector with HNSW indexing

## Critical Files & Purposes

### Core Library (`src/`) [Updated]
- `supabase.ts` - Manages Supabase client, handles CRUD operations for `knowledge_base` table, and provides vector similarity search. Depends on `SUPABASE_URL` and `SUPABASE_SERVICE_KEY`. Includes `searchKnowledgeByText` which uses `huggingface.generateEmbedding`.
- `huggingface.ts` - Handles generation of 384-dimensional embeddings using HuggingFace Inference API (`BAAI/bge-small-en-v1.5` model). Requires `HUGGINGFACE_API_KEY`. Provides single and batch embedding generation.
- `types.ts` - Defines TypeScript interfaces for `KnowledgeEntry`, `SearchResult`, `SearchOptions`, `AddKnowledgeOptions`, and `UpdateKnowledgeOptions` for type safety.
- `index.ts` - Main programmatic entry point for the RAG system via `SimpleRAG` class. Re-exports `ragClient`, `huggingface`, `supabase`, and all types. Includes CLI usage examples.
- `tools/rag-client.ts` - (To be reviewed) Likely orchestrates interactions between Supabase and HuggingFace services.
- `tools/smolagents_tool.py` - (To be reviewed) Python integration for SmolAgents.
- `scripts/setup.ts` - (To be reviewed) Utility for initializing with sample data.
- `scripts/manage.ts` - (To be reviewed) CLI management interface for the RAG system.

### Database Schema (`sql/`)
- Scripts 1-9 create complete database setup
- **CRITICAL**: Script 8 (`8_fix_search_function_ranking.sql`) fixes search ranking
- Script 9 adds n8n compatibility functions

### Testing (`test/`) [Validated]
- `test/test.ts` - Comprehensive test suite validating HuggingFace embedding generation, Supabase vector storage, similarity search, and data integrity. It uses `tape` for assertions and includes phases for embedding generation, vector storage, storage format verification, similarity search, and search quality/ranking.
- `test/cleanup.ts` - A utility script to delete all entries from the `knowledge_base` table in Supabase, effectively cleaning up test data.
- `test/inspect-test-records.ts` - Utility for inspecting test records in the database.
- `test/test-n8n-compatibility.ts` - Tests specific n8n integration functions.

### Tools & Scripts
- `scripts/setup.ts` - Initializes the database with sample data and performs connection tests. It adds pre-defined Bittensor-related knowledge entries.
- `scripts/manage.ts` - Provides a command-line interface for interacting with the RAG system, including `test`, `search`, `add`, and `stats` commands. It parses CLI arguments for search options.
- `src/tools/rag-client.ts` - The core RAG client. It orchestrates the search, add, update, and delete operations by interacting with `huggingface.ts` for embeddings and `supabase.ts` for database operations. It also provides connection testing and result formatting.
- `src/tools/smolagents_tool.py` - Python integration for SmolAgents. It exposes `search_knowledge_base`, `add_knowledge_entry`, and `get_knowledge_stats` as SmolAgents tools, allowing Python-based AI agents to interact with the RAG system. It handles environment variable loading and API calls to HuggingFace and Supabase.

## Known Issues & Solutions
- **Search Ranking**: Fixed in script 8 - ensures proper similarity score ordering
- **Vector Dimensions**: Must be exactly 384 for HuggingFace model compatibility
- **Database Cleanup**: Use `cleanup.ts` or `0_cleanup.sql` for clean slate

## Integration Points [Expanded]
- **n8n**:
  - Compatibility layer in `sql/9_n8n_compatibility.sql`
  - Function signature: `match_documents(query_embedding, match_count, filter)`
  - Type conversions: UUID→bigint, metadata→jsonb
  - Testing: `test/test-n8n-compatibility.ts` (10 additional tests)
- **Python**: SmolAgents tool in `tools/smolagents_tool.py`
- **REST API**: Direct Supabase client access

## Performance Notes
- HNSW indexing for fast vector similarity search
- Similarity scores: 0.5-1.0 range (1.0 = perfect match)
- Supports batch operations for efficient processing

## Alternative Architecture
Supabase Edge Functions with native `gte-small` model available (documented in `docs/supabase_semantic_search.md`) - eliminates external HuggingFace dependency.