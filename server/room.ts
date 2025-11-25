/**
 * Room manages agents and facilitates their conversation
 */

import { WebSocket } from 'ws';
import { randomUUID } from 'crypto';
import type {
  ClientCommand,
  JoinCommand,
  MessageCommand,
  LeaveCommand,
  CreateProposalCommand,
  VoteCommand,
  UpdateMetadataCommand,
  ServerEvent,
} from '../shared/protocol.js';
import type { MessageBus, Unsubscribe } from '../shared/message-bus.js';
import type { AgentMetadata } from '../shared/agent-metadata.js';
import { VoteManager } from '../agent/vote-manager.js';
import { ProposalRepository, MessageRecord } from './proposal-repository.js';
import { ProposalStatus, VoteType } from '../agent/proposal.js';
import type { ConversationMode } from '../shared/types.js';
import { MODE_CONFIGS } from '../shared/types.js';
import { ConversationExporter, type ExportFormat } from './conversation-exporter.js';
import {
  AnalyticsEngine,
  type AgentPerformanceMetrics,
  type RoomAnalytics,
} from './analytics-engine.js';

/**
 * Agent information
 */
interface Agent {
  id: string;
  name: string;
  role: string;
  ws: WebSocket;
  metadata?: AgentMetadata; // Optional comprehensive agent metadata
}

/**
 * Discussion topic tracking
 */
interface DiscussionTopic {
  id: string;
  title: string;
  status: 'pending' | 'active' | 'completed';
  introducedAt: number;
  completedAt?: number;
  introducedBy?: string; // agentId
}

/**
 * Room class manages a conversation room with multiple agents
 */
export class Room {
  private agents = new Map<string, Agent>();
  private bus: MessageBus | undefined;
  private serverId: string | undefined;
  private seenMessageIds = new Set<string>();
  private busUnsubscribe: Unsubscribe | undefined;
  private onShutdownCallback?: () => void;
  private voteManager: VoteManager;
  private repository: ProposalRepository;
  private exporter: ConversationExporter;
  private analytics: AnalyticsEngine;
  private topics = new Map<string, DiscussionTopic>();
  private activeTopicId: string | null = null;
  public readonly mode: ConversationMode;

  constructor(
    public readonly id: string,
    public readonly topic: string,
    mode: ConversationMode = 'deep',
    bus?: MessageBus,
    serverId?: string,
    onShutdown?: () => void,
    dbPath?: string,
  ) {
    this.bus = bus;
    this.serverId = serverId;
    this.mode = mode;
    if (onShutdown) {
      this.onShutdownCallback = onShutdown;
    }

    // Initialize voting infrastructure
    this.voteManager = new VoteManager();
    this.repository = new ProposalRepository(dbPath);
    this.exporter = new ConversationExporter(this.repository);
    this.analytics = new AnalyticsEngine(this.repository);

    // Initialize the primary topic
    const initialTopicId = randomUUID();
    this.topics.set(initialTopicId, {
      id: initialTopicId,
      title: this.topic,
      status: 'active',
      introducedAt: Date.now(),
    });
    this.activeTopicId = initialTopicId;

    // Listen to proposal resolution events
    this.voteManager.on('proposal:approved', (proposalId: string) => {
      this.handleProposalResolved(proposalId, ProposalStatus.APPROVED);
    });

    this.voteManager.on('proposal:rejected', (proposalId: string) => {
      this.handleProposalResolved(proposalId, ProposalStatus.REJECTED);
    });

    // Subscribe to bus if provided
    if (this.bus) {
      this.busUnsubscribe = this.bus.subscribe((message) => {
        this.handleBusMessage(message);
      });
    }
  }

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
      case 'CREATE_PROPOSAL':
        this.handleCreateProposal(command);
        break;
      case 'VOTE':
        this.handleVote(command);
        break;
      case 'UPDATE_METADATA':
        this.handleUpdateMetadata(command);
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

    // Store metadata if provided
    if (command.metadata !== undefined) {
      agent.metadata = { ...command.metadata } as AgentMetadata;
    }

    this.agents.set(agent.id, agent);

    // Persist metadata to database if provided
    if (agent.metadata) {
      this.repository.saveAgentMetadata(this.id, agent.metadata);
    }

    // Send WELCOME to the joining agent
    this.sendToAgent(agent.id, {
      type: 'WELCOME',
      roomId: this.id,
      topic: this.topic,
      mode: this.mode,
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
        metadata: agent.metadata, // Include metadata in broadcast
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

    const messageEvent: ServerEvent = {
      type: 'MESSAGE',
      agentId: agent.id,
      agentName: agent.name,
      role: agent.role,
      content: command.content,
      timestamp: command.timestamp,
    };

    // Persist message to database
    this.repository.saveMessage(
      this.id,
      agent.id,
      agent.name,
      agent.role,
      command.content,
      command.timestamp,
    );

    // Broadcast message to all agents except sender
    this.broadcast(messageEvent, agent.id);

    // Publish to message bus if available
    if (this.bus && this.serverId) {
      const messageId = randomUUID();
      this.seenMessageIds.add(messageId); // Track our own message to avoid echo

      this.bus.publish({
        serverId: this.serverId,
        messageId,
        timestamp: Date.now(),
        payload: {
          ...messageEvent,
          serverId: this.serverId,
          messageId,
        },
      });
    }
  }

  /**
   * Handle message from bus (cross-server communication)
   */
  private handleBusMessage(message: any): void {
    // Filter echo messages from same server
    if (message.serverId === this.serverId) {
      return;
    }

    // Deduplicate messages
    if (this.seenMessageIds.has(message.messageId)) {
      return;
    }
    this.seenMessageIds.add(message.messageId);

    // Only handle MESSAGE events from bus
    if (message.payload.type === 'MESSAGE') {
      // Persist message from other server to local database
      this.repository.saveMessage(
        this.id,
        message.payload.agentId,
        message.payload.agentName,
        message.payload.role,
        message.payload.content,
        message.payload.timestamp,
      );

      // Broadcast to all local agents
      this.broadcast(message.payload);
    }
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

    // Delete metadata from database
    this.repository.deleteAgentMetadata(command.agentId, this.id);

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

    // Delete metadata from database
    this.repository.deleteAgentMetadata(disconnectedAgent.id, this.id);

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
   * Handle proposal creation
   */
  private handleCreateProposal(command: CreateProposalCommand): void {
    const agent = this.agents.get(command.agentId);
    if (!agent) {
      return; // Agent not found
    }

    // Get mode-specific threshold
    const modeConfig = MODE_CONFIGS[this.mode];
    const defaultThreshold = modeConfig.threshold;

    // Create proposal in vote manager
    const proposalConfig: any = {
      title: command.title,
      description: command.description,
      proposerId: command.agentId,
      proposerName: agent.name,
    };
    if (command.threshold !== undefined) {
      proposalConfig.threshold = command.threshold;
    } else {
      proposalConfig.threshold = defaultThreshold;
    }
    const proposalId = this.voteManager.createProposal(proposalConfig);

    // Persist to database
    const proposal = this.voteManager.getProposal(proposalId);
    if (proposal) {
      this.repository.saveProposal(proposal, this.id);
    }

    // Broadcast PROPOSAL_CREATED event to all agents
    this.broadcast({
      type: 'PROPOSAL_CREATED',
      proposalId,
      title: command.title,
      description: command.description,
      proposerId: command.agentId,
      proposerName: agent.name,
      threshold: command.threshold ?? 0.5,
      timestamp: Date.now(),
    });
  }

  /**
   * Handle vote casting
   */
  private handleVote(command: VoteCommand): void {
    const agent = this.agents.get(command.agentId);
    if (!agent) {
      return; // Agent not found
    }

    try {
      // Convert string vote to VoteType enum
      const voteType = this.stringToVoteType(command.vote);

      // Record vote in vote manager
      this.voteManager.vote(command.proposalId, command.agentId, voteType);

      // Persist vote to database
      this.repository.saveVote(
        command.proposalId,
        command.agentId,
        agent.name,
        voteType,
        command.rationale ?? null,
        command.timestamp,
      );

      // Broadcast VOTE_CAST event to all agents
      this.broadcast({
        type: 'VOTE_CAST',
        proposalId: command.proposalId,
        agentId: command.agentId,
        agentName: agent.name,
        vote: command.vote,
        rationale: command.rationale,
        timestamp: command.timestamp,
      });

      // Check if proposal should be resolved
      this.voteManager.updateProposalStatus(command.proposalId);
    } catch (error) {
      // Send error to the agent
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.sendToAgent(command.agentId, {
        type: 'ERROR',
        message: errorMessage,
        timestamp: Date.now(),
      });
    }
  }

  /**
   * Convert string vote to VoteType enum
   */
  private stringToVoteType(vote: 'yes' | 'no' | 'abstain'): VoteType {
    switch (vote) {
      case 'yes':
        return VoteType.YES;
      case 'no':
        return VoteType.NO;
      case 'abstain':
        return VoteType.ABSTAIN;
    }
  }

  /**
   * Handle agent metadata update
   */
  private handleUpdateMetadata(command: UpdateMetadataCommand): void {
    const agent = this.agents.get(command.agentId);
    if (!agent) {
      return; // Agent not found
    }

    // Update stored metadata
    agent.metadata = { ...command.metadata } as AgentMetadata;

    // Persist updated metadata to database
    this.repository.saveAgentMetadata(this.id, { ...command.metadata } as AgentMetadata);

    // Broadcast AGENT_METADATA_UPDATED event to all agents
    this.broadcast({
      type: 'AGENT_METADATA_UPDATED',
      agentId: agent.id,
      agentName: agent.name,
      metadata: command.metadata,
      timestamp: Date.now(),
    });
  }

  /**
   * Handle proposal resolution (approved or rejected)
   */
  private handleProposalResolved(proposalId: string, status: ProposalStatus): void {
    const proposal = this.voteManager.getProposal(proposalId);
    if (!proposal) {
      return;
    }

    // Update status in database
    this.repository.updateProposalStatus(proposalId, status);

    // Broadcast PROPOSAL_RESOLVED event
    this.broadcast({
      type: 'PROPOSAL_RESOLVED',
      proposalId,
      title: proposal.getTitle(),
      status: status === ProposalStatus.APPROVED ? 'approved' : 'rejected',
      yesVotes: proposal.getYesCount(),
      noVotes: proposal.getNoCount(),
      abstainVotes: proposal.getAbstainCount(),
      totalVotes: proposal.getTotalVotes(),
      timestamp: Date.now(),
    });
  }

  /**
   * Get proposal repository for querying decision history
   */
  getRepository(): ProposalRepository {
    return this.repository;
  }

  /**
   * Query proposals with optional filtering
   */
  queryProposals(status?: ProposalStatus) {
    if (status) {
      return this.repository.getProposalsByStatus(status, this.id);
    }
    return this.repository.getProposalsByRoom(this.id);
  }

  /**
   * Get full proposal details including votes
   */
  getProposalDetails(proposalId: string) {
    const proposal = this.repository.getProposalById(proposalId);
    if (!proposal) {
      return null;
    }

    const votes = this.repository.getVotesByProposal(proposalId);
    const stats = this.repository.getVoteStats(proposalId);

    return {
      proposal,
      votes,
      stats,
    };
  }

  /**
   * Get decision summary for the room
   */
  getDecisionSummary() {
    const allProposals = this.repository.getProposalsWithVotes(this.id);

    return {
      roomId: this.id,
      topic: this.topic,
      totalProposals: allProposals.length,
      approved: allProposals.filter((p) => p.status === ProposalStatus.APPROVED).length,
      rejected: allProposals.filter((p) => p.status === ProposalStatus.REJECTED).length,
      pending: allProposals.filter((p) => p.status === ProposalStatus.PENDING).length,
      proposals: allProposals,
    };
  }

  // ========== Message Query Methods ==========

  /**
   * Get all messages for this room with optional pagination
   */
  getMessages(limit?: number, offset?: number): MessageRecord[] {
    return this.repository.getMessagesByRoom(this.id, limit, offset);
  }

  /**
   * Get recent messages (chronologically ordered, oldest first)
   */
  getRecentMessages(limit: number = 50): MessageRecord[] {
    return this.repository.getRecentMessages(this.id, limit);
  }

  /**
   * Get messages within a specific time range
   */
  getMessagesByTimeRange(startTime: number, endTime: number): MessageRecord[] {
    return this.repository.getMessagesByTimeRange(this.id, startTime, endTime);
  }

  /**
   * Get messages from a specific agent in this room
   */
  getMessagesByAgent(agentId: string): MessageRecord[] {
    return this.repository.getMessagesByAgent(agentId, this.id);
  }

  /**
   * Get total message count for this room
   */
  getMessageCount(): number {
    return this.repository.getMessageCount(this.id);
  }

  /**
   * Get discussion quality metrics
   * Analyzes conversation patterns to assess engagement and quality
   */
  getQualityMetrics(timeWindowMinutes: number = 30): {
    messageCount: number;
    messagesPerMinute: number;
    averageMessageLength: number;
    agentParticipation: Map<string, { count: number; percentage: number }>;
    participationBalance: number; // 0-1, higher = more balanced
    proposalToMessageRatio: number;
  } {
    const now = Date.now();
    const windowStart = now - timeWindowMinutes * 60 * 1000;
    const recentMessages = this.repository.getMessagesByTimeRange(this.id, windowStart, now);

    // Basic counts
    const messageCount = recentMessages.length;
    const messagesPerMinute = messageCount / timeWindowMinutes;

    // Average message length
    const totalLength = recentMessages.reduce((sum, m) => sum + m.content.length, 0);
    const averageMessageLength = messageCount > 0 ? totalLength / messageCount : 0;

    // Agent participation
    const participationMap = new Map<string, { count: number; percentage: number }>();
    const agentCounts = new Map<string, number>();

    for (const msg of recentMessages) {
      const count = agentCounts.get(msg.agentId) || 0;
      agentCounts.set(msg.agentId, count + 1);
    }

    for (const [agentId, count] of agentCounts) {
      participationMap.set(agentId, {
        count,
        percentage: messageCount > 0 ? (count / messageCount) * 100 : 0,
      });
    }

    // Participation balance (using standard deviation)
    // Lower std dev = more balanced participation
    const counts = Array.from(agentCounts.values());
    const mean = counts.length > 0 ? counts.reduce((a, b) => a + b, 0) / counts.length : 0;
    const variance =
      counts.length > 0 ? counts.reduce((sum, c) => sum + Math.pow(c - mean, 2), 0) / counts.length : 0;
    const stdDev = Math.sqrt(variance);
    // Normalize to 0-1 scale (lower stdDev = higher balance)
    const participationBalance = mean > 0 ? Math.max(0, 1 - stdDev / mean) : 0;

    // Proposal to message ratio
    const recentProposals = this.repository
      .getProposalsByRoom(this.id)
      .filter((p) => p.createdAt >= windowStart);
    const proposalToMessageRatio = messageCount > 0 ? recentProposals.length / messageCount : 0;

    return {
      messageCount,
      messagesPerMinute,
      averageMessageLength,
      agentParticipation: participationMap,
      participationBalance,
      proposalToMessageRatio,
    };
  }

  /**
   * Get conversation summary for moderators
   * Provides recent messages formatted with context useful for moderation
   */
  getConversationSummary(messageLimit: number = 20): {
    roomId: string;
    topic: string;
    mode: ConversationMode;
    totalMessages: number;
    activeAgents: number;
    recentMessages: Array<{
      agentName: string;
      role: string;
      content: string;
      timestamp: Date;
    }>;
    proposals: {
      pending: number;
      approved: number;
      rejected: number;
    };
  } {
    const messages = this.getRecentMessages(messageLimit);
    const totalMessages = this.getMessageCount();
    const proposals = this.getDecisionSummary();

    return {
      roomId: this.id,
      topic: this.topic,
      mode: this.mode,
      totalMessages,
      activeAgents: this.agents.size,
      recentMessages: messages.map((m) => ({
        agentName: m.agentName,
        role: m.role,
        content: m.content,
        timestamp: new Date(m.timestamp),
      })),
      proposals: {
        pending: proposals.pending,
        approved: proposals.approved,
        rejected: proposals.rejected,
      },
    };
  }

  /**
   * Export conversation to specified format
   * @param format Export format: 'json', 'markdown', or 'html'
   * @returns Promise<string> - Formatted conversation export
   */
  async exportConversation(format: ExportFormat): Promise<string> {
    return this.exporter.exportConversation(this.id, this.topic, this.mode, format);
  }

  /**
   * Get performance metrics for a specific agent
   * @param agentId Agent ID to get metrics for
   * @param timeWindowMs Optional time window in milliseconds (default: all time)
   * @returns AgentPerformanceMetrics or null if no data
   */
  getAgentPerformanceMetrics(
    agentId: string,
    timeWindowMs?: number,
  ): AgentPerformanceMetrics | null {
    return this.analytics.calculateAgentMetrics(agentId, this.id, timeWindowMs);
  }

  /**
   * Get performance metrics for all agents in the room
   * @param timeWindowMs Optional time window in milliseconds (default: all time)
   * @returns Array of AgentPerformanceMetrics
   */
  getAllAgentMetrics(timeWindowMs?: number): AgentPerformanceMetrics[] {
    const agents = this.repository.getAgentMetadataByRoom(this.id);
    const metrics: AgentPerformanceMetrics[] = [];

    for (const agent of agents) {
      const agentMetrics = this.analytics.calculateAgentMetrics(agent.agentId, this.id, timeWindowMs);
      if (agentMetrics) {
        metrics.push(agentMetrics);
      }
    }

    return metrics;
  }

  /**
   * Get room-wide analytics
   * @returns RoomAnalytics
   */
  getRoomAnalytics(): RoomAnalytics {
    return this.analytics.calculateRoomAnalytics(this.id);
  }

  /**
   * Get all agents in the room with their metadata
   * @returns Array of agent information
   */
  getAgents(): Array<{ id: string; name: string; role: string; metadata?: AgentMetadata }> {
    const agentMetadata = this.repository.getAgentMetadataByRoom(this.id);
    return agentMetadata.map((agent) => ({
      id: agent.agentId,
      name: agent.agentName,
      role: agent.role || 'unknown',
      metadata: agent,
    }));
  }

  // ========== Topic Management Methods ==========

  /**
   * Add a new discussion topic
   */
  addTopic(title: string, introducedBy?: string): string {
    const topicId = randomUUID();
    const topic: DiscussionTopic = {
      id: topicId,
      title,
      status: 'pending',
      introducedAt: Date.now(),
    };

    // Only add introducedBy if defined (exactOptionalPropertyTypes compliance)
    if (introducedBy !== undefined) {
      topic.introducedBy = introducedBy;
    }

    this.topics.set(topicId, topic);
    return topicId;
  }

  /**
   * Set a topic as active
   */
  setActiveTopic(topicId: string): boolean {
    const topic = this.topics.get(topicId);
    if (!topic) {
      return false;
    }

    // Mark previous active topic as completed if exists
    if (this.activeTopicId) {
      const prevTopic = this.topics.get(this.activeTopicId);
      if (prevTopic && prevTopic.status === 'active') {
        prevTopic.status = 'completed';
        prevTopic.completedAt = Date.now();
      }
    }

    topic.status = 'active';
    this.activeTopicId = topicId;
    return true;
  }

  /**
   * Mark a topic as completed
   */
  completeTopic(topicId: string): boolean {
    const topic = this.topics.get(topicId);
    if (!topic) {
      return false;
    }

    topic.status = 'completed';
    topic.completedAt = Date.now();

    // If this was the active topic, clear active topic ID
    if (this.activeTopicId === topicId) {
      this.activeTopicId = null;
    }

    return true;
  }

  /**
   * Get current active topic
   */
  getActiveTopic(): DiscussionTopic | null {
    if (!this.activeTopicId) {
      return null;
    }
    return this.topics.get(this.activeTopicId) || null;
  }

  /**
   * Get all topics with optional status filter
   */
  getTopics(status?: 'pending' | 'active' | 'completed'): DiscussionTopic[] {
    const allTopics = Array.from(this.topics.values());
    if (status) {
      return allTopics.filter((t) => t.status === status);
    }
    return allTopics;
  }

  /**
   * Get topic summary for moderators
   */
  getTopicSummary(): {
    activeTopic: DiscussionTopic | null;
    pending: number;
    completed: number;
    topics: DiscussionTopic[];
  } {
    const topics = this.getTopics();
    return {
      activeTopic: this.getActiveTopic(),
      pending: topics.filter((t) => t.status === 'pending').length,
      completed: topics.filter((t) => t.status === 'completed').length,
      topics,
    };
  }

  /**
   * Shutdown the room, closing all connections
   */
  shutdown(): void {
    // Unsubscribe from message bus
    if (this.busUnsubscribe) {
      this.busUnsubscribe();
      this.busUnsubscribe = undefined;
    }

    // Close database connection
    this.repository.close();

    for (const agent of this.agents.values()) {
      agent.ws.close();
    }
    this.agents.clear();

    // Call shutdown callback if provided (e.g., to auto-delete from RoomManager)
    if (this.onShutdownCallback) {
      this.onShutdownCallback();
    }
  }
}
