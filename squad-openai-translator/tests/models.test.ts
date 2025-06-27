import test from 'tape';
import axios from 'axios';
import "../index.ts"; // Import the main file to start the server

const BASE_URL = 'http://localhost:3001';
const DEFAULT_AGENT_ID = process.env.DEFAULT_AGENT_ID;

test('Models endpoint should return available models', async (t) => {
  try {
    const response = await axios.get(`${BASE_URL}/v1/models`);
    console.log('Response from /v1/models:', response.data); // Log the response for debugging
    
    t.equal(response.status, 200, 'Status code should be 200');
    t.equal(response.data.object, 'list', 'Response object should be "list"');
    t.ok(Array.isArray(response.data.data), 'Response data should be an array');
    t.ok(response.data.data.length > 0, 'Response data should contain at least one model');
    
    // Just checking if any model contains our default agent ID
    const defaultAgentExists = response.data.data.some(model => 
      model.id.includes(DEFAULT_AGENT_ID)
    );
    
    t.ok(defaultAgentExists, `At least one model should include ${DEFAULT_AGENT_ID}`);
    
    const model = response.data.data[0]; // Testing the first returned model
    t.equal(model.object, 'model', 'Model object should be "model"');
    t.equal(model.owned_by, 'squad', 'Model owned_by should be "squad"');
    t.ok(model.created, 'Model created timestamp should exist');
  } catch (error) {
    t.error(error, 'No error should be thrown');
  } finally {
    t.end();
  }
});