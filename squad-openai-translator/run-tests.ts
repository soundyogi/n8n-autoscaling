#!/usr/bin/env bun
/**
 * Main test runner for squad-openai-translator integration tests
 */

import test from 'tape';

// Import test files
import './tests/health.test.ts';
import './tests/models.test.ts';
import './tests/chat-completions.test.ts';
import './tests/streaming.test.ts';

// This file simply imports all test files, and tape will run them
console.log('Running squad-openai-translator integration tests...');

// Add a final test to check if tests completed
test('All tests completed', (t) => {
  console.log('All tests have finished execution.');
  t.pass('All tests have completed execution');
  t.end();
});