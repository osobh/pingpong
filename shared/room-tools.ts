/**
 * Room Tools System
 *
 * Enables rooms to provide pre-configured tools that agents can discover and use.
 * This reduces agent complexity and centralizes resource management.
 */

/**
 * Tool Types
 */
export enum ToolType {
  DATABASE = 'database',
  SEARCH = 'search',
  API = 'api',
  RAG = 'rag',
  FILE = 'file',
  CUSTOM = 'custom',
}

/**
 * Tool Permission Tiers
 */
export enum ToolPermissionTier {
  ALL = 'all',           // All agents
  PARTICIPANT = 'participant',  // Standard participants
  EXPERT = 'expert',      // Expert-tier agents
  MODERATOR = 'moderator',     // Moderators only
  ADMIN = 'admin',        // Admins only
}

/**
 * Tool Configuration Base
 */
export interface ToolConfigBase {
  timeout?: number;      // Timeout in seconds
  retries?: number;      // Number of retries on failure
  cache?: boolean;       // Cache results
  cacheTTL?: number;     // Cache TTL in seconds
}

/**
 * Database Tool Configuration
 */
export interface DatabaseToolConfig extends ToolConfigBase {
  connectionString: string;
  readOnly: boolean;
  maxResults?: number;
  allowedOperations?: ('SELECT' | 'INSERT' | 'UPDATE' | 'DELETE' | 'CREATE' | 'DROP')[];
  schema?: string;
}

/**
 * Search Tool Configuration
 */
export interface SearchToolConfig extends ToolConfigBase {
  provider: 'local' | 'github' | 'elasticsearch' | 'custom';
  repo?: string;
  branch?: string;
  fileTypes?: string[];
  excludePaths?: string[];
  maxResults?: number;
}

/**
 * API Tool Configuration
 */
export interface APIToolConfig extends ToolConfigBase {
  endpoint: string;
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  headers?: Record<string, string>;
  authToken?: string;
  rateLimit?: number;
}

/**
 * RAG Tool Configuration
 */
export interface RAGToolConfig extends ToolConfigBase {
  provider: 'pinecone' | 'qdrant' | 'weaviate' | 'chromadb' | 'local';
  index: string;
  apiKey?: string;
  topK?: number;
  scoreThreshold?: number;
  embeddingModel?: string;
}

/**
 * File Tool Configuration
 */
export interface FileToolConfig extends ToolConfigBase {
  basePath: string;
  allowedExtensions?: string[];
  maxFileSize?: number;  // In bytes
  readOnly: boolean;
}

/**
 * Custom Tool Configuration
 */
export interface CustomToolConfig extends ToolConfigBase {
  handler: string;  // Path to handler function
  parameters?: Record<string, unknown>;
}

/**
 * Tool Configuration Union Type
 */
export type ToolConfig =
  | DatabaseToolConfig
  | SearchToolConfig
  | APIToolConfig
  | RAGToolConfig
  | FileToolConfig
  | CustomToolConfig;

/**
 * Tool Permissions
 */
export interface ToolPermissions {
  tier?: ToolPermissionTier;
  allowedAgentIds?: string[];
  allowedRoles?: string[];
  deniedAgentIds?: string[];
  requiresApproval?: boolean;
}

/**
 * Tool Rate Limiting
 */
export interface ToolRateLimit {
  requestsPerHour?: number;
  requestsPerDay?: number;
  concurrentRequests?: number;
  burstLimit?: number;
}

/**
 * Tool Parameter Definition
 */
export interface ToolParameter {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'array' | 'object';
  description: string;
  required: boolean;
  default?: unknown;
  validation?: {
    pattern?: string;
    min?: number;
    max?: number;
    enum?: unknown[];
  };
}

/**
 * Tool Definition
 */
export interface RoomTool {
  name: string;
  type: ToolType;
  description: string;
  longDescription?: string;
  config: ToolConfig;
  permissions: ToolPermissions;
  rateLimit?: ToolRateLimit;
  parameters?: ToolParameter[];
  examples?: string[];
  tags?: string[];
  enabled?: boolean;
  version?: string;
  createdAt: number;
  updatedAt: number;
}

/**
 * Tool Invocation Request
 */
export interface ToolInvocationRequest {
  toolName: string;
  parameters: Record<string, unknown>;
  agentId: string;
  roomId: string;
  timestamp: number;
}

/**
 * Tool Invocation Result
 */
export interface ToolInvocationResult {
  toolName: string;
  success: boolean;
  result?: unknown;
  error?: string;
  executionTime: number;
  timestamp: number;
  cached?: boolean;
}

/**
 * Tool Usage Statistics
 */
export interface ToolUsageStats {
  toolName: string;
  invocations: number;
  successes: number;
  failures: number;
  avgExecutionTime: number;
  lastUsed: number;
  topUsers: { agentId: string; count: number }[];
}

/**
 * Room Tool Configuration
 */
export interface RoomToolsConfig {
  enabled: boolean;
  tools: RoomTool[];
  discovery: {
    showOnJoin: boolean;
    inSystemPrompt: boolean;
    inWelcomeMessage: boolean;
  };
  globalRateLimit?: ToolRateLimit;
  defaultPermissions?: ToolPermissions;
}

/**
 * Tool Registry Interface
 */
export interface IToolRegistry {
  registerTool(tool: RoomTool): void;
  unregisterTool(toolName: string): void;
  getTool(toolName: string): RoomTool | undefined;
  getAllTools(): RoomTool[];
  getEnabledTools(): RoomTool[];
  getToolsForAgent(agentId: string, agentRole: string): RoomTool[];
  hasPermission(toolName: string, agentId: string, agentRole: string): boolean;
  checkRateLimit(toolName: string, agentId: string): Promise<boolean>;
  recordUsage(toolName: string, agentId: string, success: boolean, executionTime: number): void;
  getUsageStats(toolName?: string): ToolUsageStats[];
}

/**
 * Tool Executor Interface
 */
export interface IToolExecutor {
  execute(request: ToolInvocationRequest): Promise<ToolInvocationResult>;
  validateRequest(request: ToolInvocationRequest): { valid: boolean; error?: string };
  validateParameters(tool: RoomTool, parameters: Record<string, unknown>): { valid: boolean; errors: string[] };
}
