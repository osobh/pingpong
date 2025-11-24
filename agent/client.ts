/**
 * AgentClient - Client for agents to connect to the PingPong server
 */

import { WebSocket } from 'ws';
import { EventEmitter } from 'events';
import { ServerEventSchema, type ServerEvent } from '../shared/protocol.js';

/**
 * Configuration for the agent client
 */
export interface AgentClientConfig {
  agentId: string;
  agentName: string;
  role: string;
  serverUrl: string;
}

/**
 * AgentClient class for connecting to the PingPong server
 */
export class AgentClient extends EventEmitter {
  private ws: WebSocket | null = null;
  private _isConnected = false;
  private readonly config: AgentClientConfig;

  constructor(config: AgentClientConfig) {
    super();
    this.config = config;
  }

  /**
   * Check if client is currently connected
   */
  get isConnected(): boolean {
    return this._isConnected;
  }

  /**
   * Connect to the server
   * @returns Promise<boolean> - true if connected successfully, false otherwise
   */
  async connect(): Promise<boolean> {
    if (this._isConnected) {
      return true;
    }

    return new Promise((resolve) => {
      try {
        this.ws = new WebSocket(this.config.serverUrl);
        let resolved = false;

        const cleanup = () => {
          if (!resolved) {
            resolved = true;
            this._isConnected = false;
            this.ws = null;
          }
        };

        const timeout = setTimeout(() => {
          cleanup();
          resolve(false);
        }, 5000);

        this.ws.once('open', () => {
          if (!resolved) {
            resolved = true;
            clearTimeout(timeout);
            this.setupListeners();
            this.sendJoinCommand();
            this._isConnected = true;
            resolve(true);
          }
        });

        this.ws.once('error', () => {
          clearTimeout(timeout);
          cleanup();
          resolve(false);
        });
      } catch (error) {
        this._isConnected = false;
        this.ws = null;
        resolve(false);
      }
    });
  }

  /**
   * Disconnect from the server
   */
  async disconnect(): Promise<void> {
    if (!this._isConnected || !this.ws) {
      return;
    }

    // Send LEAVE command before disconnecting
    this.sendLeaveCommand();

    // Give time for LEAVE command to be sent
    await new Promise((resolve) => setTimeout(resolve, 100));

    this.ws.close();
    this._isConnected = false;
    this.ws = null;
  }

  /**
   * Send a message to the room
   * @param content Message content
   * @returns Promise<boolean> - true if sent successfully, false otherwise
   */
  async sendMessage(content: string): Promise<boolean> {
    if (!this._isConnected || !this.ws) {
      return false;
    }

    try {
      this.ws.send(
        JSON.stringify({
          type: 'MESSAGE',
          agentId: this.config.agentId,
          content,
          timestamp: Date.now(),
        }),
      );
      return true;
    } catch (error) {
      this.emit('error', error as Error);
      return false;
    }
  }

  /**
   * Set up WebSocket event listeners
   */
  private setupListeners(): void {
    if (!this.ws) {
      return;
    }

    this.ws.on('message', (data) => {
      try {
        const message = JSON.parse(data.toString());
        const event = ServerEventSchema.parse(message);
        this.handleServerEvent(event);
      } catch (error) {
        this.emit('error', error as Error);
      }
    });

    this.ws.on('close', () => {
      this._isConnected = false;
      this.ws = null;
    });

    this.ws.on('error', (error) => {
      this.emit('error', error);
    });
  }

  /**
   * Handle incoming server events
   */
  private handleServerEvent(event: ServerEvent): void {
    switch (event.type) {
      case 'WELCOME':
        this.emit('welcome', {
          roomId: event.roomId,
          topic: event.topic,
          agentCount: event.agentCount,
        });
        break;

      case 'AGENT_JOINED':
        this.emit('agent_joined', {
          agentId: event.agentId,
          agentName: event.agentName,
          role: event.role,
        });
        break;

      case 'MESSAGE':
        this.emit('message', {
          agentId: event.agentId,
          agentName: event.agentName,
          role: event.role,
          content: event.content,
        });
        break;

      case 'AGENT_LEFT':
        this.emit('agent_left', {
          agentId: event.agentId,
          agentName: event.agentName,
        });
        break;

      case 'ERROR':
        this.emit('error', new Error(event.message));
        break;
    }
  }

  /**
   * Send JOIN command to server
   */
  private sendJoinCommand(): void {
    if (!this.ws) {
      return;
    }

    this.ws.send(
      JSON.stringify({
        type: 'JOIN',
        agentId: this.config.agentId,
        agentName: this.config.agentName,
        role: this.config.role,
        timestamp: Date.now(),
      }),
    );
  }

  /**
   * Send LEAVE command to server
   */
  private sendLeaveCommand(): void {
    if (!this.ws) {
      return;
    }

    this.ws.send(
      JSON.stringify({
        type: 'LEAVE',
        agentId: this.config.agentId,
        timestamp: Date.now(),
      }),
    );
  }
}
