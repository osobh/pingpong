import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { startServer } from '../../server/index.js';
import { AgentRuntime } from '../../agent/runtime.js';

/**
 * Integration test for Quick Mode (Milestone 6)
 * Tests that 3 simple decisions resolve in under 5 minutes
 * with concise responses and fast consensus
 */
describe('Quick Mode Integration', () => {
  let shutdown: (() => Promise<void>) | undefined;
  const PORT = 10040;

  beforeAll(async () => {
    // Start server in quick mode
    shutdown = await startServer(PORT, 'Tech stack choices', undefined, 'quick');
    await new Promise((resolve) => setTimeout(resolve, 500));
  });

  afterAll(async () => {
    if (shutdown) {
      await shutdown();
    }
  });

  it('should resolve 3 proposals in under 5 minutes with concise responses', async () => {
    const startTime = Date.now();
    const SERVER_URL = `ws://localhost:${PORT}`;

    // Create 3 agents
    const alice = new AgentRuntime({
      agentId: 'alice-quick',
      agentName: 'Alice',
      role: 'architect',
      serverUrl: SERVER_URL,
      ollamaHost: 'http://192.168.1.4:11434',
      ollamaModel: 'gpt-oss:20b',
    });

    const bob = new AgentRuntime({
      agentId: 'bob-quick',
      agentName: 'Bob',
      role: 'critic',
      serverUrl: SERVER_URL,
      ollamaHost: 'http://192.168.1.4:11434',
      ollamaModel: 'gpt-oss:20b',
    });

    const charlie = new AgentRuntime({
      agentId: 'charlie-quick',
      agentName: 'Charlie',
      role: 'pragmatist',
      serverUrl: SERVER_URL,
      ollamaHost: 'http://192.168.1.4:11434',
      ollamaModel: 'gpt-oss:20b',
    });

    // Track responses and proposals
    const responses: string[] = [];
    let proposalsResolved = 0;

    alice.on('messageSent', (content: string) => responses.push(content));
    bob.on('messageSent', (content: string) => responses.push(content));
    charlie.on('messageSent', (content: string) => responses.push(content));

    alice.on('proposalResolved', () => proposalsResolved++);
    bob.on('proposalResolved', () => proposalsResolved++);
    charlie.on('proposalResolved', () => proposalsResolved++);

    // Start all agents
    await alice.start();
    await bob.start();
    await charlie.start();

    // Wait for connections and initial responses
    await new Promise((resolve) => setTimeout(resolve, 2000));

    // Create 3 simple proposals
    await alice.createProposal(
      'Use TypeScript',
      'Should we use TypeScript for the project?',
      0.4 // Quick mode threshold
    );

    await new Promise((resolve) => setTimeout(resolve, 3000));

    await bob.createProposal(
      'Use React',
      'Should we use React for the frontend?',
      0.4
    );

    await new Promise((resolve) => setTimeout(resolve, 3000));

    await charlie.createProposal(
      'Use PostgreSQL',
      'Should we use PostgreSQL for the database?',
      0.4
    );

    // Wait for proposals to be resolved
    await new Promise((resolve) => setTimeout(resolve, 10000));

    const endTime = Date.now();
    const duration = (endTime - startTime) / 1000; // in seconds

    // === Test 1: All 3 proposals should be resolved ===
    expect(proposalsResolved).toBeGreaterThanOrEqual(3);

    // === Test 2: Should complete in under 5 minutes (300 seconds) ===
    expect(duration).toBeLessThan(300);

    // === Test 3: Responses should be concise (1-2 sentences) ===
    // Check at least some responses are concise
    if (responses.length > 0) {
      const avgLength = responses.reduce((sum, r) => sum + r.length, 0) / responses.length;
      // Quick mode responses should average under 200 characters
      expect(avgLength).toBeLessThan(200);
    }

    // Clean up
    await alice.stop();
    await bob.stop();
    await charlie.stop();
  }, 300000); // 5 minute timeout
});
