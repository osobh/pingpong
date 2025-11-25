import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AgentRuntime } from '../../agent/runtime.js';
import { ProposalStatus } from '../../agent/proposal.js';
import { VoteType } from '../../agent/proposal.js';

/**
 * Integration test for Moderator Agent
 * Tests the full integration of:
 * - Moderator role support
 * - Conversation flow tracking
 * - Stall detection
 * - Consensus integration
 */
describe('Moderator Integration', () => {
  let moderatorRuntime: AgentRuntime;
  let architectRuntime: AgentRuntime;

  const OLLAMA_HOST = 'http://192.168.1.4:11434';
  const MODEL = 'gpt-oss:20b';
  const SERVER_URL = 'ws://localhost:8080';

  beforeEach(() => {
    // Create moderator runtime (without connecting to server)
    moderatorRuntime = new AgentRuntime({
      agentId: 'moderator-1',
      agentName: 'Moderator',
      role: 'moderator',
      serverUrl: SERVER_URL,
      ollamaHost: OLLAMA_HOST,
      ollamaModel: MODEL,
    });

    // Create architect runtime for comparison
    architectRuntime = new AgentRuntime({
      agentId: 'architect-1',
      agentName: 'Architect',
      role: 'architect',
      serverUrl: SERVER_URL,
      ollamaHost: OLLAMA_HOST,
      ollamaModel: MODEL,
    });
  });

  describe('Flow Tracker Integration', () => {
    it('should have access to flow tracker', () => {
      const flowTracker = moderatorRuntime.getFlowTracker();
      expect(flowTracker).toBeDefined();
      expect(flowTracker.getFlowStats).toBeDefined();
    });

    it('should track messages in flow tracker', () => {
      const flowTracker = moderatorRuntime.getFlowTracker();
      const memory = moderatorRuntime.getMemory();

      // Simulate adding messages
      const message1 = {
        agentId: 'agent-1',
        agentName: 'Agent1',
        role: 'architect',
        content: 'We should use microservices',
        timestamp: Date.now(),
      };

      memory.addMessage(message1);
      flowTracker.addMessage(message1);

      const stats = flowTracker.getFlowStats();
      expect(stats.messageCount).toBe(1);
    });

    it('should detect stalled conversations', () => {
      const flowTracker = moderatorRuntime.getFlowTracker();

      // Add old message
      const oldMessage = {
        agentId: 'agent-1',
        agentName: 'Agent1',
        role: 'architect',
        content: 'Old message',
        timestamp: Date.now() - 60000, // 1 minute ago
      };

      flowTracker.addMessage(oldMessage);

      const stats = flowTracker.getFlowStats();
      expect(stats.isStalled).toBe(true);
    });

    it('should detect circular discussions', () => {
      const flowTracker = moderatorRuntime.getFlowTracker();
      const now = Date.now();

      // Add messages that form a circular discussion
      const messages = [
        {
          agentId: 'agent-1',
          agentName: 'Agent1',
          role: 'architect',
          content: 'We should use microservices for scalability',
          timestamp: now,
        },
        {
          agentId: 'agent-2',
          agentName: 'Agent2',
          role: 'critic',
          content: 'Microservices add too much complexity',
          timestamp: now + 1000,
        },
        {
          agentId: 'agent-1',
          agentName: 'Agent1',
          role: 'architect',
          content: 'But microservices give us better scalability',
          timestamp: now + 2000,
        },
        {
          agentId: 'agent-2',
          agentName: 'Agent2',
          role: 'critic',
          content: 'Still, microservices bring complexity',
          timestamp: now + 3000,
        },
      ];

      messages.forEach((msg) => flowTracker.addMessage(msg));

      const stats = flowTracker.getFlowStats();
      expect(stats.isCircular).toBe(true);
    });

    it('should track active topics', () => {
      const flowTracker = moderatorRuntime.getFlowTracker();
      const now = Date.now();

      // Add messages about specific topics
      const messages = [
        {
          agentId: 'agent-1',
          agentName: 'Agent1',
          role: 'architect',
          content: 'We need to discuss database design and microservices',
          timestamp: now,
        },
        {
          agentId: 'agent-2',
          agentName: 'Agent2',
          role: 'critic',
          content: 'The database design should support microservices',
          timestamp: now + 1000,
        },
      ];

      messages.forEach((msg) => flowTracker.addMessage(msg));

      const stats = flowTracker.getFlowStats();
      expect(stats.activeTopics.length).toBeGreaterThan(0);
      expect(stats.activeTopics).toContain('database');
    });
  });

  describe('Vote Manager Integration', () => {
    it('should have access to vote manager', () => {
      const voteManager = moderatorRuntime.getVoteManager();
      expect(voteManager).toBeDefined();
      expect(voteManager.createProposal).toBeDefined();
    });

    it('should track pending proposals', () => {
      const voteManager = moderatorRuntime.getVoteManager();

      // Create a proposal
      const proposalId = voteManager.createProposal({
        title: 'Use microservices',
        description: 'Adopt microservices architecture',
        proposerId: 'agent-1',
        proposerName: 'Agent1',
      });

      expect(voteManager.getPendingCount()).toBe(1);
      expect(voteManager.getProposal(proposalId)).toBeDefined();
    });

    it('should track approved proposals', () => {
      const voteManager = moderatorRuntime.getVoteManager();

      // Create and approve a proposal
      const proposalId = voteManager.createProposal({
        title: 'Use TypeScript',
        description: 'Adopt TypeScript for the project',
        proposerId: 'agent-1',
        proposerName: 'Agent1',
      });

      voteManager.vote(proposalId, 'agent-2', VoteType.YES);
      voteManager.vote(proposalId, 'agent-3', VoteType.YES);
      voteManager.updateProposalStatus(proposalId);

      const approvedProposals = voteManager.getProposalsByStatus(ProposalStatus.APPROVED);
      expect(approvedProposals.length).toBe(1);
    });

    it('should track rejected proposals', () => {
      const voteManager = moderatorRuntime.getVoteManager();

      // Create and reject a proposal
      const proposalId = voteManager.createProposal({
        title: 'Use NoSQL only',
        description: 'Use only NoSQL databases',
        proposerId: 'agent-1',
        proposerName: 'Agent1',
      });

      voteManager.vote(proposalId, 'agent-2', VoteType.NO);
      voteManager.vote(proposalId, 'agent-3', VoteType.NO);
      voteManager.updateProposalStatus(proposalId);

      const rejectedProposals = voteManager.getProposalsByStatus(ProposalStatus.REJECTED);
      expect(rejectedProposals.length).toBe(1);
    });
  });

  describe('Moderator vs Non-Moderator Behavior', () => {
    it('should provide flow tracker to all agents', () => {
      const moderatorFlowTracker = moderatorRuntime.getFlowTracker();
      const architectFlowTracker = architectRuntime.getFlowTracker();

      expect(moderatorFlowTracker).toBeDefined();
      expect(architectFlowTracker).toBeDefined();
    });

    it('should provide vote manager to all agents', () => {
      const moderatorVoteManager = moderatorRuntime.getVoteManager();
      const architectVoteManager = architectRuntime.getVoteManager();

      expect(moderatorVoteManager).toBeDefined();
      expect(architectVoteManager).toBeDefined();
    });
  });

  describe('Memory and Flow Coordination', () => {
    it('should coordinate between memory and flow tracker', () => {
      const memory = moderatorRuntime.getMemory();
      const flowTracker = moderatorRuntime.getFlowTracker();

      const message = {
        agentId: 'agent-1',
        agentName: 'Agent1',
        role: 'architect',
        content: 'Test message',
        timestamp: Date.now(),
      };

      // Add to both
      memory.addMessage(message);
      flowTracker.addMessage(message);

      expect(memory.getMessageCount()).toBe(1);
      expect(flowTracker.getFlowStats().messageCount).toBe(1);
    });

    it('should clear both memory and flow tracker on stop', async () => {
      const memory = moderatorRuntime.getMemory();
      const flowTracker = moderatorRuntime.getFlowTracker();

      // Add message
      const message = {
        agentId: 'agent-1',
        agentName: 'Agent1',
        role: 'architect',
        content: 'Test message',
        timestamp: Date.now(),
      };

      memory.addMessage(message);
      flowTracker.addMessage(message);

      expect(memory.getMessageCount()).toBe(1);
      expect(flowTracker.getFlowStats().messageCount).toBe(1);

      // Stop runtime
      await moderatorRuntime.stop();

      // Verify cleared
      expect(memory.getMessageCount()).toBe(0);
      expect(flowTracker.getFlowStats().messageCount).toBe(0);
    });
  });

  describe('Full Moderator Workflow', () => {
    it('should provide comprehensive context for moderator decision-making', () => {
      const flowTracker = moderatorRuntime.getFlowTracker();
      const voteManager = moderatorRuntime.getVoteManager();
      const memory = moderatorRuntime.getMemory();
      const now = Date.now();

      // Simulate a conversation
      const messages = [
        {
          agentId: 'agent-1',
          agentName: 'Alice',
          role: 'architect',
          content: 'We should use microservices',
          timestamp: now - 10000,
        },
        {
          agentId: 'agent-2',
          agentName: 'Bob',
          role: 'critic',
          content: 'Microservices add complexity',
          timestamp: now - 8000,
        },
        {
          agentId: 'agent-3',
          agentName: 'Charlie',
          role: 'pragmatist',
          content: 'Let\'s start with a modular monolith',
          timestamp: now - 6000,
        },
      ];

      messages.forEach((msg) => {
        memory.addMessage(msg);
        flowTracker.addMessage(msg);
      });

      // Create a proposal
      voteManager.createProposal({
        title: 'Start with modular monolith',
        description: 'Begin with a modular monolith and migrate to microservices later',
        proposerId: 'agent-3',
        proposerName: 'Charlie',
      });

      // Get all context
      const flowStats = flowTracker.getFlowStats();
      const pendingProposals = voteManager.getPendingCount();
      const recentMessages = memory.getRecentMessages(5);

      // Verify moderator has full context
      expect(flowStats.messageCount).toBe(3);
      expect(flowStats.isStalled).toBe(false); // Recent messages
      expect(pendingProposals).toBe(1);
      expect(recentMessages.length).toBe(3);

      // Moderator can now make informed decisions based on:
      // - Conversation flow
      // - Active topics
      // - Pending proposals
      // - Recent message history
    });
  });
});
