# Agent DNA Examples

This directory contains example Agent DNA files and demo scripts showing how to use the DNA system.

## Example DNA Files

### [architect-agent.json](./architect-agent.json)
**Software Architect Agent** - Experienced in system design and architectural patterns
- **Capabilities**: propose, analyze, vote
- **Model**: llama3:70b (capable class)
- **Focus**: System design, scalability, architectural decisions
- **Personality**: Professional, concise

### [critic-agent.json](./critic-agent.json)
**Critical Thinker Agent** - Identifies issues, risks, and weaknesses
- **Capabilities**: analyze, vote
- **Model**: llama3 (standard)
- **Focus**: Risk analysis, edge cases, constructive criticism
- **Personality**: Direct, casual

### [moderator-agent.json](./moderator-agent.json)
**Discussion Moderator** - Facilitates productive discussions
- **Capabilities**: moderate, summarize
- **Model**: llama3 (standard)
- **Focus**: Facilitation, summarization, consensus-building
- **Personality**: Neutral, balanced

## Quick Start

### 1. Start the Server

```bash
npm run build
node dist/server/index.js "Your discussion topic"
```

The server starts on:
- WebSocket: `ws://localhost:8080`
- HTTP API: `http://localhost:3000`

### 2. Run the Demo

Join a room using DNA (trial mode):

```bash
npx tsx examples/dna/demo-dna-join.ts architect-agent.json
```

### 3. Try Different Modes

**Trial Mode** (ephemeral, 1-hour expiration):
```bash
MODE=trial npx tsx examples/dna/demo-dna-join.ts architect-agent.json
```

**Permanent Mode** (saved to library):
```bash
MODE=permanent npx tsx examples/dna/demo-dna-join.ts architect-agent.json
```

**Different Agents**:
```bash
npx tsx examples/dna/demo-dna-join.ts critic-agent.json
npx tsx examples/dna/demo-dna-join.ts moderator-agent.json
```

**Different Room**:
```bash
ROOM_ID=my-room npx tsx examples/dna/demo-dna-join.ts architect-agent.json
```

## Environment Variables

- `SERVER_URL` - WebSocket server URL (default: `ws://localhost:8080`)
- `ROOM_ID` - Target room ID (default: `default`)
- `MODE` - Join mode: `trial` or `permanent` (default: `trial`)

## Example Output

```
🧬 DNA Remote Join Demo
======================

Server: ws://localhost:8080
Room: default
Mode: trial
DNA File: architect-agent.json

✓ Loaded DNA: Software Architect Agent
  Version: 1.0.0
  Creator: PingPong Team
  Capabilities: propose, analyze, vote

Connecting to ws://localhost:8080...
✓ Connected to server

Sending JOIN_WITH_DNA command (mode: trial)...

📩 WELCOME Event
  Room: default
  Topic: Should we use microservices or monolith?
  Mode: deep
  Agents in room: 0

✅ DNA APPROVED!
  Request ID: abc123...
  Agent ID: architect-v1-xyz789
  Agent Name: Software Architect Agent
  Mode: trial
  Approved by: auto-approval

⏱️  Trial mode: Agent will expire after 1 hour

🎉 AGENT JOINED!
  Agent: Software Architect Agent (architect)
  DNA Version: 1.0.0
  Creator: PingPong Team

✓ Successfully joined room "default"

Agent is now participating in the discussion!

👋 Connection closed
```

## Programmatic Usage

You can also use DNA programmatically in your own code:

```typescript
import WebSocket from 'ws';
import fs from 'fs';

// Load DNA
const dna = JSON.parse(fs.readFileSync('./architect-agent.json', 'utf8'));

// Connect and join
const ws = new WebSocket('ws://localhost:8080');

ws.on('open', () => {
  ws.send(JSON.stringify({
    type: 'JOIN_WITH_DNA',
    dna,
    roomId: 'my-room',
    mode: 'trial',
    timestamp: Date.now(),
  }));
});

ws.on('message', (data) => {
  const event = JSON.parse(data.toString());

  if (event.type === 'DNA_APPROVED') {
    console.log('Agent approved:', event.agentId);
  }

  if (event.type === 'AGENT_JOINED_DNA') {
    console.log('Agent joined successfully!');
  }
});
```

## Creating Your Own DNA

### From Scratch

Create a new JSON file with the DNA structure:

```json
{
  "dna_version": "1.0.0",
  "id": "my-agent-v1",
  "creator": {
    "name": "Your Name",
    "email": "you@example.com"
  },
  "metadata": {
    "name": "My Custom Agent",
    "description": "...",
    "version": "1.0.0",
    "tags": ["custom"],
    "license": "MIT",
    "visibility": "public"
  },
  "config": {
    "systemPrompt": "You are...",
    "role": "custom",
    "capabilities": ["propose", "vote"],
    "llm": {
      "temperature": 0.7,
      "maxTokens": 2000
    }
  },
  "constraints": {
    "requiresTools": false,
    "sandboxLevel": "standard"
  },
  "createdAt": 1700000000000,
  "updatedAt": 1700000000000
}
```

### Validate DNA

Check if your DNA is valid:

```bash
npx tsx -e "
import { DNASerializer } from './dist/shared/dna-serializer.js';
import fs from 'fs';

const dna = JSON.parse(fs.readFileSync('./my-agent.json', 'utf8'));
const result = DNASerializer.validate(dna);

console.log('Valid:', result.valid);
console.log('Errors:', result.errors);
console.log('Warnings:', result.warnings);
"
```

## Advanced Usage

### Signing DNA

Sign your DNA with a private key:

```bash
# Generate keys
npx tsx -e "
import { DNASerializer } from './dist/shared/dna-serializer.js';
import fs from 'fs';

const { privateKey, publicKey } = DNASerializer.generateKeyPair();
fs.writeFileSync('./private.pem', privateKey);
fs.writeFileSync('./public.pem', publicKey);
console.log('Keys generated!');
"

# Sign DNA
npx tsx -e "
import { DNASerializer } from './dist/shared/dna-serializer.js';
import fs from 'fs';

const dna = JSON.parse(fs.readFileSync('./my-agent.json', 'utf8'));
const privateKey = fs.readFileSync('./private.pem', 'utf8');

const signed = DNASerializer.signDNA(dna, privateKey, 'ed25519');
fs.writeFileSync('./my-agent-signed.json', JSON.stringify(signed, null, 2));
console.log('DNA signed!');
"
```

### Encrypting DNA

Encrypt private agents with a password:

```bash
npx tsx -e "
import { DNASerializer } from './dist/shared/dna-serializer.js';
import fs from 'fs';

const json = fs.readFileSync('./my-agent.json', 'utf8');
const encrypted = DNASerializer.encrypt(json, 'my-password');
fs.writeFileSync('./my-agent-encrypted.txt', encrypted);
console.log('DNA encrypted!');
"
```

## Troubleshooting

### "Room does not exist"

Create the room first:
```typescript
ws.send(JSON.stringify({
  type: 'CREATE_ROOM',
  roomId: 'my-room',
  topic: 'Discussion topic',
  mode: 'deep',
  timestamp: Date.now(),
}));
```

### "DNA validation failed"

Check that all required fields are present:
- `dna_version`, `id`, `creator`, `metadata`, `config`, `constraints`
- `createdAt` and `updatedAt` timestamps

### "Maximum trial agents reached"

Wait for trials to expire (1 hour) or use permanent mode.

## Next Steps

- Read the [Complete DNA Guide](../../docs/AGENT_DNA.md)
- Check the [Quick Start Guide](../../docs/DNA_QUICKSTART.md)
- Explore the [Integration Tests](../../tests/integration/dna-remote-join.test.ts)
- See the [API Reference](../../docs/AGENT_DNA.md#api-reference)

## License

MIT License - See [LICENSE](../../LICENSE) for details
