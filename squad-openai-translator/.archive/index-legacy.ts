import express from 'express';
import dotenv from 'dotenv';
import { createServer } from 'http';
import * as squadApi from './src/squadApi';
import * as openaiFormat from './src/openai-format';
import * as streaming from './src/streaming';

// Load environment variables from .env file
dotenv.config();

const app = express();
const port = process.env.PORT || 3001; // Default port 3001
const httpServer = createServer(app);

// Squad API configuration
const DEFAULT_AGENT_ID = process.env.DEFAULT_AGENT_ID || 'subnetoracleai';

// Check if API key is available
if (!process.env.SQUAD_API_KEY) {
  console.warn('Warning: SQUAD_API_KEY not set in environment variables. API calls will fail.');
}

// Middleware to parse JSON bodies
app.use(express.json());

// Health check endpoint
app.get('/health', (_req, res) => {
  res.status(200).json({ status: 'ok' });
});

// OpenAI-compatible chat completions endpoint
app.post('/v1/chat/completions', async (req, res) => {
  console.log('Received request on /v1/chat/completions');
  
  try {
    // Extract OpenAI format parameters
    const { messages, stream, model } = req.body;
    
    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({ error: 'Invalid request: messages array required' });
    }
    
    // Extract agent ID from model parameter or use default
    const agentId = model?.includes('/') ? model.split('/')[1] : DEFAULT_AGENT_ID;
    
    // Convert OpenAI messages to Squad task format
    const task = openaiFormat.formatMessages(messages);
    
    console.log(`Processing request for agent ${agentId}, original stream value: ${stream}`);
    
    // Check if this is a title generation request
    const isTitleRequest = messages.some(msg => 
      (msg.role === 'system' && (
        msg.content.includes('generate a title') || 
        msg.content.includes('Write a concise title') ||
        msg.content.includes('Title:')))
    );
    
    if (isTitleRequest) {
      console.log('Detected title generation request, using non-streaming response');
      
      // For title generation, use a direct non-streaming response
      try {
        // Get the full response from Squad API (non-streaming)
        const result = await squadApi.invokeSquadAPI(task, agentId);
        
        // Format the response like OpenAI
        const formattedResponse = openaiFormat.formatSquadResponseToOpenAI(result, model);
        
        console.log('Sending formatted title response');
        return res.status(200).json(formattedResponse);
      } catch (error: any) {
        console.error('Error in title generation:', error);
        return res.status(500).json({ 
          error: 'Error generating title', 
          message: error.message 
        });
      }
    }
    
    // Always use our fake streaming approach to make LibreChat happy
    // Initialize streaming response
    streaming.initializeStreamingResponse(res);
    
    // Generate a unique completion ID
    const completionId = Math.random().toString(36).substring(2, 15);
    
    try {
      // Send initial chunk with role 'assistant'
      streaming.sendInitialChunk(res, completionId, model);
      
      // Setup streaming options
      const streamingOptions = {
        completionId,
        model,
        task,
        agentId,
        res
      };
      
      // Decide whether to use real streaming or fake streaming
      if (stream === true) {
        await streaming.handleRealTimeStreaming(streamingOptions);
        
        // Handle client disconnect
        req.on('close', () => {
          console.log(`Client disconnected from streaming`);
        });
      } else {
        await streaming.handleFakeStreaming(streamingOptions);
      }
    } catch (error: any) {
      streaming.handleStreamingError(res, completionId, model, error);
    }
  } catch (error: any) {
    console.error('General error in chat completions endpoint:', error);
    res.status(500).json({ 
      error: 'Error processing request', 
      message: error.message
    });
  }
});

// Models endpoint to support OpenAI client libraries
app.get('/v1/models', async (_req, res) => {
  try {
    console.log('Fetching models (agents) from Squad API');
    
    // Fetch all available agents from Squad API
    const agents = await squadApi.listAgents();
    
    // Transform agents data to match OpenAI format
    // Check if agents has an items array (from the example response)
    const agentItems = agents.items && Array.isArray(agents.items) ? agents.items : 
                      (Array.isArray(agents) ? agents : []);
    
    const formattedAgents = agentItems.map(agent => ({
      id: `squad/${agent.name}`,
      object: 'model',
      created: Math.floor(Date.now() / 1000),
      owned_by: 'squad',
      // Include additional agent info that might be useful for clients
      description: agent.readme ? agent.readme.substring(0, 100) + '...' : 'Squad agent',
      capabilities: {
        tools: agent.tools ? agent.tools.map(tool => tool.name) : []
      }
    }));
    
    // If no agents were found, include at least the default agent
    if (!formattedAgents.length) {
      formattedAgents.push({
        id: `squad/${DEFAULT_AGENT_ID}`,
        object: 'model',
        created: Math.floor(Date.now() / 1000),
        owned_by: 'squad'
      });
    }
    
    res.status(200).json({
      object: 'list',
      data: formattedAgents
    });
  } catch (error: any) {
    console.error('Error fetching models from Squad API:', error);
    
    // Fallback to default agent in case of error
    res.status(200).json({
      object: 'list',
      data: [
        {
          id: `squad/${DEFAULT_AGENT_ID}`,
          object: 'model',
          created: Math.floor(Date.now() / 1000),
          owned_by: 'squad'
        }
      ]
    });
  }
});

// Start the server
httpServer.listen(port, () => {
  console.log(`Squad-OpenAI Translator server listening on port ${port}`);
  console.log(`Default agent ID: ${DEFAULT_AGENT_ID}`);
  console.log(`API Base URL: ${process.env.SQUAD_API_BASE_URL || 'https://api.sqd.io'}`);
});

// Handle shutdown gracefully
process.on('SIGINT', () => {
  console.log('Shutting down server...');
  httpServer.close(() => {
    console.log('Server shut down');
    process.exit(0);
  });
});