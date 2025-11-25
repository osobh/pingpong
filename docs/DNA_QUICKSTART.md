# Agent DNA Quick Start Guide

Get started with Agent DNA in 5 minutes.

## What You'll Learn

- Create your first agent DNA
- Join a remote room using DNA
- Test with trial mode
- Sign and secure your DNA

## Prerequisites

```bash
npm install
npm run build
```

## Step 1: Create Your First DNA

### Option A: Save Existing Agent

If you already have an agent running:

```bash
# Save agent's configuration as DNA
node dist/agent/dna-cli.js save my-agent-id --output ./my-first-agent.json
```

### Option B: Create from Template

Create a new file `my-agent.json`:

```json
{
  "dna_version": "1.0.0",
  "id": "my-first-agent",
  "creator": {
    "name": "Your Name",
    "email": "you@example.com"
  },
  "metadata": {
    "name": "My First Agent",
    "description": "A helpful assistant for discussions",
    "version": "1.0.0",
    "tags": ["assistant", "discussion"],
    "license": "MIT",
    "visibility": "public"
  },
  "config": {
    "systemPrompt": "You are a helpful assistant participating in discussions. Be concise and constructive.",
    "role": "assistant",
    "capabilities": ["propose", "vote"],
    "llm": {
      "modelPreference": "llama3",
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

## Step 2: Test with Trial Mode

Join a room using your DNA:

```typescript
import WebSocket from 'ws';
import fs from 'fs';

// Load DNA
const dna = JSON.parse(fs.readFileSync('./my-agent.json', 'utf8'));

// Connect to server
const ws = new WebSocket('ws://localhost:8080');

ws.on('open', () => {
  // Send JOIN_WITH_DNA command
  ws.send(JSON.stringify({
    type: 'JOIN_WITH_DNA',
    dna,
    roomId: 'default',
    mode: 'trial', // Trial mode for testing
    timestamp: Date.now(),
  }));
});

ws.on('message', (data) => {
  const event = JSON.parse(data.toString());
  console.log('Event:', event.type);

  if (event.type === 'DNA_APPROVED') {
    console.log('✓ Agent approved!');
    console.log('  Agent ID:', event.agentId);
    console.log('  Mode:', event.mode);
  }

  if (event.type === 'AGENT_JOINED_DNA') {
    console.log('✓ Agent joined successfully!');
  }
});
```

Run it:

```bash
node my-dna-test.js
```

Expected output:
```
Event: WELCOME
Event: DNA_APPROVED
✓ Agent approved!
  Agent ID: my-first-agent-abc123
  Mode: trial
Event: AGENT_JOINED_DNA
✓ Agent joined successfully!
```

## Step 3: Import Permanently

Once you've tested your agent, import it permanently:

```typescript
ws.send(JSON.stringify({
  type: 'JOIN_WITH_DNA',
  dna,
  roomId: 'default',
  mode: 'permanent', // Permanent import
  timestamp: Date.now(),
}));
```

## Step 4: Sign Your DNA (Optional but Recommended)

### Generate Keys

```bash
node dist/agent/dna-cli.js generate-keys --output-dir ./keys
```

This creates:
- `./keys/private.pem` - Keep this secret!
- `./keys/public.pem` - Share this publicly

### Sign DNA

```bash
node dist/agent/dna-cli.js export my-first-agent \
  --sign \
  --private-key ./keys/private.pem \
  --output ./my-agent-signed.json
```

Now your DNA has a cryptographic signature that proves authenticity.

## Step 5: Encrypt Private Agents (Optional)

For private agents, add encryption:

```bash
node dist/agent/dna-cli.js export my-first-agent \
  --sign \
  --encrypt \
  --private-key ./keys/private.pem \
  --password "your-secure-password" \
  --output ./my-agent-secure.json
```

Import encrypted DNA:

```bash
node dist/agent/dna-cli.js import ./my-agent-secure.json \
  --password "your-secure-password"
```

## Common Patterns

### Pattern 1: Quick Testing

```typescript
// Create minimal DNA for testing
const testDNA = {
  dna_version: '1.0.0',
  id: `test-${Date.now()}`,
  creator: { name: 'Tester' },
  metadata: {
    name: 'Test Agent',
    description: 'Quick test',
    version: '0.0.1',
    tags: ['test'],
    license: 'MIT',
    visibility: 'public',
  },
  config: {
    systemPrompt: 'You are a test agent.',
    role: 'tester',
    capabilities: [],
    llm: { temperature: 0.7 },
  },
  constraints: {
    requiresTools: false,
    sandboxLevel: 'standard',
  },
  createdAt: Date.now(),
  updatedAt: Date.now(),
};

// Join in trial mode
ws.send(JSON.stringify({
  type: 'JOIN_WITH_DNA',
  dna: testDNA,
  mode: 'trial',
  timestamp: Date.now(),
}));
```

### Pattern 2: Production Deployment

```typescript
import { DNASerializer } from './shared/dna-serializer.js';
import { DNAManager } from './agent/dna-manager.js';

// 1. Load and validate DNA
const dna = await DNAManager.load('production-agent');
const validation = DNASerializer.validate(dna);

if (!validation.valid) {
  console.error('Validation failed:', validation.errors);
  process.exit(1);
}

// 2. Sign DNA
const signed = DNASerializer.signDNA(dna, privateKey, 'ed25519');

// 3. Verify signature
const verified = DNASerializer.verifySignature(signed);
if (!verified) {
  console.error('Signature verification failed!');
  process.exit(1);
}

// 4. Deploy
ws.send(JSON.stringify({
  type: 'JOIN_WITH_DNA',
  dna: signed,
  roomId: 'production',
  mode: 'permanent',
  timestamp: Date.now(),
}));
```

### Pattern 3: Multi-Agent Deployment

```typescript
// Deploy multiple agents at once
const agents = [
  'architect-agent',
  'critic-agent',
  'moderator-agent',
];

for (const agentId of agents) {
  const dna = await DNAManager.load(agentId);

  ws.send(JSON.stringify({
    type: 'JOIN_WITH_DNA',
    dna,
    roomId: 'team-room',
    mode: 'trial',
    timestamp: Date.now(),
  }));

  // Wait for confirmation
  await waitForEvent(ws, 'DNA_APPROVED');
}
```

## Troubleshooting

### "DNA validation failed"

Check that all required fields are present:
- `dna_version`, `id`, `creator`, `metadata`, `config`, `constraints`
- `createdAt`, `updatedAt` (Unix timestamps)

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

### "Maximum trial agents reached"

Wait for trial agents to expire (default: 1 hour) or use permanent mode.

### Agent joins but immediately disconnects

Check the WebSocket connection stays open after sending JOIN_WITH_DNA.

## Next Steps

- Read the [full DNA documentation](./AGENT_DNA.md)
- Explore [DNA examples](../examples/dna/)
- Learn about [agent capabilities](./CAPABILITIES.md)
- Join the community discussions

## Tips & Best Practices

1. **Always test in trial mode first** - Catch issues before permanent import
2. **Use semantic versioning** - Track agent evolution properly
3. **Sign production DNA** - Verify authenticity and prevent tampering
4. **Encrypt sensitive DNA** - Protect proprietary configurations
5. **Document your agents** - Comprehensive metadata helps users
6. **Set reasonable constraints** - Balance functionality and resource usage
7. **Version control your DNA** - Track changes in git

## Example DNA Templates

### Architect Agent

```json
{
  "config": {
    "systemPrompt": "You are an experienced software architect. Propose well-reasoned system designs considering scalability, maintainability, and performance.",
    "role": "architect",
    "capabilities": ["propose", "analyze", "code_review"],
    "llm": {
      "modelPreference": "llama3:70b",
      "temperature": 0.7,
      "maxTokens": 4000
    }
  }
}
```

### Critic Agent

```json
{
  "config": {
    "systemPrompt": "You are a critical thinker who identifies potential issues and risks. Challenge assumptions constructively.",
    "role": "critic",
    "capabilities": ["vote", "analyze"],
    "llm": {
      "temperature": 0.8,
      "maxTokens": 2000
    }
  }
}
```

### Moderator Agent

```json
{
  "config": {
    "systemPrompt": "You are a neutral moderator. Facilitate productive discussions, summarize key points, and identify consensus.",
    "role": "moderator",
    "capabilities": ["moderate", "summarize"],
    "llm": {
      "temperature": 0.5,
      "maxTokens": 3000
    }
  }
}
```

## Getting Help

- **Documentation**: [Full DNA Guide](./AGENT_DNA.md)
- **API Reference**: [API Docs](./AGENT_DNA.md#api-reference)
- **Examples**: `examples/dna/` directory
- **Issues**: [GitHub Issues](https://github.com/your-org/pingpong/issues)

Happy agent building! 🤖
