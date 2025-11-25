import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { AgentRuntime } from '../../agent/runtime.js';
import { startServer } from '../../server/index.js';

/**
 * Test suite for 4-agent architectural discussions
 * Tests multi-agent dynamics with @mentions and relevance filtering
 */
describe('Four-Agent Architectural Discussion', () => {
  let shutdown: (() => Promise<void>) | undefined;
  const PORT = 10020;
  const SERVER_URL = `ws://localhost:${PORT}`;

  beforeAll(async () => {
    // Start server with an architectural discussion topic
    shutdown = await startServer(PORT, 'Should we use microservices or monolithic architecture?');
    // Give server time to start
    await new Promise((resolve) => setTimeout(resolve, 500));
  });

  afterAll(async () => {
    if (shutdown) {
      await shutdown();
    }
  });

  it('should facilitate 4-agent discussion with role-based participation and filtering', async () => {
    // Create 4 agents with different roles
    const architect = new AgentRuntime({
      agentId: 'arch-1',
      agentName: 'Alice',
      role: 'architect',
      serverUrl: SERVER_URL,
      ollamaHost: 'http://192.168.1.4:11434',
      ollamaModel: 'gpt-oss:20b',
    });

    const critic = new AgentRuntime({
      agentId: 'critic-1',
      agentName: 'Bob',
      role: 'critic',
      serverUrl: SERVER_URL,
      ollamaHost: 'http://192.168.1.4:11434',
      ollamaModel: 'gpt-oss:20b',
    });

    const pragmatist = new AgentRuntime({
      agentId: 'prag-1',
      agentName: 'Charlie',
      role: 'pragmatist',
      serverUrl: SERVER_URL,
      ollamaHost: 'http://192.168.1.4:11434',
      ollamaModel: 'gpt-oss:20b',
    });

    const moderator = new AgentRuntime({
      agentId: 'mod-1',
      agentName: 'Dana',
      role: 'moderator',
      serverUrl: SERVER_URL,
      ollamaHost: 'http://192.168.1.4:11434',
      ollamaModel: 'gpt-oss:20b',
    });

    // Track messages sent by each agent
    const architectMessages: string[] = [];
    const criticMessages: string[] = [];
    const pragmatistMessages: string[] = [];
    const moderatorMessages: string[] = [];

    architect.on('messageSent', (msg: string) => architectMessages.push(msg));
    critic.on('messageSent', (msg: string) => criticMessages.push(msg));
    pragmatist.on('messageSent', (msg: string) => pragmatistMessages.push(msg));
    moderator.on('messageSent', (msg: string) => moderatorMessages.push(msg));

    // Start all agents
    await architect.start();
    await critic.start();
    await pragmatist.start();
    await moderator.start();

    // Wait for initial responses and some back-and-forth
    // Topic is about architecture, so architect should definitely respond
    // Others may respond based on relevance filter
    await new Promise((resolve) => setTimeout(resolve, 20000));

    // === Test 1: Role-based participation ===
    // Architect should respond to architecture-related topic
    expect(architectMessages.length).toBeGreaterThan(0);

    // At least one other agent should have responded
    // (Topic contains "architecture" and "monolithic" which may trigger multiple roles)
    const totalResponses =
      architectMessages.length +
      criticMessages.length +
      pragmatistMessages.length +
      moderatorMessages.length;

    expect(totalResponses).toBeGreaterThan(2);

    // === Test 2: Message storage ===
    // Check that all agents received and stored messages in memory
    const architectMemory = architect.getMemory();
    const criticMemory = critic.getMemory();
    const pragmatistMemory = pragmatist.getMemory();
    const moderatorMemory = moderator.getMemory();

    expect(architectMemory.getRecentMessages().length).toBeGreaterThan(0);
    expect(criticMemory.getRecentMessages().length).toBeGreaterThan(0);
    expect(pragmatistMemory.getRecentMessages().length).toBeGreaterThan(0);
    expect(moderatorMemory.getRecentMessages().length).toBeGreaterThan(0);

    // === Test 3: Conversation flow tracking (moderator feature) ===
    const flowStats = moderator.getFlowTracker().getFlowStats();
    expect(flowStats.messageCount).toBeGreaterThan(0);
    expect(flowStats.activeTopics.length).toBeGreaterThan(0);

    // === Test 4: Verify different participation patterns ===
    // Check that other agents received Alice's (architect) messages
    const bobsMemory = criticMemory.getRecentMessages();
    const aliceMessagesInBobsMemory = bobsMemory.filter((m) => m.agentName === 'Alice');

    // Bob (critic) should have received at least one message from Alice (architect)
    expect(aliceMessagesInBobsMemory.length).toBeGreaterThan(0);

    // Verify conversation is active and not stalled
    expect(flowStats.isStalled).toBe(false); // Conversation should not be stalled

    // Clean up
    await architect.stop();
    await critic.stop();
    await pragmatist.stop();
    await moderator.stop();
  }, 30000);
});
