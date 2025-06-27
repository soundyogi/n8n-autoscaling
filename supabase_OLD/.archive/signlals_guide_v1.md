# User Implementation Guide - Supabase Setup & Distribution System

## Overview

This guide covers your implementation tasks: setting up the complete Supabase database schema, building the n8n bridge workflow to connect signal generation to your tiered distribution system, and creating the frontend signal dashboard.

## Part 1: Complete Supabase Database Setup

### 1.1 Core Tables Setup

Run this complete schema in your Supabase SQL Editor:

```sql
-- Enable necessary extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Main signals table (from developer)
CREATE TABLE signals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  -- Signal Identification
  signal_type VARCHAR(50) NOT NULL,
  subnet_id INTEGER,
  
  -- Timing
  block_number BIGINT,
  timestamp TIMESTAMP WITH TIME ZONE,
  
  -- Signal Data
  impact VARCHAR(20) CHECK (impact IN ('bullish', 'bearish', 'neutral')),
  confidence DECIMAL(3,2) CHECK (confidence >= 0 AND confidence <= 1),
  priority INTEGER DEFAULT 1 CHECK (priority >= 1 AND priority <= 5),
  
  -- Flexible data storage
  signal_data JSONB,
  
  -- Metadata
  processed BOOLEAN DEFAULT FALSE,
  tier_level INTEGER,
  
  -- Distribution tracking
  distribution_started_at TIMESTAMP WITH TIME ZONE,
  distribution_completed_at TIMESTAMP WITH TIME ZONE
);

-- Signal history for deduplication
CREATE TABLE signal_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  signal_type VARCHAR(50),
  subnet_id INTEGER,
  last_triggered_block BIGINT,
  last_value JSONB,
  trigger_count INTEGER DEFAULT 1,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  UNIQUE(signal_type, subnet_id)
);

-- Note: subnet_state table removed to avoid excessive inserts
-- Developer will manage subnet state in memory/local storage

-- System state for global tracking only (not per-subnet)
CREATE TABLE system_state (
  key VARCHAR(50) PRIMARY KEY,
  value JSONB,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Wallet/user data for distribution
CREATE TABLE wallet_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_address TEXT UNIQUE NOT NULL,
  stake_amount DECIMAL,
  tier INTEGER,
  active BOOLEAN DEFAULT TRUE,
  last_verified TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Distribution log for tracking signal delivery
CREATE TABLE signal_distributions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  signal_id UUID REFERENCES signals(id),
  wallet_address TEXT REFERENCES wallet_users(wallet_address),
  tier INTEGER,
  delay_seconds INTEGER,
  scheduled_for TIMESTAMP WITH TIME ZONE,
  delivered_at TIMESTAMP WITH TIME ZONE,
  delivery_status VARCHAR(20) DEFAULT 'pending',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Session management for wallet authentication
CREATE TABLE wallet_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_address TEXT NOT NULL,
  session_token TEXT NOT NULL UNIQUE,
  nonce TEXT NOT NULL,
  signature TEXT NOT NULL,
  expires_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);
```

### 1.2 Performance Indexes

```sql
-- Indexes for optimal performance
CREATE INDEX idx_signals_type ON signals(signal_type);
CREATE INDEX idx_signals_subnet ON signals(subnet_id);
CREATE INDEX idx_signals_block ON signals(block_number DESC);
CREATE INDEX idx_signals_impact ON signals(impact);
CREATE INDEX idx_signals_processed ON signals(processed, created_at DESC);
CREATE INDEX idx_signals_priority ON signals(priority, created_at DESC);
CREATE INDEX idx_signals_created ON signals(created_at DESC);

-- Distribution indexes
CREATE INDEX idx_distributions_signal ON signal_distributions(signal_id);
CREATE INDEX idx_distributions_wallet ON signal_distributions(wallet_address);
CREATE INDEX idx_distributions_scheduled ON signal_distributions(scheduled_for);
CREATE INDEX idx_distributions_status ON signal_distributions(delivery_status);

-- User/wallet indexes
CREATE INDEX idx_wallet_users_address ON wallet_users(wallet_address);
CREATE INDEX idx_wallet_users_tier ON wallet_users(tier);
CREATE INDEX idx_wallet_users_active ON wallet_users(active);
CREATE INDEX idx_wallet_sessions_token ON wallet_sessions(session_token);
CREATE INDEX idx_wallet_sessions_expires ON wallet_sessions(expires_at);
```

### 1.3 Database Views for Frontend

```sql
-- View for recent signals with formatted data
CREATE VIEW recent_signals AS
SELECT 
  s.id,
  s.signal_type,
  s.subnet_id,
  s.impact,
  s.confidence,
  s.priority,
  s.signal_data->>'description' as description,
  s.created_at,
  s.processed,
  CASE 
    WHEN s.priority = 1 THEN 'IMMEDIATE'
    WHEN s.priority = 2 THEN 'HIGH'
    WHEN s.priority = 3 THEN 'MEDIUM'
    WHEN s.priority = 4 THEN 'LOW'
    ELSE 'RESEARCH'
  END as priority_label,
  CASE 
    WHEN s.impact = 'bullish' THEN 'BUY'
    WHEN s.impact = 'bearish' THEN 'SELL'
    ELSE 'WATCH'
  END as action
FROM signals s
WHERE s.created_at > NOW() - INTERVAL '24 hours'
ORDER BY s.created_at DESC;

-- View for user signal feed (for authenticated users)
CREATE VIEW user_signal_feed AS
SELECT 
  s.id,
  s.signal_type,
  s.subnet_id,
  s.impact,
  s.confidence,
  s.priority,
  s.signal_data,
  s.created_at,
  wu.tier,
  sd.delivered_at,
  sd.delay_seconds,
  CASE 
    WHEN s.impact = 'bullish' THEN 'BUY'
    WHEN s.impact = 'bearish' THEN 'SELL'
    ELSE 'WATCH'
  END as action
FROM signals s
JOIN signal_distributions sd ON s.id = sd.signal_id
JOIN wallet_users wu ON sd.wallet_address = wu.wallet_address
WHERE wu.active = true
ORDER BY sd.scheduled_for DESC;

-- View for signal analytics
CREATE VIEW signal_analytics AS
SELECT 
  signal_type,
  impact,
  COUNT(*) as signal_count,
  AVG(confidence) as avg_confidence,
  MAX(created_at) as last_triggered,
  subnet_id
FROM signals 
WHERE created_at > NOW() - INTERVAL '7 days'
GROUP BY signal_type, impact, subnet_id
ORDER BY signal_count DESC;
```

### 1.4 Database Functions

```sql
-- Function to get user tier based on wallet address
CREATE OR REPLACE FUNCTION get_user_tier(wallet_addr TEXT)
RETURNS INTEGER AS $$
BEGIN
  RETURN (
    SELECT tier 
    FROM wallet_users 
    WHERE wallet_address = wallet_addr AND active = true
  );
END;
$$ LANGUAGE plpgsql;

-- Function to mark signal as processed and log distribution
CREATE OR REPLACE FUNCTION process_signal_distribution(
  signal_uuid UUID,
  target_wallets JSONB
) RETURNS VOID AS $$
DECLARE
  wallet_info JSONB;
BEGIN
  -- Mark signal as processed
  UPDATE signals 
  SET processed = true, distribution_started_at = NOW()
  WHERE id = signal_uuid;
  
  -- Insert distribution records
  FOR wallet_info IN SELECT * FROM jsonb_array_elements(target_wallets)
  LOOP
    INSERT INTO signal_distributions (
      signal_id,
      wallet_address,
      tier,
      delay_seconds,
      scheduled_for
    ) VALUES (
      signal_uuid,
      wallet_info->>'address',
      (wallet_info->>'tier')::INTEGER,
      (wallet_info->>'delay')::INTEGER,
      NOW() + (wallet_info->>'delay')::INTEGER * INTERVAL '1 second'
    );
  END LOOP;
END;
$$ LANGUAGE plpgsql;

-- Function to cleanup old data
CREATE OR REPLACE FUNCTION cleanup_old_signals() RETURNS VOID AS $$
BEGIN
  -- Delete signals older than 30 days
  DELETE FROM signals WHERE created_at < NOW() - INTERVAL '30 days';
  
  -- Delete old distributions
  DELETE FROM signal_distributions WHERE created_at < NOW() - INTERVAL '30 days';
  
  -- Delete expired sessions
  DELETE FROM wallet_sessions WHERE expires_at < NOW();
END;
$$ LANGUAGE plpgsql;
```

### 1.5 Sample Data for Testing

```sql
-- Insert sample wallet users for testing
INSERT INTO wallet_users (wallet_address, stake_amount, tier) VALUES
('0x1234567890123456789012345678901234567890', 50000, 1),
('0x2345678901234567890123456789012345678901', 25000, 1),
('0x3456789012345678901234567890123456789012', 15000, 2),
('0x4567890123456789012345678901234567890123', 8000, 3),
('0x5678901234567890123456789012345678901234', 3000, 3),
('0x6789012345678901234567890123456789012345', 500, 4);

-- Insert initial system state (global only - no per-subnet state)
INSERT INTO system_state (key, value) VALUES 
('last_processed_block', '{"block_number": 0}'),
('api_health', '{"status": "unknown", "last_check": null}'),
('tier_config', '{
  "tier1": {"minStake": 25000, "delay": 0},
  "tier2": {"minStake": 10000, "delay": 300},
  "tier3": {"minStake": 1000, "delay": 600},
  "tier4": {"minStake": 0, "delay": 900}
}'),
('signal_thresholds', '{
  "price_breakout": 0.05,
  "volume_spike": 2.0,
  "confidence_minimum": 0.6
}');

-- Insert test signal for integration testing
INSERT INTO signals (
  signal_type,
  subnet_id,
  block_number,
  timestamp,
  impact,
  confidence,
  priority,
  signal_data
) VALUES (
  'integration_test',
  1,
  3000000,
  NOW(),
  'neutral',
  1.0,
  5,
  '{"description": "Database setup test signal", "test": true}'
);
```

## Part 2: n8n Bridge Workflow Setup

### 2.1 Main Bridge Workflow

Create this workflow in n8n to connect developer's signals to your distribution system:

**Workflow Name**: `Signal-to-Distribution-Bridge`

```json
{
  "nodes": [
    {
      "parameters": {
        "rule": {
          "interval": [
            {
              "field": "seconds",
              "value": 30
            }
          ]
        }
      },
      "name": "Check New Signals",
      "type": "n8n-nodes-base.scheduleTrigger",
      "position": [240, 300]
    },
    {
      "parameters": {
        "resource": "select",
        "table": "signals",
        "where": "processed = false AND priority <= 4",
        "sort": "created_at ASC",
        "limit": 10
      },
      "name": "Get Unprocessed Signals",
      "type": "n8n-nodes-base.supabase",
      "position": [460, 300]
    },
    {
      "parameters": {
        "conditions": {
          "number": [
            {
              "value1": "={{$json.length}}",
              "operation": "larger",
              "value2": 0
            }
          ]
        }
      },
      "name": "Has New Signals?",
      "type": "n8n-nodes-base.if",
      "position": [680, 300]
    },
    {
      "parameters": {
        "functionCode": "// Process each signal and format for distribution\nconst signals = items[0].json || [];\nconst formattedSignals = [];\n\nfor (const signal of signals) {\n  const formattedSignal = {\n    signalId: signal.id,\n    signal: {\n      type: signal.signal_type,\n      asset: 'TAO',\n      action: deriveAction(signal.impact),\n      message: formatMessage(signal),\n      confidence: signal.confidence,\n      priority: signal.priority,\n      subnet: signal.subnet_id,\n      data: signal.signal_data\n    }\n  };\n  \n  formattedSignals.push({ json: formattedSignal });\n}\n\nfunction deriveAction(impact) {\n  switch(impact) {\n    case 'bullish': return 'BUY';\n    case 'bearish': return 'SELL'; \n    default: return 'WATCH';\n  }\n}\n\nfunction formatMessage(signal) {\n  const baseMsg = signal.signal_type.replace(/_/g, ' ').toUpperCase();\n  const subnetMsg = signal.subnet_id ? ` (Subnet ${signal.subnet_id})` : '';\n  const description = signal.signal_data?.description || '';\n  return `${baseMsg}${subnetMsg} - ${description} (${(signal.confidence * 100).toFixed(0)}% confidence)`;\n}\n\nreturn formattedSignals;"
      },
      "name": "Format Signals",
      "type": "n8n-nodes-base.function",
      "position": [900, 240]
    },
    {
      "parameters": {
        "resource": "select",
        "table": "wallet_users",
        "where": "active = true"
      },
      "name": "Get Active Wallets",
      "type": "n8n-nodes-base.supabase",
      "position": [900, 360]
    },
    {
      "parameters": {
        "functionCode": "// Combine signals with wallet data for distribution\nconst signals = items.slice(0, -1); // All items except the last (wallets)\nconst wallets = items[items.length - 1].json; // Last item is wallets\n\nconst distributionItems = [];\n\nfor (const signalItem of signals) {\n  const signal = signalItem.json;\n  \n  // Create distribution item with signal and target wallets\n  distributionItems.push({\n    json: {\n      signal: signal.signal,\n      signalId: signal.signalId,\n      wallets: wallets\n    }\n  });\n}\n\nreturn distributionItems;"
      },
      "name": "Combine Signal & Wallets",
      "type": "n8n-nodes-base.function",
      "position": [1120, 300]
    },
    {
      "parameters": {
        "functionCode": "// Mark signal as processed in database\nconst { signalId, wallets } = items[0].json;\n\n// Prepare wallet distribution data\nconst tierConfig = {\n  1: { delay: 0 },      // Immediate\n  2: { delay: 300 },    // 5 minutes\n  3: { delay: 600 },    // 10 minutes\n  4: { delay: 900 }     // 15 minutes\n};\n\nconst targetWallets = wallets.map(wallet => ({\n  address: wallet.wallet_address,\n  tier: wallet.tier,\n  delay: tierConfig[wallet.tier]?.delay || 900\n}));\n\nreturn [{\n  json: {\n    signalId,\n    targetWallets,\n    distributionData: {\n      signalId,\n      wallets: targetWallets\n    }\n  }\n}];"
      },
      "name": "Prepare Distribution",
      "type": "n8n-nodes-base.function",
      "position": [1340, 300]
    },
    {
      "parameters": {
        "resource": "rpc",
        "function": "process_signal_distribution",
        "parameters": "={{JSON.stringify([$json.signalId, $json.targetWallets])}}"
      },
      "name": "Mark Signal Processed",
      "type": "n8n-nodes-base.supabase",
      "position": [1560, 300]
    },
    {
      "parameters": {
        "url": "={{$env.N8N_WEBHOOK_URL}}/webhook/distribute-signal",
        "method": "POST",
        "body": "={{JSON.stringify($json.distributionData)}}",
        "headers": {
          "Content-Type": "application/json"
        }
      },
      "name": "Send to Distribution System",
      "type": "n8n-nodes-base.httpRequest",
      "position": [1780, 300]
    }
  ],
  "connections": {
    "Check New Signals": {
      "main": [
        [
          {
            "node": "Get Unprocessed Signals",
            "type": "main",
            "index": 0
          }
        ]
      ]
    },
    "Get Unprocessed Signals": {
      "main": [
        [
          {
            "node": "Has New Signals?",
            "type": "main",
            "index": 0
          }
        ]
      ]
    },
    "Has New Signals?": {
      "main": [
        [
          {
            "node": "Format Signals",
            "type": "main",
            "index": 0
          },
          {
            "node": "Get Active Wallets",
            "type": "main",
            "index": 0
          }
        ]
      ]
    },
    "Format Signals": {
      "main": [
        [
          {
            "node": "Combine Signal & Wallets",
            "type": "main",
            "index": 0
          }
        ]
      ]
    },
    "Get Active Wallets": {
      "main": [
        [
          {
            "node": "Combine Signal & Wallets",
            "type": "main",
            "index": 0
          }
        ]
      ]
    },
    "Combine Signal & Wallets": {
      "main": [
        [
          {
            "node": "Prepare Distribution",
            "type": "main",
            "index": 0
          }
        ]
      ]
    },
    "Prepare Distribution": {
      "main": [
        [
          {
            "node": "Mark Signal Processed",
            "type": "main",
            "index": 0
          }
        ]
      ]
    },
    "Mark Signal Processed": {
      "main": [
        [
          {
            "node": "Send to Distribution System",
            "type": "main",
            "index": 0
          }
        ]
      ]
    }
  }
}
```

### 2.2 Enhanced Distribution Workflow

Update your existing distribution workflow to handle the new signal format:

**Workflow Name**: `Tiered-Signal-Distribution-v2`

```javascript
// Webhook Trigger receives data like:
{
  "signalId": "uuid-here",
  "wallets": [
    {"address": "0x123...", "tier": 1, "delay": 0},
    {"address": "0x456...", "tier": 2, "delay": 300}
  ]
}

// Function Node: Process Distribution
const { signalId, wallets } = items[0].json;

// Group wallets by tier for batch processing
const tierGroups = wallets.reduce((acc, wallet) => {
  if (!acc[wallet.tier]) acc[wallet.tier] = [];
  acc[wallet.tier].push(wallet);
  return acc;
}, {});

const distributionBatches = [];

Object.entries(tierGroups).forEach(([tier, walletGroup]) => {
  distributionBatches.push({
    json: {
      tier: parseInt(tier),
      delay: walletGroup[0].delay,
      wallets: walletGroup,
      signalId
    }
  });
});

return distributionBatches;
```

## Part 3: Frontend Signal Dashboard

### 3.1 Frontend Architecture

Since you want to keep it simple without WebSockets, use polling-based updates:

```javascript
// Frontend polling strategy
class SignalDashboard {
  constructor() {
    this.supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    this.pollInterval = 10000; // 10 seconds
    this.isPolling = false;
  }
  
  async startPolling() {
    if (this.isPolling) return;
    this.isPolling = true;
    
    while (this.isPolling) {
      try {
        await this.fetchLatestSignals();
        await this.sleep(this.pollInterval);
      } catch (error) {
        console.error('Polling error:', error);
        await this.sleep(5000); // Retry in 5 seconds on error
      }
    }
  }
  
  async fetchLatestSignals() {
    const { data, error } = await this.supabase
      .from('recent_signals')
      .select('*')
      .limit(50);
      
    if (error) throw error;
    
    this.updateSignalsDisplay(data);
  }
  
  stopPolling() {
    this.isPolling = false;
  }
  
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
```

### 3.2 React Component Structure

```jsx
// SignalDashboard.jsx
import React, { useState, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.REACT_APP_SUPABASE_URL, process.env.REACT_APP_SUPABASE_ANON_KEY);

export default function SignalDashboard({ walletAddress }) {
  const [signals, setSignals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');

  useEffect(() => {
    fetchSignals();
    const interval = setInterval(fetchSignals, 10000); // Poll every 10 seconds
    return () => clearInterval(interval);
  }, [filter, walletAddress]);

  const fetchSignals = async () => {
    try {
      let query = supabase.from('recent_signals').select('*');
      
      if (filter !== 'all') {
        query = query.eq('impact', filter);
      }
      
      const { data, error } = await query
        .order('created_at', { ascending: false })
        .limit(100);
        
      if (error) throw error;
      setSignals(data);
    } catch (error) {
      console.error('Error fetching signals:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="signal-dashboard">
      <div className="dashboard-header">
        <h1>Bittensor Signals</h1>
        <div className="filters">
          <button 
            className={filter === 'all' ? 'active' : ''} 
            onClick={() => setFilter('all')}
          >
            All Signals
          </button>
          <button 
            className={filter === 'bullish' ? 'active' : ''} 
            onClick={() => setFilter('bullish')}
          >
            Bullish
          </button>
          <button 
            className={filter === 'bearish' ? 'active' : ''} 
            onClick={() => setFilter('bearish')}
          >
            Bearish
          </button>
        </div>
      </div>
      
      <div className="signals-list">
        {loading ? (
          <div className="loading">Loading signals...</div>
        ) : (
          signals.map(signal => (
            <SignalCard key={signal.id} signal={signal} />
          ))
        )}
      </div>
    </div>
  );
}

// SignalCard.jsx
function SignalCard({ signal }) {
  const getImpactColor = (impact) => {
    switch(impact) {
      case 'bullish': return 'green';
      case 'bearish': return 'red';
      default: return 'gray';
    }
  };

  const getPriorityBadge = (priority) => {
    const labels = {
      1: 'IMMEDIATE',
      2: 'HIGH',
      3: 'MEDIUM',
      4: 'LOW',
      5: 'RESEARCH'
    };
    return labels[priority] || 'UNKNOWN';
  };

  return (
    <div className={`signal-card ${signal.impact}`}>
      <div className="signal-header">
        <h3>{signal.signal_type.replace(/_/g, ' ').toUpperCase()}</h3>
        <div className="signal-meta">
          <span className={`priority-badge priority-${signal.priority}`}>
            {getPriorityBadge(signal.priority)}
          </span>
          <span className={`action-badge ${signal.action.toLowerCase()}`}>
            {signal.action}
          </span>
        </div>
      </div>
      
      <div className="signal-content">
        <p className="description">{signal.description}</p>
        {signal.subnet_id && (
          <p className="subnet">Subnet: {signal.subnet_id}</p>
        )}
        <div className="signal-stats">
          <span>Confidence: {(signal.confidence * 100).toFixed(0)}%</span>
          <span>Impact: <span style={{color: getImpactColor(signal.impact)}}>{signal.impact}</span></span>
        </div>
      </div>
      
      <div className="signal-footer">
        <time>{new Date(signal.created_at).toLocaleString()}</time>
      </div>
    </div>
  );
}
```

### 3.3 User-Specific Signal Feed

For authenticated users, show their personalized signal feed:

```jsx
// UserSignalFeed.jsx
function UserSignalFeed({ walletAddress, sessionToken }) {
  const [userSignals, setUserSignals] = useState([]);
  
  useEffect(() => {
    if (walletAddress && sessionToken) {
      fetchUserSignals();
      const interval = setInterval(fetchUserSignals, 15000); // Poll every 15 seconds
      return () => clearInterval(interval);
    }
  }, [walletAddress, sessionToken]);

  const fetchUserSignals = async () => {
    try {
      const { data, error } = await supabase
        .from('user_signal_feed')
        .select('*')
        .eq('wallet_address', walletAddress) // This would need RLS policy
        .order('scheduled_for', { ascending: false })
        .limit(50);
        
      if (error) throw error;
      setUserSignals(data);
    } catch (error) {
      console.error('Error fetching user signals:', error);
    }
  };

  return (
    <div className="user-signal-feed">
      <h2>Your Signal Feed (Tier {userSignals[0]?.tier})</h2>
      <div className="user-signals">
        {userSignals.map(signal => (
          <UserSignalCard key={signal.id} signal={signal} />
        ))}
      </div>
    </div>
  );
}

function UserSignalCard({ signal }) {
  const getDeliveryStatus = () => {
    if (signal.delivered_at) {
      return `Delivered ${new Date(signal.delivered_at).toLocaleString()}`;
    } else {
      const scheduledTime = new Date(signal.scheduled_for || signal.created_at);
      const delayMinutes = Math.round(signal.delay_seconds / 60);
      return `Delivered with ${delayMinutes}min delay`;
    }
  };

  return (
    <div className={`user-signal-card tier-${signal.tier}`}>
      <div className="signal-timing">
        <span className="tier-badge">Tier {signal.tier}</span>
        <span className="delivery-info">{getDeliveryStatus()}</span>
      </div>
      <SignalCard signal={signal} />
    </div>
  );
}
```

## Part 4: Testing & Integration

### 4.1 Database Testing

```sql
-- Test the complete flow
INSERT INTO signals (
  signal_type,
  subnet_id,
  block_number,
  timestamp,
  impact,
  confidence,
  priority,
  signal_data
) VALUES (
  'test_price_breakout',
  1,
  3000001,
  NOW(),
  'bullish',
  0.85,
  2,
  '{"description": "Test price breakout signal", "current_price": 0.00234, "breakout_strength": 0.15}'
);

-- Verify the signal appears in views
SELECT * FROM recent_signals WHERE signal_type = 'test_price_breakout';

-- Test the distribution function
SELECT process_signal_distribution(
  (SELECT id FROM signals WHERE signal_type = 'test_price_breakout'),
  '[
    {"address": "0x1234567890123456789012345678901234567890", "tier": 1, "delay": 0},
    {"address": "0x3456789012345678901234567890123456789012", "tier": 2, "delay": 300}
  ]'::jsonb
);

-- Check distribution records
SELECT * FROM signal_distributions WHERE signal_id = (
  SELECT id FROM signals WHERE signal_type = 'test_price_breakout'
);
```

### 4.2 n8n Integration Test

Create a manual test workflow:

```json
{
  "nodes": [
    {
      "name": "Manual Test Trigger",
      "type": "n8n-nodes-base.manualTrigger"
    },
    {
      "name": "Insert Test Signal",
      "type": "n8n-nodes-base.supabase",
      "parameters": {
        "resource": "insert",
        "table": "signals",
        "body": {
          "signal_type": "manual_test",
          "impact": "bullish", 
          "confidence": 0.9,
          "priority": 2,
          "signal_data": {"description": "Manual test signal from n8n"}
        }
      }
    },
    {
      "name": "Wait 5 seconds",
      "type": "n8n-nodes-base.wait",
      "parameters": {
        "time": 5
      }
    },
    {
      "name": "Check Bridge Processing",
      "type": "n8n-nodes-base.supabase",
      "parameters": {
        "resource": "select",
        "table": "signal_distributions",
        "where": "signal_id = (SELECT id FROM signals WHERE signal_type = 'manual_test' ORDER BY created_at DESC LIMIT 1)"
      }
    }
  ]
}
```

## Part 5: Environment Setup & Configuration

### 5.1 Environment Variables

```bash
# Supabase Configuration
SUPABASE_URL=your_supabase_project_url
SUPABASE_ANON_KEY=your_anon_key
SUPABASE_SERVICE_KEY=your_service_role_key

# n8n Configuration
N8N_WEBHOOK_URL=https://your-n8n-instance.com
N8N_WEBHOOK_TOKEN=your_webhook_security_token

# Frontend Configuration
REACT_APP_SUPABASE_URL=your_supabase_project_url
REACT_APP_SUPABASE_ANON_KEY=your_anon_key

# Polling Configuration
SIGNAL_POLL_INTERVAL=10000      # 10 seconds
USER_FEED_POLL_INTERVAL=15000   # 15 seconds
DISTRIBUTION_CHECK_INTERVAL=30000 # 30 seconds

# Authentication
JWT_SECRET=your_jwt_secret_for_sessions
SESSION_TIMEOUT=86400  # 24 hours in seconds
```

### 5.2 Row Level Security (RLS) Policies

```sql
-- Enable RLS on sensitive tables
ALTER TABLE wallet_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE signal_distributions ENABLE ROW LEVEL SECURITY;
ALTER TABLE wallet_sessions ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only see their own data
CREATE POLICY "Users see own wallet data" ON wallet_users
  FOR SELECT USING (wallet_address = current_setting('request.jwt.claims', true)::json->>'wallet_address');

CREATE POLICY "Users see own distributions" ON signal_distributions  
  FOR SELECT USING (wallet_address = current_setting('request.jwt.claims', true)::json->>'wallet_address');

CREATE POLICY "Users see own sessions" ON wallet_sessions
  FOR ALL USING (wallet_address = current_setting('request.jwt.claims', true)::json->>'wallet_address');

-- Public read access to signals (no wallet-specific data)
CREATE POLICY "Public signal access" ON signals
  FOR SELECT USING (true);
```

## Part 6: Monitoring & Analytics

### 6.1 System Health Monitoring

```sql
-- Create monitoring views
CREATE VIEW system_health AS
SELECT 
  'signals_generated_24h' as metric,
  COUNT(*)::text as value,
  NOW() as last_updated
FROM signals 
WHERE created_at > NOW() - INTERVAL '24 hours'

UNION ALL

SELECT 
  'signals_pending_distribution' as metric,
  COUNT(*)::text as value,
  NOW() as last_updated
FROM signals 
WHERE processed = false

UNION ALL

SELECT 
  'active_users' as metric,
  COUNT(*)::text as value,
  NOW() as last_updated
FROM wallet_users 
WHERE active = true

UNION ALL

SELECT 
  'avg_signal_confidence' as metric,
  ROUND(AVG(confidence), 3)::text as value,
  NOW() as last_updated
FROM signals 
WHERE created_at > NOW() - INTERVAL '24 hours';
```

### 6.2 Performance Analytics

```sql
-- Signal performance tracking
CREATE VIEW signal_performance AS
SELECT 
  signal_type,
  COUNT(*) as total_signals,
  AVG(confidence) as avg_confidence,
  COUNT(*) FILTER (WHERE impact = 'bullish') as bullish_count,
  COUNT(*) FILTER (WHERE impact = 'bearish') as bearish_count,
  DATE_TRUNC('hour', created_at) as hour_bucket
FROM signals 
WHERE created_at > NOW() - INTERVAL '7 days'
GROUP BY signal_type, DATE_TRUNC('hour', created_at)
ORDER BY hour_bucket DESC;
```


This setup gives you a robust foundation for receiving signals from the developer and distributing them through your tiered system, with a clean frontend for users to view signals in real-time.

Ready to start with the database setup? The schema above will give you everything you need to begin testing!