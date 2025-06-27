import express from 'express';
import dotenv from 'dotenv';
import { createServer } from 'http';
import * as squadApi from './src/squadApi';
import * as openaiFormat from './src/openai-format';
import * as streaming from './src/streaming';

// Load environment variables from .env file
dotenv.config();

const app = express();
const port = process.env.PORT || 3001;
const httpServer = createServer(app);

// Configuration
const DEFAULT_AGENT_ID = process.env.DEFAULT_AGENT_ID || 'michael_taolor_x_agent';
const MAX_REQUEST_SIZE = process.env.MAX_REQUEST_SIZE || '1mb';
const REQUEST_TIMEOUT = parseInt(process.env.REQUEST_TIMEOUT || '300000'); // 5 minutes

// Track active connections for cleanup
const activeConnections = new Map<string, { req: express.Request; res: express.Response; cleanup?: () => void }>();

// Check if API key is available
if (!process.env.SQUAD_API_KEY) {
  console.error('CRITICAL: SQUAD_API_KEY not set in environment variables. Server will not function properly.');
  process.exit(1);
}

console.log('SQUAD_API_KEY is set, proceeding with server startup.');

// Middleware
app.use(express.json({ limit: MAX_REQUEST_SIZE }));

// Request ID middleware for tracking
app.use((req, res, next) => {
  req.id = `req-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
  res.setHeader('X-Request-ID', req.id);
  
  console.log(`[${req.id}] ${req.method} ${req.path} - ${req.ip}`);
  
  activeConnections.set(req.id, { req, res });
  
  res.on('finish', () => {
    console.log(`[${req.id}] Response sent - ${res.statusCode}`);
    activeConnections.delete(req.id);
  });
  
  res.on('close', () => {
    const connection = activeConnections.get(req.id);
    if (connection?.cleanup) {
      console.log(`[${req.id}] Client disconnected - running cleanup`);
      connection.cleanup();
    }
    activeConnections.delete(req.id);
  });
  
  next();
});

// Request timeout middleware
app.use((req, res, next) => {
  const timeout = setTimeout(() => {
    if (!res.headersSent) {
      console.error(`[${req.id}] Request timeout after ${REQUEST_TIMEOUT}ms`);
      res.status(504).json({
        error: 'Gateway Timeout',
        message: 'Request processing took too long',
        request_id: req.id
      });
    }
  }, REQUEST_TIMEOUT);
  
  res.on('finish', () => clearTimeout(timeout));
  res.on('close', () => clearTimeout(timeout));
  
  next();
});

// Health check endpoint
app.get('/health', (_req, res) => {
  const health = {
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    api: 'responses', // Indicate this is the Responses API version
    environment: {
      node_version: process.version,
      squad_api_configured: !!process.env.SQUAD_API_KEY,
      default_agent: DEFAULT_AGENT_ID
    }
  };
  
  res.status(200).json(health);
});

// Models endpoint (required for compatibility)
app.get('/v1/models', async (req, res) => {
  const requestId = req.id;
  
  try {
    console.log(`[${requestId}] Fetching available models`);
    
    const agents = await squadApi.listAgents();
    
    const agentItems = agents.items && Array.isArray(agents.items) ? agents.items : 
                      (Array.isArray(agents) ? agents : []);
    
    const formattedAgents = agentItems.map(agent => ({
      id: `squad/${agent.name}`,
      object: 'model',
      created: Math.floor(Date.now() / 1000),
      owned_by: 'squad',
      description: agent.readme ? agent.readme.substring(0, 100) + '...' : 'Squad agent',
      capabilities: {
        tools: agent.tools ? agent.tools.map(tool => tool.name) : [],
        responses_api: true // Indicate support for Responses API
      }
    }));
    
    const hasDefault = formattedAgents.some(a => a.id === `squad/${DEFAULT_AGENT_ID}`);
    if (!hasDefault) {
      formattedAgents.push({
        id: `squad/${DEFAULT_AGENT_ID}`,
        object: 'model',
        created: Math.floor(Date.now() / 1000),
        owned_by: 'squad',
        description: 'Default Squad agent',
        capabilities: { tools: [], responses_api: true }
      });
    }
    
    console.log(`[${requestId}] Returning ${formattedAgents.length} models`);
    
    res.status(200).json({
      object: 'list',
      data: formattedAgents
    });
  } catch (error: any) {
    console.error(`[${requestId}] Error fetching models:`, error.message);
    
    res.status(200).json({
      object: 'list',
      data: [{
        id: `squad/${DEFAULT_AGENT_ID}`,
        object: 'model',
        created: Math.floor(Date.now() / 1000),
        owned_by: 'squad',
        description: 'Default Squad agent (fallback)',
        capabilities: { tools: [], responses_api: true }
      }]
    });
  }
});

// Chat Completions endpoint (for backward compatibility)
app.post('/v1/chat/completions', async (req, res) => {
  const requestId = req.id;
  console.log(`[${requestId}] Chat completions request (redirecting to Responses API)`);
  
  // Convert chat completions to responses format
  req.body.input = req.body.messages;
  delete req.body.messages;
  
  // Forward to responses handler
  return handleResponsesEndpoint(req, res);
});

// Modern OpenAI Responses API endpoint
app.post('/v1/responses', handleResponsesEndpoint);

async function handleResponsesEndpoint(req: express.Request, res: express.Response) {
  const requestId = req.id;
  console.log(`[${requestId}] Processing responses API request`);
  
  try {
    const {
      model,
      input,
      tools,
      tool_choice,
      temperature,
      top_p,
      max_completion_tokens,
      truncation,
      metadata,
      previous_response_id,
      reasoning_effort,
      stream
    } = req.body;
    
    // Validate input
    if (!input) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'input field is required',
        request_id: requestId
      });
    }
    
    // Convert input to Squad task format
    const messages = Array.isArray(input) ? input : [{ role: 'user', content: input }];
    const task = openaiFormat.formatMessages(messages);
    const agentId = model?.includes('/') ? model.split('/')[1] : DEFAULT_AGENT_ID;
    
    console.log(`[${requestId}] Agent: ${agentId}, Stream: ${stream}, Task length: ${task.length}`);
    
    // Handle streaming if requested
    if (stream) {
      console.log(`[${requestId}] Starting streaming response`);
      
      // Initialize SSE response
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache, no-transform');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('X-Accel-Buffering', 'no');
      res.write('\n');
      
      const responseId = `resp-${requestId}`;
      
      try {
        // Send initial response event
        const initialEvent = {
          id: responseId,
          object: 'response',
          created_at: Date.now() / 1000,
          model,
          output: [],
          usage: null,
          metadata: metadata || {},
          error: null
        };
        res.write(`data: ${JSON.stringify(initialEvent)}\n\n`);
        
        // Setup streaming to Squad API
        const completionId = `completion-${requestId}`;
        const streamingOptions = {
          completionId,
          model: model || `squad/${DEFAULT_AGENT_ID}`,
          task,
          agentId,
          res: {
            // Wrap response to convert to Responses API format
            write: (data: string) => {
              if (data.startsWith('data: ')) {
                const chunk = data.substring(6);
                if (chunk === '[DONE]\n\n') {
                  res.write('data: [DONE]\n\n');
                } else {
                  try {
                    const parsed = JSON.parse(chunk);
                    if (parsed.choices?.[0]?.delta?.content) {
                      // Convert chat completion chunk to response format
                      const responseChunk = {
                        id: responseId,
                        object: 'response.chunk',
                        created_at: Date.now() / 1000,
                        model,
                        output: [{
                          type: 'message',
                          role: 'assistant',
                          content: [{
                            type: 'output_text',
                            text: parsed.choices[0].delta.content,
                            annotations: []
                          }]
                        }]
                      };
                      res.write(`data: ${JSON.stringify(responseChunk)}\n\n`);
                    }
                  } catch (e) {
                    // Pass through if not JSON
                    res.write(data);
                  }
                }
              } else {
                res.write(data);
              }
            },
            end: () => res.end(),
            on: (event: string, handler: any) => res.on(event, handler),
            headersSent: res.headersSent,
            setHeader: (name: string, value: string) => res.setHeader(name, value)
          } as any
        };
        
        // Store cleanup function
        const connection = activeConnections.get(requestId);
        if (connection) {
          connection.cleanup = () => {
            console.log(`[${requestId}] Cleaning up streaming response`);
          };
        }
        
        await streaming.handleRealTimeStreaming(streamingOptions);
        
      } catch (error: any) {
        console.error(`[${requestId}] Streaming error:`, error.message);
        
        const errorEvent = {
          id: responseId,
          object: 'response',
          created_at: Date.now() / 1000,
          model,
          output: [],
          usage: null,
          metadata: metadata || {},
          error: {
            message: error.message,
            type: 'api_error'
          }
        };
        res.write(`data: ${JSON.stringify(errorEvent)}\n\n`);
        res.write('data: [DONE]\n\n');
        res.end();
      }
      
    } else {
      // Non-streaming response
      console.log(`[${requestId}] Processing non-streaming response`);
      
      const result = await squadApi.invokeSquadAPI(task, agentId);
      
      // Extract content
      let content = '';
      if (result.processedAnswer && typeof result.processedAnswer === 'string') {
        content = result.processedAnswer;
      } else if (result.message && typeof result.message === 'string') {
        content = result.message;
      } else if (result.answer) {
        content = typeof result.answer === 'string' ? result.answer : result.answer.answer;
      } else {
        content = "No response content available from the agent.";
      }
      
      // Format as Responses API output
      const output = [{
        id: `msg_${Math.random().toString(36).substring(2, 10)}`,
        type: 'message',
        role: 'assistant',
        content: [{
          type: 'output_text',
          text: content,
          annotations: []
        }]
      }];
      
      res.status(200).json({
        id: `resp_${Math.random().toString(36).substring(2, 10)}`,
        object: 'response',
        created_at: Date.now() / 1000,
        model: model || `squad/${agentId}`,
        output,
        usage: {
          total_tokens: -1,
          completion_tokens: null,
          prompt_tokens: null
        },
        metadata: metadata || {},
        error: null
      });
    }
  } catch (error: any) {
    console.error(`[${requestId}] Unexpected error:`, error);
    
    res.status(500).json({
      error: {
        message: error.message,
        type: 'api_error',
        param: null,
        code: null
      },
      request_id: requestId
    });
  }
}

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    error: 'Not Found',
    message: `Endpoint ${req.method} ${req.path} not found`,
    supported_endpoints: ['/v1/responses', '/v1/chat/completions', '/v1/models', '/health'],
    request_id: req.id
  });
});

// Global error handler
app.use((err: any, req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(`[${req.id}] Unhandled error:`, err);
  
  if (!res.headersSent) {
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'An unexpected error occurred',
      request_id: req.id
    });
  }
});

// Start the server
httpServer.listen(port, () => {
  console.log(`Squad-OpenAI Translator (modern-improved) server listening on port ${port}`);
  console.log(`API Version: OpenAI Responses API with Chat Completions compatibility`);
  console.log(`Default agent ID: ${DEFAULT_AGENT_ID}`);
  console.log(`API Base URL: ${process.env.SQUAD_API_BASE_URL || 'https://api.sqd.io'}`);
  console.log(`Max request size: ${MAX_REQUEST_SIZE}`);
  console.log(`Request timeout: ${REQUEST_TIMEOUT}ms`);
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\nShutting down server...');
  
  console.log(`Closing ${activeConnections.size} active connections...`);
  activeConnections.forEach((connection, id) => {
    if (connection.cleanup) {
      connection.cleanup();
    }
    if (!connection.res.headersSent) {
      connection.res.status(503).json({
        error: 'Service Unavailable',
        message: 'Server is shutting down',
        request_id: id
      });
    }
  });
  
  httpServer.close(() => {
    console.log('Server shut down gracefully');
    process.exit(0);
  });
  
  setTimeout(() => {
    console.error('Forced shutdown after timeout');
    process.exit(1);
  }, 10000);
});

// Handle uncaught errors
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

// TypeScript augmentation for request ID
declare global {
  namespace Express {
    interface Request {
      id?: string;
    }
  }
}