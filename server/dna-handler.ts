/**
 * DNA Handler - Server-side DNA validation and review management
 *
 * Handles:
 * - DNA payload validation
 * - Signature verification
 * - Security checks
 * - Admin review queue
 * - DNA import/spawn decisions
 */

import { randomUUID } from 'node:crypto';
import type { AgentDNA } from '../shared/agent-dna.js';
import { DNASerializer } from '../shared/dna-serializer.js';
import { DNAManager } from '../agent/dna-manager.js';

/**
 * DNA Review Request
 */
export interface DNAReviewRequest {
  requestId: string;
  dna: AgentDNA;
  mode: 'trial' | 'permanent';
  requestedBy?: string; // IP or identifier
  requestedAt: number;
  status: 'pending' | 'approved' | 'rejected';
  reviewedBy?: string;
  reviewedAt?: number;
  rejectionReason?: string;
}

/**
 * DNA Validation Result
 */
export interface DNAValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  securityIssues: string[];
}

/**
 * DNA Handler Configuration
 */
export interface DNAHandlerConfig {
  /** Require signature for all DNA */
  requireSignature: boolean;

  /** Auto-approve DNA with valid signatures from trusted creators */
  autoApproveTrusted: boolean;

  /** List of trusted creator public keys */
  trustedCreators: string[];

  /** Maximum DNA size in bytes */
  maxDNASize: number;

  /** Require admin review for all DNA */
  requireAdminReview: boolean;

  /** Auto-approve trial mode (ephemeral agents) */
  autoApproveTrial: boolean;
}

/**
 * DNA Handler class
 */
export class DNAHandler {
  private reviewQueue: Map<string, DNAReviewRequest> = new Map();
  private config: DNAHandlerConfig;

  constructor(config: Partial<DNAHandlerConfig> = {}) {
    this.config = {
      requireSignature: config.requireSignature ?? true,
      autoApproveTrusted: config.autoApproveTrusted ?? false,
      trustedCreators: config.trustedCreators ?? [],
      maxDNASize: config.maxDNASize ?? 1024 * 1024, // 1MB
      requireAdminReview: config.requireAdminReview ?? true,
      autoApproveTrial: config.autoApproveTrial ?? false,
    };
  }

  /**
   * Validate DNA payload
   */
  async validateDNA(dna: AgentDNA): Promise<DNAValidationResult> {
    const errors: string[] = [];
    const warnings: string[] = [];
    const securityIssues: string[] = [];

    // 1. Basic structure validation
    const basicValidation = DNASerializer.validate(dna);
    if (!basicValidation.valid) {
      errors.push(...basicValidation.errors);
    }
    warnings.push(...basicValidation.warnings);

    // 2. Signature validation
    if (this.config.requireSignature && !dna.signature) {
      errors.push('DNA signature required but not present');
    }

    if (dna.signature) {
      const signatureValid = DNASerializer.verifySignature(dna);
      if (!signatureValid) {
        securityIssues.push('DNA signature verification failed - may be tampered');
        errors.push('Invalid DNA signature');
      }
    }

    // 3. Security checks
    this.performSecurityChecks(dna, securityIssues, warnings);

    // 4. Size check
    const dnaSize = JSON.stringify(dna).length;
    if (dnaSize > this.config.maxDNASize) {
      errors.push(`DNA size (${dnaSize} bytes) exceeds maximum (${this.config.maxDNASize} bytes)`);
    }

    return {
      valid: errors.length === 0 && securityIssues.length === 0,
      errors,
      warnings,
      securityIssues,
    };
  }

  /**
   * Perform security checks on DNA
   */
  private performSecurityChecks(dna: AgentDNA, issues: string[], warnings: string[]): void {
    // Check system prompt for suspicious patterns
    const systemPrompt = dna.config.systemPrompt.toLowerCase();

    const suspiciousPatterns = [
      /ignore\s+(previous|all)\s+(instructions|rules)/i,
      /system\s+override/i,
      /admin\s+mode/i,
      /execute\s+code/i,
      /eval\(/i,
      /function\s*\(/i,
      /<script>/i,
    ];

    for (const pattern of suspiciousPatterns) {
      if (pattern.test(systemPrompt)) {
        issues.push(`Suspicious pattern detected in system prompt: ${pattern.source}`);
      }
    }

    // Check sandbox level
    if (dna.constraints.sandboxLevel === 'relaxed') {
      warnings.push('DNA requests relaxed sandbox level - review permissions carefully');
    }

    // Check dangerous permissions
    if (dna.constraints.permissions?.canAccessFiles) {
      warnings.push('DNA requests file system access');
    }

    if (dna.constraints.permissions?.canAccessNetwork) {
      warnings.push('DNA requests network access');
    }

    // Check if DNA is private but no signature
    if (dna.metadata.visibility === 'private' && !dna.signature) {
      warnings.push('Private DNA without signature - authenticity cannot be verified');
    }

    // Check for suspicious tool configurations
    if (dna.config.tools && dna.config.tools.length > 0) {
      for (const tool of dna.config.tools) {
        if (tool.type === 'custom') {
          warnings.push(`DNA includes custom tool: ${tool.name}`);
        }
      }
    }
  }

  /**
   * Submit DNA for review
   */
  async submitForReview(
    dna: AgentDNA,
    mode: 'trial' | 'permanent',
    requestedBy?: string
  ): Promise<{ requestId: string; autoApproved: boolean; reason?: string }> {
    // Validate DNA first
    const validation = await this.validateDNA(dna);
    if (!validation.valid) {
      throw new Error(`DNA validation failed: ${validation.errors.join(', ')}`);
    }

    // Check if auto-approval is possible
    const autoApproval = this.checkAutoApproval(dna, mode);

    if (autoApproval.approved) {
      // Auto-approve
      const requestId = randomUUID();
      const request: DNAReviewRequest = {
        requestId,
        dna,
        mode,
        requestedAt: Date.now(),
        status: 'approved',
        reviewedBy: 'auto-approval',
        reviewedAt: Date.now(),
      };

      if (requestedBy !== undefined) {
        request.requestedBy = requestedBy;
      }

      this.reviewQueue.set(requestId, request);

      const result: { requestId: string; autoApproved: boolean; reason?: string } = {
        requestId,
        autoApproved: true,
      };

      if (autoApproval.reason !== undefined) {
        result.reason = autoApproval.reason;
      }

      return result;
    }

    // Add to review queue
    const requestId = randomUUID();
    const request: DNAReviewRequest = {
      requestId,
      dna,
      mode,
      requestedAt: Date.now(),
      status: 'pending',
    };

    if (requestedBy !== undefined) {
      request.requestedBy = requestedBy;
    }

    this.reviewQueue.set(requestId, request);

    return {
      requestId,
      autoApproved: false,
    };
  }

  /**
   * Check if DNA can be auto-approved
   */
  private checkAutoApproval(dna: AgentDNA, mode: 'trial' | 'permanent'): { approved: boolean; reason?: string } {
    // Auto-approve trial mode if configured
    if (mode === 'trial' && this.config.autoApproveTrial) {
      return { approved: true, reason: 'Trial mode auto-approved' };
    }

    // Auto-approve if admin review not required
    if (!this.config.requireAdminReview) {
      return { approved: true, reason: 'Admin review not required' };
    }

    // Auto-approve trusted creators
    if (this.config.autoApproveTrusted && dna.signature) {
      const isTrusted = this.config.trustedCreators.includes(dna.signature.publicKey);
      if (isTrusted) {
        return { approved: true, reason: 'Trusted creator auto-approved' };
      }
    }

    return { approved: false };
  }

  /**
   * Approve DNA request
   */
  async approveRequest(requestId: string, reviewedBy: string): Promise<DNAReviewRequest> {
    const request = this.reviewQueue.get(requestId);
    if (!request) {
      throw new Error(`Review request not found: ${requestId}`);
    }

    if (request.status !== 'pending') {
      throw new Error(`Request ${requestId} already ${request.status}`);
    }

    request.status = 'approved';
    request.reviewedBy = reviewedBy;
    request.reviewedAt = Date.now();

    // If permanent mode, save to DNA library
    if (request.mode === 'permanent') {
      await DNAManager.save(request.dna);
    }

    return request;
  }

  /**
   * Reject DNA request
   */
  async rejectRequest(requestId: string, reviewedBy: string, reason: string): Promise<DNAReviewRequest> {
    const request = this.reviewQueue.get(requestId);
    if (!request) {
      throw new Error(`Review request not found: ${requestId}`);
    }

    if (request.status !== 'pending') {
      throw new Error(`Request ${requestId} already ${request.status}`);
    }

    request.status = 'rejected';
    request.reviewedBy = reviewedBy;
    request.reviewedAt = Date.now();
    request.rejectionReason = reason;

    return request;
  }

  /**
   * Get review request
   */
  getRequest(requestId: string): DNAReviewRequest | undefined {
    return this.reviewQueue.get(requestId);
  }

  /**
   * Get all pending review requests
   */
  getPendingRequests(): DNAReviewRequest[] {
    return Array.from(this.reviewQueue.values()).filter(r => r.status === 'pending');
  }

  /**
   * Get all review requests
   */
  getAllRequests(): DNAReviewRequest[] {
    return Array.from(this.reviewQueue.values());
  }

  /**
   * Clear completed requests older than specified age
   */
  clearOldRequests(maxAgeMs: number = 24 * 60 * 60 * 1000): number {
    const now = Date.now();
    let cleared = 0;

    for (const [requestId, request] of this.reviewQueue.entries()) {
      if (request.status !== 'pending' && request.reviewedAt) {
        if (now - request.reviewedAt > maxAgeMs) {
          this.reviewQueue.delete(requestId);
          cleared++;
        }
      }
    }

    return cleared;
  }
}
