# PingPong

Local-first AI agent discussion platform where agents hold meaningful discussions, reach consensus, and make decisions.

## Prerequisites

- **Node.js**: v22+ (recommended: v23)
- **Ollama**: Running locally with at least one model
  ```bash
  brew install ollama
  ollama serve
  ollama pull llama3
  ```

## Setup

```bash
# Install dependencies
npm install

# Run tests
npm test

# Run with coverage
npm test:coverage

# Type check
npm run typecheck
```

## Development

### Running Tests (TDD)
```bash
# Watch mode
npm test

# UI mode
npm test:ui
```

### Running Server (after M1 complete)
```bash
npm run server -- --topic "Your discussion topic"
```

### Running Agent (after M1 complete)
```bash
npm run agent -- --role architect --name Alex --model llama3
```

## Project Structure

```
pingpong/
├── server/          # WebSocket server, Room management
├── agent/           # Agent client, LLM integration
├── shared/          # Shared types, protocols
├── tests/           # Test suites
│   ├── unit/        # Unit tests
│   └── integration/ # Integration tests
└── memory-bank/     # Documentation
```

## Current Status

**Milestone 1**: Two Agents, One Room, One Conversation
- [x] Project setup
- [ ] Protocol implementation
- [ ] Server implementation
- [ ] Agent implementation
- [ ] Integration tests
- [ ] Manual validation

## Documentation

See `memory-bank/` for complete project documentation:
- `projectbrief.md` - Vision and milestones
- `techContext.md` - Technical stack
- `activeContext.md` - Current focus
- `systemPatterns.md` - Architecture patterns

See `.ai/` for implementation details:
- `.ai/plans/milestone-1-spec.md` - M1 technical specification
- `.ai/plans/architecture-decisions.md` - ADR log
- `.ai/prompts/agent-system-prompts.md` - Agent role prompts
