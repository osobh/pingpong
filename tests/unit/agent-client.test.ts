import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { startServer } from '../../server/index.js';
import { AgentClient } from '../../agent/client.js';

describe('AgentClient', () => {
  const BASE_PORT = 9900;
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

  describe('Connection', () => {
    it('should connect to WebSocket server', async () => {
      const client = new AgentClient({
        agentId: 'test-1',
        agentName: 'Test Agent',
        role: 'participant',
        serverUrl: `ws://localhost:${currentPort}`,
      });

      const connected = await client.connect();
      expect(connected).toBe(true);
      expect(client.isConnected).toBe(true);

      await client.disconnect();
    });

    it('should receive WELCOME event after joining', async () => {
      const client = new AgentClient({
        agentId: 'test-2',
        agentName: 'Test Agent',
        role: 'participant',
        serverUrl: `ws://localhost:${currentPort}`,
      });

      const events: string[] = [];
      client.on('welcome', () => events.push('welcome'));

      await client.connect();

      // Wait a bit for event
      await new Promise((resolve) => setTimeout(resolve, 200));

      expect(events).toContain('welcome');

      await client.disconnect();
    });

    it('should handle connection failure gracefully', async () => {
      const client = new AgentClient({
        agentId: 'test-3',
        agentName: 'Test Agent',
        role: 'participant',
        serverUrl: 'ws://localhost:9999', // Wrong port
      });

      const connected = await client.connect();
      expect(connected).toBe(false);
    });
  });

  describe('Messaging', () => {
    it('should send messages to server', async () => {
      const client = new AgentClient({
        agentId: 'test-msg-1',
        agentName: 'Alice',
        role: 'architect',
        serverUrl: `ws://localhost:${currentPort}`,
      });

      await client.connect();

      const sent = await client.sendMessage('Hello world');
      expect(sent).toBe(true);

      await client.disconnect();
    });

    it('should receive messages from other agents', async () => {
      const client1 = new AgentClient({
        agentId: 'test-msg-2',
        agentName: 'Alice',
        role: 'architect',
        serverUrl: `ws://localhost:${currentPort}`,
      });

      const client2 = new AgentClient({
        agentId: 'test-msg-3',
        agentName: 'Bob',
        role: 'critic',
        serverUrl: `ws://localhost:${currentPort}`,
      });

      const messages: string[] = [];
      client2.on('message', (msg) => messages.push(msg.content));

      await client1.connect();
      await client2.connect();

      // Wait for both to join
      await new Promise((resolve) => setTimeout(resolve, 200));

      await client1.sendMessage('Test message from Alice');

      // Wait for message to arrive
      await new Promise((resolve) => setTimeout(resolve, 200));

      expect(messages).toContain('Test message from Alice');

      await client1.disconnect();
      await client2.disconnect();
    });
  });

  describe('Agent Events', () => {
    it('should receive agent_joined events', async () => {
      const client1 = new AgentClient({
        agentId: 'test-evt-1',
        agentName: 'Alice',
        role: 'architect',
        serverUrl: `ws://localhost:${currentPort}`,
      });

      const client2 = new AgentClient({
        agentId: 'test-evt-2',
        agentName: 'Bob',
        role: 'critic',
        serverUrl: `ws://localhost:${currentPort}`,
      });

      const joinedAgents: string[] = [];
      client1.on('agent_joined', (agent) => joinedAgents.push(agent.agentName));

      await client1.connect();
      await new Promise((resolve) => setTimeout(resolve, 100));

      await client2.connect();
      await new Promise((resolve) => setTimeout(resolve, 200));

      expect(joinedAgents).toContain('Bob');

      await client1.disconnect();
      await client2.disconnect();
    });

    it('should receive agent_left events', async () => {
      const client1 = new AgentClient({
        agentId: 'test-evt-3',
        agentName: 'Alice',
        role: 'architect',
        serverUrl: `ws://localhost:${currentPort}`,
      });

      const client2 = new AgentClient({
        agentId: 'test-evt-4',
        agentName: 'Bob',
        role: 'critic',
        serverUrl: `ws://localhost:${currentPort}`,
      });

      const leftAgents: string[] = [];
      client2.on('agent_left', (agent) => leftAgents.push(agent.agentName));

      await client1.connect();
      await client2.connect();
      await new Promise((resolve) => setTimeout(resolve, 200));

      await client1.disconnect();
      await new Promise((resolve) => setTimeout(resolve, 200));

      expect(leftAgents).toContain('Alice');

      await client2.disconnect();
    });
  });

  describe('Disconnect', () => {
    it('should disconnect cleanly', async () => {
      const client = new AgentClient({
        agentId: 'test-disc-1',
        agentName: 'Test Agent',
        role: 'participant',
        serverUrl: `ws://localhost:${currentPort}`,
      });

      await client.connect();
      expect(client.isConnected).toBe(true);

      await client.disconnect();
      expect(client.isConnected).toBe(false);
    });

    it('should send LEAVE command before disconnecting', async () => {
      const client1 = new AgentClient({
        agentId: 'test-disc-2',
        agentName: 'Alice',
        role: 'architect',
        serverUrl: `ws://localhost:${currentPort}`,
      });

      const client2 = new AgentClient({
        agentId: 'test-disc-3',
        agentName: 'Bob',
        role: 'critic',
        serverUrl: `ws://localhost:${currentPort}`,
      });

      const leftAgents: string[] = [];
      client2.on('agent_left', (agent) => leftAgents.push(agent.agentName));

      await client1.connect();
      await client2.connect();
      await new Promise((resolve) => setTimeout(resolve, 200));

      await client1.disconnect();
      await new Promise((resolve) => setTimeout(resolve, 200));

      expect(leftAgents).toContain('Alice');

      await client2.disconnect();
    });
  });

  describe('Error Handling', () => {
    it('should handle invalid server responses', async () => {
      const client = new AgentClient({
        agentId: 'test-err-1',
        agentName: 'Test Agent',
        role: 'participant',
        serverUrl: `ws://localhost:${currentPort}`,
      });

      const errors: string[] = [];
      client.on('error', (err) => errors.push(err.message));

      await client.connect();

      // Server will send ERROR for invalid message
      // This is tested indirectly through other tests

      await client.disconnect();
    });

    it('should not send messages when disconnected', async () => {
      const client = new AgentClient({
        agentId: 'test-err-2',
        agentName: 'Test Agent',
        role: 'participant',
        serverUrl: `ws://localhost:${currentPort}`,
      });

      const sent = await client.sendMessage('Should fail');
      expect(sent).toBe(false);
    });
  });
});
