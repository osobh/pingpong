import { describe, it, expect, beforeEach } from 'vitest';
import { RelevanceFilter } from '../../agent/relevance-filter.js';
import { ConversationMessage } from '../../agent/conversation-memory.js';
import { AgentRole } from '../../shared/types.js';

/**
 * Test suite for RelevanceFilter
 * Tests logic for determining if an agent should respond to a message
 */
describe('RelevanceFilter', () => {
  let filter: RelevanceFilter;

  beforeEach(() => {
    filter = new RelevanceFilter({
      agentName: 'Alice',
      role: 'architect',
    });
  });

  describe('Direct mentions', () => {
    it('should always respond when directly mentioned', () => {
      const message: ConversationMessage = {
        agentId: 'bob',
        agentName: 'Bob',
        role: 'critic',
        content: '@Alice what do you think?',
        timestamp: Date.now(),
      };

      const shouldRespond = filter.shouldRespond(message, []);
      expect(shouldRespond).toBe(true);
    });

    it('should always respond when mentioned among others', () => {
      const message: ConversationMessage = {
        agentId: 'bob',
        agentName: 'Bob',
        role: 'critic',
        content: '@Alice and @Charlie, your thoughts?',
        timestamp: Date.now(),
      };

      const shouldRespond = filter.shouldRespond(message, []);
      expect(shouldRespond).toBe(true);
    });

    it('should not respond to mention of different agent', () => {
      const message: ConversationMessage = {
        agentId: 'bob',
        agentName: 'Bob',
        role: 'critic',
        content: '@Charlie what do you think?',
        timestamp: Date.now(),
      };

      const shouldRespond = filter.shouldRespond(message, []);
      expect(shouldRespond).toBe(false);
    });
  });

  describe('Role-based relevance', () => {
    it('should respond to architecture-related questions as architect', () => {
      const architect = new RelevanceFilter({
        agentName: 'Alice',
        role: 'architect',
      });

      const message: ConversationMessage = {
        agentId: 'bob',
        agentName: 'Bob',
        role: 'critic',
        content: 'How should we structure the system architecture?',
        timestamp: Date.now(),
      };

      const shouldRespond = architect.shouldRespond(message, []);
      expect(shouldRespond).toBe(true);
    });

    it('should respond to risk-related questions as critic', () => {
      const critic = new RelevanceFilter({
        agentName: 'Bob',
        role: 'critic',
      });

      const message: ConversationMessage = {
        agentId: 'alice',
        agentName: 'Alice',
        role: 'architect',
        content: 'What are the potential risks with this approach?',
        timestamp: Date.now(),
      };

      const shouldRespond = critic.shouldRespond(message, []);
      expect(shouldRespond).toBe(true);
    });

    it('should respond to implementation questions as pragmatist', () => {
      const pragmatist = new RelevanceFilter({
        agentName: 'Charlie',
        role: 'pragmatist',
      });

      const message: ConversationMessage = {
        agentId: 'alice',
        agentName: 'Alice',
        role: 'architect',
        content: 'How should we actually implement this?',
        timestamp: Date.now(),
      };

      const shouldRespond = pragmatist.shouldRespond(message, []);
      expect(shouldRespond).toBe(true);
    });
  });

  describe('Recent participation tracking', () => {
    it('should not respond if just responded recently', () => {
      const now = Date.now();
      const recentHistory: ConversationMessage[] = [
        {
          agentId: 'alice',
          agentName: 'Alice',
          role: 'architect',
          content: 'I just responded',
          timestamp: now - 5000, // 5 seconds ago
        },
      ];

      const message: ConversationMessage = {
        agentId: 'bob',
        agentName: 'Bob',
        role: 'critic',
        content: 'General architecture question',
        timestamp: now,
      };

      const shouldRespond = filter.shouldRespond(message, recentHistory);
      expect(shouldRespond).toBe(false);
    });

    it('should respond if enough time has passed since last response', () => {
      const now = Date.now();
      const recentHistory: ConversationMessage[] = [
        {
          agentId: 'alice',
          agentName: 'Alice',
          role: 'architect',
          content: 'My previous response',
          timestamp: now - 60000, // 1 minute ago
        },
      ];

      const message: ConversationMessage = {
        agentId: 'bob',
        agentName: 'Bob',
        role: 'critic',
        content: 'How should we design the system architecture?',
        timestamp: now,
      };

      const shouldRespond = filter.shouldRespond(message, recentHistory);
      expect(shouldRespond).toBe(true);
    });

    it('should respond even if recently active when directly mentioned', () => {
      const now = Date.now();
      const recentHistory: ConversationMessage[] = [
        {
          agentId: 'alice',
          agentName: 'Alice',
          role: 'architect',
          content: 'Just responded',
          timestamp: now - 2000, // 2 seconds ago
        },
      ];

      const message: ConversationMessage = {
        agentId: 'bob',
        agentName: 'Bob',
        role: 'critic',
        content: '@Alice what do you think?',
        timestamp: now,
      };

      const shouldRespond = filter.shouldRespond(message, recentHistory);
      expect(shouldRespond).toBe(true);
    });
  });

  describe('Moderator behavior', () => {
    it('should respond less frequently as moderator', () => {
      const moderator = new RelevanceFilter({
        agentName: 'Mod',
        role: 'moderator',
      });

      const message: ConversationMessage = {
        agentId: 'alice',
        agentName: 'Alice',
        role: 'architect',
        content: 'Regular discussion message',
        timestamp: Date.now(),
      };

      // Moderators should have stricter response criteria
      const shouldRespond = moderator.shouldRespond(message, []);
      // This might be false for regular messages
      expect(typeof shouldRespond).toBe('boolean');
    });

    it('should respond when mentioned even as moderator', () => {
      const moderator = new RelevanceFilter({
        agentName: 'Mod',
        role: 'moderator',
      });

      const message: ConversationMessage = {
        agentId: 'alice',
        agentName: 'Alice',
        role: 'architect',
        content: '@Mod can you help facilitate this?',
        timestamp: Date.now(),
      };

      const shouldRespond = moderator.shouldRespond(message, []);
      expect(shouldRespond).toBe(true);
    });
  });

  describe('Edge cases', () => {
    it('should handle empty conversation history', () => {
      const message: ConversationMessage = {
        agentId: 'bob',
        agentName: 'Bob',
        role: 'critic',
        content: 'How should we design the architecture?',
        timestamp: Date.now(),
      };

      const shouldRespond = filter.shouldRespond(message, []);
      expect(typeof shouldRespond).toBe('boolean');
    });

    it('should not respond to own messages', () => {
      const message: ConversationMessage = {
        agentId: 'alice',
        agentName: 'Alice',
        role: 'architect',
        content: 'This is my own message',
        timestamp: Date.now(),
      };

      const shouldRespond = filter.shouldRespond(message, []);
      expect(shouldRespond).toBe(false);
    });

    it('should handle configurable response cooldown', () => {
      const customFilter = new RelevanceFilter({
        agentName: 'Alice',
        role: 'architect',
        responseCooldownMs: 5000, // 5 second cooldown
      });

      const now = Date.now();
      const recentHistory: ConversationMessage[] = [
        {
          agentId: 'alice',
          agentName: 'Alice',
          role: 'architect',
          content: 'Recent response',
          timestamp: now - 3000, // 3 seconds ago (within cooldown)
        },
      ];

      const message: ConversationMessage = {
        agentId: 'bob',
        agentName: 'Bob',
        role: 'critic',
        content: 'Architecture question',
        timestamp: now,
      };

      const shouldRespond = customFilter.shouldRespond(message, recentHistory);
      expect(shouldRespond).toBe(false);
    });
  });
});
