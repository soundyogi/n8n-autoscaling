-- Supabase Database Schema for Tiered Signal System

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Users table
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_address TEXT UNIQUE NOT NULL,
  tier INTEGER NOT NULL DEFAULT 4 CHECK (tier >= 1 AND tier <= 4),
  holdings NUMERIC DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  last_seen TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Signals table
CREATE TABLE signals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  content JSONB NOT NULL,
  signal_type TEXT,
  severity TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  tier1_release_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  tier2_release_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() + INTERVAL '5 minutes',
  tier3_release_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() + INTERVAL '15 minutes',
  tier4_release_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() + INTERVAL '30 minutes',
  is_public BOOLEAN DEFAULT FALSE,
  twitter_posted BOOLEAN DEFAULT FALSE,
  twitter_post_id TEXT
);

-- User sessions table
CREATE TABLE user_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  token TEXT UNIQUE NOT NULL,
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  last_activity TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Chat messages table
CREATE TABLE chat_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  message TEXT NOT NULL,
  response TEXT,
  priority INTEGER NOT NULL,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  responded_at TIMESTAMP WITH TIME ZONE,
  processing_time_ms INTEGER
);

-- Signal views tracking
CREATE TABLE signal_views (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  signal_id UUID REFERENCES signals(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  viewed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(signal_id, user_id)
);

-- Indexes for performance
CREATE INDEX idx_users_wallet_address ON users(wallet_address);
CREATE INDEX idx_users_tier ON users(tier);
CREATE INDEX idx_signals_release_times ON signals(tier1_release_at, tier2_release_at, tier3_release_at, tier4_release_at);
CREATE INDEX idx_signals_is_public ON signals(is_public);
CREATE INDEX idx_sessions_token ON user_sessions(token);
CREATE INDEX idx_sessions_expires ON user_sessions(expires_at);
CREATE INDEX idx_chat_messages_user_priority ON chat_messages(user_id, priority);
CREATE INDEX idx_chat_messages_status ON chat_messages(status);

-- Row Level Security (RLS)
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE signals ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE signal_views ENABLE ROW LEVEL SECURITY;

-- RLS Policies
-- Users can only see their own data
CREATE POLICY "Users can view own profile" ON users
  FOR SELECT USING (auth.uid() = id);

-- Signals visibility based on tier and release time
CREATE POLICY "Signals visibility by tier" ON signals
  FOR SELECT USING (
    CASE 
      WHEN (SELECT tier FROM users WHERE id = auth.uid()) = 1 THEN tier1_release_at <= NOW()
      WHEN (SELECT tier FROM users WHERE id = auth.uid()) = 2 THEN tier2_release_at <= NOW()
      WHEN (SELECT tier FROM users WHERE id = auth.uid()) = 3 THEN tier3_release_at <= NOW()
      WHEN (SELECT tier FROM users WHERE id = auth.uid()) = 4 THEN tier4_release_at <= NOW()
      ELSE FALSE
    END
  );

-- Sessions policy
CREATE POLICY "Users can view own sessions" ON user_sessions
  FOR SELECT USING (user_id = auth.uid());

-- Chat messages policy
CREATE POLICY "Users can view own messages" ON chat_messages
  FOR ALL USING (user_id = auth.uid());

-- Functions
-- Update user tier based on holdings
CREATE OR REPLACE FUNCTION update_user_tier(p_wallet_address TEXT, p_holdings NUMERIC)
RETURNS void AS $$
DECLARE
  v_tier INTEGER;
BEGIN
  -- Calculate tier based on holdings
  IF p_holdings >= 10000 THEN
    v_tier := 1;
  ELSIF p_holdings >= 1000 THEN
    v_tier := 2;
  ELSIF p_holdings >= 100 THEN
    v_tier := 3;
  ELSE
    v_tier := 4;
  END IF;
  
  -- Update user record
  UPDATE users 
  SET tier = v_tier, 
      holdings = p_holdings,
      updated_at = NOW()
  WHERE wallet_address = p_wallet_address;
END;
$$ LANGUAGE plpgsql;

-- Cleanup expired sessions
CREATE OR REPLACE FUNCTION cleanup_expired_sessions()
RETURNS void AS $$
BEGIN
  DELETE FROM user_sessions WHERE expires_at < NOW();
END;
$$ LANGUAGE plpgsql;

-- Update last_seen timestamp
CREATE OR REPLACE FUNCTION update_last_seen()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE users SET last_seen = NOW() WHERE id = NEW.user_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_user_last_seen
AFTER INSERT OR UPDATE ON user_sessions
FOR EACH ROW EXECUTE FUNCTION update_last_seen();