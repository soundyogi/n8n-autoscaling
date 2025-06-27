#!/usr/bin/env bun
/**
 * Clean up test data from the database
 */

import { supabase } from '../src/supabase.js';

async function cleanupDatabase() {
    console.log('🧹 Cleaning up test data...');
    
    try {
        // Delete all entries from knowledge_base table
        const { error } = await supabase.service
            .from('knowledge_base')
            .delete()
            .neq('id', '00000000-0000-0000-0000-000000000000'); // Delete all (using impossible ID)

        if (error) {
            console.error('❌ Cleanup failed:', error);
            return false;
        }

        // Verify cleanup
        const { data: remaining, error: countError } = await supabase.public
            .from('knowledge_base')
            .select('id');

        if (countError) {
            console.error('❌ Count check failed:', countError);
            return false;
        }

        console.log(`✅ Cleanup complete. Remaining entries: ${remaining?.length || 0}`);
        return true;
    } catch (error) {
        console.error('❌ Cleanup error:', error);
        return false;
    }
}

if (import.meta.main) {
    cleanupDatabase().then(success => {
        process.exit(success ? 0 : 1);
    });
}

export { cleanupDatabase };
