/**
 * VoteManager - Manages multiple proposals and voting
 */

import { EventEmitter } from 'events';
import { randomUUID } from 'crypto';
import { Proposal, ProposalConfig, ProposalStatus, VoteType } from './proposal.js';

/**
 * Partial proposal configuration (id is optional, will be auto-generated)
 */
export interface CreateProposalConfig extends Partial<ProposalConfig> {
  title: string;
  description: string;
  proposerId: string;
  proposerName: string;
  threshold?: number;
}

/**
 * VoteManager manages multiple proposals and their lifecycles
 */
export class VoteManager extends EventEmitter {
  private proposals: Map<string, Proposal>;

  constructor() {
    super();
    this.proposals = new Map();
  }

  /**
   * Create a new proposal
   */
  createProposal(config: CreateProposalConfig): string {
    const id = config.id ?? randomUUID();

    const proposal = new Proposal({
      id,
      title: config.title,
      description: config.description,
      proposerId: config.proposerId,
      proposerName: config.proposerName,
      ...(config.threshold !== undefined && { threshold: config.threshold }),
    });

    this.proposals.set(id, proposal);

    return id;
  }

  /**
   * Get proposal by ID
   */
  getProposal(id: string): Proposal | undefined {
    return this.proposals.get(id);
  }

  /**
   * Get all proposals
   */
  getAllProposals(): Proposal[] {
    return Array.from(this.proposals.values());
  }

  /**
   * Get proposals by status
   */
  getProposalsByStatus(status: ProposalStatus): Proposal[] {
    return this.getAllProposals().filter((p) => p.getStatus() === status);
  }

  /**
   * Vote on a proposal
   */
  vote(proposalId: string, agentId: string, voteType: VoteType): void {
    const proposal = this.proposals.get(proposalId);

    if (!proposal) {
      throw new Error(`Proposal ${proposalId} not found`);
    }

    proposal.vote(agentId, voteType);

    // Note: We don't automatically update status here.
    // Call updateProposalStatus() or checkAllProposals() to finalize proposals
  }

  /**
   * Check consensus and update proposal status if reached
   */
  updateProposalStatus(proposalId: string): void {
    const proposal = this.proposals.get(proposalId);

    if (!proposal) {
      return;
    }

    // Only check pending proposals
    if (proposal.getStatus() !== ProposalStatus.PENDING) {
      return;
    }

    if (!proposal.hasReachedConsensus()) {
      return;
    }

    // Update status based on votes
    if (proposal.isApproved()) {
      proposal.setStatus(ProposalStatus.APPROVED);
      this.emit('proposal:approved', proposalId);
    } else {
      proposal.setStatus(ProposalStatus.REJECTED);
      this.emit('proposal:rejected', proposalId);
    }
  }

  /**
   * Delete a proposal
   */
  deleteProposal(id: string): void {
    if (!this.proposals.has(id)) {
      throw new Error(`Proposal ${id} not found`);
    }

    this.proposals.delete(id);
  }

  /**
   * Get total proposal count
   */
  getProposalCount(): number {
    return this.proposals.size;
  }

  /**
   * Get count of pending proposals
   */
  getPendingCount(): number {
    return this.getProposalsByStatus(ProposalStatus.PENDING).length;
  }
}
