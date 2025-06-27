# Terminal Frontend Implementation Guide

## Overview

This guide covers building the **creator.bid terminal frontend** - a React app with wallet authentication, real-time signal subscriptions, and push notifications. The terminal connects authenticated users to their personalized signal feed based on their creator.bid membership tier.

## Architecture Flow

```
Terminal UI → Wallet Auth → Supabase Real-time → Background Worker → Push Notifications
```

## Your Responsibilities

1. **React Terminal Interface** - Clean, terminal-style UI with CSS variables
2. **Wallet Authentication** - ethers.js signature-based auth
3. **Real-time Subscriptions** - WebSocket connections for live signals
4. **Background Worker** - Service worker for push notifications
5. **Responsive Design** - Works on desktop and mobile
6. **Signal Management** - Display, filter, and acknowledge signals

## Part 1: Project Setup & Structure

### 1.1 Project Structure

```
terminal-frontend/
├── public/
│   ├── index.html
│   ├── manifest.json
│   ├── service-worker.js
│   └── favicon.ico
├── src/
│   ├── components/
│   │   ├── auth/
│   │   │   ├── WalletConnect.jsx
│   │   │   ├── AuthGuard.jsx
│   │   │   └── LoginModal.jsx
│   │   ├── terminal/
│   │   │   ├── Terminal.jsx
│   │   │   ├── SignalFeed.jsx
│   │   │   ├── SignalCard.jsx
│   │   │   ├── StatusBar.jsx
│   │   │   └── FilterControls.jsx
│   │   ├── notifications/
│   │   │   ├── NotificationCenter.jsx
│   │   │   └── PushNotifications.js
│   │   └── ui/
│   │       ├── Button.jsx
│   │       ├── Badge.jsx
│   │       └── LoadingSpinner.jsx
│   ├── hooks/
│   │   ├── useWallet.js
│   │   ├── useAuth.js
│   │   ├── useSignals.js
│   │   ├── useRealtime.js
│   │   └── useNotifications.js
│   ├── services/
│   │   ├── api.js
│   │   ├── supabase.js
│   │   ├── wallet.js
│   │   └── notifications.js
│   ├── utils/
│   │   ├── constants.js
│   │   ├── formatters.js
│   │   └── helpers.js
│   ├── styles/
│   │   ├── index.css
│   │   ├── terminal.css
│   │   ├── components.css
│   │   └── responsive.css
│   ├── App.jsx
│   └── index.js
├── package.json
└── README.md
```

### 1.2 Package Dependencies

```json
{
  "name": "creator-bid-terminal",
  "version": "1.0.0",
  "dependencies": {
    "react": "^18.2.0",
    "react-dom": "^18.2.0",
    "ethers": "^6.0.0",
    "@supabase/supabase-js": "^2.38.0",
    "date-fns": "^2.30.0",
    "react-hot-toast": "^2.4.1"
  },
  "devDependencies": {
    "@vitejs/plugin-react": "^4.0.0",
    "vite": "^4.4.0",
    "vite-plugin-pwa": "^0.16.0"
  },
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview"
  }
}
```

## Part 2: CSS Design System

### 2.1 Root CSS Variables

```css
/* src/styles/index.css */
:root {
  /* Terminal Colors */
  --terminal-bg: #0a0a0a;
  --terminal-surface: #1a1a1a;
  --terminal-border: #333333;
  --terminal-text: #00ff41;
  --terminal-text-dim: #00cc33;
  --terminal-text-bright: #00ff66;
  --terminal-cursor: #00ff41;
  
  /* Signal Colors */
  --signal-bullish: #00ff41;
  --signal-bearish: #ff4444;
  --signal-neutral: #888888;
  --signal-bg-bullish: rgba(0, 255, 65, 0.1);
  --signal-bg-bearish: rgba(255, 68, 68, 0.1);
  --signal-bg-neutral: rgba(136, 136, 136, 0.1);
  
  /* Priority Colors */
  --priority-immediate: #ff0000;
  --priority-high: #ff8800;
  --priority-medium: #ffff00;
  --priority-low: #888888;
  --priority-research: #444444;
  
  /* Tier Colors */
  --tier-1: #ffd700; /* Gold */
  --tier-2: #c0c0c0; /* Silver */
  --tier-3: #cd7f32; /* Bronze */
  
  /* UI Colors */
  --accent-primary: #00ff41;
  --accent-secondary: #0099cc;
  --success: #00ff41;
  --warning: #ff8800;
  --error: #ff4444;
  --info: #0099cc;
  
  /* Spacing */
  --spacing-xs: 4px;
  --spacing-sm: 8px;
  --spacing-md: 16px;
  --spacing-lg: 24px;
  --spacing-xl: 32px;
  --spacing-xxl: 48px;
  
  /* Typography */
  --font-mono: 'Fira Code', 'Monaco', 'Consolas', monospace;
  --font-size-xs: 12px;
  --font-size-sm: 14px;
  --font-size-md: 16px;
  --font-size-lg: 18px;
  --font-size-xl: 24px;
  
  /* Borders & Shadows */
  --border-radius: 4px;
  --border-width: 1px;
  --shadow-terminal: 0 0 20px rgba(0, 255, 65, 0.3);
  --shadow-signal: 0 2px 8px rgba(0, 0, 0, 0.5);
  
  /* Animations */
  --transition-fast: 0.15s ease;
  --transition-normal: 0.3s ease;
  --transition-slow: 0.5s ease;
  
  /* Z-Index Layers */
  --z-modal: 1000;
  --z-dropdown: 100;
  --z-header: 50;
  --z-overlay: 40;
  --z-content: 1;
}

/* Dark theme adjustments for different screen types */
@media (prefers-contrast: high) {
  :root {
    --terminal-text: #ffffff;
    --terminal-border: #555555;
  }
}

/* Mobile adjustments */
@media (max-width: 768px) {
  :root {
    --font-size-xs: 14px;
    --font-size-sm: 16px;
    --font-size-md: 18px;
    --spacing-md: 12px;
    --spacing-lg: 16px;
  }
}
```

### 2.2 Base Styles

```css
/* src/styles/index.css (continued) */

* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

html, body {
  height: 100%;
  font-family: var(--font-mono);
  background-color: var(--terminal-bg);
  color: var(--terminal-text);
  overflow-x: hidden;
}

#root {
  height: 100%;
  display: flex;
  flex-direction: column;
}

/* Scrollbar Styling */
::-webkit-scrollbar {
  width: 8px;
}

::-webkit-scrollbar-track {
  background: var(--terminal-bg);
}

::-webkit-scrollbar-thumb {
  background: var(--terminal-border);
  border-radius: var(--border-radius);
}

::-webkit-scrollbar-thumb:hover {
  background: var(--terminal-text-dim);
}

/* Selection Styling */
::selection {
  background: var(--accent-primary);
  color: var(--terminal-bg);
}

/* Focus Styles */
*:focus {
  outline: 2px solid var(--accent-primary);
  outline-offset: 2px;
}

/* Button Reset */
button {
  background: none;
  border: none;
  color: inherit;
  font: inherit;
  cursor: pointer;
  padding: 0;
}

/* Link Reset */
a {
  color: inherit;
  text-decoration: none;
}

/* Input Reset */
input {
  background: none;
  border: none;
  color: inherit;
  font: inherit;
}

/* Text Utilities */
.text-bullish { color: var(--signal-bullish); }
.text-bearish { color: var(--signal-bearish); }
.text-neutral { color: var(--signal-neutral); }
.text-dim { color: var(--terminal-text-dim); opacity: 0.7; }
.text-bright { color: var(--terminal-text-bright); }

/* Background Utilities */
.bg-bullish { background-color: var(--signal-bg-bullish); }
.bg-bearish { background-color: var(--signal-bg-bearish); }
.bg-neutral { background-color: var(--signal-bg-neutral); }

/* Animation Classes */
.fade-in {
  animation: fadeIn var(--transition-normal) ease;
}

.slide-up {
  animation: slideUp var(--transition-normal) ease;
}

.pulse {
  animation: pulse 2s infinite;
}

.blink {
  animation: blink 1s infinite;
}

@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

@keyframes slideUp {
  from { 
    opacity: 0;
    transform: translateY(20px); 
  }
  to { 
    opacity: 1;
    transform: translateY(0); 
  }
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.7; }
}

@keyframes blink {
  0%, 50% { opacity: 1; }
  51%, 100% { opacity: 0; }
}
```

### 2.3 Terminal Component Styles

```css
/* src/styles/terminal.css */
.terminal {
  height: 100vh;
  display: flex;
  flex-direction: column;
  background: var(--terminal-bg);
  position: relative;
  overflow: hidden;
}

.terminal::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: 
    linear-gradient(transparent 98%, var(--terminal-text) 100%),
    linear-gradient(90deg, transparent 98%, var(--terminal-text) 100%);
  background-size: 3px 3px, 3px 3px;
  opacity: 0.03;
  pointer-events: none;
}

.terminal-header {
  background: var(--terminal-surface);
  border-bottom: var(--border-width) solid var(--terminal-border);
  padding: var(--spacing-md);
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-shrink: 0;
}

.terminal-brand {
  font-size: var(--font-size-lg);
  font-weight: bold;
  color: var(--accent-primary);
  text-shadow: 0 0 10px var(--accent-primary);
}

.terminal-status {
  display: flex;
  align-items: center;
  gap: var(--spacing-md);
  font-size: var(--font-size-sm);
}

.status-indicator {
  display: flex;
  align-items: center;
  gap: var(--spacing-xs);
}

.status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--success);
  box-shadow: 0 0 6px var(--success);
}

.status-dot.disconnected {
  background: var(--error);
  box-shadow: 0 0 6px var(--error);
}

.status-dot.connecting {
  background: var(--warning);
  box-shadow: 0 0 6px var(--warning);
  animation: pulse 1s infinite;
}

.terminal-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  position: relative;
}

.terminal-main {
  flex: 1;
  overflow-y: auto;
  padding: var(--spacing-md);
  position: relative;
}

.terminal-footer {
  background: var(--terminal-surface);
  border-top: var(--border-width) solid var(--terminal-border);
  padding: var(--spacing-sm) var(--spacing-md);
  font-size: var(--font-size-xs);
  color: var(--terminal-text-dim);
  display: flex;
  justify-content: space-between;
  align-items: center;
}

/* Terminal Prompt Effect */
.terminal-prompt::after {
  content: '█';
  color: var(--terminal-cursor);
  animation: blink 1s infinite;
  margin-left: var(--spacing-xs);
}

/* Scrollbar for terminal content */
.terminal-main::-webkit-scrollbar {
  width: 6px;
}
```

## Part 3: Wallet Authentication

### 3.1 Wallet Connection Hook

```javascript
// src/hooks/useWallet.js
import { useState, useEffect } from 'react';
import { ethers } from 'ethers';
import toast from 'react-hot-toast';

export function useWallet() {
  const [wallet, setWallet] = useState({
    address: null,
    provider: null,
    signer: null,
    isConnecting: false,
    isConnected: false
  });

  const connectWallet = async () => {
    if (!window.ethereum) {
      toast.error('Please install MetaMask or another Web3 wallet');
      return false;
    }

    setWallet(prev => ({ ...prev, isConnecting: true }));

    try {
      // Request account access
      await window.ethereum.request({ method: 'eth_requestAccounts' });
      
      const provider = new ethers.BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();
      const address = await signer.getAddress();

      setWallet({
        address,
        provider,
        signer,
        isConnecting: false,
        isConnected: true
      });

      toast.success(`Connected to ${address.slice(0, 6)}...${address.slice(-4)}`);
      return true;
    } catch (error) {
      console.error('Failed to connect wallet:', error);
      setWallet(prev => ({ ...prev, isConnecting: false }));
      
      if (error.code === 4001) {
        toast.error('Connection rejected by user');
      } else {
        toast.error('Failed to connect wallet');
      }
      return false;
    }
  };

  const disconnectWallet = () => {
    setWallet({
      address: null,
      provider: null,
      signer: null,
      isConnecting: false,
      isConnected: false
    });
    toast.success('Wallet disconnected');
  };

  const signMessage = async (message) => {
    if (!wallet.signer) {
      throw new Error('Wallet not connected');
    }

    try {
      return await wallet.signer.signMessage(message);
    } catch (error) {
      console.error('Failed to sign message:', error);
      if (error.code === 'ACTION_REJECTED') {
        throw new Error('Signature rejected by user');
      }
      throw new Error('Failed to sign message');
    }
  };

  // Auto-connect if previously connected
  useEffect(() => {
    const autoConnect = async () => {
      if (window.ethereum && localStorage.getItem('wallet_connected')) {
        try {
          const accounts = await window.ethereum.request({ method: 'eth_accounts' });
          if (accounts.length > 0) {
            await connectWallet();
          }
        } catch (error) {
          console.error('Auto-connect failed:', error);
          localStorage.removeItem('wallet_connected');
        }
      }
    };

    autoConnect();
  }, []);

  // Save connection state
  useEffect(() => {
    if (wallet.isConnected) {
      localStorage.setItem('wallet_connected', 'true');
    } else {
      localStorage.removeItem('wallet_connected');
    }
  }, [wallet.isConnected]);

  // Listen for account changes
  useEffect(() => {
    if (window.ethereum) {
      const handleAccountsChanged = (accounts) => {
        if (accounts.length === 0) {
          disconnectWallet();
        } else if (accounts[0] !== wallet.address) {
          // Account changed, reconnect
          connectWallet();
        }
      };

      const handleChainChanged = () => {
        // Reload on chain change
        window.location.reload();
      };

      window.ethereum.on('accountsChanged', handleAccountsChanged);
      window.ethereum.on('chainChanged', handleChainChanged);

      return () => {
        window.ethereum.removeListener('accountsChanged', handleAccountsChanged);
        window.ethereum.removeListener('chainChanged', handleChainChanged);
      };
    }
  }, [wallet.address]);

  return {
    ...wallet,
    connectWallet,
    disconnectWallet,
    signMessage
  };
}
```

### 3.2 Authentication Hook

```javascript
// src/hooks/useAuth.js
import { useState, useEffect } from 'react';
import { api } from '../services/api';
import { supabase } from '../services/supabase';
import toast from 'react-hot-toast';

export function useAuth() {
  const [auth, setAuth] = useState({
    isAuthenticated: false,
    isLoading: false,
    user: null,
    sessionToken: null
  });

  const authenticate = async (wallet) => {
    if (!wallet.address || !wallet.signMessage) {
      throw new Error('Wallet not connected');
    }

    setAuth(prev => ({ ...prev, isLoading: true }));

    try {
      // Get challenge from backend
      const challenge = await api.post('/auth/challenge', {
        walletAddress: wallet.address
      });

      // Sign challenge
      const signature = await wallet.signMessage(challenge.message);

      // Verify signature and get session
      const authResult = await api.post('/auth/verify', {
        walletAddress: wallet.address,
        signature
      });

      // Set up Supabase auth
      const supabaseSession = {
        access_token: authResult.sessionToken,
        token_type: 'bearer',
        user: {
          id: wallet.address,
          wallet_address: wallet.address
        }
      };

      await supabase.auth.setSession(supabaseSession);

      // Get user membership data
      const userData = await fetchUserData(wallet.address);

      const authState = {
        isAuthenticated: true,
        isLoading: false,
        user: userData,
        sessionToken: authResult.sessionToken
      };

      setAuth(authState);
      localStorage.setItem('auth_session', JSON.stringify(authState));
      
      toast.success(`Authenticated as Tier ${userData.tier} member`);
      return true;
    } catch (error) {
      console.error('Authentication failed:', error);
      setAuth(prev => ({ ...prev, isLoading: false }));
      toast.error(error.message || 'Authentication failed');
      return false;
    }
  };

  const logout = async () => {
    try {
      if (auth.sessionToken) {
        await api.post('/auth/logout', { sessionToken: auth.sessionToken });
      }
    } catch (error) {
      console.error('Logout error:', error);
    }

    await supabase.auth.signOut();
    setAuth({
      isAuthenticated: false,
      isLoading: false,
      user: null,
      sessionToken: null
    });
    localStorage.removeItem('auth_session');
    toast.success('Logged out successfully');
  };

  const fetchUserData = async (walletAddress) => {
    try {
      const { data, error } = await supabase
        .from('cb_members')
        .select('*')
        .eq('wallet_address', walletAddress)
        .single();

      if (error) throw error;
      return data;
    } catch (error) {
      console.error('Failed to fetch user data:', error);
      throw new Error('User not found in creator.bid membership');
    }
  };

  // Restore session on app load
  useEffect(() => {
    const restoreSession = async () => {
      const savedSession = localStorage.getItem('auth_session');
      if (!savedSession) return;

      try {
        const sessionData = JSON.parse(savedSession);
        
        // Verify session is still valid
        const userData = await fetchUserData(sessionData.user.wallet_address);
        
        // Set up Supabase auth
        const supabaseSession = {
          access_token: sessionData.sessionToken,
          token_type: 'bearer',
          user: {
            id: sessionData.user.wallet_address,
            wallet_address: sessionData.user.wallet_address
          }
        };

        await supabase.auth.setSession(supabaseSession);
        
        setAuth({
          ...sessionData,
          user: userData
        });
      } catch (error) {
        console.error('Failed to restore session:', error);
        localStorage.removeItem('auth_session');
      }
    };

    restoreSession();
  }, []);

  return {
    ...auth,
    authenticate,
    logout,
    refreshUser: () => fetchUserData(auth.user?.wallet_address)
  };
}
```

### 3.3 Wallet Connect Component

```jsx
// src/components/auth/WalletConnect.jsx
import React from 'react';
import { useWallet } from '../../hooks/useWallet';
import { useAuth } from '../../hooks/useAuth';
import Button from '../ui/Button';

export default function WalletConnect() {
  const wallet = useWallet();
  const auth = useAuth();

  const handleConnect = async () => {
    const connected = await wallet.connectWallet();
    if (connected) {
      await auth.authenticate(wallet);
    }
  };

  const handleDisconnect = async () => {
    await auth.logout();
    wallet.disconnectWallet();
  };

  if (auth.isAuthenticated) {
    return (
      <div className="wallet-connected">
        <div className="wallet-info">
          <div className="wallet-address">
            {wallet.address?.slice(0, 6)}...{wallet.address?.slice(-4)}
          </div>
          <div className="tier-badge tier-{auth.user?.tier}">
            Tier {auth.user?.tier}
          </div>
        </div>
        <Button 
          variant="secondary" 
          size="sm" 
          onClick={handleDisconnect}
        >
          Disconnect
        </Button>
      </div>
    );
  }

  return (
    <div className="wallet-connect">
      <Button
        variant="primary"
        size="md"
        disabled={wallet.isConnecting || auth.isLoading}
        onClick={handleConnect}
      >
        {wallet.isConnecting || auth.isLoading 
          ? 'Connecting...' 
          : 'Connect Wallet'
        }
      </Button>
    </div>
  );
}
```

## Part 4: Real-time Signal Subscriptions

### 4.1 Real-time Signals Hook

```javascript
// src/hooks/useSignals.js
import { useState, useEffect } from 'react';
import { supabase } from '../services/supabase';
import { useAuth } from './useAuth';
import toast from 'react-hot-toast';

export function useSignals() {
  const [signals, setSignals] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isConnected, setIsConnected] = useState(false);
  const { isAuthenticated, user } = useAuth();

  // Load initial signals
  useEffect(() => {
    if (!isAuthenticated) return;

    const loadSignals = async () => {
      setIsLoading(true);
      try {
        const { data, error } = await supabase
          .from('user_signal_feed')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(50);

        if (error) throw error;
        setSignals(data || []);
      } catch (error) {
        console.error('Failed to load signals:', error);
        toast.error('Failed to load signal history');
      } finally {
        setIsLoading(false);
      }
    };

    loadSignals();
  }, [isAuthenticated]);

  // Set up real-time subscription
  useEffect(() => {
    if (!isAuthenticated || !user) return;

    console.log(`Setting up real-time subscription for tier ${user.tier} user...`);

    const channel = supabase
      .channel('user-signals')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'signals',
          filter: `target_tiers=cs.{${user.tier}}`
        },
        (payload) => {
          console.log('New signal received:', payload.new);
          handleNewSignal(payload.new);
        }
      )
      .subscribe((status) => {
        console.log('Subscription status:', status);
        setIsConnected(status === 'SUBSCRIBED');
        
        if (status === 'SUBSCRIBED') {
          toast.success('Connected to live signals');
        } else if (status === 'CLOSED') {
          toast.error('Disconnected from live signals');
        }
      });

    return () => {
      console.log('Cleaning up signal subscription');
      supabase.removeChannel(channel);
      setIsConnected(false);
    };
  }, [isAuthenticated, user?.tier]);

  const handleNewSignal = (newSignal) => {
    // Add signal to the beginning of the list
    setSignals(prev => [formatSignal(newSignal), ...prev.slice(0, 49)]);
    
    // Show notification
    const action = newSignal.impact === 'bullish' ? 'BUY' : 
                  newSignal.impact === 'bearish' ? 'SELL' : 'WATCH';
    
    toast.success(
      `New ${action} signal: ${newSignal.signal_type}`,
      {
        duration: 5000,
        style: {
          background: newSignal.impact === 'bullish' ? 'var(--signal-bg-bullish)' :
                     newSignal.impact === 'bearish' ? 'var(--signal-bg-bearish)' :
                     'var(--signal-bg-neutral)',
          color: 'var(--terminal-text)',
          border: '1px solid var(--terminal-border)'
        }
      }
    );

    // Trigger push notification if supported
    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification(`New ${action} Signal`, {
        body: `${newSignal.signal_type} - ${newSignal.signal_data?.description || ''}`,
        icon: '/favicon.ico',
        tag: newSignal.id
      });
    }
  };

  const formatSignal = (signal) => ({
    ...signal,
    action: signal.impact === 'bullish' ? 'BUY' :
            signal.impact === 'bearish' ? 'SELL' : 'WATCH',
    priority_label: signal.priority === 1 ? 'IMMEDIATE' :
                   signal.priority === 2 ? 'HIGH' :
                   signal.priority === 3 ? 'MEDIUM' :
                   signal.priority === 4 ? 'LOW' : 'RESEARCH',
    description: signal.signal_data?.description || signal.signal_type
  });

  const acknowledgeSignal = async (signalId) => {
    try {
      const { error } = await supabase
        .from('signal_deliveries')
        .update({ acknowledged: true })
        .eq('signal_id', signalId)
        .eq('wallet_address', user.wallet_address);

      if (error) throw error;

      // Update local state
      setSignals(prev =>
        prev.map(signal =>
          signal.id === signalId
            ? { ...signal, acknowledged: true }
            : signal
        )
      );
    } catch (error) {
      console.error('Failed to acknowledge signal:', error);
    }
  };

  const filterSignals = (filters) => {
    return signals.filter(signal => {
      if (filters.impact && signal.impact !== filters.impact) return false;
      if (filters.priority && signal.priority !== filters.priority) return false;
      if (filters.subnet && signal.subnet_id !== filters.subnet) return false;
      if (filters.dateRange) {
        const signalDate = new Date(signal.created_at);
        const { start, end } = filters.dateRange;
        if (start && signalDate < start) return false;
        if (end && signalDate > end) return false;
      }
      return true;
    });
  };

  return {
    signals,
    isLoading,
    isConnected,
    acknowledgeSignal,
    filterSignals
  };
}
```

### 4.2 Real-time Connection Hook

```javascript
// src/hooks/useRealtime.js
import { useState, useEffect } from 'react';
import { supabase } from '../services/supabase';
import { useAuth } from './useAuth';

export function useRealtime() {
  const [connectionStatus, setConnectionStatus] = useState('disconnected');
  const [lastHeartbeat, setLastHeartbeat] = useState(null);
  const { isAuthenticated } = useAuth();

  useEffect(() => {
    if (!isAuthenticated) {
      setConnectionStatus('disconnected');
      return;
    }

    let heartbeatInterval;

    const setupConnection = () => {
      setConnectionStatus('connecting');

      // Monitor Supabase connection
      const channel = supabase.channel('heartbeat');
      
      channel
        .on('presence', { event: 'sync' }, () => {
          setConnectionStatus('connected');
          setLastHeartbeat(new Date());
        })
        .subscribe();

      // Heartbeat every 30 seconds
      heartbeatInterval = setInterval(() => {
        if (supabase.realtime.isConnected()) {
          setLastHeartbeat(new Date());
          setConnectionStatus('connected');
        } else {
          setConnectionStatus('disconnected');
        }
      }, 30000);

      // Listen for connection state changes
      supabase.realtime.onClose(() => {
        setConnectionStatus('disconnected');
      });

      supabase.realtime.onError(() => {
        setConnectionStatus('error');
      });

      return () => {
        clearInterval(heartbeatInterval);
        supabase.removeChannel(channel);
      };
    };

    const cleanup = setupConnection();
    return cleanup;
  }, [isAuthenticated]);

  return {
    connectionStatus,
    lastHeartbeat,
    isConnected: connectionStatus === 'connected'
  };
}
```

## Part 5: Signal Display Components

### 5.1 Signal Feed Component

```jsx
// src/components/terminal/SignalFeed.jsx
import React, { useState } from 'react';
import { useSignals } from '../../hooks/useSignals';
import SignalCard from './SignalCard';
import FilterControls from './FilterControls';
import LoadingSpinner from '../ui/LoadingSpinner';

export default function SignalFeed() {
  const { signals, isLoading, isConnected, acknowledgeSignal, filterSignals } = useSignals();
  const [filters, setFilters] = useState({});
  const [showFilters, setShowFilters] = useState(false);

  const filteredSignals = filterSignals(filters);

  if (isLoading) {
    return (
      <div className="signal-feed-loading">
        <LoadingSpinner />
        <p>Loading signal feed...</p>
      </div>
    );
  }

  return (
    <div className="signal-feed">
      <div className="signal-feed-header">
        <div className="signal-count">
          <span className="count">{filteredSignals.length}</span>
          <span className="label">signals</span>
          {filters && Object.keys(filters).length > 0 && (
            <span className="filtered">(filtered)</span>
          )}
        </div>
        
        <div className="signal-controls">
          <button
            className={`filter-toggle ${showFilters ? 'active' : ''}`}
            onClick={() => setShowFilters(!showFilters)}
          >
            Filters
          </button>
          
          <div className={`connection-status ${isConnected ? 'connected' : 'disconnected'}`}>
            <div className="status-dot"></div>
            <span>{isConnected ? 'Live' : 'Offline'}</span>
          </div>
        </div>
      </div>

      {showFilters && (
        <FilterControls
          filters={filters}
          onFiltersChange={setFilters}
          onClearFilters={() => setFilters({})}
        />
      )}

      <div className="signal-list">
        {filteredSignals.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">📡</div>
            <h3>No signals yet</h3>
            <p>
              {signals.length === 0
                ? 'Waiting for signals from the network...'
                : 'No signals match your current filters.'
              }
            </p>
          </div>
        ) : (
          filteredSignals.map((signal) => (
            <SignalCard
              key={signal.id}
              signal={signal}
              onAcknowledge={() => acknowledgeSignal(signal.id)}
            />
          ))
        )}
      </div>
    </div>
  );
}
```

### 5.2 Signal Card Component

```jsx
// src/components/terminal/SignalCard.jsx
import React, { useState } from 'react';
import { formatDistanceToNow } from 'date-fns';
import Badge from '../ui/Badge';

export default function SignalCard({ signal, onAcknowledge }) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isAcknowledged, setIsAcknowledged] = useState(signal.acknowledged);

  const handleAcknowledge = async () => {
    if (isAcknowledged) return;
    
    setIsAcknowledged(true);
    await onAcknowledge();
  };

  const getImpactClass = (impact) => {
    switch (impact) {
      case 'bullish': return 'bullish';
      case 'bearish': return 'bearish';
      default: return 'neutral';
    }
  };

  const getPriorityClass = (priority) => {
    switch (priority) {
      case 1: return 'immediate';
      case 2: return 'high';
      case 3: return 'medium';
      case 4: return 'low';
      default: return 'research';
    }
  };

  return (
    <div className={`signal-card ${getImpactClass(signal.impact)} ${isAcknowledged ? 'acknowledged' : ''}`}>
      <div className="signal-header" onClick={() => setIsExpanded(!isExpanded)}>
        <div className="signal-title">
          <h3>{signal.signal_type.replace(/_/g, ' ').toUpperCase()}</h3>
          {signal.subnet_id && (
            <span className="subnet-id">SN{signal.subnet_id}</span>
          )}
        </div>
        
        <div className="signal-meta">
          <Badge variant={getImpactClass(signal.impact)}>
            {signal.action}
          </Badge>
          <Badge variant={getPriorityClass(signal.priority)}>
            {signal.priority_label}
          </Badge>
        </div>
      </div>

      <div className="signal-content">
        <p className="signal-description">{signal.description}</p>
        
        <div className="signal-stats">
          <div className="stat">
            <span className="label">Confidence:</span>
            <span className="value">{(signal.confidence * 100).toFixed(0)}%</span>
          </div>
          
          <div className="stat">
            <span className="label">Time:</span>
            <span className="value">
              {formatDistanceToNow(new Date(signal.created_at), { addSuffix: true })}
            </span>
          </div>
          
          {signal.signal_data?.current_price && (
            <div className="stat">
              <span className="label">Price:</span>
              <span className="value">${signal.signal_data.current_price}</span>
            </div>
          )}
        </div>

        {isExpanded && signal.signal_data && (
          <div className="signal-details">
            <h4>Signal Data:</h4>
            <pre className="signal-data">
              {JSON.stringify(signal.signal_data, null, 2)}
            </pre>
          </div>
        )}
      </div>

      <div className="signal-actions">
        <button
          className="expand-toggle"
          onClick={() => setIsExpanded(!isExpanded)}
        >
          {isExpanded ? 'Show Less' : 'Show More'}
        </button>
        
        {!isAcknowledged && (
          <button
            className="acknowledge-btn"
            onClick={handleAcknowledge}
          >
            Mark Read
          </button>
        )}
      </div>
    </div>
  );
}
```

## Part 6: Background Worker & Push Notifications

### 6.1 Service Worker

```javascript
// public/service-worker.js
const CACHE_NAME = 'creator-bid-terminal-v1';
const urlsToCache = [
  '/',
  '/static/js/bundle.js',
  '/static/css/main.css',
  '/manifest.json'
];

// Install service worker
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(urlsToCache))
  );
});

// Fetch event
self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request)
      .then((response) => {
        // Return cached version or fetch from network
        return response || fetch(event.request);
      })
  );
});

// Push notification handler
self.addEventListener('push', (event) => {
  const options = {
    body: event.data ? event.data.text() : 'New signal received',
    icon: '/favicon.ico',
    badge: '/favicon.ico',
    vibrate: [100, 50, 100],
    data: {
      dateOfArrival: Date.now(),
      primaryKey: 1
    },
    actions: [
      {
        action: 'view',
        title: 'View Signal',
        icon: '/icons/view.png'
      },
      {
        action: 'close',
        title: 'Close',
        icon: '/icons/close.png'
      }
    ]
  };

  event.waitUntil(
    self.registration.showNotification('creator.bid Terminal', options)
  );
});

// Notification click handler
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  if (event.action === 'view') {
    event.waitUntil(
      clients.openWindow('/')
    );
  }
});
```

### 6.2 Push Notifications Hook

```javascript
// src/hooks/useNotifications.js
import { useState, useEffect } from 'react';
import { useAuth } from './useAuth';

export function useNotifications() {
  const [permission, setPermission] = useState(Notification.permission);
  const [isSupported, setIsSupported] = useState('Notification' in window);
  const [registration, setRegistration] = useState(null);
  const { isAuthenticated } = useAuth();

  useEffect(() => {
    // Register service worker
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/service-worker.js')
        .then((reg) => {
          console.log('Service worker registered:', reg);
          setRegistration(reg);
        })
        .catch((error) => {
          console.error('Service worker registration failed:', error);
        });
    }
  }, []);

  const requestPermission = async () => {
    if (!isSupported) {
      throw new Error('Notifications not supported');
    }

    const result = await Notification.requestPermission();
    setPermission(result);
    
    if (result === 'granted') {
      console.log('Notification permission granted');
      return true;
    } else {
      console.log('Notification permission denied');
      return false;
    }
  };

  const sendTestNotification = () => {
    if (permission !== 'granted') return;

    new Notification('creator.bid Terminal', {
      body: 'Push notifications are working!',
      icon: '/favicon.ico',
      tag: 'test-notification'
    });
  };

  const createSignalNotification = (signal) => {
    if (permission !== 'granted') return;

    const action = signal.impact === 'bullish' ? 'BUY' : 
                  signal.impact === 'bearish' ? 'SELL' : 'WATCH';

    new Notification(`New ${action} Signal`, {
      body: `${signal.signal_type} - ${signal.description}`,
      icon: '/favicon.ico',
      tag: signal.id,
      vibrate: [200, 100, 200],
      data: {
        signalId: signal.id,
        action: action
      }
    });
  };

  // Auto-request permission for authenticated users
  useEffect(() => {
    if (isAuthenticated && permission === 'default') {
      requestPermission();
    }
  }, [isAuthenticated]);

  return {
    permission,
    isSupported,
    registration,
    requestPermission,
    sendTestNotification,
    createSignalNotification,
    isEnabled: permission === 'granted'
  };
}
```

## Part 7: Main App Component

### 7.1 App.jsx

```jsx
// src/App.jsx
import React from 'react';
import { Toaster } from 'react-hot-toast';
import { useAuth } from './hooks/useAuth';
import { useRealtime } from './hooks/useRealtime';
import Terminal from './components/terminal/Terminal';
import WalletConnect from './components/auth/WalletConnect';
import LoadingSpinner from './components/ui/LoadingSpinner';

function App() {
  const { isAuthenticated, isLoading } = useAuth();
  const { connectionStatus } = useRealtime();

  if (isLoading) {
    return (
      <div className="app-loading">
        <LoadingSpinner />
        <p>Initializing terminal...</p>
      </div>
    );
  }

  return (
    <div className="app">
      <div className="terminal-container">
        {isAuthenticated ? (
          <Terminal connectionStatus={connectionStatus} />
        ) : (
          <div className="auth-screen">
            <div className="auth-content">
              <h1 className="terminal-brand">creator.bid terminal</h1>
              <p className="auth-description">
                Connect your wallet to access real-time Bittensor signals
              </p>
              <WalletConnect />
              <div className="auth-footer">
                <p>Requires creator.bid membership</p>
              </div>
            </div>
          </div>
        )}
      </div>

      <Toaster
        position="bottom-right"
        toastOptions={{
          duration: 4000,
          style: {
            background: 'var(--terminal-surface)',
            color: 'var(--terminal-text)',
            border: '1px solid var(--terminal-border)',
            fontFamily: 'var(--font-mono)',
            fontSize: 'var(--font-size-sm)'
          }
        }}
      />
    </div>
  );
}

export default App;
```

### 7.2 Terminal Component

```jsx
// src/components/terminal/Terminal.jsx
import React from 'react';
import { useAuth } from '../../hooks/useAuth';
import { useNotifications } from '../../hooks/useNotifications';
import SignalFeed from './SignalFeed';
import StatusBar from './StatusBar';
import WalletConnect from '../auth/WalletConnect';

export default function Terminal({ connectionStatus }) {
  const { user } = useAuth();
  const { isEnabled: notificationsEnabled, requestPermission } = useNotifications();

  return (
    <div className="terminal">
      <header className="terminal-header">
        <div className="terminal-brand">
          creator.bid terminal
        </div>
        
        <div className="terminal-controls">
          {!notificationsEnabled && (
            <button 
              className="enable-notifications"
              onClick={requestPermission}
            >
              Enable Notifications
            </button>
          )}
          <WalletConnect />
        </div>
      </header>

      <div className="terminal-content">
        <StatusBar
          connectionStatus={connectionStatus}
          userTier={user?.tier}
          notificationsEnabled={notificationsEnabled}
        />
        
        <main className="terminal-main">
          <SignalFeed />
        </main>
      </div>

      <footer className="terminal-footer">
        <span>creator.bid terminal v1.0.0</span>
        <span>
          Tier {user?.tier} • {user?.subscription_status}
        </span>
      </footer>
    </div>
  );
}
```

This terminal frontend provides:

✅ **Wallet Authentication** with ethers.js signature verification  
✅ **Real-time Signal Feed** via Supabase WebSocket subscriptions  
✅ **CSS Variables Design System** for consistent theming  
✅ **Push Notifications** with service worker support  
✅ **Responsive Design** that works on desktop and mobile  
✅ **Signal Filtering** and acknowledgment features  
✅ **Connection Status** monitoring and error handling  

The terminal automatically connects to your Supabase backend and displays tier-appropriate signals in real-time!