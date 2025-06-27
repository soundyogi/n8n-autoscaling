#!/usr/bin/env bun
/**
 * INSPECT TEST RECORDS
 * 
 * Quick script to inspect the test records that were just created
 * to verify metadata and other fields are properly stored.
 */

import 'dotenv/config';
import { supabase } from '../src/supabase.js';

async function inspectTestRecords() {
  console.log('🔍 INSPECTING CONSOLIDATED TEST RECORDS');
  console.log('=====================================\n');

  try {
    // Get all records from consolidated test
    const { data: records, error } = await supabase.service
      .from('knowledge_base')
      .select('*')
      .eq('source', 'consolidated-test')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('❌ Error fetching records:', error.message);
      return;
    }

    if (!records || records.length === 0) {
      console.log('📭 No consolidated test records found');
      return;
    }

    console.log(`📊 Found ${records.length} test records:\n`);

    records.forEach((record, index) => {
      console.log(`${index + 1}. Record ID: ${record.id}`);
      console.log(`   Content: "${record.content.substring(0, 60)}..."`);
      console.log(`   Source: ${record.source}`);
      console.log(`   Priority: ${record.priority}`);
      console.log(`   Tags: [${record.tags?.join(', ') || 'none'}]`);
      console.log(`   Metadata: ${JSON.stringify(record.metadata, null, 2)}`);
      console.log(`   Embedding type: ${typeof record.embedding}`);
      console.log(`   Embedding length: ${record.embedding ? JSON.parse(record.embedding).length : 'N/A'}`);
      console.log(`   Created: ${record.created_at}`);
      console.log('');
    });

    // Test a quick search to verify functionality
    console.log('🎯 TESTING SEARCH ON THESE RECORDS\n');
    
    const searchResults = await supabase.searchKnowledgeByText("machine learning technology", {
      threshold: 0.3,
      source_filter: 'consolidated-test'
    });

    console.log(`🔍 Search results for "machine learning technology":`);
    searchResults.forEach((result, index) => {
      console.log(`   ${index + 1}. Similarity: ${result.similarity.toFixed(3)}`);
      console.log(`      Content: "${result.content.substring(0, 50)}..."`);
      console.log(`      Metadata: ${JSON.stringify(result.metadata)}`);
    });

  } catch (error) {
    console.error('❌ Inspection failed:', error);
  }
}

// Run the inspection
inspectTestRecords().then(() => {
  console.log('\n✅ Inspection complete!');
});
