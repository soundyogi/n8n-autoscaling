# Tiered Signal Distribution System

A comprehensive system for distributing trading signals with wallet-based authentication and tier-based access control.

## System Overview

This system provides tiered access to trading signals based on wallet token holdings:

- **Tier 1 (Premium)**: ≥10,000 tokens - Instant signal delivery
- **Tier 2 (Priority)**: ≥1,000 tokens - 5 minute delay
- **Tier 3 (Standard)**: ≥100 tokens - 15 minute delay
- **Tier 4 (Public)**: <100 tokens - 30 minute delay + Twitter broadcast

## Architecture

```
Signal Generator → Supabase (Database + Edge Functions) ← Terminal Frontend
                        ↓
                   n8n Workflows
                        ↓
                   Twitter API
```

## Components

### 1. Supabase Backend
- **Database**: PostgreSQL with RLS policies
- **Edge Functions**: Wallet verification, signal distribution, chat agent
- **Real-time**: WebSocket subscriptions for live updates

### 2. n8n Workflows
- **Signal Ingestion**: Process incoming signals, set tier release times
- **Chat Processing**: AI-powered chat with priority queuing
- **Holdings Update**: Periodic wallet balance checks

### 3. Terminal Frontend
- **React App**: Terminal-style interface
- **Wallet Integration**: RainbowKit for wallet connections
- **Real-time Updates**: Supabase subscriptions

## Quick Start

### 1. Supabase Setup

1. Create a new Supabase project
2. Run the database schema:
   ```sql
   -- Execute terminal/supabase-schema.sql
   ```
3. Deploy Edge Functions:
   ```bash
   cd terminal/supabase/functions
   supabase functions deploy verify-wallet
   supabase functions deploy get-signals
   supabase functions deploy chat-agent
   ```
4. Set environment variables:
   ```
   HOLDINGS_API_URL=your-holdings-endpoint
   HOLDINGS_API_KEY=your-api-key
   N8N_CHAT_WEBHOOK_URL=your-n8n-webhook
   ```

### 2. n8n Configuration

1. Import workflows from `terminal/n8n-workflows/`
2. Configure credentials:
   - Supabase API credentials
   - Twitter API credentials
   - OpenAI API credentials
3. Set webhook URLs in Supabase Edge Functions
4. Activate workflows

### 3. Frontend Deployment

1. Install dependencies:
   ```bash
   cd terminal/frontend
   npm install
   ```
2. Configure environment:
   ```bash
   cp .env.example .env
   # Edit .env with your Supabase credentials
   ```
3. Build and deploy:
   ```bash
   npm run build
   # Deploy to Vercel, Netlify, or your preferred platform
   ```

## Configuration

### Environment Variables

#### Supabase Edge Functions
```
SUPABASE_URL=your-supabase-url
SUPABASE_SERVICE_ROLE_KEY=your-service-key
HOLDINGS_API_URL=your-holdings-endpoint
HOLDINGS_API_KEY=your-api-key
N8N_CHAT_WEBHOOK_URL=your-n8n-webhook
```

#### Frontend
```
REACT_APP_SUPABASE_URL=your-supabase-url
REACT_APP_SUPABASE_ANON_KEY=your-anon-key
REACT_APP_WALLETCONNECT_PROJECT_ID=your-walletconnect-id
```

#### n8n
```
SUPABASE_API_URL=your-supabase-url
SUPABASE_SERVICE_KEY=your-service-key
TWITTER_API_KEY=your-twitter-key
OPENAI_API_KEY=your-openai-key
```

### Wallet Holdings Configuration

Update `terminal/wallet-holdings.json` with actual wallet addresses and holdings, or replace with your API endpoint.

## Usage

### Terminal Commands

- `help` - Show available commands
- `signals` - List recent signals
- `signals refresh` - Refresh from server
- `chat <message>` - Send message to AI agent
- `status` - Show account status
- `tier` - Show tier information
- `wallet` - Show wallet details
- `clear` - Clear terminal

### API Endpoints

#### Verify Wallet
```
POST /functions/v1/verify-wallet
{
  "walletAddress": "0x...",
  "signature": "0x...",
  "message": "Authenticate with Signal Terminal: 1234567890"
}
```

#### Get Signals
```
GET /functions/v1/get-signals
Authorization: Bearer <token>
```

#### Chat Agent
```
POST /functions/v1/chat-agent
Authorization: Bearer <token>
{
  "message": "What's the market outlook?"
}
```

## Security Features

- **Wallet Signature Verification**: EIP-712 compatible
- **Session Management**: JWT tokens with expiration
- **Row Level Security**: Database-level access control
- **Rate Limiting**: Per-tier request limits
- **Real-time Auth**: Authenticated WebSocket channels

## Monitoring

The system includes comprehensive logging and can be monitored through:
- Supabase Dashboard (database metrics, function logs)
- n8n Execution logs
- Frontend error tracking (integrate Sentry)

## Scaling Considerations

- **Database**: Supabase handles scaling automatically
- **Edge Functions**: Auto-scale based on demand
- **n8n**: Can be scaled horizontally with queue mode
- **Frontend**: Static deployment scales infinitely

## Troubleshooting

### Common Issues

1. **Authentication Fails**
   - Check wallet signature format
   - Verify message timestamp (5-minute window)
   - Confirm Supabase credentials

2. **Signals Not Appearing**
   - Check tier release times in database
   - Verify RLS policies
   - Confirm user tier calculation

3. **Chat Agent Timeout**
   - Check n8n webhook configuration
   - Verify OpenAI API limits
   - Monitor processing queue

### Debug Commands

```bash
# Check Supabase functions
supabase functions logs

# Monitor n8n workflows
# Access n8n dashboard execution logs

# Frontend debugging
# Check browser console for errors
```

## Development

### Local Development

1. **Supabase Local Development**:
   ```bash
   supabase start
   supabase db reset
   ```

2. **Frontend Development**:
   ```bash
   cd terminal/frontend
   npm run dev
   ```

3. **n8n Local Instance**:
   ```bash
   docker run -p 5678:5678 n8nio/n8n
   ```

### Testing

- Unit tests for Edge Functions
- Integration tests for workflows
- E2E tests for frontend flows

## Contributing

1. Fork the repository
2. Create feature branch
3. Implement changes with tests
4. Submit pull request

## License

MIT License - see LICENSE file for details.