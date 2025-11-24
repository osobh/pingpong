# Product Context

## Problem Statement
Current AI agent frameworks focus on single-agent automation or rigid multi-agent workflows. There's no good way to observe how AI agents with different perspectives naturally discuss, debate, and reach consensus on complex problems. Existing solutions either:
- Lack persistence (conversations lost when process ends)
- Have poor context management (agents can't rejoin mid-conversation)
- Don't support emergent collaboration patterns (everything is scripted)
- Require cloud APIs (cost, latency, privacy concerns)

**PingPong solves this by**: Creating a local-first, persistent environment where specialized AI agents can engage in observable, meaningful discussions with proper context management and decision-tracking.

## Target Users
**Primary**: You (developer/researcher)
- Exploring multi-agent AI dynamics
- Researching agent collaboration patterns
- Prototyping autonomous decision-making systems
- Testing different agent personalities and roles

**Secondary**: Teams experimenting with AI-assisted deliberation
- Using agents to explore design decisions
- Stress-testing architectural proposals
- Generating diverse perspectives on problems

## User Journey

### Initial Setup
1. Start PingPong server (creates room with topic)
2. Launch 2-4 agent clients with different roles
3. Seed conversation with opening question/context

### Observing Conversation
4. Watch agents discuss via CLI or web dashboard
5. See real-time message streaming with timestamps
6. Agents take turns responding based on relevance

### Persistence & Recovery
7. Agent can disconnect/reconnect without losing context
8. Server restart preserves all conversation history
9. Rejoining agent receives summary + recent messages

### Decision Making
10. Moderator guides discussion to decision points
11. Agents vote or reach soft consensus
12. Decisions logged with rationale and breakdown

### Analysis
13. Query conversation for key decisions made
14. Review transcript for emergence patterns
15. Evaluate discussion quality and agent behaviors

## Key Features

### Milestone 1: Basic Conversation
- **Two-agent discussion**: Agents alternate responses on seeded topic
- **Streaming output**: Real-time message display in terminal
- **Graceful lifecycle**: Clean connect/disconnect with proper shutdown
- **Conversation limits**: Auto-stop after N exchanges or timeout
- **Role identification**: Agents identified by name/role in output

### Milestone 2: Persistence & Context
- **Message storage**: All messages saved to SQLite with metadata
- **Context recovery**: LLM-generated summaries for rejoining agents
- **Leave/rejoin**: Agents can disconnect and return with full context
- **Configurable window**: Recent N messages + summary for context efficiency

### Milestone 3: Moderator
- **Facilitation role**: Special agent with orchestration responsibilities
- **Topic management**: Keeps discussion on track, prevents tangents
- **Summarization**: Condenses long threads periodically
- **Consensus detection**: Identifies when decision points are reached
- **Agent prompting**: Calls on quiet agents, balances participation

### Milestone 4: Multi-Agent Dynamics
- **3-4+ agents**: Support for multiple specialized roles
- **Distinct personalities**:
  - Architect (systems thinking, big picture)
  - Critic (challenges assumptions, finds flaws)
  - Pragmatist (feasibility, tradeoffs, constraints)
  - Moderator (orchestration, facilitation)
- **@mention support**: Agents can direct questions to specific others
- **Relevance filtering**: Agents decide "should I respond?" before speaking
- **Natural clustering**: Related responses group without explicit control

### Milestone 5: Consensus & Voting
- **Soft consensus**: "Any objections?" with silence = agreement
- **Explicit voting**: [VOTE] mechanism with tallied responses
- **Decision logging**: Structured records separate from chat log
- **Queryable outcomes**: Retrieve decisions with rationale and votes
- **Dissent tracking**: Minority opinions preserved

### Milestone 6: Conversation Modes
- **Quick mode**: Simple questions, 2-3 exchanges, fast resolution
- **Deep mode**: Complex topics, extended discussion, formal votes
- **Adaptive behavior**: Agents adjust verbosity and depth to mode
- **Mode-specific timeouts**: Quick has aggressive limits, deep allows exploration

## User Experience Goals
- **Observable**: Clear visibility into agent thinking and discussion flow
- **Natural**: Conversations feel organic, not scripted or robotic
- **Insightful**: Discussions surface perspectives you hadn't considered
- **Reliable**: Context recovery works consistently, no "amnesia"
- **Focused**: Moderator keeps things on track without being heavy-handed
- **Decisive**: Discussions reach conclusions, not endless loops

## Business Value
**Research Value**:
- Understand emergence of collaboration patterns in multi-agent systems
- Evaluate effectiveness of different agent roles and personalities
- Test context recovery strategies for long-running conversations

**Practical Value**:
- Prototype for autonomous decision-making systems
- Tool for exploring complex design/architecture decisions
- Testing ground for agent-based deliberation frameworks

**Learning Value**:
- Hands-on experience with LLM orchestration
- Understanding of local LLM capabilities and limitations
- Insights into building durable, stateful agent systems
