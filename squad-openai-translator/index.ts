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

// Middleware
app.use(express.json({ limit: MAX_REQUEST_SIZE }));

// Request ID middleware for tracking
app.use((req, res, next) => {
  req.id = `req-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
  res.setHeader('X-Request-ID', req.id);
  
  // Log request
  console.log(`[${req.id}] ${req.method} ${req.path} - ${req.ip}`);
  
  // Track connection
  activeConnections.set(req.id, { req, res });
  
  // Cleanup on response end
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

// Input validation middleware
function validateChatCompletionRequest(req: express.Request, res: express.Response, next: express.NextFunction) {
  const { messages, model, stream } = req.body;
  
  // Validate messages
  if (!messages) {
    return res.status(400).json({
      error: 'Bad Request',
      message: 'messages field is required',
      request_id: req.id
    });
  }
  
  if (!Array.isArray(messages)) {
    return res.status(400).json({
      error: 'Bad Request',
      message: 'messages must be an array',
      request_id: req.id
    });
  }
  
  if (messages.length === 0) {
    return res.status(400).json({
      error: 'Bad Request',
      message: 'messages array cannot be empty',
      request_id: req.id
    });
  }
  
  // Validate each message
  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];
    if (!msg || typeof msg !== 'object') {
      return res.status(400).json({
        error: 'Bad Request',
        message: `messages[${i}] must be an object`,
        request_id: req.id
      });
    }
    
    if (!msg.role || !['system', 'user', 'assistant'].includes(msg.role)) {
      return res.status(400).json({
        error: 'Bad Request',
        message: `messages[${i}].role must be one of: system, user, assistant`,
        request_id: req.id
      });
    }
    
    if (!msg.content || typeof msg.content !== 'string') {
      return res.status(400).json({
        error: 'Bad Request',
        message: `messages[${i}].content must be a string`,
        request_id: req.id
      });
    }
  }
  
  // Validate optional fields
  if (model && typeof model !== 'string') {
    return res.status(400).json({
      error: 'Bad Request',
      message: 'model must be a string',
      request_id: req.id
    });
  }
  
  if (stream !== undefined && typeof stream !== 'boolean') {
    return res.status(400).json({
      error: 'Bad Request',
      message: 'stream must be a boolean',
      request_id: req.id
    });
  }
  
  next();
}

// Health check endpoint
app.get('/health', (_req, res) => {
  const health = {
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: {
      node_version: process.version,
      squad_api_configured: !!process.env.SQUAD_API_KEY,
      default_agent: DEFAULT_AGENT_ID
    }
  };
  
  res.status(200).json(health);
});

// OpenAI-compatible chat completions endpoint
app.post('/v1/chat/completions', validateChatCompletionRequest, async (req, res) => {
  const requestId = req.id;
  console.log(`[${requestId}] Processing chat completion request`);
  
  try {
    const { messages, stream, model } = req.body;
    
    // Extract agent ID from model parameter or use default
    const agentId = model?.includes('/') ? model.split('/')[1] : DEFAULT_AGENT_ID;
    
    // Convert OpenAI messages to Squad task format
    const task = openaiFormat.formatMessages(messages);
    
    console.log(`[${requestId}] Agent: ${agentId}, Stream: ${stream}, Task length: ${task.length}`);
    
    // Check if this is a title generation request
    const isTitleRequest = messages.some(msg => 
      (msg.role === 'system' && (
        msg.content.includes('generate a title') || 
        msg.content.includes('Write a concise title') ||
        msg.content.includes('Title:')))
    );
    
    if (isTitleRequest) {
      console.log(`[${requestId}] Title generation request detected`);
      
      try {
        const result = await squadApi.invokeSquadAPI(task, agentId);
        const formattedResponse = openaiFormat.formatSquadResponseToOpenAI(result, model);
        
        console.log(`[${requestId}] Title generated successfully`);
        return res.status(200).json(formattedResponse);
      } catch (error: any) {
        console.error(`[${requestId}] Title generation error:`, error.message);
        return res.status(500).json({ 
          error: 'Internal Server Error',
          message: 'Failed to generate title',
          details: error.message,
          request_id: requestId
        });
      }
    }
    
    // Check if streaming is requested
    if (stream === true) {
      // Handle streaming response
      streaming.initializeStreamingResponse(res);
      
      const completionId = `chatcmpl-${requestId}`;
      
      try {
        // Send initial chunk
        streaming.sendInitialChunk(res, completionId, model);
        
        // Setup streaming options
        const streamingOptions = {
          completionId,
          model,
          task,
          agentId,
          res
        };
        
        // Store cleanup function for this connection
        const connection = activeConnections.get(requestId);
        if (connection) {
          console.log(`[${requestId}] Starting real-time streaming`);
          const streamPromise = streaming.handleRealTimeStreaming(streamingOptions);
          
          // Store cleanup function
          connection.cleanup = () => {
            console.log(`[${requestId}] Cleaning up real-time stream`);
            // The streaming module should handle its own cleanup
          };
          
          await streamPromise;
          console.log(`[${requestId}] Streaming completed successfully`);
        }
      } catch (error: any) {
        console.error(`[${requestId}] Streaming error:`, error.message);
        streaming.handleStreamingError(res, completionId, model, error);
      }
    } else {
      // Handle non-streaming response
      console.log(`[${requestId}] Processing non-streaming request`);
      
      try {
        const result = await squadApi.invokeSquadAPI(task, agentId);
        const formattedResponse = openaiFormat.formatSquadResponseToOpenAI(result, model || `squad/${agentId}`);
        
        console.log(`[${requestId}] Non-streaming response sent`);
        return res.status(200).json(formattedResponse);
      } catch (error: any) {
        console.error(`[${requestId}] Non-streaming error:`, error.message);
        return res.status(500).json({ 
          error: 'Internal Server Error',
          message: 'Failed to process request',
          details: error.message,
          request_id: requestId
        });
      }
    }
  } catch (error: any) {
    console.error(`[${requestId}] Unexpected error:`, error);
    
    if (!res.headersSent) {
      res.status(500).json({ 
        error: 'Internal Server Error',
        message: 'An unexpected error occurred',
        details: error.message,
        request_id: requestId
      });
    }
  }
});

// Models endpoint to support OpenAI client libraries
app.get('/v1/models', async (req, res) => {
  const requestId = req.id;
  
  try {
    console.log(`[${requestId}] Fetching available models`);
    
    const agents = await squadApi.listAgents();
    
    // Transform agents data to match OpenAI format
    const agentItems = agents.items && Array.isArray(agents.items) ? agents.items : 
                      (Array.isArray(agents) ? agents : []);
    
    const formattedAgents = agentItems.map(agent => ({
      id: `squad/${agent.name}`,
      object: 'model',
      created: Math.floor(Date.now() / 1000),
      owned_by: 'squad',
      description: agent.readme ? agent.readme.substring(0, 100) + '...' : 'Squad agent',
      capabilities: {
        tools: agent.tools ? agent.tools.map(tool => tool.name) : []
      }
    }));
    
    // Always include the default agent
    const hasDefault = formattedAgents.some(a => a.id === `squad/${DEFAULT_AGENT_ID}`);
    if (!hasDefault) {
      formattedAgents.push({
        id: `squad/${DEFAULT_AGENT_ID}`,
        object: 'model',
        created: Math.floor(Date.now() / 1000),
        owned_by: 'squad',
        description: 'Default Squad agent',
        capabilities: { tools: [] }
      });
    }
    
    console.log(`[${requestId}] Returning ${formattedAgents.length} models`);
    
    res.status(200).json({
      object: 'list',
      data: formattedAgents
    });
  } catch (error: any) {
    console.error(`[${requestId}] Error fetching models:`, error.message);
    
    // Return default agent on error
    res.status(200).json({
      object: 'list',
      data: [{
        id: `squad/${DEFAULT_AGENT_ID}`,
        object: 'model',
        created: Math.floor(Date.now() / 1000),
        owned_by: 'squad',
        description: 'Default Squad agent (fallback)',
        capabilities: { tools: [] }
      }]
    });
  }
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    error: 'Not Found',
    message: `Endpoint ${req.method} ${req.path} not found`,
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
  console.log(`Squad-OpenAI Translator (improved) server listening on port ${port}`);
  console.log(`Default agent ID: ${DEFAULT_AGENT_ID}`);
  console.log(`API Base URL: ${process.env.SQUAD_API_BASE_URL || 'https://api.sqd.io'}`);
  console.log(`Max request size: ${MAX_REQUEST_SIZE}`);
  console.log(`Request timeout: ${REQUEST_TIMEOUT}ms`);
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\nShutting down server...');
  
  // Close all active connections
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
  
  // Force shutdown after 10 seconds
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