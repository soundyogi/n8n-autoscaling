import React, { useEffect } from 'react'
import { WagmiConfig, createConfig, configureChains, mainnet } from 'wagmi'
import { RainbowKitProvider, getDefaultWallets, ConnectButton } from '@rainbow-me/rainbowkit'
import { publicProvider } from 'wagmi/providers/public'
import styled from 'styled-components'
import { Terminal } from './components/Terminal'
import { useAuth } from './hooks/useAuth'
import { useAppStore } from './store/appStore'
import '@rainbow-me/rainbowkit/styles.css'

// Configure chains & providers
const { chains, publicClient } = configureChains([mainnet], [publicProvider()])

// Configure wallets
const { connectors } = getDefaultWallets({
  appName: 'Signal Terminal',
  projectId: process.env.REACT_APP_WALLETCONNECT_PROJECT_ID || 'your-project-id',
  chains
})

// Create wagmi config
const wagmiConfig = createConfig({
  autoConnect: true,
  connectors,
  publicClient
})

const AppContainer = styled.div`
  height: 100vh;
  background: #000;
  color: #00ff00;
  font-family: 'Courier New', monospace;
`

const Header = styled.div`
  position: fixed;
  top: 0;
  right: 0;
  z-index: 1000;
  padding: 20px;
  background: rgba(0, 0, 0, 0.8);
  backdrop-filter: blur(10px);
`

const AuthScreen = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100vh;
  text-align: center;
  padding: 20px;
`

const AuthButton = styled.button`
  background: #00ff00;
  color: #000;
  border: none;
  padding: 12px 24px;
  font-family: inherit;
  font-size: 16px;
  cursor: pointer;
  margin-top: 20px;
  
  &:hover {
    background: #00cc00;
  }
  
  &:disabled {
    background: #666;
    cursor: not-allowed;
  }
`

const App: React.FC = () => {
  const { isAuthenticated } = useAppStore()
  const { authenticate, restoreSession, isAuthenticating, isConnected, address } = useAuth()

  useEffect(() => {
    // Try to restore session on app start
    restoreSession()
  }, [restoreSession])

  const handleAuthenticate = async () => {
    try {
      await authenticate()
    } catch (error) {
      console.error('Authentication failed:', error)
      alert('Authentication failed. Please try again.')
    }
  }

  if (!isAuthenticated) {
    return (
      <AppContainer>
        <Header>
          <ConnectButton />
        </Header>
        
        <AuthScreen>
          <h1>Signal Terminal</h1>
          <p>Tiered Trading Signals Platform</p>
          
          {!isConnected ? (
            <div>
              <p>Connect your wallet to access signals</p>
              <p style={{ fontSize: '14px', color: '#666' }}>
                Your tier is determined by token holdings
              </p>
            </div>
          ) : (
            <div>
              <p>Wallet Connected: {address?.slice(0, 6)}...{address?.slice(-4)}</p>
              <p>Sign message to authenticate and access your tier</p>
              <AuthButton 
                onClick={handleAuthenticate}
                disabled={isAuthenticating}
              >
                {isAuthenticating ? 'Authenticating...' : 'Sign & Authenticate'}
              </AuthButton>
            </div>
          )}
          
          <div style={{ marginTop: '40px', fontSize: '12px', color: '#666' }}>
            <h3>Tier Benefits:</h3>
            <p>Tier 1 (10k+ tokens): Instant signals</p>
            <p>Tier 2 (1k+ tokens): 5 minute delay</p>
            <p>Tier 3 (100+ tokens): 15 minute delay</p>
            <p>Tier 4 (&lt;100 tokens): 30 minute delay</p>
          </div>
        </AuthScreen>
      </AppContainer>
    )
  }

  return (
    <AppContainer>
      <Header>
        <ConnectButton />
      </Header>
      <Terminal />
    </AppContainer>
  )
}

const AppWithProviders: React.FC = () => {
  return (
    <WagmiConfig config={wagmiConfig}>
      <RainbowKitProvider chains={chains}>
        <App />
      </RainbowKitProvider>
    </WagmiConfig>
  )
}

export default AppWithProviders