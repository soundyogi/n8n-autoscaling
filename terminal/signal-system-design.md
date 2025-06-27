# Tiered Signal Distribution System Design

## System Architecture Overview

```
┌─────────────────┐     ┌──────────────┐     ┌─────────────────┐
│Signal Generator │────▶│   Supabase   │────▶│  Terminal App   │
│  (3rd Party)    │     │   Backend    │     │   (Frontend)    │
└─────────────────┘     └──────────────┘     └─────────────────┘
                               │
                               ▼
                        ┌──────────────┐
                        │     n8n      │
                        │  Workflows   │
                        └──────────────┘
```

## Tier System

### Token Holdings Tiers
- **Tier 1 (Premium)**: ≥ 10,000 tokens - Instant signal delivery
- **Tier 2 (Priority)**: ≥ 1,000 tokens - 5 minute delay
- **Tier 3 (Standard)**: ≥ 100 tokens - 15 minute delay  
- **Tier 4 (Public)**: < 100 tokens - 30 minute delay + Twitter broadcast

## Database Schema (Supabase)

### Tables

#### users
```sql
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_address TEXT UNIQUE NOT NULL,
  tier INTEGER NOT NULL DEFAULT 4,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  last_seen TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

#### signals
```sql
CREATE TABLE signals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  content JSONB NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  tier1_release_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  tier2_release_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() + INTERVAL '5 minutes',
  tier3_release_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() + INTERVAL '15 minutes',
  tier4_release_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() + INTERVAL '30 minutes',
  is_public BOOLEAN DEFAULT FALSE
);
```

#### user_sessions
```sql
CREATE TABLE user_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  token TEXT UNIQUE NOT NULL,
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

#### chat_messages
```sql
CREATE TABLE chat_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  message TEXT NOT NULL,
  response TEXT,
  priority INTEGER NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  responded_at TIMESTAMP WITH TIME ZONE
);
```

## Supabase Edge Functions

### 1. verify-wallet
```typescript
// Verifies wallet signature and creates/updates user session
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

serve(async (req) => {
  const { walletAddress, signature, message } = await req.json()
  
  // Verify signature
  const isValid = await verifySignature(walletAddress, signature, message)
  if (!isValid) return new Response('Invalid signature', { status: 401 })
  
  // Check holdings and determine tier
  const holdings = await getWalletHoldings(walletAddress)
  const tier = calculateTier(holdings)
  
  // Create/update user and session
  const supabase = createClient(Deno.env.get('SUPABASE_URL'), Deno.env.get('SUPABASE_ANON_KEY'))
  
  const { data: user } = await supabase
    .from('users')
    .upsert({ wallet_address: walletAddress, tier })
    .select()
    .single()
  
  // Create session token
  const sessionToken = crypto.randomUUID()
  await supabase.from('user_sessions').insert({
    user_id: user.id,
    token: sessionToken,
    expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000) // 24 hours
  })
  
  return new Response(JSON.stringify({ token: sessionToken, tier }), {
    headers: { 'Content-Type': 'application/json' }
  })
})
```

### 2. get-signals
```typescript
// Returns signals based on user tier and timing
serve(async (req) => {
  const authHeader = req.headers.get('Authorization')
  const session = await validateSession(authHeader)
  
  if (!session) return new Response('Unauthorized', { status: 401 })
  
  const supabase = createClient(Deno.env.get('SUPABASE_URL'), Deno.env.get('SUPABASE_ANON_KEY'))
  
  // Get signals available for user's tier
  const now = new Date()
  const tierField = `tier${session.tier}_release_at`
  
  const { data: signals } = await supabase
    .from('signals')
    .select('*')
    .lte(tierField, now.toISOString())
    .order('created_at', { ascending: false })
    .limit(50)
  
  return new Response(JSON.stringify(signals), {
    headers: { 'Content-Type': 'application/json' }
  })
})
```

### 3. chat-agent
```typescript
// Handles chat messages with priority queue
serve(async (req) => {
  const authHeader = req.headers.get('Authorization')
  const session = await validateSession(authHeader)
  const { message } = await req.json()
  
  const supabase = createClient(Deno.env.get('SUPABASE_URL'), Deno.env.get('SUPABASE_ANON_KEY'))
  
  // Insert message with priority based on tier
  const priority = 5 - session.tier // Higher tier = higher priority
  
  const { data: chatMessage } = await supabase
    .from('chat_messages')
    .insert({
      user_id: session.user_id,
      message,
      priority
    })
    .select()
    .single()
  
  // Queue for processing (implement with n8n webhook)
  await fetch(Deno.env.get('N8N_WEBHOOK_URL'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messageId: chatMessage.id, priority })
  })
  
  return new Response(JSON.stringify({ messageId: chatMessage.id }), {
    headers: { 'Content-Type': 'application/json' }
  })
})
```

## n8n Workflows

### 1. Signal Ingestion Workflow
- **Webhook Node**: Receives signals from 3rd party generator
- **Supabase Node**: Insert signal with calculated release times
- **Delay Node**: Wait until Tier 4 release time
- **Twitter Node**: Post signal to Twitter
- **Supabase Node**: Mark signal as public

### 2. Chat Processing Workflow
- **Webhook Node**: Receives chat requests from Edge Function
- **Queue Node**: Priority queue based on tier
- **AI Agent Node**: Process chat message
- **Supabase Node**: Update chat_messages with response
- **WebSocket Node**: Send response to user

### 3. Holdings Update Workflow
- **Cron Node**: Run every 5 minutes
- **HTTP Request Node**: Fetch wallet holdings from JSON endpoint
- **Code Node**: Calculate tier changes
- **Supabase Node**: Update user tiers
- **WebSocket Node**: Notify affected users

## Terminal Frontend Architecture

### Tech Stack
- **Framework**: React with Terminal UI library (react-terminal-ui)
- **Wallet Connection**: Web3Modal or RainbowKit
- **Real-time**: Supabase Realtime subscriptions
- **State Management**: Zustand or Redux Toolkit

### Key Components

```typescript
// WalletAuth.tsx
const WalletAuth = () => {
  const { connect, sign } = useWallet()
  
  const authenticate = async () => {
    const address = await connect()
    const message = `Authenticate with Signal System: ${Date.now()}`
    const signature = await sign(message)
    
    const response = await fetch('/api/verify-wallet', {
      method: 'POST',
      body: JSON.stringify({ walletAddress: address, signature, message })
    })
    
    const { token, tier } = await response.json()
    localStorage.setItem('authToken', token)
    setUserTier(tier)
  }
}

// SignalTerminal.tsx
const SignalTerminal = () => {
  const [signals, setSignals] = useState([])
  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
  
  useEffect(() => {
    // Subscribe to real-time signals based on tier
    const subscription = supabase
      .channel('signals')
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'signals'
      }, (payload) => {
        const signal = payload.new
        const userTier = getUserTier()
        const releaseTime = signal[`tier${userTier}_release_at`]
        
        if (new Date() >= new Date(releaseTime)) {
          setSignals(prev => [signal, ...prev])
        }
      })
      .subscribe()
    
    return () => subscription.unsubscribe()
  }, [])
}
```

## Security Considerations

1. **Wallet Verification**: Use proper signature verification (EIP-712)
2. **Session Management**: JWT tokens with expiration
3. **Rate Limiting**: Implement per-tier rate limits
4. **WebSocket Security**: Use authenticated channels
5. **Holdings Verification**: Secure endpoint with API key

## Deployment Steps

1. Set up Supabase project and create tables
2. Deploy Edge Functions to Supabase
3. Configure n8n workflows with Supabase credentials
4. Deploy terminal frontend (Vercel/Netlify)
5. Set up holdings JSON endpoint with authentication
6. Configure WebSocket connections for real-time updates
7. Implement monitoring and alerting

## Environment Variables

### Supabase
- SUPABASE_URL
- SUPABASE_ANON_KEY
- SUPABASE_SERVICE_KEY

### n8n
- N8N_WEBHOOK_URL
- SUPABASE_API_URL
- TWITTER_API_KEY

### Frontend
- REACT_APP_SUPABASE_URL
- REACT_APP_SUPABASE_ANON_KEY
- REACT_APP_WS_URL