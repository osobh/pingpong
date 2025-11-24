# Milestone 1: Two Agents, One Room, One Conversation

**Goal**: Prove that two AI agents can sustain a meaningful multi-turn conversation via WebSocket communication.

## Exit Criteria
1. Two agents exchange 10+ messages on a seeded topic
2. Conversation reaches natural conclusion or productive impasse
3. Observable conversation quality ("this is interesting")
4. All M1 must-haves implemented (timestamps, roles, limits, graceful shutdown)

## Technical Specification

### 1. Project Structure

```
pingpong/
├── package.json
├── tsconfig.json
├── server/
│   ├── index.ts              # Entry point, WebSocket server setup
│   ├── room.ts               # Room class: manages agents, broadcasts messages
│   └── types.ts              # Server-specific types
├── agent/
│   ├── index.ts              # CLI entry point
│   ├── client.ts             # WebSocket client with reconnection
│   ├── llm.ts                # Ollama API wrapper
│   └── types.ts              # Agent-specific types
├── shared/
│   ├── protocol.ts           # WebSocket message schemas (Zod)
│   ├── types.ts              # Shared types
│   └── constants.ts          # Configuration constants
└── tests/
    ├── unit/
    │   └── protocol.test.ts  # Test message validation
    └── integration/
        └── basic-flow.test.ts # Test agent-server interaction
```

### 2. WebSocket Protocol

#### Message Types (Zod Schemas)

```typescript
// shared/protocol.ts
import { z } from 'zod';

// Client → Server
export const JoinCommandSchema = z.object({
  type: z.literal('JOIN'),
  agentId: z.string(),
  agentName: z.string(),
  role: z.string(),
  timestamp: z.number(),
});

export const MessageCommandSchema = z.object({
  type: z.literal('MESSAGE'),
  agentId: z.string(),
  content: z.string(),
  timestamp: z.number(),
});

export const LeaveCommandSchema = z.object({
  type: z.literal('LEAVE'),
  agentId: z.string(),
  timestamp: z.number(),
});

export const ClientCommandSchema = z.discriminatedUnion('type', [
  JoinCommandSchema,
  MessageCommandSchema,
  LeaveCommandSchema,
]);

// Server → Client
export const WelcomeEventSchema = z.object({
  type: z.literal('WELCOME'),
  roomId: z.string(),
  topic: z.string(),
  agentCount: z.number(),
  timestamp: z.number(),
});

export const AgentJoinedEventSchema = z.object({
  type: z.literal('AGENT_JOINED'),
  agentId: z.string(),
  agentName: z.string(),
  role: z.string(),
  timestamp: z.number(),
});

export const MessageEventSchema = z.object({
  type: z.literal('MESSAGE'),
  agentId: z.string(),
  agentName: z.string(),
  role: z.string(),
  content: z.string(),
  timestamp: z.number(),
});

export const AgentLeftEventSchema = z.object({
  type: z.literal('AGENT_LEFT'),
  agentId: z.string(),
  agentName: z.string(),
  timestamp: z.number(),
});

export const ErrorEventSchema = z.object({
  type: z.literal('ERROR'),
  message: z.string(),
  timestamp: z.number(),
});

export const ServerEventSchema = z.discriminatedUnion('type', [
  WelcomeEventSchema,
  AgentJoinedEventSchema,
  MessageEventSchema,
  AgentLeftEventSchema,
  ErrorEventSchema,
]);

export type JoinCommand = z.infer<typeof JoinCommandSchema>;
export type MessageCommand = z.infer<typeof MessageCommandSchema>;
export type LeaveCommand = z.infer<typeof LeaveCommandSchema>;
export type ClientCommand = z.infer<typeof ClientCommandSchema>;

export type WelcomeEvent = z.infer<typeof WelcomeEventSchema>;
export type AgentJoinedEvent = z.infer<typeof AgentJoinedEventSchema>;
export type MessageEvent = z.infer<typeof MessageEventSchema>;
export type AgentLeftEvent = z.infer<typeof AgentLeftEventSchema>;
export type ErrorEvent = z.infer<typeof ErrorEventSchema>;
export type ServerEvent = z.infer<typeof ServerEventSchema>;
```

#### Connection Flow

```
Agent                           Server
  |                                |
  |-------- WebSocket Connect ---->|
  |                                |
  |------- JOIN command ---------->|
  |                                | (Add agent to room)
  |<------ WELCOME event -----------|
  |<------ AGENT_JOINED events ----| (Other agents)
  |                                |
  |<------ MESSAGE event -----------| (From other agent)
  | (Agent evaluates message)      |
  | (Calls Ollama for response)    |
  |------- MESSAGE command -------->|
  |                                | (Broadcast to all)
  |<------ MESSAGE event -----------| (Echo to everyone)
  |                                |
  |------- LEAVE command ---------->|
  |<------ AGENT_LEFT event --------|
  |                                |
  |-------- Disconnect ------------>|
```

### 3. Server Implementation

#### server/index.ts

```typescript
import { WebSocketServer } from 'ws';
import { Room } from './room.js';
import { ClientCommandSchema } from '../shared/protocol.js';

const PORT = process.env.PORT ? parseInt(process.env.PORT) : 8080;
const TOPIC = process.argv[2] || "Should we use microservices or monolith?";

const wss = new WebSocketServer({ port: PORT });
const room = new Room('default', TOPIC);

console.log(`PingPong Server started on port ${PORT}`);
console.log(`Room topic: "${TOPIC}"`);

wss.on('connection', (ws) => {
  console.log('New connection');

  ws.on('message', (data) => {
    try {
      const message = JSON.parse(data.toString());
      const command = ClientCommandSchema.parse(message);

      room.handleCommand(ws, command);
    } catch (error) {
      console.error('Invalid message:', error);
      ws.send(JSON.stringify({
        type: 'ERROR',
        message: 'Invalid command format',
        timestamp: Date.now(),
      }));
    }
  });

  ws.on('close', () => {
    console.log('Connection closed');
    room.handleDisconnect(ws);
  });

  ws.on('error', (error) => {
    console.error('WebSocket error:', error);
  });
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\nShutting down server...');
  room.shutdown();
  wss.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});
```

#### server/room.ts

```typescript
import { WebSocket } from 'ws';
import type {
  ClientCommand,
  JoinCommand,
  MessageCommand,
  LeaveCommand,
  ServerEvent,
} from '../shared/protocol.js';

interface Agent {
  id: string;
  name: string;
  role: string;
  ws: WebSocket;
}

export class Room {
  private agents = new Map<string, Agent>();

  constructor(
    public readonly id: string,
    public readonly topic: string,
  ) {}

  handleCommand(ws: WebSocket, command: ClientCommand) {
    switch (command.type) {
      case 'JOIN':
        this.handleJoin(ws, command);
        break;
      case 'MESSAGE':
        this.handleMessage(command);
        break;
      case 'LEAVE':
        this.handleLeave(command);
        break;
    }
  }

  private handleJoin(ws: WebSocket, command: JoinCommand) {
    const agent: Agent = {
      id: command.agentId,
      name: command.agentName,
      role: command.role,
      ws,
    };

    this.agents.set(agent.id, agent);
    console.log(`Agent joined: ${agent.name} (${agent.role})`);

    // Send WELCOME to joining agent
    this.sendToAgent(agent.id, {
      type: 'WELCOME',
      roomId: this.id,
      topic: this.topic,
      agentCount: this.agents.size,
      timestamp: Date.now(),
    });

    // Notify all agents of new join
    this.broadcast({
      type: 'AGENT_JOINED',
      agentId: agent.id,
      agentName: agent.name,
      role: agent.role,
      timestamp: Date.now(),
    });

    // If this is the first agent, send initial prompt
    if (this.agents.size === 1) {
      setTimeout(() => {
        this.broadcast({
          type: 'MESSAGE',
          agentId: 'system',
          agentName: 'System',
          role: 'system',
          content: `Discussion topic: ${this.topic}\n\nPlease share your initial thoughts.`,
          timestamp: Date.now(),
        });
      }, 1000);
    }
  }

  private handleMessage(command: MessageCommand) {
    const agent = this.agents.get(command.agentId);
    if (!agent) return;

    console.log(`[${agent.name}] ${command.content.substring(0, 60)}...`);

    this.broadcast({
      type: 'MESSAGE',
      agentId: agent.id,
      agentName: agent.name,
      role: agent.role,
      content: command.content,
      timestamp: command.timestamp,
    });
  }

  private handleLeave(command: LeaveCommand) {
    const agent = this.agents.get(command.agentId);
    if (!agent) return;

    console.log(`Agent left: ${agent.name}`);
    this.agents.delete(command.agentId);

    this.broadcast({
      type: 'AGENT_LEFT',
      agentId: agent.id,
      agentName: agent.name,
      timestamp: Date.now(),
    });
  }

  handleDisconnect(ws: WebSocket) {
    // Find agent by WebSocket
    for (const [id, agent] of this.agents) {
      if (agent.ws === ws) {
        this.handleLeave({ type: 'LEAVE', agentId: id, timestamp: Date.now() });
        break;
      }
    }
  }

  private sendToAgent(agentId: string, event: ServerEvent) {
    const agent = this.agents.get(agentId);
    if (agent && agent.ws.readyState === WebSocket.OPEN) {
      agent.ws.send(JSON.stringify(event));
    }
  }

  private broadcast(event: ServerEvent, excludeId?: string) {
    const message = JSON.stringify(event);
    for (const [id, agent] of this.agents) {
      if (id !== excludeId && agent.ws.readyState === WebSocket.OPEN) {
        agent.ws.send(message);
      }
    }
  }

  shutdown() {
    console.log('Closing all connections...');
    for (const agent of this.agents.values()) {
      agent.ws.close();
    }
    this.agents.clear();
  }
}
```

### 4. Agent Implementation

#### agent/index.ts

```typescript
import { program } from 'commander';
import { AgentClient } from './client.js';

program
  .option('-r, --role <role>', 'Agent role', 'participant')
  .option('-n, --name <name>', 'Agent name', 'Agent')
  .option('-m, --model <model>', 'Ollama model', 'llama3')
  .option('-s, --server <url>', 'Server URL', 'ws://localhost:8080')
  .parse();

const options = program.opts();

const agent = new AgentClient({
  agentId: `${options.name}-${Date.now()}`,
  agentName: options.name,
  role: options.role,
  model: options.model,
  serverUrl: options.server,
});

agent.connect();

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\nShutting down agent...');
  agent.disconnect();
  process.exit(0);
});
```

#### agent/client.ts

```typescript
import WebSocket from 'ws';
import chalk from 'chalk';
import { ServerEventSchema, type ServerEvent } from '../shared/protocol.js';
import { generateResponse } from './llm.js';

interface AgentConfig {
  agentId: string;
  agentName: string;
  role: string;
  model: string;
  serverUrl: string;
}

export class AgentClient {
  private ws?: WebSocket;
  private conversationHistory: Array<{ role: string; name: string; content: string }> = [];
  private messageCount = 0;
  private readonly MAX_MESSAGES = 20;

  constructor(private config: AgentConfig) {}

  connect() {
    console.log(chalk.blue(`Connecting as ${this.config.agentName} (${this.config.role})...`));

    this.ws = new WebSocket(this.config.serverUrl);

    this.ws.on('open', () => {
      console.log(chalk.green('Connected to server'));
      this.sendJoin();
    });

    this.ws.on('message', (data) => {
      try {
        const message = JSON.parse(data.toString());
        const event = ServerEventSchema.parse(message);
        this.handleEvent(event);
      } catch (error) {
        console.error(chalk.red('Invalid event:'), error);
      }
    });

    this.ws.on('close', () => {
      console.log(chalk.yellow('Disconnected from server'));
    });

    this.ws.on('error', (error) => {
      console.error(chalk.red('WebSocket error:'), error);
    });
  }

  private sendJoin() {
    this.send({
      type: 'JOIN',
      agentId: this.config.agentId,
      agentName: this.config.agentName,
      role: this.config.role,
      timestamp: Date.now(),
    });
  }

  private async handleEvent(event: ServerEvent) {
    switch (event.type) {
      case 'WELCOME':
        console.log(chalk.cyan(`\nWelcome to room: ${event.roomId}`));
        console.log(chalk.cyan(`Topic: ${event.topic}`));
        console.log(chalk.cyan(`Agents in room: ${event.agentCount}\n`));
        break;

      case 'AGENT_JOINED':
        if (event.agentId !== this.config.agentId) {
          console.log(chalk.gray(`${event.agentName} (${event.role}) joined`));
        }
        break;

      case 'AGENT_LEFT':
        console.log(chalk.gray(`${event.agentName} left`));
        break;

      case 'MESSAGE':
        await this.handleMessage(event);
        break;

      case 'ERROR':
        console.error(chalk.red(`Error: ${event.message}`));
        break;
    }
  }

  private async handleMessage(event: { agentId: string; agentName: string; role: string; content: string }) {
    // Don't respond to own messages
    if (event.agentId === this.config.agentId) return;

    // Display message
    const timestamp = new Date().toLocaleTimeString();
    console.log(chalk.bold(`\n[${timestamp}] ${event.agentName} (${event.role}):`));
    console.log(event.content);

    // Add to history
    this.conversationHistory.push({
      role: event.role,
      name: event.agentName,
      content: event.content,
    });

    // Check message limit
    if (this.messageCount >= this.MAX_MESSAGES) {
      console.log(chalk.yellow('\nMessage limit reached, staying silent.'));
      return;
    }

    // Generate response
    console.log(chalk.dim('\nThinking...'));
    const response = await generateResponse({
      model: this.config.model,
      role: this.config.role,
      agentName: this.config.agentName,
      conversationHistory: this.conversationHistory,
    });

    if (response) {
      this.messageCount++;
      this.send({
        type: 'MESSAGE',
        agentId: this.config.agentId,
        content: response,
        timestamp: Date.now(),
      });

      // Display own message
      console.log(chalk.bold.green(`\n[${new Date().toLocaleTimeString()}] ${this.config.agentName} (${this.config.role}):`));
      console.log(chalk.green(response));
    }
  }

  private send(command: any) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(command));
    }
  }

  disconnect() {
    if (this.ws) {
      this.send({
        type: 'LEAVE',
        agentId: this.config.agentId,
        timestamp: Date.now(),
      });
      this.ws.close();
    }
  }
}
```

#### agent/llm.ts

```typescript
import ollama from 'ollama';

interface GenerateOptions {
  model: string;
  role: string;
  agentName: string;
  conversationHistory: Array<{ role: string; name: string; content: string }>;
}

const ROLE_PROMPTS: Record<string, string> = {
  architect: "You are a systems architect focused on high-level design, scalability, and long-term maintainability. Consider the big picture and architectural patterns.",
  critic: "You are a critical thinker who challenges assumptions and finds potential flaws. Ask tough questions and consider edge cases.",
  pragmatist: "You are a pragmatic engineer focused on feasibility, tradeoffs, and practical constraints. Consider implementation complexity and real-world limitations.",
  participant: "You are a thoughtful participant in this discussion. Share your perspective and engage with others' ideas.",
};

export async function generateResponse(options: GenerateOptions): Promise<string | null> {
  try {
    const systemPrompt = ROLE_PROMPTS[options.role] || ROLE_PROMPTS.participant;

    // Build context from conversation history
    const context = options.conversationHistory
      .slice(-5) // Last 5 messages
      .map(msg => `${msg.name} (${msg.role}): ${msg.content}`)
      .join('\n\n');

    const prompt = `${systemPrompt}

Conversation so far:
${context}

Your turn to respond. Be concise (2-3 paragraphs) and add to the discussion. If the conversation has reached a natural conclusion, you may suggest wrapping up.

Your response:`;

    const response = await ollama.generate({
      model: options.model,
      prompt,
      stream: false,
    });

    return response.response.trim();
  } catch (error) {
    console.error('LLM generation error:', error);
    return null;
  }
}
```

### 5. Configuration

#### package.json

```json
{
  "name": "pingpong",
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "server": "tsx server/index.ts",
    "agent": "tsx agent/index.ts",
    "test": "vitest",
    "build": "tsc"
  },
  "dependencies": {
    "ws": "^8.16.0",
    "zod": "^3.22.4",
    "ollama": "^0.5.0",
    "commander": "^11.1.0",
    "chalk": "^5.3.0"
  },
  "devDependencies": {
    "@types/node": "^20.11.5",
    "@types/ws": "^8.5.10",
    "tsx": "^4.7.0",
    "typescript": "^5.3.3",
    "vitest": "^1.2.1"
  }
}
```

#### tsconfig.json

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ES2022",
    "moduleResolution": "node",
    "esModuleInterop": true,
    "strict": true,
    "skipLibCheck": true,
    "outDir": "./dist",
    "rootDir": ".",
    "resolveJsonModule": true
  },
  "include": ["server/**/*", "agent/**/*", "shared/**/*", "tests/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

### 6. Testing Strategy

#### Manual Testing
```bash
# Terminal 1: Start server
npm run server -- "Should we use microservices?"

# Terminal 2: Start Agent 1
npm run agent -- --role architect --name Alice --model llama3

# Terminal 3: Start Agent 2
npm run agent -- --role critic --name Bob --model llama3

# Observe: 10+ message exchanges, natural flow
```

#### Validation Checklist
- [ ] Messages display with timestamps
- [ ] Agent names and roles visible
- [ ] Conversation reaches 10+ exchanges
- [ ] No crashes or errors
- [ ] Graceful shutdown with Ctrl+C
- [ ] Conversation feels natural (not robotic)
- [ ] Agents reach conclusion or impasse

### 7. Known Limitations (M1 Only)

- **No persistence**: Conversation lost on server restart
- **No context recovery**: Agents can't rejoin with history
- **No moderator**: No explicit facilitation
- **Simple turn-taking**: Agents respond to all messages
- **Fixed message limit**: Hardcoded 20 messages per agent

These limitations are ACCEPTABLE for M1 - they will be addressed in future milestones.
