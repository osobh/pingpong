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
  InvokeToolCommand,
  GetToolsCommand,
  RecordMemoryCommand,
  QueryMemoryCommand,
  UpdateMemoryCommand,
  DeleteMemoryCommand,
  ArchiveMemoryCommand,
  ResolveMemoryCommand,
  QueryMemoryStatsCommand,
  BulkCreateMemoriesCommand,
  BulkUpdateMemoriesCommand,
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
import { ToolRegistry } from './tools/tool-registry.js';
import { ToolExecutor } from './tools/tool-executor.js';
import { MockDatabaseToolHandler } from './tools/mock-database-tool.js';
import { MockSearchToolHandler } from './tools/mock-search-tool.js';
import { MockRAGToolHandler } from './tools/mock-rag-tool.js';
import {
  RoomTool,
  ToolType,
  ToolPermissionTier,
  ToolInvocationRequest,
} from '../shared/room-tools.js';
import { MemoryRepository } from './memory-repository.js';
import { MemoryExtractor } from './memory-extractor.js';
import {
  MemoryType,
  MemorySource,
  MemoryStatus,
  MemoryPriority,
  InjectionStrategy,
  type MemoryInjectionConfig,
  type MemoryStats,
} from '../shared/room-memory.js';
import type { MessageEvent } from '../shared/protocol.js';

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
 * Memory extraction performance metrics
 */
export interface ExtractionMetrics {
  totalExtractions: number;
  successfulExtractions: number;
  failedExtractions: number;
  totalExtractionTimeMs: number;
  totalMessagesAnalyzed: number;
  totalMemoriesExtracted: number;
  memoriesByType: Record<MemoryType, number>;
  memoriesByPriority: Record<MemoryPriority, number>;
  avgExtractionTimeMs: number;
  avgMemoriesPerExtraction: number;
  avgConfidence: number;
  lastExtractionAt?: number;
}

/**
 * Extraction job status
 */
export enum ExtractionJobStatus {
  PENDING = 'pending',
  PROCESSING = 'processing',
  COMPLETE = 'complete',
  FAILED = 'failed',
}

/**
 * Extraction job for background processing
 */
export interface ExtractionJob {
  id: string;
  roomId: string;
  status: ExtractionJobStatus;
  messages: MessageEvent[];
  createdAt: number;
  startedAt?: number;
  completedAt?: number;
  error?: string;
  result?: {
    memoriesExtracted: number;
    extractionTimeMs: number;
  };
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
  private toolRegistry: ToolRegistry;
  private toolExecutor: ToolExecutor;
  private memoryRepository: MemoryRepository;
  private memoryExtractor: MemoryExtractor | null = null;
  private recentMessages: MessageEvent[] = [];
  private messagesSinceExtraction = 0;
  private readonly EXTRACTION_THRESHOLD = 10; // Extract every 10 messages
  private extractionJobs = new Map<string, ExtractionJob>();
  private extractionQueue: string[] = []; // Queue of job IDs
  private isProcessingQueue = false;
  private memoryInjectionConfig: MemoryInjectionConfig = {
    strategy: InjectionStrategy.FULL, // Default: broadcast all memories
    maxEntries: 50,
    minPriority: MemoryPriority.LOW,
  };
  private extractionMetrics: ExtractionMetrics = {
    totalExtractions: 0,
    successfulExtractions: 0,
    failedExtractions: 0,
    totalExtractionTimeMs: 0,
    totalMessagesAnalyzed: 0,
    totalMemoriesExtracted: 0,
    memoriesByType: {
      [MemoryType.DECISION]: 0,
      [MemoryType.INSIGHT]: 0,
      [MemoryType.QUESTION]: 0,
      [MemoryType.ACTION_ITEM]: 0,
    },
    memoriesByPriority: {
      [MemoryPriority.LOW]: 0,
      [MemoryPriority.MEDIUM]: 0,
      [MemoryPriority.HIGH]: 0,
      [MemoryPriority.CRITICAL]: 0,
    },
    avgExtractionTimeMs: 0,
    avgMemoriesPerExtraction: 0,
    avgConfidence: 0,
  };

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

    // Initialize tool system
    this.toolRegistry = new ToolRegistry(this.id);
    this.toolExecutor = new ToolExecutor(this.toolRegistry);

    // Register mock tools for demonstration
    this.initializeMockTools();

    // Initialize memory system
    this.memoryRepository = new MemoryRepository(dbPath);

    // Initialize automatic memory extraction (optional - requires Ollama)
    const ollamaHost = process.env['OLLAMA_HOST'] || 'http://192.168.1.4:11434';
    const ollamaModel = process.env['OLLAMA_MODEL'] || 'deepseek-r1:latest';
    try {
      this.memoryExtractor = new MemoryExtractor({
        ollamaHost,
        model: ollamaModel,
        minConfidence: 0.7,
      });
      console.log(`[Room ${this.id}] Automatic memory extraction enabled (Ollama: ${ollamaHost}, Model: ${ollamaModel})`);
    } catch (error) {
      console.error(`[Room ${this.id}] Failed to initialize memory extractor:`, error);
    }
  }

  /**
   * Initialize mock tools for testing/demonstration
   */
  private initializeMockTools(): void {
    // Register mock database tool
    const dbTool: RoomTool = {
      name: 'database_query',
      type: ToolType.DATABASE,
      description: 'Query staging database schema',
      longDescription: 'Execute SQL queries against the mock staging database. Supports SELECT, SHOW TABLES, and DESCRIBE commands.',
      config: {
        connectionString: 'mock://staging-db',
        readOnly: true,
        maxResults: 100,
        allowedOperations: ['SELECT'],
      } as any,
      permissions: {
        tier: ToolPermissionTier.ALL,
      },
      rateLimit: {
        requestsPerHour: 50,
      },
      parameters: [
        {
          name: 'query',
          type: 'string',
          description: 'SQL query to execute',
          required: true,
        },
      ],
      examples: [
        'SELECT * FROM users LIMIT 10',
        'SHOW TABLES',
        'DESCRIBE trades',
      ],
      tags: ['database', 'sql', 'staging'],
      enabled: true,
      version: '1.0.0',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    this.toolRegistry.registerTool(dbTool);
    this.toolExecutor.registerHandler('database_query', new MockDatabaseToolHandler());

    // Register mock search tool
    const searchTool: RoomTool = {
      name: 'codebase_search',
      type: ToolType.SEARCH,
      description: 'Search codebase for keywords',
      longDescription: 'Search through the project codebase files for keywords and patterns. Returns file paths, excerpts, and relevance scores.',
      config: {
        provider: 'local',
        fileTypes: ['.ts', '.tsx', '.js', '.md'],
        maxResults: 10,
      } as any,
      permissions: {
        tier: ToolPermissionTier.ALL,
      },
      rateLimit: {
        requestsPerHour: 100,
      },
      parameters: [
        {
          name: 'query',
          type: 'string',
          description: 'Search query',
          required: true,
        },
        {
          name: 'fileType',
          type: 'string',
          description: 'Filter by file extension (e.g., .ts, .md)',
          required: false,
        },
      ],
      examples: [
        'agent runtime',
        'protocol message',
        'database connection',
      ],
      tags: ['search', 'codebase'],
      enabled: true,
      version: '1.0.0',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    this.toolRegistry.registerTool(searchTool);
    this.toolExecutor.registerHandler('codebase_search', new MockSearchToolHandler());

    // Register mock RAG tool
    const ragTool: RoomTool = {
      name: 'design_doc_retrieval',
      type: ToolType.RAG,
      description: 'Retrieve relevant design documents',
      longDescription: 'Search the design documentation using semantic search. Returns the most relevant documents based on vector similarity.',
      config: {
        provider: 'local',
        index: 'design-docs',
        topK: 5,
        scoreThreshold: 0.0,
      } as any,
      permissions: {
        tier: ToolPermissionTier.ALL,
      },
      rateLimit: {
        requestsPerHour: 30,
      },
      parameters: [
        {
          name: 'query',
          type: 'string',
          description: 'Semantic search query',
          required: true,
        },
      ],
      examples: [
        'database architecture decisions',
        'microservices vs monolith',
        'connection pooling strategies',
      ],
      tags: ['rag', 'documentation', 'search'],
      enabled: true,
      version: '1.0.0',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    this.toolRegistry.registerTool(ragTool);
    this.toolExecutor.registerHandler('design_doc_retrieval', new MockRAGToolHandler());
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
      case 'INVOKE_TOOL':
        this.handleInvokeTool(command);
        break;
      case 'GET_TOOLS':
        this.handleGetTools(command);
        break;
      case 'RECORD_MEMORY':
        this.handleRecordMemory(command);
        break;
      case 'QUERY_MEMORY':
        this.handleQueryMemory(command);
        break;
      case 'UPDATE_MEMORY':
        this.handleUpdateMemory(command);
        break;
      case 'DELETE_MEMORY':
        this.handleDeleteMemory(command);
        break;
      case 'ARCHIVE_MEMORY':
        this.handleArchiveMemory(command);
        break;
      case 'RESOLVE_MEMORY':
        this.handleResolveMemory(command);
        break;
      case 'QUERY_MEMORY_STATS':
        this.handleQueryMemoryStats(command);
        break;
      case 'BULK_CREATE_MEMORIES':
        this.handleBulkCreateMemories(command);
        break;
      case 'BULK_UPDATE_MEMORIES':
        this.handleBulkUpdateMemories(command);
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

    // Get available tools for this agent
    const availableTools = this.toolRegistry
      .getToolsForAgent(agent.id, agent.role)
      .map((tool) => ({
        name: tool.name,
        type: tool.type,
        description: tool.description,
        parameters: tool.parameters?.map((p) => ({
          name: p.name,
          type: p.type,
          description: p.description,
          required: p.required,
        })),
      }));

    // Get relevant memories for context
    const memories = this.getMemoriesForInjection();

    // Send WELCOME to the joining agent
    this.sendToAgent(agent.id, {
      type: 'WELCOME',
      roomId: this.id,
      topic: this.topic,
      mode: this.mode,
      agentCount: this.agents.size,
      tools: availableTools.length > 0 ? availableTools : undefined,
      memories: memories.length > 0 ? memories : undefined,
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

    // Track message for automatic extraction
    if (this.memoryExtractor) {
      this.trackMessageForExtraction(messageEvent);
    }

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
   * Handle tool invocation from an agent
   */
  private async handleInvokeTool(command: InvokeToolCommand): Promise<void> {
    const agent = this.agents.get(command.agentId);
    if (!agent) {
      this.sendToAgent(command.agentId, {
        type: 'ERROR',
        message: 'Agent not found',
        timestamp: Date.now(),
      });
      return;
    }

    try {
      // Check if agent has permission to use this tool
      const hasPermission = this.toolRegistry.hasPermission(
        command.toolName,
        agent.id,
        agent.role
      );

      if (!hasPermission) {
        this.sendToAgent(agent.id, {
          type: 'TOOL_RESULT',
          toolName: command.toolName,
          agentId: agent.id,
          success: false,
          error: `Permission denied: You do not have access to tool "${command.toolName}"`,
          executionTime: 0,
          timestamp: Date.now(),
        });
        return;
      }

      // Check rate limits
      const withinRateLimit = await this.toolRegistry.checkRateLimit(
        command.toolName,
        agent.id
      );

      if (!withinRateLimit) {
        this.sendToAgent(agent.id, {
          type: 'TOOL_RESULT',
          toolName: command.toolName,
          agentId: agent.id,
          success: false,
          error: `Rate limit exceeded for tool "${command.toolName}"`,
          executionTime: 0,
          timestamp: Date.now(),
        });
        return;
      }

      // Create tool invocation request
      const request: ToolInvocationRequest = {
        toolName: command.toolName,
        parameters: command.parameters,
        agentId: agent.id,
        roomId: this.id,
        timestamp: command.timestamp,
      };

      // Execute the tool
      const result = await this.toolExecutor.execute(request);

      // Send result back to the agent
      this.sendToAgent(agent.id, {
        type: 'TOOL_RESULT',
        toolName: result.toolName,
        agentId: agent.id,
        success: result.success,
        result: result.result,
        error: result.error,
        executionTime: result.executionTime,
        cached: result.cached,
        timestamp: result.timestamp,
      });
    } catch (error) {
      // Handle execution errors
      this.sendToAgent(agent.id, {
        type: 'TOOL_RESULT',
        toolName: command.toolName,
        agentId: agent.id,
        success: false,
        error: error instanceof Error ? error.message : 'Tool execution failed',
        executionTime: 0,
        timestamp: Date.now(),
      });
    }
  }

  /**
   * Handle request for available tools
   */
  private handleGetTools(command: GetToolsCommand): void {
    const agent = this.agents.get(command.agentId);
    if (!agent) {
      this.sendToAgent(command.agentId, {
        type: 'ERROR',
        message: 'Agent not found',
        timestamp: Date.now(),
      });
      return;
    }

    // Get all tools available to this agent
    const availableTools = this.toolRegistry.getToolsForAgent(agent.id, agent.role);

    // Map to protocol format with full details
    const toolsData = availableTools.map((tool) => ({
      name: tool.name,
      type: tool.type,
      description: tool.description,
      longDescription: tool.longDescription,
      parameters: tool.parameters?.map((p) => ({
        name: p.name,
        type: p.type,
        description: p.description,
        required: p.required,
        default: p.default,
      })),
      examples: tool.examples,
      tags: tool.tags,
    }));

    // Send TOOLS_AVAILABLE event to the requesting agent
    this.sendToAgent(agent.id, {
      type: 'TOOLS_AVAILABLE',
      tools: toolsData,
      timestamp: Date.now(),
    });
  }

  /**
   * Handle memory recording
   */
  private handleRecordMemory(command: RecordMemoryCommand): void {
    const agent = this.agents.get(command.agentId);
    if (!agent) {
      this.sendToAgent(command.agentId, {
        type: 'ERROR',
        message: 'Agent not found',
        timestamp: Date.now(),
      });
      return;
    }

    try {
      // Create memory entry
      const memoryEntry: any = {
        roomId: this.id,
        type: command.memoryType as MemoryType,
        source: MemorySource.MANUAL,
        status: MemoryStatus.ACTIVE,
        priority: (command.priority as MemoryPriority) || MemoryPriority.MEDIUM,
        content: command.content,
        tags: command.tags || [],
        createdBy: agent.id,
      };

      // Only add optional fields if they're defined
      if (command.context !== undefined) memoryEntry.context = command.context;
      if (command.summary !== undefined) memoryEntry.summary = command.summary;
      if (command.relatedMessageIds !== undefined) memoryEntry.relatedMessageIds = command.relatedMessageIds;
      if (command.relatedAgentIds !== undefined) memoryEntry.relatedAgentIds = command.relatedAgentIds;

      const memory = this.memoryRepository.create(memoryEntry);

      // Broadcast MEMORY_RECORDED event to all agents
      this.broadcast({
        type: 'MEMORY_RECORDED',
        memoryId: memory.id,
        memoryType: memory.type,
        content: memory.content,
        summary: memory.summary,
        priority: memory.priority,
        tags: memory.tags,
        createdBy: memory.createdBy,
        createdByName: agent.name,
        timestamp: Date.now(),
      });
    } catch (error) {
      this.sendToAgent(command.agentId, {
        type: 'ERROR',
        message: error instanceof Error ? error.message : 'Failed to record memory',
        timestamp: Date.now(),
      });
    }
  }

  /**
   * Handle memory query
   */
  private handleQueryMemory(command: QueryMemoryCommand): void {
    const agent = this.agents.get(command.agentId);
    if (!agent) {
      this.sendToAgent(command.agentId, {
        type: 'ERROR',
        message: 'Agent not found',
        timestamp: Date.now(),
      });
      return;
    }

    try {
      // Build query with only defined fields
      const queryParams: any = {
        roomId: this.id,
        limit: command.limit || 50,
        sortBy: 'createdAt',
        sortOrder: 'desc',
      };

      if (command.memoryType !== undefined) queryParams.type = command.memoryType as MemoryType;
      if (command.status !== undefined) queryParams.status = command.status as MemoryStatus;
      if (command.priority !== undefined) queryParams.priority = command.priority as MemoryPriority;
      if (command.tags !== undefined) queryParams.tags = command.tags;
      if (command.search !== undefined) queryParams.search = command.search;

      // Query memories
      const memories = this.memoryRepository.query(queryParams);

      // Build count params
      const countParams: any = { roomId: this.id };
      if (command.memoryType !== undefined) countParams.type = command.memoryType as MemoryType;
      if (command.status !== undefined) countParams.status = command.status as MemoryStatus;
      if (command.priority !== undefined) countParams.priority = command.priority as MemoryPriority;
      if (command.tags !== undefined) countParams.tags = command.tags;
      if (command.search !== undefined) countParams.search = command.search;

      const total = this.memoryRepository.count(countParams);

      // Send MEMORY_QUERY_RESULT to the requesting agent
      this.sendToAgent(agent.id, {
        type: 'MEMORY_QUERY_RESULT',
        memories: memories.map((m) => ({
          id: m.id,
          memoryType: m.type,
          content: m.content,
          context: m.context,
          summary: m.summary,
          status: m.status,
          priority: m.priority,
          tags: m.tags,
          createdBy: m.createdBy,
          createdAt: m.createdAt,
          updatedAt: m.updatedAt,
        })),
        total,
        timestamp: Date.now(),
      });
    } catch (error) {
      this.sendToAgent(command.agentId, {
        type: 'ERROR',
        message: error instanceof Error ? error.message : 'Failed to query memories',
        timestamp: Date.now(),
      });
    }
  }

  /**
   * Handle memory update
   */
  private handleUpdateMemory(command: UpdateMemoryCommand): void {
    const agent = this.agents.get(command.agentId);
    if (!agent) {
      this.sendToAgent(command.agentId, {
        type: 'ERROR',
        message: 'Agent not found',
        timestamp: Date.now(),
      });
      return;
    }

    try {
      // Update memory
      const updates: any = {};
      if (command.content !== undefined) updates.content = command.content;
      if (command.context !== undefined) updates.context = command.context;
      if (command.summary !== undefined) updates.summary = command.summary;
      if (command.priority !== undefined) updates.priority = command.priority as MemoryPriority;
      if (command.tags !== undefined) updates.tags = command.tags;

      const updatedMemory = this.memoryRepository.update(command.memoryId, updates);

      if (!updatedMemory) {
        this.sendToAgent(command.agentId, {
          type: 'ERROR',
          message: `Memory with ID "${command.memoryId}" not found`,
          timestamp: Date.now(),
        });
        return;
      }

      // Broadcast MEMORY_UPDATED event to all agents
      this.broadcast({
        type: 'MEMORY_UPDATED',
        memoryId: updatedMemory.id,
        updatedBy: agent.id,
        updatedByName: agent.name,
        changes: updates,
        timestamp: Date.now(),
      });
    } catch (error) {
      this.sendToAgent(command.agentId, {
        type: 'ERROR',
        message: error instanceof Error ? error.message : 'Failed to update memory',
        timestamp: Date.now(),
      });
    }
  }

  /**
   * Handle memory deletion
   */
  private handleDeleteMemory(command: DeleteMemoryCommand): void {
    const agent = this.agents.get(command.agentId);
    if (!agent) {
      this.sendToAgent(command.agentId, {
        type: 'ERROR',
        message: 'Agent not found',
        timestamp: Date.now(),
      });
      return;
    }

    try {
      const success = this.memoryRepository.delete(command.memoryId);

      if (!success) {
        this.sendToAgent(command.agentId, {
          type: 'ERROR',
          message: `Memory with ID "${command.memoryId}" not found`,
          timestamp: Date.now(),
        });
        return;
      }

      // Broadcast MEMORY_DELETED event to all agents
      this.broadcast({
        type: 'MEMORY_DELETED',
        memoryId: command.memoryId,
        deletedBy: agent.id,
        deletedByName: agent.name,
        timestamp: Date.now(),
      });
    } catch (error) {
      this.sendToAgent(command.agentId, {
        type: 'ERROR',
        message: error instanceof Error ? error.message : 'Failed to delete memory',
        timestamp: Date.now(),
      });
    }
  }

  /**
   * Handle memory archiving
   */
  private handleArchiveMemory(command: ArchiveMemoryCommand): void {
    const agent = this.agents.get(command.agentId);
    if (!agent) {
      this.sendToAgent(command.agentId, {
        type: 'ERROR',
        message: 'Agent not found',
        timestamp: Date.now(),
      });
      return;
    }

    try {
      const archivedMemory = this.memoryRepository.archive(command.memoryId);

      if (!archivedMemory) {
        this.sendToAgent(command.agentId, {
          type: 'ERROR',
          message: `Memory with ID "${command.memoryId}" not found`,
          timestamp: Date.now(),
        });
        return;
      }

      // Broadcast MEMORY_UPDATED event to all agents
      this.broadcast({
        type: 'MEMORY_UPDATED',
        memoryId: archivedMemory.id,
        updatedBy: agent.id,
        updatedByName: agent.name,
        changes: { status: MemoryStatus.ARCHIVED },
        timestamp: Date.now(),
      });
    } catch (error) {
      this.sendToAgent(command.agentId, {
        type: 'ERROR',
        message: error instanceof Error ? error.message : 'Failed to archive memory',
        timestamp: Date.now(),
      });
    }
  }

  /**
   * Handle memory resolution
   */
  private handleResolveMemory(command: ResolveMemoryCommand): void {
    const agent = this.agents.get(command.agentId);
    if (!agent) {
      this.sendToAgent(command.agentId, {
        type: 'ERROR',
        message: 'Agent not found',
        timestamp: Date.now(),
      });
      return;
    }

    try {
      const resolvedMemory = this.memoryRepository.resolve(command.memoryId, agent.id);

      if (!resolvedMemory) {
        this.sendToAgent(command.agentId, {
          type: 'ERROR',
          message: `Memory with ID "${command.memoryId}" not found`,
          timestamp: Date.now(),
        });
        return;
      }

      // Broadcast MEMORY_UPDATED event to all agents
      this.broadcast({
        type: 'MEMORY_UPDATED',
        memoryId: resolvedMemory.id,
        updatedBy: agent.id,
        updatedByName: agent.name,
        changes: { status: MemoryStatus.RESOLVED, resolvedBy: agent.id },
        timestamp: Date.now(),
      });
    } catch (error) {
      this.sendToAgent(command.agentId, {
        type: 'ERROR',
        message: error instanceof Error ? error.message : 'Failed to resolve memory',
        timestamp: Date.now(),
      });
    }
  }

  /**
   * Handle query memory stats command
   */
  private handleQueryMemoryStats(command: QueryMemoryStatsCommand): void {
    const agent = this.agents.get(command.agentId);
    if (!agent) {
      this.sendToAgent(command.agentId, {
        type: 'ERROR',
        message: 'Agent not found',
        timestamp: Date.now(),
      });
      return;
    }

    try {
      const stats = this.getMemoryStats();

      // Send stats to the agent who requested them
      this.sendToAgent(command.agentId, {
        type: 'MEMORY_STATS',
        roomId: stats.roomId,
        total: stats.total,
        byType: {
          decision: stats.byType[MemoryType.DECISION] || 0,
          insight: stats.byType[MemoryType.INSIGHT] || 0,
          question: stats.byType[MemoryType.QUESTION] || 0,
          action_item: stats.byType[MemoryType.ACTION_ITEM] || 0,
        },
        byStatus: {
          active: stats.byStatus[MemoryStatus.ACTIVE] || 0,
          archived: stats.byStatus[MemoryStatus.ARCHIVED] || 0,
          resolved: stats.byStatus[MemoryStatus.RESOLVED] || 0,
        },
        byPriority: {
          low: stats.byPriority[MemoryPriority.LOW] || 0,
          medium: stats.byPriority[MemoryPriority.MEDIUM] || 0,
          high: stats.byPriority[MemoryPriority.HIGH] || 0,
          critical: stats.byPriority[MemoryPriority.CRITICAL] || 0,
        },
        bySource: {
          agent: stats.bySource[MemorySource.MANUAL] || 0,
          system: stats.bySource[MemorySource.SYSTEM] || 0,
          extracted: stats.bySource[MemorySource.AUTOMATIC] || 0,
        },
        timestamp: Date.now(),
      });
    } catch (error) {
      this.sendToAgent(command.agentId, {
        type: 'ERROR',
        message: error instanceof Error ? error.message : 'Failed to get memory stats',
        timestamp: Date.now(),
      });
    }
  }

  /**
   * Handle bulk memory creation
   */
  private handleBulkCreateMemories(command: BulkCreateMemoriesCommand): void {
    const agent = this.agents.get(command.agentId);
    if (!agent) {
      this.sendToAgent(command.agentId, {
        type: 'ERROR',
        message: 'Agent not found',
        timestamp: Date.now(),
      });
      return;
    }

    const results: Array<{
      index: number;
      success: boolean;
      memoryId?: string;
      error?: string;
    }> = [];

    let successCount = 0;
    let failCount = 0;

    // Process each memory creation
    for (let i = 0; i < command.memories.length; i++) {
      const memoryData = command.memories[i];
      if (!memoryData) {
        results.push({
          index: i,
          success: false,
          error: 'Invalid memory data',
        });
        failCount++;
        continue;
      }

      try {
        // Create memory entry
        const memoryEntry: any = {
          roomId: this.id,
          type: memoryData.memoryType as MemoryType,
          source: MemorySource.MANUAL,
          status: MemoryStatus.ACTIVE,
          priority: (memoryData.priority as MemoryPriority) || MemoryPriority.MEDIUM,
          content: memoryData.content,
          tags: memoryData.tags || [],
          createdBy: agent.id,
        };

        // Only add optional fields if they're defined
        if (memoryData.context !== undefined) memoryEntry.context = memoryData.context;
        if (memoryData.summary !== undefined) memoryEntry.summary = memoryData.summary;
        if (memoryData.relatedMessageIds !== undefined) memoryEntry.relatedMessageIds = memoryData.relatedMessageIds;
        if (memoryData.relatedAgentIds !== undefined) memoryEntry.relatedAgentIds = memoryData.relatedAgentIds;

        const memory = this.memoryRepository.create(memoryEntry);

        // Record success
        results.push({
          index: i,
          success: true,
          memoryId: memory.id,
        });
        successCount++;

        // Broadcast MEMORY_RECORDED event to all agents
        this.broadcast({
          type: 'MEMORY_RECORDED',
          memoryId: memory.id,
          memoryType: memory.type,
          content: memory.content,
          summary: memory.summary,
          priority: memory.priority,
          tags: memory.tags,
          createdBy: memory.createdBy,
          createdByName: agent.name,
          timestamp: Date.now(),
        });
      } catch (error) {
        // Record failure
        results.push({
          index: i,
          success: false,
          error: error instanceof Error ? error.message : 'Failed to create memory',
        });
        failCount++;
      }
    }

    // Send BULK_MEMORIES_RESULT to the requesting agent
    this.sendToAgent(agent.id, {
      type: 'BULK_MEMORIES_RESULT',
      operation: 'create',
      successful: successCount,
      failed: failCount,
      results,
      timestamp: Date.now(),
    });
  }

  /**
   * Handle bulk memory updates
   */
  private handleBulkUpdateMemories(command: BulkUpdateMemoriesCommand): void {
    const agent = this.agents.get(command.agentId);
    if (!agent) {
      this.sendToAgent(command.agentId, {
        type: 'ERROR',
        message: 'Agent not found',
        timestamp: Date.now(),
      });
      return;
    }

    const results: Array<{
      index: number;
      success: boolean;
      memoryId?: string;
      error?: string;
    }> = [];

    let successCount = 0;
    let failCount = 0;

    // Process each memory update
    for (let i = 0; i < command.updates.length; i++) {
      const updateData = command.updates[i];
      if (!updateData) {
        results.push({
          index: i,
          success: false,
          error: 'Invalid update data',
        });
        failCount++;
        continue;
      }

      try {
        // Build updates object
        const updates: any = {};
        if (updateData.content !== undefined) updates.content = updateData.content;
        if (updateData.context !== undefined) updates.context = updateData.context;
        if (updateData.summary !== undefined) updates.summary = updateData.summary;
        if (updateData.priority !== undefined) updates.priority = updateData.priority as MemoryPriority;
        if (updateData.tags !== undefined) updates.tags = updateData.tags;

        const updatedMemory = this.memoryRepository.update(updateData.memoryId, updates);

        if (!updatedMemory) {
          results.push({
            index: i,
            success: false,
            error: `Memory with ID "${updateData.memoryId}" not found`,
          });
          failCount++;
          continue;
        }

        // Record success
        results.push({
          index: i,
          success: true,
          memoryId: updatedMemory.id,
        });
        successCount++;

        // Broadcast MEMORY_UPDATED event to all agents
        this.broadcast({
          type: 'MEMORY_UPDATED',
          memoryId: updatedMemory.id,
          updatedBy: agent.id,
          updatedByName: agent.name,
          changes: updates,
          timestamp: Date.now(),
        });
      } catch (error) {
        // Record failure
        results.push({
          index: i,
          success: false,
          error: error instanceof Error ? error.message : 'Failed to update memory',
        });
        failCount++;
      }
    }

    // Send BULK_MEMORIES_RESULT to the requesting agent
    this.sendToAgent(agent.id, {
      type: 'BULK_MEMORIES_RESULT',
      operation: 'update',
      successful: successCount,
      failed: failCount,
      results,
      timestamp: Date.now(),
    });
  }

  /**
   * Get memory statistics for this room
   */
  getMemoryStats(): MemoryStats {
    return this.memoryRepository.getStats(this.id);
  }

  /**
   * Get memories for injection when agent joins
   */
  private getMemoriesForInjection(): Array<{
    id: string;
    type: string;
    content: string;
    summary?: string;
    priority: string;
    createdAt: number;
  }> {
    try {
      // Query recent active memories with medium or higher priority
      const queryParams: any = {
        roomId: this.id,
        status: MemoryStatus.ACTIVE,
        type: [MemoryType.DECISION, MemoryType.INSIGHT, MemoryType.ACTION_ITEM],
        limit: 10,
        sortBy: 'createdAt',
        sortOrder: 'desc',
      };

      const memories = this.memoryRepository.query(queryParams);

      // Filter by priority (medium, high, critical)
      const filteredMemories = memories.filter(
        (m) =>
          m.priority === MemoryPriority.MEDIUM ||
          m.priority === MemoryPriority.HIGH ||
          m.priority === MemoryPriority.CRITICAL
      );

      // Format for protocol
      return filteredMemories.map((m) => {
        const formatted: any = {
          id: m.id,
          type: m.type,
          content: m.content,
          priority: m.priority,
          createdAt: m.createdAt,
        };

        // Only add summary if defined
        if (m.summary !== undefined) {
          formatted.summary = m.summary;
        }

        return formatted;
      });
    } catch (error) {
      console.error('Failed to get memories for injection:', error);
      return [];
    }
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
   * Track message for automatic memory extraction
   */
  private trackMessageForExtraction(messageEvent: ServerEvent): void {
    if (!this.memoryExtractor || messageEvent.type !== 'MESSAGE') {
      return;
    }

    // Add to recent messages buffer (keep last 20 messages)
    this.recentMessages.push(messageEvent as MessageEvent);
    if (this.recentMessages.length > 20) {
      this.recentMessages.shift(); // Remove oldest
    }

    this.messagesSinceExtraction++;

    // Trigger extraction if threshold reached
    if (this.messagesSinceExtraction >= this.EXTRACTION_THRESHOLD) {
      this.queueExtraction();
    }
  }

  /**
   * Queue an extraction job
   */
  private queueExtraction(): void {
    if (!this.memoryExtractor || this.recentMessages.length === 0) {
      return;
    }

    // Create a snapshot of current messages
    const messagesToExtract = [...this.recentMessages];

    // Create extraction job
    const job: ExtractionJob = {
      id: randomUUID(),
      roomId: this.id,
      status: ExtractionJobStatus.PENDING,
      messages: messagesToExtract,
      createdAt: Date.now(),
    };

    // Add to queue
    this.extractionJobs.set(job.id, job);
    this.extractionQueue.push(job.id);

    console.log(
      `[Room ${this.id}] 📋 Extraction job queued`,
      JSON.stringify({
        jobId: job.id,
        messageCount: messagesToExtract.length,
        queueLength: this.extractionQueue.length,
      })
    );

    // Reset counter immediately (messages are captured in job)
    this.messagesSinceExtraction = 0;

    // Start processing queue if not already running
    if (!this.isProcessingQueue) {
      this.processExtractionQueue();
    }
  }

  /**
   * Process the extraction queue in the background
   */
  private async processExtractionQueue(): Promise<void> {
    if (this.isProcessingQueue || this.extractionQueue.length === 0) {
      return;
    }

    this.isProcessingQueue = true;

    while (this.extractionQueue.length > 0) {
      const jobId = this.extractionQueue.shift();
      if (!jobId) continue;

      const job = this.extractionJobs.get(jobId);
      if (!job) continue;

      await this.performExtractionJob(job);
    }

    this.isProcessingQueue = false;
  }

  /**
   * Perform extraction for a specific job
   */
  private async performExtractionJob(job: ExtractionJob): Promise<void> {
    if (!this.memoryExtractor) {
      job.status = ExtractionJobStatus.FAILED;
      job.error = 'Memory extractor not available';
      job.completedAt = Date.now();
      return;
    }

    const startTime = Date.now();
    const messageCount = job.messages.length;

    // Update job status
    job.status = ExtractionJobStatus.PROCESSING;
    job.startedAt = startTime;

    console.log(
      `[Room ${this.id}] 🧠 Memory extraction started`,
      JSON.stringify({
        jobId: job.id,
        messageCount,
        timeRange: {
          start: job.messages[0]?.timestamp,
          end: job.messages[messageCount - 1]?.timestamp,
        },
        participants: Array.from(new Set(job.messages.map(m => m.agentName))),
      })
    );

    // Increment total extractions
    this.extractionMetrics.totalExtractions++;

    try {
      const result = await this.memoryExtractor.extractFromMessages(
        this.id,
        job.messages,
      );

      const extractionTime = Date.now() - startTime;

      // Count memories by type and priority
      const typeBreakdown = result.memories.reduce((acc, m) => {
        acc[m.type] = (acc[m.type] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);

      const priorityBreakdown = result.memories.reduce((acc, m) => {
        acc[m.priority] = (acc[m.priority] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);

      // Update metrics
      this.extractionMetrics.successfulExtractions++;
      this.extractionMetrics.totalExtractionTimeMs += extractionTime;
      this.extractionMetrics.totalMessagesAnalyzed += result.messagesAnalyzed;
      this.extractionMetrics.totalMemoriesExtracted += result.memories.length;
      this.extractionMetrics.lastExtractionAt = Date.now();

      // Update type and priority counts
      for (const memory of result.memories) {
        this.extractionMetrics.memoriesByType[memory.type]++;
        this.extractionMetrics.memoriesByPriority[memory.priority]++;
      }

      // Update averages
      this.extractionMetrics.avgExtractionTimeMs =
        this.extractionMetrics.totalExtractionTimeMs / this.extractionMetrics.successfulExtractions;
      this.extractionMetrics.avgMemoriesPerExtraction =
        this.extractionMetrics.totalMemoriesExtracted / this.extractionMetrics.successfulExtractions;

      // Calculate average confidence
      if (result.memories.length > 0) {
        const totalConfidence = result.memories.reduce((sum, m) => sum + m.confidence, 0);
        const currentAvg = totalConfidence / result.memories.length;
        // Running average of confidence
        this.extractionMetrics.avgConfidence =
          (this.extractionMetrics.avgConfidence * (this.extractionMetrics.successfulExtractions - 1) +
            currentAvg) /
          this.extractionMetrics.successfulExtractions;
      }

      console.log(
        `[Room ${this.id}] ✅ Memory extraction completed`,
        JSON.stringify({
          extractionTimeMs: extractionTime,
          messagesAnalyzed: result.messagesAnalyzed,
          memoriesExtracted: result.memories.length,
          typeBreakdown,
          priorityBreakdown,
          avgConfidence: result.memories.length > 0
            ? (result.memories.reduce((sum, m) => sum + m.confidence, 0) / result.memories.length).toFixed(2)
            : '0.00',
        })
      );

      // Create memory entries for each extracted memory
      let savedCount = 0;
      let broadcastCount = 0;

      for (const extracted of result.memories) {
        const entry: any = {
          roomId: this.id,
          type: extracted.type,
          source: MemorySource.AUTOMATIC, // Mark as automatically extracted
          status: MemoryStatus.ACTIVE,
          priority: extracted.priority,
          content: extracted.content,
          tags: extracted.tags,
          createdBy: 'system',
        };

        // Only add optional fields if they're present
        if (extracted.context) entry.context = extracted.context;
        if (extracted.relatedMessageIds) entry.relatedMessageIds = extracted.relatedMessageIds;
        if (extracted.relatedAgentIds) entry.relatedAgentIds = extracted.relatedAgentIds;

        const memory = this.memoryRepository.create(entry);
        savedCount++;

        // Apply injection strategy filtering
        if (this.shouldBroadcastMemory(memory)) {
          // Broadcast MEMORY_RECORDED event to all agents
          this.broadcast({
            type: 'MEMORY_RECORDED',
            memoryId: memory.id,
            memoryType: memory.type,
            content: memory.content,
            summary: memory.summary,
            priority: memory.priority,
            tags: memory.tags,
            createdBy: memory.createdBy,
            createdByName: 'System (Auto-extracted)',
            timestamp: Date.now(),
          });
          broadcastCount++;
        }
      }

      console.log(
        `[Room ${this.id}] 📤 Memory events broadcast`,
        JSON.stringify({
          saved: savedCount,
          broadcast: broadcastCount,
          recipients: this.agents.size,
        })
      );

      // Update job with successful completion
      job.status = ExtractionJobStatus.COMPLETE;
      job.completedAt = Date.now();
      job.result = {
        memoriesExtracted: result.memories.length,
        extractionTimeMs: extractionTime,
      };
    } catch (error) {
      const extractionTime = Date.now() - startTime;

      // Update failure metrics
      this.extractionMetrics.failedExtractions++;
      this.extractionMetrics.totalExtractionTimeMs += extractionTime;

      // Update job with failure
      job.status = ExtractionJobStatus.FAILED;
      job.completedAt = Date.now();
      job.error = error instanceof Error ? error.message : String(error);

      console.error(
        `[Room ${this.id}] ❌ Memory extraction failed`,
        JSON.stringify({
          jobId: job.id,
          extractionTimeMs: extractionTime,
          messageCount,
          error: job.error,
          stack: error instanceof Error ? error.stack : undefined,
        })
      );
    }
  }

  /**
   * Get extraction jobs (for monitoring)
   */
  getExtractionJobs(): ExtractionJob[] {
    return Array.from(this.extractionJobs.values());
  }

  /**
   * Get extraction job by ID
   */
  getExtractionJob(jobId: string): ExtractionJob | undefined {
    return this.extractionJobs.get(jobId);
  }

  /**
   * Get extraction performance metrics
   */
  getExtractionMetrics(): ExtractionMetrics {
    return { ...this.extractionMetrics };
  }

  /**
   * Get memory injection configuration
   */
  getMemoryInjectionConfig(): MemoryInjectionConfig {
    return { ...this.memoryInjectionConfig };
  }

  /**
   * Set memory injection configuration
   */
  setMemoryInjectionConfig(config: Partial<MemoryInjectionConfig>): void {
    this.memoryInjectionConfig = {
      ...this.memoryInjectionConfig,
      ...config,
    };
    console.log(
      `[Room ${this.id}] Memory injection strategy updated`,
      JSON.stringify(this.memoryInjectionConfig)
    );
  }

  /**
   * Determine if a memory should be broadcast based on injection strategy
   */
  private shouldBroadcastMemory(memory: any): boolean {
    const strategy = this.memoryInjectionConfig.strategy;

    // NONE: Don't broadcast any memories
    if (strategy === InjectionStrategy.NONE) {
      return false;
    }

    // Check type filters
    if (this.memoryInjectionConfig.includeTypes) {
      if (!this.memoryInjectionConfig.includeTypes.includes(memory.type)) {
        return false;
      }
    }
    if (this.memoryInjectionConfig.excludeTypes) {
      if (this.memoryInjectionConfig.excludeTypes.includes(memory.type)) {
        return false;
      }
    }

    // Check priority filter
    if (this.memoryInjectionConfig.minPriority) {
      const priorityOrder: Record<MemoryPriority, number> = {
        [MemoryPriority.LOW]: 0,
        [MemoryPriority.MEDIUM]: 1,
        [MemoryPriority.HIGH]: 2,
        [MemoryPriority.CRITICAL]: 3,
      };
      if (
        priorityOrder[memory.priority as MemoryPriority] <
        priorityOrder[this.memoryInjectionConfig.minPriority]
      ) {
        return false;
      }
    }

    // CRITICAL: Only broadcast critical/high priority memories
    if (strategy === InjectionStrategy.CRITICAL) {
      return (
        memory.priority === MemoryPriority.CRITICAL ||
        memory.priority === MemoryPriority.HIGH
      );
    }

    // FULL, SUMMARY, RECENT, RELEVANT: Broadcast (with potential aggregation later)
    return true;
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

    // Close database connections
    this.repository.close();
    this.memoryRepository.close();

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
