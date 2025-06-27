import axios from 'axios';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Default configuration
const DEFAULT_AGENT_NAME = process.env.DEFAULT_AGENT_ID || 'michael_taolor_x_agent';
const DEFAULT_TIMEOUT = 600000; // 10 minutes
const POLLING_INTERVAL = 5000; // 5 seconds
const INVOCATION_TIMEOUT = 600000; // 10 minutes

// Squad API base URL
const SQUAD_API_BASE_URL = process.env.SQUAD_API_BASE_URL || 'https://api.sqd.io';
const SQUAD_API_KEY = process.env.SQUAD_API_KEY;

// Error checking for API key
if (!SQUAD_API_KEY) {
  console.warn('Warning: SQUAD_API_KEY not set in environment variables. API calls will fail.');
}

/**
 * Process a standard API response
 * @param {any} response - The axios response object
 * @returns {Promise<any>} The processed response data
 */
async function processResponse(response: any) {
  try {
    // For axios, data is already parsed if it's valid JSON
    return response.data;
  } catch (error: any) {
    console.error('Error processing response:', error);
    return { error: 'PROCESSING_ERROR', message: error.message };
  }
}

/**
 * Create a request with timeout
 * @param {string} url - The URL to fetch
 * @param {Object} options - Axios request options
 * @param {number} [timeout=DEFAULT_TIMEOUT] - Timeout in milliseconds
 * @returns {Promise<any>} The axios response
 */
async function fetchWithTimeout(url: string, options: any, timeout = DEFAULT_TIMEOUT) {
  try {
    const response = await axios({
      url,
      ...options,
      timeout
    });
    return response;
  } catch (error: any) {
    if (error.code === 'ECONNABORTED') {
      throw new Error(`Request timeout after ${timeout}ms`);
    }
    throw error;
  }
}

/**
 * Handle API errors based on status codes
 * @param {any} error - The axios error object
 * @throws {Error} Detailed error information
 */
function handleApiErrors(error: any) {
  if (error.response) {
    // The request was made and the server responded with a status code
    // that falls out of the range of 2xx
    const errorData = error.response.data;
    let errorMessage;
    
    if (typeof errorData === 'object') {
      errorMessage = errorData.message || errorData.error || 'Unknown API error';
    } else {
      errorMessage = errorData || `HTTP Error ${error.response.status}`;
    }
    
    const enhancedError = new Error(errorMessage);
    (enhancedError as any).status = error.response.status;
    (enhancedError as any).statusText = error.response.statusText;
    throw enhancedError;
  } else if (error.request) {
    // The request was made but no response was received
    throw new Error(`No response received: ${error.message}`);
  } else {
    // Something happened in setting up the request that triggered an Error
    throw error;
  }
}

/**
 * Invoke the Squad API with a question (without waiting for completion)
 * @param {string} task - The question or task to ask
 * @param {string} [agentName=DEFAULT_AGENT_NAME] - The agent name to use
 * @param {number} [timeout=INVOCATION_TIMEOUT] - Timeout in milliseconds
 * @returns {Promise<any>} The API response with invocation_id
 */
export async function createInvocation(task: string, agentName = DEFAULT_AGENT_NAME, timeout = INVOCATION_TIMEOUT) {
  try {
    if (!SQUAD_API_KEY) {
      throw new Error('SQUAD_API_KEY is not defined in environment variables');
    }
    
    console.log(`Creating invocation with Squad API for task: "${task}"`);
    console.log(`Using agent: ${agentName}`);
    
    const response = await fetchWithTimeout(`${SQUAD_API_BASE_URL}/agents/${agentName}/invoke`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${SQUAD_API_KEY}`
      },
      data: { task }
    }, timeout);
    
    return await processResponse(response);
  } catch (error: any) {
    if (axios.isAxiosError(error)) {
      handleApiErrors(error);
    }
    
    // Enhance error with additional context
    const enhancedError = new Error(`Squad API invocation creation failed: ${error.message}`);
    (enhancedError as any).originalError = error;
    (enhancedError as any).task = task;
    (enhancedError as any).agentName = agentName;
    
    console.error('Error creating Squad API invocation:', enhancedError);
    throw enhancedError;
  }
}

/**
 * Fetch the result of an invocation
 * @param {string} invocationId - The invocation ID to fetch
 * @param {number} [timeout=DEFAULT_TIMEOUT] - Timeout in milliseconds
 * @returns {Promise<any>} The invocation result
 */
export async function fetchInvocation(invocationId: string, timeout = DEFAULT_TIMEOUT) {
  try {
    if (!SQUAD_API_KEY) {
      throw new Error('SQUAD_API_KEY is not defined in environment variables');
    }
    
    const response = await fetchWithTimeout(`${SQUAD_API_BASE_URL}/invocations/${invocationId}`, {
      method: 'GET',
      headers: {
        'accept': 'application/json',
        'Authorization': `Bearer ${SQUAD_API_KEY}`
      }
    }, timeout);
    
    return await processResponse(response);
  } catch (error: any) {
    if (axios.isAxiosError(error)) {
      handleApiErrors(error);
    }
    
    const enhancedError = new Error(`Fetch invocation failed: ${error.message}`);
    (enhancedError as any).originalError = error;
    (enhancedError as any).invocationId = invocationId;
    
    console.error('Error fetching invocation:', enhancedError);
    throw enhancedError;
  }
}

/**
 * Poll for the completion of an invocation without a retry limit
 * @param {string} invocationId - The invocation ID to poll
 * @param {number} [interval=POLLING_INTERVAL] - Polling interval in milliseconds
 * @param {boolean} [useStream=false] - Whether to check stream content during polling
 * @returns {Promise<any>} The final invocation result
 */
export async function pollInvocation(invocationId: string, interval = POLLING_INTERVAL, useStream = false) {
  let attempts = 0;
  const startTime = Date.now();
  
  while (true) {
    attempts++;
    const elapsedSeconds = ((Date.now() - startTime) / 1000).toFixed(2);
    const result = await fetchInvocation(invocationId);
    
    // If the invocation is no longer pending, return the result
    if (result.status !== 'pending') {
      console.log(`Invocation ${invocationId} completed after ${attempts} polling attempts (${elapsedSeconds}s)`);
      return result;
    }
    
    console.log(`Invocation ${invocationId} still pending. Polling attempt ${attempts} (${elapsedSeconds}s elapsed)`);
    
    // Only check stream content if useStream is true
    if (useStream) {
      try {
        console.log("STREAMING")
        const streamResponse = await streamInvocation(invocationId);
        // Process stream data if needed
      } catch (error) {
        // Ignore stream errors during polling
      }
    }
    
    // Wait before polling again
    await new Promise(resolve => setTimeout(resolve, interval));
  }
}

/**
 * Stream the result of an invocation 
 * @param {string} invocationId - The invocation ID to stream
 * @returns {Promise<any>} The stream response 
 */
export async function streamInvocation(invocationId: string) {
  try {
    if (!SQUAD_API_KEY) {
      throw new Error('SQUAD_API_KEY is not defined in environment variables');
    }
    
    console.log(`Getting stream for invocation ${invocationId}...`);
    
    const streamUrl = `${SQUAD_API_BASE_URL}/invocations/${invocationId}/stream`;
    
    const response = await axios({
      method: 'GET',
      url: streamUrl,
      headers: {
        'accept': 'application/json',
        'Authorization': `Bearer ${SQUAD_API_KEY}`
      },
      responseType: 'stream'
    });
    
    return response;
  } catch (error: any) {
    if (axios.isAxiosError(error)) {
      handleApiErrors(error);
    }
    
    const enhancedError = new Error(`Stream invocation failed: ${error.message}`);
    (enhancedError as any).originalError = error;
    (enhancedError as any).invocationId = invocationId;
    
    console.error('Error getting stream:', enhancedError);
    throw enhancedError;
  }
}

/**
 * Invoke the Squad API with a question and wait for the result
 * @param {string} task - The question or task to ask
 * @param {string} [agentName=DEFAULT_AGENT_NAME] - The agent name to use
 * @param {number} [timeout=INVOCATION_TIMEOUT] - Timeout in milliseconds
 * @returns {Promise<any>} The complete API response
 */
export async function invokeSquadAPI(task: string, agentName = DEFAULT_AGENT_NAME, timeout = INVOCATION_TIMEOUT) {
  try {
    console.log(`Making API request to Squad API with task: "${task.substring(0, 100)}..."`);
    console.log(`Using agent: ${agentName}`);
    console.log('NON-STREAMING MODE ACTIVE: Will only use status polling, no streaming');
    
    // First create the invocation
    const data = await createInvocation(task, agentName, timeout);
    
    // If the invocation needs time to complete, poll until it's done
    if (data.invocation_id) {
      console.log('Invocation created with ID:', data.invocation_id);
      
      // Poll until completion but don't use streaming
      let isComplete = false;
      let attempts = 0;
      let result;
      const startTime = Date.now();
      
      while (!isComplete) {
        attempts++;
        const elapsedSeconds = ((Date.now() - startTime) / 1000).toFixed(2);
        console.log(`NON-STREAMING Polling attempt ${attempts} (${elapsedSeconds}s elapsed)`);
        
        // CRITICAL: Only use the fetchInvocation endpoint, NEVER the stream endpoint
        result = await fetchInvocation(data.invocation_id);
        
        // Check if the invocation is complete
        if (result.status === 'success' || result.status === 'error') {
          console.log(`Invocation ${data.invocation_id} completed with status: ${result.status}`);
          isComplete = true;
        } else {
          // Wait before checking again
          await new Promise(resolve => setTimeout(resolve, POLLING_INTERVAL));
        }
      }
      
      // Process the final result
      if (result.status === 'success') {
        // If the response has a message field, use that
        if (result.message && typeof result.message === 'string') {
          result.processedAnswer = result.message;
        }
        // Otherwise, if the answer field exists, use that
        else if (result.answer && typeof result.answer === 'string') {
          result.processedAnswer = result.answer;
        }
        // Or if answer is an object with an answer property
        else if (result.answer && result.answer.answer) {
          result.processedAnswer = result.answer.answer;
        }
        // No valid answer found in response
        else {
          result.processedAnswer = "No response content available from the agent.";
        }
        
        console.log('Final answer received, length:', result.processedAnswer.length);
        if (result.processedAnswer.length > 0) {
          console.log('Preview:', result.processedAnswer.substring(0, 100) + '...');
        }
      } else if (result.status === 'error') {
        // Handle error status
        result.processedAnswer = `Error: ${result.error || 'Unknown error occurred'}`;
        console.error('Invocation error:', result.processedAnswer);
      }
      
      return result;
    }
    
    return data;
  } catch (error: any) {
    // Enhance error with additional context
    const enhancedError = new Error(`Squad API invocation failed: ${error.message}`);
    (enhancedError as any).originalError = error;
    (enhancedError as any).task = task;
    (enhancedError as any).agentName = agentName;
    
    console.error('Error invoking Squad API:', enhancedError);
    throw enhancedError;
  }
}

/**
 * Fetch the list of all available agents from Squad API
 * @param {number} [timeout=DEFAULT_TIMEOUT] - Timeout in milliseconds
 * @returns {Promise<any>} The list of available agents
 */
export async function listAgents(timeout = DEFAULT_TIMEOUT) {
  try {
    if (!SQUAD_API_KEY) {
      throw new Error('SQUAD_API_KEY is not defined in environment variables');
    }
    
    console.log('Fetching list of available agents from Squad API');
    
    const response = await fetchWithTimeout(`${SQUAD_API_BASE_URL}/agents`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${SQUAD_API_KEY}`
      }
    }, timeout);
    
    const agents = await processResponse(response);
    
    // Handle different response structures
    const agentCount = agents.items && Array.isArray(agents.items) ? agents.items.length :
                      (Array.isArray(agents) ? agents.length : 0);
    
    console.log(`Retrieved ${agentCount} agents from Squad API`);
    return agents;
  } catch (error: any) {
    if (axios.isAxiosError(error)) {
      handleApiErrors(error);
    }
    
    const enhancedError = new Error(`Failed to fetch agents list: ${error.message}`);
    (enhancedError as any).originalError = error;
    
    console.error('Error listing agents:', enhancedError);
    throw enhancedError;
  }
}

export default {
  invokeSquadAPI,
  createInvocation,
  fetchInvocation,
  pollInvocation,
  streamInvocation,
  listAgents,
  DEFAULT_AGENT_NAME,
  DEFAULT_TIMEOUT,
  POLLING_INTERVAL,
  INVOCATION_TIMEOUT
};