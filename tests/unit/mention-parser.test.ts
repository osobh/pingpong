import { describe, it, expect } from 'vitest';
import { MentionParser } from '../../agent/mention-parser.js';

/**
 * Test suite for MentionParser
 * Tests @mention parsing and detection in messages
 */
describe('MentionParser', () => {
  describe('Mention extraction', () => {
    it('should extract single @mention', () => {
      const message = '@Alice what do you think about this?';
      const mentions = MentionParser.extractMentions(message);

      expect(mentions).toContain('Alice');
      expect(mentions.length).toBe(1);
    });

    it('should extract multiple @mentions', () => {
      const message = '@Alice and @Bob, what are your thoughts?';
      const mentions = MentionParser.extractMentions(message);

      expect(mentions).toContain('Alice');
      expect(mentions).toContain('Bob');
      expect(mentions.length).toBe(2);
    });

    it('should handle @mentions with underscores', () => {
      const message = '@Alice_Smith can you help?';
      const mentions = MentionParser.extractMentions(message);

      expect(mentions).toContain('Alice_Smith');
    });

    it('should handle @mentions with hyphens', () => {
      const message = '@Alice-Smith please review';
      const mentions = MentionParser.extractMentions(message);

      expect(mentions).toContain('Alice-Smith');
    });

    it('should handle @mentions with numbers', () => {
      const message = '@Agent007 your input please';
      const mentions = MentionParser.extractMentions(message);

      expect(mentions).toContain('Agent007');
    });

    it('should return empty array when no mentions', () => {
      const message = 'This is a regular message without mentions';
      const mentions = MentionParser.extractMentions(message);

      expect(mentions).toEqual([]);
    });

    it('should ignore email addresses', () => {
      const message = 'Contact us at support@example.com';
      const mentions = MentionParser.extractMentions(message);

      expect(mentions).toEqual([]);
    });

    it('should handle @mention at end of sentence', () => {
      const message = 'I agree with @Alice.';
      const mentions = MentionParser.extractMentions(message);

      expect(mentions).toContain('Alice');
    });

    it('should deduplicate repeated @mentions', () => {
      const message = '@Alice I think @Alice should decide';
      const mentions = MentionParser.extractMentions(message);

      expect(mentions).toContain('Alice');
      expect(mentions.length).toBe(1);
    });
  });

  describe('Mention detection', () => {
    it('should detect when agent is mentioned', () => {
      const message = '@Alice what do you think?';
      const isMentioned = MentionParser.isMentioned(message, 'Alice');

      expect(isMentioned).toBe(true);
    });

    it('should detect when agent is not mentioned', () => {
      const message = '@Bob what do you think?';
      const isMentioned = MentionParser.isMentioned(message, 'Alice');

      expect(isMentioned).toBe(false);
    });

    it('should be case-sensitive for agent names', () => {
      const message = '@alice what do you think?';
      const isMentioned = MentionParser.isMentioned(message, 'Alice');

      expect(isMentioned).toBe(false);
    });

    it('should detect mention among multiple mentions', () => {
      const message = '@Alice and @Bob, what do you think?';
      const isAliceMentioned = MentionParser.isMentioned(message, 'Alice');
      const isBobMentioned = MentionParser.isMentioned(message, 'Bob');
      const isCharlieMentioned = MentionParser.isMentioned(message, 'Charlie');

      expect(isAliceMentioned).toBe(true);
      expect(isBobMentioned).toBe(true);
      expect(isCharlieMentioned).toBe(false);
    });
  });

  describe('Has mentions check', () => {
    it('should return true when message has mentions', () => {
      const message = '@Alice can you help?';
      const hasMentions = MentionParser.hasMentions(message);

      expect(hasMentions).toBe(true);
    });

    it('should return false when message has no mentions', () => {
      const message = 'This is a regular message';
      const hasMentions = MentionParser.hasMentions(message);

      expect(hasMentions).toBe(false);
    });
  });

  describe('Edge cases', () => {
    it('should handle empty string', () => {
      const mentions = MentionParser.extractMentions('');
      expect(mentions).toEqual([]);
    });

    it('should handle string with only @ symbol', () => {
      const mentions = MentionParser.extractMentions('@');
      expect(mentions).toEqual([]);
    });

    it('should handle @ followed by whitespace', () => {
      const mentions = MentionParser.extractMentions('@ Alice');
      expect(mentions).toEqual([]);
    });

    it('should handle multiple @ symbols together', () => {
      const mentions = MentionParser.extractMentions('@@Alice');
      expect(mentions).toContain('Alice');
    });

    it('should handle @mention in parentheses', () => {
      const message = 'I agree with (@Alice)';
      const mentions = MentionParser.extractMentions(message);

      expect(mentions).toContain('Alice');
    });

    it('should handle @mention with punctuation', () => {
      const message = '@Alice, @Bob! @Charlie?';
      const mentions = MentionParser.extractMentions(message);

      expect(mentions).toContain('Alice');
      expect(mentions).toContain('Bob');
      expect(mentions).toContain('Charlie');
      expect(mentions.length).toBe(3);
    });
  });
});
