# Architecture Decision Records (ADRs)

This document records key architectural decisions made during PingPong development.

## Format

Each decision follows this structure:
- **Context**: What problem are we solving?
- **Decision**: What did we decide?
- **Rationale**: Why did we choose this?
- **Consequences**: What are the tradeoffs?
- **Status**: Active, Superseded, or Proposed

---

## ADR-001: Separate Processes for Server and Agents

**Date**: 2025-11-24
**Status**: Active

### Context
Need to decide how to architect the relationship between the server and AI agents. Options:
1. All agents within server process (threads/async)
2. Agents as separate processes
3. Agents as Docker containers
4. Hybrid: server + plugin agents

### Decision
Each agent runs as a separate Node.js process, communicating with server via WebSocket.

### Rationale
- **Isolation**: Agent crash doesn't affect server or other agents
- **Independence**: Agents can restart without disturbing conversation
- **Observability**: Each agent has own terminal output and logs
- **Simplicity**: Easier to reason about than shared memory/threads
- **Real-world fidelity**: Distributed agents are more realistic for production systems

### Consequences
**Positive**:
- Robust failure handling
- Easy to test individual agents
- Natural fit for future distributed deployment

**Negative**:
- More resource overhead (multiple Node processes)
- Slightly higher latency (network hop vs in-process)
- More complex setup (multiple terminals)

**Mitigation**: For local development, overhead is acceptable. Web dashboard (M1+) will simplify observation.

---

## ADR-002: WebSockets Over HTTP for Agent Communication

**Date**: 2025-11-24
**Status**: Active

### Context
Need protocol for real-time agent-server communication. Options:
1. HTTP REST + polling
2. HTTP + Server-Sent Events (SSE)
3. WebSockets
4. gRPC

### Decision
Use WebSockets for bidirectional communication.

### Rationale
- **Bidirectional**: Server can push messages to agents
- **Real-time**: Low latency for conversation flow
- **Stateful**: Natural fit for persistent connections
- **Standard**: Well-supported, mature libraries (ws package)
- **Simple**: Less complex than gRPC for single-machine use case

### Consequences
**Positive**:
- Natural request/response pattern for messaging
- Server can broadcast to all agents efficiently
- Good debugging tools (WebSocket inspector)

**Negative**:
- More complex than HTTP (connection state management)
- Reconnection logic required

**Mitigation**: Agent client handles reconnection with exponential backoff.

---

## ADR-003: Local LLM Inference via Ollama

**Date**: 2025-11-24
**Status**: Active

### Context
Need to choose LLM inference approach. Options:
1. Cloud APIs (OpenAI, Anthropic)
2. Local inference with Ollama
3. Local inference with llama.cpp directly
4. Hybrid (local + cloud fallback)

### Decision
Use Ollama for all local LLM inference.

### Rationale
- **Local-first**: No API costs, no rate limits, full privacy
- **Standard**: De facto local LLM runtime
- **Simple**: `ollama pull <model>` for any model
- **API**: Clean HTTP API similar to OpenAI
- **Performance**: Optimized inference with llama.cpp under the hood

### Consequences
**Positive**:
- Zero operational cost
- Complete control over models and parameters
- No network dependency (beyond localhost)
- Privacy-preserving

**Negative**:
- Higher latency than cloud APIs (1-10s vs 100-500ms)
- Requires powerful hardware (RAM, CPU/GPU)
- Model quality varies (not as good as GPT-4/Claude)

**Mitigation**: Design conversation flow to tolerate latency. Target hardware: 64GB+ RAM for quality models.

---

## ADR-004: Agents Generate Responses Locally (Not Server)

**Date**: 2025-11-24
**Status**: Active

### Context
Where should LLM inference happen?
1. Agents call Ollama themselves
2. Server orchestrates all LLM calls
3. Hybrid: agents for responses, server for summaries

### Decision
Agents call Ollama directly for response generation. Server only uses LLM for summaries (M2+).

### Rationale
- **Simplicity**: Server doesn't need to manage inference
- **Autonomy**: Agents are independent actors
- **Testability**: Easier to test agent behavior in isolation
- **Scalability**: Agents can run on different machines with own Ollama instances

### Consequences
**Positive**:
- Server remains lightweight (just message routing)
- Agent logic is self-contained
- Natural fit for distributed systems

**Negative**:
- Server can't control response quality or timing
- Each agent needs Ollama access

**Mitigation**: For local development, all agents share same Ollama instance (acceptable).

---

## ADR-005: SQLite for Persistence (Not Postgres/MongoDB)

**Date**: 2025-11-24
**Status**: Active (Starting M2)

### Context
Need durable storage for messages and room state. Options:
1. SQLite (embedded)
2. PostgreSQL (client-server)
3. MongoDB (document store)
4. File-based (JSON/CSV)

### Decision
Use SQLite with better-sqlite3 (synchronous bindings).

### Rationale
- **Embedded**: No separate database server
- **Local-first**: Single file, easy to backup/move
- **Performance**: Fast for single-writer, multiple-reader workload
- **Simplicity**: No connection pooling or network issues
- **Synchronous**: Simpler than async (no race conditions)

### Consequences
**Positive**:
- Zero setup (no database server)
- Fast queries for expected scale (thousands of messages)
- Portable (database is just a file)

**Negative**:
- Synchronous operations block event loop briefly
- Not suitable for high-concurrency writes
- Limited to single machine

**Mitigation**: For expected workload (few agents, moderate message rate), performance is excellent.

---

## ADR-006: TypeScript for Both Server and Agents

**Date**: 2025-11-24
**Status**: Active

### Context
Choose language for implementation. Options:
1. TypeScript (Node.js)
2. Python
3. Go
4. Rust

### Decision
TypeScript with Node.js runtime for both server and agents.

### Rationale
- **Type safety**: Shared types across server/agent boundary
- **Async support**: Excellent async/await for WebSocket + LLM calls
- **Ecosystem**: Rich npm packages (ws, ollama, commander, chalk)
- **Single language**: No context switching between server and agents
- **Fast iteration**: Good balance of safety and development speed

### Consequences
**Positive**:
- Catch bugs at compile time with strict types
- Easy to refactor with TypeScript tooling
- Large ecosystem of libraries

**Negative**:
- More verbose than Python
- Runtime errors still possible (despite types)

**Mitigation**: Use Zod for runtime validation at process boundaries.

---

## ADR-007: No Persistence in Milestone 1

**Date**: 2025-11-24
**Status**: Active (M1 only)

### Context
Should M1 include message persistence?

### Decision
M1 conversations are ephemeral (no database).

### Rationale
- **Focus**: Validate that agents can converse meaningfully
- **Simplicity**: Fewer moving parts for initial implementation
- **Risk reduction**: If conversations aren't good, persistence doesn't matter
- **Faster iteration**: Easier to debug without database layer

### Consequences
**Positive**:
- Simpler M1 implementation
- Faster development
- Clear milestone boundary

**Negative**:
- Conversations lost on server restart
- Can't review past discussions

**Mitigation**: M2 adds full persistence. M1 is proof-of-concept only.

---

## ADR-008: Zod for WebSocket Message Validation

**Date**: 2025-11-24
**Status**: Active

### Context
How to ensure type safety for messages crossing process boundaries?

### Decision
Use Zod schemas for runtime validation of all WebSocket messages.

### Rationale
- **Runtime safety**: Catch invalid messages at runtime
- **Type inference**: TypeScript types derived from schemas
- **Self-documenting**: Schema is the spec
- **Easy validation**: `schema.parse()` throws on invalid data

### Consequences
**Positive**:
- Prevents invalid messages from crashing agents
- Single source of truth for message structure
- Great error messages on validation failure

**Negative**:
- Slight performance overhead (validation)
- More verbose than plain TypeScript types

**Mitigation**: Validation overhead is negligible compared to LLM latency.

---

## ADR-009: CLI + Web Dashboard (Dual Interface)

**Date**: 2025-11-24
**Status**: Active (CLI in M1, Web in M1+)

### Context
How should users observe conversations?
1. CLI only (stdout)
2. Web dashboard only
3. Both CLI and web

### Decision
Build CLI first (M1), add web dashboard after M1 validation.

### Rationale
- **CLI advantages**: Simple, immediate feedback, works over SSH
- **Web advantages**: Better visualization, persistent view, easier to share
- **Progressive**: Validate core with CLI before investing in web UI

### Consequences
**Positive**:
- CLI proves concept quickly
- Web adds polish after validation
- Users can choose preferred interface

**Negative**:
- Need to maintain two interfaces

**Mitigation**: Web dashboard will be simple HTML/JS, same WebSocket protocol.

---

## ADR-010: Round-Robin Response Pattern (M1-M3)

**Date**: 2025-11-24
**Status**: Active (M1-M3), Will be superseded by M4

### Context
How do agents decide when to respond?

### Decision
In M1-M3, agents respond to all messages (or simple round-robin).

### Rationale
- **Simplicity**: No complex "should I respond?" logic
- **Guaranteed participation**: Every agent contributes
- **Focus**: Validate conversation quality before adding filtering

### Consequences
**Positive**:
- Simple to implement
- Predictable behavior
- Easy to debug

**Negative**:
- All agents respond to every message (verbose in M4+)
- No natural conversation clustering

**Mitigation**: M4 will add relevance filtering. This is intentionally simple for M1-M3.

**Status update path**: Will be superseded by ADR-011 (Relevance Filtering) in M4.

---

## Future ADRs

### ADR-011: Agent Relevance Filtering (M4)
**Status**: Proposed

Agents will evaluate "should I respond?" based on:
- Message content relevance to role
- Whether question is directed at them (@mention)
- Conversation state (avoid repetition)

### ADR-012: Consensus Detection Mechanisms (M5)
**Status**: Proposed

Server will detect consensus via:
- Explicit [VOTE] markers
- Soft consensus (no objections)
- Moderator-declared decisions

### ADR-013: Conversation Mode System (M6)
**Status**: Proposed

Rooms will support:
- Quick mode: Fast resolution, aggressive timeouts
- Deep mode: Thorough exploration, formal voting
- Agents adapt verbosity based on mode

---

## Decision Review Process

ADRs should be reviewed when:
1. Milestone goals are not being met
2. New requirements emerge
3. Performance/scalability issues arise
4. Better approaches are discovered

To supersede an ADR:
1. Document why the original decision is no longer suitable
2. Create new ADR with updated decision
3. Update old ADR status to "Superseded by ADR-XXX"
4. Implement migration plan if needed
