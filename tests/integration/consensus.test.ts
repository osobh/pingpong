import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { VoteManager } from '../../agent/vote-manager.js';
import { ProposalStatus, VoteType } from '../../agent/proposal.js';

/**
 * Integration test suite for Consensus system
 * Tests end-to-end proposal creation, voting, and consensus detection
 */
describe('Consensus Integration', () => {
  let voteManager: VoteManager;

  beforeEach(() => {
    voteManager = new VoteManager();
  });

  describe('Multi-agent voting workflow', () => {
    it('should handle complete proposal lifecycle from creation to approval', () => {
      // Agent Alice creates a proposal
      const proposalId = voteManager.createProposal({
        title: 'Adopt microservices architecture',
        description: 'We should migrate to a microservices-based architecture for better scalability',
        proposerId: 'alice',
        proposerName: 'Alice',
        threshold: 0.6, // 60% approval needed
      });

      // Verify proposal is pending
      const proposal = voteManager.getProposal(proposalId);
      expect(proposal?.getStatus()).toBe(ProposalStatus.PENDING);

      // Multiple agents vote
      voteManager.vote(proposalId, 'bob', VoteType.YES);
      voteManager.vote(proposalId, 'charlie', VoteType.YES);
      voteManager.vote(proposalId, 'david', VoteType.YES);
      voteManager.vote(proposalId, 'eve', VoteType.NO);
      voteManager.vote(proposalId, 'frank', VoteType.ABSTAIN); // Abstain doesn't count

      // Update status
      voteManager.updateProposalStatus(proposalId);

      // Verify proposal is approved (3 yes / 4 decisive votes = 75% > 60%)
      expect(proposal?.getStatus()).toBe(ProposalStatus.APPROVED);
      expect(proposal?.getYesCount()).toBe(3);
      expect(proposal?.getNoCount()).toBe(1);
      expect(proposal?.getAbstainCount()).toBe(1);
    });

    it('should handle proposal rejection when votes below threshold', () => {
      const proposalId = voteManager.createProposal({
        title: 'Rewrite everything in Rust',
        description: 'Complete rewrite in Rust for better performance',
        proposerId: 'alice',
        proposerName: 'Alice',
        threshold: 0.75, // 75% approval needed
      });

      // Agents vote - majority yes but below threshold
      voteManager.vote(proposalId, 'bob', VoteType.YES);
      voteManager.vote(proposalId, 'charlie', VoteType.YES);
      voteManager.vote(proposalId, 'david', VoteType.NO);
      voteManager.vote(proposalId, 'eve', VoteType.NO);

      // Update status
      voteManager.updateProposalStatus(proposalId);

      // Verify proposal is rejected (2 yes / 4 total = 50% < 75%)
      const proposal = voteManager.getProposal(proposalId);
      expect(proposal?.getStatus()).toBe(ProposalStatus.REJECTED);
    });

    it('should handle multiple concurrent proposals', () => {
      // Create multiple proposals
      const proposal1 = voteManager.createProposal({
        title: 'Use TypeScript',
        description: 'Migrate to TypeScript',
        proposerId: 'alice',
        proposerName: 'Alice',
      });

      const proposal2 = voteManager.createProposal({
        title: 'Use GraphQL',
        description: 'Adopt GraphQL for API',
        proposerId: 'bob',
        proposerName: 'Bob',
      });

      const proposal3 = voteManager.createProposal({
        title: 'Use Docker',
        description: 'Containerize with Docker',
        proposerId: 'charlie',
        proposerName: 'Charlie',
      });

      // Different agents vote on different proposals
      voteManager.vote(proposal1, 'bob', VoteType.YES);
      voteManager.vote(proposal1, 'charlie', VoteType.YES);
      voteManager.vote(proposal2, 'alice', VoteType.NO);
      voteManager.vote(proposal2, 'charlie', VoteType.NO);
      voteManager.vote(proposal3, 'alice', VoteType.YES);

      // Update all proposal statuses
      voteManager.updateProposalStatus(proposal1);
      voteManager.updateProposalStatus(proposal2);
      voteManager.updateProposalStatus(proposal3);

      // Verify different outcomes
      expect(voteManager.getProposal(proposal1)?.getStatus()).toBe(ProposalStatus.APPROVED);
      expect(voteManager.getProposal(proposal2)?.getStatus()).toBe(ProposalStatus.REJECTED);
      expect(voteManager.getProposal(proposal3)?.getStatus()).toBe(ProposalStatus.APPROVED);

      // Verify counts
      expect(voteManager.getProposalCount()).toBe(3);
      expect(voteManager.getPendingCount()).toBe(0);
    });

    it('should prevent voting on finalized proposals', () => {
      const proposalId = voteManager.createProposal({
        title: 'Test proposal',
        description: 'Testing finalization',
        proposerId: 'alice',
        proposerName: 'Alice',
      });

      // Vote and finalize
      voteManager.vote(proposalId, 'bob', VoteType.YES);
      voteManager.vote(proposalId, 'charlie', VoteType.YES);
      voteManager.updateProposalStatus(proposalId);

      // Verify approved
      expect(voteManager.getProposal(proposalId)?.getStatus()).toBe(ProposalStatus.APPROVED);

      // Attempt to vote on approved proposal should throw
      expect(() => {
        voteManager.vote(proposalId, 'david', VoteType.NO);
      }).toThrow('Cannot vote on proposal with status: approved');
    });

    it('should allow agents to change their vote before finalization', () => {
      const proposalId = voteManager.createProposal({
        title: 'Test vote changes',
        description: 'Testing vote modification',
        proposerId: 'alice',
        proposerName: 'Alice',
      });

      // Bob votes yes, then changes to no
      voteManager.vote(proposalId, 'bob', VoteType.YES);
      expect(voteManager.getProposal(proposalId)?.getYesCount()).toBe(1);

      voteManager.vote(proposalId, 'bob', VoteType.NO);
      expect(voteManager.getProposal(proposalId)?.getYesCount()).toBe(0);
      expect(voteManager.getProposal(proposalId)?.getNoCount()).toBe(1);

      // Charlie votes no, then changes to abstain
      voteManager.vote(proposalId, 'charlie', VoteType.NO);
      expect(voteManager.getProposal(proposalId)?.getNoCount()).toBe(2);

      voteManager.vote(proposalId, 'charlie', VoteType.ABSTAIN);
      expect(voteManager.getProposal(proposalId)?.getNoCount()).toBe(1);
      expect(voteManager.getProposal(proposalId)?.getAbstainCount()).toBe(1);
    });
  });

  describe('Event handling', () => {
    it('should emit approval events when proposals are approved', (done) => {
      let eventFired = false;
      let approvedProposalId: string | undefined;

      voteManager.on('proposal:approved', (id: string) => {
        eventFired = true;
        approvedProposalId = id;
      });

      const proposalId = voteManager.createProposal({
        title: 'Event test',
        description: 'Testing events',
        proposerId: 'alice',
        proposerName: 'Alice',
      });

      voteManager.vote(proposalId, 'bob', VoteType.YES);
      voteManager.vote(proposalId, 'charlie', VoteType.YES);
      voteManager.updateProposalStatus(proposalId);

      // Give event time to fire
      setTimeout(() => {
        expect(eventFired).toBe(true);
        expect(approvedProposalId).toBe(proposalId);
        done();
      }, 100);
    });

    it('should emit rejection events when proposals are rejected', (done) => {
      let eventFired = false;
      let rejectedProposalId: string | undefined;

      voteManager.on('proposal:rejected', (id: string) => {
        eventFired = true;
        rejectedProposalId = id;
      });

      const proposalId = voteManager.createProposal({
        title: 'Rejection test',
        description: 'Testing rejection events',
        proposerId: 'alice',
        proposerName: 'Alice',
      });

      voteManager.vote(proposalId, 'bob', VoteType.NO);
      voteManager.vote(proposalId, 'charlie', VoteType.NO);
      voteManager.updateProposalStatus(proposalId);

      // Give event time to fire
      setTimeout(() => {
        expect(eventFired).toBe(true);
        expect(rejectedProposalId).toBe(proposalId);
        done();
      }, 100);
    });

    it('should handle multiple event listeners', () => {
      let listener1Called = false;
      let listener2Called = false;

      voteManager.on('proposal:approved', () => {
        listener1Called = true;
      });

      voteManager.on('proposal:approved', () => {
        listener2Called = true;
      });

      const proposalId = voteManager.createProposal({
        title: 'Multi-listener test',
        description: 'Testing multiple listeners',
        proposerId: 'alice',
        proposerName: 'Alice',
      });

      voteManager.vote(proposalId, 'bob', VoteType.YES);
      voteManager.vote(proposalId, 'charlie', VoteType.YES);
      voteManager.updateProposalStatus(proposalId);

      expect(listener1Called).toBe(true);
      expect(listener2Called).toBe(true);
    });
  });

  describe('Filtering and querying', () => {
    it('should filter proposals by status correctly', () => {
      // Create and process multiple proposals
      const approved1 = voteManager.createProposal({
        title: 'Approved 1',
        description: 'First approved',
        proposerId: 'alice',
        proposerName: 'Alice',
      });

      const approved2 = voteManager.createProposal({
        title: 'Approved 2',
        description: 'Second approved',
        proposerId: 'bob',
        proposerName: 'Bob',
      });

      const rejected1 = voteManager.createProposal({
        title: 'Rejected 1',
        description: 'First rejected',
        proposerId: 'charlie',
        proposerName: 'Charlie',
      });

      const pending1 = voteManager.createProposal({
        title: 'Pending 1',
        description: 'Still pending',
        proposerId: 'david',
        proposerName: 'David',
      });

      // Approve first two
      voteManager.vote(approved1, 'bob', VoteType.YES);
      voteManager.vote(approved1, 'charlie', VoteType.YES);
      voteManager.updateProposalStatus(approved1);

      voteManager.vote(approved2, 'alice', VoteType.YES);
      voteManager.vote(approved2, 'charlie', VoteType.YES);
      voteManager.updateProposalStatus(approved2);

      // Reject third
      voteManager.vote(rejected1, 'alice', VoteType.NO);
      voteManager.vote(rejected1, 'bob', VoteType.NO);
      voteManager.updateProposalStatus(rejected1);

      // Leave fourth pending (no votes)

      // Query by status
      const approvedProposals = voteManager.getProposalsByStatus(ProposalStatus.APPROVED);
      const rejectedProposals = voteManager.getProposalsByStatus(ProposalStatus.REJECTED);
      const pendingProposals = voteManager.getProposalsByStatus(ProposalStatus.PENDING);

      expect(approvedProposals.length).toBe(2);
      expect(rejectedProposals.length).toBe(1);
      expect(pendingProposals.length).toBe(1);

      // Verify specific proposals
      expect(approvedProposals.map((p) => p.getId())).toContain(approved1);
      expect(approvedProposals.map((p) => p.getId())).toContain(approved2);
      expect(rejectedProposals[0].getId()).toBe(rejected1);
      expect(pendingProposals[0].getId()).toBe(pending1);
    });

    it('should retrieve all proposals', () => {
      voteManager.createProposal({
        title: 'Proposal 1',
        description: 'First',
        proposerId: 'alice',
        proposerName: 'Alice',
      });

      voteManager.createProposal({
        title: 'Proposal 2',
        description: 'Second',
        proposerId: 'bob',
        proposerName: 'Bob',
      });

      voteManager.createProposal({
        title: 'Proposal 3',
        description: 'Third',
        proposerId: 'charlie',
        proposerName: 'Charlie',
      });

      const allProposals = voteManager.getAllProposals();
      expect(allProposals.length).toBe(3);
    });
  });

  describe('Edge cases', () => {
    it('should handle proposal with only abstain votes', () => {
      const proposalId = voteManager.createProposal({
        title: 'All abstain',
        description: 'Everyone abstains',
        proposerId: 'alice',
        proposerName: 'Alice',
      });

      voteManager.vote(proposalId, 'bob', VoteType.ABSTAIN);
      voteManager.vote(proposalId, 'charlie', VoteType.ABSTAIN);
      voteManager.vote(proposalId, 'david', VoteType.ABSTAIN);

      // Should remain pending (no decisive votes)
      voteManager.updateProposalStatus(proposalId);
      expect(voteManager.getProposal(proposalId)?.getStatus()).toBe(ProposalStatus.PENDING);
    });

    it('should handle unanimous approval', () => {
      const proposalId = voteManager.createProposal({
        title: 'Unanimous',
        description: 'Everyone agrees',
        proposerId: 'alice',
        proposerName: 'Alice',
        threshold: 1.0, // Require 100%
      });

      voteManager.vote(proposalId, 'bob', VoteType.YES);
      voteManager.vote(proposalId, 'charlie', VoteType.YES);
      voteManager.vote(proposalId, 'david', VoteType.YES);
      voteManager.vote(proposalId, 'eve', VoteType.YES);

      voteManager.updateProposalStatus(proposalId);
      expect(voteManager.getProposal(proposalId)?.getStatus()).toBe(ProposalStatus.APPROVED);
    });

    it('should handle unanimous rejection', () => {
      const proposalId = voteManager.createProposal({
        title: 'Unanimous rejection',
        description: 'Everyone disagrees',
        proposerId: 'alice',
        proposerName: 'Alice',
      });

      voteManager.vote(proposalId, 'bob', VoteType.NO);
      voteManager.vote(proposalId, 'charlie', VoteType.NO);
      voteManager.vote(proposalId, 'david', VoteType.NO);

      voteManager.updateProposalStatus(proposalId);
      expect(voteManager.getProposal(proposalId)?.getStatus()).toBe(ProposalStatus.REJECTED);
    });

    it('should handle proposal deletion', () => {
      const proposalId = voteManager.createProposal({
        title: 'To be deleted',
        description: 'This will be removed',
        proposerId: 'alice',
        proposerName: 'Alice',
      });

      expect(voteManager.getProposal(proposalId)).toBeDefined();
      expect(voteManager.getProposalCount()).toBe(1);

      voteManager.deleteProposal(proposalId);

      expect(voteManager.getProposal(proposalId)).toBeUndefined();
      expect(voteManager.getProposalCount()).toBe(0);
    });

    it('should throw when deleting non-existent proposal', () => {
      expect(() => {
        voteManager.deleteProposal('nonexistent-id');
      }).toThrow('Proposal nonexistent-id not found');
    });
  });
});
