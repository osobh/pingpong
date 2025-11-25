/**
 * DNA Serializer - Serialization, signing, encryption, and validation for AgentDNA
 *
 * Provides:
 * - JSON serialization/deserialization with validation
 * - Ed25519/RSA cryptographic signing
 * - AES-256-GCM encryption for private agents
 * - SHA-256 integrity hashing
 * - Bcrypt password hashing
 * - Format migration support
 */

import { createHash, createCipheriv, createDecipheriv, randomBytes, generateKeyPairSync, sign, verify, scryptSync } from 'node:crypto';
import * as bcrypt from 'bcrypt';
import type {
  AgentDNA,
  DNAExportOptions,
  DNAImportOptions,
  DNAValidationResult,
  DNASignature,
} from './agent-dna.js';
import { DNA_VERSION } from './agent-dna.js';

const SALT_ROUNDS = 10;
const ENCRYPTION_ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;

/**
 * DNA Serializer class
 */
export class DNASerializer {
  /**
   * Serialize AgentDNA to JSON string
   */
  static serialize(dna: AgentDNA, options: DNAExportOptions = {}): string {
    const {
      includeSignature = true,
      includeStats = false,
      pretty = true,
    } = options;

    // Clone DNA to avoid mutations
    const exportDNA = structuredClone(dna);

    // Remove signature if not requested
    if (!includeSignature) {
      delete exportDNA.signature;
    }

    // Remove stats if not requested
    if (!includeStats && exportDNA.metadata.stats) {
      delete exportDNA.metadata.stats;
    }

    // Serialize to JSON
    return JSON.stringify(exportDNA, null, pretty ? 2 : 0);
  }

  /**
   * Deserialize JSON string to AgentDNA
   */
  static deserialize(json: string): AgentDNA {
    try {
      const dna = JSON.parse(json) as AgentDNA;

      // Basic validation
      if (!dna.dna_version || !dna.id || !dna.metadata || !dna.config) {
        throw new Error('Invalid DNA format: missing required fields');
      }

      return dna;
    } catch (error) {
      throw new Error(`Failed to deserialize DNA: ${error instanceof Error ? error.message : 'unknown error'}`);
    }
  }

  /**
   * Export DNA to file format (optionally encrypted)
   */
  static async export(dna: AgentDNA, options: DNAExportOptions = {}): Promise<string> {
    const { encrypt = false, password } = options;

    // Serialize to JSON
    const json = this.serialize(dna, options);

    // Encrypt if requested
    if (encrypt) {
      if (!password) {
        throw new Error('Password required for encryption');
      }
      return this.encrypt(json, password);
    }

    return json;
  }

  /**
   * Import DNA from file format (optionally encrypted)
   */
  static async import(data: string, options: DNAImportOptions = {}): Promise<AgentDNA> {
    const { password, verifySignature = true } = options;

    let json = data;

    // Decrypt if encrypted (detect by format)
    if (data.startsWith('ENCRYPTED:')) {
      if (!password) {
        throw new Error('Password required for decryption');
      }
      json = this.decrypt(data, password);
    }

    // Deserialize
    const dna = this.deserialize(json);

    // Verify signature if present and requested
    if (verifySignature && dna.signature) {
      const valid = this.verifySignature(dna);
      if (!valid) {
        throw new Error('DNA signature verification failed');
      }
    }

    return dna;
  }

  /**
   * Sign DNA with private key
   */
  static signDNA(dna: AgentDNA, privateKeyPEM: string, algorithm: 'ed25519' | 'rsa-sha256' = 'ed25519'): AgentDNA {
    // Compute content hash (exclude signature field)
    const { signature, ...contentToSign } = dna;
    const contentHash = this.hash(JSON.stringify(contentToSign));

    // Sign the hash
    const signatureBytes = sign(
      algorithm === 'ed25519' ? null : 'sha256',
      Buffer.from(contentHash, 'hex'),
      {
        key: privateKeyPEM,
        format: 'pem',
      }
    );

    // Extract public key from creator info
    const publicKey = dna.creator.publicKey || '';

    // Create signature object
    const dnaSignature: DNASignature = {
      algorithm,
      publicKey,
      signature: signatureBytes.toString('base64'),
      timestamp: Date.now(),
      contentHash,
    };

    // Return DNA with signature
    return {
      ...dna,
      signature: dnaSignature,
    };
  }

  /**
   * Verify DNA signature
   */
  static verifySignature(dna: AgentDNA): boolean {
    if (!dna.signature) {
      return false;
    }

    try {
      const { signature: dnaSignature, ...content } = dna;

      // Verify content hash matches
      const expectedHash = this.hash(JSON.stringify(content));
      if (expectedHash !== dnaSignature.contentHash) {
        console.error('DNA content hash mismatch');
        return false;
      }

      // Verify signature
      const signatureBytes = Buffer.from(dnaSignature.signature, 'base64');
      const hashBytes = Buffer.from(dnaSignature.contentHash, 'hex');

      const verified = verify(
        dnaSignature.algorithm === 'ed25519' ? null : 'sha256',
        hashBytes,
        {
          key: dnaSignature.publicKey,
          format: 'pem',
        },
        signatureBytes
      );

      return verified;
    } catch (error) {
      console.error('Signature verification error:', error);
      return false;
    }
  }

  /**
   * Generate Ed25519 key pair for signing
   */
  static generateKeyPair(): { privateKey: string; publicKey: string } {
    const { privateKey, publicKey } = generateKeyPairSync('ed25519', {
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
      publicKeyEncoding: { type: 'spki', format: 'pem' },
    });

    return { privateKey, publicKey };
  }

  /**
   * Hash password with bcrypt
   */
  static async hashPassword(password: string): Promise<string> {
    return bcrypt.hash(password, SALT_ROUNDS);
  }

  /**
   * Verify password against hash
   */
  static async verifyPassword(password: string, hash: string): Promise<boolean> {
    return bcrypt.compare(password, hash);
  }

  /**
   * Encrypt DNA with password (AES-256-GCM)
   */
  static encrypt(json: string, password: string): string {
    // Derive key from password using scrypt (built-in Node.js)
    const salt = randomBytes(32);
    const key = scryptSync(password, salt, 32);

    // Generate IV
    const iv = randomBytes(IV_LENGTH);

    // Create cipher
    const cipher = createCipheriv(ENCRYPTION_ALGORITHM, key, iv);

    // Encrypt
    let encrypted = cipher.update(json, 'utf8', 'base64');
    encrypted += cipher.final('base64');

    // Get auth tag
    const authTag = cipher.getAuthTag();

    // Combine: salt + iv + authTag + encrypted data
    const combined = Buffer.concat([
      salt,
      iv,
      authTag,
      Buffer.from(encrypted, 'base64'),
    ]);

    return 'ENCRYPTED:' + combined.toString('base64');
  }

  /**
   * Decrypt DNA with password
   */
  static decrypt(encryptedData: string, password: string): string {
    if (!encryptedData.startsWith('ENCRYPTED:')) {
      throw new Error('Invalid encrypted data format');
    }

    // Remove prefix
    const data = Buffer.from(encryptedData.slice(10), 'base64');

    // Extract components
    const salt = data.subarray(0, 32);
    const iv = data.subarray(32, 32 + IV_LENGTH);
    const authTag = data.subarray(32 + IV_LENGTH, 32 + IV_LENGTH + AUTH_TAG_LENGTH);
    const encrypted = data.subarray(32 + IV_LENGTH + AUTH_TAG_LENGTH);

    // Derive key from password
    const key = scryptSync(password, salt, 32);

    // Create decipher
    const decipher = createDecipheriv(ENCRYPTION_ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);

    // Decrypt
    let decrypted = decipher.update(encrypted, undefined, 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
  }

  /**
   * Compute SHA-256 hash
   */
  static hash(data: string): string {
    return createHash('sha256').update(data, 'utf8').digest('hex');
  }

  /**
   * Validate DNA structure and content
   */
  static validate(dna: AgentDNA): DNAValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Version check
    if (!dna.dna_version) {
      errors.push('Missing dna_version field');
    } else if (dna.dna_version !== DNA_VERSION) {
      warnings.push(`DNA version ${dna.dna_version} differs from current version ${DNA_VERSION}`);
    }

    // Required fields
    if (!dna.id) errors.push('Missing id field');
    if (!dna.creator) errors.push('Missing creator field');
    if (!dna.metadata) errors.push('Missing metadata field');
    if (!dna.config) errors.push('Missing config field');
    if (!dna.constraints) errors.push('Missing constraints field');

    // Metadata validation
    if (dna.metadata) {
      if (!dna.metadata.name) errors.push('Missing metadata.name');
      if (!dna.metadata.description) errors.push('Missing metadata.description');
      if (!dna.metadata.version) errors.push('Missing metadata.version');
      if (!dna.metadata.license) errors.push('Missing metadata.license');

      // Version format (basic semver check)
      if (dna.metadata.version && !/^\d+\.\d+\.\d+/.test(dna.metadata.version)) {
        errors.push('metadata.version must follow semver format (x.y.z)');
      }
    }

    // Config validation
    if (dna.config) {
      if (!dna.config.systemPrompt) errors.push('Missing config.systemPrompt');
      if (!dna.config.role) errors.push('Missing config.role');
      if (!Array.isArray(dna.config.capabilities)) {
        errors.push('config.capabilities must be an array');
      }
    }

    // Constraints validation
    if (dna.constraints) {
      if (typeof dna.constraints.requiresTools !== 'boolean') {
        errors.push('constraints.requiresTools must be a boolean');
      }
      if (dna.constraints.sandboxLevel &&
          !['strict', 'standard', 'relaxed'].includes(dna.constraints.sandboxLevel)) {
        errors.push('constraints.sandboxLevel must be strict, standard, or relaxed');
      }
    }

    // Signature validation
    let signatureValid: boolean | undefined;
    if (dna.signature) {
      signatureValid = this.verifySignature(dna);
      if (!signatureValid) {
        errors.push('DNA signature verification failed');
      }
    }

    // Estimate resources
    const estimatedResources = {
      memory: '50MB', // Basic estimate
      tokens: dna.config?.llm?.maxTokens || 2000,
      cost: '$0.001 per message', // Rough estimate
    };

    const result: DNAValidationResult = {
      valid: errors.length === 0,
      errors,
      warnings,
      estimatedResources,
    };

    // Only include signatureValid if it was checked
    if (signatureValid !== undefined) {
      result.signatureValid = signatureValid;
    }

    return result;
  }

  /**
   * Migrate DNA to current version
   */
  static migrate(dna: AgentDNA): AgentDNA {
    // Future: Handle migration from older DNA versions
    // For now, just ensure current version
    return {
      ...dna,
      dna_version: DNA_VERSION,
    };
  }
}
