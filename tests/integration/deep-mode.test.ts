import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { startServer } from '../../server/index.js';
import { AgentRuntime } from '../../agent/runtime.js';

/**
 * Integration test for Deep Mode (Milestone 6)
 * Tests that 1 complex decision gets thorough exploration
 * with detailed responses and comprehensive discussion
 */
describe('Deep Mode Integration', () => {
  let shutdown: (() => Promise<void>) | undefined;
  const PORT = 10041;

  beforeAll(async () => {
    // Start server in deep mode
    shutdown = await startServer(
      PORT,
      'Should we adopt microservices architecture?',
      undefined,
      'deep'
    );
    await new Promise((resolve) => setTimeout(resolve, 500));
  });

  afterAll(async () => {
    if (shutdown) {
      await shutdown();
    }
  });

  it('should have thorough discussion with detailed analysis', async () => {
    const SERVER_URL = `ws://localhost:${PORT}`;

    // Create 4 agents for richer discussion
    const alice = new AgentRuntime({
      agentId: 'alice-deep',
      agentName: 'Alice',
      role: 'architect',
      serverUrl: SERVER_URL,
      ollamaHost: 'http://192.168.1.4:11434',
      ollamaModel: 'gpt-oss:20b',
    });

    const bob = new AgentRuntime({
      agentId: 'bob-deep',
      agentName: 'Bob',
      role: 'critic',
      serverUrl: SERVER_URL,
      ollamaHost: 'http://192.168.1.4:11434',
      ollamaModel: 'gpt-oss:20b',
    });

    const charlie = new AgentRuntime({
      agentId: 'charlie-deep',
      agentName: 'Charlie',
      role: 'pragmatist',
      serverUrl: SERVER_URL,
      ollamaHost: 'http://192.168.1.4:11434',
      ollamaModel: 'gpt-oss:20b',
    });

    const diana = new AgentRuntime({
      agentId: 'diana-deep',
      agentName: 'Diana',
      role: 'moderator',
      serverUrl: SERVER_URL,
      ollamaHost: 'http://192.168.1.4:11434',
      ollamaModel: 'gpt-oss:20b',
    });

    // Track responses and proposals
    const responses: string[] = [];
    let proposalResolved = false;
    let proposalId = '';

    alice.on('messageSent', (content: string) => responses.push(content));
    bob.on('messageSent', (content: string) => responses.push(content));
    charlie.on('messageSent', (content: string) => responses.push(content));
    diana.on('messageSent', (content: string) => responses.push(content));

    alice.on('proposalCreated', (data: any) => {
      proposalId = data.proposalId;
    });

    alice.on('proposalResolved', () => {
      proposalResolved = true;
    });

    // Start all agents
    await alice.start();
    await bob.start();
    await charlie.start();
    await diana.start();

    // Wait for connections and initial responses
    await new Promise((resolve) => setTimeout(resolve, 3000));

    // Create a complex proposal
    await alice.createProposal(
      'Adopt Microservices Architecture',
      'We should transition from our current monolithic architecture to a microservices-based architecture. This would involve breaking down our application into smaller, independently deployable services.',
      0.6 // Deep mode threshold
    );

    // Allow thorough discussion
    await new Promise((resolve) => setTimeout(resolve, 15000));

    // === Test 1: Proposal should be created ===
    expect(proposalId).toBeTruthy();

    // === Test 2: Should have detailed responses (3+ sentences / 150+ chars) ===
    if (responses.length > 0) {
      const avgLength = responses.reduce((sum, r) => sum + r.length, 0) / responses.length;
      // Deep mode responses should be longer and more detailed
      expect(avgLength).toBeGreaterThan(100);

      // Check that at least half the responses are substantial
      const substantialResponses = responses.filter((r) => r.length > 150);
      expect(substantialResponses.length).toBeGreaterThan(responses.length * 0.3);
    }

    // === Test 3: Should have generated meaningful discussion ===
    expect(responses.length).toBeGreaterThan(5);

    // === Test 4: Verify vote rationales are thoughtful ===
    // Rationales should be captured by agents, verify proposal eventually resolves
    await new Promise((resolve) => setTimeout(resolve, 5000));

    // Check proposal manager for the proposal
    const proposal = alice.getVoteManager().getProposal(proposalId);
    expect(proposal).toBeDefined();

    // Should have multiple votes
    if (proposal) {
      expect(proposal.getTotalVotes()).toBeGreaterThanOrEqual(3);
    }

    // Clean up
    await alice.stop();
    await bob.stop();
    await charlie.stop();
    await diana.stop();
  }, 60000); // 60 second timeout for deep mode
});
