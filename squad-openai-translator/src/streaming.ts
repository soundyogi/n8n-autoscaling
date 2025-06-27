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

interface StreamingContext {
  startTime: number;
  pollInterval?: NodeJS.Timeout;
  timeoutHandle?: NodeJS.Timeout;
  isComplete: boolean;
  abortController: AbortController;
  pollCount: number;
  errors: Error[];
}

// Configuration
const INITIAL_POLL_INTERVAL = 1000; // 1 second
const MAX_POLL_INTERVAL = 5000; // 5 seconds
const POLL_BACKOFF_FACTOR = 1.5;
const MAX_STREAM_DURATION = 300000; // 5 minutes
const MAX_CONSECUTIVE_ERRORS = 5;

/**
 * Create a new streaming context
 */
function createStreamingContext(): StreamingContext {
  return {
    startTime: Date.now(),
    isComplete: false,
    abortController: new AbortController(),
    pollCount: 0,
    errors: []
  };
}

/**
 * Calculate adaptive polling interval based on response time and error rate
 */
function calculatePollInterval(context: StreamingContext): number {
  const baseInterval = INITIAL_POLL_INTERVAL;
  
  // Increase interval if we've had recent errors
  const recentErrors = context.errors.filter(e => 
    (Date.now() - (e as any).timestamp) < 10000
  ).length;
  
  if (recentErrors > 0) {
    return Math.min(
      baseInterval * Math.pow(POLL_BACKOFF_FACTOR, recentErrors),
      MAX_POLL_INTERVAL
    );
  }
  
  // Use default interval if no errors
  return baseInterval;
}

/**
 * Log streaming event with context
 */
function logStream(level: 'info' | 'warn' | 'error', message: string, context: StreamingContext, extra?: any): void {
  const elapsed = ((Date.now() - context.startTime) / 1000).toFixed(2);
  const logMessage = `[Stream ${elapsed}s] ${message}`;
  
  if (level === 'error') {
    console.error(logMessage, extra || '');
  } else if (level === 'warn') {
    console.warn(logMessage, extra || '');
  } else {
    console.log(logMessage, extra || '');
  }
}

/**
 * Track error with timestamp for adaptive behavior
 */
function trackError(context: StreamingContext, error: Error): void {
  (error as any).timestamp = Date.now();
  context.errors.push(error);
  
  // Keep only recent errors
  const cutoff = Date.now() - 60000; // 1 minute
  context.errors = context.errors.filter(e => (e as any).timestamp > cutoff);
}

/**
 * Clean up streaming resources
 */
function cleanupStreaming(context: StreamingContext): void {
  if (context.pollInterval) {
    clearInterval(context.pollInterval);
    context.pollInterval = undefined;
  }
  
  if (context.timeoutHandle) {
    clearTimeout(context.timeoutHandle);
    context.timeoutHandle = undefined;
  }
  
  context.abortController.abort();
  context.isComplete = true;
}

/**
 * Send streaming chunk with error handling
 */
function sendChunk(res: Response, chunk: any, context: StreamingContext): boolean {
  try {
    if (!context.isComplete && res.writable) {
      const chunkData = JSON.stringify(chunk);
      res.write(`data: ${chunkData}\n\n`);
      
      // Log chunk details for debugging
      const chunkType = chunk.choices?.[0]?.delta?.role ? 'role' : 
                       chunk.choices?.[0]?.delta?.content !== undefined ? 'content' : 
                       chunk.choices?.[0]?.finish_reason ? 'finish' : 'other';
      const chunkContent = chunk.choices?.[0]?.delta?.content || chunk.choices?.[0]?.delta?.role || chunk.choices?.[0]?.finish_reason || 'N/A';
      
      logStream('info', `Chunk sent [${chunkType}]: ${chunkContent}`, context);
      return true;
    }
    return false;
  } catch (error) {
    logStream('error', 'Failed to send chunk', context, error);
    trackError(context, error as Error);
    return false;
  }
}

/**
 * Complete the stream
 */
function completeStream(res: Response, completionId: string, model: string, context: StreamingContext, reason: string = 'stop'): void {
  if (context.isComplete) {
    return;
  }
  
  logStream('info', `Completing stream with reason: ${reason}`, context);
  
  const finalChunk = openaiFormat.createFinalStreamingChunk(completionId, model, reason);
  sendChunk(res, finalChunk, context);
  
  try {
    res.write('data: [DONE]\n\n');
    logStream('info', 'Chunk sent [done]: [DONE]', context);
    res.end();
  } catch (error) {
    logStream('error', 'Failed to end response', context, error);
  }
  
  cleanupStreaming(context);
}

/**
 * Handles real-time streaming using Squad's streaming API with improved error handling
 */
export async function handleRealTimeStreaming({ completionId, model, task, agentId, res }: StreamingOptions): Promise<void> {
  const context = createStreamingContext();
  
  logStream('info', `Starting real-time streaming for agent ${agentId}`, context);
  
  // Set up timeout
  context.timeoutHandle = setTimeout(() => {
    if (!context.isComplete) {
      logStream('warn', 'Stream timeout reached', context);
      completeStream(res, completionId, model, context, 'timeout');
    }
  }, MAX_STREAM_DURATION);
  
  // Handle client disconnect
  res.on('close', () => {
    if (!context.isComplete) {
      logStream('info', 'Client disconnected', context);
      cleanupStreaming(context);
    }
  });
  
  try {
    // Create the invocation
    logStream('info', 'Creating invocation with Squad API', context);
    console.log(`[STREAMING] About to create invocation with task: "${task}" and agentId: "${agentId}"`);
    const invocationData = await squadApi.createInvocation(task, agentId);
    console.log(`[STREAMING] Invocation data received:`, invocationData);
    const invocationId = invocationData.invocation_id;
    
    if (!invocationId) {
      throw new Error('Failed to get invocation ID from Squad API');
    }
    
    logStream('info', `Invocation created: ${invocationId}`, context);
    console.log(`[STREAMING] Setting up polling for invocation: ${invocationId}`);
    
    let streamContent = '';
    let currentPollInterval = INITIAL_POLL_INTERVAL;
    let consecutiveErrors = 0;
    
    const pollForUpdates = async () => {
      if (context.isComplete) {
        console.log(`[STREAMING] Polling stopped - context is complete`);
        return;
      }
      
      context.pollCount++;
      console.log(`[STREAMING] Poll attempt #${context.pollCount}`);
      
      try {
        // Check invocation status
        const statusResponse = await squadApi.fetchInvocation(invocationId);
        
        if (statusResponse.status === 'success' || statusResponse.status === 'error') {
          logStream('info', `Invocation complete: ${statusResponse.status}`, context);
          
          if (statusResponse.status === 'success') {
            // Extract final answer from the status response
            let finalAnswer = '';
            console.log(`[STREAMING] Status response structure:`, JSON.stringify(statusResponse, null, 2));
            
            if (statusResponse.message && typeof statusResponse.message === 'string') {
              finalAnswer = statusResponse.message;
            } else if (statusResponse.answer) {
              finalAnswer = typeof statusResponse.answer === 'string' ? 
                statusResponse.answer : 
                (statusResponse.answer.answer || JSON.stringify(statusResponse.answer));
            } else if (statusResponse.result) {
              // Handle result field
              finalAnswer = typeof statusResponse.result === 'string' ? 
                statusResponse.result : JSON.stringify(statusResponse.result);
            } else {
              // Fallback: try to extract from any field that might contain the answer
              for (const [key, value] of Object.entries(statusResponse)) {
                if (value && typeof value === 'string' && value.length > 0 && key !== 'status') {
                  finalAnswer = value;
                  break;
                } else if (value && typeof value === 'object' && value !== null) {
                  finalAnswer = JSON.stringify(value);
                  break;
                }
              }
            }
            
            console.log(`[STREAMING] Final answer extracted:`, finalAnswer?.substring(0, 100));
            
            // Send the complete final answer if we haven't sent any meaningful content yet
            if (finalAnswer && (!streamContent || streamContent.trim() === '')) {
              console.log(`[STREAMING] Sending complete final answer as content chunk`);
              const chunk = openaiFormat.createContentStreamingChunk(completionId, model, finalAnswer);
              sendChunk(res, chunk, context);
            } else if (finalAnswer && finalAnswer !== streamContent) {
              // Send any remaining content
              const newContent = finalAnswer.substring(streamContent.length);
              if (newContent) {
                console.log(`[STREAMING] Sending remaining content:`, newContent.substring(0, 100));
                const chunk = openaiFormat.createContentStreamingChunk(completionId, model, newContent);
                sendChunk(res, chunk, context);
              }
            }
          }
          
          completeStream(res, completionId, model, context, 
            statusResponse.status === 'success' ? 'stop' : 'error');
          return;
        }
        
        // Try to get stream content from both stream endpoint and status response
        let hasNewContent = false;

        // First try the stream endpoint for real-time content
        try {
          const squadApiBaseUrl = process.env.SQUAD_API_BASE_URL || 'https://api.sqd.io';
          const squadApiKey = process.env.SQUAD_API_KEY;
          
          // Use streaming response type to get real-time SSE data
          const streamResponse = await axios({
            method: 'GET',
            url: `${squadApiBaseUrl}/invocations/${invocationId}/stream`,
            headers: {
              'accept': 'text/event-stream',  // Changed to SSE format
              'Authorization': `Bearer ${squadApiKey}`
            },
            responseType: 'stream',  // Important: stream response type
            signal: context.abortController.signal
          });
          
          // Process the SSE stream
          let buffer = '';
          let lastOffset = '';
          
          streamResponse.data.on('data', (chunk: Buffer) => {
            buffer += chunk.toString();
            const lines = buffer.split('\n');
            
            // Keep the last incomplete line in buffer
            buffer = lines.pop() || '';
            
            for (const line of lines) {
              if (line.startsWith('data: ')) {
                try {
                  const jsonStr = line.substring(6);
                  const parsed = JSON.parse(jsonStr);
                  
                  if (parsed.log) {
                    const logEntry = parsed.log;
                    
                    // Check if this is new content (using offset if available)
                    if (parsed.offset && parsed.offset !== lastOffset) {
                      lastOffset = parsed.offset;
                      
                      // Filter out specific messages
                      if (logEntry.includes('Queued agent call') ||
                          logEntry.includes('Caution:') ||
                          logEntry.includes('Attempting to upload') ||
                          logEntry.includes('__INVOCATION_FINISHED__')) {
                        // Silently filter out noise - no logging needed
                      } else {
                        // Only send if this exact content hasn't been sent before
                        if (!streamContent.includes(logEntry)) {
                          const chunk = openaiFormat.createContentStreamingChunk(completionId, model, logEntry);
                          sendChunk(res, chunk, context);
                          streamContent += logEntry;
                          hasNewContent = true;
                          console.log(`[STREAMING] Sent NEW real-time update: ${logEntry.length} chars`);
                          console.log(logEntry)
                        }
                        // Silently skip duplicates - no logging needed
                      }
                    }
                  }
                } catch (e) {
                  console.log(`[STREAMING] Failed to parse SSE data: ${e.message}`);
                }
              }
            }
          });
          
          streamResponse.data.on('end', () => {
            // SSE stream ended - no logging needed for normal operation
          });
          
          streamResponse.data.on('error', (error: any) => {
            console.log(`[STREAMING] SSE stream error: ${error.message}`);
          });
          
          // Give the stream some time to process
          await new Promise(resolve => setTimeout(resolve, 100));
          
        } catch (streamError: any) {
          // This is now expected if stream is not ready yet
          if (!streamError.message?.includes('Stream not available')) {
            console.log(`[STREAMING] Stream fetch error: ${streamError.message}`);
          }
        }

        // Also check for progressive content in the status response
        if (!hasNewContent && statusResponse.message) {
          let currentContent = '';
          if (typeof statusResponse.message === 'string') {
            currentContent = statusResponse.message;
          } else if (statusResponse.answer) {
            currentContent = typeof statusResponse.answer === 'string' ? 
              statusResponse.answer : statusResponse.answer.answer;
          }
          
          console.log(`[STREAMING] Checking status response for content - current: ${streamContent.length}, status: ${currentContent.length}`);
          
          // If we have new content that wasn't streamed yet
          if (currentContent && currentContent !== streamContent && currentContent.length > streamContent.length) {
            const newContent = currentContent.substring(streamContent.length);
            if (newContent.trim()) {
              console.log(`[STREAMING] Found new content in status response (${newContent.length} chars):`, newContent.substring(0, 100));
              streamContent = currentContent;
              const chunk = openaiFormat.createContentStreamingChunk(completionId, model, newContent);
              sendChunk(res, chunk, context);
              consecutiveErrors = 0;
            }
          }
        }
        
        // Calculate next poll interval
        currentPollInterval = calculatePollInterval(context);
        
      } catch (error: any) {
        consecutiveErrors++;
        trackError(context, error);
        
        logStream('error', `Poll error (${consecutiveErrors}/${MAX_CONSECUTIVE_ERRORS}): ${error.message}`, context);
        
        if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
          logStream('error', 'Max consecutive errors reached', context);
          completeStream(res, completionId, model, context, 'error');
          return;
        }
        
        // Increase poll interval on error
        currentPollInterval = Math.min(currentPollInterval * POLL_BACKOFF_FACTOR, MAX_POLL_INTERVAL);
      }
      
      // Schedule next poll if not complete
      if (!context.isComplete) {
        setTimeout(pollForUpdates, currentPollInterval);
      }
    };
    
    // Start polling
    console.log(`[STREAMING] Starting polling with interval: ${currentPollInterval}ms`);
    setTimeout(pollForUpdates, currentPollInterval);
    
  } catch (error: any) {
    logStream('error', `Fatal error in handleRealTimeStreaming: ${error.message}`, context);
    console.error('Full error details:', error);
    
    // Send error content in streaming format before completing
    const errorContent = `Error: ${error.message}`;
    const errorChunk = openaiFormat.createContentStreamingChunk(completionId, model, errorContent);
    sendChunk(res, errorChunk, context);
    
    completeStream(res, completionId, model, context, 'error');
    // Don't throw error - let the stream complete gracefully
  }
}

/**
 * Handles fake streaming with improved error handling
 */
export async function handleFakeStreaming({ completionId, model, task, agentId, res }: StreamingOptions): Promise<void> {
  const context = createStreamingContext();
  
  logStream('info', `Starting fake streaming for agent ${agentId}`, context);
  
  // Handle client disconnect
  res.on('close', () => {
    if (!context.isComplete) {
      logStream('info', 'Client disconnected', context);
      cleanupStreaming(context);
    }
  });
  
  try {
    // Get the full response
    const result = await squadApi.invokeSquadAPI(task, agentId);
    
    if (context.isComplete) {
      return; // Client disconnected
    }
    
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
    
    logStream('info', `Sending content (${content.length} chars)`, context);
    
    // Send content in chunks for better UX
    const chunkSize = 100; // Characters per chunk
    const chunks = [];
    
    for (let i = 0; i < content.length; i += chunkSize) {
      chunks.push(content.substring(i, i + chunkSize));
    }
    
    // Send chunks with small delays
    for (const chunk of chunks) {
      if (context.isComplete) break;
      
      const contentChunk = openaiFormat.createContentStreamingChunk(completionId, model, chunk);
      sendChunk(res, contentChunk, context);
      
      // Small delay between chunks for streaming effect
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    
    completeStream(res, completionId, model, context, 'stop');
    
  } catch (error: any) {
    logStream('error', `Error in fake streaming: ${error.message}`, context);
    completeStream(res, completionId, model, context, 'error');
    throw error;
  }
}

/**
 * Initialize streaming response headers
 */
export function initializeStreamingResponse(res: Response): void {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no'); // Disable Nginx buffering
  
  // Send initial newline to establish connection
  res.write('\n');
}

/**
 * Send initial streaming chunk
 */
export function sendInitialChunk(res: Response, completionId: string, model: string): void {
  const initialChunk = openaiFormat.createInitialStreamingChunk(completionId, model);
  res.write(`data: ${JSON.stringify(initialChunk)}\n\n`);
}

/**
 * Handle streaming error
 */
export function handleStreamingError(res: Response, completionId: string, model: string, error: Error): void {
  if (!res.headersSent) {
    res.status(500).json({ 
      error: 'Streaming Error',
      message: error.message
    });
  } else {
    // Send error in streaming format
    const errorChunk = openaiFormat.createContentStreamingChunk(
      completionId, 
      model, 
      `\n\n[Error: ${error.message}]`
    );
    res.write(`data: ${JSON.stringify(errorChunk)}\n\n`);
    
    const finalChunk = openaiFormat.createFinalStreamingChunk(completionId, model, 'error');
    res.write(`data: ${JSON.stringify(finalChunk)}\n\n`);
    res.write('data: [DONE]\n\n');
    
    try {
      res.end();
    } catch (e) {
      console.error('Failed to end error response:', e);
    }
  }
}