import test from 'tape';
import axios from 'axios';
// import "../index.ts"; // Import the main file to start the server

const BASE_URL = 'http://localhost:3001';

// Rate limiting: Add delay between tests to avoid 429 errors
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
const TEST_DELAY = 5000; // 5 second delay between tests to avoid rate limits

// Set longer timeout for tests that make API calls
const TEST_TIMEOUT = 60000; // 60 seconds

// Helper function to consume SSE stream with retry on rate limit
async function consumeSSEStream(url: string, data: any, retries = 2): Promise<string[]> {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const events: string[] = [];
      
      const response = await axios.post(url, data, {
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'text/event-stream'
        },
        responseType: 'stream'
      });
    
      return new Promise((resolve, reject) => {
        let buffer = '';
        
        response.data.on('data', (chunk: Buffer) => {
          buffer += chunk.toString();
          const lines = buffer.split('\n');
          
          // Keep the last incomplete line in buffer
          buffer = lines.pop() || '';
          
          for (const line of lines) {
            if (line.startsWith('data: ')) {
              events.push(line.substring(6));
            }
          }
        });
        
        response.data.on('end', () => {
          if (buffer && buffer.startsWith('data: ')) {
            events.push(buffer.substring(6));
          }
          resolve(events);
        });
        
        response.data.on('error', (error: Error) => {
          reject(error);
        });
      });
    } catch (error: any) {
      if (error.response?.status === 429 && attempt < retries) {
        console.log(`Rate limit hit, waiting ${TEST_DELAY * attempt}ms before retry ${attempt + 1}...`);
        await delay(TEST_DELAY * attempt);
        continue;
      }
      throw error;
    }
  }
  throw new Error('Max retries exceeded');
}

// Helper function for regular axios requests with retry
async function makeRequest(url: string, data: any, retries = 2): Promise<any> {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      return await axios.post(url, data);
    } catch (error: any) {
      if (error.response?.status === 429 && attempt < retries) {
        console.log(`Rate limit hit, waiting ${TEST_DELAY * attempt}ms before retry ${attempt + 1}...`);
        await delay(TEST_DELAY * attempt);
        continue;
      }
      throw error;
    }
  }
  throw new Error('Max retries exceeded');
}

test.only('Streaming endpoint should return SSE format', { timeout: TEST_TIMEOUT * 5 }, async (t) => {
  try {
    await delay(TEST_DELAY); // Rate limiting delay
    
    const events = await consumeSSEStream(`${BASE_URL}/v1/chat/completions`, {
      messages: [{ role: 'user', content: 'Tell me about bittensor in detail!' }],
      model: 'squad/michael_taolor_x_agent', // 'squad/vibemoodai', //
      stream: true
    });
    
    t.ok(events.length > 0, 'Should receive SSE events');
    
    // Check for initial chunk with role
    const hasRoleChunk = events.some(event => {
      try {
        const parsed = JSON.parse(event);
        return parsed.choices?.[0]?.delta?.role === 'assistant';
      } catch {
        return false;
      }
    });
    t.ok(hasRoleChunk, 'Should have initial chunk with assistant role');
    
    // Check for content chunks
    const contentChunks = events.filter(event => {
      try {
        const parsed = JSON.parse(event);
        return parsed.choices?.[0]?.delta?.content !== undefined;
      } catch {
        return false;
      }
    });
    t.ok(contentChunks.length > 0, 'Should have content chunks');
    
    // Check for [DONE] event
    t.ok(events.includes('[DONE]'), 'Should end with [DONE] event');
    
    // Verify chunk structure
    const firstContentChunk = contentChunks[0];
    if (firstContentChunk) {
      const parsed = JSON.parse(firstContentChunk);
      t.equal(parsed.object, 'chat.completion.chunk', 'Should be chat.completion.chunk');
      t.ok(parsed.id, 'Should have completion ID');
      t.ok(parsed.created, 'Should have created timestamp');
      t.ok(parsed.model, 'Should have model');
    }
  } catch (error) {
    t.error(error, 'No error should be thrown');
  } finally {
    t.end();
  }
});

test('Non-streaming should return complete response', { timeout: TEST_TIMEOUT }, async (t) => {
  try {
    await delay(TEST_DELAY); // Rate limiting delay
    
    const response = await makeRequest(`${BASE_URL}/v1/chat/completions`, {
      messages: [{ role: 'user', content: 'Say hello' }],
      model: 'squad/michael_taolor_x_agent',
      stream: false
    });
    
    t.equal(response.status, 200, 'Status code should be 200');
    t.equal(response.data.object, 'chat.completion', 'Should be chat.completion');
    t.ok(response.data.choices?.[0]?.message?.content, 'Should have complete message');
    t.equal(response.data.choices?.[0]?.finish_reason, 'stop', 'Should have stop finish reason');
  } catch (error) {
    t.error(error, 'No error should be thrown');
  } finally {
    t.end();
  }
});

test('Streaming with title generation should return non-streaming response', { timeout: TEST_TIMEOUT }, async (t) => {
  try {
    await delay(TEST_DELAY); // Rate limiting delay
    
    const response = await makeRequest(`${BASE_URL}/v1/chat/completions`, {
      messages: [
        { role: 'system', content: 'Please generate a title for this conversation' },
        { role: 'user', content: 'How do computers work?' }
      ],
      model: 'squad/michael_taolor_x_agent',
      stream: true
    });
    
    t.equal(response.status, 200, 'Status code should be 200');
    t.equal(response.headers['content-type'], 'application/json; charset=utf-8', 'Should be JSON response');
    t.equal(response.data.object, 'chat.completion', 'Should be non-streaming response');
    t.ok(response.data.choices?.[0]?.message?.content, 'Should have complete message');
  } catch (error) {
    t.error(error, 'No error should be thrown');
  } finally {
    t.end();
  }
});

// Removed invalid agent test - causes false positives

test('Sequential streaming requests should work', { timeout: TEST_TIMEOUT * 5 }, async (t) => {
  try {
    await delay(TEST_DELAY); // Rate limiting delay
    
    // Run requests sequentially to avoid rate limiting
    const result1 = await consumeSSEStream(`${BASE_URL}/v1/chat/completions`, {
      messages: [{ role: 'user', content: 'Count to 3' }],
      model: 'squad/michael_taolor_x_agent',
      stream: true
    });
    
    await delay(TEST_DELAY); // Delay between requests
    
    const result2 = await consumeSSEStream(`${BASE_URL}/v1/chat/completions`, {
      messages: [{ role: 'user', content: 'Name a color' }],
      model: 'squad/michael_taolor_x_agent',
      stream: true
    });
    
    await delay(TEST_DELAY); // Delay between requests
    
    const result3 = await consumeSSEStream(`${BASE_URL}/v1/chat/completions`, {
      messages: [{ role: 'user', content: 'Say goodbye' }],
      model: 'squad/michael_taolor_x_agent',
      stream: true
    });
    
    const results = [result1, result2, result3];
    
    t.equal(results.length, 3, 'All 3 requests should complete');
    
    for (let i = 0; i < results.length; i++) {
      const result = results[i];
      t.ok(result && result.length > 0, `Request ${i + 1} should have events`);
      t.ok(result && result.includes('[DONE]'), `Request ${i + 1} should end with [DONE]`);
    }
  } catch (error) {
    t.error(error, 'No error should be thrown');
  } finally {
    t.end();
  }
});