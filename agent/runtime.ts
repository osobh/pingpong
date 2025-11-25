/**
 * AgentRuntime - Orchestrates AgentClient and AgentLLM for autonomous agent behavior
 */

import { EventEmitter } from 'events';
import { AgentClient } from './client.js';
import { AgentLLM, type AgentLLMConfig } from './llm.js';
import { ConversationMemory } from './conversation-memory.js';
import { VoteManager } from './vote-manager.js';
import { ConversationFlowTracker } from './conversation-flow-tracker.js';
import { RelevanceFilter } from './relevance-filter.js';
import { ProposalStatus } from './proposal.js';
import { AgentRole, ConversationMode } from '../shared/types.js';
import {
  AgentMetadata,
  AgentCapability,
  LLMConfig,
  PersonalityTraits,
} from '../shared/agent-metadata.js';

/**
 * Configuration for AgentRuntime
 */
export interface AgentRuntimeConfig {
  agentId: string;
  agentName: string;
  role: AgentRole;
  serverUrl: string;
  ollamaHost: string;
  ollamaModel: string;
  // Optional metadata configuration
  version?: string;
  llmConfig?: Partial<LLMConfig>; // Partial because host/model come from ollamaHost/ollamaModel
  personality?: PersonalityTraits;
  customMetadata?: Record<string, unknown>;
}

/**
 * AgentRuntime orchestrates the agent's behavior
 */
export class AgentRuntime extends EventEmitter {
  private client: AgentClient;
  private llm: AgentLLM;
  private memory: ConversationMemory;
  private voteManager: VoteManager;
  private flowTracker: ConversationFlowTracker;
  private relevanceFilter: RelevanceFilter;
  private _isRunning = false;
  private role: AgentRole;
  private mode: ConversationMode = 'deep'; // Default mode, will be updated on WELCOME
  private metadata: AgentMetadata;
  private config: AgentRuntimeConfig;

  constructor(config: AgentRuntimeConfig) {
    super();

    // Validate role
    const validRoles: AgentRole[] = ['architect', 'critic', 'pragmatist', 'moderator', 'participant'];
    if (!validRoles.includes(config.role)) {
      throw new Error(`Invalid role: ${config.role}. Must be one of: ${validRoles.join(', ')}`);
    }

    // Store config and role
    this.config = config;
    this.role = config.role;

    // Build agent metadata
    this.metadata = this.buildMetadata();

    // Create client with metadata
    this.client = new AgentClient({
      agentId: config.agentId,
      agentName: config.agentName,
      role: config.role,
      serverUrl: config.serverUrl,
      metadata: this.metadata,
    });

    // Create LLM with optional parameters from config
    const llmConfig: AgentLLMConfig = {
      host: config.ollamaHost,
      model: config.ollamaModel,
      role: config.role,
    };
    if (config.llmConfig?.temperature !== undefined) llmConfig.temperature = config.llmConfig.temperature;
    if (config.llmConfig?.maxTokens !== undefined) llmConfig.maxTokens = config.llmConfig.maxTokens;
    if (config.llmConfig?.topP !== undefined) llmConfig.topP = config.llmConfig.topP;
    if (config.llmConfig?.topK !== undefined) llmConfig.topK = config.llmConfig.topK;
    if (config.llmConfig?.repeatPenalty !== undefined) llmConfig.repeatPenalty = config.llmConfig.repeatPenalty;

    this.llm = new AgentLLM(llmConfig);

    // Create conversation memory
    this.memory = new ConversationMemory();

    // Create vote manager
    this.voteManager = new VoteManager();

    // Create flow tracker (for moderators to monitor conversation)
    this.flowTracker = new ConversationFlowTracker();

    // Create relevance filter (for deciding when to respond)
    this.relevanceFilter = new RelevanceFilter({
      agentName: config.agentName,
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
   * Get the conversation memory instance
   */
  getMemory(): ConversationMemory {
    return this.memory;
  }

  /**
   * Get the vote manager instance
   */
  getVoteManager(): VoteManager {
    return this.voteManager;
  }

  /**
   * Get the flow tracker instance
   */
  getFlowTracker(): ConversationFlowTracker {
    return this.flowTracker;
  }

  /**
   * Create a proposal
   * @param title Proposal title
   * @param description Proposal description
   * @param threshold Optional approval threshold (0.0 to 1.0)
   * @returns Promise<boolean> - true if sent successfully
   */
  async createProposal(
    title: string,
    description: string,
    threshold?: number,
  ): Promise<boolean> {
    return this.client.createProposal(title, description, threshold);
  }

  /**
   * Vote on a proposal
   * @param proposalId ID of the proposal to vote on
   * @param vote Vote type ('yes', 'no', or 'abstain')
   * @param rationale Optional explanation for the vote
   * @returns Promise<boolean> - true if sent successfully
   */
  async vote(
    proposalId: string,
    vote: 'yes' | 'no' | 'abstain',
    rationale?: string,
  ): Promise<boolean> {
    return this.client.vote(proposalId, vote, rationale);
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
    this.memory.clear();
    this.flowTracker.clear();
  }

  /**
   * Set up event handlers for client events
   */
  private setupEventHandlers(): void {
    // Handle welcome event - respond to topic
    this.client.on('welcome', async (data: { topic: string; mode: ConversationMode }) => {
      // Store room mode
      this.mode = data.mode;

      if (this._isRunning) {
        try {
          const response = await this.llm.respondToTopic(data.topic, this.mode);
          await this.client.sendMessage(response);
          this.emit('messageSent', response);
        } catch (error) {
          this.emit('error', error);
        }
      }
    });

    // Handle incoming messages - generate and send response
    this.client.on(
      'message',
      async (data: { agentId: string; agentName: string; role: string; content: string }) => {
        this.emit('messageReceived', data.content);

        const message = {
          agentId: data.agentId,
          agentName: data.agentName,
          role: data.role,
          content: data.content,
          timestamp: Date.now(),
        };

        // Store message in memory
        this.memory.addMessage(message);

        // Track message in flow tracker
        this.flowTracker.addMessage(message);

        if (this._isRunning) {
          // Check if we should respond to this message
          const recentHistory = this.memory.getRecentMessages(20); // Get last 20 messages for context
          const shouldRespond = this.relevanceFilter.shouldRespond(message, recentHistory);

          if (shouldRespond) {
            try {
              let response: string;

              // Moderators get flow context to help guide the conversation
              if (this.role === 'moderator') {
                const flowStats = this.flowTracker.getFlowStats();
                const pendingProposals = this.voteManager.getPendingCount();
                const approvedProposals = this.voteManager.getProposalsByStatus(ProposalStatus.APPROVED).length;
                const rejectedProposals = this.voteManager.getProposalsByStatus(ProposalStatus.REJECTED).length;

                response = await this.llm.respondToMessageWithFlowContext(data.content, {
                  isStalled: flowStats.isStalled,
                  isCircular: flowStats.isCircular,
                  activeTopics: flowStats.activeTopics,
                  messageCount: flowStats.messageCount,
                  pendingProposals,
                  approvedProposals,
                  rejectedProposals,
                }, this.mode);

                // Periodically analyze for proposal opportunities (every ~5 messages)
                if (flowStats.messageCount % 5 === 0 && pendingProposals === 0) {
                  try {
                    const recentMessages = recentHistory.slice(-10).map((m) => ({
                      agentName: m.agentName,
                      content: m.content,
                    }));

                    const analysis = await this.llm.analyzeForProposal(recentMessages);

                    if (analysis.shouldPropose && analysis.title && analysis.description) {
                      // Create the proposal
                      await this.client.createProposal(analysis.title, analysis.description);
                    }
                  } catch (error) {
                    // Silently fail - proposal creation is optional
                  }
                }
              } else {
                response = await this.llm.respondToMessage(data.content, this.mode);
              }

              await this.client.sendMessage(response);
              this.emit('messageSent', response);
            } catch (error) {
              this.emit('error', error);
            }
          }
        }
      },
    );

    // Handle agent joined events
    this.client.on('agent_joined', (data: { agentName: string }) => {
      this.emit('agentJoined', data.agentName);
    });

    // Handle agent left events
    this.client.on('agent_left', (data: { agentName: string }) => {
      this.emit('agentLeft', data.agentName);
    });

    // Handle proposal created events
    this.client.on(
      'proposal_created',
      async (data: {
        proposalId: string;
        title: string;
        description: string;
        proposerId: string;
        proposerName: string;
        threshold: number;
      }) => {
        // Track proposal in local vote manager
        this.voteManager.createProposal({
          id: data.proposalId,
          title: data.title,
          description: data.description,
          proposerId: data.proposerId,
          proposerName: data.proposerName,
          threshold: data.threshold,
        });

        this.emit('proposalCreated', data);

        // Automatically vote on proposals using LLM
        if (this._isRunning) {
          try {
            // Get conversation context
            const context = this.memory.getContextSummary(10);

            // Use LLM to decide how to vote
            const voteDecision = await this.llm.decideVote(data.title, data.description, context, this.mode);

            // Cast the vote
            await this.client.vote(data.proposalId, voteDecision.vote, voteDecision.rationale);
          } catch (error) {
            this.emit('error', error);
          }
        }
      },
    );

    // Handle vote cast events
    this.client.on(
      'vote_cast',
      (data: {
        proposalId: string;
        agentId: string;
        agentName: string;
        vote: 'yes' | 'no' | 'abstain';
        rationale?: string;
      }) => {
        // Note: We don't update local vote manager here because votes are managed server-side
        // Agents only need to know about votes, not maintain full vote state
        this.emit('voteCast', data);
      },
    );

    // Handle proposal resolved events
    this.client.on(
      'proposal_resolved',
      (data: {
        proposalId: string;
        title: string;
        status: 'approved' | 'rejected';
        yesVotes: number;
        noVotes: number;
        abstainVotes: number;
        totalVotes: number;
      }) => {
        // Update local vote manager with resolution
        const status = data.status === 'approved' ? ProposalStatus.APPROVED : ProposalStatus.REJECTED;
        const proposal = this.voteManager.getProposal(data.proposalId);
        if (proposal) {
          proposal.setStatus(status);
        }

        this.emit('proposalResolved', data);
      },
    );

    // Forward errors
    this.client.on('error', (error: Error) => {
      this.emit('error', error);
    });
  }

  /**
   * Determine agent capabilities based on role
   */
  private determineCapabilities(): AgentCapability[] {
    const capabilities: AgentCapability[] = [AgentCapability.VOTE]; // All agents can vote

    switch (this.role) {
      case 'moderator':
        capabilities.push(
          AgentCapability.PROPOSE,
          AgentCapability.MODERATE,
          AgentCapability.SUMMARIZE,
          AgentCapability.DECISION_MAKING,
        );
        break;
      case 'architect':
        capabilities.push(AgentCapability.PROPOSE, AgentCapability.ANALYZE, AgentCapability.DECISION_MAKING);
        break;
      case 'critic':
        capabilities.push(AgentCapability.ANALYZE, AgentCapability.CODE_REVIEW);
        break;
      case 'pragmatist':
        capabilities.push(AgentCapability.PROPOSE, AgentCapability.DECISION_MAKING);
        break;
      case 'participant':
        // Participant has basic voting capability only
        break;
    }

    return capabilities;
  }

  /**
   * Get default personality traits based on role
   */
  private getDefaultPersonality(): PersonalityTraits {
    switch (this.role) {
      case 'moderator':
        return {
          verbosity: 'moderate',
          formality: 'professional',
          assertiveness: 0.7,
          creativity: 0.5,
          criticalThinking: 0.8,
        };
      case 'architect':
        return {
          verbosity: 'moderate',
          formality: 'professional',
          assertiveness: 0.6,
          creativity: 0.8,
          criticalThinking: 0.7,
        };
      case 'critic':
        return {
          verbosity: 'concise',
          formality: 'professional',
          assertiveness: 0.8,
          creativity: 0.4,
          criticalThinking: 0.9,
        };
      case 'pragmatist':
        return {
          verbosity: 'concise',
          formality: 'casual',
          assertiveness: 0.7,
          creativity: 0.5,
          criticalThinking: 0.6,
        };
      case 'participant':
      default:
        return {
          verbosity: 'moderate',
          formality: 'casual',
          assertiveness: 0.5,
          creativity: 0.5,
          criticalThinking: 0.5,
        };
    }
  }

  /**
   * Build agent metadata from configuration
   */
  private buildMetadata(): AgentMetadata {
    const now = Date.now();

    // Build LLM config
    const llmConfig: LLMConfig = {
      provider: 'ollama',
      model: this.config.ollamaModel,
      host: this.config.ollamaHost,
      ...this.config.llmConfig, // Allow overrides
    };

    // Get personality (use config or defaults)
    const personality = this.config.personality || this.getDefaultPersonality();

    // Get system prompt summary from LLM role prompts (first 200 chars)
    const systemPromptSummary = this.getSystemPromptSummary();

    // Build metadata object with required fields
    const metadata: AgentMetadata = {
      agentId: this.config.agentId,
      agentName: this.config.agentName,
      type: 'ai',
      role: this.role,
      capabilities: this.determineCapabilities(),
      llmConfig,
      personality,
      systemPromptSummary,
      createdAt: now,
      lastUpdatedAt: now,
    };

    // Add optional fields only if they're defined
    if (this.config.version !== undefined) metadata.version = this.config.version;
    if (this.config.customMetadata !== undefined) metadata.custom = this.config.customMetadata;

    return metadata;
  }

  /**
   * Get system prompt summary (first 200 characters of role prompt)
   */
  private getSystemPromptSummary(): string {
    const rolePrompts: Record<string, string> = {
      architect: 'Design high-level system architecture. Think about scalability, maintainability, and extensibility. Propose structural solutions.',
      critic: 'Question assumptions and find potential problems. Identify risks and edge cases. Challenge proposed solutions constructively.',
      pragmatist: 'Focus on practical implementation. Balance ideals with constraints. Propose actionable next steps.',
      moderator: 'Guide conversation through structured topics. Detect when discussion stalls. Create proposals at decision points.',
      participant: 'Participate in technical discussions. Share perspectives and vote on proposals.',
    };

    const prompt = rolePrompts[this.role] || rolePrompts['participant'] || '';
    return prompt.substring(0, 200);
  }

  /**
   * Get agent metadata
   */
  getMetadata(): AgentMetadata {
    return { ...this.metadata };
  }

  /**
   * Update agent metadata
   * @param updates Partial metadata updates
   */
  async updateMetadata(
    updates: Partial<Omit<AgentMetadata, 'agentId' | 'agentName' | 'type' | 'createdAt'>>,
  ): Promise<boolean> {
    this.metadata = {
      ...this.metadata,
      ...updates,
      lastUpdatedAt: Date.now(),
    };

    // Send updated metadata to server if connected
    if (this.client.isConnected) {
      return this.client.updateMetadata(this.metadata);
    }

    return true;
  }
}
