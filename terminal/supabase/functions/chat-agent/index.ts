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

    const { message, messageId } = await req.json()

    // Handle different request types
    if (messageId) {
      // Check status of existing message
      const { data: chatMessage, error } = await supabase
        .from('chat_messages')
        .select('*')
        .eq('id', messageId)
        .eq('user_id', session.user_id)
        .single()

      if (error || !chatMessage) {
        return new Response(
          JSON.stringify({ error: 'Message not found' }),
          { 
            status: 404,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          }
        )
      }

      return new Response(
        JSON.stringify({
          messageId: chatMessage.id,
          status: chatMessage.status,
          response: chatMessage.response,
          createdAt: chatMessage.created_at,
          respondedAt: chatMessage.responded_at
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      )
    }

    // Create new chat message
    if (!message || message.trim().length === 0) {
      return new Response(
        JSON.stringify({ error: 'Message is required' }),
        { 
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      )
    }

    // Calculate priority based on tier (higher tier = higher priority)
    const priority = 5 - session.tier

    // Insert chat message
    const { data: chatMessage, error: insertError } = await supabase
      .from('chat_messages')
      .insert({
        user_id: session.user_id,
        message,
        priority,
        status: 'pending'
      })
      .select()
      .single()

    if (insertError) throw insertError

    // Trigger n8n webhook for processing
    const n8nWebhookUrl = Deno.env.get('N8N_CHAT_WEBHOOK_URL')
    if (n8nWebhookUrl) {
      try {
        await fetch(n8nWebhookUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            messageId: chatMessage.id,
            userId: session.user_id,
            message,
            priority,
            tier: session.tier
          })
        })
      } catch (webhookError) {
        console.error('Failed to trigger n8n webhook:', webhookError)
      }
    }

    // Return immediate response
    return new Response(
      JSON.stringify({
        messageId: chatMessage.id,
        status: 'pending',
        estimatedWaitTime: session.tier === 1 ? '< 1 minute' : 
                          session.tier === 2 ? '1-2 minutes' :
                          session.tier === 3 ? '2-5 minutes' : '5-10 minutes'
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    )
  } catch (error) {
    console.error('Error in chat-agent:', error)
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    )
  }
})