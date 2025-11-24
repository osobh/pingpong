# Technical Context

## Technology Stack
- **Language**: TypeScript (Node.js runtime)
- **Server Framework**: Native Node.js with WebSocket support
- **Agent Client**: TypeScript CLI applications (separate processes)
- **WebSocket Library**: `ws` (fast, lightweight, battle-tested)
- **Database**: SQLite via `better-sqlite3` (synchronous, fast, embedded)
- **LLM Integration**: Ollama API client (`ollama-js` or direct HTTP)
- **Testing**:
  - Vitest (fast, TypeScript-native)
  - Real local models for integration tests
  - Response validation + snapshot testing
- **CLI Framework**: Commander.js for arg parsing, Chalk for colors
- **Web Dashboard**: Simple HTML/JS with WebSocket connection (later milestone)

## Development Setup
```bash
# Prerequisites
- Node.js 18+ installed
- Ollama running locally (brew install ollama, then ollama serve)
- At least one model pulled (ollama pull llama3)

# Installation
npm install

# Start server
npm run server -- --topic "Should we use microservices?"

# Start agent (in separate terminal)
npm run agent -- --role architect --name Alex

# Run tests
npm test
```

## Key Dependencies

### Server
- **ws**: WebSocket server implementation
  - Handles agent connections
  - Message broadcasting to room participants
  - Connection lifecycle management

- **better-sqlite3**: Synchronous SQLite bindings
  - Message persistence
  - Room state storage
  - Decision logging
  - Context retrieval for rejoining agents

- **ollama-js** or **node-fetch**: Ollama API client
  - Generate conversation summaries
  - (Agents use Ollama directly, not through server)

### Agent Client
- **ws**: WebSocket client for server connection
- **ollama-js**: Direct LLM inference
  - Agent generates responses locally
  - No server-mediated inference
- **commander**: CLI argument parsing
- **chalk**: Terminal colors for readable output

### Shared
- **zod**: Runtime type validation for messages
  - Schema for WebSocket protocol
  - Ensures type safety across process boundaries

## Technical Constraints

### Local-First Design
- **No cloud dependencies**: All inference runs locally via Ollama
- **Network**: Only localhost WebSocket connections
- **Storage**: Local SQLite database file
- **Latency tolerance**: Local LLM inference is slower than API calls (1-10s per message)

### Context Window Management
- **Model limits**: Most local models have 4k-8k token context windows
- **Context budget**:
  - System prompt: ~500 tokens
  - Summary: ~500-1000 tokens
  - Recent messages (10-15): ~1000-2000 tokens
  - Room for response: ~1500 tokens
- **Strategy**: Summary + sliding window of recent messages

### Resource Management
- **Memory**: Each agent process runs separate LLM instance
  - 7B models: ~6-8GB RAM each
  - 13B models: ~12-16GB RAM each
  - Target: 2-4 agents = 24-64GB RAM total
- **CPU**: LLM inference is CPU-intensive on non-GPU machines
- **Concurrency**: Agents respond sequentially (no parallel inference in M1)

### Testing Challenges
- **Non-determinism**: LLM responses vary even with same prompt
- **Response validation**: Check structure/format, not exact content
- **Snapshot testing**: Record conversation flows, expect similar patterns
- **Speed**: Real model tests are slow (minutes), use selectively

## Development Patterns

### Process Architecture
- **Server**: Single Node.js process
  - WebSocket server
  - SQLite database access
  - Room state management

- **Agents**: Separate Node.js processes (one per agent)
  - Each connects to server via WebSocket
  - Runs own Ollama inference
  - Independent lifecycle (can crash/restart without affecting others)

### Message Flow
1. Agent calls Ollama locally to generate response
2. Agent sends message to server via WebSocket
3. Server stores message in SQLite
4. Server broadcasts message to all connected agents in room
5. Agents evaluate "should I respond?" based on context
6. Relevant agent(s) repeat cycle

### Error Handling
- **Connection failures**: Agent reconnects with exponential backoff
- **LLM errors**: Agent logs error, optionally retries with simpler prompt
- **Server crashes**: Agents detect disconnection, wait for server restart
- **Database errors**: Server logs error, message lost (acceptable for M1)

### Logging & Observability
- **Server logs**: Connection events, message routing, room state changes
- **Agent logs**: Inference requests, response generation, decision logic
- **Database**: Complete message history with timestamps
- **Web dashboard**: Real-time view of active room (M1+)

## Code Organization
```
pingpong/
├── server/
│   ├── index.ts           # Server entry point
│   ├── room.ts            # Room management logic
│   ├── database.ts        # SQLite operations
│   └── websocket.ts       # WebSocket handling
├── agent/
│   ├── index.ts           # Agent CLI entry point
│   ├── client.ts          # WebSocket client logic
│   ├── llm.ts             # Ollama integration
│   └── roles/             # Role-specific prompts/behaviors
│       ├── architect.ts
│       ├── critic.ts
│       ├── pragmatist.ts
│       └── moderator.ts
├── shared/
│   ├── types.ts           # Shared TypeScript types
│   ├── protocol.ts        # WebSocket message schemas (Zod)
│   └── constants.ts       # Shared constants
├── tests/
│   ├── unit/              # Fast, isolated tests
│   └── integration/       # Slower, end-to-end tests with real models
└── memory-bank/           # Project documentation (this file)
```

## Technical Decisions

### Why TypeScript?
- Type safety across server/agent boundary
- Excellent async/await support for WebSocket + LLM calls
- Rich ecosystem for Node.js tooling
- Single language for both server and agents

### Why WebSockets over HTTP/REST?
- Bidirectional: Server can push messages to agents
- Real-time: Low latency for conversation flow
- Stateful: Natural fit for persistent connections
- Simple: Less complex than gRPC for single-machine use case

### Why Separate Agent Processes?
- **Isolation**: Agent crash doesn't take down server or other agents
- **Independence**: Each agent can restart without affecting others
- **Simplicity**: Easier to reason about than threads or workers
- **Observability**: Each agent has own logs and output

### Why SQLite over Postgres/MongoDB?
- **Embedded**: No separate database server
- **Local-first**: Single file, easy to backup/move
- **Performance**: Fast for single-writer, multiple-reader workload
- **Simplicity**: No connection pooling or network issues

### Why Ollama?
- **Standard**: De facto local LLM runtime
- **Model management**: Simple `ollama pull` for any model
- **API**: Clean HTTP API similar to OpenAI
- **Performance**: Optimized inference with llama.cpp
