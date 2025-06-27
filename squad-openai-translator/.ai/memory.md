# Squad OpenAI Translator - AI Memory

## Project Overview
**Purpose**: Proxy server translating Squad AI API to OpenAI-compatible format for LibreChat integration  
**Tech Stack**: Bun/TypeScript, Express, Axios  
**Status**: Production ready ✅

## Key Endpoints
- `POST /v1/chat/completions` - Main endpoint with streaming/non-streaming support
- `GET /v1/models` - Lists Squad agents as OpenAI models  
- `GET /health` - Health check with environment info

## Configuration
- **Required**: `SQUAD_API_KEY`
- **Optional**: `SQUAD_API_BASE_URL` (default: https://api.sqd.io), `DEFAULT_AGENT_ID` (michael_taolor_x_agent), `PORT` (3001)

## Development Commands
```bash
# Server management (ALWAYS stop existing first!)
pkill -f "bun.*index.ts" 2>/dev/null || true
nohup bun run dev > server.log 2>&1 &
curl -s http://localhost:3001/health

# Testing (23/23 tests passing)
bun test                              # All tests
bun run tests/streaming.test.ts       # Streaming (needs 10min timeout)
tail -f server.log                    # Monitor logs
```

## Implementation Files
- **`index.ts`** - Main production server (use this one)
- **`index-modern.ts`** - Experimental Responses API version
- **`src/streaming.ts`** - Streaming implementation with proper cleanup
- **`tests/`** - Complete test suite with rate limiting protection

## Key Features
- **Streaming**: Real-time SSE with adaptive polling and cleanup
- **Error Handling**: Request correlation IDs, comprehensive recovery
- **Final Answer Extraction**: Handles all response types (strings, arrays, objects)
- **Rate Limiting**: Built-in protection with 5-second test delays

## Recent Major Fixes (2025-06-27)
- ✅ Fixed array response bug (`[1,2,3]` extraction working)
- ✅ Enhanced streaming implementation and SSE compatibility  
- ✅ Achieved 23/23 passing tests with full coverage
- ✅ Updated README with safe background server management

## Quick Start for Agents
1. Check server health: `curl http://localhost:3001/health`
2. Run tests: `bun test` (all should pass)
3. Check logs: `tail -f server.log`
4. Main files to check: `index.ts`, `src/streaming.ts`, `tests/streaming.test.ts`

---
*Production ready proxy for Squad AI → OpenAI API translation*