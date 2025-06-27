# Squad OpenAI Translator - Streaming Test Guide

This guide provides manual testing procedures for the streaming functionality of the Squad OpenAI Translator proxy.

## Prerequisites

1. Server running with valid `SQUAD_API_KEY`
2. curl or similar HTTP client installed
3. (Optional) LibreChat instance for real-world testing

## Test Scenarios

### 1. Basic Streaming Test

Test that streaming responses work correctly:

```bash
# Start the server
bun run index-improved.ts

# In another terminal, run:
curl -X POST http://localhost:3001/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "squad/michael_taolor_x_agent",
    "messages": [{"role": "user", "content": "Tell me a short fact about AI"}],
    "stream": true
  }' \
  --no-buffer
```

**Expected Result:**
- Response headers include `Content-Type: text/event-stream`
- Multiple `data:` lines appear gradually
- First chunk contains `{"role":"assistant"}`
- Content chunks appear with `{"content":"..."}`
- Final chunk has `"finish_reason":"stop"`
- Last line is `data: [DONE]`

### 2. Non-Streaming Comparison

Compare streaming vs non-streaming for the same prompt:

```bash
# Non-streaming request
time curl -X POST http://localhost:3001/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "squad/michael_taolor_x_agent",
    "messages": [{"role": "user", "content": "What is 2+2?"}],
    "stream": false
  }'

# Streaming request
time curl -X POST http://localhost:3001/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "squad/michael_taolor_x_agent",
    "messages": [{"role": "user", "content": "What is 2+2?"}],
    "stream": true
  }' \
  --no-buffer
```

**Expected Result:**
- Non-streaming returns complete JSON response
- Streaming returns SSE format with multiple chunks
- Both should contain similar content
- Streaming should start responding faster

### 3. Client Disconnect Test

Test cleanup when client disconnects:

```bash
# Start a streaming request and press Ctrl+C after 2 seconds
curl -X POST http://localhost:3001/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "squad/michael_taolor_x_agent",
    "messages": [{"role": "user", "content": "Explain quantum computing in detail"}],
    "stream": true
  }' \
  --no-buffer

# Press Ctrl+C after seeing some chunks
```

**Expected Result:**
- Server logs should show "Client disconnected"
- No errors in server console
- Server remains responsive to new requests

### 4. Concurrent Streaming Test

Test multiple simultaneous streams:

```bash
# Run these commands in parallel (in different terminals)
for i in {1..5}; do
  curl -X POST http://localhost:3001/v1/chat/completions \
    -H "Content-Type: application/json" \
    -d "{
      \"model\": \"squad/michael_taolor_x_agent\",
      \"messages\": [{\"role\": \"user\", \"content\": \"Tell me fact number $i about space\"}],
      \"stream\": true
    }" \
    --no-buffer &
done
```

**Expected Result:**
- All 5 requests should stream simultaneously
- Each should complete successfully
- Server logs should show different request IDs
- No memory leaks or crashes

### 5. Error Handling Test

Test streaming with invalid agent:

```bash
curl -X POST http://localhost:3001/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "squad/invalid_agent_name",
    "messages": [{"role": "user", "content": "test"}],
    "stream": true
  }' \
  --no-buffer
```

**Expected Result:**
- Should receive error in streaming format
- Error chunk should contain error message
- Stream should end with `"finish_reason":"error"`

### 6. Long Response Test

Test streaming with a prompt that generates a long response:

```bash
curl -X POST http://localhost:3001/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "squad/michael_taolor_x_agent",
    "messages": [{"role": "user", "content": "Write a detailed 500-word essay about the history of computers"}],
    "stream": true
  }' \
  --no-buffer
```

**Expected Result:**
- Content should stream in multiple chunks
- No long pauses between chunks
- Complete response should be coherent when assembled
- Stream completes within reasonable time

### 7. Title Generation Test

Test special handling for title generation:

```bash
curl -X POST http://localhost:3001/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "squad/michael_taolor_x_agent",
    "messages": [
      {"role": "system", "content": "Please generate a title for this conversation"},
      {"role": "user", "content": "How do neural networks work?"}
    ],
    "stream": true
  }'
```

**Expected Result:**
- Should return non-streaming JSON response
- Response should be fast (no streaming overhead)
- Title should be concise and relevant

### 8. LibreChat Integration Test

If you have LibreChat configured:

1. Configure LibreChat to use the proxy:
   - Endpoint: `http://localhost:3001`
   - Model: `squad/michael_taolor_x_agent`

2. Start a conversation and observe:
   - Messages should stream character by character
   - No errors in browser console
   - Conversation history maintained correctly

### 9. Network Interruption Test

Simulate network issues:

```bash
# Start a long streaming request
curl -X POST http://localhost:3001/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "squad/michael_taolor_x_agent",
    "messages": [{"role": "user", "content": "Explain the theory of relativity"}],
    "stream": true
  }' \
  --no-buffer &

# Get the PID
CURL_PID=$!

# Pause the curl process after 2 seconds
sleep 2
kill -STOP $CURL_PID

# Resume after 5 seconds
sleep 5
kill -CONT $CURL_PID
```

**Expected Result:**
- Stream should pause when client is stopped
- Should resume when client continues
- No duplicate content
- Stream completes successfully

### 10. Performance Monitoring

Monitor server performance during streaming:

```bash
# In one terminal, monitor server logs
docker logs -f squad-openai-translator 2>&1 | grep -E "(Stream|Memory|Error)"

# In another terminal, run multiple requests
for i in {1..20}; do
  curl -X POST http://localhost:3001/v1/chat/completions \
    -H "Content-Type: application/json" \
    -d '{
      "model": "squad/michael_taolor_x_agent",
      "messages": [{"role": "user", "content": "Quick test"}],
      "stream": true
    }' \
    --no-buffer > /dev/null 2>&1 &
done

# Monitor system resources
top -p $(pgrep -f "bun.*index")
```

**Expected Result:**
- Memory usage should stabilize
- CPU usage reasonable
- All requests complete
- No memory leaks over time

## Automated Test Suite

Run the automated streaming tests:

```bash
# Run streaming-specific tests
bun test tests/streaming.test.ts

# Run all tests including streaming
bun test
```

## Debugging Tips

1. **Enable verbose logging**: Set `DEBUG=*` environment variable
2. **Check request IDs**: Each request has unique ID in headers and logs
3. **Monitor connections**: Check active connection count in logs
4. **Test with curl**: Use `--verbose` flag for detailed output
5. **Check SSE format**: Use `--raw` flag to see exact bytes

## Common Issues

### Stream Never Completes
- Check Squad API invocation status
- Verify timeout settings
- Look for polling errors in logs

### Chunks Arrive Too Slowly
- Check polling interval configuration
- Verify network latency to Squad API
- Consider adjusting adaptive polling settings

### Memory Leaks
- Monitor active connections count
- Check for cleanup logs on disconnect
- Verify interval/timeout cleanup

### Client Compatibility
- Ensure client supports SSE
- Check for proxy/firewall interference
- Verify Content-Type headers

## Performance Benchmarks

Expected performance metrics:
- First chunk: < 2 seconds
- Polling interval: 1-5 seconds (adaptive)
- Memory per connection: < 1MB
- Concurrent streams: 50+ (depends on server)
- Stream timeout: 5 minutes

## Reporting Issues

When reporting streaming issues, include:
1. Server logs with request IDs
2. Client request/response headers
3. Timing information
4. Error messages
5. Steps to reproduce