import { describe, it, expect, beforeEach } from 'vitest';
import { VoteManager } from '../../agent/vote-manager.js';
import { ProposalStatus, VoteType } from '../../agent/proposal.js';

/**
 * Test suite for VoteManager
 * Tests management of multiple proposals and voting
 */
describe('VoteManager', () => {
  let manager: VoteManager;

  beforeEach(() => {
    manager = new VoteManager();
  });

  describe('Proposal Creation', () => {
    it('should create a new proposal', () => {
      const proposalId = manager.createProposal({
        title: 'Use microservices',
        description: 'Adopt microservices architecture',
        proposerId: 'alice',
        proposerName: 'Alice',
      });

      expect(proposalId).toBeDefined();
      expect(typeof proposalId).toBe('string');
    });

    it('should track created proposals', () => {
      const id1 = manager.createProposal({
        title: 'Proposal 1',
        description: 'First proposal',
        proposerId: 'alice',
        proposerName: 'Alice',
      });

      const id2 = manager.createProposal({
        title: 'Proposal 2',
        description: 'Second proposal',
        proposerId: 'bob',
        proposerName: 'Bob',
      });

      const proposal1 = manager.getProposal(id1);
      const proposal2 = manager.getProposal(id2);

      expect(proposal1).toBeDefined();
      expect(proposal2).toBeDefined();
      expect(proposal1?.getTitle()).toBe('Proposal 1');
      expect(proposal2?.getTitle()).toBe('Proposal 2');
    });

    it('should allow custom proposal ID', () => {
      const customId = 'custom-prop-123';
      const proposalId = manager.createProposal({
        id: customId,
        title: 'Test',
        description: 'Test proposal',
        proposerId: 'alice',
        proposerName: 'Alice',
      });

      expect(proposalId).toBe(customId);
    });
  });

  describe('Proposal Retrieval', () => {
    it('should get proposal by ID', () => {
      const id = manager.createProposal({
        title: 'Test',
        description: 'Test proposal',
        proposerId: 'alice',
        proposerName: 'Alice',
      });

      const proposal = manager.getProposal(id);

      expect(proposal).toBeDefined();
      expect(proposal?.getId()).toBe(id);
    });

    it('should return undefined for non-existent proposal', () => {
      const proposal = manager.getProposal('nonexistent');

      expect(proposal).toBeUndefined();
    });

    it('should list all proposals', () => {
      manager.createProposal({
        title: 'Proposal 1',
        description: 'First',
        proposerId: 'alice',
        proposerName: 'Alice',
      });

      manager.createProposal({
        title: 'Proposal 2',
        description: 'Second',
        proposerId: 'bob',
        proposerName: 'Bob',
      });

      const proposals = manager.getAllProposals();

      expect(proposals.length).toBe(2);
    });

    it('should filter proposals by status', () => {
      const id1 = manager.createProposal({
        title: 'Proposal 1',
        description: 'First',
        proposerId: 'alice',
        proposerName: 'Alice',
      });

      manager.createProposal({
        title: 'Proposal 2',
        description: 'Second',
        proposerId: 'bob',
        proposerName: 'Bob',
      });

      // Manually approve first proposal
      const proposal1 = manager.getProposal(id1);
      proposal1?.setStatus(ProposalStatus.APPROVED);

      const pending = manager.getProposalsByStatus(ProposalStatus.PENDING);
      const approved = manager.getProposalsByStatus(ProposalStatus.APPROVED);

      expect(pending.length).toBe(1);
      expect(approved.length).toBe(1);
    });
  });

  describe('Voting', () => {
    it('should record a vote on a proposal', () => {
      const id = manager.createProposal({
        title: 'Test',
        description: 'Test proposal',
        proposerId: 'alice',
        proposerName: 'Alice',
      });

      manager.vote(id, 'bob', VoteType.YES);

      const proposal = manager.getProposal(id);
      expect(proposal?.getYesCount()).toBe(1);
    });

    it('should throw error when voting on non-existent proposal', () => {
      expect(() => {
        manager.vote('nonexistent', 'bob', VoteType.YES);
      }).toThrow('Proposal nonexistent not found');
    });

    it('should track votes from multiple agents', () => {
      const id = manager.createProposal({
        title: 'Test',
        description: 'Test proposal',
        proposerId: 'alice',
        proposerName: 'Alice',
      });

      manager.vote(id, 'bob', VoteType.YES);
      manager.vote(id, 'charlie', VoteType.YES);
      manager.vote(id, 'david', VoteType.NO);

      const proposal = manager.getProposal(id);
      expect(proposal?.getTotalVotes()).toBe(3);
      expect(proposal?.getYesCount()).toBe(2);
      expect(proposal?.getNoCount()).toBe(1);
    });
  });

  describe('Consensus Detection', () => {
    it('should automatically approve proposal when threshold reached', () => {
      const id = manager.createProposal({
        title: 'Test',
        description: 'Test proposal',
        proposerId: 'alice',
        proposerName: 'Alice',
        threshold: 0.5,
      });

      manager.vote(id, 'bob', VoteType.YES);
      manager.vote(id, 'charlie', VoteType.YES);
      manager.vote(id, 'david', VoteType.NO);

      // Update proposal status after voting
      manager.updateProposalStatus(id);

      const proposal = manager.getProposal(id);
      expect(proposal?.getStatus()).toBe(ProposalStatus.APPROVED);
    });

    it('should automatically reject proposal when threshold cannot be reached', () => {
      const id = manager.createProposal({
        title: 'Test',
        description: 'Test proposal',
        proposerId: 'alice',
        proposerName: 'Alice',
        threshold: 0.5,
      });

      manager.vote(id, 'bob', VoteType.NO);
      manager.vote(id, 'charlie', VoteType.NO);
      manager.vote(id, 'david', VoteType.YES);

      // Update proposal status after voting
      manager.updateProposalStatus(id);

      const proposal = manager.getProposal(id);
      expect(proposal?.getStatus()).toBe(ProposalStatus.REJECTED);
    });

    it('should emit event when proposal is approved', () => {
      let approvedId: string | undefined;

      manager.on('proposal:approved', (id: string) => {
        approvedId = id;
      });

      const id = manager.createProposal({
        title: 'Test',
        description: 'Test proposal',
        proposerId: 'alice',
        proposerName: 'Alice',
        threshold: 0.5,
      });

      manager.vote(id, 'bob', VoteType.YES);
      manager.vote(id, 'charlie', VoteType.YES);

      // Update proposal status after voting
      manager.updateProposalStatus(id);

      expect(approvedId).toBe(id);
    });

    it('should emit event when proposal is rejected', () => {
      let rejectedId: string | undefined;

      manager.on('proposal:rejected', (id: string) => {
        rejectedId = id;
      });

      const id = manager.createProposal({
        title: 'Test',
        description: 'Test proposal',
        proposerId: 'alice',
        proposerName: 'Alice',
        threshold: 0.5,
      });

      manager.vote(id, 'bob', VoteType.NO);
      manager.vote(id, 'charlie', VoteType.NO);

      // Update proposal status after voting
      manager.updateProposalStatus(id);

      expect(rejectedId).toBe(id);
    });
  });

  describe('Proposal Deletion', () => {
    it('should delete a proposal', () => {
      const id = manager.createProposal({
        title: 'Test',
        description: 'Test proposal',
        proposerId: 'alice',
        proposerName: 'Alice',
      });

      manager.deleteProposal(id);

      const proposal = manager.getProposal(id);
      expect(proposal).toBeUndefined();
    });

    it('should throw error when deleting non-existent proposal', () => {
      expect(() => {
        manager.deleteProposal('nonexistent');
      }).toThrow('Proposal nonexistent not found');
    });
  });

  describe('Statistics', () => {
    it('should count total proposals', () => {
      manager.createProposal({
        title: 'Proposal 1',
        description: 'First',
        proposerId: 'alice',
        proposerName: 'Alice',
      });

      manager.createProposal({
        title: 'Proposal 2',
        description: 'Second',
        proposerId: 'bob',
        proposerName: 'Bob',
      });

      expect(manager.getProposalCount()).toBe(2);
    });

    it('should count pending proposals', () => {
      const id1 = manager.createProposal({
        title: 'Proposal 1',
        description: 'First',
        proposerId: 'alice',
        proposerName: 'Alice',
      });

      manager.createProposal({
        title: 'Proposal 2',
        description: 'Second',
        proposerId: 'bob',
        proposerName: 'Bob',
      });

      // Approve one
      manager.vote(id1, 'bob', VoteType.YES);
      manager.vote(id1, 'charlie', VoteType.YES);

      // Update proposal status after voting
      manager.updateProposalStatus(id1);

      expect(manager.getPendingCount()).toBe(1);
    });
  });
});
