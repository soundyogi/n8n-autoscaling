+# Squad OpenAI Translator

A proxy server that translates between the Squad AI API and the OpenAI API format. This allows you to use Squad AI agents with applications that support the OpenAI API format, such as LibreChat.

## Overview

This server provides OpenAI-compatible endpoints that communicate with the Squad API behind the scenes:

- `/v1/chat/completions` - For chat completions (compatible with OpenAI's chat completions endpoint)
- `/v1/models` - For listing available models
- `/health` - Health check endpoint

## Installation

### Prerequisites

- [Bun](https://bun.sh) or Node.js

  curl -fsSL https://bun.sh/install | bash

- A Squad API key

### Setup

1. Clone the repository
2. Install dependencies:

```bash
bun install
# or if using npm
npm install
```

3. Create a `.env` file based on the provided `.env.example`:

```bash
cp .env.example .env
```

4. Edit the `.env` file to add your Squad API key and customize settings:

```
SQUAD_API_KEY=your_squad_api_key_here
SQUAD_API_BASE_URL=https://api.sqd.io
DEFAULT_AGENT_ID=michael_taolor_x_agent
PORT=3001
```

## Running the Server

### Production Mode
Start the server with:

```bash
bun run start
# or for development with auto-reload
bun run dev
```

### Background Mode (for development/testing)

⚠️ **IMPORTANT**: Always stop existing servers before starting new ones to avoid conflicts.

**Safe Background Server Management:**

```bash
# 1. FIRST: Stop any existing background server
pkill -f "bun.*index.ts" 2>/dev/null || true

# 2. Wait a moment for cleanup
sleep 2

# 3. Start server in background with logging
nohup bun run dev > server.log 2>&1 & echo "Server started with PID: $!"

# 4. Wait for server startup (important!)
sleep 3

# 5. Verify server is healthy
curl -s http://localhost:3001/health

# 6. Monitor logs in real-time
tail -f server.log
```

**Server Management Commands:**
```bash
# Check if server is running
ps aux | grep bun
curl -s http://localhost:3001/health

# Stop background server (always do this first!)
pkill -f "bun.*index.ts"

# View recent logs
tail -20 server.log
```

**Common Issues & Solutions:**
- **Server won't start**: Run `pkill -f "bun.*index.ts"` first to clear any hanging processes
- **Tests fail**: Ensure server is running and healthy with `curl http://localhost:3001/health`
- **Background hang**: Never chain background commands with `&&` - use separate commands

The server will start on the port specified in your `.env` file (default: 3001).

### Development Scripts
- `bun run start` - Production mode
- `bun run dev` - Development mode with auto-reload (--watch)
- `bun test` - Run all tests
- `bun run test:health` - Run health endpoint tests
- `bun run test:models` - Run models endpoint tests  
- `bun run test:chat` - Run chat completions tests
- `bun run test:streaming` - Run streaming tests

## Using with LibreChat

To use this proxy with LibreChat, add it as a custom endpoint in your LibreChat configuration:

1. Make sure the Squad OpenAI Translator server is running
2. In LibreChat, go to Settings > Endpoints > Add Custom Endpoint
3. Configure with the following settings:
   - **Name**: Squad AI
   - **API Endpoint**: http://localhost:3001 (adjust if running on a different host/port)
   - **Models**: squad/michael_taolor_x_agent (you can add other agent IDs in the format `squad/{agent_id}`)

## API Usage

### Chat Completions

Send requests to the `/v1/chat/completions` endpoint following the OpenAI API format:

```bash
curl http://localhost:3001/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "squad/michael_taolor_x_agent",
    "messages": [
      {"role": "system", "content": "You are a helpful assistant."},
      {"role": "user", "content": "Tell me about Bittensor."}
    ],
    "stream": false
  }'
```

Note: To use a specific Squad agent, include it in the model parameter as `squad/{agent_id}`.

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `SQUAD_API_KEY` | Your Squad API key | (required) |
| `SQUAD_API_BASE_URL` | Squad API base URL | https://api.sqd.io |
| `DEFAULT_AGENT_ID` | Default Squad agent ID | michael_taolor_x_agent |
| `PORT` | Port to run the server on | 3001 |

## License

[MIT](LICENSE)
