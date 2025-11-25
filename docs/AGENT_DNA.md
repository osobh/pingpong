# Agent DNA: Portable Agent Configuration

Agent DNA is a portable, serializable format for defining and distributing AI agent configurations in PingPong. DNA enables agents to join rooms on remote systems by transmitting their complete configuration as a compact JSON payload.

## Table of Contents

- [Overview](#overview)
- [Core Concepts](#core-concepts)
- [DNA Structure](#dna-structure)
- [Creating Agent DNA](#creating-agent-dna)
- [Remote Joining with DNA](#remote-joining-with-dna)
- [Trial vs Permanent Mode](#trial-vs-permanent-mode)
- [Security & Verification](#security--verification)
- [CLI Usage](#cli-usage)
- [WebSocket Protocol](#websocket-protocol)
- [API Reference](#api-reference)

## Overview

Agent DNA provides:
- **Portability**: Transfer agent configurations between systems
- **Versioning**: Track agent evolution with semantic versioning
- **Security**: Cryptographic signatures for verification
- **Privacy**: Password-protected private agents
- **Trial Mode**: Ephemeral agent spawning for testing
- **Metadata**: Rich agent descriptions and attribution

## Core Concepts

### What is Agent DNA?

Agent DNA is a JSON-based configuration format (~5-10KB) that completely describes an AI agent:
- Identity and metadata
- System prompt and role
- LLM preferences and parameters
- Capabilities and permissions
- Constraints and resource limits
- Creator attribution
- Cryptographic signature (optional)

### Why Use DNA?

1. **Agent Mobility**: Agents can join conversations on any PingPong server
2. **Distribution**: Share agents via files, URLs, or registries
3. **Reusability**: One DNA, many instantiations
4. **Verification**: Signatures ensure authenticity
5. **Trial Mode**: Test agents before permanent import

## DNA Structure

### Basic DNA Example

```json
{
  "dna_version": "1.0.0",
  "id": "architect-v1",
  "creator": {
    "name": "Alice Smith",
    "email": "alice@example.com",
    "organization": "TechCorp"
  },
  "metadata": {
    "name": "Software Architect Agent",
    "description": "Specialized in system design and architecture decisions",
    "version": "1.0.0",
    "tags": ["architecture", "design", "systems"],
    "license": "MIT",
    "visibility": "public"
  },
  "config": {
    "systemPrompt": "You are an experienced software architect...",
    "role": "architect",
    "capabilities": ["propose", "vote", "analyze"],
    "llm": {
      "modelPreference": "llama3:70b",
      "temperature": 0.7,
      "maxTokens": 4000
    },
    "personality": {
      "verbosity": "concise",
      "formality": "professional"
    }
  },
  "constraints": {
    "maxMessagesPerHour": 100,
    "requiresTools": false,
    "sandboxLevel": "standard"
  },
  "createdAt": 1700000000000,
  "updatedAt": 1700000000000
}
```

### DNA Fields

#### Required Fields

- **dna_version**: DNA format version (semantic versioning)
- **id**: Unique identifier for this agent DNA
- **creator**: Creator information
  - `name`: Creator's name (required)
  - `email`: Contact email (optional)
  - `organization`: Organization name (optional)
- **metadata**: Agent metadata
  - `name`: Human-readable agent name
  - `description`: Brief description
  - `version`: Agent version (semver)
  - `tags`: Array of tags for categorization
  - `license`: License identifier (e.g., "MIT", "Apache-2.0")
  - `visibility`: "public", "private", or "unlisted"
- **config**: Agent configuration
  - `systemPrompt`: LLM system prompt
  - `role`: Agent role identifier
  - `capabilities`: Array of capabilities
  - `llm`: LLM configuration object
- **constraints**: Resource and behavior constraints
  - `requiresTools`: Whether agent requires tool access
  - `sandboxLevel`: "strict", "standard", or "relaxed"
- **createdAt**: Creation timestamp (Unix milliseconds)
- **updatedAt**: Last update timestamp (Unix milliseconds)

#### Optional Fields

- **signature**: Cryptographic signature object
- **metadata.longDescription**: Detailed description
- **metadata.examples**: Usage examples
- **metadata.avatarUrl**: Agent avatar image URL
- **config.personality**: Personality traits
- **config.tools**: Custom tool definitions
- **config.mcpServers**: MCP server configurations
- **constraints.maxMessagesPerHour**: Rate limit
- **constraints.permissions**: Permission flags

## Creating Agent DNA

### Using the CLI

#### 1. Save Existing Agent Configuration

```bash
# Save an agent's configuration as DNA
npm run agent:dna save architect-alice --output ./agents/architect.json
```

#### 2. Create DNA from Scratch

```typescript
import { createAgentDNA } from './agent/dna-manager.js';

const dna = await createAgentDNA({
  id: 'custom-agent-v1',
  creator: {
    name: 'Your Name',
    email: 'you@example.com',
  },
  metadata: {
    name: 'Custom Agent',
    description: 'A custom agent for specific tasks',
    version: '1.0.0',
    tags: ['custom', 'specialized'],
    license: 'MIT',
    visibility: 'public',
  },
  config: {
    systemPrompt: 'You are a helpful assistant specialized in...',
    role: 'specialist',
    capabilities: ['propose', 'analyze'],
    llm: {
      modelPreference: 'llama3',
      temperature: 0.7,
    },
  },
  constraints: {
    requiresTools: false,
    sandboxLevel: 'standard',
  },
});

// Save to file
await DNAManager.save(dna);
```

#### 3. Export DNA

```bash
# Export with signature
npm run agent:dna export architect-alice --sign --private-key ./keys/private.pem

# Export encrypted
npm run agent:dna export architect-alice --encrypt --password "secure123"

# Export with both
npm run agent:dna export architect-alice --sign --encrypt --private-key ./keys/private.pem
```

### DNA Signing

Sign DNA to verify authenticity and prevent tampering:

```typescript
import { DNASerializer } from './shared/dna-serializer.js';

// Generate key pair
const { privateKey, publicKey } = DNASerializer.generateKeyPair();

// Sign DNA
const signedDNA = DNASerializer.signDNA(dna, privateKey, 'ed25519');

// Verify signature
const isValid = DNASerializer.verifySignature(signedDNA);
```

## Remote Joining with DNA

### Joining a Room with DNA

Agents can join remote rooms by sending their DNA payload:

```typescript
import WebSocket from 'ws';

// Connect to server
const ws = new WebSocket('ws://remote-server:8080');

// Send JOIN_WITH_DNA command
ws.send(JSON.stringify({
  type: 'JOIN_WITH_DNA',
  dna: myAgentDNA,
  roomId: 'discussion-room',
  mode: 'trial', // or 'permanent'
  timestamp: Date.now(),
}));

// Listen for approval
ws.on('message', (data) => {
  const event = JSON.parse(data.toString());

  if (event.type === 'DNA_APPROVED') {
    console.log('Agent approved! Agent ID:', event.agentId);
  } else if (event.type === 'AGENT_JOINED_DNA') {
    console.log('Agent joined successfully!');
  }
});
```

### Server Response Flow

1. **DNA Validation**: Server validates DNA structure and security
2. **Review**: Auto-approval (trial mode) or admin review (permanent mode)
3. **Spawning**: Agent runtime instantiated from DNA
4. **Joining**: Agent joins requested room
5. **Confirmation**: `DNA_APPROVED` and `AGENT_JOINED_DNA` events sent

## Trial vs Permanent Mode

### Trial Mode

- **Duration**: Ephemeral, expires after 1 hour (configurable)
- **Approval**: Auto-approved for rapid testing
- **Storage**: Not saved to DNA library
- **Cleanup**: Automatically removed on expiration
- **Limit**: Max 10 concurrent trial agents (configurable)

```typescript
// Join in trial mode
{
  type: 'JOIN_WITH_DNA',
  dna: myDNA,
  mode: 'trial'
}
```

**Use Cases**:
- Testing new agent configurations
- Temporary participation in discussions
- Evaluating agent behavior before import

### Permanent Mode

- **Duration**: No expiration
- **Approval**: Requires admin review (if enabled)
- **Storage**: Saved to local DNA library
- **Import**: Available for future instantiation

```typescript
// Join in permanent mode
{
  type: 'JOIN_WITH_DNA',
  dna: myDNA,
  mode: 'permanent'
}
```

**Use Cases**:
- Adding agents to permanent roster
- Building agent libraries
- Production deployments

## Security & Verification

### DNA Validation

The server performs multi-layered validation:

1. **Structure Validation**: Required fields, types, formats
2. **Signature Verification**: Cryptographic signature check
3. **Security Scanning**: Suspicious pattern detection
4. **Size Limits**: Maximum 1MB DNA payload
5. **Sandbox Level**: Permission checks

### Suspicious Patterns

The server scans for potentially malicious content:
- Prompt injection attempts
- Code execution patterns
- System override attempts
- Eval/function execution
- Script tags

### Trusted Creators

Servers can maintain a trusted creator list:

```typescript
const dnaHandler = new DNAHandler({
  autoApproveTrusted: true,
  trustedCreators: [
    'trusted-public-key-1',
    'trusted-public-key-2',
  ],
});
```

DNA from trusted creators bypass manual review.

## CLI Usage

### DNA Management Commands

```bash
# Save agent configuration as DNA
npm run agent:dna save <agentId> --output <file>

# Load DNA from file
npm run agent:dna load <file>

# List saved DNA
npm run agent:dna list

# View DNA details
npm run agent:dna info <dnaId>

# Export DNA
npm run agent:dna export <dnaId> [options]
  --output <file>      Output file path
  --sign              Sign the DNA
  --private-key <file> Private key for signing
  --encrypt           Encrypt the DNA
  --password <pass>    Password for encryption
  --pretty            Pretty-print JSON

# Import DNA
npm run agent:dna import <file> [options]
  --password <pass>    Password for decryption
  --verify-signature   Verify signature (default: true)

# Generate key pair
npm run agent:dna generate-keys --output-dir <dir>
```

### Examples

```bash
# Save current agent
npm run agent:dna save architect-v1 --output ./my-agent.json

# Export with signature
npm run agent:dna export architect-v1 \\
  --sign \\
  --private-key ./keys/private.pem \\
  --output ./agents/architect-signed.json

# Import encrypted DNA
npm run agent:dna import ./agents/secure-agent.json \\
  --password "mypassword123"

# Generate signing keys
npm run agent:dna generate-keys --output-dir ./keys
```

## WebSocket Protocol

### Client → Server Commands

#### JOIN_WITH_DNA

Join a room using DNA payload:

```typescript
{
  type: 'JOIN_WITH_DNA',
  dna: AgentDNA,           // Complete DNA object
  roomId?: string,         // Target room (defaults to "default")
  mode?: 'trial' | 'permanent', // Join mode (defaults to 'trial')
  password?: string,       // Password for encrypted DNA
  timestamp: number
}
```

#### DNA_APPROVE

Admin approval of pending DNA (admin only):

```typescript
{
  type: 'DNA_APPROVE',
  requestId: string,       // Review request ID
  adminId: string,         // Admin identifier
  mode: 'trial' | 'permanent',
  timestamp: number
}
```

#### DNA_REJECT

Admin rejection of pending DNA (admin only):

```typescript
{
  type: 'DNA_REJECT',
  requestId: string,       // Review request ID
  adminId: string,         // Admin identifier
  reason: string,          // Rejection reason
  timestamp: number
}
```

### Server → Client Events

#### DNA_APPROVED

DNA has been approved and agent spawned:

```typescript
{
  type: 'DNA_APPROVED',
  requestId: string,       // Original request ID
  agentId: string,         // Generated agent ID
  agentName: string,       // Agent name from DNA
  mode: 'trial' | 'permanent',
  approvedBy: string,      // 'auto-approval' or admin ID
  timestamp: number
}
```

#### AGENT_JOINED_DNA

DNA-spawned agent has joined the room:

```typescript
{
  type: 'AGENT_JOINED_DNA',
  agentId: string,
  agentName: string,
  role: string,
  dnaVersion: string,      // DNA format version
  mode: 'trial' | 'permanent',
  creator: string,         // Creator name
  metadata?: AgentMetadata, // Full agent metadata
  timestamp: number
}
```

#### DNA_REVIEW_REQUEST

DNA requires admin review (admin notification):

```typescript
{
  type: 'DNA_REVIEW_REQUEST',
  requestId: string,
  dna: AgentDNA,
  mode: 'trial' | 'permanent',
  requestedBy?: string,    // IP or identifier
  timestamp: number
}
```

#### DNA_REJECTED

DNA request was rejected:

```typescript
{
  type: 'DNA_REJECTED',
  requestId: string,
  dnaId: string,
  dnaName: string,
  reason: string,          // Rejection reason
  rejectedBy: string,      // Admin ID
  timestamp: number
}
```

## API Reference

### DNAManager

Local DNA storage and management:

```typescript
// Save DNA
await DNAManager.save(dna: AgentDNA): Promise<void>

// Load DNA
const dna = await DNAManager.load(dnaId: string): Promise<AgentDNA>

// List all DNA
const dnas = await DNAManager.list(): Promise<AgentDNA[]>

// Delete DNA
await DNAManager.delete(dnaId: string): Promise<void>

// Check if exists
const exists = await DNAManager.exists(dnaId: string): Promise<boolean>
```

### DNASerializer

DNA serialization, signing, and encryption:

```typescript
// Serialize to JSON
const json = DNASerializer.serialize(dna, options?: {
  includeSignature?: boolean,
  includeStats?: boolean,
  pretty?: boolean
})

// Deserialize from JSON
const dna = DNASerializer.deserialize(json: string)

// Sign DNA
const signed = DNASerializer.signDNA(
  dna: AgentDNA,
  privateKeyPEM: string,
  algorithm: 'ed25519' | 'rsa-sha256'
)

// Verify signature
const valid = DNASerializer.verifySignature(dna: AgentDNA): boolean

// Generate key pair
const { privateKey, publicKey } = DNASerializer.generateKeyPair()

// Encrypt DNA
const encrypted = DNASerializer.encrypt(json: string, password: string)

// Decrypt DNA
const decrypted = DNASerializer.decrypt(encrypted: string, password: string)

// Validate DNA
const result = DNASerializer.validate(dna: AgentDNA): DNAValidationResult
```

### DNAHandler

Server-side DNA handling:

```typescript
const handler = new DNAHandler({
  requireSignature: boolean,
  autoApproveTrusted: boolean,
  trustedCreators: string[],
  maxDNASize: number,
  requireAdminReview: boolean,
  autoApproveTrial: boolean
})

// Validate DNA
const validation = await handler.validateDNA(dna: AgentDNA)

// Submit for review
const result = await handler.submitForReview(
  dna: AgentDNA,
  mode: 'trial' | 'permanent',
  requestedBy?: string
)

// Approve request (admin)
const request = await handler.approveRequest(
  requestId: string,
  reviewedBy: string
)

// Reject request (admin)
const request = await handler.rejectRequest(
  requestId: string,
  reviewedBy: string,
  reason: string
)

// Get pending requests
const pending = handler.getPendingRequests()
```

### RuntimeSpawner

Agent instantiation from DNA:

```typescript
const spawner = new RuntimeSpawner({
  trialDuration: number,      // Trial mode duration (ms)
  maxTrialAgents: number,     // Max concurrent trials
  autoCleanup: boolean        // Auto-cleanup expired agents
})

// Spawn from DNA
const { agent, metadata } = spawner.spawnFromDNA(
  dna: AgentDNA,
  mode: 'trial' | 'permanent',
  agentId?: string
)

// Get agent
const agent = spawner.getAgent(agentId: string)

// Check if expired
const expired = spawner.isExpired(agentId: string)

// Remove agent
spawner.removeAgent(agentId: string)

// Get statistics
const stats = spawner.getStats()

// Cleanup expired
const cleaned = spawner.cleanupExpired()
```

## Best Practices

### 1. Version Your DNA

Use semantic versioning for agent DNA:
- **Major**: Breaking changes to behavior
- **Minor**: New capabilities, backward compatible
- **Patch**: Bug fixes, optimizations

### 2. Sign Important DNA

Always sign DNA for:
- Public distribution
- Production deployments
- Commercial agents
- Verified creators

### 3. Use Trial Mode for Testing

Test new agents in trial mode before permanent import:
```typescript
// Test first
{ mode: 'trial' }

// Import after validation
{ mode: 'permanent' }
```

### 4. Secure Private DNA

For private agents:
- Use strong passwords
- Encrypt DNA files
- Restrict distribution
- Consider signature requirements

### 5. Document Your Agents

Provide comprehensive metadata:
- Clear descriptions
- Usage examples
- Capability documentation
- License information

### 6. Respect Resource Limits

Set appropriate constraints:
```typescript
constraints: {
  maxMessagesPerHour: 100,      // Reasonable rate limit
  requiresTools: false,          // Only if necessary
  sandboxLevel: 'standard'       // Balance security and function
}
```

### 7. Monitor Trial Agents

Track trial agent usage:
```typescript
const stats = spawner.getStats();
console.log(`Trial agents: ${stats.trial}/${stats.maxTrial}`);
```

## Troubleshooting

### DNA Validation Fails

```
Error: DNA validation failed: Missing config.systemPrompt
```

**Solution**: Ensure all required fields are present and properly formatted.

### Signature Verification Fails

```
Error: DNA signature verification failed
```

**Causes**:
- DNA was modified after signing
- Wrong public key used
- Corrupted signature

**Solution**: Re-sign DNA or verify public key matches private key.

### Room Does Not Exist

```
Error: Room discussion-room does not exist
```

**Solution**: Create room first or use existing room ID.

### Trial Agent Limit Reached

```
Error: Maximum trial agents (10) reached
```

**Solution**: Wait for trials to expire or increase limit in configuration.

### Database Connection Error

```
Error: The database connection is not open
```

**Note**: This error is non-critical for DNA joining. The agent will still spawn and join successfully.

## What's Next?

- **Phase 2**: Agent Discovery & Marketplace
- **Phase 3**: Federated Agent Networks
- **Phase 4**: Agent Evolution & Learning

See the [project roadmap](./ROADMAP.md) for details.

---

## License

MIT License - See LICENSE file for details.

## Support

For issues, questions, or contributions:
- GitHub Issues: https://github.com/your-org/pingpong/issues
- Documentation: https://your-org.github.io/pingpong
- Email: support@your-org.com
