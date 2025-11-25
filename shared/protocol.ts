/**
 * WebSocket Protocol for PingPong
 * Defines message schemas for client-server communication
 */

import { z } from 'zod';
import { AgentMetadataSchema } from './agent-metadata.js';

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
]);

/**
 * Type exports
 */

export type JoinCommand = z.infer<typeof JoinCommandSchema>;
export type MessageCommand = z.infer<typeof MessageCommandSchema>;
export type LeaveCommand = z.infer<typeof LeaveCommandSchema>;
export type CreateRoomCommand = z.infer<typeof CreateRoomCommandSchema>;
export type ListRoomsCommand = z.infer<typeof ListRoomsCommandSchema>;
export type LeaveRoomCommand = z.infer<typeof LeaveRoomCommandSchema>;
export type CreateProposalCommand = z.infer<typeof CreateProposalCommandSchema>;
export type VoteCommand = z.infer<typeof VoteCommandSchema>;
export type UpdateMetadataCommand = z.infer<typeof UpdateMetadataCommandSchema>;
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
export type ServerEvent = z.infer<typeof ServerEventSchema>;
