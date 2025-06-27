import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { ethers } from 'https://esm.sh/ethers@6'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface WalletHoldings {
  wallets: {
    [address: string]: {
      holdings: number
      tier: number
      lastUpdated: string
    }
  }
  tierThresholds: {
    tier1: number
    tier2: number
    tier3: number
    tier4: number
  }
}

async function getWalletHoldings(walletAddress: string): Promise<number> {
  try {
    // In production, this would fetch from your holdings API
    const response = await fetch(Deno.env.get('HOLDINGS_API_URL') || 'https://your-api.com/holdings.json', {
      headers: {
        'Authorization': `Bearer ${Deno.env.get('HOLDINGS_API_KEY')}`
      }
    })
    
    const data: WalletHoldings = await response.json()
    const wallet = data.wallets[walletAddress]
    
    return wallet?.holdings || 0
  } catch (error) {
    console.error('Error fetching holdings:', error)
    return 0
  }
}

function calculateTier(holdings: number): number {
  if (holdings >= 10000) return 1
  if (holdings >= 1000) return 2
  if (holdings >= 100) return 3
  return 4
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { walletAddress, signature, message } = await req.json()

    // Verify the signature
    const recoveredAddress = ethers.verifyMessage(message, signature)
    
    if (recoveredAddress.toLowerCase() !== walletAddress.toLowerCase()) {
      return new Response(
        JSON.stringify({ error: 'Invalid signature' }),
        { 
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      )
    }

    // Verify message is recent (within 5 minutes)
    const messageTimestamp = parseInt(message.split(':').pop() || '0')
    const now = Date.now()
    if (now - messageTimestamp > 5 * 60 * 1000) {
      return new Response(
        JSON.stringify({ error: 'Signature expired' }),
        { 
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      )
    }

    // Get wallet holdings and calculate tier
    const holdings = await getWalletHoldings(walletAddress)
    const tier = calculateTier(holdings)

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // Upsert user
    const { data: user, error: userError } = await supabase
      .from('users')
      .upsert({
        wallet_address: walletAddress.toLowerCase(),
        tier,
        holdings,
        last_seen: new Date().toISOString()
      }, {
        onConflict: 'wallet_address'
      })
      .select()
      .single()

    if (userError) throw userError

    // Create session
    const sessionToken = crypto.randomUUID()
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000) // 24 hours

    const { error: sessionError } = await supabase
      .from('user_sessions')
      .insert({
        user_id: user.id,
        token: sessionToken,
        expires_at: expiresAt.toISOString()
      })

    if (sessionError) throw sessionError

    return new Response(
      JSON.stringify({
        token: sessionToken,
        tier,
        holdings,
        expiresAt: expiresAt.toISOString()
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    )
  } catch (error) {
    console.error('Error in verify-wallet:', error)
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    )
  }
})