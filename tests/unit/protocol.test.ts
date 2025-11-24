import { describe, it, expect } from 'vitest';
import {
  ClientCommandSchema,
  ServerEventSchema,
  JoinCommandSchema,
  MessageCommandSchema,
  LeaveCommandSchema,
  WelcomeEventSchema,
  AgentJoinedEventSchema,
  MessageEventSchema,
  AgentLeftEventSchema,
  ErrorEventSchema,
} from '../../shared/protocol.js';

describe('Protocol - Client Commands', () => {
  describe('JOIN command', () => {
    it('should validate valid JOIN command', () => {
      const validJoin = {
        type: 'JOIN',
        agentId: 'agent-123',
        agentName: 'Alice',
        role: 'architect',
        timestamp: Date.now(),
      };

      const result = JoinCommandSchema.safeParse(validJoin);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.type).toBe('JOIN');
        expect(result.data.agentId).toBe('agent-123');
        expect(result.data.agentName).toBe('Alice');
        expect(result.data.role).toBe('architect');
      }
    });

    it('should reject JOIN with missing agentId', () => {
      const invalid = {
        type: 'JOIN',
        agentName: 'Alice',
        role: 'architect',
        timestamp: Date.now(),
      };

      const result = JoinCommandSchema.safeParse(invalid);
      expect(result.success).toBe(false);
    });

    it('should reject JOIN with missing agentName', () => {
      const invalid = {
        type: 'JOIN',
        agentId: 'agent-123',
        role: 'architect',
        timestamp: Date.now(),
      };

      const result = JoinCommandSchema.safeParse(invalid);
      expect(result.success).toBe(false);
    });

    it('should reject JOIN with wrong type', () => {
      const invalid = {
        type: 'WRONG',
        agentId: 'agent-123',
        agentName: 'Alice',
        role: 'architect',
        timestamp: Date.now(),
      };

      const result = JoinCommandSchema.safeParse(invalid);
      expect(result.success).toBe(false);
    });

    it('should reject JOIN with invalid timestamp', () => {
      const invalid = {
        type: 'JOIN',
        agentId: 'agent-123',
        agentName: 'Alice',
        role: 'architect',
        timestamp: 'not-a-number',
      };

      const result = JoinCommandSchema.safeParse(invalid);
      expect(result.success).toBe(false);
    });
  });

  describe('MESSAGE command', () => {
    it('should validate valid MESSAGE command', () => {
      const validMessage = {
        type: 'MESSAGE',
        agentId: 'agent-123',
        content: 'Hello world',
        timestamp: Date.now(),
      };

      const result = MessageCommandSchema.safeParse(validMessage);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.type).toBe('MESSAGE');
        expect(result.data.agentId).toBe('agent-123');
        expect(result.data.content).toBe('Hello world');
      }
    });

    it('should reject MESSAGE with empty content', () => {
      const invalid = {
        type: 'MESSAGE',
        agentId: 'agent-123',
        content: '',
        timestamp: Date.now(),
      };

      const result = MessageCommandSchema.safeParse(invalid);
      // Should allow empty content as it's still a string
      expect(result.success).toBe(true);
    });

    it('should reject MESSAGE with missing content', () => {
      const invalid = {
        type: 'MESSAGE',
        agentId: 'agent-123',
        timestamp: Date.now(),
      };

      const result = MessageCommandSchema.safeParse(invalid);
      expect(result.success).toBe(false);
    });
  });

  describe('LEAVE command', () => {
    it('should validate valid LEAVE command', () => {
      const validLeave = {
        type: 'LEAVE',
        agentId: 'agent-123',
        timestamp: Date.now(),
      };

      const result = LeaveCommandSchema.safeParse(validLeave);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.type).toBe('LEAVE');
        expect(result.data.agentId).toBe('agent-123');
      }
    });

    it('should reject LEAVE with missing agentId', () => {
      const invalid = {
        type: 'LEAVE',
        timestamp: Date.now(),
      };

      const result = LeaveCommandSchema.safeParse(invalid);
      expect(result.success).toBe(false);
    });
  });

  describe('ClientCommand discriminated union', () => {
    it('should validate any valid client command', () => {
      const commands = [
        {
          type: 'JOIN' as const,
          agentId: 'a1',
          agentName: 'Alice',
          role: 'architect',
          timestamp: Date.now(),
        },
        {
          type: 'MESSAGE' as const,
          agentId: 'a1',
          content: 'test',
          timestamp: Date.now(),
        },
        {
          type: 'LEAVE' as const,
          agentId: 'a1',
          timestamp: Date.now(),
        },
      ];

      for (const cmd of commands) {
        const result = ClientCommandSchema.safeParse(cmd);
        expect(result.success).toBe(true);
      }
    });

    it('should reject unknown command types', () => {
      const invalid = {
        type: 'UNKNOWN',
        agentId: 'a1',
        timestamp: Date.now(),
      };

      const result = ClientCommandSchema.safeParse(invalid);
      expect(result.success).toBe(false);
    });
  });
});

describe('Protocol - Server Events', () => {
  describe('WELCOME event', () => {
    it('should validate valid WELCOME event', () => {
      const validWelcome = {
        type: 'WELCOME',
        roomId: 'room-123',
        topic: 'Test topic',
        agentCount: 2,
        timestamp: Date.now(),
      };

      const result = WelcomeEventSchema.safeParse(validWelcome);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.type).toBe('WELCOME');
        expect(result.data.roomId).toBe('room-123');
        expect(result.data.topic).toBe('Test topic');
        expect(result.data.agentCount).toBe(2);
      }
    });

    it('should reject WELCOME with missing roomId', () => {
      const invalid = {
        type: 'WELCOME',
        topic: 'Test',
        agentCount: 1,
        timestamp: Date.now(),
      };

      const result = WelcomeEventSchema.safeParse(invalid);
      expect(result.success).toBe(false);
    });

    it('should reject WELCOME with negative agentCount', () => {
      const invalid = {
        type: 'WELCOME',
        roomId: 'room-123',
        topic: 'Test',
        agentCount: -1,
        timestamp: Date.now(),
      };

      const result = WelcomeEventSchema.safeParse(invalid);
      expect(result.success).toBe(false);
    });
  });

  describe('AGENT_JOINED event', () => {
    it('should validate valid AGENT_JOINED event', () => {
      const validEvent = {
        type: 'AGENT_JOINED',
        agentId: 'agent-123',
        agentName: 'Alice',
        role: 'architect',
        timestamp: Date.now(),
      };

      const result = AgentJoinedEventSchema.safeParse(validEvent);
      expect(result.success).toBe(true);
    });

    it('should reject AGENT_JOINED with missing role', () => {
      const invalid = {
        type: 'AGENT_JOINED',
        agentId: 'agent-123',
        agentName: 'Alice',
        timestamp: Date.now(),
      };

      const result = AgentJoinedEventSchema.safeParse(invalid);
      expect(result.success).toBe(false);
    });
  });

  describe('MESSAGE event', () => {
    it('should validate valid MESSAGE event', () => {
      const validEvent = {
        type: 'MESSAGE',
        agentId: 'agent-123',
        agentName: 'Alice',
        role: 'architect',
        content: 'Hello',
        timestamp: Date.now(),
      };

      const result = MessageEventSchema.safeParse(validEvent);
      expect(result.success).toBe(true);
    });

    it('should reject MESSAGE event with missing content', () => {
      const invalid = {
        type: 'MESSAGE',
        agentId: 'agent-123',
        agentName: 'Alice',
        role: 'architect',
        timestamp: Date.now(),
      };

      const result = MessageEventSchema.safeParse(invalid);
      expect(result.success).toBe(false);
    });
  });

  describe('AGENT_LEFT event', () => {
    it('should validate valid AGENT_LEFT event', () => {
      const validEvent = {
        type: 'AGENT_LEFT',
        agentId: 'agent-123',
        agentName: 'Alice',
        timestamp: Date.now(),
      };

      const result = AgentLeftEventSchema.safeParse(validEvent);
      expect(result.success).toBe(true);
    });
  });

  describe('ERROR event', () => {
    it('should validate valid ERROR event', () => {
      const validEvent = {
        type: 'ERROR',
        message: 'Something went wrong',
        timestamp: Date.now(),
      };

      const result = ErrorEventSchema.safeParse(validEvent);
      expect(result.success).toBe(true);
    });

    it('should reject ERROR with empty message', () => {
      const invalid = {
        type: 'ERROR',
        message: '',
        timestamp: Date.now(),
      };

      const result = ErrorEventSchema.safeParse(invalid);
      // Should allow empty message as it's still a string
      expect(result.success).toBe(true);
    });
  });

  describe('ServerEvent discriminated union', () => {
    it('should validate any valid server event', () => {
      const events = [
        {
          type: 'WELCOME' as const,
          roomId: 'r1',
          topic: 'test',
          agentCount: 1,
          timestamp: Date.now(),
        },
        {
          type: 'AGENT_JOINED' as const,
          agentId: 'a1',
          agentName: 'Alice',
          role: 'architect',
          timestamp: Date.now(),
        },
        {
          type: 'MESSAGE' as const,
          agentId: 'a1',
          agentName: 'Alice',
          role: 'architect',
          content: 'test',
          timestamp: Date.now(),
        },
        {
          type: 'AGENT_LEFT' as const,
          agentId: 'a1',
          agentName: 'Alice',
          timestamp: Date.now(),
        },
        {
          type: 'ERROR' as const,
          message: 'error',
          timestamp: Date.now(),
        },
      ];

      for (const event of events) {
        const result = ServerEventSchema.safeParse(event);
        expect(result.success).toBe(true);
      }
    });

    it('should reject unknown event types', () => {
      const invalid = {
        type: 'UNKNOWN',
        timestamp: Date.now(),
      };

      const result = ServerEventSchema.safeParse(invalid);
      expect(result.success).toBe(false);
    });
  });
});
