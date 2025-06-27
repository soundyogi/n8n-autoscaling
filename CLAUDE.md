# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

**IMPORTANT**: Also read and follow the instructions in `copilot-instructions.md` which contains critical development guidelines and overrides that must be followed.

## Project Overview

This repository contains a **dual-purpose system**:

1. **Primary System**: n8n autoscaling solution for workflow automation
2. **Secondary System**: Tiered trading signals platform (located in `/terminal/`)

The main focus is the n8n autoscaling system that dynamically scales Docker containers based on Redis queue length without requiring Kubernetes or external orchestration.

## Core Architecture

### n8n Autoscaling System
- **Main Component**: Python autoscaler (`autoscaler/autoscaler.py`) that monitors Redis queues
- **Queue System**: Redis-based BullMQ for job distribution
- **Scaling Logic**: Docker Compose service scaling (1-5 worker replicas)
- **Services**: n8n main, n8n workers, Redis, PostgreSQL, Traefik, Cloudflared
- **Browser Support**: Built-in Chromium + Puppeteer for web scraping

### Trading Terminal System (`/terminal/`)
- **Frontend**: React TypeScript terminal interface
- **Backend**: Supabase (PostgreSQL + Edge Functions)
- **Authentication**: Wallet-based with tier system
- **AI Chat**: n8n workflow-powered responses

## Essential Commands

### Docker Operations
```bash
# Initial setup
docker network create shark
docker compose up -d

# Monitor services
docker compose logs [service-name]
docker compose logs n8n-autoscaler
docker compose logs redis-monitor

# Check scaling status
docker compose ps
docker compose exec redis redis-cli LLEN bull:jobs:wait
```

### Frontend Development (Terminal System)
```bash
cd terminal/frontend
npm install
npm run dev        # Development server
npm run build      # Production build
npm run lint       # ESLint check
```

### Database Operations
```bash
# Connect to PostgreSQL
docker compose exec postgres psql -U postgres -d n8n

# Connect to Redis
docker compose exec redis redis-cli
```

## Configuration Files

### Primary Configuration
- **`.env`**: All environment variables (copy from `.env.example`)
- **`docker-compose.yml`**: Multi-service orchestration with autoscaling
- **`autoscaler/autoscaler.py`**: Core scaling logic and thresholds

### Key Environment Variables
- `MIN_REPLICAS=1` / `MAX_REPLICAS=5`: Scaling bounds
- `SCALE_UP_QUEUE_THRESHOLD=5` / `SCALE_DOWN_QUEUE_THRESHOLD=2`: Queue thresholds
- `POLLING_INTERVAL_SECONDS=30`: Monitoring frequency
- `COOLDOWN_PERIOD_SECONDS=180`: Time between scaling actions
- `CLOUDFLARE_TUNNEL_TOKEN`: Secure tunnel access

### n8n Configuration
- `EXECUTIONS_MODE=queue`: Enable queue-based processing
- `QUEUE_BULL_REDIS_HOST=redis`: Redis connection
- `N8N_CONCURRENCY_PRODUCTION_LIMIT=10`: Tasks per worker
- `NODE_FUNCTION_ALLOW_EXTERNAL=ajv,ajv-formats,puppeteer`: External dependencies

## Autoscaling Behavior

The system monitors Redis queue length and scales based on:
1. **Scale Up**: When queue > `SCALE_UP_QUEUE_THRESHOLD` and replicas < `MAX_REPLICAS`
2. **Scale Down**: When queue < `SCALE_DOWN_QUEUE_THRESHOLD` and replicas > `MIN_REPLICAS`
3. **Cooldown**: Waits `COOLDOWN_PERIOD_SECONDS` between scaling actions
4. **Graceful Shutdown**: 5-minute grace period for worker termination

## Development Workflows

### Working with the Autoscaler
- Monitor logs: `docker compose logs -f n8n-autoscaler`
- Test scaling manually: Modify queue thresholds in `.env`
- Debug Redis: `docker compose exec redis redis-cli monitor`

### Working with n8n
- Access UI: `http://localhost:5678` (or configured domain)
- Webhook endpoint: `http://webhook.yourdomain.com/webhook/[id]`
- Workers share the same data volume as main instance

### Working with Terminal System
- Located in `/terminal/` directory
- Separate React app with own `package.json`
- Uses Supabase for backend services
- Requires wallet connection for authentication

## Security & Network Configuration

### Cloudflare Integration
- Uses `cloudflared` service for secure tunnels
- Configure subdomains for n8n UI and webhooks
- Token required in `CLOUDFLARE_TUNNEL_TOKEN`

### Network Architecture
- **Internal Network**: `n8n-network` for service communication
- **External Network**: `shark` for connecting additional containers
- **Traefik**: Load balancer on ports 8082 (UI) and 8083 (webhooks)

### Database Security
- PostgreSQL with SCRAM-SHA-256 authentication
- Bound to Tailscale IP if configured
- Separate volumes for data persistence

## Monitoring & Troubleshooting

### Health Checks
- All services have Docker health checks
- Redis: `redis-cli ping`
- PostgreSQL: `pg_isready -U postgres`
- n8n: Node.js version check

### Common Issues
- **Scaling not working**: Check Docker socket permissions and `COMPOSE_PROJECT_NAME`
- **Queue monitoring**: Verify Redis connection and queue name format
- **Webhook failures**: Confirm Cloudflare tunnel and subdomain configuration
- **Worker startup**: Check graceful shutdown timeouts and concurrency limits

### Log Locations
- Autoscaler: `docker compose logs n8n-autoscaler`
- Queue monitor: `docker compose logs redis-monitor`
- Workers: `docker compose logs n8n-worker`

## Testing & Validation

### Load Testing
- System tested with hundreds of simultaneous executions
- Recommended: 8-core, 16GB RAM VPS minimum
- Monitor queue length and scaling responsiveness

### Queue Testing
```bash
# Check queue length
docker compose exec redis redis-cli LLEN bull:jobs:wait

# Monitor queue in real-time
docker compose exec redis redis-cli monitor | grep jobs
```

## External Dependencies

### Required Services
- Docker and Docker Compose
- Cloudflare account for tunnels
- Domain/subdomain configuration

### Optional Integrations
- Tailscale for secure database access
- External monitoring solutions
- Additional containers via `shark` network

This system is production-ready and handles automatic scaling without manual intervention. The autoscaler respects configured limits and cooldown periods to prevent thrashing while maintaining responsiveness to workload changes.

## Squad OpenAI Translator (`/squad-openai-translator/`)

### Overview
A proxy server that translates between Squad AI API and OpenAI API format, enabling Squad AI agents to work with OpenAI-compatible applications like LibreChat.

### Key Features
- **OpenAI-Compatible Endpoints**: `/v1/chat/completions`, `/v1/models`, `/health`
- **Real-Time Streaming**: Proper SSE (Server-Sent Events) streaming implementation
  - Uses Squad API's `/invocations/{id}/stream` endpoint for real-time updates
  - Shows step-by-step execution as it happens
  - Filters out system messages while preserving execution details
  - Displays model info (DeepSeek-V3), code execution, and results
- **Environment Configuration**: Uses `.env` for API keys and settings
- **Built with**: TypeScript, Express, Axios, Bun/Node.js

### Streaming Implementation Details
The streaming works by:
1. Creating an invocation with Squad API
2. Connecting to the SSE stream endpoint (`/invocations/{id}/stream`)
3. Processing real-time log entries with proper offset tracking
4. Filtering out noise (system messages, file operations, warnings)
5. Forwarding meaningful content as OpenAI-compatible chunks

### Current Filtering Rules
**Filtered out:**
- "Queued agent call" (system messages)
- "Caution:" warnings about imports
- "Attempting to upload" file operations
- "__INVOCATION_FINISHED__" internal markers

**Preserved:**
- Model information and execution steps
- Code being executed
- Final answers and results
- Performance metrics (duration, tokens)

### Testing
- Run server: `nohup bun run dev > server.log 2>&1 & echo "Server started with PID: $!"`
- Run tests: `bun test` or specific tests like `bun run test:streaming`
- Monitor logs: `tail -f server.log`
- Available agents: `michael_taolor_x_agent`, `vibemoodai`

### Known Issues & Next Steps
- Streaming may still receive all data at once rather than incremental updates
- Squad API SSE implementation may not provide true real-time streaming
- Need to verify proper SSE offset handling for incremental content
- Consider implementing progressive chunking for better UX