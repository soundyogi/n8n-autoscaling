# Advanced SQL Features for Supabase RAG System

> Extended functionality including similarity analysis, event logging, complex statistics, and analytics

## 📋 Overview

This file contains advanced SQL features that extend the core Supabase RAG system. These are optional enhancements that provide:

- **Similarity Analysis** - Find related content entries
- **Event Logging** - Track system activity and analytics
- **Complex Statistics** - Advanced reporting and insights
- **Cleanup Functions** - Maintenance and optimization
- **Security Features** - Row Level Security policies

**Prerequisites:** Complete the basic setup from `setup-sql.md` first.

---

## 🔍 Advanced Search Functions

### Find Similar Entries

```sql
-- Find content similar to a specific entry
CREATE OR REPLACE FUNCTION find_similar(
    target_id uuid,
    similarity_threshold float DEFAULT 0.8,
    limit_count int DEFAULT 5
)
RETURNS TABLE (
    id uuid,
    content text,
    similarity float,
    source text,
    priority int
) AS $$
DECLARE
    target_embedding vector(384);
BEGIN
    -- Get the embedding of the target entry
    SELECT embedding INTO target_embedding
    FROM knowledge_base
    WHERE knowledge_base.id = target_id;

    IF target_embedding IS NULL THEN
        RAISE EXCEPTION 'Entry with ID % not found or has no embedding', target_id;
    END IF;

    RETURN QUERY
    SELECT 
        kb.id,
        kb.content,
        1 - (kb.embedding <=> target_embedding) as similarity,
        kb.source,
        kb.priority
    FROM knowledge_base kb
    WHERE 
        kb.embedding IS NOT NULL
        AND kb.id != target_id
        AND 1 - (kb.embedding <=> target_embedding) > similarity_threshold
    ORDER BY kb.embedding <=> target_embedding
    LIMIT limit_count;
END;
$$ LANGUAGE plpgsql;
```

### Content Clustering Analysis

```sql
-- Find clusters of similar content
CREATE OR REPLACE FUNCTION analyze_content_clusters(
    similarity_threshold float DEFAULT 0.85,
    min_cluster_size int DEFAULT 3
)
RETURNS TABLE (
    cluster_id int,
    entry_id uuid,
    content text,
    avg_similarity float
)
LANGUAGE plpgsql
AS $$
DECLARE
    cluster_counter int := 0;
BEGIN
    -- This is a simplified clustering approach
    -- For production, consider more sophisticated clustering algorithms
    
    CREATE TEMP TABLE IF NOT EXISTS temp_clusters (
        cluster_id int,
        entry_id uuid,
        content text,
        processed boolean DEFAULT false
    );

    -- Process each unprocessed entry
    FOR entry_id, content IN 
        SELECT kb.id, kb.content 
        FROM knowledge_base kb 
        WHERE kb.embedding IS NOT NULL
    LOOP
        -- Check if already clustered
        IF NOT EXISTS (SELECT 1 FROM temp_clusters WHERE temp_clusters.entry_id = entry_id) THEN
            cluster_counter := cluster_counter + 1;
            
            -- Add similar entries to this cluster
            INSERT INTO temp_clusters (cluster_id, entry_id, content)
            SELECT 
                cluster_counter,
                similar.id,
                similar.content
            FROM find_similar(entry_id, similarity_threshold, 50) similar;
            
            -- Add the original entry if it wasn't included
            INSERT INTO temp_clusters (cluster_id, entry_id, content)
            SELECT cluster_counter, entry_id, content
            WHERE NOT EXISTS (
                SELECT 1 FROM temp_clusters 
                WHERE temp_clusters.entry_id = entry_id
            );
        END IF;
    END LOOP;

    -- Return clusters with minimum size
    RETURN QUERY
    SELECT 
        tc.cluster_id,
        tc.entry_id,
        tc.content,
        0.9::float as avg_similarity  -- Placeholder
    FROM temp_clusters tc
    WHERE tc.cluster_id IN (
        SELECT cluster_id 
        FROM temp_clusters 
        GROUP BY cluster_id 
        HAVING COUNT(*) >= min_cluster_size
    )
    ORDER BY tc.cluster_id, tc.entry_id;

    DROP TABLE IF EXISTS temp_clusters;
END;
$$;
```

---

## 📊 Advanced Analytics & Statistics

### Comprehensive Knowledge Base Stats

```sql
-- Enhanced statistics with embedding analysis
CREATE OR REPLACE FUNCTION get_detailed_knowledge_stats()
RETURNS TABLE (
    total_entries bigint,
    entries_with_embeddings bigint,
    embedding_coverage_percent numeric,
    sources_count bigint,
    avg_content_length numeric,
    priority_distribution jsonb,
    source_distribution jsonb,
    tags_distribution jsonb,
    creation_timeline jsonb,
    latest_entry timestamptz,
    oldest_entry timestamptz
)
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        COUNT(*) as total_entries,
        COUNT(embedding) as entries_with_embeddings,
        ROUND(COUNT(embedding)::numeric / NULLIF(COUNT(*), 0) * 100, 2) as embedding_coverage_percent,
        COUNT(DISTINCT source) as sources_count,
        ROUND(AVG(LENGTH(content)), 0) as avg_content_length,
        
        -- Priority distribution
        (SELECT jsonb_object_agg(priority, count)
         FROM (SELECT priority, COUNT(*) as count FROM knowledge_base GROUP BY priority) p) as priority_distribution,
        
        -- Source distribution
        (SELECT jsonb_object_agg(COALESCE(source, 'unknown'), count)
         FROM (SELECT source, COUNT(*) as count FROM knowledge_base GROUP BY source ORDER BY count DESC LIMIT 10) s) as source_distribution,
        
        -- Top tags
        (SELECT jsonb_object_agg(tag, count)
         FROM (SELECT UNNEST(tags) as tag, COUNT(*) as count FROM knowledge_base GROUP BY tag ORDER BY count DESC LIMIT 20) t) as tags_distribution,
        
        -- Creation timeline (last 30 days)
        (SELECT jsonb_object_agg(day, count)
         FROM (SELECT DATE(created_at) as day, COUNT(*) as count 
               FROM knowledge_base 
               WHERE created_at > NOW() - INTERVAL '30 days'
               GROUP BY DATE(created_at) 
               ORDER BY day) timeline) as creation_timeline,
        
        MAX(created_at) as latest_entry,
        MIN(created_at) as oldest_entry
    FROM knowledge_base;
END;
$$;
```

### Content Quality Analysis

```sql
-- Analyze content quality metrics
CREATE OR REPLACE FUNCTION analyze_content_quality()
RETURNS TABLE (
    metric TEXT,
    value NUMERIC,
    description TEXT
)
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        'avg_content_length'::TEXT,
        ROUND(AVG(LENGTH(content)), 0),
        'Average character length of content entries'::TEXT
    FROM knowledge_base
    UNION ALL
    SELECT 
        'short_content_count'::TEXT,
        COUNT(*)::NUMERIC,
        'Entries with less than 50 characters'::TEXT
    FROM knowledge_base 
    WHERE LENGTH(content) < 50
    UNION ALL
    SELECT 
        'long_content_count'::TEXT,
        COUNT(*)::NUMERIC,
        'Entries with more than 2000 characters'::TEXT
    FROM knowledge_base 
    WHERE LENGTH(content) > 2000
    UNION ALL
    SELECT 
        'untagged_count'::TEXT,
        COUNT(*)::NUMERIC,
        'Entries without tags'::TEXT
    FROM knowledge_base 
    WHERE tags = '{}' OR tags IS NULL
    UNION ALL
    SELECT 
        'no_metadata_count'::TEXT,
        COUNT(*)::NUMERIC,
        'Entries with empty metadata'::TEXT
    FROM knowledge_base 
    WHERE metadata = '{}' OR metadata IS NULL;
END;
$$;
```

---

## 🎯 Event Logging System

### Enhanced Event Log Table

```sql
-- Enhanced event logging with better structure
CREATE TABLE IF NOT EXISTS event_log (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    event_type TEXT NOT NULL,
    event_data JSONB NOT NULL,
    source TEXT DEFAULT 'system',
    user_id TEXT,
    session_id TEXT,
    ip_address INET,
    user_agent TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Constraints
    CONSTRAINT event_type_valid CHECK (event_type ~ '^[a-z_]+$')
);

-- Performance indexes for event log
CREATE INDEX IF NOT EXISTS idx_event_created ON event_log (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_event_type ON event_log (event_type);
CREATE INDEX IF NOT EXISTS idx_event_source ON event_log (source);
CREATE INDEX IF NOT EXISTS idx_event_user ON event_log (user_id);
CREATE INDEX IF NOT EXISTS idx_event_session ON event_log (session_id);
CREATE INDEX IF NOT EXISTS idx_event_data ON event_log USING GIN (event_data);
```

### Event Logging Functions

```sql
-- Log search events with analytics
CREATE OR REPLACE FUNCTION log_search_event(
    p_query_text TEXT,
    p_results_count INT,
    p_match_threshold FLOAT,
    p_execution_time_ms INT DEFAULT NULL,
    p_user_id TEXT DEFAULT NULL,
    p_session_id TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
AS $$
DECLARE
    event_id UUID;
BEGIN
    INSERT INTO event_log (
        event_type, 
        event_data, 
        source, 
        user_id, 
        session_id
    )
    VALUES (
        'search_performed',
        jsonb_build_object(
            'query_length', LENGTH(p_query_text),
            'results_count', p_results_count,
            'match_threshold', p_match_threshold,
            'execution_time_ms', p_execution_time_ms,
            'has_results', p_results_count > 0
        ),
        'search_api',
        p_user_id,
        p_session_id
    )
    RETURNING id INTO event_id;
    
    RETURN event_id;
END;
$$;

-- Log content interactions
CREATE OR REPLACE FUNCTION log_content_interaction(
    p_content_id UUID,
    p_interaction_type TEXT,
    p_metadata JSONB DEFAULT '{}',
    p_user_id TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
AS $$
DECLARE
    event_id UUID;
    content_info RECORD;
BEGIN
    -- Get content information
    SELECT source, priority, array_length(tags, 1) as tag_count
    INTO content_info
    FROM knowledge_base 
    WHERE id = p_content_id;
    
    INSERT INTO event_log (
        event_type, 
        event_data, 
        source, 
        user_id
    )
    VALUES (
        'content_interaction',
        jsonb_build_object(
            'content_id', p_content_id,
            'interaction_type', p_interaction_type,
            'content_source', content_info.source,
            'content_priority', content_info.priority,
            'content_tag_count', content_info.tag_count
        ) || p_metadata,
        'content_api',
        p_user_id
    )
    RETURNING id INTO event_id;
    
    RETURN event_id;
END;
$$;
```

### Analytics Queries

```sql
-- Search analytics
CREATE OR REPLACE FUNCTION get_search_analytics(
    p_days_back INT DEFAULT 7
)
RETURNS TABLE (
    metric TEXT,
    value NUMERIC,
    period TEXT
)
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        'total_searches'::TEXT,
        COUNT(*)::NUMERIC,
        (p_days_back || ' days')::TEXT
    FROM event_log 
    WHERE event_type = 'search_performed' 
    AND created_at > NOW() - (p_days_back || ' days')::INTERVAL
    
    UNION ALL
    
    SELECT 
        'avg_results_per_search'::TEXT,
        ROUND(AVG((event_data->>'results_count')::NUMERIC), 2),
        (p_days_back || ' days')::TEXT
    FROM event_log 
    WHERE event_type = 'search_performed' 
    AND created_at > NOW() - (p_days_back || ' days')::INTERVAL
    
    UNION ALL
    
    SELECT 
        'searches_with_no_results'::TEXT,
        COUNT(*)::NUMERIC,
        (p_days_back || ' days')::TEXT
    FROM event_log 
    WHERE event_type = 'search_performed' 
    AND (event_data->>'results_count')::INT = 0
    AND created_at > NOW() - (p_days_back || ' days')::INTERVAL;
END;
$$;
```

---

## 🧹 Maintenance & Cleanup Functions

### Advanced Cleanup with Analytics

```sql
-- Enhanced cleanup with detailed reporting
CREATE OR REPLACE FUNCTION cleanup_old_events(
    days_to_keep INT DEFAULT 30,
    dry_run BOOLEAN DEFAULT FALSE
)
RETURNS TABLE (
    action TEXT,
    count BIGINT,
    details JSONB
)
LANGUAGE plpgsql
AS $$
DECLARE
    cutoff_date TIMESTAMPTZ;
    deleted_count BIGINT;
    event_type_summary JSONB;
BEGIN
    cutoff_date := NOW() - (days_to_keep || ' days')::INTERVAL;
    
    -- Get summary of events to be deleted
    SELECT jsonb_object_agg(event_type, count)
    INTO event_type_summary
    FROM (
        SELECT event_type, COUNT(*) as count 
        FROM event_log 
        WHERE created_at < cutoff_date
        GROUP BY event_type
    ) summary;
    
    IF NOT dry_run THEN
        -- Perform actual deletion
        DELETE FROM event_log 
        WHERE created_at < cutoff_date;
        
        GET DIAGNOSTICS deleted_count = ROW_COUNT;
        
        -- Log the cleanup action
        INSERT INTO event_log (event_type, event_data)
        VALUES (
            'cleanup_completed',
            jsonb_build_object(
                'deleted_events', deleted_count, 
                'days_kept', days_to_keep,
                'cutoff_date', cutoff_date,
                'event_type_summary', event_type_summary
            )
        );
    ELSE
        -- Dry run - just count
        SELECT COUNT(*) INTO deleted_count
        FROM event_log 
        WHERE created_at < cutoff_date;
    END IF;
    
    RETURN QUERY
    SELECT 
        CASE WHEN dry_run THEN 'dry_run_would_delete' ELSE 'deleted' END::TEXT,
        COALESCE(deleted_count, 0),
        jsonb_build_object(
            'cutoff_date', cutoff_date,
            'event_types', COALESCE(event_type_summary, '{}'::jsonb)
        );
END;
$$;

-- Clean up orphaned or low-quality content
CREATE OR REPLACE FUNCTION cleanup_knowledge_base(
    remove_no_embedding BOOLEAN DEFAULT FALSE,
    remove_short_content BOOLEAN DEFAULT FALSE,
    min_content_length INT DEFAULT 10,
    dry_run BOOLEAN DEFAULT FALSE
)
RETURNS TABLE (
    action TEXT,
    count BIGINT,
    criteria TEXT
)
LANGUAGE plpgsql
AS $$
DECLARE
    deleted_no_embedding BIGINT := 0;
    deleted_short_content BIGINT := 0;
BEGIN
    IF remove_no_embedding THEN
        IF NOT dry_run THEN
            DELETE FROM knowledge_base WHERE embedding IS NULL;
            GET DIAGNOSTICS deleted_no_embedding = ROW_COUNT;
        ELSE
            SELECT COUNT(*) INTO deleted_no_embedding 
            FROM knowledge_base WHERE embedding IS NULL;
        END IF;
        
        RETURN QUERY
        SELECT 
            CASE WHEN dry_run THEN 'would_remove_no_embedding' ELSE 'removed_no_embedding' END::TEXT,
            deleted_no_embedding,
            'entries without embeddings'::TEXT;
    END IF;
    
    IF remove_short_content THEN
        IF NOT dry_run THEN
            DELETE FROM knowledge_base 
            WHERE LENGTH(TRIM(content)) < min_content_length;
            GET DIAGNOSTICS deleted_short_content = ROW_COUNT;
        ELSE
            SELECT COUNT(*) INTO deleted_short_content 
            FROM knowledge_base 
            WHERE LENGTH(TRIM(content)) < min_content_length;
        END IF;
        
        RETURN QUERY
        SELECT 
            CASE WHEN dry_run THEN 'would_remove_short_content' ELSE 'removed_short_content' END::TEXT,
            deleted_short_content,
            ('entries shorter than ' || min_content_length || ' characters')::TEXT;
    END IF;
END;
$$;
```

---

## 🔒 Advanced Security Features

### Row Level Security Policies

```sql
-- Enable RLS on tables
ALTER TABLE knowledge_base ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_log ENABLE ROW LEVEL SECURITY;

-- Public read access to knowledge base
CREATE POLICY "Public read access to knowledge" 
ON knowledge_base FOR SELECT 
USING (true);

-- Authenticated users can add knowledge
CREATE POLICY "Authenticated users can add knowledge" 
ON knowledge_base FOR INSERT 
TO authenticated 
WITH CHECK (true);

-- Users can only update their own entries (based on source)
CREATE POLICY "Users can update own entries" 
ON knowledge_base FOR UPDATE 
TO authenticated 
USING (source = auth.jwt() ->> 'sub' OR auth.jwt() ->> 'role' = 'service_role')
WITH CHECK (source = auth.jwt() ->> 'sub' OR auth.jwt() ->> 'role' = 'service_role');

-- Service role has full access
CREATE POLICY "Service role full access to knowledge" 
ON knowledge_base FOR ALL 
TO service_role 
USING (true) 
WITH CHECK (true);

-- Event log policies
CREATE POLICY "Users can read own events" 
ON event_log FOR SELECT 
TO authenticated 
USING (user_id = auth.jwt() ->> 'sub' OR auth.jwt() ->> 'role' = 'service_role');

CREATE POLICY "System can insert events" 
ON event_log FOR INSERT 
USING (true);

-- Admin role for analytics
CREATE POLICY "Admin can read all events" 
ON event_log FOR SELECT 
TO authenticated 
USING (auth.jwt() ->> 'role' = 'admin');
```

### Content Access Control

```sql
-- Function to check content access permissions
CREATE OR REPLACE FUNCTION check_content_access(
    p_content_id UUID,
    p_user_id TEXT DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    content_source TEXT;
    user_role TEXT;
BEGIN
    -- Get the current user role
    user_role := auth.jwt() ->> 'role';
    
    -- Service role and admin have access to everything
    IF user_role IN ('service_role', 'admin') THEN
        RETURN TRUE;
    END IF;
    
    -- Get content source
    SELECT source INTO content_source
    FROM knowledge_base 
    WHERE id = p_content_id;
    
    -- Check if user owns the content or it's public
    RETURN (
        content_source IS NULL OR  -- Public content
        content_source = COALESCE(p_user_id, auth.jwt() ->> 'sub') OR  -- User owns it
        user_role = 'authenticated'  -- Any authenticated user for public content
    );
END;
$$;
```

---

## 🎛️ Advanced Triggers

### Content Validation Triggers

```sql
-- Comprehensive content validation
CREATE OR REPLACE FUNCTION validate_knowledge_content()
RETURNS TRIGGER AS $$
DECLARE
    content_length INT;
    embedding_dims INT;
BEGIN
    -- Validate content length
    content_length := LENGTH(TRIM(NEW.content));
    IF content_length < 5 THEN
        RAISE EXCEPTION 'Content must be at least 5 characters long, got %', content_length;
    END IF;
    
    IF content_length > 10000 THEN
        RAISE EXCEPTION 'Content too long (max 10000 characters), got %', content_length;
    END IF;
    
    -- Validate embedding dimensions
    IF NEW.embedding IS NOT NULL THEN
        SELECT array_length(NEW.embedding::float[], 1) INTO embedding_dims;
        IF embedding_dims != 384 THEN
            RAISE EXCEPTION 'Embedding must have 384 dimensions, got %', embedding_dims;
        END IF;
    END IF;
    
    -- Validate priority
    IF NEW.priority NOT BETWEEN 1 AND 5 THEN
        RAISE EXCEPTION 'Priority must be between 1 and 5, got %', NEW.priority;
    END IF;
    
    -- Validate metadata is valid JSON
    IF NEW.metadata IS NOT NULL THEN
        BEGIN
            PERFORM NEW.metadata::jsonb;
        EXCEPTION WHEN OTHERS THEN
            RAISE EXCEPTION 'Invalid metadata JSON format';
        END;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER validate_knowledge_content_trigger
    BEFORE INSERT OR UPDATE ON knowledge_base
    FOR EACH ROW
    EXECUTE FUNCTION validate_knowledge_content();
```

### Activity Logging Trigger

```sql
-- Enhanced activity logging
CREATE OR REPLACE FUNCTION log_knowledge_activity()
RETURNS TRIGGER AS $$
DECLARE
    current_user_id TEXT;
    session_id TEXT;
BEGIN
    -- Get current user context
    current_user_id := auth.jwt() ->> 'sub';
    session_id := auth.jwt() ->> 'session_id';
    
    IF TG_OP = 'INSERT' THEN
        INSERT INTO event_log (event_type, event_data, source, user_id, session_id)
        VALUES (
            'knowledge_created',
            jsonb_build_object(
                'id', NEW.id,
                'source', NEW.source,
                'priority', NEW.priority,
                'content_length', LENGTH(NEW.content),
                'has_embedding', NEW.embedding IS NOT NULL,
                'tag_count', array_length(NEW.tags, 1),
                'has_metadata', NEW.metadata != '{}'
            ),
            COALESCE(NEW.source, 'system'),
            current_user_id,
            session_id
        );
        
    ELSIF TG_OP = 'UPDATE' THEN
        INSERT INTO event_log (event_type, event_data, source, user_id, session_id)
        VALUES (
            'knowledge_updated',
            jsonb_build_object(
                'id', NEW.id,
                'changes', jsonb_build_object(
                    'priority_changed', OLD.priority != NEW.priority,
                    'content_changed', OLD.content != NEW.content,
                    'tags_changed', OLD.tags != NEW.tags,
                    'metadata_changed', OLD.metadata != NEW.metadata,
                    'embedding_changed', (OLD.embedding IS NULL) != (NEW.embedding IS NULL)
                ),
                'old_priority', OLD.priority,
                'new_priority', NEW.priority
            ),
            COALESCE(NEW.source, 'system'),
            current_user_id,
            session_id
        );
        
    ELSIF TG_OP = 'DELETE' THEN
        INSERT INTO event_log (event_type, event_data, source, user_id, session_id)
        VALUES (
            'knowledge_deleted',
            jsonb_build_object(
                'id', OLD.id,
                'source', OLD.source,
                'priority', OLD.priority,
                'content_length', LENGTH(OLD.content),
                'had_embedding', OLD.embedding IS NOT NULL
            ),
            COALESCE(OLD.source, 'system'),
            current_user_id,
            session_id
        );
    END IF;
    
    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- Enable the trigger (optional)
-- CREATE TRIGGER knowledge_activity_log_trigger
--     AFTER INSERT OR UPDATE OR DELETE ON knowledge_base
--     FOR EACH ROW
--     EXECUTE FUNCTION log_knowledge_activity();
```

---

## 📈 Performance Monitoring

### Query Performance Analysis

```sql
-- Analyze query performance patterns
CREATE OR REPLACE FUNCTION analyze_query_performance()
RETURNS TABLE (
    metric TEXT,
    avg_value NUMERIC,
    min_value NUMERIC,
    max_value NUMERIC,
    sample_count BIGINT
)
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        'search_execution_time_ms'::TEXT,
        ROUND(AVG((event_data->>'execution_time_ms')::NUMERIC), 2),
        MIN((event_data->>'execution_time_ms')::NUMERIC),
        MAX((event_data->>'execution_time_ms')::NUMERIC),
        COUNT(*)
    FROM event_log 
    WHERE event_type = 'search_performed'
    AND event_data->>'execution_time_ms' IS NOT NULL
    AND created_at > NOW() - INTERVAL '7 days'
    
    UNION ALL
    
    SELECT 
        'results_per_search'::TEXT,
        ROUND(AVG((event_data->>'results_count')::NUMERIC), 2),
        MIN((event_data->>'results_count')::NUMERIC),
        MAX((event_data->>'results_count')::NUMERIC),
        COUNT(*)
    FROM event_log 
    WHERE event_type = 'search_performed'
    AND created_at > NOW() - INTERVAL '7 days';
END;
$$;
```

---

## 🚀 Usage Examples

```sql
-- Example: Find content similar to a specific entry
SELECT * FROM find_similar('your-uuid-here', 0.8, 5);

-- Example: Get detailed analytics
SELECT * FROM get_detailed_knowledge_stats();

-- Example: Analyze content quality
SELECT * FROM analyze_content_quality();

-- Example: Clean up old events (dry run first)
SELECT * FROM cleanup_old_events(30, true);  -- Dry run
SELECT * FROM cleanup_old_events(30, false); -- Actual cleanup

-- Example: Get search analytics
SELECT * FROM get_search_analytics(7);

-- Example: Log a search event
SELECT log_search_event('example query', 5, 0.7, 150, 'user123', 'session456');

-- Example: Analyze query performance
SELECT * FROM analyze_query_performance();
```

---

## 📝 Notes

### When to Use These Features

- **Similarity Analysis**: For content recommendations and duplicate detection
- **Event Logging**: For user analytics, debugging, and system monitoring
- **Complex Statistics**: For dashboards and reporting
- **Cleanup Functions**: For regular maintenance and optimization
- **Security Features**: For multi-tenant applications

### Performance Considerations

- Event logging adds overhead to operations
- Complex analytics queries should be run during off-peak hours
- Consider partitioning event_log table for high-volume applications
- Monitor index usage and query performance regularly

### Maintenance Schedule

- **Daily**: Review search analytics
- **Weekly**: Run cleanup functions
- **Monthly**: Analyze content quality and performance metrics
- **Quarterly**: Review and optimize indexes

---

*Advanced features for power users and production deployments! 🚀*
