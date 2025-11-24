import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import { AgentLLM } from '../../agent/llm.js';

/**
 * Test suite for AgentLLM wrapper
 * Uses real Ollama instance at 192.168.1.4
 */
describe('AgentLLM', () => {
  const OLLAMA_HOST = 'http://192.168.1.4:11434';
  const MODEL = 'gpt-oss:20b';
  let llm: AgentLLM;

  beforeAll(async () => {
    // Verify Ollama is accessible by creating an instance
    llm = new AgentLLM({
      host: OLLAMA_HOST,
      model: MODEL,
      role: 'architect',
    });

    // Test connection
    await llm.testConnection();
  });

  afterEach(() => {
    llm.clearHistory();
  });

  describe('Initialization', () => {
    it('should create AgentLLM with architect role', () => {
      const architect = new AgentLLM({
        host: OLLAMA_HOST,
        model: MODEL,
        role: 'architect',
      });

      expect(architect).toBeDefined();
    });

    it('should create AgentLLM with critic role', () => {
      const critic = new AgentLLM({
        host: OLLAMA_HOST,
        model: MODEL,
        role: 'critic',
      });

      expect(critic).toBeDefined();
    });

    it('should create AgentLLM with pragmatist role', () => {
      const pragmatist = new AgentLLM({
        host: OLLAMA_HOST,
        model: MODEL,
        role: 'pragmatist',
      });

      expect(pragmatist).toBeDefined();
    });
  });

  describe('Basic operations', () => {
    it('should test connection successfully', async () => {
      await expect(llm.testConnection()).resolves.not.toThrow();
    });

    it('should generate response for a prompt', async () => {
      const response = await llm.generateResponse('Say hello in exactly 3 words.');

      expect(response).toBeTruthy();
      expect(typeof response).toBe('string');
      expect(response.length).toBeGreaterThan(0);
    });

    it('should maintain conversation history', async () => {
      await llm.generateResponse('My name is Alice.');
      const response = await llm.generateResponse('What is my name?');

      const content = response.toLowerCase();
      expect(content).toContain('alice');
    });

    it('should clear history', async () => {
      await llm.generateResponse('Remember this: XYZ123');
      llm.clearHistory();
      const response = await llm.generateResponse('What should you remember?');

      expect(response.toLowerCase()).not.toContain('xyz123');
    });
  });

  describe('Role-specific behavior', () => {
    it('should use architect system prompt', async () => {
      const architect = new AgentLLM({
        host: OLLAMA_HOST,
        model: MODEL,
        role: 'architect',
      });

      const response = await architect.generateResponse(
        'Topic: Should we use microservices or monolith?',
      );

      expect(response).toBeTruthy();
      expect(response.length).toBeGreaterThan(20);
    });

    it('should use critic system prompt', async () => {
      const critic = new AgentLLM({
        host: OLLAMA_HOST,
        model: MODEL,
        role: 'critic',
      });

      const response = await critic.generateResponse(
        'Architect suggests: "We should use microservices for better scalability."',
      );

      expect(response).toBeTruthy();
      expect(response.length).toBeGreaterThan(20);
    });

    it('should use pragmatist system prompt', async () => {
      const pragmatist = new AgentLLM({
        host: OLLAMA_HOST,
        model: MODEL,
        role: 'pragmatist',
      });

      const response = await pragmatist.generateResponse(
        'Architect wants microservices, Critic warns of complexity. What should we do?',
      );

      expect(response).toBeTruthy();
      expect(response.length).toBeGreaterThan(20);
    });
  });

  describe('Conversation context', () => {
    it('should respond to discussion topic', async () => {
      const topic = 'Should we use REST or GraphQL?';
      const response = await llm.respondToTopic(topic);

      expect(response).toBeTruthy();
      expect(typeof response).toBe('string');
    });

    it('should respond to other agent messages', async () => {
      const otherAgentMessage = 'I think we should use REST for simplicity.';
      const response = await llm.respondToMessage(otherAgentMessage);

      expect(response).toBeTruthy();
      expect(typeof response).toBe('string');
    });
  });

  describe('Error handling', () => {
    it('should throw error with invalid host', async () => {
      const invalidLLM = new AgentLLM({
        host: 'http://invalid-host:11434',
        model: MODEL,
        role: 'architect',
      });

      await expect(invalidLLM.testConnection()).rejects.toThrow();
    });

    it('should handle empty prompt', async () => {
      const response = await llm.generateResponse('');
      expect(response).toBeDefined();
    });
  });

  describe('Performance', () => {
    it('should complete requests within reasonable time', async () => {
      const start = Date.now();
      await llm.generateResponse('Say hi in one word.');
      const duration = Date.now() - start;

      // Should complete within 30 seconds
      expect(duration).toBeLessThan(30000);
    });
  });
});
