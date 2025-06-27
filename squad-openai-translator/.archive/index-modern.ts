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

const DEFAULT_AGENT_ID = process.env.DEFAULT_AGENT_ID || 'michael_taolor_x_agent';

if (!process.env.SQUAD_API_KEY) {
  console.warn('Warning: SQUAD_API_KEY not set in environment variables. API calls will fail.');
}

app.use(express.json());

// Health check endpoint
app.get('/health', (_req, res) => {
  res.status(200).json({ status: 'ok' });
});

// Modern OpenAI Responses API endpoint
app.post('/v1/responses', async (req, res) => {
  try {
    // Extract OpenAI Responses API parameters
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
      reasoning_effort
    } = req.body;

    // Convert input to Squad task format (if needed)
    const task = openaiFormat.formatMessages(Array.isArray(input) ? input : [{ role: 'user', content: input }]);
    const agentId = model?.includes('/') ? model.split('/')[1] : DEFAULT_AGENT_ID;

    // Call Squad API (non-streaming for now)
    const result = await squadApi.invokeSquadAPI(task, agentId);

    // Map Squad API response to OpenAI Responses API output[] format
    const output = [
      {
        id: `msg_${Math.random().toString(36).substring(2, 10)}`,
        type: 'message',
        role: 'assistant',
        content: [
          {
            type: 'output_text',
            text: result.processedAnswer || result.message || result.answer || 'No response content available',
            annotations: []
          }
        ]
      }
    ];

    res.status(200).json({
      id: `resp_${Math.random().toString(36).substring(2, 10)}`,
      object: 'response',
      created_at: Date.now() / 1000,
      model,
      output,
      usage: {
        total_tokens: -1,
        completion_tokens: null,
        prompt_tokens: null
      },
      metadata: {},
      error: null
    });
  } catch (error: any) {
    res.status(500).json({
      error: {
        message: error.message,
        type: 'api_error',
        param: null,
        code: null
      }
    });
  }
});

// Start the server
httpServer.listen(port, () => {
  console.log(`Squad-OpenAI Translator (modern) server listening on port ${port}`);
  console.log(`Default agent ID: ${DEFAULT_AGENT_ID}`);
  console.log(`API Base URL: ${process.env.SQUAD_API_BASE_URL || 'https://api.sqd.io'}`);
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('Shutting down server...');
  httpServer.close(() => {
    console.log('Server shut down');
    process.exit(0);
  });
});
