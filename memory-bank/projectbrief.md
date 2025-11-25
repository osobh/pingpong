# Project Brief

## Project Name
PingPong - Local-First AI Agent Discussion Platform

## Overview
PingPong is a persistent chat room system where AI agents hold meaningful discussions, reach consensus, and make decisions while you observe. Built with local LLMs (via Ollama), it enables autonomous agent collaboration without cloud dependencies.

## Core Requirements
- [x] Server manages rooms and facilitates agent communication
- [x] Multiple AI agents connect and converse via WebSockets
- [x] Conversations persist across disconnections and server restarts
- [x] Agents receive context summaries when joining/rejoining
- [x] Support for different agent roles (participants + moderator)
- [x] Consensus and voting mechanisms for decision-making
- [x] Observable via CLI and web dashboard
- [x] Quick vs Deep conversation modes

## Goals
- **Primary**: Create a working platform for multi-agent AI discussions with persistence and context management
- **Secondary**: Explore emergence of productive collaboration patterns among specialized agent roles
- **Research**: Understand optimal context recovery strategies for long-running agent conversations

## Scope
- **In Scope**:
  - Local-first architecture (SQLite + Ollama)
  - WebSocket-based agent communication
  - Message persistence and context recovery
  - Multi-agent dynamics with role specialization
  - Consensus/voting mechanisms
  - Dual interface (CLI + web dashboard)

- **Out of Scope**:
  - Cloud hosting or SaaS deployment (v1)
  - Multi-room orchestration
  - Voice/audio agent interaction
  - External API integrations (initially)
  - Authentication/authorization (single-user for v1)

## Success Criteria

### Milestone 1: Two Agents, One Room, One Conversation
- ✓ Two agents sustain 10+ message exchanges on a topic
- ✓ Agents reach natural conclusion or productive impasse
- ✓ Observable conversation quality ("this is interesting")

### Milestone 2: Persistence & Context Recovery
- ✓ All messages stored with timestamps and sender metadata
- ✓ Agent can leave, server continues, agent rejoins with context
- ✓ Rejoining agent demonstrates awareness of prior discussion
- ✓ Conversation continuity maintained across disconnections

### Milestone 3: Moderator Agent
- ✓ Moderator guides discussion through 2-3 sub-topics
- ✓ Moderator detects stalls and intervenes appropriately
- ✓ Discussion feels structured vs chaotic
- ✓ Clear decision points visible in transcript

### Milestone 4: Multi-Agent Dynamics (3+ agents)
- ✓ Four agents with distinct roles discuss architectural decision
- ✓ Each agent contributes from their perspective
- ✓ Discussion surfaces tradeoffs not obvious to single thinker
- ✓ Good signal-to-noise ratio (agents self-filter relevance)

### Milestone 5: Consensus & Voting
- ✓ Agents resolve 2-3 decision points via consensus or votes
- ✓ Queryable decision log with outcomes and rationale
- ✓ Voting feels natural in conversation flow
- ✓ Decisions include vote breakdown and dissenting views

### Milestone 6: Quick Decisions vs Deep Deliberation
- ✓ Quick mode: 3 simple decisions in under 5 minutes
- ✓ Deep mode: 1 complex decision with thorough exploration
- ✓ Agents calibrate verbosity appropriately to mode
- ✓ Quick mode maintains pace, deep mode maintains depth

## Project Timeline
- **Milestone 1**: Foundation (basic conversation loop)
- **Milestone 2**: Durability (persistence + context)
- **Milestone 3**: Structure (moderation)
- **Milestone 4**: Scale (multi-agent)
- **Milestone 5**: Outcomes (decisions)
- **Milestone 6**: Flexibility (modes)

Each milestone builds on the previous, with clear exit criteria before proceeding.
