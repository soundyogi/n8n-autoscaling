# Squad-OpenAI Translator Integration Tests

This directory contains integration tests for the Squad-OpenAI Translator proxy service. All tests make real API calls to the Squad API without any mocking.

## Overview

The integration tests cover these key areas:

1. **Health Endpoint** (`health.test.ts`) - Tests the health check endpoint
2. **Models Endpoint** (`models.test.ts`) - Tests the OpenAI-compatible models listing
3. **Chat Completions** (`chat-completions.test.ts`) - Tests the chat completions endpoint
4. **Streaming** (`streaming.test.ts`) - Tests Server-Sent Events (SSE) streaming functionality

## Test Philosophy

- **tape only**: All tests use tape as the test framework
- **No mocks**: Real API calls to Squad API
- **No external test utilities**: Direct axios calls instead of supertest
- **Self-contained**: Each test file imports "../index.ts" to start the server

## Prerequisites

To run these tests, you need:

1. A valid Squad API key in `.env` file or environment variable `SQUAD_API_KEY`
2. Optional: `SQUAD_API_BASE_URL` (defaults to https://api.sqd.io)
3. Optional: `DEFAULT_AGENT_ID` (defaults to michael_taolor_x_agent)

## Running the Tests

```bash
# Run all tests
bun test

# Run individual test files
bun run tests/health.test.ts
bun run tests/models.test.ts
bun run tests/chat-completions.test.ts
bun run tests/streaming.test.ts

# Or use npm scripts
bun test:health    # Health endpoint only
bun test:models    # Models endpoint only
bun test:chat      # Chat completions only
```

## Test Structure

Each test file follows this pattern:
```typescript
import test from 'tape';
import axios from 'axios';
import "../index.ts"; // Start the server

const BASE_URL = 'http://localhost:3001';

test('Test description', async (t) => {
  try {
    const response = await axios.get/post(...);
    t.equal(...);
    t.ok(...);
  } catch (error) {
    t.error(error, 'No error should be thrown');
  } finally {
    t.end();
    process.exit(0); // Exit after test(s)
  }
});
```

## Test Coverage

### Health Tests
- ✓ Returns 200 OK status
- ✓ Returns { status: 'ok' } body

### Models Tests
- ✓ Returns available Squad agents as OpenAI models
- ✓ Includes default agent in response
- ✓ Proper model format with squad/ prefix

### Chat Completions Tests
- ✓ Basic chat message handling
- ✓ Proper response format
- ✓ Content validation

### Streaming Tests
- ✓ SSE format validation
- ✓ Initial role chunk
- ✓ Content chunks delivery
- ✓ [DONE] event termination
- ✓ Non-streaming comparison
- ✓ Title generation special case
- ✓ Error handling in streams
- ✓ Concurrent streaming requests

## Manual Testing

For additional manual testing procedures, see [STREAMING_TEST_GUIDE.md](./STREAMING_TEST_GUIDE.md).

## Notes

- Tests will fail if no `SQUAD_API_KEY` is provided
- Each test file runs independently and starts its own server instance
- Streaming tests include a helper function to consume SSE streams properly
- Tests use real Squad API calls, so response times depend on API performance