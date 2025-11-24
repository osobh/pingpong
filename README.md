# PingPong 🏓

Local-first AI agent discussion platform where autonomous agents hold meaningful technical discussions using local LLMs.

Built with strict TDD methodology, PingPong enables multiple AI agents with different roles (architect, critic, pragmatist) to discuss topics, challenge assumptions, and propose solutions in real-time.

## Features

✅ **Multi-Agent Conversations** - Run multiple AI agents simultaneously
✅ **Role-Based Agents** - Architect, Critic, and Pragmatist roles with specialized behaviors
✅ **Real-time Communication** - WebSocket-based server with instant message broadcasting
✅ **Local-First** - Uses local Ollama LLMs, no cloud dependencies
✅ **Comprehensive Testing** - 85 tests covering unit and integration scenarios
✅ **Production Ready** - Race-condition fixes, error handling, graceful shutdown

## Prerequisites

- **Node.js**: v22+ (recommended: v23)
- **Ollama**: Running locally with a model installed
  ```bash
  brew install ollama
  ollama serve
  ollama pull llama3  # or any other model
  ```

## Quick Start

### 1. Install Dependencies

```bash
npm install
```

### 2. Build the Project

```bash
npm run build
```

### 3. Launch PingPong

The easiest way to start is using the launch script:

```bash
./launch.sh
```

This will:
- Check for existing services and prompt to stop them
- Start the WebSocket server on port 8080
- Launch 3 agents (Alice the Architect, Bob the Critic, Charlie the Pragmatist)
- Validate all connections and agent activity
- Display live logs

**Custom Launch Options:**

```bash
# Custom topic
./launch.sh "Should we use GraphQL or REST?"

# Custom number of agents (1-3)
./launch.sh "Your topic here" 2
```

**Environment Variables:**

```bash
# Use a different Ollama host/model
OLLAMA_HOST=http://localhost:11434 \
OLLAMA_MODEL=llama3 \
./launch.sh
```

### 4. Stop PingPong

```bash
./stop.sh
```

This gracefully stops all services:
- Sends SIGTERM to all processes
- Waits for graceful shutdown
- Force kills if needed after timeout
- Cleans up PID files and ports

## Manual Usage

### Start Server

```bash
node dist/server/index.js "Your discussion topic"
```

Server starts on `ws://localhost:8080`

### Start Agents

```bash
# Architect agent
node dist/agent/index.js --id alice-1 --name Alice --role architect

# Critic agent
node dist/agent/index.js --id bob-1 --name Bob --role critic

# Pragmatist agent
node dist/agent/index.js --id charlie-1 --name Charlie --role pragmatist
```

**Agent Options:**

```bash
--id <id>              Unique agent ID (required)
--name <name>          Agent display name (required)
--role <role>          architect, critic, or pragmatist (default: architect)
--server <url>         WebSocket server URL (default: ws://localhost:8080)
--ollama-host <url>    Ollama host (default: http://192.168.1.4:11434)
--ollama-model <model> Model name (default: gpt-oss:20b)
```

## Development

### Running Tests

```bash
# Run all tests
npm test

# Run specific test file
npm test tests/unit/protocol.test.ts

# Run with coverage
npm test:coverage

# Watch mode
npm test -- --watch

# UI mode
npm test:ui
```

**Test Coverage:**
- Protocol validation: 24 tests
- Room management: 12 tests
- Server: 7 tests
- Agent client: 11 tests
- Agent runtime: 10 tests
- Agent LLM: 15 tests
- Integration: 6 tests

**Total: 85 passing tests**

### Type Checking

```bash
npm run typecheck
```

### Building

```bash
npm run build
```

Output goes to `dist/` (gitignored)

## Project Structure

```
pingpong/
├── server/                    # WebSocket server
│   ├── index.ts              # Server entry point
│   └── room.ts               # Room management
├── agent/                     # Agent implementation
│   ├── index.ts              # Agent CLI
│   ├── runtime.ts            # Agent orchestrator
│   ├── client.ts             # WebSocket client
│   └── llm.ts                # Ollama LLM wrapper
├── shared/                    # Shared code
│   ├── protocol.ts           # Message protocol (Zod schemas)
│   └── types.ts              # TypeScript types
├── tests/
│   ├── unit/                 # Unit tests
│   └── integration/          # Integration tests
├── launch.sh                  # Launch script
├── stop.sh                    # Stop script
└── memory-bank/               # Documentation
```

## Architecture

### Communication Flow

```
Agent 1 (Architect) ──┐
                      ├──> WebSocket Server ──> Room ──> Broadcast
Agent 2 (Critic)    ──┤
                      │
Agent 3 (Pragmatist)──┘
```

### Components

**Server (`server/`)**
- WebSocket server on port 8080
- Room manages agents and message broadcasting
- Protocol validation with Zod schemas

**Agent (`agent/`)**
- Runtime orchestrates Client + LLM
- Client handles WebSocket connection and events
- LLM wrapper for Ollama with role-specific prompts

**Shared (`shared/`)**
- Protocol definitions (JOIN, MESSAGE, LEAVE, etc.)
- Type-safe message validation
- Shared TypeScript types

### Agent Roles

**Architect** - Designs high-level system architecture, thinks about scalability and maintainability, proposes structural solutions.

**Critic** - Questions assumptions, identifies risks and edge cases, challenges proposed solutions constructively.

**Pragmatist** - Focuses on practical implementation, balances ideals with constraints, proposes actionable next steps.

## Example Conversation

Topic: "Should we use microservices or monolith?"

**Alice (Architect)**: "Start with a modular monolith using bounded contexts and clear CI/CD pipeline, then progressively extract services only when specific domains hit real scalability or team autonomy thresholds."

**Bob (Critic)**: "The assumption that bounded contexts always map cleanly to later services is risky—internal coupling can creep in, making eventual extraction painful."

**Charlie (Pragmatist)**: "Use explicit domain-driven design, automated tests, and a CI gate that rejects cross-module API changes. Track concrete metrics and define thresholds that trigger extraction."

## Configuration

### Ollama Setup

The default configuration expects Ollama at `http://192.168.1.4:11434` with model `gpt-oss:20b`.

To use different settings:

```bash
# Option 1: Environment variables
export OLLAMA_HOST=http://localhost:11434
export OLLAMA_MODEL=llama3
./launch.sh

# Option 2: CLI flags
node dist/agent/index.js \
  --id alice \
  --name Alice \
  --role architect \
  --ollama-host http://localhost:11434 \
  --ollama-model llama3
```

### Port Configuration

Server uses port 8080 by default. To change:

```bash
PORT=9000 node dist/server/index.js "Your topic"
```

Then connect agents with:

```bash
node dist/agent/index.js \
  --id alice \
  --name Alice \
  --role architect \
  --server ws://localhost:9000
```

## Logs

When using `launch.sh`, logs are stored in `.logs/`:

```bash
# View all logs
tail -f .logs/*.log

# View server logs only
tail -f .logs/server.log

# View specific agent logs
tail -f .logs/agent-alice-1.log
```

## Troubleshooting

### Port Already in Use

```bash
# Check what's using port 8080
lsof -i :8080

# Kill the process
kill -9 $(lsof -t -i :8080)

# Or use the stop script
./stop.sh
```

### Ollama Connection Errors

```bash
# Check Ollama is running
curl http://localhost:11434/api/tags

# Start Ollama
ollama serve

# Verify model is installed
ollama list
```

### Agents Not Sending Messages

- Ensure Ollama is running and model is loaded
- Check `.logs/agent-*.log` for errors
- Verify Ollama host/model configuration
- Try with a smaller, faster model like `llama3:8b`

## Testing Notes

### Integration Tests

Integration tests use real Ollama and can be slower. They validate:
- Multi-agent conversation flow
- Agent joining/leaving dynamics
- Message broadcasting
- Conversation quality

### Skipping Slow Tests

```bash
# Run only unit tests (fast)
npm test tests/unit/

# Skip integration tests
npm test -- --exclude tests/integration/
```

## Contributing

This project was built using strict TDD methodology:
1. Write failing test (RED)
2. Implement minimal code to pass (GREEN)
3. Refactor while keeping tests green (REFACTOR)

When adding features:
- Write tests first
- Keep files under 900 lines
- Use real connections (no mocks) in integration tests
- Validate with manual testing after automated tests pass

## License

MIT

## Status

**Milestone 1: Complete** ✅

- [x] Project setup
- [x] Protocol implementation (Zod validation)
- [x] Server implementation (WebSocket + Room)
- [x] Agent implementation (Client + LLM + Runtime)
- [x] Integration tests (85 passing)
- [x] Manual validation (real multi-agent conversations)
- [x] Launch/stop scripts
- [x] Race condition fixes

**Next**: Milestone 2 - Multi-room support, agent memory, consensus mechanisms
