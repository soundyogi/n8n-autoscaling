import axios from 'axios';
import type { Response } from 'express';
import * as openaiFormat from './openai-format';
import * as squadApi from './squadApi';

interface StreamingOptions {
  completionId: string;
  model: string;
  task: any;
  agentId: string;
  res: Response;
}

/**
 * Logs streaming status with timing information
 */
function logStreamingStatus(message: string, completionId: string, startTime?: number): void {
  const now = Date.now();
  const elapsed = startTime ? `${(now - startTime) / 1000}s` : 'N/A';
  console.log(`[${new Date().toISOString()}] [Stream: ${completionId}] ${message} (Elapsed: ${elapsed})`);
}

/**
 * Handles real-time streaming using Squad's streaming API
 */
export async function handleRealTimeStreaming({ completionId, model, task, agentId, res }: StreamingOptions): Promise<void> {
  const startTime = Date.now();
  logStreamingStatus('REAL STREAMING MODE: Using Squad streaming API', completionId, startTime);
  
  // Create the invocation
  logStreamingStatus('Creating invocation with Squad API', completionId, startTime);
  const invocationData = await squadApi.createInvocation(task, agentId);
  const invocationId = invocationData.invocation_id;
  
  if (!invocationId) {
    logStreamingStatus('Failed to get invocation ID from Squad API', completionId, startTime);
    throw new Error('Failed to get invocation ID from Squad API');
  }
  
  logStreamingStatus(`Starting real streaming for invocation ${invocationId}`, completionId, startTime);
  
  // Stream content with polling
  let streamComplete = false;
  let streamContent = '';
  let pollInterval: NodeJS.Timeout;
  let lastPollTime = startTime;
  let pollCount = 0;
  
  // Get the Squad API base URL
  const squadApiBaseUrl = process.env.SQUAD_API_BASE_URL || 'https://api.sqd.io';
  const squadApiKey = process.env.SQUAD_API_KEY;
  
  const checkStatusAndStream = async () => {
    const currentPollTime = Date.now();
    pollCount++;
    
    // Only log every 5 polls to avoid excessive logging
    if (pollCount % 5 === 0) {
      logStreamingStatus(`Polling invocation status (poll #${pollCount})`, completionId, startTime);
    }
    
    lastPollTime = currentPollTime;
    
    try {
      // Check if the invocation is complete
      const statusResponse = await squadApi.fetchInvocation(invocationId);
      
      if (statusResponse.status === 'success' || statusResponse.status === 'error') {
        if (!streamComplete) {
          streamComplete = true;
          logStreamingStatus(`Invocation complete with status: ${statusResponse.status}`, completionId, startTime);
          
          // If status is success but we haven't received any content yet,
          // send the final answer directly
          if (statusResponse.status === 'success' && !streamContent) {
            let finalAnswer = '';
            
            // Extract answer from various possible locations in the response
            if (statusResponse.message && typeof statusResponse.message === 'string') {
              finalAnswer = statusResponse.message;
            } else if (statusResponse.answer && typeof statusResponse.answer === 'string') {
              finalAnswer = statusResponse.answer;
            } else if (statusResponse.answer && statusResponse.answer.answer) {
              finalAnswer = statusResponse.answer.answer;
            }
            
            if (finalAnswer) {
              logStreamingStatus(`Sending final answer in streaming mode (${finalAnswer.length} chars)`, completionId, startTime);
              const contentChunk = openaiFormat.createContentStreamingChunk(completionId, model, finalAnswer);
              res.write(`data: ${JSON.stringify(contentChunk)}\n\n`);
            }
          }
          
          // Send final chunk
          logStreamingStatus('Sending final streaming chunk', completionId, startTime);
          const finalChunk = openaiFormat.createFinalStreamingChunk(completionId, model, 'stop');
          res.write(`data: ${JSON.stringify(finalChunk)}\n\n`);
          res.write('data: [DONE]\n\n');
          res.end();
          return;
        }
      } else {
        // Try to get stream content for incomplete invocations
        try {
          const streamResponse = await axios({
            method: 'GET',
            url: `${squadApiBaseUrl}/invocations/${invocationId}/stream`,
            headers: {
              'accept': 'application/json',
              'Authorization': `Bearer ${squadApiKey}`
            }
          });
          
          const streamData = streamResponse.data;
          
          if (streamData && streamData.log) {
            const newContent = streamData.log;
            
            // Only send new content if there is any
            if (newContent && newContent !== streamContent) {
              const newPart = newContent.replace(streamContent, '');
              streamContent = newContent;
              
              if (newPart.trim()) {
                logStreamingStatus(`Sending streaming chunk (${newPart.length} chars)`, completionId, startTime);
                const chunk = openaiFormat.createContentStreamingChunk(completionId, model, newPart);
                res.write(`data: ${JSON.stringify(chunk)}\n\n`);
              }
            }
          }
        } catch (error) {
          // Most stream errors are expected
          if (error instanceof Error && !error.message.includes('Stream not available')) {
            logStreamingStatus(`Stream retrieval error: ${error.message}`, completionId, startTime);
          }
        }
      }
    } catch (error) {
      logStreamingStatus(`Error polling for updates: ${error instanceof Error ? error.message : 'Unknown error'}`, completionId, startTime);
      
      if (!streamComplete) {
        streamComplete = true;
        logStreamingStatus('Ending stream due to error', completionId, startTime);
        clearInterval(pollInterval);
        const errorChunk = openaiFormat.createFinalStreamingChunk(completionId, model, 'error');
        res.write(`data: ${JSON.stringify(errorChunk)}\n\n`);
        res.write('data: [DONE]\n\n');
        res.end();
      }
    }
  };
  
  // Start polling
  pollInterval = setInterval(async () => {
    if (streamComplete) {
      clearInterval(pollInterval);
      return;
    }
    await checkStatusAndStream();
  }, 1000); // Poll every second
  
  // Set a timeout
  setTimeout(() => {
    if (!streamComplete) {
      streamComplete = true;
      clearInterval(pollInterval);
      logStreamingStatus('Stream timeout reached, ending stream', completionId, startTime);
      const timeoutChunk = openaiFormat.createFinalStreamingChunk(completionId, model, 'stop');
      res.write(`data: ${JSON.stringify(timeoutChunk)}\n\n`);
      res.write('data: [DONE]\n\n');
      res.end();
    }
  }, 300000); // 5 minute timeout
  
  // Return a cleanup function that can be called on client disconnect
  return Promise.resolve();
}

/**
 * Handles fake streaming by getting a complete response and sending it as a single chunk
 */
export async function handleFakeStreaming({ completionId, model, task, agentId, res }: StreamingOptions): Promise<void> {
  const startTime = Date.now();
  logStreamingStatus('FAKE STREAMING MODE: Will get complete response and send as single chunk', completionId, startTime);
  
  // Get the full response from Squad API (non-streaming)
  logStreamingStatus('Requesting complete response from Squad API', completionId, startTime);
  const result = await squadApi.invokeSquadAPI(task, agentId);
  logStreamingStatus('Received complete response from Squad API', completionId, startTime);
  
  // Extract the content from the response
  let content = '';
  if (result.processedAnswer && typeof result.processedAnswer === 'string') {
    content = result.processedAnswer;
  } else if (result.message && typeof result.message === 'string') {
    content = result.message;
  } else if (result.answer && typeof result.answer === 'string') {
    content = result.answer;
  } else if (result.answer && result.answer.answer) {
    content = result.answer.answer;
  } else {
    content = "No response content available from the agent.";
  }
  
  logStreamingStatus(`Sending complete content as single chunk (${content.length} chars)`, completionId, startTime);
  
  // Send the content as a single chunk
  const contentChunk = openaiFormat.createContentStreamingChunk(completionId, model, content);
  res.write(`data: ${JSON.stringify(contentChunk)}\n\n`);
  
  // Send final chunk
  logStreamingStatus('Sending final streaming chunk', completionId, startTime);
  const finalChunk = openaiFormat.createFinalStreamingChunk(completionId, model, 'stop');
  res.write(`data: ${JSON.stringify(finalChunk)}\n\n`);
  res.write('data: [DONE]\n\n');
  res.end();
  
  logStreamingStatus('Fake streaming completed', completionId, startTime);
  return Promise.resolve();
}

/**
 * Initializes a streaming response with the appropriate headers
 */
export function initializeStreamingResponse(res: Response): void {
  // Set headers for Server-Sent Events
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  console.log('[Streaming] Response headers initialized for Server-Sent Events');
}

/**
 * Sends the initial chunk to start the streaming response
 */
export function sendInitialChunk(res: Response, completionId: string, model: string): void {
  const initialChunk = openaiFormat.createInitialStreamingChunk(completionId, model);
  console.log(`[${new Date().toISOString()}] [Stream: ${completionId}] Sending initial chunk to start streaming`);
  res.write(`data: ${JSON.stringify(initialChunk)}\n\n`);
}

/**
 * Handles an error in streaming mode
 */
export function handleStreamingError(res: Response, completionId: string, model: string, error: Error): void {
  console.error(`[${new Date().toISOString()}] [Stream: ${completionId}] Error in streaming: ${error.message}`);
  
  if (!res.headersSent) {
    console.log(`[${new Date().toISOString()}] [Stream: ${completionId}] Sending error response (headers not yet sent)`);
    res.status(500).json({ 
      error: 'Error processing request', 
      message: error.message
    });
  } else {
    // If headers were already sent, send error in streaming format
    console.log(`[${new Date().toISOString()}] [Stream: ${completionId}] Sending error in streaming format (headers already sent)`);
    const errorChunk = openaiFormat.createContentStreamingChunk(completionId, model, `Error: ${error.message}`);
    res.write(`data: ${JSON.stringify(errorChunk)}\n\n`);
    
    const finalChunk = openaiFormat.createFinalStreamingChunk(completionId, model, 'error');
    res.write(`data: ${JSON.stringify(finalChunk)}\n\n`);
    res.write('data: [DONE]\n\n');
    res.end();
  }
}