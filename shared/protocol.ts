/**
 * WebSocket Protocol for PingPong
 * Defines message schemas for client-server communication
 */

import { z } from 'zod';
import { AgentMetadataSchema } from './agent-metadata.js';

/**
 * AgentDNA Schema (simplified for protocol - full validation happens server-side)
 */
export const AgentDNASchema = z.object({
  dna_version: z.string(),
  id: z.string(),
  creator: z.object({
    name: z.string(),
    email: z.string().optional(),
    organization: z.string().optional(),
    publicKey: z.string().optional(),
    url: z.string().optional(),
  }),
  signature: z.object({
    algorithm: z.enum(['ed25519', 'rsa-sha256']),
    publicKey: z.string(),
    signature: z.string(),
    timestamp: z.number(),
    contentHash: z.string(),
  }).optional(),
  metadata: z.object({
    name: z.string(),
    description: z.string(),
    longDescription: z.string().optional(),
    version: z.string(),
    tags: z.array(z.string()),
    license: z.string(),
    visibility: z.enum(['public', 'private', 'unlisted']),
    passwordHash: z.string().optional(),
    stats: z.object({
      downloads: z.number(),
      rating: z.number().optional(),
      ratingCount: z.number().optional(),
      usageCount: z.number().optional(),
      lastUsedAt: z.number().optional(),
    }).optional(),
    examples: z.array(z.string()).optional(),
    relatedAgents: z.array(z.string()).optional(),
    avatarUrl: z.string().optional(),
  }),
  config: z.object({
    systemPrompt: z.string(),
    role: z.string(),
    capabilities: z.array(z.string()),
    llm: z.object({
      modelPreference: z.string().optional(),
      modelClass: z.enum(['frontier', 'capable', 'basic']).optional(),
      minContextWindow: z.number().optional(),
      temperature: z.number().optional(),
      maxTokens: z.number().optional(),
      topP: z.number().optional(),
      topK: z.number().optional(),
      repeatPenalty: z.number().optional(),
      requiresStreaming: z.boolean().optional(),
    }),
    personality: z.any().optional(),
    tools: z.array(z.any()).optional(),
    mcpServers: z.array(z.any()).optional(),
    custom: z.record(z.unknown()).optional(),
  }),
  constraints: z.object({
    maxMessagesPerHour: z.number().optional(),
    maxTokensPerMessage: z.number().optional(),
    requiresTools: z.boolean(),
    sandboxLevel: z.enum(['strict', 'standard', 'relaxed']),
    resourceRequirements: z.object({
      minMemoryMB: z.number().optional(),
      maxConcurrentRequests: z.number().optional(),
    }).optional(),
    permissions: z.object({
      canPropose: z.boolean().optional(),
      canVote: z.boolean().optional(),
      canModerate: z.boolean().optional(),
      canAccessFiles: z.boolean().optional(),
      canAccessNetwork: z.boolean().optional(),
    }).optional(),
  }),
  createdAt: z.number(),
  updatedAt: z.number(),
  changelog: z.array(z.object({
    version: z.string(),
    date: z.string(),
    type: z.enum(['major', 'minor', 'patch']),
    changes: z.array(z.string()),
    breaking: z.array(z.string()).optional(),
  })).optional(),
});

/**
 * Client → Server Commands
 */

export const JoinCommandSchema = z.object({
  type: z.literal('JOIN'),
  agentId: z.string(),
  agentName: z.string(),
  role: z.string(),
  roomId: z.string().optional(), // Optional room ID (defaults to "default")
  metadata: AgentMetadataSchema.optional(), // Optional comprehensive agent metadata
  timestamp: z.number(),
});

export const MessageCommandSchema = z.object({
  type: z.literal('MESSAGE'),
  agentId: z.string(),
  content: z.string(),
  timestamp: z.number(),
});

export const LeaveCommandSchema = z.object({
  type: z.literal('LEAVE'),
  agentId: z.string(),
  timestamp: z.number(),
});

export const CreateRoomCommandSchema = z.object({
  type: z.literal('CREATE_ROOM'),
  roomId: z.string().optional(), // Optional room ID (auto-generated if not provided)
  topic: z.string(),
  mode: z.enum(['quick', 'deep']).optional(), // Optional conversation mode (defaults to 'deep')
  timestamp: z.number(),
});

export const ListRoomsCommandSchema = z.object({
  type: z.literal('LIST_ROOMS'),
  timestamp: z.number(),
});

export const LeaveRoomCommandSchema = z.object({
  type: z.literal('LEAVE_ROOM'),
  agentId: z.string(),
  roomId: z.string(),
  timestamp: z.number(),
});

export const CreateProposalCommandSchema = z.object({
  type: z.literal('CREATE_PROPOSAL'),
  agentId: z.string(),
  title: z.string(),
  description: z.string(),
  threshold: z.number().min(0).max(1).optional(), // Approval threshold (0.0 to 1.0), defaults to 0.5
  timestamp: z.number(),
});

export const VoteCommandSchema = z.object({
  type: z.literal('VOTE'),
  agentId: z.string(),
  proposalId: z.string(),
  vote: z.enum(['yes', 'no', 'abstain']), // Must match VoteType enum
  rationale: z.string().optional(), // Optional explanation for the vote
  timestamp: z.number(),
});

export const UpdateMetadataCommandSchema = z.object({
  type: z.literal('UPDATE_METADATA'),
  agentId: z.string(),
  metadata: AgentMetadataSchema,
  timestamp: z.number(),
});

export const JoinWithDNACommandSchema = z.object({
  type: z.literal('JOIN_WITH_DNA'),
  dna: AgentDNASchema,
  roomId: z.string().optional(), // Optional room ID (defaults to "default")
  mode: z.enum(['trial', 'permanent']).optional(), // Join mode (defaults to 'trial')
  password: z.string().optional(), // Password for encrypted DNA or admin authentication
  timestamp: z.number(),
});

export const DNAApproveCommandSchema = z.object({
  type: z.literal('DNA_APPROVE'),
  requestId: z.string(),
  adminId: z.string(),
  mode: z.enum(['trial', 'permanent']), // Whether to spawn as trial or import permanently
  timestamp: z.number(),
});

export const DNARejectCommandSchema = z.object({
  type: z.literal('DNA_REJECT'),
  requestId: z.string(),
  adminId: z.string(),
  reason: z.string(),
  timestamp: z.number(),
});

export const InvokeToolCommandSchema = z.object({
  type: z.literal('INVOKE_TOOL'),
  agentId: z.string(),
  toolName: z.string(),
  parameters: z.record(z.unknown()), // Tool parameters as key-value pairs
  timestamp: z.number(),
});

export const GetToolsCommandSchema = z.object({
  type: z.literal('GET_TOOLS'),
  agentId: z.string(),
  timestamp: z.number(),
});

export const RecordMemoryCommandSchema = z.object({
  type: z.literal('RECORD_MEMORY'),
  agentId: z.string(),
  memoryType: z.enum(['decision', 'insight', 'question', 'action_item']),
  content: z.string(),
  context: z.string().optional(),
  summary: z.string().optional(),
  priority: z.enum(['low', 'medium', 'high', 'critical']).optional(),
  tags: z.array(z.string()).optional(),
  relatedMessageIds: z.array(z.string()).optional(),
  relatedAgentIds: z.array(z.string()).optional(),
  timestamp: z.number(),
});

export const QueryMemoryCommandSchema = z.object({
  type: z.literal('QUERY_MEMORY'),
  agentId: z.string(),
  memoryType: z.enum(['decision', 'insight', 'question', 'action_item']).optional(),
  status: z.enum(['active', 'archived', 'resolved']).optional(),
  priority: z.enum(['low', 'medium', 'high', 'critical']).optional(),
  tags: z.array(z.string()).optional(),
  search: z.string().optional(),
  limit: z.number().optional(),
  timestamp: z.number(),
});

export const UpdateMemoryCommandSchema = z.object({
  type: z.literal('UPDATE_MEMORY'),
  agentId: z.string(),
  memoryId: z.string(),
  content: z.string().optional(),
  context: z.string().optional(),
  summary: z.string().optional(),
  priority: z.enum(['low', 'medium', 'high', 'critical']).optional(),
  tags: z.array(z.string()).optional(),
  timestamp: z.number(),
});

export const DeleteMemoryCommandSchema = z.object({
  type: z.literal('DELETE_MEMORY'),
  agentId: z.string(),
  memoryId: z.string(),
  timestamp: z.number(),
});

export const ArchiveMemoryCommandSchema = z.object({
  type: z.literal('ARCHIVE_MEMORY'),
  agentId: z.string(),
  memoryId: z.string(),
  timestamp: z.number(),
});

export const ResolveMemoryCommandSchema = z.object({
  type: z.literal('RESOLVE_MEMORY'),
  agentId: z.string(),
  memoryId: z.string(),
  timestamp: z.number(),
});

export const QueryMemoryStatsCommandSchema = z.object({
  type: z.literal('QUERY_MEMORY_STATS'),
  agentId: z.string(),
  timestamp: z.number(),
});

export const BulkCreateMemoriesCommandSchema = z.object({
  type: z.literal('BULK_CREATE_MEMORIES'),
  agentId: z.string(),
  memories: z.array(z.object({
    memoryType: z.enum(['decision', 'insight', 'question', 'action_item']),
    content: z.string(),
    context: z.string().optional(),
    summary: z.string().optional(),
    priority: z.enum(['low', 'medium', 'high', 'critical']).optional(),
    tags: z.array(z.string()).optional(),
    relatedMessageIds: z.array(z.string()).optional(),
    relatedAgentIds: z.array(z.string()).optional(),
  })),
  timestamp: z.number(),
});

export const BulkUpdateMemoriesCommandSchema = z.object({
  type: z.literal('BULK_UPDATE_MEMORIES'),
  agentId: z.string(),
  updates: z.array(z.object({
    memoryId: z.string(),
    content: z.string().optional(),
    context: z.string().optional(),
    summary: z.string().optional(),
    priority: z.enum(['low', 'medium', 'high', 'critical']).optional(),
    tags: z.array(z.string()).optional(),
  })),
  timestamp: z.number(),
});

export const SemanticSearchMemoryCommandSchema = z.object({
  type: z.literal('SEMANTIC_SEARCH_MEMORY'),
  agentId: z.string(),
  query: z.string(),
  limit: z.number().optional(),
  minSimilarity: z.number().min(0).max(1).optional(),
  types: z.array(z.enum(['decision', 'insight', 'question', 'action_item'])).optional(),
  statuses: z.array(z.enum(['active', 'archived', 'resolved'])).optional(),
  priorities: z.array(z.enum(['low', 'medium', 'high', 'critical'])).optional(),
  timestamp: z.number(),
});

export const ClientCommandSchema = z.discriminatedUnion('type', [
  JoinCommandSchema,
  MessageCommandSchema,
  LeaveCommandSchema,
  CreateRoomCommandSchema,
  ListRoomsCommandSchema,
  LeaveRoomCommandSchema,
  CreateProposalCommandSchema,
  VoteCommandSchema,
  UpdateMetadataCommandSchema,
  JoinWithDNACommandSchema,
  DNAApproveCommandSchema,
  DNARejectCommandSchema,
  InvokeToolCommandSchema,
  GetToolsCommandSchema,
  RecordMemoryCommandSchema,
  QueryMemoryCommandSchema,
  UpdateMemoryCommandSchema,
  DeleteMemoryCommandSchema,
  ArchiveMemoryCommandSchema,
  ResolveMemoryCommandSchema,
  QueryMemoryStatsCommandSchema,
  BulkCreateMemoriesCommandSchema,
  BulkUpdateMemoriesCommandSchema,
  SemanticSearchMemoryCommandSchema,
]);

/**
 * Server → Client Events
 */

export const WelcomeEventSchema = z.object({
  type: z.literal('WELCOME'),
  roomId: z.string(),
  topic: z.string(),
  mode: z.enum(['quick', 'deep']), // Conversation mode
  agentCount: z.number().min(0),
  tools: z.array(z.object({
    name: z.string(),
    type: z.string(),
    description: z.string(),
    parameters: z.array(z.object({
      name: z.string(),
      type: z.string(),
      description: z.string(),
      required: z.boolean(),
    })).optional(),
  })).optional(), // Available room tools
  memories: z.array(z.object({
    id: z.string(),
    type: z.string(),
    content: z.string(),
    summary: z.string().nullable().optional(),
    priority: z.string(),
    createdAt: z.number(),
  })).optional(), // Room memories for context
  timestamp: z.number(),
});

export const AgentJoinedEventSchema = z.object({
  type: z.literal('AGENT_JOINED'),
  agentId: z.string(),
  agentName: z.string(),
  role: z.string(),
  metadata: AgentMetadataSchema.optional(), // Optional comprehensive agent metadata
  timestamp: z.number(),
});

export const MessageEventSchema = z.object({
  type: z.literal('MESSAGE'),
  agentId: z.string(),
  agentName: z.string(),
  role: z.string(),
  content: z.string(),
  timestamp: z.number(),
  serverId: z.string().optional(), // ID of originating server (for cross-project communication)
  messageId: z.string().optional(), // Unique message ID for deduplication
});

export const AgentLeftEventSchema = z.object({
  type: z.literal('AGENT_LEFT'),
  agentId: z.string(),
  agentName: z.string(),
  timestamp: z.number(),
});

export const ErrorEventSchema = z.object({
  type: z.literal('ERROR'),
  message: z.string(),
  timestamp: z.number(),
});

export const RoomCreatedEventSchema = z.object({
  type: z.literal('ROOM_CREATED'),
  roomId: z.string(),
  topic: z.string(),
  mode: z.enum(['quick', 'deep']), // Conversation mode
  timestamp: z.number(),
});

export const RoomListEventSchema = z.object({
  type: z.literal('ROOM_LIST'),
  rooms: z.array(
    z.object({
      roomId: z.string(),
      topic: z.string(),
      agentCount: z.number().min(0),
    }),
  ),
  timestamp: z.number(),
});

export const ProposalCreatedEventSchema = z.object({
  type: z.literal('PROPOSAL_CREATED'),
  proposalId: z.string(),
  title: z.string(),
  description: z.string(),
  proposerId: z.string(),
  proposerName: z.string(),
  threshold: z.number().min(0).max(1),
  timestamp: z.number(),
});

export const VoteCastEventSchema = z.object({
  type: z.literal('VOTE_CAST'),
  proposalId: z.string(),
  agentId: z.string(),
  agentName: z.string(),
  vote: z.enum(['yes', 'no', 'abstain']),
  rationale: z.string().optional(),
  timestamp: z.number(),
});

export const ProposalResolvedEventSchema = z.object({
  type: z.literal('PROPOSAL_RESOLVED'),
  proposalId: z.string(),
  title: z.string(),
  status: z.enum(['approved', 'rejected']), // Must match ProposalStatus enum (excluding pending)
  yesVotes: z.number().min(0),
  noVotes: z.number().min(0),
  abstainVotes: z.number().min(0),
  totalVotes: z.number().min(0),
  timestamp: z.number(),
});

export const AgentMetadataUpdatedEventSchema = z.object({
  type: z.literal('AGENT_METADATA_UPDATED'),
  agentId: z.string(),
  agentName: z.string(),
  metadata: AgentMetadataSchema,
  timestamp: z.number(),
});

export const DNAReviewRequestEventSchema = z.object({
  type: z.literal('DNA_REVIEW_REQUEST'),
  requestId: z.string(),
  dna: AgentDNASchema,
  mode: z.enum(['trial', 'permanent']),
  requestedBy: z.string().optional(), // IP or identifier of requester
  timestamp: z.number(),
});

export const DNAApprovedEventSchema = z.object({
  type: z.literal('DNA_APPROVED'),
  requestId: z.string(),
  agentId: z.string(),
  agentName: z.string(),
  mode: z.enum(['trial', 'permanent']),
  approvedBy: z.string(),
  timestamp: z.number(),
});

export const DNARejectedEventSchema = z.object({
  type: z.literal('DNA_REJECTED'),
  requestId: z.string(),
  dnaId: z.string(),
  dnaName: z.string(),
  reason: z.string(),
  rejectedBy: z.string(),
  timestamp: z.number(),
});

export const AgentJoinedDNAEventSchema = z.object({
  type: z.literal('AGENT_JOINED_DNA'),
  agentId: z.string(),
  agentName: z.string(),
  role: z.string(),
  dnaVersion: z.string(),
  mode: z.enum(['trial', 'permanent']),
  creator: z.string(), // Creator name from DNA
  metadata: AgentMetadataSchema.optional(),
  timestamp: z.number(),
});

export const ToolResultEventSchema = z.object({
  type: z.literal('TOOL_RESULT'),
  toolName: z.string(),
  agentId: z.string(),
  success: z.boolean(),
  result: z.unknown().optional(), // Tool execution result
  error: z.string().optional(), // Error message if failed
  executionTime: z.number(), // Milliseconds
  cached: z.boolean().optional(), // Whether result was cached
  timestamp: z.number(),
});

export const ToolsAvailableEventSchema = z.object({
  type: z.literal('TOOLS_AVAILABLE'),
  tools: z.array(z.object({
    name: z.string(),
    type: z.string(),
    description: z.string(),
    longDescription: z.string().optional(),
    parameters: z.array(z.object({
      name: z.string(),
      type: z.string(),
      description: z.string(),
      required: z.boolean(),
      default: z.unknown().optional(),
    })).optional(),
    examples: z.array(z.string()).optional(),
    tags: z.array(z.string()).optional(),
  })),
  timestamp: z.number(),
});

export const MemoryRecordedEventSchema = z.object({
  type: z.literal('MEMORY_RECORDED'),
  memoryId: z.string(),
  memoryType: z.enum(['decision', 'insight', 'question', 'action_item']),
  content: z.string(),
  summary: z.string().nullable().optional(),
  priority: z.enum(['low', 'medium', 'high', 'critical']),
  tags: z.array(z.string()),
  createdBy: z.string(),
  createdByName: z.string().optional(),
  timestamp: z.number(),
});

export const MemoryUpdatedEventSchema = z.object({
  type: z.literal('MEMORY_UPDATED'),
  memoryId: z.string(),
  updatedBy: z.string(),
  updatedByName: z.string().optional(),
  changes: z.record(z.unknown()),
  timestamp: z.number(),
});

export const MemoryDeletedEventSchema = z.object({
  type: z.literal('MEMORY_DELETED'),
  memoryId: z.string(),
  deletedBy: z.string(),
  deletedByName: z.string().optional(),
  timestamp: z.number(),
});

export const MemoryQueryResultEventSchema = z.object({
  type: z.literal('MEMORY_QUERY_RESULT'),
  memories: z.array(z.object({
    id: z.string(),
    memoryType: z.enum(['decision', 'insight', 'question', 'action_item']),
    content: z.string(),
    context: z.string().optional(),
    summary: z.string().optional(),
    status: z.enum(['active', 'archived', 'resolved']),
    priority: z.enum(['low', 'medium', 'high', 'critical']),
    tags: z.array(z.string()),
    createdBy: z.string(),
    createdAt: z.number(),
    updatedAt: z.number(),
  })),
  total: z.number(),
  timestamp: z.number(),
});

export const MemoriesInjectedEventSchema = z.object({
  type: z.literal('MEMORIES_INJECTED'),
  count: z.number(),
  strategy: z.enum(['none', 'summary', 'recent', 'relevant', 'critical', 'full']),
  summary: z.string().optional(), // Human-readable summary
  timestamp: z.number(),
});

export const MemoryStatsEventSchema = z.object({
  type: z.literal('MEMORY_STATS'),
  roomId: z.string(),
  total: z.number(),
  byType: z.object({
    decision: z.number(),
    insight: z.number(),
    question: z.number(),
    action_item: z.number(),
  }),
  byStatus: z.object({
    active: z.number(),
    archived: z.number(),
    resolved: z.number(),
  }),
  byPriority: z.object({
    low: z.number(),
    medium: z.number(),
    high: z.number(),
    critical: z.number(),
  }),
  bySource: z.object({
    agent: z.number(),
    system: z.number(),
    extracted: z.number(),
  }),
  timestamp: z.number(),
});

export const BulkMemoriesResultEventSchema = z.object({
  type: z.literal('BULK_MEMORIES_RESULT'),
  operation: z.enum(['create', 'update']),
  successful: z.number(),
  failed: z.number(),
  results: z.array(z.object({
    index: z.number(),
    success: z.boolean(),
    memoryId: z.string().optional(), // Only present for successful operations
    error: z.string().optional(), // Only present for failed operations
  })),
  timestamp: z.number(),
});

export const SemanticSearchResultEventSchema = z.object({
  type: z.literal('SEMANTIC_SEARCH_RESULT'),
  query: z.string(),
  results: z.array(z.object({
    memory: z.object({
      id: z.string(),
      roomId: z.string(),
      type: z.enum(['decision', 'insight', 'question', 'action_item']),
      content: z.string(),
      context: z.string().nullable().optional(),
      summary: z.string().nullable().optional(),
      priority: z.enum(['low', 'medium', 'high', 'critical']),
      status: z.enum(['active', 'archived', 'resolved']),
      tags: z.array(z.string()),
      createdBy: z.string(),
      createdAt: z.number(),
    }),
    similarity: z.number().min(0).max(1),
    rank: z.number(),
  })),
  totalResults: z.number(),
  timestamp: z.number(),
});

export const ServerEventSchema = z.discriminatedUnion('type', [
  WelcomeEventSchema,
  AgentJoinedEventSchema,
  MessageEventSchema,
  AgentLeftEventSchema,
  ErrorEventSchema,
  RoomCreatedEventSchema,
  RoomListEventSchema,
  ProposalCreatedEventSchema,
  VoteCastEventSchema,
  ProposalResolvedEventSchema,
  AgentMetadataUpdatedEventSchema,
  DNAReviewRequestEventSchema,
  DNAApprovedEventSchema,
  DNARejectedEventSchema,
  AgentJoinedDNAEventSchema,
  ToolResultEventSchema,
  ToolsAvailableEventSchema,
  MemoryRecordedEventSchema,
  MemoryUpdatedEventSchema,
  MemoryDeletedEventSchema,
  MemoryQueryResultEventSchema,
  MemoriesInjectedEventSchema,
  MemoryStatsEventSchema,
  BulkMemoriesResultEventSchema,
  SemanticSearchResultEventSchema,
]);

/**
 * Type exports
 */

export type AgentDNA = z.infer<typeof AgentDNASchema>;

export type JoinCommand = z.infer<typeof JoinCommandSchema>;
export type MessageCommand = z.infer<typeof MessageCommandSchema>;
export type LeaveCommand = z.infer<typeof LeaveCommandSchema>;
export type CreateRoomCommand = z.infer<typeof CreateRoomCommandSchema>;
export type ListRoomsCommand = z.infer<typeof ListRoomsCommandSchema>;
export type LeaveRoomCommand = z.infer<typeof LeaveRoomCommandSchema>;
export type CreateProposalCommand = z.infer<typeof CreateProposalCommandSchema>;
export type VoteCommand = z.infer<typeof VoteCommandSchema>;
export type UpdateMetadataCommand = z.infer<typeof UpdateMetadataCommandSchema>;
export type JoinWithDNACommand = z.infer<typeof JoinWithDNACommandSchema>;
export type DNAApproveCommand = z.infer<typeof DNAApproveCommandSchema>;
export type DNARejectCommand = z.infer<typeof DNARejectCommandSchema>;
export type InvokeToolCommand = z.infer<typeof InvokeToolCommandSchema>;
export type GetToolsCommand = z.infer<typeof GetToolsCommandSchema>;
export type RecordMemoryCommand = z.infer<typeof RecordMemoryCommandSchema>;
export type QueryMemoryCommand = z.infer<typeof QueryMemoryCommandSchema>;
export type UpdateMemoryCommand = z.infer<typeof UpdateMemoryCommandSchema>;
export type DeleteMemoryCommand = z.infer<typeof DeleteMemoryCommandSchema>;
export type ArchiveMemoryCommand = z.infer<typeof ArchiveMemoryCommandSchema>;
export type ResolveMemoryCommand = z.infer<typeof ResolveMemoryCommandSchema>;
export type QueryMemoryStatsCommand = z.infer<typeof QueryMemoryStatsCommandSchema>;
export type BulkCreateMemoriesCommand = z.infer<typeof BulkCreateMemoriesCommandSchema>;
export type BulkUpdateMemoriesCommand = z.infer<typeof BulkUpdateMemoriesCommandSchema>;
export type SemanticSearchMemoryCommand = z.infer<typeof SemanticSearchMemoryCommandSchema>;
export type ClientCommand = z.infer<typeof ClientCommandSchema>;

export type WelcomeEvent = z.infer<typeof WelcomeEventSchema>;
export type AgentJoinedEvent = z.infer<typeof AgentJoinedEventSchema>;
export type MessageEvent = z.infer<typeof MessageEventSchema>;
export type AgentLeftEvent = z.infer<typeof AgentLeftEventSchema>;
export type ErrorEvent = z.infer<typeof ErrorEventSchema>;
export type RoomCreatedEvent = z.infer<typeof RoomCreatedEventSchema>;
export type RoomListEvent = z.infer<typeof RoomListEventSchema>;
export type ProposalCreatedEvent = z.infer<typeof ProposalCreatedEventSchema>;
export type VoteCastEvent = z.infer<typeof VoteCastEventSchema>;
export type ProposalResolvedEvent = z.infer<typeof ProposalResolvedEventSchema>;
export type AgentMetadataUpdatedEvent = z.infer<typeof AgentMetadataUpdatedEventSchema>;
export type DNAReviewRequestEvent = z.infer<typeof DNAReviewRequestEventSchema>;
export type DNAApprovedEvent = z.infer<typeof DNAApprovedEventSchema>;
export type DNARejectedEvent = z.infer<typeof DNARejectedEventSchema>;
export type AgentJoinedDNAEvent = z.infer<typeof AgentJoinedDNAEventSchema>;
export type ToolResultEvent = z.infer<typeof ToolResultEventSchema>;
export type ToolsAvailableEvent = z.infer<typeof ToolsAvailableEventSchema>;
export type MemoryRecordedEvent = z.infer<typeof MemoryRecordedEventSchema>;
export type MemoryUpdatedEvent = z.infer<typeof MemoryUpdatedEventSchema>;
export type MemoryDeletedEvent = z.infer<typeof MemoryDeletedEventSchema>;
export type MemoryQueryResultEvent = z.infer<typeof MemoryQueryResultEventSchema>;
export type MemoriesInjectedEvent = z.infer<typeof MemoriesInjectedEventSchema>;
export type MemoryStatsEvent = z.infer<typeof MemoryStatsEventSchema>;
export type BulkMemoriesResultEvent = z.infer<typeof BulkMemoriesResultEventSchema>;
export type SemanticSearchResultEvent = z.infer<typeof SemanticSearchResultEventSchema>;
export type ServerEvent = z.infer<typeof ServerEventSchema>;
