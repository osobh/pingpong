/**
 * Integration tests for DNA-based remote agent joining
 * Tests the complete workflow of joining rooms via DNA payload
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { startServer } from '../../server/index.js';
import WebSocket from 'ws';
import type { AgentDNA } from '../../shared/agent-dna.js';
import type {
  ServerEvent,
  DNAApprovedEvent,
  AgentJoinedDNAEvent,
  ErrorEvent,
} from '../../shared/protocol.js';

describe('DNA-based Remote Joining', () => {
  const BASE_PORT = 12000;
  let currentPort = BASE_PORT;
  let serverShutdown: (() => Promise<void>) | undefined;

  beforeEach(async () => {
    currentPort++;
    const { shutdown } = await startServer(currentPort, 'Test topic');
    serverShutdown = shutdown;
    await new Promise((resolve) => setTimeout(resolve, 100));
  });

  afterEach(async () => {
    if (serverShutdown) {
      await serverShutdown();
      serverShutdown = undefined;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  });

  /**
   * Helper to create a test DNA payload
   */
  function createTestDNA(overrides?: Partial<AgentDNA>): AgentDNA {
    return {
      dna_version: '1.0.0',
      id: `test-dna-${Date.now()}`,
      creator: {
        name: 'Test Creator',
        email: 'test@example.com',
        organization: 'Test Org',
      },
      metadata: {
        name: 'Test Agent',
        description: 'A test agent for integration testing',
        version: '1.0.0',
        tags: ['test', 'integration'],
        license: 'MIT',
        visibility: 'public',
      },
      config: {
        systemPrompt: 'You are a helpful test agent for integration testing.',
        role: 'test-agent',
        capabilities: ['propose', 'vote'],
        llm: {
          modelPreference: 'llama3',
          temperature: 0.7,
          maxTokens: 2000,
        },
      },
      constraints: {
        requiresTools: false,
        sandboxLevel: 'standard',
      },
      createdAt: Date.now(),
      updatedAt: Date.now(),
      ...overrides,
    };
  }

  /**
   * Helper to wait for a specific event type
   */
  function waitForEvent<T extends ServerEvent>(
    ws: WebSocket,
    eventType: string,
    timeout = 5000
  ): Promise<T> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`Timeout waiting for event: ${eventType}`));
      }, timeout);

      const handler = (data: WebSocket.Data) => {
        try {
          const event = JSON.parse(data.toString()) as ServerEvent;
          if (event.type === eventType) {
            clearTimeout(timer);
            ws.off('message', handler);
            resolve(event as T);
          }
        } catch (error) {
          // Ignore parse errors
        }
      };

      ws.on('message', handler);
    });
  }

  describe('JOIN_WITH_DNA - Auto-approval (trial mode)', () => {
    it('should auto-approve trial mode and spawn agent', async () => {
      const ws = new WebSocket(`ws://localhost:${currentPort}`);

      await new Promise<void>((resolve) => {
        ws.on('open', () => resolve());
      });

      // Create test DNA
      const dna = createTestDNA();

      // Send JOIN_WITH_DNA command
      ws.send(
        JSON.stringify({
          type: 'JOIN_WITH_DNA',
          dna,
          roomId: 'default',
          mode: 'trial',
          timestamp: Date.now(),
        })
      );

      // Wait for DNA_APPROVED event
      const approvedEvent = await waitForEvent<DNAApprovedEvent>(ws, 'DNA_APPROVED');
      expect(approvedEvent.type).toBe('DNA_APPROVED');
      expect(approvedEvent.agentName).toBe('Test Agent');
      expect(approvedEvent.mode).toBe('trial');
      expect(approvedEvent.approvedBy).toBe('auto-approval');
      expect(approvedEvent.requestId).toBeTruthy();

      // Wait for AGENT_JOINED_DNA event
      const joinedEvent = await waitForEvent<AgentJoinedDNAEvent>(ws, 'AGENT_JOINED_DNA');
      expect(joinedEvent.type).toBe('AGENT_JOINED_DNA');
      expect(joinedEvent.agentName).toBe('Test Agent');
      expect(joinedEvent.role).toBe('test-agent');
      expect(joinedEvent.mode).toBe('trial');
      expect(joinedEvent.creator).toBe('Test Creator');
      expect(joinedEvent.metadata).toBeDefined();

      ws.close();
    });

    it('should spawn agent in permanent mode', async () => {
      const ws = new WebSocket(`ws://localhost:${currentPort}`);

      await new Promise<void>((resolve) => {
        ws.on('open', () => resolve());
      });

      const dna = createTestDNA();

      ws.send(
        JSON.stringify({
          type: 'JOIN_WITH_DNA',
          dna,
          roomId: 'default',
          mode: 'permanent',
          timestamp: Date.now(),
        })
      );

      const approvedEvent = await waitForEvent<DNAApprovedEvent>(ws, 'DNA_APPROVED');
      expect(approvedEvent.mode).toBe('permanent');

      const joinedEvent = await waitForEvent<AgentJoinedDNAEvent>(ws, 'AGENT_JOINED_DNA');
      expect(joinedEvent.mode).toBe('permanent');

      ws.close();
    });

    it('should default to trial mode when mode not specified', async () => {
      const ws = new WebSocket(`ws://localhost:${currentPort}`);

      await new Promise<void>((resolve) => {
        ws.on('open', () => resolve());
      });

      const dna = createTestDNA();

      ws.send(
        JSON.stringify({
          type: 'JOIN_WITH_DNA',
          dna,
          roomId: 'default',
          // mode not specified
          timestamp: Date.now(),
        })
      );

      const approvedEvent = await waitForEvent<DNAApprovedEvent>(ws, 'DNA_APPROVED');
      expect(approvedEvent.mode).toBe('trial');

      ws.close();
    });
  });

  describe('DNA Validation', () => {
    it('should reject DNA with missing required fields', async () => {
      const ws = new WebSocket(`ws://localhost:${currentPort}`);

      await new Promise<void>((resolve) => {
        ws.on('open', () => resolve());
      });

      // Create invalid DNA (missing systemPrompt)
      const invalidDNA = createTestDNA({
        config: {
          systemPrompt: '', // Empty system prompt
          role: 'test-agent',
          capabilities: ['propose'],
          llm: {
            temperature: 0.7,
          },
        },
      });

      ws.send(
        JSON.stringify({
          type: 'JOIN_WITH_DNA',
          dna: invalidDNA,
          roomId: 'default',
          mode: 'trial',
          timestamp: Date.now(),
        })
      );

      const errorEvent = await waitForEvent<ErrorEvent>(ws, 'ERROR');
      expect(errorEvent.type).toBe('ERROR');
      expect(errorEvent.message).toContain('validation failed');

      ws.close();
    });

    it('should reject DNA with invalid semver version', async () => {
      const ws = new WebSocket(`ws://localhost:${currentPort}`);

      await new Promise<void>((resolve) => {
        ws.on('open', () => resolve());
      });

      const invalidDNA = createTestDNA({
        metadata: {
          name: 'Test Agent',
          description: 'Test description',
          version: 'not-semver', // Invalid version format
          tags: [],
          license: 'MIT',
          visibility: 'public',
        },
      });

      ws.send(
        JSON.stringify({
          type: 'JOIN_WITH_DNA',
          dna: invalidDNA,
          roomId: 'default',
          mode: 'trial',
          timestamp: Date.now(),
        })
      );

      const errorEvent = await waitForEvent<ErrorEvent>(ws, 'ERROR');
      expect(errorEvent.type).toBe('ERROR');
      expect(errorEvent.message).toContain('validation failed');

      ws.close();
    });

    it('should reject joining non-existent room', async () => {
      const ws = new WebSocket(`ws://localhost:${currentPort}`);

      await new Promise<void>((resolve) => {
        ws.on('open', () => resolve());
      });

      const dna = createTestDNA();

      ws.send(
        JSON.stringify({
          type: 'JOIN_WITH_DNA',
          dna,
          roomId: 'non-existent-room',
          mode: 'trial',
          timestamp: Date.now(),
        })
      );

      const errorEvent = await waitForEvent<ErrorEvent>(ws, 'ERROR');
      expect(errorEvent.type).toBe('ERROR');
      expect(errorEvent.message).toContain('does not exist');

      ws.close();
    });
  });

  describe('Multiple DNA agents', () => {
    it('should spawn multiple trial agents concurrently', async () => {
      const agents = [];

      // Spawn 3 agents
      for (let i = 0; i < 3; i++) {
        const ws = new WebSocket(`ws://localhost:${currentPort}`);

        await new Promise<void>((resolve) => {
          ws.on('open', () => resolve());
        });

        const dna = createTestDNA({
          id: `test-dna-${i}`,
          metadata: {
            name: `Test Agent ${i}`,
            description: 'Test description',
            version: '1.0.0',
            tags: [],
            license: 'MIT',
            visibility: 'public',
          },
        });

        ws.send(
          JSON.stringify({
            type: 'JOIN_WITH_DNA',
            dna,
            roomId: 'default',
            mode: 'trial',
            timestamp: Date.now(),
          })
        );

        const approvedEvent = await waitForEvent<DNAApprovedEvent>(ws, 'DNA_APPROVED');
        expect(approvedEvent.agentName).toBe(`Test Agent ${i}`);

        agents.push({ ws, agentId: approvedEvent.agentId });
      }

      // Verify all 3 agents spawned
      expect(agents.length).toBe(3);

      // Cleanup
      for (const agent of agents) {
        agent.ws.close();
      }
    });
  });

  describe('DNA Metadata Mapping', () => {
    it('should correctly map DNA to AgentMetadata', async () => {
      const ws = new WebSocket(`ws://localhost:${currentPort}`);

      await new Promise<void>((resolve) => {
        ws.on('open', () => resolve());
      });

      const dna = createTestDNA({
        metadata: {
          name: 'Specialized Agent',
          description: 'A specialized test agent',
          version: '2.1.3',
          tags: ['specialized', 'test', 'advanced'],
          license: 'Apache-2.0',
          visibility: 'public',
        },
        config: {
          systemPrompt: 'You are a specialized agent with advanced capabilities.',
          role: 'specialist',
          capabilities: ['propose', 'vote', 'analyze', 'moderate'],
          llm: {
            modelPreference: 'llama3:70b',
            temperature: 0.8,
            maxTokens: 4000,
          },
          personality: {
            verbosity: 'verbose',
            formality: 'formal',
          },
        },
        constraints: {
          maxMessagesPerHour: 100,
          requiresTools: true,
          sandboxLevel: 'strict',
        },
      });

      ws.send(
        JSON.stringify({
          type: 'JOIN_WITH_DNA',
          dna,
          roomId: 'default',
          mode: 'trial',
          timestamp: Date.now(),
        })
      );

      const joinedEvent = await waitForEvent<AgentJoinedDNAEvent>(ws, 'AGENT_JOINED_DNA');

      // Verify metadata mapping
      expect(joinedEvent.metadata).toBeDefined();
      expect(joinedEvent.metadata!.agentName).toBe('Specialized Agent');
      expect(joinedEvent.metadata!.version).toBe('2.1.3');
      expect(joinedEvent.metadata!.role).toBe('specialist');
      expect(joinedEvent.metadata!.capabilities).toContain('propose');
      expect(joinedEvent.metadata!.capabilities).toContain('vote');
      expect(joinedEvent.metadata!.capabilities).toContain('analyze');
      expect(joinedEvent.metadata!.capabilities).toContain('moderate');
      expect(joinedEvent.metadata!.llmConfig.model).toBe('llama3:70b');
      expect(joinedEvent.metadata!.llmConfig.temperature).toBe(0.8);
      expect(joinedEvent.metadata!.llmConfig.maxTokens).toBe(4000);
      expect(joinedEvent.metadata!.personality?.verbosity).toBe('verbose');
      expect(joinedEvent.metadata!.personality?.formality).toBe('formal');

      // Verify custom metadata contains DNA-specific info
      expect(joinedEvent.metadata!.custom).toBeDefined();
      expect(joinedEvent.metadata!.custom.dnaId).toBe(dna.id);
      expect(joinedEvent.metadata!.custom.creator.name).toBe('Test Creator');
      expect(joinedEvent.metadata!.custom.tags).toEqual(['specialized', 'test', 'advanced']);
      expect(joinedEvent.metadata!.custom.constraints.maxMessagesPerHour).toBe(100);
      expect(joinedEvent.metadata!.custom.constraints.requiresTools).toBe(true);
      expect(joinedEvent.metadata!.custom.constraints.sandboxLevel).toBe('strict');

      ws.close();
    });
  });

  describe('Error Handling', () => {
    it('should handle malformed DNA gracefully', async () => {
      const ws = new WebSocket(`ws://localhost:${currentPort}`);

      await new Promise<void>((resolve) => {
        ws.on('open', () => resolve());
      });

      // Send malformed DNA (missing critical fields)
      ws.send(
        JSON.stringify({
          type: 'JOIN_WITH_DNA',
          dna: {
            id: 'malformed',
            // Missing most required fields
          },
          roomId: 'default',
          mode: 'trial',
          timestamp: Date.now(),
        })
      );

      const errorEvent = await waitForEvent<ErrorEvent>(ws, 'ERROR');
      expect(errorEvent.type).toBe('ERROR');
      expect(errorEvent.message).toBeDefined();

      ws.close();
    });

    it('should handle WebSocket disconnect during DNA processing', async () => {
      const ws = new WebSocket(`ws://localhost:${currentPort}`);

      await new Promise<void>((resolve) => {
        ws.on('open', () => resolve());
      });

      const dna = createTestDNA();

      ws.send(
        JSON.stringify({
          type: 'JOIN_WITH_DNA',
          dna,
          roomId: 'default',
          mode: 'trial',
          timestamp: Date.now(),
        })
      );

      // Immediately close connection
      ws.close();

      // Wait a bit to ensure server handles disconnect
      await new Promise((resolve) => setTimeout(resolve, 200));

      // No assertion needed - test passes if no server crash
    });
  });
});
