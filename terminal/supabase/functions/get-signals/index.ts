import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface Session {
  user_id: string
  tier: number
}

async function validateSession(authHeader: string | null, supabase: any): Promise<Session | null> {
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null
  }

  const token = authHeader.replace('Bearer ', '')

  const { data: session, error } = await supabase
    .from('user_sessions')
    .select('user_id, users!inner(tier)')
    .eq('token', token)
    .gt('expires_at', new Date().toISOString())
    .single()

  if (error || !session) {
    return null
  }

  // Update last activity
  await supabase
    .from('user_sessions')
    .update({ last_activity: new Date().toISOString() })
    .eq('token', token)

  return {
    user_id: session.user_id,
    tier: session.users.tier
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const authHeader = req.headers.get('Authorization')
    
    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // Validate session
    const session = await validateSession(authHeader, supabase)
    
    if (!session) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { 
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      )
    }

    // Parse query parameters
    const url = new URL(req.url)
    const limit = parseInt(url.searchParams.get('limit') || '50')
    const offset = parseInt(url.searchParams.get('offset') || '0')

    // Get signals based on user tier
    const now = new Date().toISOString()
    const tierField = `tier${session.tier}_release_at`

    let query = supabase
      .from('signals')
      .select('*')
      .lte(tierField, now)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1)

    const { data: signals, error, count } = await query

    if (error) throw error

    // Track signal views
    if (signals && signals.length > 0) {
      const viewsToInsert = signals.map(signal => ({
        signal_id: signal.id,
        user_id: session.user_id
      }))

      // Insert views (ignore conflicts)
      await supabase
        .from('signal_views')
        .upsert(viewsToInsert, { onConflict: 'signal_id,user_id' })
    }

    // Calculate remaining time until next tier release for each signal
    const enrichedSignals = signals?.map(signal => {
      const nextTierRelease = session.tier < 4 
        ? signal[`tier${session.tier + 1}_release_at`]
        : null

      return {
        ...signal,
        userTier: session.tier,
        nextTierReleaseIn: nextTierRelease 
          ? Math.max(0, new Date(nextTierRelease).getTime() - Date.now())
          : null
      }
    })

    return new Response(
      JSON.stringify({
        signals: enrichedSignals || [],
        pagination: {
          limit,
          offset,
          total: count
        }
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    )
  } catch (error) {
    console.error('Error in get-signals:', error)
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    )
  }
})