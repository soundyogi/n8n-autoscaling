import test from 'tape';
import axios from 'axios';
// import "../index.ts"; // Import the main file to start the server
import "../index-modern.ts"; // Import the modern version to ensure both are running

const BASE_URL = 'http://localhost:3001';

test('Health endpoint should return 200 OK status', async (t) => {
  try {
    const response = await axios.get(`${BASE_URL}/health`);
    
    t.equal(response.status, 200, 'Status code should be 200');
    t.equal(response.data.status, 'ok', 'Status should be "ok"');
    t.ok(response.data.timestamp, 'Should have timestamp');
    t.ok(typeof response.data.uptime === 'number', 'Should have uptime as number');
    t.ok(response.data.environment, 'Should have environment info');
    t.equal(response.data.environment.squad_api_configured, true, 'Squad API should be configured');
    t.ok(response.data.environment.default_agent, 'Should have default agent');
  } catch (error) {
    t.error(error, 'No error should be thrown');
  } finally {
    t.end();
  }
});