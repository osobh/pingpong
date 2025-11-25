/**
 * Agent Metadata - Standardized format for agent capabilities and configuration
 * Enables agents to discover and understand each other's capabilities
 */

import { z } from 'zod';

/**
 * Agent capability types
 */
export enum AgentCapability {
  PROPOSE = 'propose',
  VOTE = 'vote',
  MODERATE = 'moderate',
  SUMMARIZE = 'summarize',
  ANALYZE = 'analyze',
  CODE_REVIEW = 'code_review',
  DECISION_MAKING = 'decision_making',
}

/**
 * LLM configuration for an agent
 */
export interface LLMConfig {
  provider: 'ollama' | 'openai' | 'anthropic' | 'custom';
  model: string;
  host?: string;
  temperature?: number; // 0.0 to 2.0
  maxTokens?: number;
  topP?: number;
  topK?: number;
  repeatPenalty?: number;
}

/**
 * Agent personality traits
 */
export interface PersonalityTraits {
  verbosity?: 'concise' | 'moderate' | 'verbose'; // Response length preference
  formality?: 'casual' | 'professional' | 'academic'; // Communication style
  assertiveness?: number; // 0.0 to 1.0 - how strongly they express opinions
  creativity?: number; // 0.0 to 1.0 - preference for novel vs conventional ideas
  criticalThinking?: number; // 0.0 to 1.0 - tendency to question vs accept
}

/**
 * Comprehensive agent metadata
 */
export interface AgentMetadata {
  // Identity
  agentId: string;
  agentName: string;
  type: 'human' | 'ai' | 'hybrid';
  role: string;
  version?: string; // Agent software version

  // Capabilities
  capabilities: AgentCapability[];

  // LLM Configuration (for AI agents)
  llmConfig?: LLMConfig;

  // Personality
  personality?: PersonalityTraits;

  // System Prompt (truncated for sharing)
  systemPromptSummary?: string; // First 200 chars of system prompt

  // Custom metadata (extensible)
  custom?: Record<string, unknown>;

  // Timestamps
  createdAt: number;
  lastUpdatedAt: number;
}

/**
 * Zod schema for LLM configuration
 */
export const LLMConfigSchema = z.object({
  provider: z.enum(['ollama', 'openai', 'anthropic', 'custom']),
  model: z.string(),
  host: z.string().optional(),
  temperature: z.number().min(0).max(2).optional(),
  maxTokens: z.number().positive().optional(),
  topP: z.number().min(0).max(1).optional(),
  topK: z.number().positive().optional(),
  repeatPenalty: z.number().optional(),
});

/**
 * Zod schema for personality traits
 */
export const PersonalityTraitsSchema = z.object({
  verbosity: z.enum(['concise', 'moderate', 'verbose']).optional(),
  formality: z.enum(['casual', 'professional', 'academic']).optional(),
  assertiveness: z.number().min(0).max(1).optional(),
  creativity: z.number().min(0).max(1).optional(),
  criticalThinking: z.number().min(0).max(1).optional(),
});

/**
 * Zod schema for agent metadata validation
 */
export const AgentMetadataSchema = z.object({
  agentId: z.string(),
  agentName: z.string(),
  type: z.enum(['human', 'ai', 'hybrid']),
  role: z.string(),
  version: z.string().optional(),
  capabilities: z.array(z.nativeEnum(AgentCapability)),
  llmConfig: LLMConfigSchema.optional(),
  personality: PersonalityTraitsSchema.optional(),
  systemPromptSummary: z.string().max(200).optional(),
  custom: z.record(z.unknown()).optional(),
  createdAt: z.number(),
  lastUpdatedAt: z.number(),
});

/**
 * Type for validated agent metadata
 */
export type ValidatedAgentMetadata = z.infer<typeof AgentMetadataSchema>;
