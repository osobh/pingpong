/**
 * AgentRuntime - Orchestrates AgentClient and AgentLLM for autonomous agent behavior
 */

import { EventEmitter } from 'events';
import { AgentClient } from './client.js';
import { AgentLLM } from './llm.js';

/**
 * Configuration for AgentRuntime
 */
export interface AgentRuntimeConfig {
  agentId: string;
  agentName: string;
  role: 'architect' | 'critic' | 'pragmatist';
  serverUrl: string;
  ollamaHost: string;
  ollamaModel: string;
}

/**
 * AgentRuntime orchestrates the agent's behavior
 */
export class AgentRuntime extends EventEmitter {
  private client: AgentClient;
  private llm: AgentLLM;
  private _isRunning = false;

  constructor(config: AgentRuntimeConfig) {
    super();

    // Validate role
    const validRoles = ['architect', 'critic', 'pragmatist'];
    if (!validRoles.includes(config.role)) {
      throw new Error(`Invalid role: ${config.role}. Must be one of: ${validRoles.join(', ')}`);
    }

    // Create client
    this.client = new AgentClient({
      agentId: config.agentId,
      agentName: config.agentName,
      role: config.role,
      serverUrl: config.serverUrl,
    });

    // Create LLM
    this.llm = new AgentLLM({
      host: config.ollamaHost,
      model: config.ollamaModel,
      role: config.role,
    });

    // Set up event handlers
    this.setupEventHandlers();
  }

  /**
   * Check if runtime is currently running
   */
  get isRunning(): boolean {
    return this._isRunning;
  }

  /**
   * Start the agent runtime
   */
  async start(): Promise<boolean> {
    try {
      // Test Ollama connection first
      await this.llm.testConnection();

      // Set running flag before connecting to avoid race condition
      // The welcome event can fire immediately after connect()
      this._isRunning = true;

      // Connect to server
      const connected = await this.client.connect();
      if (!connected) {
        this._isRunning = false;
        return false;
      }

      return true;
    } catch (error) {
      this._isRunning = false;
      this.emit('error', error);
      return false;
    }
  }

  /**
   * Stop the agent runtime
   */
  async stop(): Promise<void> {
    this._isRunning = false;
    await this.client.disconnect();
    this.llm.clearHistory();
  }

  /**
   * Set up event handlers for client events
   */
  private setupEventHandlers(): void {
    // Handle welcome event - respond to topic
    this.client.on('welcome', async (data: { topic: string }) => {
      if (this._isRunning) {
        try {
          const response = await this.llm.respondToTopic(data.topic);
          await this.client.sendMessage(response);
          this.emit('messageSent', response);
        } catch (error) {
          this.emit('error', error);
        }
      }
    });

    // Handle incoming messages - generate and send response
    this.client.on('message', async (data: { agentName: string; content: string }) => {
      this.emit('messageReceived', data.content);

      if (this._isRunning) {
        try {
          const response = await this.llm.respondToMessage(data.content);
          await this.client.sendMessage(response);
          this.emit('messageSent', response);
        } catch (error) {
          this.emit('error', error);
        }
      }
    });

    // Handle agent joined events
    this.client.on('agent_joined', (data: { agentName: string }) => {
      this.emit('agentJoined', data.agentName);
    });

    // Handle agent left events
    this.client.on('agent_left', (data: { agentName: string }) => {
      this.emit('agentLeft', data.agentName);
    });

    // Forward errors
    this.client.on('error', (error: Error) => {
      this.emit('error', error);
    });
  }
}
