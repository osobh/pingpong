import { describe, it, expect, beforeEach } from 'vitest';
import { ConversationMemory } from '../../agent/conversation-memory.js';

/**
 * Test suite for ConversationMemory
 * Tests conversation history and context management for agents
 */

describe('ConversationMemory', () => {
  let memory: ConversationMemory;

  beforeEach(() => {
    memory = new ConversationMemory();
  });

  describe('Message Storage', () => {
    it('should add a message to memory', () => {
      memory.addMessage({
        agentId: 'alice',
        agentName: 'Alice',
        role: 'architect',
        content: 'We should use microservices',
        timestamp: Date.now(),
      });

      const messages = memory.getRecentMessages();
      expect(messages).toHaveLength(1);
      expect(messages[0].content).toBe('We should use microservices');
    });

    it('should store multiple messages in order', () => {
      const timestamp1 = Date.now();
      const timestamp2 = timestamp1 + 1000;
      const timestamp3 = timestamp2 + 1000;

      memory.addMessage({
        agentId: 'alice',
        agentName: 'Alice',
        role: 'architect',
        content: 'Message 1',
        timestamp: timestamp1,
      });

      memory.addMessage({
        agentId: 'bob',
        agentName: 'Bob',
        role: 'critic',
        content: 'Message 2',
        timestamp: timestamp2,
      });

      memory.addMessage({
        agentId: 'charlie',
        agentName: 'Charlie',
        role: 'pragmatist',
        content: 'Message 3',
        timestamp: timestamp3,
      });

      const messages = memory.getRecentMessages();
      expect(messages).toHaveLength(3);
      expect(messages[0].content).toBe('Message 1');
      expect(messages[1].content).toBe('Message 2');
      expect(messages[2].content).toBe('Message 3');
    });

    it('should store message metadata correctly', () => {
      const timestamp = Date.now();

      memory.addMessage({
        agentId: 'alice',
        agentName: 'Alice',
        role: 'architect',
        content: 'Test message',
        timestamp,
      });

      const messages = memory.getRecentMessages();
      expect(messages[0]).toEqual({
        agentId: 'alice',
        agentName: 'Alice',
        role: 'architect',
        content: 'Test message',
        timestamp,
      });
    });
  });

  describe('Message Retrieval', () => {
    beforeEach(() => {
      // Add sample messages
      for (let i = 0; i < 10; i++) {
        memory.addMessage({
          agentId: `agent-${i}`,
          agentName: `Agent ${i}`,
          role: i % 3 === 0 ? 'architect' : i % 3 === 1 ? 'critic' : 'pragmatist',
          content: `Message ${i}`,
          timestamp: Date.now() + i * 1000,
        });
      }
    });

    it('should retrieve recent messages with default limit', () => {
      const messages = memory.getRecentMessages();
      expect(messages.length).toBeGreaterThan(0);
      expect(messages.length).toBeLessThanOrEqual(10);
    });

    it('should retrieve specific number of recent messages', () => {
      const messages = memory.getRecentMessages(5);
      expect(messages).toHaveLength(5);
      // Should be the last 5 messages
      expect(messages[0].content).toBe('Message 5');
      expect(messages[4].content).toBe('Message 9');
    });

    it('should return all messages when limit exceeds count', () => {
      const messages = memory.getRecentMessages(100);
      expect(messages).toHaveLength(10);
    });

    it('should return empty array when no messages exist', () => {
      const emptyMemory = new ConversationMemory();
      const messages = emptyMemory.getRecentMessages();
      expect(messages).toEqual([]);
    });
  });

  describe('Filtering', () => {
    beforeEach(() => {
      memory.addMessage({
        agentId: 'alice',
        agentName: 'Alice',
        role: 'architect',
        content: 'Alice message 1',
        timestamp: Date.now(),
      });

      memory.addMessage({
        agentId: 'bob',
        agentName: 'Bob',
        role: 'critic',
        content: 'Bob message 1',
        timestamp: Date.now() + 1000,
      });

      memory.addMessage({
        agentId: 'alice',
        agentName: 'Alice',
        role: 'architect',
        content: 'Alice message 2',
        timestamp: Date.now() + 2000,
      });

      memory.addMessage({
        agentId: 'charlie',
        agentName: 'Charlie',
        role: 'pragmatist',
        content: 'Charlie message 1',
        timestamp: Date.now() + 3000,
      });
    });

    it('should filter messages by agentId', () => {
      const aliceMessages = memory.getMessagesByAgent('alice');
      expect(aliceMessages).toHaveLength(2);
      expect(aliceMessages.every((m) => m.agentId === 'alice')).toBe(true);
    });

    it('should filter messages by role', () => {
      const architectMessages = memory.getMessagesByRole('architect');
      expect(architectMessages).toHaveLength(2);
      expect(architectMessages.every((m) => m.role === 'architect')).toBe(true);
    });

    it('should return empty array when filtering by non-existent agent', () => {
      const messages = memory.getMessagesByAgent('nonexistent');
      expect(messages).toEqual([]);
    });

    it('should return empty array when filtering by non-existent role', () => {
      const messages = memory.getMessagesByRole('nonexistent');
      expect(messages).toEqual([]);
    });
  });

  describe('Memory Limits', () => {
    it('should enforce maximum message limit', () => {
      const memory = new ConversationMemory({ maxMessages: 5 });

      // Add 10 messages
      for (let i = 0; i < 10; i++) {
        memory.addMessage({
          agentId: 'agent',
          agentName: 'Agent',
          role: 'architect',
          content: `Message ${i}`,
          timestamp: Date.now() + i * 1000,
        });
      }

      const messages = memory.getRecentMessages();
      expect(messages).toHaveLength(5);
      // Should keep the most recent 5
      expect(messages[0].content).toBe('Message 5');
      expect(messages[4].content).toBe('Message 9');
    });

    it('should have default maximum limit', () => {
      // Add many messages
      for (let i = 0; i < 200; i++) {
        memory.addMessage({
          agentId: 'agent',
          agentName: 'Agent',
          role: 'architect',
          content: `Message ${i}`,
          timestamp: Date.now() + i * 1000,
        });
      }

      const messages = memory.getRecentMessages(200);
      // Should not exceed default max (e.g., 100)
      expect(messages.length).toBeLessThanOrEqual(100);
    });
  });

  describe('Context Building', () => {
    beforeEach(() => {
      const baseTime = Date.now();

      // Add a conversation about microservices
      memory.addMessage({
        agentId: 'alice',
        agentName: 'Alice',
        role: 'architect',
        content: 'Should we use microservices or monolith?',
        timestamp: baseTime,
      });

      memory.addMessage({
        agentId: 'bob',
        agentName: 'Bob',
        role: 'critic',
        content: 'Microservices add complexity',
        timestamp: baseTime + 1000,
      });

      memory.addMessage({
        agentId: 'alice',
        agentName: 'Alice',
        role: 'architect',
        content: 'But they provide better scalability',
        timestamp: baseTime + 2000,
      });

      memory.addMessage({
        agentId: 'charlie',
        agentName: 'Charlie',
        role: 'pragmatist',
        content: 'What about deployment costs?',
        timestamp: baseTime + 3000,
      });
    });

    it('should build context summary from recent messages', () => {
      const context = memory.getContextSummary(3);
      expect(context).toContain('Bob');
      expect(context).toContain('Alice');
      expect(context).toContain('Charlie');
    });

    it('should format context as conversation transcript', () => {
      const context = memory.getContextSummary();
      // Should include speaker names and their messages
      expect(context).toMatch(/Alice:.*Should we use microservices/);
      expect(context).toMatch(/Bob:.*Microservices add complexity/);
    });

    it('should return empty string when no messages exist', () => {
      const emptyMemory = new ConversationMemory();
      const context = emptyMemory.getContextSummary();
      expect(context).toBe('');
    });
  });

  describe('Memory Clearing', () => {
    it('should clear all messages', () => {
      memory.addMessage({
        agentId: 'alice',
        agentName: 'Alice',
        role: 'architect',
        content: 'Test message',
        timestamp: Date.now(),
      });

      expect(memory.getRecentMessages()).toHaveLength(1);

      memory.clear();

      expect(memory.getRecentMessages()).toHaveLength(0);
    });

    it('should allow adding messages after clearing', () => {
      memory.addMessage({
        agentId: 'alice',
        agentName: 'Alice',
        role: 'architect',
        content: 'Message 1',
        timestamp: Date.now(),
      });

      memory.clear();

      memory.addMessage({
        agentId: 'bob',
        agentName: 'Bob',
        role: 'critic',
        content: 'Message 2',
        timestamp: Date.now(),
      });

      const messages = memory.getRecentMessages();
      expect(messages).toHaveLength(1);
      expect(messages[0].content).toBe('Message 2');
    });
  });

  describe('Message Count', () => {
    it('should return zero for empty memory', () => {
      expect(memory.getMessageCount()).toBe(0);
    });

    it('should return correct message count', () => {
      for (let i = 0; i < 5; i++) {
        memory.addMessage({
          agentId: 'agent',
          agentName: 'Agent',
          role: 'architect',
          content: `Message ${i}`,
          timestamp: Date.now() + i * 1000,
        });
      }

      expect(memory.getMessageCount()).toBe(5);
    });

    it('should update count after clearing', () => {
      memory.addMessage({
        agentId: 'alice',
        agentName: 'Alice',
        role: 'architect',
        content: 'Test',
        timestamp: Date.now(),
      });

      expect(memory.getMessageCount()).toBe(1);

      memory.clear();

      expect(memory.getMessageCount()).toBe(0);
    });
  });

  describe('Time-based Retrieval', () => {
    it('should retrieve messages after a specific timestamp', () => {
      const baseTime = Date.now();

      memory.addMessage({
        agentId: 'alice',
        agentName: 'Alice',
        role: 'architect',
        content: 'Message 1',
        timestamp: baseTime,
      });

      memory.addMessage({
        agentId: 'bob',
        agentName: 'Bob',
        role: 'critic',
        content: 'Message 2',
        timestamp: baseTime + 5000,
      });

      memory.addMessage({
        agentId: 'charlie',
        agentName: 'Charlie',
        role: 'pragmatist',
        content: 'Message 3',
        timestamp: baseTime + 10000,
      });

      const messages = memory.getMessagesSince(baseTime + 3000);
      expect(messages).toHaveLength(2);
      expect(messages[0].content).toBe('Message 2');
      expect(messages[1].content).toBe('Message 3');
    });

    it('should return empty array when no messages after timestamp', () => {
      memory.addMessage({
        agentId: 'alice',
        agentName: 'Alice',
        role: 'architect',
        content: 'Message 1',
        timestamp: Date.now(),
      });

      const messages = memory.getMessagesSince(Date.now() + 100000);
      expect(messages).toEqual([]);
    });
  });
});
