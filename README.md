# ask-ai-server

Standalone HTTP server that answers natural language questions about data in a Contember project. It introspects the GraphQL schema on startup and uses AI tool-calling to generate and execute queries automatically.

## Setup

```bash
cp .env.sample .env
# Fill in the values (see below)
```

### Environment variables

| Variable | Required | Description | Example |
|----------|----------|-------------|---------|
| `CONTEMBER_CONTENT_API_URL` | Yes | Contember content API URL | `https://host.contember.cloud/content/project/live` |
| `CONTEMBER_TOKEN` | Yes | Bearer token with admin role | `abc123...` |
| `AI_PROVIDER` | No | `google` or `openai` (default: `google`) | `google` |
| `AI_API_KEY` | Yes | API key for the AI provider | `AIza...` |
| `AI_MODEL` | No | Model override (default: `gemini-2.5-flash` for Google, `gpt-4o-mini` for OpenAI) | `gemini-2.5-pro` |
| `PORT` | No | Server port (default: `3000`) | `3000` |

## Run

```bash
npm run dev
```

Or with Docker:

```bash
docker build -t ask-ai-server .
docker run --rm --env-file .env -p 3000:3000 ask-ai-server
```

## API

### Health check

```bash
curl http://localhost:3000/health
```

Returns server status and schema info:

```json
{ "status": "ok", "entities": 142, "enums": 25, "model": "google" }
```

### View condensed schema

```bash
curl http://localhost:3000/schema
```

Returns a text summary of all entities, fields, relations, and enums that the AI sees.

### Ask a question

```bash
curl -X POST http://localhost:3000 \
  -H 'Content-Type: application/json' \
  -d '{"question": "How many products do I have?"}'
```

Returns:

```json
{ "answer": "You have 142 products, 98 of which are visible for sale." }
```

The AI answers in the same language as the question.

## How it works

1. On startup, the server introspects the Contember GraphQL schema and condenses it into a readable format (entity names, fields, relations, enums).
2. When a question arrives, it calls `generateText` from the Vercel AI SDK with a single `executeGraphQL` tool.
3. The LLM reads the condensed schema, generates a GraphQL query, and the tool executes it against the Contember API.
4. If the query fails, the LLM reads the error and retries with a corrected query (up to 5 steps).
5. Once it has the data, the LLM synthesizes a natural language answer.
