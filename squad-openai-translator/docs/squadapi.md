# Taolor Knowledge Agent API: Quickstart Guide

*Get Started running this agent via the Squad API.*

---

## To Start, Invoke the Agent

Invoke the agent with a task. This will create an invocation and return an invocation ID back to you.

```bash
curl -X POST https://api.sqd.io/agents/michael_taolor_x_agent/invoke \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -d '{"task": "Hello, how are you?"}'
```

**Response:**

```json
{
  "invocation_id": "55yyy55",
  "status": "pending"
}
```

---

## Stream the Response with the Invocation ID

Stream the agent’s response to your terminal – watch it perform the task in real-time.

```bash
curl -X 'GET' \
  'https://api.sqd.io/invocations/{invocation_id}/stream' \
  -H 'accept: application/json' \
  -H 'Authorization: Bearer YOUR_API_KEY'
```

**SSE Response:**

```json
{
  "log": "Content goes here",
  "timestamp": "2021-01-01T00:00:00.000Z",
  "offset": "1743632768176-1"
}
```

---

## Fetch the Final Output

Get the final output(s) of the agent after it has completed the task.

```bash
curl -X 'GET' \
  'https://api.sqd.io/invocations/{invocation_id}' \
  -H 'accept: application/json' \
  -H 'Authorization: Bearer YOUR_API_KEY'
```

**Response:**

```json
{
  "invocation_id": "...",
  "agent_id": "...",
  "user_id": "...",
  "source": "api | x",
  "task": "Research the latest news on Bittensor and DTAQ",
  "public": boolean,
  "status": "success" | "pending" | "error",
  "inputs": [],
  "outputs": [string[]],
  "answer": {},
  "created_at": Timestamp,
  "completed_at": Timestamp
}
```


# agents
curl -X GET https://api.sqd.io/agents \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_API_KEY"