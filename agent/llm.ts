/**
 * AgentLLM - Wrapper for Ollama LLM with role-specific prompting
 */

import { Ollama, type Message } from 'ollama';

/**
 * Configuration for AgentLLM
 */
export interface AgentLLMConfig {
  host: string;
  model: string;
  role: 'architect' | 'critic' | 'pragmatist';
}

/**
 * Role-specific system prompts
 */
const ROLE_PROMPTS: Record<string, string> = {
  architect: `You are an Architect agent in a technical discussion. Your role is to:
- Design high-level system architecture
- Think about scalability, maintainability, and extensibility
- Propose structural solutions
- Consider long-term implications

Keep responses focused and concise (2-3 sentences). Focus on architectural concerns.`,

  critic: `You are a Critic agent in a technical discussion. Your role is to:
- Question assumptions and find potential problems
- Identify risks and edge cases
- Challenge proposed solutions constructively
- Ensure robustness and reliability

Keep responses focused and concise (2-3 sentences). Focus on potential issues and risks.`,

  pragmatist: `You are a Pragmatist agent in a technical discussion. Your role is to:
- Focus on practical implementation
- Balance ideals with constraints (time, resources, complexity)
- Propose actionable next steps
- Find middle ground between competing ideas

Keep responses focused and concise (2-3 sentences). Focus on practical solutions.`,
};

/**
 * AgentLLM class wraps Ollama for agent-specific LLM interactions
 */
export class AgentLLM {
  private ollama: Ollama;
  private config: AgentLLMConfig;
  private conversationHistory: Message[] = [];
  private systemPrompt: string;

  constructor(config: AgentLLMConfig) {
    this.config = config;
    this.ollama = new Ollama({ host: config.host });
    const prompt = ROLE_PROMPTS[config.role];
    this.systemPrompt = prompt !== undefined ? prompt : (ROLE_PROMPTS['architect'] ?? '');
  }

  /**
   * Test connection to Ollama server
   */
  async testConnection(): Promise<void> {
    try {
      const models = await this.ollama.list();
      const hasModel = models.models.some((m) => m.name === this.config.model);
      if (!hasModel) {
        throw new Error(
          `Model ${this.config.model} not found. Available models: ${models.models.map((m) => m.name).join(', ')}`,
        );
      }
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Failed to connect to Ollama at ${this.config.host}: ${error.message}`);
      }
      throw error;
    }
  }

  /**
   * Clear conversation history
   */
  clearHistory(): void {
    this.conversationHistory = [];
  }

  /**
   * Generate response for a user prompt
   */
  async generateResponse(prompt: string): Promise<string> {
    const userMessage: Message = {
      role: 'user',
      content: prompt,
    };

    this.conversationHistory.push(userMessage);

    const messages: Message[] = [
      { role: 'system', content: this.systemPrompt },
      ...this.conversationHistory,
    ];

    try {
      const response = await this.ollama.chat({
        model: this.config.model,
        messages,
        stream: false,
      });

      const assistantMessage: Message = {
        role: 'assistant',
        content: response.message.content,
      };

      this.conversationHistory.push(assistantMessage);

      return response.message.content;
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Failed to generate response: ${error.message}`);
      }
      throw error;
    }
  }

  /**
   * Respond to a discussion topic
   */
  async respondToTopic(topic: string): Promise<string> {
    const prompt = `Discussion Topic: ${topic}\n\nPlease share your perspective as a ${this.config.role}.`;
    return this.generateResponse(prompt);
  }

  /**
   * Respond to another agent's message
   */
  async respondToMessage(message: string): Promise<string> {
    const prompt = `Another agent said: "${message}"\n\nPlease respond with your perspective as a ${this.config.role}.`;
    return this.generateResponse(prompt);
  }
}
