/**
 * Proposal Repository - Data access layer for proposals and votes
 * Handles SQLite persistence for consensus and voting
 */

import Database from 'better-sqlite3';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { Proposal, ProposalConfig, ProposalStatus, VoteType } from '../agent/proposal.js';
import type { AgentMetadata } from '../shared/agent-metadata.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Vote record from database
 */
export interface VoteRecord {
  id: number;
  proposalId: string;
  agentId: string;
  agentName: string;
  voteType: VoteType;
  rationale: string | null;
  timestamp: number;
}

/**
 * Proposal record from database
 */
export interface ProposalRecord {
  id: string;
  roomId: string;
  title: string;
  description: string;
  proposerId: string;
  proposerName: string;
  threshold: number;
  status: ProposalStatus;
  createdAt: number;
  resolvedAt: number | null;
}

/**
 * Message record from database
 */
export interface MessageRecord {
  id: number;
  roomId: string;
  agentId: string;
  agentName: string;
  role: string;
  content: string;
  timestamp: number;
}

/**
 * ProposalRepository manages proposal and vote persistence
 */
export class ProposalRepository {
  private db: Database.Database;

  constructor(dbPath: string = ':memory:') {
    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');
    this.initializeSchema();
  }

  /**
   * Initialize database schema
   */
  private initializeSchema(): void {
    const schemaPath = join(__dirname, '../db/schema.sql');
    const schema = readFileSync(schemaPath, 'utf-8');
    this.db.exec(schema);
  }

  /**
   * Save a new proposal to the database
   */
  saveProposal(proposal: Proposal, roomId: string): void {
    const stmt = this.db.prepare(`
      INSERT INTO proposals (id, roomId, title, description, proposerId, proposerName, threshold, status, createdAt, resolvedAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      proposal.getId(),
      roomId,
      proposal.getTitle(),
      proposal.getDescription(),
      proposal.getProposerId(),
      proposal.getProposerName(),
      proposal.getThreshold(),
      proposal.getStatus(),
      proposal.getCreatedAt().getTime(),
      null, // resolvedAt is null for new proposals
    );
  }

  /**
   * Update proposal status
   */
  updateProposalStatus(proposalId: string, status: ProposalStatus): void {
    const resolvedAt = status !== ProposalStatus.PENDING ? Date.now() : null;

    const stmt = this.db.prepare(`
      UPDATE proposals
      SET status = ?, resolvedAt = ?
      WHERE id = ?
    `);

    stmt.run(status, resolvedAt, proposalId);
  }

  /**
   * Save a vote to the database
   */
  saveVote(
    proposalId: string,
    agentId: string,
    agentName: string,
    voteType: VoteType,
    rationale: string | null,
    timestamp: number,
  ): void {
    const stmt = this.db.prepare(`
      INSERT INTO votes (proposalId, agentId, agentName, voteType, rationale, timestamp)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(proposalId, agentId) DO UPDATE SET
        voteType = excluded.voteType,
        rationale = excluded.rationale,
        timestamp = excluded.timestamp
    `);

    stmt.run(proposalId, agentId, agentName, voteType, rationale, timestamp);
  }

  /**
   * Get a proposal by ID
   */
  getProposalById(proposalId: string): ProposalRecord | null {
    const stmt = this.db.prepare(`
      SELECT * FROM proposals WHERE id = ?
    `);

    return stmt.get(proposalId) as ProposalRecord | undefined ?? null;
  }

  /**
   * Get all proposals for a room
   */
  getProposalsByRoom(roomId: string): ProposalRecord[] {
    const stmt = this.db.prepare(`
      SELECT * FROM proposals
      WHERE roomId = ?
      ORDER BY createdAt DESC
    `);

    return stmt.all(roomId) as ProposalRecord[];
  }

  /**
   * Get proposals by status
   */
  getProposalsByStatus(status: ProposalStatus, roomId?: string): ProposalRecord[] {
    let stmt: Database.Statement;

    if (roomId) {
      stmt = this.db.prepare(`
        SELECT * FROM proposals
        WHERE status = ? AND roomId = ?
        ORDER BY createdAt DESC
      `);
      return stmt.all(status, roomId) as ProposalRecord[];
    } else {
      stmt = this.db.prepare(`
        SELECT * FROM proposals
        WHERE status = ?
        ORDER BY createdAt DESC
      `);
      return stmt.all(status) as ProposalRecord[];
    }
  }

  /**
   * Get all votes for a proposal
   */
  getVotesByProposal(proposalId: string): VoteRecord[] {
    const stmt = this.db.prepare(`
      SELECT * FROM votes
      WHERE proposalId = ?
      ORDER BY timestamp ASC
    `);

    return stmt.all(proposalId) as VoteRecord[];
  }

  /**
   * Get a specific agent's vote on a proposal
   */
  getVoteByAgent(proposalId: string, agentId: string): VoteRecord | null {
    const stmt = this.db.prepare(`
      SELECT * FROM votes
      WHERE proposalId = ? AND agentId = ?
    `);

    return stmt.get(proposalId, agentId) as VoteRecord | undefined ?? null;
  }

  /**
   * Reconstruct a Proposal object from database records
   */
  reconstructProposal(proposalId: string): Proposal | null {
    const record = this.getProposalById(proposalId);
    if (!record) {
      return null;
    }

    // Create proposal config
    const config: ProposalConfig = {
      id: record.id,
      title: record.title,
      description: record.description,
      proposerId: record.proposerId,
      proposerName: record.proposerName,
      threshold: record.threshold,
    };

    // Create proposal instance
    const proposal = new Proposal(config);

    // Set status (overriding default PENDING)
    proposal.setStatus(record.status);

    // Restore votes
    const votes = this.getVotesByProposal(proposalId);
    for (const vote of votes) {
      // Only restore votes if proposal is still pending
      // (Proposal.vote() throws error if status is not PENDING)
      if (record.status === ProposalStatus.PENDING) {
        proposal.vote(vote.agentId, vote.voteType);
      }
    }

    return proposal;
  }

  /**
   * Get vote count statistics for a proposal
   */
  getVoteStats(proposalId: string): {
    yesCount: number;
    noCount: number;
    abstainCount: number;
    totalVotes: number;
  } {
    const stmt = this.db.prepare(`
      SELECT
        SUM(CASE WHEN voteType = 'yes' THEN 1 ELSE 0 END) as yesCount,
        SUM(CASE WHEN voteType = 'no' THEN 1 ELSE 0 END) as noCount,
        SUM(CASE WHEN voteType = 'abstain' THEN 1 ELSE 0 END) as abstainCount,
        COUNT(*) as totalVotes
      FROM votes
      WHERE proposalId = ?
    `);

    const result = stmt.get(proposalId) as any;
    return {
      yesCount: result.yesCount ?? 0,
      noCount: result.noCount ?? 0,
      abstainCount: result.abstainCount ?? 0,
      totalVotes: result.totalVotes ?? 0,
    };
  }

  /**
   * Get all proposals with their vote counts
   */
  getProposalsWithVotes(roomId?: string): Array<ProposalRecord & {
    yesCount: number;
    noCount: number;
    abstainCount: number;
    totalVotes: number;
  }> {
    let stmt: Database.Statement;

    if (roomId) {
      stmt = this.db.prepare(`
        SELECT
          p.*,
          COALESCE(SUM(CASE WHEN v.voteType = 'yes' THEN 1 ELSE 0 END), 0) as yesCount,
          COALESCE(SUM(CASE WHEN v.voteType = 'no' THEN 1 ELSE 0 END), 0) as noCount,
          COALESCE(SUM(CASE WHEN v.voteType = 'abstain' THEN 1 ELSE 0 END), 0) as abstainCount,
          COALESCE(COUNT(v.id), 0) as totalVotes
        FROM proposals p
        LEFT JOIN votes v ON p.id = v.proposalId
        WHERE p.roomId = ?
        GROUP BY p.id
        ORDER BY p.createdAt DESC
      `);
      return stmt.all(roomId) as any[];
    } else {
      stmt = this.db.prepare(`
        SELECT
          p.*,
          COALESCE(SUM(CASE WHEN v.voteType = 'yes' THEN 1 ELSE 0 END), 0) as yesCount,
          COALESCE(SUM(CASE WHEN v.voteType = 'no' THEN 1 ELSE 0 END), 0) as noCount,
          COALESCE(SUM(CASE WHEN v.voteType = 'abstain' THEN 1 ELSE 0 END), 0) as abstainCount,
          COALESCE(COUNT(v.id), 0) as totalVotes
        FROM proposals p
        LEFT JOIN votes v ON p.id = v.proposalId
        GROUP BY p.id
        ORDER BY p.createdAt DESC
      `);
      return stmt.all() as any[];
    }
  }

  /**
   * Delete a proposal and all its votes (cascade)
   */
  deleteProposal(proposalId: string): void {
    const stmt = this.db.prepare('DELETE FROM proposals WHERE id = ?');
    stmt.run(proposalId);
  }

  /**
   * Clear all proposals and votes (for testing)
   */
  clearAll(): void {
    this.db.exec('DELETE FROM votes');
    this.db.exec('DELETE FROM proposals');
  }

  // ========== Message Persistence Methods ==========

  /**
   * Save a message to the database
   */
  saveMessage(
    roomId: string,
    agentId: string,
    agentName: string,
    role: string,
    content: string,
    timestamp: number,
  ): void {
    const stmt = this.db.prepare(`
      INSERT INTO messages (roomId, agentId, agentName, role, content, timestamp)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    stmt.run(roomId, agentId, agentName, role, content, timestamp);
  }

  /**
   * Get messages for a room with optional pagination
   */
  getMessagesByRoom(roomId: string, limit?: number, offset?: number): MessageRecord[] {
    let query = `
      SELECT * FROM messages
      WHERE roomId = ?
      ORDER BY timestamp DESC
    `;

    if (limit !== undefined) {
      query += ` LIMIT ${limit}`;
      if (offset !== undefined) {
        query += ` OFFSET ${offset}`;
      }
    }

    const stmt = this.db.prepare(query);
    return stmt.all(roomId) as MessageRecord[];
  }

  /**
   * Get messages within a time range for a room
   */
  getMessagesByTimeRange(roomId: string, startTime: number, endTime: number): MessageRecord[] {
    const stmt = this.db.prepare(`
      SELECT * FROM messages
      WHERE roomId = ? AND timestamp >= ? AND timestamp <= ?
      ORDER BY timestamp ASC
    `);

    return stmt.all(roomId, startTime, endTime) as MessageRecord[];
  }

  /**
   * Get messages by a specific agent
   */
  getMessagesByAgent(agentId: string, roomId?: string): MessageRecord[] {
    let stmt: Database.Statement;

    if (roomId) {
      stmt = this.db.prepare(`
        SELECT * FROM messages
        WHERE agentId = ? AND roomId = ?
        ORDER BY timestamp DESC
      `);
      return stmt.all(agentId, roomId) as MessageRecord[];
    } else {
      stmt = this.db.prepare(`
        SELECT * FROM messages
        WHERE agentId = ?
        ORDER BY timestamp DESC
      `);
      return stmt.all(agentId) as MessageRecord[];
    }
  }

  /**
   * Get N most recent messages for a room
   */
  getRecentMessages(roomId: string, limit: number): MessageRecord[] {
    const stmt = this.db.prepare(`
      SELECT * FROM messages
      WHERE roomId = ?
      ORDER BY timestamp DESC
      LIMIT ?
    `);

    const messages = stmt.all(roomId, limit) as MessageRecord[];
    // Return in chronological order (oldest first)
    return messages.reverse();
  }

  /**
   * Get message count for a room
   */
  getMessageCount(roomId: string): number {
    const stmt = this.db.prepare(`
      SELECT COUNT(*) as count FROM messages
      WHERE roomId = ?
    `);

    const result = stmt.get(roomId) as { count: number } | undefined;
    return result?.count ?? 0;
  }

  /**
   * Clear all messages (for testing)
   */
  clearMessages(): void {
    this.db.exec('DELETE FROM messages');
  }

  // ========== Agent Metadata Persistence Methods ==========

  /**
   * Save or update agent metadata
   */
  saveAgentMetadata(roomId: string, metadata: AgentMetadata): void {
    const stmt = this.db.prepare(`
      INSERT INTO agent_metadata (
        agentId, roomId, agentName, type, role, version,
        capabilities, llmConfig, personality, systemPromptSummary,
        custom, createdAt, lastUpdatedAt
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(agentId, roomId) DO UPDATE SET
        agentName = excluded.agentName,
        type = excluded.type,
        role = excluded.role,
        version = excluded.version,
        capabilities = excluded.capabilities,
        llmConfig = excluded.llmConfig,
        personality = excluded.personality,
        systemPromptSummary = excluded.systemPromptSummary,
        custom = excluded.custom,
        lastUpdatedAt = excluded.lastUpdatedAt
    `);

    stmt.run(
      metadata.agentId,
      roomId,
      metadata.agentName,
      metadata.type,
      metadata.role,
      metadata.version ?? null,
      JSON.stringify(metadata.capabilities),
      metadata.llmConfig ? JSON.stringify(metadata.llmConfig) : null,
      metadata.personality ? JSON.stringify(metadata.personality) : null,
      metadata.systemPromptSummary ?? null,
      metadata.custom ? JSON.stringify(metadata.custom) : null,
      metadata.createdAt,
      metadata.lastUpdatedAt,
    );
  }

  /**
   * Get agent metadata for a specific agent in a room
   */
  getAgentMetadata(agentId: string, roomId: string): AgentMetadata | null {
    const stmt = this.db.prepare(`
      SELECT * FROM agent_metadata
      WHERE agentId = ? AND roomId = ?
    `);

    const row = stmt.get(agentId, roomId) as any;
    if (!row) {
      return null;
    }

    return this.deserializeAgentMetadata(row);
  }

  /**
   * Get all agent metadata for a room
   */
  getAgentMetadataByRoom(roomId: string): AgentMetadata[] {
    const stmt = this.db.prepare(`
      SELECT * FROM agent_metadata
      WHERE roomId = ?
      ORDER BY lastUpdatedAt DESC
    `);

    const rows = stmt.all(roomId) as any[];
    return rows.map((row) => this.deserializeAgentMetadata(row));
  }

  /**
   * Get all agent metadata (across all rooms)
   */
  getAllAgentMetadata(): AgentMetadata[] {
    const stmt = this.db.prepare(`
      SELECT * FROM agent_metadata
      ORDER BY lastUpdatedAt DESC
    `);

    const rows = stmt.all() as any[];
    return rows.map((row) => this.deserializeAgentMetadata(row));
  }

  /**
   * Delete agent metadata (when agent leaves)
   */
  deleteAgentMetadata(agentId: string, roomId: string): void {
    const stmt = this.db.prepare(`
      DELETE FROM agent_metadata
      WHERE agentId = ? AND roomId = ?
    `);

    stmt.run(agentId, roomId);
  }

  /**
   * Clear all agent metadata (for testing)
   */
  clearAgentMetadata(): void {
    this.db.exec('DELETE FROM agent_metadata');
  }

  /**
   * Deserialize agent metadata from database row
   */
  private deserializeAgentMetadata(row: any): AgentMetadata {
    const metadata: AgentMetadata = {
      agentId: row.agentId,
      agentName: row.agentName,
      type: row.type,
      role: row.role,
      capabilities: JSON.parse(row.capabilities),
      llmConfig: row.llmConfig ? JSON.parse(row.llmConfig) : undefined,
      personality: row.personality ? JSON.parse(row.personality) : undefined,
      systemPromptSummary: row.systemPromptSummary ?? undefined,
      createdAt: row.createdAt,
      lastUpdatedAt: row.lastUpdatedAt,
    };

    // Add optional fields only if they exist
    if (row.version) metadata.version = row.version;
    if (row.custom) metadata.custom = JSON.parse(row.custom);

    return metadata;
  }

  /**
   * Close database connection
   */
  close(): void {
    this.db.close();
  }
}
