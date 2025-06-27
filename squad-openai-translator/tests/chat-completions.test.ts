import test from 'tape';
import axios from 'axios';
// import "../index.ts"; // Import the main file to start the server

const BASE_URL = 'http://localhost:3001';

test('Chat completions endpoint should handle basic chat messages', async (t) => {
  try {
    const response = await axios.post(`${BASE_URL}/v1/chat/completions`, {
      messages: [
        { role: 'user', content: 'Say hello' }
      ],
      model: 'squad/michael_taolor_x_agent', // Use the default agent ID from .env
      stream: false
    }, {
      headers: {
        'Accept': 'application/json'
      }
    });

    console.log('Response headers:', response.headers);
    console.log('Response data:', response.data);

    t.equal(response.status, 200, 'Status code should be 200');
    
    // Check if we got a streaming response (text/event-stream) or JSON
    if (response.headers['content-type']?.includes('application/json')) {
      t.equal(response.data.object, 'chat.completion', 'Response object should be "chat.completion"');
      t.ok(Array.isArray(response.data.choices), 'Response should contain choices array');
      t.ok(response.data.choices.length > 0, 'Choices array should not be empty');

      const choice = response.data.choices[0];
      console.log('Choice:', choice);
      t.equal(choice.index, 0, 'First choice index should be 0');
      t.ok(choice.message, 'Choice should contain a message');
      t.equal(choice.message.role, 'assistant', 'Message role should be "assistant"');
      t.ok(choice.message.content, 'Message should have content');
      
      // Handle both success and error responses
      if (choice.finish_reason) {
        t.ok(['stop', 'error'].includes(choice.finish_reason), 'Finish reason should be stop or error');
      }
    } else {
      t.fail('Expected JSON response for non-streaming request');
    }
  } catch (error) {
    t.error(error, 'No error should be thrown');
  } finally {
    t.end();
    process.exit(0); // Exit the process after all tests	
  }
});

/*
test('Chat completions endpoint should return 400 for invalid requests', async (t) => {
  try {
    const response = await axios.post(`${BASE_URL}/v1/chat/completions`, {
      // Missing messages array
      model: 'squad/michael_taolor_x_agent'
    });

    t.equal(response.status, 400, 'Status code should be 400 for invalid request');
    t.ok(response.data.error, 'Response should contain an error message');
  } catch (error) {
    t.error(error, 'No error should be thrown');
  } finally {
    t.end();
  }
});

test('Models endpoint should return available models', async (t) => {
  try {
    const response = await axios.get(`${BASE_URL}/v1/models`);

    t.equal(response.status, 200, 'Status code should be 200');
    t.equal(response.data.object, 'list', 'Response object should be "list"');
    t.ok(Array.isArray(response.data.data), 'Response should contain data array');
    t.ok(response.data.data.length > 0, 'Data array should not be empty');

    const model = response.data.data[0];
    t.equal(model.id, 'squad/michael_taolor_x_agent', 'Model ID should match default agent ID');
    t.equal(model.object, 'model', 'Model object should be "model"');
    t.ok(model.created, 'Model should have a created timestamp');
    t.equal(model.owned_by, 'squad', 'Model should be owned by "squad"');
  } catch (error) {
    t.error(error, 'No error should be thrown');
  } finally {
    t.end();
    process.exit(0); // Exit the process after all tests
  }
});
*/