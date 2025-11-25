import { describe, it, expect, beforeEach } from 'vitest';
import { ConversationFlowTracker } from '../../agent/conversation-flow-tracker.js';
import { ConversationMessage } from '../../agent/conversation-memory.js';

/**
 * Test suite for ConversationFlowTracker
 * Tests conversation flow analysis, stall detection, and circular discussion detection
 */
describe('ConversationFlowTracker', () => {
  let tracker: ConversationFlowTracker;

  beforeEach(() => {
    tracker = new ConversationFlowTracker();
  });

  describe('Initialization', () => {
    it('should create a new tracker instance', () => {
      expect(tracker).toBeDefined();
    });

    it('should start with zero messages tracked', () => {
      const stats = tracker.getFlowStats();
      expect(stats.messageCount).toBe(0);
    });
  });

  describe('Message tracking', () => {
    it('should track messages over time', () => {
      const msg1: ConversationMessage = {
        agentId: 'alice',
        agentName: 'Alice',
        role: 'architect',
        content: 'We should use microservices',
        timestamp: Date.now(),
      };

      tracker.addMessage(msg1);

      const stats = tracker.getFlowStats();
      expect(stats.messageCount).toBe(1);
    });

    it('should track multiple messages', () => {
      const now = Date.now();
      const messages: ConversationMessage[] = [
        {
          agentId: 'alice',
          agentName: 'Alice',
          role: 'architect',
          content: 'Message 1',
          timestamp: now,
        },
        {
          agentId: 'bob',
          agentName: 'Bob',
          role: 'critic',
          content: 'Message 2',
          timestamp: now + 1000,
        },
        {
          agentId: 'charlie',
          agentName: 'Charlie',
          role: 'pragmatist',
          content: 'Message 3',
          timestamp: now + 2000,
        },
      ];

      messages.forEach((msg) => tracker.addMessage(msg));

      const stats = tracker.getFlowStats();
      expect(stats.messageCount).toBe(3);
    });
  });

  describe('Stall detection', () => {
    it('should detect conversation stall when no recent messages', () => {
      const oldTimestamp = Date.now() - 60000; // 1 minute ago

      const msg: ConversationMessage = {
        agentId: 'alice',
        agentName: 'Alice',
        role: 'architect',
        content: 'Old message',
        timestamp: oldTimestamp,
      };

      tracker.addMessage(msg);

      const isStalled = tracker.isStalled();
      expect(isStalled).toBe(true);
    });

    it('should not detect stall with recent messages', () => {
      const recentTimestamp = Date.now() - 5000; // 5 seconds ago

      const msg: ConversationMessage = {
        agentId: 'alice',
        agentName: 'Alice',
        role: 'architect',
        content: 'Recent message',
        timestamp: recentTimestamp,
      };

      tracker.addMessage(msg);

      const isStalled = tracker.isStalled();
      expect(isStalled).toBe(false);
    });

    it('should allow custom stall threshold', () => {
      const customTracker = new ConversationFlowTracker({ stallThresholdMs: 10000 });
      const timestamp = Date.now() - 15000; // 15 seconds ago

      const msg: ConversationMessage = {
        agentId: 'alice',
        agentName: 'Alice',
        role: 'architect',
        content: 'Message',
        timestamp,
      };

      customTracker.addMessage(msg);

      expect(customTracker.isStalled()).toBe(true);
    });
  });

  describe('Circular discussion detection', () => {
    it('should detect repeated topics', () => {
      const now = Date.now();
      const messages: ConversationMessage[] = [
        {
          agentId: 'alice',
          agentName: 'Alice',
          role: 'architect',
          content: 'We should use microservices for scalability',
          timestamp: now,
        },
        {
          agentId: 'bob',
          agentName: 'Bob',
          role: 'critic',
          content: 'But microservices add complexity',
          timestamp: now + 1000,
        },
        {
          agentId: 'alice',
          agentName: 'Alice',
          role: 'architect',
          content: 'I still think microservices are the way to go for scalability',
          timestamp: now + 2000,
        },
        {
          agentId: 'bob',
          agentName: 'Bob',
          role: 'critic',
          content: 'Again, microservices bring too much complexity',
          timestamp: now + 3000,
        },
      ];

      messages.forEach((msg) => tracker.addMessage(msg));

      const isCircular = tracker.isCircular();
      expect(isCircular).toBe(true);
    });

    it('should not detect circular discussion with diverse topics', () => {
      const now = Date.now();
      const messages: ConversationMessage[] = [
        {
          agentId: 'alice',
          agentName: 'Alice',
          role: 'architect',
          content: 'We should use microservices',
          timestamp: now,
        },
        {
          agentId: 'bob',
          agentName: 'Bob',
          role: 'critic',
          content: 'What about the database schema?',
          timestamp: now + 1000,
        },
        {
          agentId: 'charlie',
          agentName: 'Charlie',
          role: 'pragmatist',
          content: 'Let\'s focus on the API design first',
          timestamp: now + 2000,
        },
      ];

      messages.forEach((msg) => tracker.addMessage(msg));

      const isCircular = tracker.isCircular();
      expect(isCircular).toBe(false);
    });
  });

  describe('Conversation velocity', () => {
    it('should calculate messages per minute', () => {
      const now = Date.now();
      const messages: ConversationMessage[] = [
        {
          agentId: 'alice',
          agentName: 'Alice',
          role: 'architect',
          content: 'Message 1',
          timestamp: now - 120000, // 2 minutes ago
        },
        {
          agentId: 'bob',
          agentName: 'Bob',
          role: 'critic',
          content: 'Message 2',
          timestamp: now - 60000, // 1 minute ago
        },
        {
          agentId: 'charlie',
          agentName: 'Charlie',
          role: 'pragmatist',
          content: 'Message 3',
          timestamp: now,
        },
      ];

      messages.forEach((msg) => tracker.addMessage(msg));

      const stats = tracker.getFlowStats();
      expect(stats.messagesPerMinute).toBeGreaterThan(0);
      expect(stats.messagesPerMinute).toBeLessThanOrEqual(1.5); // 3 messages over 2 minutes
    });

    it('should handle single message velocity', () => {
      const msg: ConversationMessage = {
        agentId: 'alice',
        agentName: 'Alice',
        role: 'architect',
        content: 'Single message',
        timestamp: Date.now(),
      };

      tracker.addMessage(msg);

      const stats = tracker.getFlowStats();
      expect(stats.messagesPerMinute).toBe(0); // Not enough data
    });
  });

  describe('Topic tracking', () => {
    it('should identify current topics being discussed', () => {
      const now = Date.now();
      const messages: ConversationMessage[] = [
        {
          agentId: 'alice',
          agentName: 'Alice',
          role: 'architect',
          content: 'We need to discuss microservices architecture',
          timestamp: now - 5000,
        },
        {
          agentId: 'bob',
          agentName: 'Bob',
          role: 'critic',
          content: 'The microservices approach has risks',
          timestamp: now - 3000,
        },
        {
          agentId: 'charlie',
          agentName: 'Charlie',
          role: 'pragmatist',
          content: 'Let\'s also consider the database design for microservices',
          timestamp: now,
        },
      ];

      messages.forEach((msg) => tracker.addMessage(msg));

      const topics = tracker.getCurrentTopics();
      expect(topics).toContain('microservices');
    });

    it('should extract multiple topics', () => {
      const now = Date.now();
      const messages: ConversationMessage[] = [
        {
          agentId: 'alice',
          agentName: 'Alice',
          role: 'architect',
          content: 'We should use REST API with PostgreSQL database',
          timestamp: now,
        },
        {
          agentId: 'bob',
          agentName: 'Bob',
          role: 'critic',
          content: 'The PostgreSQL database choice is good, but what about the REST API design?',
          timestamp: now + 1000,
        },
      ];

      messages.forEach((msg) => tracker.addMessage(msg));

      const topics = tracker.getCurrentTopics();
      expect(topics.length).toBeGreaterThan(0);
    });
  });

  describe('Flow statistics', () => {
    it('should provide comprehensive flow statistics', () => {
      const now = Date.now();
      const messages: ConversationMessage[] = [
        {
          agentId: 'alice',
          agentName: 'Alice',
          role: 'architect',
          content: 'Message 1',
          timestamp: now - 10000,
        },
        {
          agentId: 'bob',
          agentName: 'Bob',
          role: 'critic',
          content: 'Message 2',
          timestamp: now - 5000,
        },
        {
          agentId: 'charlie',
          agentName: 'Charlie',
          role: 'pragmatist',
          content: 'Message 3',
          timestamp: now,
        },
      ];

      messages.forEach((msg) => tracker.addMessage(msg));

      const stats = tracker.getFlowStats();
      expect(stats.messageCount).toBe(3);
      expect(stats.messagesPerMinute).toBeGreaterThanOrEqual(0);
      expect(stats.isStalled).toBe(false);
      expect(stats.isCircular).toBe(false);
      expect(stats.activeTopics).toBeDefined();
    });
  });

  describe('Reset and clear', () => {
    it('should clear all tracking data', () => {
      const msg: ConversationMessage = {
        agentId: 'alice',
        agentName: 'Alice',
        role: 'architect',
        content: 'Message',
        timestamp: Date.now(),
      };

      tracker.addMessage(msg);
      expect(tracker.getFlowStats().messageCount).toBe(1);

      tracker.clear();
      expect(tracker.getFlowStats().messageCount).toBe(0);
    });
  });
});
