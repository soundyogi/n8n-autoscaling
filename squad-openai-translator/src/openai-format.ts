/**
 * OpenAI API format utilities for translating between Squad API and OpenAI API
 */

/**
 * Format messages from OpenAI format to Squad task format
 * @param {Array} messages - OpenAI format messages
 * @returns {string} Formatted task string for Squad API
 */
export function formatMessages(messages: any[]): string {
  let task = '';
  messages.forEach((msg: any) => {
    const role = msg.role || 'user';
    const content = msg.content || '';
    
    if (role === 'system') {
      task += `[System Instruction]: ${content}\n`;
    } else if (role === 'user') {
      task += `${content}\n`;
    } else if (role === 'assistant') {
      task += `[Previous AI Response]: ${content}\n`;
    }
  });
  
  return task.trim();
}

/**
 * Format Squad API response to OpenAI chat completion format (non-streaming)
 * @param {any} result - Squad API response
 * @param {string} model - Model name
 * @returns {any} OpenAI format response
 */
export function formatSquadResponseToOpenAI(result: any, model: string): any {
  // Process the response content
  let responseContent = '';
  
  // Extract answer from various possible locations in the response
  if (result.message && typeof result.message === 'string') {
    responseContent = result.message;
  } else if (result.processedAnswer && typeof result.processedAnswer === 'string') {
    responseContent = result.processedAnswer;
  } else if (result.answer && typeof result.answer === 'string') {
    responseContent = result.answer;
  } else if (result.answer && result.answer.answer) {
    responseContent = result.answer.answer;
  } else {
    responseContent = "No response content available from the agent.";
  }
  
  // Format response like OpenAI
  return {
    id: `chatcmpl-${Math.random().toString(36).substring(2, 15)}`,
    object: 'chat.completion',
    created: Math.floor(Date.now() / 1000),
    model,
    choices: [
      {
        index: 0,
        message: {
          role: 'assistant',
          content: responseContent
        },
        finish_reason: result.status === 'success' ? 'stop' : 'error'
      }
    ],
    usage: {
      prompt_tokens: -1, // We don't have this information
      completion_tokens: -1, // We don't have this information
      total_tokens: -1 // We don't have this information
    }
  };
}

/**
 * Create initial streaming chunk in OpenAI format
 * @param {string} completionId - Unique completion ID
 * @param {string} model - Model name
 * @returns {any} Initial chunk object
 */
export function createInitialStreamingChunk(completionId: string, model: string): any {
  return {
    id: completionId,
    object: 'chat.completion.chunk',
    created: Math.floor(Date.now() / 1000),
    model,
    choices: [
      {
        index: 0,
        delta: { role: 'assistant' },
        finish_reason: null
      }
    ]
  };
}

/**
 * Create content streaming chunk in OpenAI format
 * @param {string} completionId - Unique completion ID
 * @param {string} model - Model name
 * @param {string} content - Content to include in the chunk
 * @returns {any} Content chunk object
 */
export function createContentStreamingChunk(completionId: string, model: string, content: string): any {
  return {
    id: completionId,
    object: 'chat.completion.chunk',
    created: Math.floor(Date.now() / 1000),
    model,
    choices: [
      {
        index: 0,
        delta: { content },
        finish_reason: null
      }
    ]
  };
}

/**
 * Create final streaming chunk in OpenAI format
 * @param {string} completionId - Unique completion ID
 * @param {string} model - Model name
 * @param {string} finishReason - Reason for finishing (stop, error, etc)
 * @returns {any} Final chunk object
 */
export function createFinalStreamingChunk(completionId: string, model: string, finishReason: string = 'stop'): any {
  return {
    id: completionId,
    object: 'chat.completion.chunk',
    created: Math.floor(Date.now() / 1000),
    model,
    choices: [
      {
        index: 0,
        delta: {},
        finish_reason: finishReason
      }
    ]
  };
}

export default {
  formatMessages,
  formatSquadResponseToOpenAI,
  createInitialStreamingChunk,
  createContentStreamingChunk,
  createFinalStreamingChunk
};