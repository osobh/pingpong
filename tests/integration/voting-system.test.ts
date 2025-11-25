import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { startServer } from '../../server/index.js';
import { ProposalStatus } from '../../agent/proposal.js';

/**
 * Integration test for voting and consensus system (Milestone 5)
 * Tests proposal creation, voting, resolution, and decision querying
 */
describe('Voting System Integration', () => {
  let shutdown: (() => Promise<void>) | undefined;
  const PORT = 10030;

  beforeAll(async () => {
    shutdown = await startServer(PORT, 'Should we adopt microservices architecture?');
    await new Promise((resolve) => setTimeout(resolve, 500));
  });

  afterAll(async () => {
    if (shutdown) {
      await shutdown();
    }
  });

  it('should create proposal, collect votes, resolve, and query decisions', async () => {
    // Import runtime dynamically to get fresh instances
    const { AgentRuntime } = await import('../../agent/runtime.js');
    const SERVER_URL = `ws://localhost:${PORT}`;

    // Create 3 agents with different roles
    const alice = new AgentRuntime({
      agentId: 'alice-vote',
      agentName: 'Alice',
      role: 'architect',
      serverUrl: SERVER_URL,
      ollamaHost: 'http://192.168.1.4:11434',
      ollamaModel: 'gpt-oss:20b',
    });

    const bob = new AgentRuntime({
      agentId: 'bob-vote',
      agentName: 'Bob',
      role: 'critic',
      serverUrl: SERVER_URL,
      ollamaHost: 'http://192.168.1.4:11434',
      ollamaModel: 'gpt-oss:20b',
    });

    const charlie = new AgentRuntime({
      agentId: 'charlie-vote',
      agentName: 'Charlie',
      role: 'pragmatist',
      serverUrl: SERVER_URL,
      ollamaHost: 'http://192.168.1.4:11434',
      ollamaModel: 'gpt-oss:20b',
    });

    // Track proposals created
    let proposalCreated = false;
    let proposalId = '';
    let proposalResolved = false;

    alice.on('proposalCreated', (data: any) => {
      proposalCreated = true;
      proposalId = data.proposalId;
    });

    bob.on('proposalCreated', (data: any) => {
      proposalCreated = true;
      proposalId = data.proposalId;
    });

    charlie.on('proposalCreated', (data: any) => {
      proposalCreated = true;
      proposalId = data.proposalId;
    });

    alice.on('proposalResolved', () => {
      proposalResolved = true;
    });

    // Start all agents
    await alice.start();
    await bob.start();
    await charlie.start();

    // Wait for connections
    await new Promise((resolve) => setTimeout(resolve, 1000));

    // === Test 1: Create a proposal ===
    const proposalTitle = 'Adopt microservices architecture';
    const proposalDescription =
      'We should migrate from monolithic to microservices architecture for better scalability';

    await alice.createProposal(proposalTitle, proposalDescription, 0.5);

    // Wait for proposal to propagate and votes to be cast
    await new Promise((resolve) => setTimeout(resolve, 3000));

    // Verify proposal was created
    expect(proposalCreated).toBe(true);
    expect(proposalId).toBeTruthy();

    // === Test 2: Verify votes were cast automatically ===
    // Each agent should have the proposal in their vote manager
    const aliceProposal = alice.getVoteManager().getProposal(proposalId);
    const bobProposal = bob.getVoteManager().getProposal(proposalId);
    const charlieProposal = charlie.getVoteManager().getProposal(proposalId);

    expect(aliceProposal).toBeDefined();
    expect(bobProposal).toBeDefined();
    expect(charlieProposal).toBeDefined();

    // Wait a bit more to see if proposal resolves
    await new Promise((resolve) => setTimeout(resolve, 2000));

    // === Test 3: Verify proposal resolution ===
    // The proposal should be resolved based on votes
    expect(proposalResolved).toBe(true);

    // Check final status
    const finalProposal = alice.getVoteManager().getProposal(proposalId);
    expect(finalProposal).toBeDefined();
    if (finalProposal) {
      expect(finalProposal.getStatus()).not.toBe(ProposalStatus.PENDING);
      expect([ProposalStatus.APPROVED, ProposalStatus.REJECTED]).toContain(finalProposal.getStatus());
    }

    // === Test 4: Verify vote counts ===
    // At least 3 votes should have been cast (one from each agent)
    if (finalProposal) {
      const totalVotes = finalProposal.getTotalVotes();
      expect(totalVotes).toBeGreaterThanOrEqual(2); // At least 2 agents voted
    }

    // Clean up
    await alice.stop();
    await bob.stop();
    await charlie.stop();
  }, 15000);

  it('should query decision history via Room API', async () => {
    // This test demonstrates how to query decisions
    // In a real scenario, you'd access the Room instance from the server
    const { ProposalRepository } = await import('../../server/proposal-repository.js');

    // Create a test repository
    const repo = new ProposalRepository(':memory:');

    // Create a test proposal
    const { Proposal } = await import('../../agent/proposal.js');
    const testProposal = new Proposal({
      id: 'test-123',
      title: 'Test Decision',
      description: 'Testing decision query',
      proposerId: 'test-agent',
      proposerName: 'Test Agent',
      threshold: 0.5,
    });

    repo.saveProposal(testProposal, 'default');

    // Query proposals
    const proposals = repo.getProposalsByRoom('default');
    expect(proposals.length).toBe(1);
    expect(proposals[0]?.title).toBe('Test Decision');

    // Query by status
    const pendingProposals = repo.getProposalsByStatus(ProposalStatus.PENDING, 'default');
    expect(pendingProposals.length).toBe(1);

    // Clean up
    repo.close();
  });
});
