# Test Scenarios for PingPong Validation

**Last Updated**: 2025-11-24

This document contains conversation topics and scenarios for testing PingPong at each milestone. Each scenario is designed to validate specific aspects of agent behavior and system functionality.

## Scenario Design Principles

1. **Clear decision point**: Topic should have distinct options or outcomes
2. **Multi-faceted**: Enough complexity for multiple perspectives
3. **Relatable**: Topics agents can reason about without specialized knowledge
4. **Bounded**: Can reach conclusion in 10-20 exchanges
5. **Role-appropriate**: Different roles should have natural contributions

---

## Milestone 1: Two Agents, One Room, One Conversation

**Goal**: Validate basic conversation loop with quality discussion

### Scenario M1-1: Microservices vs Monolith
**Topic**: "Should we build a microservices architecture or start with a monolith?"

**Agents**:
- Architect (Alex)
- Critic (Sam)

**Expected Behaviors**:
- Architect: Systems thinking, scalability, long-term evolution
- Critic: Challenges complexity, questions premature distribution

**Success Criteria**:
- 10+ message exchanges
- Both perspectives represented
- Discussion touches on key tradeoffs (complexity, scalability, team size)
- Natural conclusion or impasse reached

**Exit Indicators**:
- Agents agree on approach (monolith-first or microservices)
- Agents acknowledge it depends on context
- Agents recognize they've covered main points

---

### Scenario M1-2: Database Choice
**Topic**: "Should we use SQL (PostgreSQL) or NoSQL (MongoDB) for our application?"

**Agents**:
- Architect (Alex)
- Pragmatist (Jordan)

**Expected Behaviors**:
- Architect: Data modeling, query patterns, relationships
- Pragmatist: Team familiarity, tooling, operational concerns

**Success Criteria**:
- Discussion covers schema flexibility, transactions, query complexity
- Pragmatic constraints surface (team skills, existing infrastructure)
- Agents reach recommendation or highlight key decision factors

---

### Scenario M1-3: Testing Strategy
**Topic**: "What level of test coverage should we aim for: unit tests, integration tests, or end-to-end tests?"

**Agents**:
- Pragmatist (Jordan)
- Critic (Sam)

**Expected Behaviors**:
- Pragmatist: Test pyramid, ROI, maintenance burden
- Critic: Coverage gaps, false confidence, brittle tests

**Success Criteria**:
- Balanced discussion of test types
- Tradeoffs between coverage and maintenance
- Practical recommendation emerges

---

## Milestone 2: Persistence & Context Recovery

**Goal**: Validate context recovery after agent disconnect/rejoin

### Scenario M2-1: API Design (Multi-Session)
**Topic**: "How should we design our REST API: resource-oriented, RPC-style, or GraphQL?"

**Agents**:
- Architect (Alex)
- Critic (Sam)

**Test Flow**:
1. Agents discuss for 5 messages
2. Architect leaves
3. Critic and Pragmatist (new) discuss for 5 messages
4. Architect rejoins
5. Validate: Does Architect reference earlier points?

**Success Criteria**:
- Context summary is accurate
- Rejoining agent demonstrates awareness of prior discussion
- Conversation continuity maintained
- Architect picks up where they left off

---

### Scenario M2-2: Caching Strategy (Server Restart)
**Topic**: "Should we implement caching at the application layer, database layer, or CDN?"

**Test Flow**:
1. Agents discuss for 8 messages
2. Kill server
3. Restart server
4. Agents reconnect
5. Continue discussion for 7 more messages

**Success Criteria**:
- All messages persist across restart
- Agents receive full context on reconnect
- No lost information
- Discussion continues naturally

---

## Milestone 3: Moderator Agent

**Goal**: Validate moderator facilitates structured discussion

### Scenario M3-1: Architecture Refactoring (Moderated)
**Topic**: "We have a legacy monolith. Should we refactor incrementally, rewrite from scratch, or strangler fig pattern?"

**Agents**:
- Moderator (Morgan)
- Architect (Alex)
- Critic (Sam)

**Expected Moderator Behaviors**:
- Keeps discussion on sub-topics (risks, timeline, team)
- Prompts quiet agents if needed
- Summarizes progress periodically
- Calls for decision when appropriate

**Success Criteria**:
- Moderator guides through 2-3 sub-topics
- Discussion feels structured (not chaotic)
- Clear decision points marked
- Moderator recognizes when topic is resolved

---

### Scenario M3-2: Performance Optimization (Moderated with Tangent)
**Topic**: "Our application is slow. What should we optimize first: database queries, caching, or frontend rendering?"

**Agents**:
- Moderator (Morgan)
- Architect (Alex)
- Pragmatist (Jordan)

**Intentional Tangent**: Architect suggests rewriting in Rust (off-topic)

**Expected Moderator Behaviors**:
- Acknowledges rewrite idea but redirects to topic
- "Let's focus on optimizing what we have first"
- Ensures pragmatic considerations surface

**Success Criteria**:
- Moderator successfully redirects tangent
- Discussion returns to optimization options
- Practical decision reached

---

## Milestone 4: Multi-Agent Dynamics (3+ Agents)

**Goal**: Validate emergent collaboration with multiple distinct roles

### Scenario M4-1: Distributed System Design
**Topic**: "We need to design a distributed task queue. Should we build our own, use RabbitMQ, Redis, or Kafka?"

**Agents** (4):
- Moderator (Morgan)
- Architect (Alex)
- Critic (Sam)
- Pragmatist (Jordan)

**Expected Behaviors**:
- Not all agents respond to every message
- Agents self-select relevant contributions
- Natural clustering: Architect proposes → Critic challenges → Pragmatist weighs in
- Moderator facilitates without micromanaging

**Success Criteria**:
- Each agent contributes from their perspective
- Discussion surfaces tradeoffs not obvious to single thinker
- Good signal-to-noise (no repetitive contributions)
- Decision considers architecture, risks, and feasibility

---

### Scenario M4-2: Security vs Usability
**Topic**: "Should we require 2FA for all users, only admins, or make it optional?"

**Agents** (4):
- Moderator (Morgan)
- Security Expert (Riley)
- User Advocate (Taylor)
- Pragmatist (Jordan)

**Expected Tensions**:
- Security Expert pushes for mandatory 2FA
- User Advocate resists friction
- Pragmatist considers implementation complexity

**Success Criteria**:
- Productive tension between security and UX
- Agents find middle ground or clearly state tradeoffs
- Decision includes rationale addressing all perspectives

---

## Milestone 5: Consensus & Voting

**Goal**: Validate voting mechanisms and decision recording

### Scenario M5-1: Framework Selection
**Topic**: "Our team needs to choose a frontend framework: React, Vue, or Svelte?"

**Agents** (4):
- Moderator (Morgan)
- Architect (Alex)
- Pragmatist (Jordan)
- Researcher (Casey)

**Decision Flow**:
1. Discussion phase (8-10 messages)
2. Moderator calls vote: "[VOTE] Which framework should we use?"
3. Agents submit votes with rationale
4. Server tallies and records decision

**Success Criteria**:
- Voting feels natural in conversation flow
- All agents cast votes with reasoning
- Decision recorded with breakdown
- Queryable: "What did we decide on framework?"

---

### Scenario M5-2: Multi-Decision Discussion
**Topic**: "We're designing an e-commerce checkout flow. Decide: (1) Single-page or multi-step? (2) Guest checkout allowed? (3) Require account creation?"

**Agents** (4):
- Moderator (Morgan)
- Architect (Alex)
- User Advocate (Taylor)
- Pragmatist (Jordan)

**Decision Flow**:
1. Discuss all aspects
2. Moderator triggers votes for each decision point
3. Three separate votes recorded

**Success Criteria**:
- Multiple decisions handled in one conversation
- Each decision has clear outcome and rationale
- Decision log shows all three outcomes
- Minority opinions preserved for each vote

---

## Milestone 6: Quick Decisions vs Deep Deliberation

**Goal**: Validate mode switching and appropriate agent behavior

### Scenario M6-1: Quick Mode - Code Style Decisions
**Topics** (3 rapid decisions):
1. "Tabs or spaces?"
2. "Semicolons in JavaScript?"
3. "Single quotes or double quotes?"

**Mode**: Quick (fast resolution, simple consensus)

**Agents** (2):
- Pragmatist (Jordan)
- Critic (Sam)

**Expected Behaviors**:
- Agents keep responses brief (1-2 paragraphs)
- Quick consensus (2-3 exchanges per topic)
- Moderator not needed (simple topics)

**Success Criteria**:
- All 3 decisions in under 5 minutes
- Agents adapt verbosity (more concise)
- Quick mode maintains pace
- Decisions still have rationale

---

### Scenario M6-2: Deep Mode - System Architecture
**Topic**: "Design a distributed consensus system for our application state."

**Mode**: Deep (extended discussion, thorough exploration)

**Agents** (4):
- Moderator (Morgan)
- Architect (Alex)
- Critic (Sam)
- Researcher (Casey)

**Expected Behaviors**:
- Agents provide detailed analysis (2-3 paragraphs)
- Multiple sub-topics explored (CAP theorem, Paxos vs Raft, failure modes)
- Formal voting on key decisions
- Moderator structures discussion through phases

**Success Criteria**:
- One complex decision thoroughly explored (15+ exchanges)
- Deep mode allows exploration (no rushed consensus)
- Agents adapt verbosity (more detail)
- Final decision includes comprehensive rationale

---

## Validation Rubric

For each scenario, score on 1-5 scale:

### Technical Quality
- **Coherence**: Do responses make sense?
- **Relevance**: Are contributions on-topic?
- **Depth**: Is discussion substantive?

### Role Differentiation
- **Distinctness**: Do roles feel different?
- **Appropriateness**: Do contributions match role?

### Conversation Flow
- **Natural**: Does it flow like real discussion?
- **Progressive**: Does it build vs repeat?
- **Conclusive**: Does it reach resolution?

### System Behavior
- **Reliability**: No crashes or errors?
- **Performance**: Acceptable latency?
- **Correctness**: Features work as designed?

---

## Scenario Testing Log

Use this template to record results:

```markdown
## Test: [Scenario Name]

**Date**: [Date]
**Milestone**: [M1/M2/etc]
**Models Used**: [Llama 3 8B, etc]

### Agents
- [Name] ([Role]): [Model]
- [Name] ([Role]): [Model]

### Results
**Technical Quality**: [Score]/5
- Coherence: [Notes]
- Relevance: [Notes]
- Depth: [Notes]

**Role Differentiation**: [Score]/5
- [Notes on how well roles came through]

**Conversation Flow**: [Score]/5
- Natural: [Yes/No + notes]
- Progressive: [Yes/No + notes]
- Conclusive: [Yes/No + notes]

**System Behavior**: [Score]/5
- Reliability: [Any crashes?]
- Performance: [Latency acceptable?]
- Correctness: [Features working?]

### Sample Exchanges
[Paste 2-3 interesting exchanges]

### Verdict
**Pass/Fail**: [Pass/Fail]
**Blockers**: [Any issues preventing milestone completion?]
**Notes**: [Other observations]
```

---

## Custom Scenario Template

Create domain-specific scenarios:

```markdown
### Scenario [ID]: [Name]
**Topic**: "[Discussion question]"

**Agents** ([N]):
- [Role] ([Name])
- [Role] ([Name])

**Expected Behaviors**:
- [Agent 1]: [Expected contributions]
- [Agent 2]: [Expected contributions]

**Success Criteria**:
- [ ] [Criterion 1]
- [ ] [Criterion 2]
- [ ] [Criterion 3]

**Exit Indicators**:
- [What indicates discussion is complete?]
```

---

## Anti-Patterns to Watch For

### Conversation Loops
**Symptom**: Agents repeat same points
**Check**: Do messages 10-15 add new information?

### Premature Consensus
**Symptom**: Agents agree too quickly without exploring
**Check**: Was topic adequately discussed?

### No Conclusion
**Symptom**: Discussion doesn't resolve
**Check**: Can agents recognize when done?

### Role Collapse
**Symptom**: Agents sound the same
**Check**: Can you identify role from response content?

### Shallow Discussion
**Symptom**: Responses lack depth
**Check**: Are tradeoffs and nuances explored?

---

## Scenario Evolution

As the project matures, add scenarios for:
- **Domain-specific discussions** (your actual use cases)
- **Longer conversations** (50+ messages)
- **Adversarial testing** (agents with opposing goals)
- **Multi-topic threads** (branching discussions)
- **Cross-domain problems** (requiring multiple expertise areas)
