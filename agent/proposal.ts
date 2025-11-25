/**
 * Proposal - Manages proposals and voting for consensus
 */

/**
 * Proposal status enum
 */
export enum ProposalStatus {
  PENDING = 'pending',
  APPROVED = 'approved',
  REJECTED = 'rejected',
}

/**
 * Vote types
 */
export enum VoteType {
  YES = 'yes',
  NO = 'no',
  ABSTAIN = 'abstain',
}

/**
 * Proposal configuration
 */
export interface ProposalConfig {
  id: string;
  title: string;
  description: string;
  proposerId: string;
  proposerName: string;
  threshold?: number; // Approval threshold (0.0 to 1.0), defaults to 0.5
}

/**
 * Proposal class manages a single proposal and its votes
 */
export class Proposal {
  private id: string;
  private title: string;
  private description: string;
  private proposerId: string;
  private proposerName: string;
  private threshold: number;
  private status: ProposalStatus;
  private createdAt: Date;
  private votes: Map<string, VoteType>;

  constructor(config: ProposalConfig) {
    this.id = config.id;
    this.title = config.title;
    this.description = config.description;
    this.proposerId = config.proposerId;
    this.proposerName = config.proposerName;
    this.threshold = config.threshold ?? 0.5;
    this.status = ProposalStatus.PENDING;
    this.createdAt = new Date();
    this.votes = new Map();
  }

  /**
   * Get proposal ID
   */
  getId(): string {
    return this.id;
  }

  /**
   * Get proposal title
   */
  getTitle(): string {
    return this.title;
  }

  /**
   * Get proposal description
   */
  getDescription(): string {
    return this.description;
  }

  /**
   * Get proposer ID
   */
  getProposerId(): string {
    return this.proposerId;
  }

  /**
   * Get proposer name
   */
  getProposerName(): string {
    return this.proposerName;
  }

  /**
   * Get approval threshold
   */
  getThreshold(): number {
    return this.threshold;
  }

  /**
   * Get proposal status
   */
  getStatus(): ProposalStatus {
    return this.status;
  }

  /**
   * Get creation date
   */
  getCreatedAt(): Date {
    return this.createdAt;
  }

  /**
   * Get all votes
   */
  getVotes(): Map<string, VoteType> {
    return new Map(this.votes);
  }

  /**
   * Set proposal status
   */
  setStatus(status: ProposalStatus): void {
    this.status = status;
  }

  /**
   * Record a vote
   */
  vote(agentId: string, voteType: VoteType): void {
    if (this.status !== ProposalStatus.PENDING) {
      throw new Error(`Cannot vote on proposal with status: ${this.status}`);
    }

    this.votes.set(agentId, voteType);
  }

  /**
   * Get count of yes votes
   */
  getYesCount(): number {
    let count = 0;
    for (const vote of this.votes.values()) {
      if (vote === VoteType.YES) {
        count++;
      }
    }
    return count;
  }

  /**
   * Get count of no votes
   */
  getNoCount(): number {
    let count = 0;
    for (const vote of this.votes.values()) {
      if (vote === VoteType.NO) {
        count++;
      }
    }
    return count;
  }

  /**
   * Get count of abstain votes
   */
  getAbstainCount(): number {
    let count = 0;
    for (const vote of this.votes.values()) {
      if (vote === VoteType.ABSTAIN) {
        count++;
      }
    }
    return count;
  }

  /**
   * Get total vote count
   */
  getTotalVotes(): number {
    return this.votes.size;
  }

  /**
   * Check if consensus has been reached (enough votes cast)
   */
  hasReachedConsensus(): boolean {
    // Consensus is reached when we have at least one decisive vote (yes or no)
    return this.getYesCount() + this.getNoCount() > 0;
  }

  /**
   * Check if proposal is approved based on votes
   */
  isApproved(): boolean {
    const yesCount = this.getYesCount();
    const decisiveVotes = this.getYesCount() + this.getNoCount();

    if (decisiveVotes === 0) {
      return false;
    }

    const approvalRatio = yesCount / decisiveVotes;
    return approvalRatio >= this.threshold;
  }

  /**
   * Get proposal summary
   */
  getSummary(): string {
    const yesCount = this.getYesCount();
    const noCount = this.getNoCount();
    const abstainCount = this.getAbstainCount();

    return `Proposal: "${this.title}" by ${this.proposerName}
Status: ${this.status}
Votes: ${yesCount} yes, ${noCount} no, ${abstainCount} abstain
${this.description}`;
  }
}
