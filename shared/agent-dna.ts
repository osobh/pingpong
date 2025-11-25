/**
 * Agent DNA - Portable agent configuration format
 *
 * AgentDNA is the complete specification for an agent, including:
 * - Identity and creator information
 * - Configuration (prompts, LLM settings, tools)
 * - Security constraints
 * - Marketplace metadata (ratings, version, license)
 * - Cryptographic signatures for verification
 *
 * DNA files are:
 * - Portable: Share agents across systems
 * - Verifiable: Cryptographic signatures prevent tampering
 * - Versionable: Semantic versioning for evolution
 * - Marketplace-ready: Ratings, downloads, tags for discovery
 */

import type { AgentCapability, PersonalityTraits } from './agent-metadata.js';

/**
 * DNA Format Version
 * Follows semver for DNA schema evolution
 */
export const DNA_VERSION = '1.0.0';

/**
 * Complete Agent DNA specification
 */
export interface AgentDNA {
  /** DNA format version (semver) */
  dna_version: string;

  /** Unique agent identifier */
  id: string;

  /** Creator information */
  creator: CreatorInfo;

  /** Cryptographic signature (optional for unsigned agents) */
  signature?: DNASignature;

  /** Marketplace and discovery metadata */
  metadata: DNAMetadata;

  /** Agent configuration */
  config: AgentConfig;

  /** Security and resource constraints */
  constraints: AgentConstraints;

  /** Timestamps */
  createdAt: number;
  updatedAt: number;

  /** Version changelog */
  changelog?: ChangelogEntry[];
}

/**
 * Creator attribution and identity
 */
export interface CreatorInfo {
  /** Creator name or identifier */
  name: string;

  /** Contact email (optional) */
  email?: string;

  /** Organization (optional) */
  organization?: string;

  /** Public key for signature verification (PEM format) */
  publicKey?: string;

  /** Creator's website or profile URL */
  url?: string;
}

/**
 * Cryptographic signature for DNA verification
 */
export interface DNASignature {
  /** Signature algorithm */
  algorithm: 'ed25519' | 'rsa-sha256';

  /** Public key (PEM format) */
  publicKey: string;

  /** Signature bytes (base64 encoded) */
  signature: string;

  /** Signature timestamp (milliseconds) */
  timestamp: number;

  /** Hash of signed content (SHA-256, hex) */
  contentHash: string;
}

/**
 * Metadata for marketplace and discovery
 */
export interface DNAMetadata {
  /** Agent display name */
  name: string;

  /** Short description (1-2 sentences) */
  description: string;

  /** Long description (markdown supported) */
  longDescription?: string;

  /** Agent version (semver) */
  version: string;

  /** Tags for discovery and categorization */
  tags: string[];

  /** License identifier (SPDX format) */
  license: string;

  /** Visibility level */
  visibility: 'public' | 'private' | 'unlisted';

  /** Password hash for private agents (bcrypt) */
  passwordHash?: string;

  /** Marketplace statistics */
  stats?: {
    /** Number of downloads/imports */
    downloads: number;

    /** Average rating (0-5) */
    rating?: number;

    /** Number of ratings */
    ratingCount?: number;

    /** Total usage count (sessions) */
    usageCount?: number;

    /** Last used timestamp */
    lastUsedAt?: number;
  };

  /** Example use cases */
  examples?: string[];

  /** Related agent IDs */
  relatedAgents?: string[];

  /** Thumbnail/avatar URL */
  avatarUrl?: string;
}

/**
 * Agent configuration
 */
export interface AgentConfig {
  /** Complete system prompt */
  systemPrompt: string;

  /** Agent role */
  role: string;

  /** Agent capabilities */
  capabilities: AgentCapability[];

  /** LLM preferences (host decides actual implementation) */
  llm: LLMPreferences;

  /** Personality traits */
  personality?: PersonalityTraits;

  /** Tool configurations */
  tools?: ToolConfig[];

  /** MCP server configurations (future) */
  mcpServers?: MCPServerConfig[];

  /** Custom configuration fields */
  custom?: Record<string, unknown>;
}

/**
 * LLM preferences (host provides actual resources)
 */
export interface LLMPreferences {
  /** Preferred model name (e.g., "gpt-4", "llama3:70b") */
  modelPreference?: string;

  /** Model capability class (host maps to available models) */
  modelClass?: 'frontier' | 'capable' | 'basic';

  /** Required minimum context window (tokens) */
  minContextWindow?: number;

  /** Temperature (0.0 - 2.0) */
  temperature?: number;

  /** Max tokens per response */
  maxTokens?: number;

  /** Top P sampling */
  topP?: number;

  /** Top K sampling */
  topK?: number;

  /** Repeat penalty */
  repeatPenalty?: number;

  /** Requires streaming responses */
  requiresStreaming?: boolean;
}

/**
 * Tool configuration
 */
export interface ToolConfig {
  /** Tool name/identifier */
  name: string;

  /** Tool type */
  type: 'builtin' | 'mcp' | 'custom';

  /** Tool-specific configuration */
  config?: Record<string, unknown>;

  /** Whether tool is required for agent operation */
  required: boolean;
}

/**
 * MCP Server configuration (future)
 */
export interface MCPServerConfig {
  /** Server name */
  name: string;

  /** Command to start server */
  command: string;

  /** Command arguments */
  args: string[];

  /** Environment variables */
  env?: Record<string, string>;

  /** Server capabilities required */
  capabilities?: string[];
}

/**
 * Security and resource constraints
 */
export interface AgentConstraints {
  /** Maximum messages per hour (rate limiting) */
  maxMessagesPerHour?: number;

  /** Maximum tokens per message */
  maxTokensPerMessage?: number;

  /** Requires tools to function */
  requiresTools: boolean;

  /** Sandbox level */
  sandboxLevel: 'strict' | 'standard' | 'relaxed';

  /** Resource requirements */
  resourceRequirements?: {
    /** Minimum RAM (MB) */
    minMemoryMB?: number;

    /** Maximum concurrent requests */
    maxConcurrentRequests?: number;
  };

  /** Allowed operations */
  permissions?: {
    /** Can create proposals */
    canPropose?: boolean;

    /** Can vote on proposals */
    canVote?: boolean;

    /** Can moderate conversation */
    canModerate?: boolean;

    /** Can access file system */
    canAccessFiles?: boolean;

    /** Can make network requests */
    canAccessNetwork?: boolean;
  };
}

/**
 * Changelog entry for version tracking
 */
export interface ChangelogEntry {
  /** Version number (semver) */
  version: string;

  /** Release date (ISO 8601) */
  date: string;

  /** Change type */
  type: 'major' | 'minor' | 'patch';

  /** List of changes */
  changes: string[];

  /** Breaking changes (for major versions) */
  breaking?: string[];
}

/**
 * DNA export options
 */
export interface DNAExportOptions {
  /** Include signature */
  includeSignature?: boolean;

  /** Encrypt with password */
  encrypt?: boolean;

  /** Password for encryption (required if encrypt=true) */
  password?: string;

  /** Pretty-print JSON */
  pretty?: boolean;

  /** Include stats (for sharing analytics) */
  includeStats?: boolean;
}

/**
 * DNA import options
 */
export interface DNAImportOptions {
  /** Verify signature (if present) */
  verifySignature?: boolean;

  /** Password for decryption */
  password?: string;

  /** Overwrite existing agent with same ID */
  overwrite?: boolean;

  /** Import mode */
  mode?: 'trial' | 'permanent';
}

/**
 * DNA validation result
 */
export interface DNAValidationResult {
  /** Whether DNA is valid */
  valid: boolean;

  /** Validation errors (if any) */
  errors: string[];

  /** Validation warnings */
  warnings: string[];

  /** Signature verification result */
  signatureValid?: boolean;

  /** Estimated resource requirements */
  estimatedResources?: {
    memory: string;
    tokens: number;
    cost: string;
  };
}
