import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.REACT_APP_SUPABASE_URL!
const supabaseAnonKey = process.env.REACT_APP_SUPABASE_ANON_KEY!

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

export const api = {
  async verifyWallet(walletAddress: string, signature: string, message: string) {
    const response = await fetch(`${supabaseUrl}/functions/v1/verify-wallet`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${supabaseAnonKey}`
      },
      body: JSON.stringify({ walletAddress, signature, message })
    })
    
    if (!response.ok) {
      throw new Error('Failed to verify wallet')
    }
    
    return response.json()
  },

  async getSignals(token: string, limit = 50, offset = 0) {
    const response = await fetch(`${supabaseUrl}/functions/v1/get-signals?limit=${limit}&offset=${offset}`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    })
    
    if (!response.ok) {
      throw new Error('Failed to fetch signals')
    }
    
    return response.json()
  },

  async sendChatMessage(token: string, message: string) {
    const response = await fetch(`${supabaseUrl}/functions/v1/chat-agent`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ message })
    })
    
    if (!response.ok) {
      throw new Error('Failed to send chat message')
    }
    
    return response.json()
  },

  async getChatStatus(token: string, messageId: string) {
    const response = await fetch(`${supabaseUrl}/functions/v1/chat-agent`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ messageId })
    })
    
    if (!response.ok) {
      throw new Error('Failed to get chat status')
    }
    
    return response.json()
  }
}