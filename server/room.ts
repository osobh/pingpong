/**
 * Room manages agents and facilitates their conversation
 */

import { WebSocket } from 'ws';
import type {
  ClientCommand,
  JoinCommand,
  MessageCommand,
  LeaveCommand,
  ServerEvent,
} from '../shared/protocol.js';

/**
 * Agent information
 */
interface Agent {
  id: string;
  name: string;
  role: string;
  ws: WebSocket;
}

/**
 * Room class manages a conversation room with multiple agents
 */
export class Room {
  private agents = new Map<string, Agent>();

  constructor(
    public readonly id: string,
    public readonly topic: string,
  ) {}

  /**
   * Current number of agents in the room
   */
  get agentCount(): number {
    return this.agents.size;
  }

  /**
   * Handle incoming command from an agent
   */
  handleCommand(ws: WebSocket, command: ClientCommand): void {
    switch (command.type) {
      case 'JOIN':
        this.handleJoin(ws, command);
        break;
      case 'MESSAGE':
        this.handleMessage(command);
        break;
      case 'LEAVE':
        this.handleLeave(command);
        break;
    }
  }

  /**
   * Handle agent joining the room
   */
  private handleJoin(ws: WebSocket, command: JoinCommand): void {
    // Check for duplicate agent ID
    if (this.agents.has(command.agentId)) {
      throw new Error(`Agent with ID ${command.agentId} already exists in room`);
    }

    const agent: Agent = {
      id: command.agentId,
      name: command.agentName,
      role: command.role,
      ws,
    };

    this.agents.set(agent.id, agent);

    // Send WELCOME to the joining agent
    this.sendToAgent(agent.id, {
      type: 'WELCOME',
      roomId: this.id,
      topic: this.topic,
      agentCount: this.agents.size,
      timestamp: Date.now(),
    });

    // Broadcast AGENT_JOINED to all agents except the one who just joined
    this.broadcast(
      {
        type: 'AGENT_JOINED',
        agentId: agent.id,
        agentName: agent.name,
        role: agent.role,
        timestamp: Date.now(),
      },
      agent.id, // Exclude the joining agent
    );
  }

  /**
   * Handle message from an agent
   */
  private handleMessage(command: MessageCommand): void {
    const agent = this.agents.get(command.agentId);
    if (!agent) {
      return; // Agent not found, ignore message
    }

    // Broadcast message to all agents except sender
    this.broadcast(
      {
        type: 'MESSAGE',
        agentId: agent.id,
        agentName: agent.name,
        role: agent.role,
        content: command.content,
        timestamp: command.timestamp,
      },
      agent.id, // Exclude sender
    );
  }

  /**
   * Handle agent leaving the room
   */
  private handleLeave(command: LeaveCommand): void {
    const agent = this.agents.get(command.agentId);
    if (!agent) {
      return; // Agent not found
    }

    this.agents.delete(command.agentId);

    // Broadcast AGENT_LEFT to remaining agents
    this.broadcast({
      type: 'AGENT_LEFT',
      agentId: agent.id,
      agentName: agent.name,
      timestamp: Date.now(),
    });
  }

  /**
   * Handle WebSocket disconnect
   */
  handleDisconnect(ws: WebSocket): void {
    // Find agent by WebSocket
    let disconnectedAgent: Agent | undefined;
    for (const agent of this.agents.values()) {
      if (agent.ws === ws) {
        disconnectedAgent = agent;
        break;
      }
    }

    if (!disconnectedAgent) {
      return; // Agent not found
    }

    // Remove agent and notify others
    this.agents.delete(disconnectedAgent.id);

    this.broadcast({
      type: 'AGENT_LEFT',
      agentId: disconnectedAgent.id,
      agentName: disconnectedAgent.name,
      timestamp: Date.now(),
    });
  }

  /**
   * Send event to a specific agent
   */
  private sendToAgent(agentId: string, event: ServerEvent): void {
    const agent = this.agents.get(agentId);
    if (agent && agent.ws.readyState === WebSocket.OPEN) {
      agent.ws.send(JSON.stringify(event));
    }
  }

  /**
   * Broadcast event to all agents (optionally excluding one)
   */
  private broadcast(event: ServerEvent, excludeAgentId?: string): void {
    const message = JSON.stringify(event);
    for (const [agentId, agent] of this.agents) {
      if (agentId !== excludeAgentId && agent.ws.readyState === WebSocket.OPEN) {
        agent.ws.send(message);
      }
    }
  }

  /**
   * Shutdown the room, closing all connections
   */
  shutdown(): void {
    for (const agent of this.agents.values()) {
      agent.ws.close();
    }
    this.agents.clear();
  }
}
