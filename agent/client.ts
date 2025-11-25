/**
 * AgentClient - Client for agents to connect to the PingPong server
 */

import { WebSocket } from 'ws';
import { EventEmitter } from 'events';
import { ServerEventSchema, type ServerEvent } from '../shared/protocol.js';
import { type AgentMetadata } from '../shared/agent-metadata.js';

/**
 * Configuration for the agent client
 */
export interface AgentClientConfig {
  agentId: string;
  agentName: string;
  role: string;
  serverUrl: string;
  metadata?: AgentMetadata; // Optional metadata to send on join
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
   * Create a proposal
   * @param title Proposal title
   * @param description Proposal description
   * @param threshold Optional approval threshold (0.0 to 1.0)
   * @returns Promise<boolean> - true if sent successfully, false otherwise
   */
  async createProposal(
    title: string,
    description: string,
    threshold?: number,
  ): Promise<boolean> {
    if (!this._isConnected || !this.ws) {
      return false;
    }

    try {
      const command: any = {
        type: 'CREATE_PROPOSAL',
        agentId: this.config.agentId,
        title,
        description,
        timestamp: Date.now(),
      };
      if (threshold !== undefined) {
        command.threshold = threshold;
      }

      this.ws.send(JSON.stringify(command));
      return true;
    } catch (error) {
      this.emit('error', error as Error);
      return false;
    }
  }

  /**
   * Vote on a proposal
   * @param proposalId ID of the proposal to vote on
   * @param vote Vote type ('yes', 'no', or 'abstain')
   * @param rationale Optional explanation for the vote
   * @returns Promise<boolean> - true if sent successfully, false otherwise
   */
  async vote(
    proposalId: string,
    vote: 'yes' | 'no' | 'abstain',
    rationale?: string,
  ): Promise<boolean> {
    if (!this._isConnected || !this.ws) {
      return false;
    }

    try {
      const command: any = {
        type: 'VOTE',
        agentId: this.config.agentId,
        proposalId,
        vote,
        timestamp: Date.now(),
      };
      if (rationale !== undefined) {
        command.rationale = rationale;
      }

      this.ws.send(JSON.stringify(command));
      return true;
    } catch (error) {
      this.emit('error', error as Error);
      return false;
    }
  }

  /**
   * Bulk create multiple memories
   * @param memories Array of memory data to create
   * @returns Promise<boolean> - true if sent successfully, false otherwise
   */
  async bulkCreateMemories(
    memories: Array<{
      memoryType: 'decision' | 'insight' | 'question' | 'action_item';
      content: string;
      context?: string;
      summary?: string;
      priority?: 'low' | 'medium' | 'high' | 'critical';
      tags?: string[];
      relatedMessageIds?: string[];
      relatedAgentIds?: string[];
    }>,
  ): Promise<boolean> {
    if (!this._isConnected || !this.ws) {
      return false;
    }

    try {
      this.ws.send(
        JSON.stringify({
          type: 'BULK_CREATE_MEMORIES',
          agentId: this.config.agentId,
          memories,
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
   * Bulk update multiple memories
   * @param updates Array of memory updates
   * @returns Promise<boolean> - true if sent successfully, false otherwise
   */
  async bulkUpdateMemories(
    updates: Array<{
      memoryId: string;
      content?: string;
      context?: string;
      summary?: string;
      priority?: 'low' | 'medium' | 'high' | 'critical';
      tags?: string[];
    }>,
  ): Promise<boolean> {
    if (!this._isConnected || !this.ws) {
      return false;
    }

    try {
      this.ws.send(
        JSON.stringify({
          type: 'BULK_UPDATE_MEMORIES',
          agentId: this.config.agentId,
          updates,
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
          mode: event.mode,
          agentCount: event.agentCount,
        });
        break;

      case 'AGENT_JOINED':
        this.emit('agent_joined', {
          agentId: event.agentId,
          agentName: event.agentName,
          role: event.role,
          metadata: event.metadata,
        });
        break;

      case 'AGENT_METADATA_UPDATED':
        this.emit('agent_metadata_updated', {
          agentId: event.agentId,
          agentName: event.agentName,
          metadata: event.metadata,
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

      case 'PROPOSAL_CREATED':
        this.emit('proposal_created', {
          proposalId: event.proposalId,
          title: event.title,
          description: event.description,
          proposerId: event.proposerId,
          proposerName: event.proposerName,
          threshold: event.threshold,
        });
        break;

      case 'VOTE_CAST':
        this.emit('vote_cast', {
          proposalId: event.proposalId,
          agentId: event.agentId,
          agentName: event.agentName,
          vote: event.vote,
          rationale: event.rationale,
        });
        break;

      case 'PROPOSAL_RESOLVED':
        this.emit('proposal_resolved', {
          proposalId: event.proposalId,
          title: event.title,
          status: event.status,
          yesVotes: event.yesVotes,
          noVotes: event.noVotes,
          abstainVotes: event.abstainVotes,
          totalVotes: event.totalVotes,
        });
        break;

      case 'MEMORY_RECORDED':
        this.emit('memory_recorded', {
          memoryId: event.memoryId,
          memoryType: event.memoryType,
          content: event.content,
          summary: event.summary,
          priority: event.priority,
          tags: event.tags,
          createdBy: event.createdBy,
          createdByName: event.createdByName,
          timestamp: event.timestamp,
        });
        break;

      case 'BULK_MEMORIES_RESULT':
        this.emit('bulk_memories_result', {
          operation: event.operation,
          successful: event.successful,
          failed: event.failed,
          results: event.results,
          timestamp: event.timestamp,
        });
        break;

      case 'ERROR':
        this.emit('error', new Error(event.message));
        break;
    }

    // Also emit generic 'event' for backwards compatibility and flexibility
    this.emit('event', event);
  }

  /**
   * Update agent metadata
   * @param metadata Updated agent metadata
   * @returns Promise<boolean> - true if sent successfully, false otherwise
   */
  async updateMetadata(metadata: AgentMetadata): Promise<boolean> {
    if (!this._isConnected || !this.ws) {
      return false;
    }

    try {
      this.ws.send(
        JSON.stringify({
          type: 'UPDATE_METADATA',
          agentId: this.config.agentId,
          metadata,
          timestamp: Date.now(),
        }),
      );
      // Update local config metadata
      this.config.metadata = metadata;
      return true;
    } catch (error) {
      this.emit('error', error as Error);
      return false;
    }
  }

  /**
   * Send JOIN command to server
   */
  private sendJoinCommand(): void {
    if (!this.ws) {
      return;
    }

    const joinCommand: any = {
      type: 'JOIN',
      agentId: this.config.agentId,
      agentName: this.config.agentName,
      role: this.config.role,
      timestamp: Date.now(),
    };

    // Include metadata if provided
    if (this.config.metadata) {
      joinCommand.metadata = this.config.metadata;
    }

    this.ws.send(JSON.stringify(joinCommand));
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
