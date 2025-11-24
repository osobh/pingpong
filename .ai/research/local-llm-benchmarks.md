# Local LLM Benchmarks for PingPong

**Last Updated**: 2025-11-24
**Status**: Planning phase (benchmarks to be run during M1/M2)

## Overview

This document tracks the performance and quality of various local LLM models for PingPong agent conversations. Models will be evaluated on:
1. **Response quality**: Coherence, relevance, depth
2. **Latency**: Time to generate responses
3. **Memory usage**: RAM footprint
4. **Conversation sustainability**: Ability to maintain 10+ exchanges
5. **Role differentiation**: How well agents embody different roles

## Target Models

### Tier 1: Primary Candidates (8B Parameter Range)
- **Llama 3 8B** - Default choice, good balance
- **Llama 3.1 8B** - Improved version with better instruction following
- **Mistral 7B** - Compact, fast, quality responses
- **Phi-3 Medium** - Microsoft's efficient model

### Tier 2: High-Quality Options (70B Range)
- **Llama 3 70B** - Best reasoning, requires significant RAM
- **Mixtral 8x7B** - MoE model, good quality/speed balance

### Tier 3: Fast/Small Options (Testing/Development)
- **Phi-3 Mini** - 3.8B, very fast
- **Qwen 2 7B** - Fast, multilingual
- **Gemma 7B** - Google's compact model

## Evaluation Criteria

### 1. Response Quality (Subjective)
**Score**: 1-5 (1=Poor, 5=Excellent)

**Metrics**:
- Coherence: Does response make sense?
- Relevance: On-topic and contextual?
- Depth: Substantive vs superficial?
- Differentiation: Does role matter?

**Test scenario**: "Should we use microservices or monolith?" with Architect + Critic agents

### 2. Latency (Objective)
**Metrics**:
- First token latency (TTFT)
- Tokens per second (TPS)
- Total response time (for ~200 token response)

**Hardware baseline**: Apple M2 Max, 96GB RAM (specify your actual hardware)

### 3. Memory Usage (Objective)
**Metrics**:
- Model load time
- Memory footprint per agent
- Peak memory with 2-4 agents

**Target**: Keep total memory under 64GB for 4 agents

### 4. Conversation Sustainability (Subjective + Objective)
**Metrics**:
- Do agents loop/repeat?
- Do they reach conclusions?
- How many exchanges before degradation?

**Test**: 20-message conversation on complex topic

### 5. Role Adherence (Subjective)
**Metrics**:
- Does Architect think systemically?
- Does Critic challenge effectively?
- Does Pragmatist focus on feasibility?

## Benchmark Results

### Template (Copy for each model tested)

```markdown
## Model: [Name and size]

**Tested**: [Date]
**Hardware**: [Specify CPU/GPU, RAM]
**Ollama version**: [Version]

### Configuration
- Temperature: 0.7
- Top-p: 0.9
- Max tokens: 500
- Context window: 8192

### Performance Metrics

**Latency**:
- First token: [X ms]
- Tokens/sec: [Y tps]
- Total (200 tokens): [Z seconds]

**Memory**:
- Model size on disk: [GB]
- RAM per agent: [GB]
- 4 agents total: [GB]

### Quality Assessment

**Response Quality**: [1-5]/5
- Coherence: [Notes]
- Relevance: [Notes]
- Depth: [Notes]

**Role Differentiation**: [1-5]/5
- Architect behavior: [Notes]
- Critic behavior: [Notes]
- Pragmatist behavior: [Notes]

**Conversation Sustainability**: [1-5]/5
- Loops/repetition? [Yes/No + notes]
- Reached conclusion? [Yes/No]
- Degradation after N messages: [Number]

### Sample Exchanges
[Paste 2-3 interesting exchanges showing quality]

### Verdict
**Recommended for**: [Milestone X, Role Y, Use case Z]
**Pros**: [List]
**Cons**: [List]
```

---

## Expected Results (Hypotheses)

### Llama 3 8B
**Hypothesis**:
- Good general-purpose quality
- Moderate latency (2-4s per response)
- Memory: ~8GB per agent
- Should sustain 15+ exchanges
- Decent role differentiation

**Best for**: M1 validation, default choice

### Llama 3 70B
**Hypothesis**:
- Excellent reasoning and depth
- Slow latency (10-20s per response)
- Memory: ~40GB per agent (only 2 agents feasible)
- Should sustain 20+ exchanges easily
- Strong role differentiation

**Best for**: M3+ (Moderator role), high-quality discussions

### Mixtral 8x7B
**Hypothesis**:
- Good balance of quality and speed
- Moderate latency (3-6s per response)
- Memory: ~26GB per agent
- Should sustain 15+ exchanges
- Good role differentiation

**Best for**: M2-M4 if 70B too heavy

### Phi-3 Medium
**Hypothesis**:
- Fast responses
- Low latency (1-2s per response)
- Memory: ~8GB per agent
- May struggle with long conversations (context limits)
- Moderate role differentiation

**Best for**: Testing, quick iterations, M1 validation

---

## Benchmarking Protocol

### Step 1: Install Model
```bash
ollama pull llama3
# or
ollama pull llama3:70b
# etc.
```

### Step 2: Run Standard Test
**Topic**: "Should we build a microservices architecture or a monolith?"

**Agents**:
- Agent A: Architect, Name: Alex
- Agent B: Critic, Name: Sam

**Target**: 15 message exchanges

### Step 3: Collect Metrics
- Server logs: message timestamps
- System monitor: RAM usage
- Manual observation: quality notes

### Step 4: Document Results
Fill out template above with actual results

---

## Comparison Matrix (To be filled)

| Model | Size | Latency | Memory/Agent | Quality | Sustainability | Role Diff |
|-------|------|---------|--------------|---------|----------------|-----------|
| Llama 3 8B | 4.7GB | TBD | TBD | TBD | TBD | TBD |
| Llama 3 70B | 40GB | TBD | TBD | TBD | TBD | TBD |
| Mixtral 8x7B | 26GB | TBD | TBD | TBD | TBD | TBD |
| Phi-3 Medium | 7.9GB | TBD | TBD | TBD | TBD | TBD |
| Mistral 7B | 4.1GB | TBD | TBD | TBD | TBD | TBD |

---

## Recommendations (To be updated after benchmarking)

### For Development (M1-M2)
**Recommended**: [TBD after testing]
- Fast iteration
- Low resource usage
- Good enough quality

### For Validation (M3-M4)
**Recommended**: [TBD after testing]
- High quality conversations
- Strong role differentiation
- Can run 4 agents simultaneously

### For Moderator Role (M3+)
**Recommended**: [TBD after testing]
- Best reasoning ability
- Meta-awareness
- May use different model than participants

---

## Future Investigations

### Multi-Model Conversations
- **Question**: Can we use different models for different roles?
  - E.g., Llama 3 70B for Moderator, 8B for participants
- **Hypothesis**: Moderator needs best reasoning, participants can use lighter models
- **Test in**: M3 (Moderator milestone)

### Context Window Optimization
- **Question**: What's the minimum context window for quality?
- **Test**: Vary summary length and recent message count
- **Goal**: Find sweet spot for token budget

### Temperature Tuning
- **Question**: Should different roles have different temperatures?
  - Critic: Higher temperature (more creative challenges)?
  - Pragmatist: Lower temperature (more consistent reasoning)?
- **Test in**: M4 (Multi-agent dynamics)

---

## Notes

- All benchmarks should be run on same hardware for fair comparison
- Use consistent test topics across models
- Document exact Ollama version (model formats change)
- Consider time-of-day (CPU throttling on laptops)
- Run multiple trials for latency measurements

## Benchmark Schedule

- **Week 1 (M1 start)**: Test Llama 3 8B, Phi-3 Medium
- **Week 2 (M1 validation)**: Test Llama 3 70B, Mixtral 8x7B
- **Week 3 (M2 start)**: Test Mistral 7B, finalize recommendations
- **M3+**: Revisit for Moderator-specific needs
