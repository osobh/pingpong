/**
 * Unit tests for DNA Serializer
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { DNASerializer } from '../../shared/dna-serializer.js';
import type { AgentDNA } from '../../shared/agent-dna.js';
import { AgentCapability } from '../../shared/agent-metadata.js';
import { DNA_VERSION } from '../../shared/agent-dna.js';

describe('DNASerializer', () => {
  let sampleDNA: AgentDNA;

  beforeEach(() => {
    sampleDNA = {
      dna_version: DNA_VERSION,
      id: 'test-agent-1',
      creator: {
        name: 'Test Creator',
        email: 'test@example.com',
      },
      metadata: {
        name: 'Test Agent',
        description: 'A test agent for unit testing',
        version: '1.0.0',
        tags: ['test', 'example'],
        license: 'MIT',
        visibility: 'public',
      },
      config: {
        systemPrompt: 'You are a helpful test agent.',
        role: 'participant',
        capabilities: [AgentCapability.VOTE],
        llm: {
          modelPreference: 'llama3',
          temperature: 0.7,
        },
      },
      constraints: {
        requiresTools: false,
        sandboxLevel: 'standard',
      },
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
  });

  describe('serialize', () => {
    it('should serialize DNA to JSON string', () => {
      const json = DNASerializer.serialize(sampleDNA);
      expect(json).toBeTypeOf('string');
      expect(json.length).toBeGreaterThan(0);
    });

    it('should serialize DNA with pretty formatting by default', () => {
      const json = DNASerializer.serialize(sampleDNA);
      expect(json).toContain('\n');
      expect(json).toContain('  ');
    });

    it('should serialize DNA without pretty formatting when disabled', () => {
      const json = DNASerializer.serialize(sampleDNA, { pretty: false });
      expect(json).not.toContain('\n  ');
    });

    it('should exclude signature when includeSignature is false', () => {
      const signedDNA = { ...sampleDNA, signature: { algorithm: 'ed25519' as const, publicKey: 'test', signature: 'test', timestamp: Date.now(), contentHash: 'test' } };
      const json = DNASerializer.serialize(signedDNA, { includeSignature: false });
      expect(json).not.toContain('signature');
    });

    it('should exclude stats when includeStats is false', () => {
      const dnaWithStats = {
        ...sampleDNA,
        metadata: {
          ...sampleDNA.metadata,
          stats: { downloads: 100, rating: 4.5, ratingCount: 10, usageCount: 50 },
        },
      };
      const json = DNASerializer.serialize(dnaWithStats, { includeStats: false });
      expect(json).not.toContain('stats');
    });
  });

  describe('deserialize', () => {
    it('should deserialize JSON string to DNA', () => {
      const json = DNASerializer.serialize(sampleDNA);
      const dna = DNASerializer.deserialize(json);
      expect(dna).toBeDefined();
      expect(dna.id).toBe(sampleDNA.id);
      expect(dna.metadata.name).toBe(sampleDNA.metadata.name);
    });

    it('should throw error for invalid JSON', () => {
      expect(() => DNASerializer.deserialize('not valid json')).toThrow();
    });

    it('should throw error for missing required fields', () => {
      expect(() => DNASerializer.deserialize('{}')).toThrow('missing required fields');
    });
  });

  describe('export and import', () => {
    it('should export and import DNA without encryption', async () => {
      const exported = await DNASerializer.export(sampleDNA);
      const imported = await DNASerializer.import(exported);
      expect(imported.id).toBe(sampleDNA.id);
      expect(imported.metadata.name).toBe(sampleDNA.metadata.name);
    });

    it('should export and import DNA with encryption', async () => {
      const password = 'test-password-123';
      const exported = await DNASerializer.export(sampleDNA, {
        encrypt: true,
        password,
      });
      expect(exported).toContain('ENCRYPTED:');

      const imported = await DNASerializer.import(exported, { password });
      expect(imported.id).toBe(sampleDNA.id);
      expect(imported.metadata.name).toBe(sampleDNA.metadata.name);
    });

    it('should throw error when importing encrypted DNA without password', async () => {
      const password = 'test-password-123';
      const exported = await DNASerializer.export(sampleDNA, {
        encrypt: true,
        password,
      });

      await expect(DNASerializer.import(exported)).rejects.toThrow('Password required');
    });

    it('should throw error when importing encrypted DNA with wrong password', async () => {
      const exported = await DNASerializer.export(sampleDNA, {
        encrypt: true,
        password: 'correct-password',
      });

      await expect(DNASerializer.import(exported, { password: 'wrong-password' })).rejects.toThrow();
    });
  });

  describe('signing', () => {
    it('should generate Ed25519 key pair', () => {
      const { privateKey, publicKey } = DNASerializer.generateKeyPair();
      expect(privateKey).toBeDefined();
      expect(publicKey).toBeDefined();
      expect(privateKey).toContain('BEGIN PRIVATE KEY');
      expect(publicKey).toContain('BEGIN PUBLIC KEY');
    });

    it('should sign DNA with Ed25519', () => {
      const { privateKey, publicKey } = DNASerializer.generateKeyPair();
      const dnaWithPublicKey = {
        ...sampleDNA,
        creator: { ...sampleDNA.creator, publicKey },
      };

      const signedDNA = DNASerializer.signDNA(dnaWithPublicKey, privateKey, 'ed25519');
      expect(signedDNA.signature).toBeDefined();
      expect(signedDNA.signature!.algorithm).toBe('ed25519');
      expect(signedDNA.signature!.signature).toBeDefined();
      expect(signedDNA.signature!.contentHash).toBeDefined();
    });

    it('should verify valid signature', () => {
      const { privateKey, publicKey } = DNASerializer.generateKeyPair();
      const dnaWithPublicKey = {
        ...sampleDNA,
        creator: { ...sampleDNA.creator, publicKey },
      };

      const signedDNA = DNASerializer.signDNA(dnaWithPublicKey, privateKey);
      const valid = DNASerializer.verifySignature(signedDNA);
      expect(valid).toBe(true);
    });

    it('should fail verification for tampered DNA', () => {
      const { privateKey, publicKey } = DNASerializer.generateKeyPair();
      const dnaWithPublicKey = {
        ...sampleDNA,
        creator: { ...sampleDNA.creator, publicKey },
      };

      const signedDNA = DNASerializer.signDNA(dnaWithPublicKey, privateKey);

      // Tamper with DNA
      signedDNA.metadata.description = 'Tampered description';

      const valid = DNASerializer.verifySignature(signedDNA);
      expect(valid).toBe(false);
    });

    it('should fail verification for DNA without signature', () => {
      const valid = DNASerializer.verifySignature(sampleDNA);
      expect(valid).toBe(false);
    });
  });

  describe('encryption', () => {
    it('should encrypt and decrypt data', () => {
      const password = 'test-password-123';
      const data = 'sensitive data here';

      const encrypted = DNASerializer.encrypt(data, password);
      expect(encrypted).toContain('ENCRYPTED:');
      expect(encrypted).not.toContain(data);

      const decrypted = DNASerializer.decrypt(encrypted, password);
      expect(decrypted).toBe(data);
    });

    it('should fail decryption with wrong password', () => {
      const data = 'sensitive data';
      const encrypted = DNASerializer.encrypt(data, 'correct-password');

      expect(() => DNASerializer.decrypt(encrypted, 'wrong-password')).toThrow();
    });

    it('should fail decryption of non-encrypted data', () => {
      expect(() => DNASerializer.decrypt('not encrypted', 'password')).toThrow('Invalid encrypted data format');
    });
  });

  describe('password hashing', () => {
    it('should hash password with bcrypt', async () => {
      const password = 'test-password-123';
      const hash = await DNASerializer.hashPassword(password);
      expect(hash).toBeDefined();
      expect(hash).not.toBe(password);
      expect(hash.length).toBeGreaterThan(20);
    });

    it('should verify correct password', async () => {
      const password = 'test-password-123';
      const hash = await DNASerializer.hashPassword(password);
      const valid = await DNASerializer.verifyPassword(password, hash);
      expect(valid).toBe(true);
    });

    it('should reject incorrect password', async () => {
      const hash = await DNASerializer.hashPassword('correct-password');
      const valid = await DNASerializer.verifyPassword('wrong-password', hash);
      expect(valid).toBe(false);
    });
  });

  describe('hashing', () => {
    it('should compute SHA-256 hash', () => {
      const data = 'test data';
      const hash = DNASerializer.hash(data);
      expect(hash).toBeDefined();
      expect(hash).toHaveLength(64); // SHA-256 produces 64 hex characters
      expect(hash).toMatch(/^[a-f0-9]{64}$/);
    });

    it('should produce same hash for same data', () => {
      const data = 'test data';
      const hash1 = DNASerializer.hash(data);
      const hash2 = DNASerializer.hash(data);
      expect(hash1).toBe(hash2);
    });

    it('should produce different hash for different data', () => {
      const hash1 = DNASerializer.hash('data1');
      const hash2 = DNASerializer.hash('data2');
      expect(hash1).not.toBe(hash2);
    });
  });

  describe('validate', () => {
    it('should validate valid DNA', () => {
      const result = DNASerializer.validate(sampleDNA);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should detect missing required fields', () => {
      const invalidDNA = { ...sampleDNA, id: undefined } as any;
      const result = DNASerializer.validate(invalidDNA);
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors.some(e => e.includes('id'))).toBe(true);
    });

    it('should detect invalid semver version', () => {
      const invalidDNA = {
        ...sampleDNA,
        metadata: { ...sampleDNA.metadata, version: 'not-semver' },
      };
      const result = DNASerializer.validate(invalidDNA);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('semver'))).toBe(true);
    });

    it('should detect invalid sandbox level', () => {
      const invalidDNA = {
        ...sampleDNA,
        constraints: { ...sampleDNA.constraints, sandboxLevel: 'invalid' as any },
      };
      const result = DNASerializer.validate(invalidDNA);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('sandboxLevel'))).toBe(true);
    });

    it('should detect missing config.systemPrompt', () => {
      const invalidDNA = {
        ...sampleDNA,
        config: { ...sampleDNA.config, systemPrompt: undefined as any },
      };
      const result = DNASerializer.validate(invalidDNA);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('systemPrompt'))).toBe(true);
    });

    it('should warn about DNA version mismatch', () => {
      const oldDNA = { ...sampleDNA, dna_version: '0.9.0' };
      const result = DNASerializer.validate(oldDNA);
      expect(result.warnings.length).toBeGreaterThan(0);
      expect(result.warnings.some(w => w.includes('version'))).toBe(true);
    });

    it('should include estimated resources', () => {
      const result = DNASerializer.validate(sampleDNA);
      expect(result.estimatedResources).toBeDefined();
      expect(result.estimatedResources!.memory).toBeDefined();
      expect(result.estimatedResources!.tokens).toBeDefined();
    });

    it('should verify signature if present', () => {
      const { privateKey, publicKey } = DNASerializer.generateKeyPair();
      const dnaWithPublicKey = {
        ...sampleDNA,
        creator: { ...sampleDNA.creator, publicKey },
      };
      const signedDNA = DNASerializer.signDNA(dnaWithPublicKey, privateKey);

      const result = DNASerializer.validate(signedDNA);
      expect(result.signatureValid).toBe(true);
    });
  });

  describe('migrate', () => {
    it('should update DNA version to current', () => {
      const oldDNA = { ...sampleDNA, dna_version: '0.9.0' };
      const migrated = DNASerializer.migrate(oldDNA);
      expect(migrated.dna_version).toBe(DNA_VERSION);
    });

    it('should preserve all other fields', () => {
      const migrated = DNASerializer.migrate(sampleDNA);
      expect(migrated.id).toBe(sampleDNA.id);
      expect(migrated.metadata).toEqual(sampleDNA.metadata);
      expect(migrated.config).toEqual(sampleDNA.config);
    });
  });
});
