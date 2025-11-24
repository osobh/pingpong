# System Patterns

## Architecture Overview
PingPong uses a **client-server architecture with WebSocket communication** for real-time agent collaboration:

```
┌─────────────────────────────────────────────────────┐
│                   PingPong Server                    │
│  ┌──────────────┐  ┌──────────────┐  ┌───────────┐ │
│  │  WebSocket   │  │     Room     │  │  SQLite   │ │
│  │   Handler    │─→│   Manager    │─→│   Store   │ │
│  └──────────────┘  └──────────────┘  └───────────┘ │
└─────────────────────────────────────────────────────┘
          ↕                ↕                ↕
    WebSocket         WebSocket        WebSocket
          ↕                ↕                ↕
┌─────────────┐  ┌─────────────┐  ┌─────────────┐
│  Agent CLI  │  │  Agent CLI  │  │  Agent CLI  │
│  (Architect)│  │   (Critic)  │  │ (Pragmatist)│
│      ↓      │  │      ↓      │  │      ↓      │
│   Ollama    │  │   Ollama    │  │   Ollama    │
│   (local)   │  │   (local)   │  │   (local)   │
└─────────────┘  └─────────────┘  └─────────────┘
```

**Key characteristics**:
- **Separate processes**: Server and each agent run independently
- **Local LLM inference**: Each agent calls Ollama directly (not through server)
- **Centralized state**: Server manages room state and message persistence
- **Bidirectional communication**: WebSocket enables server→agent push

## Design Patterns

### 1. Observer Pattern (Message Broadcasting)
**Used for**: Distributing messages to all agents in a room

**How it works**:
- Room maintains list of connected agent WebSocket connections
- When agent sends message, server broadcasts to all observers
- Agents receive message, decide independently whether to respond

**Implementation**:
```typescript
class Room {
  private agents: Map<string, WebSocket> = new Map();

  broadcast(message: Message, excludeSender?: string) {
    for (const [agentId, ws] of this.agents) {
      if (agentId !== excludeSender) {
        ws.send(JSON.stringify(message));
      }
    }
  }
}
```

### 2. Repository Pattern (Data Access)
**Used for**: Abstracting SQLite operations

**How it works**:
- Database module provides clean interface for data operations
- Business logic (Room) doesn't know about SQL
- Easy to test with mock repository

**Implementation**:
```typescript
interface MessageRepository {
  save(message: Message): void;
  getRecent(roomId: string, limit: number): Message[];
  getAllSince(roomId: string, timestamp: Date): Message[];
}
```

### 3. Strategy Pattern (Agent Roles)
**Used for**: Different agent behaviors based on role

**How it works**:
- Each role (Architect, Critic, Pragmatist, Moderator) has specific prompt + behavior
- Agent client loads role-specific strategy at startup
- System prompt + response logic varies by role

**Implementation**:
```typescript
interface AgentRole {
  systemPrompt: string;
  shouldRespond(context: ConversationContext): boolean;
  formatResponse(llmOutput: string): Message;
}

class ModeratorRole implements AgentRole {
  systemPrompt = "You are a discussion facilitator...";
  shouldRespond() { return true; } // Moderator always participates
}
```

### 4. Command Pattern (WebSocket Messages)
**Used for**: Structured communication between agents and server

**How it works**:
- All messages are typed commands (JOIN, MESSAGE, LEAVE, VOTE, etc.)
- Server routes commands to appropriate handlers
- Type-safe with Zod schemas

**Example commands**:
```typescript
type WSCommand =
  | { type: 'JOIN', agentId: string, role: string }
  | { type: 'MESSAGE', content: string, agentId: string }
  | { type: 'VOTE', option: string, rationale: string }
  | { type: 'LEAVE', agentId: string };
```

## Component Structure

```
server/
├── index.ts              # Server startup, WebSocket server creation
├── room.ts               # Room: manages agents, broadcasts messages
├── database.ts           # Repository: SQLite CRUD operations
├── websocket.ts          # Handler: parses commands, delegates to Room
└── summarizer.ts         # Utility: generates context summaries via Ollama

agent/
├── index.ts              # CLI entry point, arg parsing
├── client.ts             # WebSocket client, reconnection logic
├── llm.ts                # Ollama API wrapper for inference
├── roles/
│   ├── base.ts           # AgentRole interface
│   ├── architect.ts      # Architect role implementation
│   ├── critic.ts         # Critic role implementation
│   ├── pragmatist.ts     # Pragmatist role implementation
│   └── moderator.ts      # Moderator role implementation
└── responder.ts          # Logic: shouldRespond(), generateResponse()

shared/
├── types.ts              # Shared TypeScript interfaces
├── protocol.ts           # Zod schemas for WebSocket messages
└── constants.ts          # Configuration constants
```

## Key Technical Decisions

### Decision 1: Agents Generate Responses Locally
**Rationale**:
- Keeps server simple (no LLM orchestration)
- Agents are independent actors
- Easier to test agent behavior in isolation
- Mirrors real-world distributed agent systems

**Tradeoff**: Server can't control agent response quality/timing

### Decision 2: SQLite Synchronous Operations
**Rationale**:
- Simpler than async (no connection pooling, no race conditions)
- Fast enough for single-writer workload
- Better-sqlite3 has excellent performance

**Tradeoff**: Blocks event loop briefly, but acceptable for expected load

### Decision 3: No Authentication in v1
**Rationale**:
- Single-user, local-only system
- Focus on core agent collaboration features
- Authentication adds complexity without value in M1-M6

**Tradeoff**: Can't be exposed to network without security layer

### Decision 4: Server Generates Context Summaries
**Rationale**:
- Centralized: All agents get same summary (consistency)
- Efficient: Generate once, reuse for all rejoining agents
- Server has full conversation history

**Tradeoff**: Server needs Ollama access, adds dependency

## Data Flow

### Flow 1: Agent Sends Message
```
1. Agent calls Ollama locally: "Given this context, what's your response?"
2. Agent receives LLM response
3. Agent sends MESSAGE command via WebSocket to server
4. Server validates message, stores in SQLite
5. Server broadcasts MESSAGE to all agents in room (except sender)
6. Each receiving agent evaluates: "Is this relevant to me?"
7. Relevant agent(s) go to step 1
```

### Flow 2: Agent Joins Room
```
1. Agent connects WebSocket to server
2. Agent sends JOIN command with role and name
3. Server checks if room exists, creates if needed
4. Server generates context summary (if messages exist)
5. Server sends CONTEXT command to agent:
   - Room topic
   - Summary of conversation so far
   - Last N messages (full text)
6. Agent receives context, displays to user
7. Agent begins listening for new messages
```

### Flow 3: Agent Rejoins After Disconnect
```
1. Agent detects WebSocket disconnect
2. Agent waits 1s, attempts reconnect (exponential backoff)
3. On reconnect, sends JOIN command again
4. Server detects returning agent (by agentId)
5. Server generates fresh summary (includes messages since last join)
6. Server sends CONTEXT with updated summary + recent messages
7. Agent displays "Caught up to speed: [summary]"
8. Agent resumes participation
```

### Flow 4: Moderator Calls Vote
```
1. Moderator decides vote is needed (via LLM decision)
2. Moderator sends MESSAGE with [VOTE] marker:
   "I'm calling for a vote: Should we use approach A or B?"
3. Server broadcasts vote message to all agents
4. Agents recognize [VOTE] marker, generate VOTE commands:
   VOTE { option: "A", rationale: "..." }
5. Server collects votes, stores in decisions table
6. When all agents voted (or timeout), server sends VOTE_RESULT
7. Moderator receives result, summarizes outcome
```

## Critical Paths

### Path 1: Basic Message Cycle (Milestone 1)
**Critical because**: This is the core loop - if broken, nothing works

**Components involved**:
- Agent LLM inference
- WebSocket send/receive
- Server broadcast
- Message storage

**Failure modes**:
- Agent LLM hangs → Timeout and log error
- WebSocket drops → Agent reconnects
- Broadcast fails → Retry or log (acceptable in M1)
- Storage fails → Log error, continue (acceptable in M1)

### Path 2: Context Recovery (Milestone 2)
**Critical because**: Enables persistence and long-running conversations

**Components involved**:
- Server summary generation
- SQLite message retrieval
- Agent context display

**Failure modes**:
- Summary generation fails → Fall back to last N messages only
- Database read fails → Return empty context (agent joins "cold")
- Summary too long → Truncate intelligently

### Path 3: Decision Recording (Milestone 5)
**Critical because**: This is the primary outcome of agent discussions

**Components involved**:
- Moderator vote detection
- Agent vote submission
- Server vote tallying
- Decision storage

**Failure modes**:
- Not all agents vote → Timeout and record partial result
- Vote storage fails → Log error, continue conversation
- Tie votes → Record as tie, moderator decides

## Conversation State Machine

Room progresses through these states:

```
┌─────────┐
│ CREATED │ (Server starts, room created with topic)
└────┬────┘
     │ (First agent joins)
     ↓
┌─────────┐
│  ACTIVE │ (Agents discussing)
└────┬────┘
     │ (No messages for N minutes OR explicit pause)
     ↓
┌─────────┐
│  PAUSED │ (Inactive, but resumable)
└────┬────┘
     │ (Agent rejoins OR new message)
     ↓
┌─────────┐
│  ACTIVE │ (Back to discussion)
└────┬────┘
     │ (Moderator or system declares conclusion)
     ↓
┌───────────┐
│ CONCLUDED │ (Final state, read-only)
└───────────┘
```

## Context Budget Management

**Problem**: Local LLMs have limited context windows (4k-8k tokens)

**Strategy**: Summary + Sliding Window

```
┌──────────────────────────────────────────────┐
│         Agent Context (total ~4000 tokens)    │
├──────────────────────────────────────────────┤
│ System Prompt (500t)                         │
│   "You are a Pragmatist agent..."            │
├──────────────────────────────────────────────┤
│ Conversation Summary (500-1000t)             │
│   "So far, Architect proposed..."            │
├──────────────────────────────────────────────┤
│ Recent Messages (1000-2000t)                 │
│   [Last 10-15 messages in full]              │
├──────────────────────────────────────────────┤
│ Response Buffer (~1500t)                     │
│   [Room for agent's response]                │
└──────────────────────────────────────────────┘
```

**Token estimation**: ~4 characters per token (English)

**Summary regeneration**:
- Every N messages (e.g., every 20)
- When agent rejoins
- On explicit request

**Sliding window**:
- Keep last N messages (N = configurable, default 15)
- Older messages summarized, not included verbatim

## Moderator Responsibilities

**Moderator is different from participants**:

1. **Always participates**: Doesn't filter "should I respond?"
2. **Structural role**: Focuses on process, not just content
3. **Meta-awareness**: Tracks conversation state, not just topic

**Moderator actions**:
- Summarize current state: "So we've agreed on X, but still debating Y"
- Redirect tangents: "Let's return to the original question"
- Call for input: "@Architect, what do you think about this?"
- Detect consensus: "It seems we all agree on..."
- Trigger votes: "Let's vote on this proposal"
- Conclude topics: "This seems resolved, moving to next issue"

**Moderator prompt engineering**:
```
You are a discussion moderator for AI agents. Your goals:
1. Keep discussion on topic: [TOPIC]
2. Ensure all agents contribute
3. Detect when a decision point is reached
4. Call for votes when appropriate
5. Summarize conclusions

Special actions you can take:
- Use @agentName to direct questions
- Use [VOTE] to trigger formal voting
- Use [SUMMARY] to recap discussion
- Use [CONCLUDED] when topic is resolved
```
