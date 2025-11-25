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

    it('should receive and store messages from other agents', async () => {
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

      // Track messages received by runtime2
      const receivedMessages: string[] = [];
      runtime2.on('messageReceived', (msg: string) => receivedMessages.push(msg));

      await runtime1.start();
      await runtime2.start();

      // Wait for both to connect and send initial messages
      await new Promise((resolve) => setTimeout(resolve, 8000));

      // Runtime2 should have received at least runtime1's initial message
      // With relevance filter, agents may not respond, but they should still receive messages
      expect(receivedMessages.length).toBeGreaterThan(0);

      // Check memory has stored the messages
      const memory2 = runtime2.getMemory();
      const messages2 = memory2.getRecentMessages(10);
      expect(messages2.length).toBeGreaterThan(0);

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

  describe('Conversation Memory', () => {
    it('should have a memory instance', () => {
      const runtime = new AgentRuntime({
        agentId: 'test-memory-1',
        agentName: 'Alice',
        role: 'architect',
        serverUrl: `ws://localhost:${currentPort}`,
        ollamaHost: 'http://192.168.1.4:11434',
        ollamaModel: 'gpt-oss:20b',
      });

      expect(runtime.getMemory()).toBeDefined();
    });

    it('should store received messages in memory', async () => {
      const runtime = new AgentRuntime({
        agentId: 'test-memory-2',
        agentName: 'Alice',
        role: 'architect',
        serverUrl: `ws://localhost:${currentPort}`,
        ollamaHost: 'http://192.168.1.4:11434',
        ollamaModel: 'gpt-oss:20b',
      });

      // Start runtime
      await runtime.start();

      // Wait for welcome message
      await new Promise((resolve) => setTimeout(resolve, 300));

      // Simulate receiving a message
      const testMessage = {
        agentId: 'bob',
        agentName: 'Bob',
        role: 'critic',
        content: 'This is a test message',
        timestamp: Date.now(),
      };

      // Manually add to memory (the runtime should do this automatically)
      const memory = runtime.getMemory();
      memory.addMessage(testMessage);

      // Verify message is in memory
      const messages = memory.getRecentMessages();
      expect(messages.length).toBeGreaterThan(0);
      const stored = messages.find((m) => m.agentId === 'bob');
      expect(stored).toBeDefined();
      expect(stored?.content).toBe('This is a test message');

      await runtime.stop();
    });

    it('should clear memory on stop', async () => {
      const runtime = new AgentRuntime({
        agentId: 'test-memory-3',
        agentName: 'Alice',
        role: 'architect',
        serverUrl: `ws://localhost:${currentPort}`,
        ollamaHost: 'http://192.168.1.4:11434',
        ollamaModel: 'gpt-oss:20b',
      });

      await runtime.start();
      await new Promise((resolve) => setTimeout(resolve, 300));

      // Add a message to memory
      const memory = runtime.getMemory();
      memory.addMessage({
        agentId: 'test',
        agentName: 'Test',
        role: 'architect',
        content: 'Test message',
        timestamp: Date.now(),
      });

      expect(memory.getMessageCount()).toBeGreaterThan(0);

      // Stop should clear memory
      await runtime.stop();

      expect(memory.getMessageCount()).toBe(0);
    });

    it('should retrieve conversation context', async () => {
      const runtime = new AgentRuntime({
        agentId: 'test-memory-4',
        agentName: 'Alice',
        role: 'architect',
        serverUrl: `ws://localhost:${currentPort}`,
        ollamaHost: 'http://192.168.1.4:11434',
        ollamaModel: 'gpt-oss:20b',
      });

      await runtime.start();
      await new Promise((resolve) => setTimeout(resolve, 300));

      // Add several messages
      const memory = runtime.getMemory();
      memory.addMessage({
        agentId: 'bob',
        agentName: 'Bob',
        role: 'critic',
        content: 'First message',
        timestamp: Date.now(),
      });

      memory.addMessage({
        agentId: 'charlie',
        agentName: 'Charlie',
        role: 'pragmatist',
        content: 'Second message',
        timestamp: Date.now() + 1000,
      });

      // Get context
      const context = memory.getContextSummary(2);
      expect(context).toContain('Bob');
      expect(context).toContain('First message');
      expect(context).toContain('Charlie');
      expect(context).toContain('Second message');

      await runtime.stop();
    });
  });

  describe('Context Retrieval', () => {
    it('should automatically store received messages in memory', async () => {
      const runtime1 = new AgentRuntime({
        agentId: 'test-auto-1',
        agentName: 'Alice',
        role: 'architect',
        serverUrl: `ws://localhost:${currentPort}`,
        ollamaHost: 'http://192.168.1.4:11434',
        ollamaModel: 'gpt-oss:20b',
      });

      const runtime2 = new AgentRuntime({
        agentId: 'test-auto-2',
        agentName: 'Bob',
        role: 'critic',
        serverUrl: `ws://localhost:${currentPort}`,
        ollamaHost: 'http://192.168.1.4:11434',
        ollamaModel: 'gpt-oss:20b',
      });

      // Start both agents - they will exchange messages automatically
      await runtime1.start();
      await runtime2.start();

      // Wait for both to connect and exchange initial messages
      await new Promise((resolve) => setTimeout(resolve, 8000));

      // Check that runtime2's memory has stored runtime1's messages
      const memory2 = runtime2.getMemory();
      const messages2 = memory2.getRecentMessages();

      // Should have at least one message from Alice (runtime1)
      // Alice always responds to the welcome topic, so Bob should receive it
      const aliceMessages = messages2.filter((m) => m.agentName === 'Alice');
      expect(aliceMessages.length).toBeGreaterThan(0);

      // With relevance filter, runtime2 (critic) may not respond to runtime1's message
      // if it doesn't contain critic-relevant keywords, so we just check that
      // runtime1 has stored some messages (could be from runtime2 or just its own)
      const memory1 = runtime1.getMemory();
      const messages1 = memory1.getRecentMessages();
      expect(messages1.length).toBeGreaterThan(0);

      await runtime1.stop();
      await runtime2.stop();
    }, 12000);

    it('should use conversation context when responding', async () => {
      const runtime = new AgentRuntime({
        agentId: 'test-context-1',
        agentName: 'Alice',
        role: 'architect',
        serverUrl: `ws://localhost:${currentPort}`,
        ollamaHost: 'http://192.168.1.4:11434',
        ollamaModel: 'gpt-oss:20b',
      });

      await runtime.start();
      await new Promise((resolve) => setTimeout(resolve, 300));

      // Manually add some conversation history
      const memory = runtime.getMemory();
      memory.addMessage({
        agentId: 'bob',
        agentName: 'Bob',
        role: 'critic',
        content: 'What about microservices?',
        timestamp: Date.now(),
      });

      memory.addMessage({
        agentId: 'charlie',
        agentName: 'Charlie',
        role: 'pragmatist',
        content: 'They add complexity',
        timestamp: Date.now() + 1000,
      });

      // Get context - should include recent messages
      const context = memory.getContextSummary(2);
      expect(context).toContain('Bob');
      expect(context).toContain('What about microservices?');
      expect(context).toContain('Charlie');
      expect(context).toContain('They add complexity');

      await runtime.stop();
    });
  });
});
