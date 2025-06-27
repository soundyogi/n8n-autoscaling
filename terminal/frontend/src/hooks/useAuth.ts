import { useState, useCallback } from 'react'
import { useAccount, useSignMessage } from 'wagmi'
import { api } from '../utils/supabase'
import { useAppStore } from '../store/appStore'

export const useAuth = () => {
  const { address, isConnected } = useAccount()
  const { signMessageAsync } = useSignMessage()
  const [isAuthenticating, setIsAuthenticating] = useState(false)
  const { setSession, setUser, setIsAuthenticated } = useAppStore()

  const authenticate = useCallback(async () => {
    if (!address || !isConnected) {
      throw new Error('Wallet not connected')
    }

    setIsAuthenticating(true)
    
    try {
      // Create message to sign
      const message = `Authenticate with Signal Terminal: ${Date.now()}`
      
      // Sign message
      const signature = await signMessageAsync({ message })
      
      // Verify with backend
      const response = await api.verifyWallet(address, signature, message)
      
      // Store session
      const session = {
        token: response.token,
        tier: response.tier,
        holdings: response.holdings,
        expiresAt: response.expiresAt
      }
      
      setSession(session)
      setIsAuthenticated(true)
      
      // Store in localStorage
      localStorage.setItem('authToken', response.token)
      localStorage.setItem('sessionData', JSON.stringify(session))
      
      return session
    } catch (error) {
      console.error('Authentication failed:', error)
      throw error
    } finally {
      setIsAuthenticating(false)
    }
  }, [address, isConnected, signMessageAsync, setSession, setUser, setIsAuthenticated])

  const logout = useCallback(() => {
    setSession(null)
    setUser(null)
    setIsAuthenticated(false)
    localStorage.removeItem('authToken')
    localStorage.removeItem('sessionData')
  }, [setSession, setUser, setIsAuthenticated])

  const restoreSession = useCallback(() => {
    const token = localStorage.getItem('authToken')
    const sessionData = localStorage.getItem('sessionData')
    
    if (token && sessionData) {
      try {
        const session = JSON.parse(sessionData)
        
        // Check if session is still valid
        if (new Date(session.expiresAt) > new Date()) {
          setSession(session)
          setIsAuthenticated(true)
          return session
        } else {
          // Session expired, clear storage
          logout()
        }
      } catch (error) {
        console.error('Failed to restore session:', error)
        logout()
      }
    }
    
    return null
  }, [setSession, setIsAuthenticated, logout])

  return {
    authenticate,
    logout,
    restoreSession,
    isAuthenticating,
    isConnected,
    address
  }
}