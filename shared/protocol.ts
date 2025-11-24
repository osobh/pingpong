/**
 * WebSocket Protocol for PingPong
 * Defines message schemas for client-server communication
 */

import { z } from 'zod';

/**
 * Client → Server Commands
 */

export const JoinCommandSchema = z.object({
  type: z.literal('JOIN'),
  agentId: z.string(),
  agentName: z.string(),
  role: z.string(),
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

export const ClientCommandSchema = z.discriminatedUnion('type', [
  JoinCommandSchema,
  MessageCommandSchema,
  LeaveCommandSchema,
]);

/**
 * Server → Client Events
 */

export const WelcomeEventSchema = z.object({
  type: z.literal('WELCOME'),
  roomId: z.string(),
  topic: z.string(),
  agentCount: z.number().min(0),
  timestamp: z.number(),
});

export const AgentJoinedEventSchema = z.object({
  type: z.literal('AGENT_JOINED'),
  agentId: z.string(),
  agentName: z.string(),
  role: z.string(),
  timestamp: z.number(),
});

export const MessageEventSchema = z.object({
  type: z.literal('MESSAGE'),
  agentId: z.string(),
  agentName: z.string(),
  role: z.string(),
  content: z.string(),
  timestamp: z.number(),
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

export const ServerEventSchema = z.discriminatedUnion('type', [
  WelcomeEventSchema,
  AgentJoinedEventSchema,
  MessageEventSchema,
  AgentLeftEventSchema,
  ErrorEventSchema,
]);

/**
 * Type exports
 */

export type JoinCommand = z.infer<typeof JoinCommandSchema>;
export type MessageCommand = z.infer<typeof MessageCommandSchema>;
export type LeaveCommand = z.infer<typeof LeaveCommandSchema>;
export type ClientCommand = z.infer<typeof ClientCommandSchema>;

export type WelcomeEvent = z.infer<typeof WelcomeEventSchema>;
export type AgentJoinedEvent = z.infer<typeof AgentJoinedEventSchema>;
export type MessageEvent = z.infer<typeof MessageEventSchema>;
export type AgentLeftEvent = z.infer<typeof AgentLeftEventSchema>;
export type ErrorEvent = z.infer<typeof ErrorEventSchema>;
export type ServerEvent = z.infer<typeof ServerEventSchema>;
