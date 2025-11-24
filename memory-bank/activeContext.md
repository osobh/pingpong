# Active Context

## Current Focus
**Milestone 1: Two Agents, One Room, One Conversation**

Building the foundation of PingPong with minimal but complete functionality:
- Server that manages a single room with a topic
- Two agent clients that connect via WebSocket
- Basic conversation loop with LLM-generated responses
- Streaming output to terminal
- Graceful lifecycle management

## Recent Changes
- **2025-11-24**: Project kickoff and documentation setup
  - Created comprehensive memory-bank documentation
  - Defined 6-milestone roadmap
  - Established tech stack: Node.js/TypeScript + WebSockets + SQLite + Ollama
  - Confirmed architecture: separate processes for server and agents

## Next Steps
1. [ ] **Set up project structure**
   - Initialize npm package with TypeScript
   - Create server/, agent/, shared/ directories
   - Configure tsconfig.json for proper module resolution
   - Set up Vitest for testing

2. [ ] **Define WebSocket protocol**
   - Create Zod schemas for JOIN, MESSAGE, LEAVE commands
   - Document message format in `.ai/plans/message-protocol.md`
   - Implement shared type definitions

3. [ ] **Build minimal server**
   - WebSocket server setup
   - Room creation with topic
   - Agent connection handling
   - Message broadcasting
   - Basic logging

4. [ ] **Build minimal agent client**
   - CLI with commander.js (args: --role, --name, --model)
   - WebSocket connection to server
   - JOIN command on connect
   - Ollama integration for response generation
   - Display incoming messages

5. [ ] **Implement basic conversation loop**
   - Server seeds conversation with initial question
   - Agent A generates response
   - Agent B receives message, generates response
   - Continue for N exchanges (default: 10)
   - Graceful shutdown

6. [ ] **Add Milestone 1 must-haves**
   - Message timestamps
   - Agent role/name identification in output
   - Conversation length limits (max exchanges or timeout)
   - Graceful shutdown signal handling

7. [ ] **Manual validation**
   - Run server with topic: "Should we use microservices or monolith?"
   - Launch two agents with basic roles
   - Observe 10+ exchanges
   - Verify conversation quality

## Active Decisions

### Model Selection (Deferred)
**Context**: Need to choose which Ollama models to support initially

**Options**:
- Llama 3 8B: Fast, good quality, fits most hardware
- Llama 3 70B: Better reasoning, requires more RAM
- Mixtral 8x7B: Good balance of speed and quality
- Qwen/Phi: Smaller, faster, for testing

**Decision**: Start with Llama 3 8B as default, make model configurable via CLI flag. Will benchmark others in later milestone.

### Database Schema (Pending M2)
**Context**: Need to design SQLite schema for message persistence

**Deferred to**: Milestone 2 (no persistence in M1)

**Note**: M1 conversations are ephemeral - this is acceptable for initial validation

### Web Dashboard (Pending M1+)
**Context**: User wants both CLI and web dashboard

**Decision**: Build CLI output first (M1), add web dashboard after M1 is validated. Web dashboard will be simple HTML/JS that connects to same WebSocket server.

### Agent Relevance Filtering (Pending M4)
**Context**: How do agents decide "should I respond?"

**Deferred to**: Milestone 4 (multi-agent dynamics)

**Note**: In M1-M3, agents respond to all messages (or in round-robin for simplicity)

## Important Patterns

### Separate Process Architecture
- Each agent is an independent CLI process
- Agents can crash/restart without affecting server
- Easier to observe agent behavior (separate terminal windows)
- Mirrors real-world distributed systems

### Local-First Inference
- Agents call Ollama directly for LLM responses
- Server doesn't orchestrate inference (keeps it simple)
- Server just routes messages between agents
- This pattern scales to M6 (agents are autonomous actors)

### Progressive Enhancement
- Each milestone builds on previous
- Don't add features until they're needed
- M1 is intentionally minimal (proves core loop works)
- Resist temptation to "skip ahead"

## Project Insights

### Why Local LLMs Matter
- No API costs or rate limits
- Full control over model and parameters
- Privacy (no data leaves machine)
- Latency is higher but acceptable for discussion use case

### Why Separate Agents Work
- Real-world agent systems will be distributed
- This architecture tests robustness from day one
- Isolation prevents cascading failures
- Easier to reason about agent autonomy

### Why Persistence Comes Second
- M1 proves agents can have meaningful conversations
- If they can't, persistence doesn't matter
- Validates LLM quality before investing in durability
- Simpler to debug without database layer

## Blocked Items
- **None currently**

## Development Environment Notes
- **Node.js**: v18+ required for native fetch API
- **Ollama**: Must be running (`ollama serve`) before starting agents
- **Models**: At least one model must be pulled (`ollama pull llama3`)
- **RAM**: Reserve 8-16GB for Ollama (2 agents × 8GB each)
- **Terminals**: Will need 3+ terminals (server + agents + observation)

## Quick Reference

### Starting Development Session
```bash
# Terminal 1: Start Ollama (if not running as service)
ollama serve

# Terminal 2: Start server
npm run server -- --topic "Your discussion topic"

# Terminal 3: Start Agent 1
npm run agent -- --role architect --name Alex --model llama3

# Terminal 4: Start Agent 2
npm run agent -- --role critic --name Sam --model llama3
```

### Key Files to Create First (M1)
1. `shared/protocol.ts` - WebSocket message schemas
2. `server/index.ts` - Server entry point
3. `agent/index.ts` - Agent CLI entry point
4. `agent/llm.ts` - Ollama integration
5. `server/room.ts` - Room management logic

### Testing Strategy (M1)
- **Unit tests**: Message parsing, protocol validation
- **Integration tests**: Mock WebSocket, test agent/server interaction
- **Manual validation**: Run real agents with real LLMs
- **Success metric**: 10+ quality exchanges between two agents
