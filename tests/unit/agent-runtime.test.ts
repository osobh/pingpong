import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { startServer } from '../../server/index.js';
import { AgentRuntime } from '../../agent/runtime.js';

/**
 * Test suite for AgentRuntime
 * Tests the orchestration of AgentClient and AgentLLM
 */
describe('AgentRuntime', () => {
  const BASE_PORT = 10000;
  let currentPort = BASE_PORT;
  let serverShutdown: (() => void) | undefined;

  beforeEach(async () => {
    currentPort++;
    serverShutdown = await startServer(currentPort, 'Test Topic');
    await new Promise((resolve) => setTimeout(resolve, 100));
  });

  afterEach(async () => {
    if (serverShutdown) {
      serverShutdown();
      serverShutdown = undefined;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  });

  describe('Initialization', () => {
    it('should create runtime with valid configuration', () => {
      const runtime = new AgentRuntime({
        agentId: 'test-1',
        agentName: 'Alice',
        role: 'architect',
        serverUrl: `ws://localhost:${currentPort}`,
        ollamaHost: 'http://192.168.1.4:11434',
        ollamaModel: 'gpt-oss:20b',
      });

      expect(runtime).toBeDefined();
    });

    it('should throw error with invalid role', () => {
      expect(() => {
        new AgentRuntime({
          agentId: 'test-1',
          agentName: 'Alice',
          role: 'invalid-role' as any,
          serverUrl: `ws://localhost:${currentPort}`,
          ollamaHost: 'http://192.168.1.4:11434',
          ollamaModel: 'gpt-oss:20b',
        });
      }).toThrow();
    });
  });

  describe('Connection', () => {
    it('should connect to server successfully', async () => {
      const runtime = new AgentRuntime({
        agentId: 'test-2',
        agentName: 'Bob',
        role: 'critic',
        serverUrl: `ws://localhost:${currentPort}`,
        ollamaHost: 'http://192.168.1.4:11434',
        ollamaModel: 'gpt-oss:20b',
      });

      const connected = await runtime.start();
      expect(connected).toBe(true);

      await runtime.stop();
    });

    it('should handle connection failure gracefully', async () => {
      const runtime = new AgentRuntime({
        agentId: 'test-3',
        agentName: 'Charlie',
        role: 'pragmatist',
        serverUrl: 'ws://localhost:9999', // Wrong port
        ollamaHost: 'http://192.168.1.4:11434',
        ollamaModel: 'gpt-oss:20b',
      });

      const connected = await runtime.start();
      expect(connected).toBe(false);
    });

    it('should verify Ollama connection on start', async () => {
      const runtime = new AgentRuntime({
        agentId: 'test-4',
        agentName: 'David',
        role: 'architect',
        serverUrl: `ws://localhost:${currentPort}`,
        ollamaHost: 'http://192.168.1.4:11434',
        ollamaModel: 'gpt-oss:20b',
      });

      await expect(runtime.start()).resolves.toBe(true);
      await runtime.stop();
    });
  });

  describe('Message handling', () => {
    it('should respond to welcome event with initial message', async () => {
      const runtime = new AgentRuntime({
        agentId: 'test-5',
        agentName: 'Eve',
        role: 'architect',
        serverUrl: `ws://localhost:${currentPort}`,
        ollamaHost: 'http://192.168.1.4:11434',
        ollamaModel: 'gpt-oss:20b',
      });

      // Track messages sent
      const sentMessages: string[] = [];
      runtime.on('messageSent', (msg: string) => sentMessages.push(msg));

      await runtime.start();

      // Wait for welcome and initial response
      await new Promise((resolve) => setTimeout(resolve, 5000));

      expect(sentMessages.length).toBeGreaterThan(0);

      await runtime.stop();
    }, 10000);

    it('should respond to messages from other agents', async () => {
      const runtime1 = new AgentRuntime({
        agentId: 'test-6',
        agentName: 'Frank',
        role: 'architect',
        serverUrl: `ws://localhost:${currentPort}`,
        ollamaHost: 'http://192.168.1.4:11434',
        ollamaModel: 'gpt-oss:20b',
      });

      const runtime2 = new AgentRuntime({
        agentId: 'test-7',
        agentName: 'Grace',
        role: 'critic',
        serverUrl: `ws://localhost:${currentPort}`,
        ollamaHost: 'http://192.168.1.4:11434',
        ollamaModel: 'gpt-oss:20b',
      });

      // Track responses from runtime2
      const responses: string[] = [];
      runtime2.on('messageReceived', (msg: string) => responses.push(msg));

      await runtime1.start();
      await runtime2.start();

      // Wait for both to connect and send initial messages
      await new Promise((resolve) => setTimeout(resolve, 8000));

      // Runtime2 should have received at least runtime1's initial message
      expect(responses.length).toBeGreaterThan(0);

      await runtime1.stop();
      await runtime2.stop();
    }, 15000);
  });

  describe('Lifecycle', () => {
    it('should stop cleanly', async () => {
      const runtime = new AgentRuntime({
        agentId: 'test-8',
        agentName: 'Henry',
        role: 'pragmatist',
        serverUrl: `ws://localhost:${currentPort}`,
        ollamaHost: 'http://192.168.1.4:11434',
        ollamaModel: 'gpt-oss:20b',
      });

      await runtime.start();
      await runtime.stop();

      // Should be able to check running status
      expect(runtime.isRunning).toBe(false);
    });

    it('should not send messages after stop', async () => {
      const runtime = new AgentRuntime({
        agentId: 'test-9',
        agentName: 'Iris',
        role: 'architect',
        serverUrl: `ws://localhost:${currentPort}`,
        ollamaHost: 'http://192.168.1.4:11434',
        ollamaModel: 'gpt-oss:20b',
      });

      await runtime.start();
      await runtime.stop();

      const sentMessages: string[] = [];
      runtime.on('messageSent', (msg: string) => sentMessages.push(msg));

      await new Promise((resolve) => setTimeout(resolve, 2000));

      expect(sentMessages.length).toBe(0);
    });
  });

  describe('Error handling', () => {
    it('should emit error events for failures', async () => {
      const runtime = new AgentRuntime({
        agentId: 'test-10',
        agentName: 'Jack',
        role: 'critic',
        serverUrl: `ws://localhost:${currentPort}`,
        ollamaHost: 'http://invalid-host:11434', // Invalid Ollama host
        ollamaModel: 'gpt-oss:20b',
      });

      const errors: string[] = [];
      runtime.on('error', (err: Error) => errors.push(err.message));

      await runtime.start();

      // Wait for potential errors
      await new Promise((resolve) => setTimeout(resolve, 1000));

      await runtime.stop();
    });
  });
});
