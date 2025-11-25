/**
 * Runtime Spawner - Instantiate agents from DNA
 *
 * Handles:
 * - Converting DNA to AgentRuntime configuration
 * - Spawning trial mode agents (ephemeral)
 * - Tracking active DNA-spawned agents
 * - Lifecycle management
 */

import type { AgentDNA } from '../shared/agent-dna.js';
import type { AgentMetadata } from '../shared/agent-metadata.js';
import { AgentCapability } from '../shared/agent-metadata.js';

/**
 * Spawned Agent Instance
 */
export interface SpawnedAgent {
  agentId: string;
  dnaId: string;
  name: string;
  role: string;
  mode: 'trial' | 'permanent';
  spawnedAt: number;
  expiresAt?: number; // For trial mode
  metadata?: AgentMetadata;
}

/**
 * Runtime Spawner Configuration
 */
export interface RuntimeSpawnerConfig {
  /** Trial mode duration in milliseconds (default: 1 hour) */
  trialDuration: number;

  /** Maximum concurrent trial agents */
  maxTrialAgents: number;

  /** Auto-cleanup expired trial agents */
  autoCleanup: boolean;
}

/**
 * Runtime Spawner class
 */
export class RuntimeSpawner {
  private activeAgents: Map<string, SpawnedAgent> = new Map();
  private config: RuntimeSpawnerConfig;
  private cleanupInterval: NodeJS.Timeout | undefined;

  constructor(config: Partial<RuntimeSpawnerConfig> = {}) {
    this.config = {
      trialDuration: config.trialDuration ?? 60 * 60 * 1000, // 1 hour
      maxTrialAgents: config.maxTrialAgents ?? 10,
      autoCleanup: config.autoCleanup ?? true,
    };

    if (this.config.autoCleanup) {
      this.startAutoCleanup();
    }
  }

  /**
   * Spawn agent from DNA
   */
  spawnFromDNA(
    dna: AgentDNA,
    mode: 'trial' | 'permanent',
    agentId?: string
  ): { agent: SpawnedAgent; metadata: AgentMetadata } {
    // Check trial limits
    if (mode === 'trial') {
      const trialCount = Array.from(this.activeAgents.values()).filter(a => a.mode === 'trial').length;
      if (trialCount >= this.config.maxTrialAgents) {
        throw new Error(`Maximum trial agents (${this.config.maxTrialAgents}) reached`);
      }
    }

    // Generate agent ID
    const generatedId = agentId || this.generateAgentId(dna);

    // Convert DNA to metadata
    const metadata = this.dnaToMetadata(dna, generatedId);

    // Create spawned agent instance
    const spawnedAgent: SpawnedAgent = {
      agentId: generatedId,
      dnaId: dna.id,
      name: dna.metadata.name,
      role: dna.config.role,
      mode,
      spawnedAt: Date.now(),
      metadata,
    };

    if (mode === 'trial') {
      spawnedAgent.expiresAt = Date.now() + this.config.trialDuration;
    }

    this.activeAgents.set(generatedId, spawnedAgent);

    return { agent: spawnedAgent, metadata };
  }

  /**
   * Convert DNA to AgentMetadata
   */
  private dnaToMetadata(dna: AgentDNA, agentId: string): AgentMetadata {
    // Map DNA capabilities to AgentCapability enum
    const capabilities = dna.config.capabilities.map(cap => {
      // Try to match to enum, fallback to the string value
      switch (cap.toUpperCase()) {
        case 'PROPOSE':
          return AgentCapability.PROPOSE;
        case 'VOTE':
          return AgentCapability.VOTE;
        case 'MODERATE':
          return AgentCapability.MODERATE;
        case 'SUMMARIZE':
          return AgentCapability.SUMMARIZE;
        case 'ANALYZE':
          return AgentCapability.ANALYZE;
        case 'CODE_REVIEW':
          return AgentCapability.CODE_REVIEW;
        case 'DECISION_MAKING':
          return AgentCapability.DECISION_MAKING;
        default:
          return cap as AgentCapability; // Keep as-is if unknown
      }
    });

    const metadata: AgentMetadata = {
      agentId,
      agentName: dna.metadata.name,
      type: 'ai',
      role: dna.config.role,
      version: dna.metadata.version,
      capabilities,
      personality: dna.config.personality || {
        verbosity: 'concise',
        formality: 'professional',
      },
      llmConfig: {
        provider: 'ollama', // Default, host can override
        model: dna.config.llm.modelPreference || 'llama3',
        temperature: dna.config.llm.temperature || 0.7,
        maxTokens: dna.config.llm.maxTokens || 2000,
      },
      systemPromptSummary: dna.config.systemPrompt.substring(0, 200),
      custom: {
        dnaId: dna.id,
        creator: {
          name: dna.creator.name,
          organization: dna.creator.organization,
          verified: !!dna.signature,
        },
        tags: dna.metadata.tags,
        description: dna.metadata.description,
        constraints: {
          maxMessagesPerHour: dna.constraints.maxMessagesPerHour,
          requiresTools: dna.constraints.requiresTools,
          sandboxLevel: dna.constraints.sandboxLevel,
        },
      },
      createdAt: dna.createdAt,
      lastUpdatedAt: dna.updatedAt,
    };

    return metadata;
  }

  /**
   * Generate agent ID from DNA
   */
  private generateAgentId(dna: AgentDNA): string {
    // Use DNA ID + timestamp for uniqueness
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substring(2, 6);
    return `${dna.id}-${timestamp}-${random}`;
  }

  /**
   * Get spawned agent
   */
  getAgent(agentId: string): SpawnedAgent | undefined {
    return this.activeAgents.get(agentId);
  }

  /**
   * Check if agent is expired (for trial mode)
   */
  isExpired(agentId: string): boolean {
    const agent = this.activeAgents.get(agentId);
    if (!agent || !agent.expiresAt) {
      return false;
    }
    return Date.now() > agent.expiresAt;
  }

  /**
   * Remove agent
   */
  removeAgent(agentId: string): boolean {
    return this.activeAgents.delete(agentId);
  }

  /**
   * Get all active agents
   */
  getActiveAgents(): SpawnedAgent[] {
    return Array.from(this.activeAgents.values());
  }

  /**
   * Get trial agents
   */
  getTrialAgents(): SpawnedAgent[] {
    return Array.from(this.activeAgents.values()).filter(a => a.mode === 'trial');
  }

  /**
   * Get permanent agents
   */
  getPermanentAgents(): SpawnedAgent[] {
    return Array.from(this.activeAgents.values()).filter(a => a.mode === 'permanent');
  }

  /**
   * Cleanup expired trial agents
   */
  cleanupExpired(): number {
    let cleaned = 0;
    const now = Date.now();

    for (const [agentId, agent] of this.activeAgents.entries()) {
      if (agent.mode === 'trial' && agent.expiresAt && now > agent.expiresAt) {
        this.activeAgents.delete(agentId);
        cleaned++;
      }
    }

    return cleaned;
  }

  /**
   * Start auto-cleanup interval
   */
  private startAutoCleanup(): void {
    // Cleanup every 5 minutes
    this.cleanupInterval = setInterval(() => {
      const cleaned = this.cleanupExpired();
      if (cleaned > 0) {
        console.log(`[RuntimeSpawner] Cleaned up ${cleaned} expired trial agents`);
      }
    }, 5 * 60 * 1000);
  }

  /**
   * Stop auto-cleanup
   */
  stopAutoCleanup(): void {
    if (this.cleanupInterval !== undefined) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = undefined;
    }
  }

  /**
   * Get statistics
   */
  getStats(): {
    total: number;
    trial: number;
    permanent: number;
    expired: number;
  } {
    const agents = Array.from(this.activeAgents.values());
    const now = Date.now();

    return {
      total: agents.length,
      trial: agents.filter(a => a.mode === 'trial').length,
      permanent: agents.filter(a => a.mode === 'permanent').length,
      expired: agents.filter(a => a.expiresAt && now > a.expiresAt).length,
    };
  }

  /**
   * Shutdown spawner
   */
  shutdown(): void {
    this.stopAutoCleanup();
    this.activeAgents.clear();
  }
}
