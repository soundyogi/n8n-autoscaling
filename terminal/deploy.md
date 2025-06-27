# Deployment Guide

## Prerequisites

- Supabase account and project
- n8n instance (cloud or self-hosted)
- Twitter Developer Account
- OpenAI API key
- Domain for frontend deployment

## Step-by-Step Deployment

### 1. Supabase Setup

#### Create Project
1. Go to [supabase.com](https://supabase.com)
2. Create new project
3. Note down:
   - Project URL
   - Anon key  
   - Service role key

#### Database Schema
```bash
# Copy the SQL schema
cat terminal/supabase-schema.sql

# Execute in Supabase SQL Editor
# Or use CLI:
supabase db push
```

#### Deploy Edge Functions
```bash
# Install Supabase CLI
npm install -g supabase

# Link to your project
supabase link --project-ref your-project-ref

# Deploy functions
supabase functions deploy verify-wallet
supabase functions deploy get-signals  
supabase functions deploy chat-agent

# Set environment variables
supabase secrets set HOLDINGS_API_URL=your-holdings-endpoint
supabase secrets set HOLDINGS_API_KEY=your-api-key
supabase secrets set N8N_CHAT_WEBHOOK_URL=your-n8n-webhook
```

### 2. n8n Setup

#### Cloud Deployment (Recommended)
1. Sign up at [n8n.cloud](https://n8n.cloud)
2. Create new instance
3. Import workflows from `terminal/n8n-workflows/`

#### Self-Hosted Deployment
```bash
# Docker deployment
docker run -d \
  --name n8n \
  -p 5678:5678 \
  -e N8N_BASIC_AUTH_ACTIVE=true \
  -e N8N_BASIC_AUTH_USER=admin \
  -e N8N_BASIC_AUTH_PASSWORD=your-secure-password \
  -v n8n_data:/home/node/.n8n \
  n8nio/n8n
```

#### Configure Credentials
1. **Supabase Credentials**:
   - URL: Your Supabase project URL
   - Service Key: Your service role key

2. **Twitter API Credentials**:
   - API Key
   - API Secret
   - Access Token
   - Access Token Secret

3. **OpenAI Credentials**:
   - API Key

#### Import Workflows
1. Copy workflow JSON files
2. Import via n8n interface
3. Update webhook URLs
4. Activate workflows

### 3. Frontend Deployment

#### Vercel (Recommended)
```bash
# Install Vercel CLI
npm install -g vercel

# Deploy
cd terminal/frontend
vercel

# Set environment variables in Vercel dashboard:
# REACT_APP_SUPABASE_URL
# REACT_APP_SUPABASE_ANON_KEY
# REACT_APP_WALLETCONNECT_PROJECT_ID
```

#### Netlify
```bash
# Build
cd terminal/frontend
npm run build

# Deploy via Netlify dashboard or CLI
netlify deploy --prod --dir=build
```

#### Manual Hosting
```bash
# Build
npm run build

# Upload dist/ folder to your web server
# Configure nginx/apache for SPA routing
```

### 4. Holdings API Setup

#### Option 1: Static JSON Endpoint
```bash
# Upload wallet-holdings.json to a secure endpoint
# Protect with API key authentication
# Update holdings regularly via cron job
```

#### Option 2: Dynamic API
```javascript
// Example Express.js endpoint
app.get('/api/holdings', authenticateAPI, async (req, res) => {
  // Fetch real-time holdings from blockchain
  const holdings = await fetchWalletHoldings()
  res.json({ wallets: holdings })
})
```

### 5. Domain & SSL Configuration

#### Custom Domain
1. Point domain to your frontend deployment
2. Configure SSL certificate
3. Update CORS settings in Supabase

#### Supabase CORS
```sql
-- Add your domain to allowed origins
UPDATE auth.config 
SET site_url = 'https://yourdomain.com'
```

### 6. Monitoring Setup

#### Supabase Monitoring
- Enable database metrics
- Set up function monitoring
- Configure alerts

#### n8n Monitoring
- Enable execution logging
- Set up error notifications
- Monitor workflow performance

#### Frontend Monitoring
```bash
# Add Sentry for error tracking
npm install @sentry/react

# Configure in App.tsx
import * as Sentry from "@sentry/react"
Sentry.init({ dsn: "your-sentry-dsn" })
```

## Production Checklist

### Security
- [ ] Enable RLS policies in Supabase
- [ ] Secure API keys and secrets
- [ ] Configure CORS properly
- [ ] Enable rate limiting
- [ ] Set up SSL certificates

### Performance  
- [ ] Enable CDN for frontend
- [ ] Configure caching headers
- [ ] Optimize database queries
- [ ] Monitor function cold starts
- [ ] Set up error tracking

### Monitoring
- [ ] Database performance metrics
- [ ] Function execution logs
- [ ] Frontend error tracking
- [ ] Uptime monitoring
- [ ] User analytics

### Backup
- [ ] Database backups
- [ ] Code repository backups
- [ ] Environment variable backups
- [ ] Workflow backups

## Environment-Specific Configurations

### Development
```bash
# Use Supabase local development
supabase start

# Run frontend locally
npm run dev

# Use n8n local instance
docker run -p 5678:5678 n8nio/n8n
```

### Staging
```bash
# Create staging Supabase project
# Deploy with staging credentials
# Use test wallet addresses
```

### Production
```bash
# Use production credentials
# Enable all monitoring
# Configure proper rate limits
# Set up alerts
```

## Troubleshooting Deployment

### Common Issues

1. **CORS Errors**
   ```bash
   # Check Supabase allowed origins
   # Verify domain configuration
   ```

2. **Function Timeouts**
   ```bash
   # Increase timeout limits
   # Optimize function code
   # Check external API limits
   ```

3. **Database Connection Issues**
   ```bash
   # Verify connection strings
   # Check RLS policies
   # Monitor connection pool
   ```

### Health Checks

```bash
# Test API endpoints
curl -X POST https://your-project.supabase.co/functions/v1/verify-wallet \
  -H "Content-Type: application/json" \
  -d '{"test": true}'

# Check n8n webhooks
curl -X POST https://your-n8n.com/webhook/test

# Verify frontend
curl https://your-domain.com
```

## Scaling Considerations

### High Traffic
- Enable Supabase Pro plan
- Use CDN for static assets
- Implement caching strategy
- Consider database read replicas

### Global Deployment
- Deploy Edge Functions globally
- Use multi-region databases
- Implement geo-routing
- Consider edge caching

## Maintenance

### Regular Tasks
- Update dependencies
- Rotate API keys
- Clean up old sessions
- Monitor performance metrics
- Backup configurations

### Updates
- Test in staging first
- Use blue-green deployments
- Monitor after deployment
- Have rollback plan ready