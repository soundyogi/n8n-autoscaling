/**
 * Test n8n compatibility functions
 * Validates that our new functions work with n8n agent node expectations
 */

import { supabase } from '../src/supabase.js';
import { huggingface } from '../src/huggingface.js';

interface N8nResult {
  id: number;
  content: string;
  metadata: Record<string, any>;
  similarity: number;
}

async function testN8nCompatibility() {
  console.log('🧪 Testing n8n Compatibility Functions...');
  
  try {
    // 1. Generate a test embedding
    console.log('1. Generating test embedding...');
    const testQuery = "test query for n8n compatibility";
    const embedding = await huggingface.generateEmbedding(testQuery);
    console.log(`✅ Generated embedding with ${embedding.length} dimensions`);
    
    // 2. Test match_documents function (n8n expected signature)
    console.log('2. Testing match_documents function...');
    const { data: matchResults, error: matchError } = await supabase.service
      .rpc('match_documents', {
        query_embedding: embedding,
        match_count: 3,
        filter: {}
      });
      
    if (matchError) {
      console.error('❌ match_documents error:', matchError);
      return false;
    }
    
    console.log(`✅ match_documents returned ${matchResults?.length || 0} results`);
    if (matchResults && matchResults.length > 0) {
      console.log('   Sample result:', {
        id: matchResults[0].id,
        content: matchResults[0].content.substring(0, 50) + '...',
        similarity: matchResults[0].similarity,
        metadata_keys: Object.keys(matchResults[0].metadata)
      });
    }
    
    // 3. Test with metadata filtering
    console.log('3. Testing metadata filtering...');
    const { data: filterResults, error: filterError } = await supabase.service
      .rpc('match_documents', {
        query_embedding: embedding,
        match_count: 3,
        filter: { priority: 5 }
      });
      
    if (filterError) {
      console.error('❌ Metadata filtering error:', filterError);
      return false;
    }
    
    console.log(`✅ Filtered search returned ${filterResults?.length || 0} results`);
    
    // 4. Test simple_search function
    console.log('4. Testing simple_search function...');
    const { data: simpleResults, error: simpleError } = await supabase.service
      .rpc('simple_search', {
        query_embedding: embedding,
        match_count: 2
      });
      
    if (simpleError) {
      console.error('❌ simple_search error:', simpleError);
      return false;
    }
    
    console.log(`✅ simple_search returned ${simpleResults?.length || 0} results`);
    
    // 5. Validate result structure matches n8n expectations
    console.log('5. Validating result structure...');
    if (matchResults && matchResults.length > 0) {
      const result = matchResults[0] as N8nResult;
      const hasRequiredFields = 
        typeof result.id === 'number' &&
        typeof result.content === 'string' &&
        typeof result.metadata === 'object' &&
        typeof result.similarity === 'number';
        
      if (hasRequiredFields) {
        console.log('✅ Result structure matches n8n expectations');
        console.log('   - id: number ✓');
        console.log('   - content: string ✓');
        console.log('   - metadata: object ✓');
        console.log('   - similarity: number ✓');
      } else {
        console.log('❌ Result structure does not match expectations');
        console.log('   Result structure:', typeof result);
        return false;
      }
    }
    
    console.log('\n🎉 All n8n compatibility tests passed!');
    console.log('\n📋 Integration Instructions:');
    console.log('   1. Run SQL script: sql/9_n8n_compatibility.sql');
    console.log('   2. Use function name: "match_documents"');
    console.log('   3. Parameters:');
    console.log('      - query_embedding: vector(384)');
    console.log('      - match_count: int (optional)');
    console.log('      - filter: jsonb (optional)');
    console.log('   4. Returns: id, content, metadata, similarity');
    
    return true;
    
  } catch (error) {
    console.error('❌ Test failed:', error);
    return false;
  }
}

// Run the test
if (import.meta.main) {
  testN8nCompatibility().then(success => {
    console.log(success ? '\n✅ SUCCESS' : '\n❌ FAILED');
    process.exit(success ? 0 : 1);
  });
}

export { testN8nCompatibility };
