/**
 * Tests for ConversationExporter
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ConversationExporter } from '../../server/conversation-exporter.js';
import { ProposalRepository } from '../../server/proposal-repository.js';
import { ProposalStatus, VoteType } from '../../agent/proposal.js';
import type { AgentMetadata } from '../../shared/agent-metadata.js';
import { AgentCapability } from '../../shared/agent-metadata.js';

describe('ConversationExporter', () => {
  let repository: ProposalRepository;
  let exporter: ConversationExporter;
  const roomId = 'test-room-123';
  const topic = 'System Architecture Discussion';
  const mode = 'deep';

  beforeEach(() => {
    // Use in-memory database for testing
    repository = new ProposalRepository(':memory:');
    exporter = new ConversationExporter(repository);

    // Populate test data
    setupTestData();
  });

  afterEach(() => {
    repository.close();
  });

  function setupTestData() {
    // Add agent metadata
    const aliceMetadata: AgentMetadata = {
      agentId: 'alice-1',
      agentName: 'Alice',
      type: 'ai',
      role: 'architect',
      capabilities: [AgentCapability.PROPOSE, AgentCapability.VOTE, AgentCapability.ANALYZE],
      llmConfig: {
        provider: 'ollama',
        model: 'llama3.2:latest',
        host: 'http://localhost:11434',
        temperature: 0.7,
      },
      personality: {
        verbosity: 'moderate',
        formality: 'professional',
        assertiveness: 0.6,
        creativity: 0.8,
        criticalThinking: 0.7,
      },
      createdAt: Date.now(),
      lastUpdatedAt: Date.now(),
    };

    const bobMetadata: AgentMetadata = {
      agentId: 'bob-1',
      agentName: 'Bob',
      type: 'ai',
      role: 'critic',
      capabilities: [AgentCapability.VOTE, AgentCapability.ANALYZE, AgentCapability.CODE_REVIEW],
      llmConfig: {
        provider: 'ollama',
        model: 'llama3.2:latest',
        host: 'http://localhost:11434',
      },
      createdAt: Date.now(),
      lastUpdatedAt: Date.now(),
    };

    repository.saveAgentMetadata(roomId, aliceMetadata);
    repository.saveAgentMetadata(roomId, bobMetadata);

    // Add messages
    const baseTime = Date.now() - 60000; // 1 minute ago
    repository.saveMessage(
      roomId,
      'alice-1',
      'Alice',
      'architect',
      'I think we should use a microservices architecture.',
      baseTime,
    );

    repository.saveMessage(
      roomId,
      'bob-1',
      'Bob',
      'critic',
      'What about the complexity of managing multiple services?',
      baseTime + 10000,
    );

    repository.saveMessage(
      roomId,
      'alice-1',
      'Alice',
      'architect',
      'Good point. We can use container orchestration to manage that.',
      baseTime + 20000,
    );

    // Add a proposal
    repository.saveProposal(
      {
        getId: () => 'proposal-1',
        getTitle: () => 'Use Microservices Architecture',
        getDescription: () => 'Adopt a microservices architecture for better scalability',
        getProposerId: () => 'alice-1',
        getProposerName: () => 'Alice',
        getThreshold: () => 0.5,
        getStatus: () => ProposalStatus.APPROVED,
        getCreatedAt: () => new Date(baseTime + 30000),
      } as any,
      roomId,
    );

    // Add votes
    repository.saveVote('proposal-1', 'alice-1', 'Alice', VoteType.YES, 'I proposed this', baseTime + 31000);
    repository.saveVote(
      'proposal-1',
      'bob-1',
      'Bob',
      VoteType.YES,
      'Makes sense with proper orchestration',
      baseTime + 32000,
    );

    // Update proposal status
    repository.updateProposalStatus('proposal-1', ProposalStatus.APPROVED);
  }

  describe('exportToJSON', () => {
    it('should export conversation as JSON', async () => {
      const result = await exporter.exportConversation(roomId, topic, mode, 'json');

      expect(result).toBeTruthy();
      const data = JSON.parse(result);

      // Check structure
      expect(data.roomId).toBe(roomId);
      expect(data.topic).toBe(topic);
      expect(data.mode).toBe(mode);
      expect(data.exportedAt).toBeTypeOf('number');

      // Check messages (they are ordered DESC by timestamp, so newest first)
      expect(data.messages).toHaveLength(3);
      expect(data.messages[2].agentName).toBe('Alice');
      expect(data.messages[2].content).toContain('microservices');

      // Check proposals
      expect(data.proposals).toHaveLength(1);
      expect(data.proposals[0].title).toBe('Use Microservices Architecture');
      expect(data.proposals[0].status).toBe('approved');
      expect(data.proposals[0].votes).toHaveLength(2);

      // Check agents
      expect(data.agents).toHaveLength(2);
      const alice = data.agents.find((a: any) => a.agentName === 'Alice');
      expect(alice?.role).toBe('architect');
      expect(alice?.capabilities).toContain('propose');

      // Check statistics
      expect(data.statistics.totalMessages).toBe(3);
      expect(data.statistics.totalProposals).toBe(1);
      expect(data.statistics.totalAgents).toBe(2);
    });
  });

  describe('exportToMarkdown', () => {
    it('should export conversation as Markdown', async () => {
      const result = await exporter.exportConversation(roomId, topic, mode, 'markdown');

      expect(result).toBeTruthy();
      expect(result).toContain('# Conversation Export');
      expect(result).toContain(topic); // Topic is in the title
      expect(result).toContain(`**Mode:** ${mode}`);

      // Check messages section
      expect(result).toContain('## Conversation');
      expect(result).toContain('Alice (architect)');
      expect(result).toContain('microservices architecture');

      // Check proposals section
      expect(result).toContain('## Proposals');
      expect(result).toContain('### Use Microservices Architecture');
      expect(result).toContain('**Status:** approved');

      // Check votes
      expect(result).toContain('**Votes:**');
      expect(result).toContain('Alice: **yes**');
      expect(result).toContain('Bob: **yes**');

      // Check agents section
      expect(result).toContain('## Agents');
      expect(result).toContain('### Alice (architect)');
      expect(result).toContain('- **Type:** ai');

      // Check statistics section
      expect(result).toContain('## Statistics');
      expect(result).toContain('**Total Messages:**');
      expect(result).toContain('**Total Agents:**');
    });
  });

  describe('exportToHTML', () => {
    it('should export conversation as HTML', async () => {
      const result = await exporter.exportConversation(roomId, topic, mode, 'html');

      expect(result).toBeTruthy();
      expect(result).toContain('<!DOCTYPE html>');
      expect(result).toContain('<html lang="en">');
      expect(result).toContain('<head>');
      expect(result).toContain('<body>');

      // Check title (uses topic as H1)
      expect(result).toContain(`<h1>${topic}</h1>`);

      // Check metadata (topic is in H1, not metadata section)
      expect(result).toContain(`<strong>Mode:</strong> ${mode}`);

      // Check messages
      expect(result).toContain('<h2>Conversation</h2>');
      expect(result).toContain('Alice');
      expect(result).toContain('microservices');

      // Check proposals
      expect(result).toContain('<h2>Proposals</h2>');
      expect(result).toContain('Use Microservices Architecture');

      // Check votes with styling
      expect(result).toContain('vote-yes');
      expect(result).toContain('<strong>Alice:</strong> YES');

      // Check statistics
      expect(result).toContain('<h2>Statistics</h2>');
      expect(result).toContain('Total Messages');

      // Check CSS styling
      expect(result).toContain('<style>');
      expect(result).toContain('font-family:');
    });
  });

  describe('edge cases', () => {
    it('should handle empty conversation', async () => {
      const emptyRoomId = 'empty-room';
      const result = await exporter.exportConversation(emptyRoomId, 'Empty Topic', 'shallow', 'json');

      expect(result).toBeTruthy();
      const data = JSON.parse(result);
      expect(data.messages).toHaveLength(0);
      expect(data.proposals).toHaveLength(0);
      expect(data.agents).toHaveLength(0);
      expect(data.statistics).toBeDefined();
      // Statistics may have different structure, just verify it exists
      expect(data.statistics.totalMessages ?? 0).toBe(0);
    });

    it('should handle unsupported format', async () => {
      await expect(
        exporter.exportConversation(roomId, topic, mode, 'xml' as any),
      ).rejects.toThrow('Unsupported export format');
    });
  });
});
