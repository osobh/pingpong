import { describe, it, expect, beforeEach } from 'vitest';
import { Proposal, ProposalStatus, VoteType } from '../../agent/proposal.js';

/**
 * Test suite for Proposal system
 * Tests proposal creation, voting, and consensus tracking
 */
describe('Proposal', () => {
  describe('Creation', () => {
    it('should create a proposal with required fields', () => {
      const proposal = new Proposal({
        id: 'prop-1',
        title: 'Use microservices architecture',
        description: 'We should adopt a microservices approach for better scalability',
        proposerId: 'alice',
        proposerName: 'Alice',
      });

      expect(proposal.getId()).toBe('prop-1');
      expect(proposal.getTitle()).toBe('Use microservices architecture');
      expect(proposal.getDescription()).toBe(
        'We should adopt a microservices approach for better scalability',
      );
      expect(proposal.getProposerId()).toBe('alice');
      expect(proposal.getProposerName()).toBe('Alice');
      expect(proposal.getStatus()).toBe(ProposalStatus.PENDING);
      expect(proposal.getCreatedAt()).toBeInstanceOf(Date);
    });

    it('should allow setting custom threshold', () => {
      const proposal = new Proposal({
        id: 'prop-2',
        title: 'Test proposal',
        description: 'Description',
        proposerId: 'alice',
        proposerName: 'Alice',
        threshold: 0.75, // 75% approval needed
      });

      expect(proposal.getThreshold()).toBe(0.75);
    });

    it('should default to 0.5 threshold', () => {
      const proposal = new Proposal({
        id: 'prop-3',
        title: 'Test proposal',
        description: 'Description',
        proposerId: 'alice',
        proposerName: 'Alice',
      });

      expect(proposal.getThreshold()).toBe(0.5);
    });
  });

  describe('Voting', () => {
    let proposal: Proposal;

    beforeEach(() => {
      proposal = new Proposal({
        id: 'prop-vote',
        title: 'Test voting',
        description: 'Testing vote functionality',
        proposerId: 'alice',
        proposerName: 'Alice',
      });
    });

    it('should record a yes vote', () => {
      proposal.vote('bob', VoteType.YES);

      const votes = proposal.getVotes();
      expect(votes.get('bob')).toBe(VoteType.YES);
    });

    it('should record a no vote', () => {
      proposal.vote('bob', VoteType.NO);

      const votes = proposal.getVotes();
      expect(votes.get('bob')).toBe(VoteType.NO);
    });

    it('should record an abstain vote', () => {
      proposal.vote('bob', VoteType.ABSTAIN);

      const votes = proposal.getVotes();
      expect(votes.get('bob')).toBe(VoteType.ABSTAIN);
    });

    it('should allow changing a vote', () => {
      proposal.vote('bob', VoteType.YES);
      proposal.vote('bob', VoteType.NO);

      const votes = proposal.getVotes();
      expect(votes.get('bob')).toBe(VoteType.NO);
    });

    it('should track multiple votes from different agents', () => {
      proposal.vote('bob', VoteType.YES);
      proposal.vote('charlie', VoteType.NO);
      proposal.vote('david', VoteType.ABSTAIN);

      const votes = proposal.getVotes();
      expect(votes.size).toBe(3);
      expect(votes.get('bob')).toBe(VoteType.YES);
      expect(votes.get('charlie')).toBe(VoteType.NO);
      expect(votes.get('david')).toBe(VoteType.ABSTAIN);
    });
  });

  describe('Vote Counting', () => {
    let proposal: Proposal;

    beforeEach(() => {
      proposal = new Proposal({
        id: 'prop-count',
        title: 'Test counting',
        description: 'Testing vote counting',
        proposerId: 'alice',
        proposerName: 'Alice',
      });
    });

    it('should count yes votes correctly', () => {
      proposal.vote('bob', VoteType.YES);
      proposal.vote('charlie', VoteType.YES);
      proposal.vote('david', VoteType.NO);

      expect(proposal.getYesCount()).toBe(2);
    });

    it('should count no votes correctly', () => {
      proposal.vote('bob', VoteType.NO);
      proposal.vote('charlie', VoteType.NO);
      proposal.vote('david', VoteType.YES);

      expect(proposal.getNoCount()).toBe(2);
    });

    it('should count abstain votes correctly', () => {
      proposal.vote('bob', VoteType.ABSTAIN);
      proposal.vote('charlie', VoteType.ABSTAIN);
      proposal.vote('david', VoteType.YES);

      expect(proposal.getAbstainCount()).toBe(2);
    });

    it('should calculate total votes correctly', () => {
      proposal.vote('bob', VoteType.YES);
      proposal.vote('charlie', VoteType.NO);
      proposal.vote('david', VoteType.ABSTAIN);

      expect(proposal.getTotalVotes()).toBe(3);
    });
  });

  describe('Consensus', () => {
    it('should be approved when yes votes meet threshold', () => {
      const proposal = new Proposal({
        id: 'prop-consensus-1',
        title: 'Test consensus',
        description: 'Testing consensus',
        proposerId: 'alice',
        proposerName: 'Alice',
        threshold: 0.5, // 50%
      });

      proposal.vote('bob', VoteType.YES);
      proposal.vote('charlie', VoteType.YES);
      proposal.vote('david', VoteType.NO);

      // 2 yes out of 3 total = 66.7% > 50%
      expect(proposal.hasReachedConsensus()).toBe(true);
      expect(proposal.isApproved()).toBe(true);
    });

    it('should not be approved when yes votes below threshold', () => {
      const proposal = new Proposal({
        id: 'prop-consensus-2',
        title: 'Test consensus',
        description: 'Testing consensus',
        proposerId: 'alice',
        proposerName: 'Alice',
        threshold: 0.5,
      });

      proposal.vote('bob', VoteType.YES);
      proposal.vote('charlie', VoteType.NO);
      proposal.vote('david', VoteType.NO);

      // 1 yes out of 3 total = 33.3% < 50%
      expect(proposal.hasReachedConsensus()).toBe(true);
      expect(proposal.isApproved()).toBe(false);
    });

    it('should handle unanimous approval', () => {
      const proposal = new Proposal({
        id: 'prop-consensus-3',
        title: 'Test consensus',
        description: 'Testing consensus',
        proposerId: 'alice',
        proposerName: 'Alice',
        threshold: 1.0, // 100%
      });

      proposal.vote('bob', VoteType.YES);
      proposal.vote('charlie', VoteType.YES);
      proposal.vote('david', VoteType.YES);

      expect(proposal.hasReachedConsensus()).toBe(true);
      expect(proposal.isApproved()).toBe(true);
    });

    it('should not count abstain votes in approval calculation', () => {
      const proposal = new Proposal({
        id: 'prop-consensus-4',
        title: 'Test consensus',
        description: 'Testing consensus',
        proposerId: 'alice',
        proposerName: 'Alice',
        threshold: 0.5,
      });

      proposal.vote('bob', VoteType.YES);
      proposal.vote('charlie', VoteType.ABSTAIN);

      // 1 yes, 1 abstain - abstain doesn't count as yes or no
      // 1 yes out of 1 decisive vote = 100% > 50%
      expect(proposal.hasReachedConsensus()).toBe(true);
      expect(proposal.isApproved()).toBe(true);
    });
  });

  describe('Status Management', () => {
    it('should update status to approved', () => {
      const proposal = new Proposal({
        id: 'prop-status-1',
        title: 'Test status',
        description: 'Testing status',
        proposerId: 'alice',
        proposerName: 'Alice',
      });

      proposal.setStatus(ProposalStatus.APPROVED);

      expect(proposal.getStatus()).toBe(ProposalStatus.APPROVED);
    });

    it('should update status to rejected', () => {
      const proposal = new Proposal({
        id: 'prop-status-2',
        title: 'Test status',
        description: 'Testing status',
        proposerId: 'alice',
        proposerName: 'Alice',
      });

      proposal.setStatus(ProposalStatus.REJECTED);

      expect(proposal.getStatus()).toBe(ProposalStatus.REJECTED);
    });

    it('should not allow voting on approved proposal', () => {
      const proposal = new Proposal({
        id: 'prop-status-3',
        title: 'Test status',
        description: 'Testing status',
        proposerId: 'alice',
        proposerName: 'Alice',
      });

      proposal.setStatus(ProposalStatus.APPROVED);

      expect(() => {
        proposal.vote('bob', VoteType.YES);
      }).toThrow('Cannot vote on proposal with status: approved');
    });

    it('should not allow voting on rejected proposal', () => {
      const proposal = new Proposal({
        id: 'prop-status-4',
        title: 'Test status',
        description: 'Testing status',
        proposerId: 'alice',
        proposerName: 'Alice',
      });

      proposal.setStatus(ProposalStatus.REJECTED);

      expect(() => {
        proposal.vote('bob', VoteType.YES);
      }).toThrow('Cannot vote on proposal with status: rejected');
    });
  });

  describe('Summary', () => {
    it('should provide proposal summary', () => {
      const proposal = new Proposal({
        id: 'prop-summary',
        title: 'Test summary',
        description: 'Testing summary',
        proposerId: 'alice',
        proposerName: 'Alice',
      });

      proposal.vote('bob', VoteType.YES);
      proposal.vote('charlie', VoteType.NO);

      const summary = proposal.getSummary();

      expect(summary).toContain('Test summary');
      expect(summary).toContain('Alice');
      expect(summary).toContain('1 yes');
      expect(summary).toContain('1 no');
    });
  });
});
