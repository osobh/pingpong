/**
 * DNA Manager - Local storage and management for Agent DNA
 *
 * Manages local DNA library:
 * - Storage in ~/.pingpong/agents/
 * - Version management (semver)
 * - Index for fast searching
 * - Export/import operations
 * - Lifecycle management
 */

import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import type { AgentDNA, DNAExportOptions, DNAImportOptions } from '../shared/agent-dna.js';
import { DNASerializer } from '../shared/dna-serializer.js';

const DNA_HOME = join(homedir(), '.pingpong', 'agents');
const INDEX_FILE = join(DNA_HOME, 'index.json');

/**
 * DNA Index entry for fast lookups
 */
interface DNAIndexEntry {
  id: string;
  name: string;
  version: string;
  description: string;
  tags: string[];
  role: string;
  createdAt: number;
  updatedAt: number;
  path: string; // Relative to DNA_HOME
  visibility: 'public' | 'private' | 'unlisted';
  encrypted: boolean;
}

/**
 * DNA Index
 */
interface DNAIndex {
  version: string;
  lastUpdated: number;
  entries: DNAIndexEntry[];
}

/**
 * DNA Manager class
 */
export class DNAManager {
  private static index: DNAIndex | null = null;

  /**
   * Initialize DNA storage
   */
  static async initialize(): Promise<void> {
    // Create DNA home directory if it doesn't exist
    await fs.mkdir(DNA_HOME, { recursive: true });

    // Load or create index
    await this.loadIndex();
  }

  /**
   * Save agent DNA to local library
   */
  static async save(dna: AgentDNA, options: DNAExportOptions = {}): Promise<string> {
    await this.initialize();

    const { encrypt = false } = options;

    // Validate DNA
    const validation = DNASerializer.validate(dna);
    if (!validation.valid) {
      throw new Error(`Invalid DNA: ${validation.errors.join(', ')}`);
    }

    // Determine storage path
    const dnaPath = join(DNA_HOME, dna.id, dna.metadata.version);
    await fs.mkdir(dnaPath, { recursive: true });

    // Serialize DNA
    const dnaJson = await DNASerializer.export(dna, options);

    // Save DNA file
    const filename = encrypt ? 'agent.dna.encrypted' : 'agent.dna.json';
    const filepath = join(dnaPath, filename);
    await fs.writeFile(filepath, dnaJson, 'utf8');

    // Save metadata separately for quick access
    const metadataPath = join(dnaPath, 'metadata.json');
    await fs.writeFile(metadataPath, JSON.stringify({
      id: dna.id,
      name: dna.metadata.name,
      version: dna.metadata.version,
      description: dna.metadata.description,
      tags: dna.metadata.tags,
      role: dna.config.role,
      visibility: dna.metadata.visibility,
      encrypted: encrypt || false,
    }, null, 2), 'utf8');

    // Update index
    await this.updateIndex(dna, dnaPath, encrypt || false);

    return filepath;
  }

  /**
   * Load agent DNA from local library
   */
  static async load(id: string, version?: string, password?: string): Promise<AgentDNA> {
    await this.initialize();

    // Find DNA in index
    const entry = this.findInIndex(id, version);
    if (!entry) {
      throw new Error(`DNA not found: ${id}${version ? ` version ${version}` : ''}`);
    }

    // Read DNA file
    const filename = entry.encrypted ? 'agent.dna.encrypted' : 'agent.dna.json';
    const filepath = join(DNA_HOME, entry.path, filename);

    let dnaJson: string;
    try {
      dnaJson = await fs.readFile(filepath, 'utf8');
    } catch (error) {
      throw new Error(`Failed to read DNA file: ${filepath}`);
    }

    // Import DNA (handles decryption if needed)
    const importOptions: DNAImportOptions = { verifySignature: true };
    if (password !== undefined) {
      importOptions.password = password;
    }
    const dna = await DNASerializer.import(dnaJson, importOptions);

    return dna;
  }

  /**
   * List all DNA in local library
   */
  static async list(filters?: { tags?: string[]; role?: string; visibility?: string }): Promise<DNAIndexEntry[]> {
    await this.initialize();

    let entries = (await this.loadIndex()).entries;

    // Apply filters
    if (filters) {
      if (filters.tags && filters.tags.length > 0) {
        entries = entries.filter(e => filters.tags!.some(tag => e.tags.includes(tag)));
      }
      if (filters.role) {
        entries = entries.filter(e => e.role === filters.role);
      }
      if (filters.visibility) {
        entries = entries.filter(e => e.visibility === filters.visibility);
      }
    }

    // Sort by name
    return entries.sort((a, b) => a.name.localeCompare(b.name));
  }

  /**
   * Get DNA information without loading full DNA
   */
  static async info(id: string, version?: string): Promise<DNAIndexEntry | null> {
    await this.initialize();
    return this.findInIndex(id, version);
  }

  /**
   * Delete DNA from local library
   */
  static async delete(id: string, version?: string): Promise<void> {
    await this.initialize();

    const entry = this.findInIndex(id, version);
    if (!entry) {
      throw new Error(`DNA not found: ${id}${version ? ` version ${version}` : ''}`);
    }

    // Delete directory
    const dnaPath = join(DNA_HOME, entry.path);
    await fs.rm(dnaPath, { recursive: true, force: true });

    // Remove from index
    await this.removeFromIndex(id, version);
  }

  /**
   * Export DNA to shareable file
   */
  static async exportToFile(id: string, version: string | undefined, outputPath: string, options: DNAExportOptions = {}): Promise<void> {
    const dna = await this.load(id, version, options.password);
    const exported = await DNASerializer.export(dna, options);
    await fs.writeFile(outputPath, exported, 'utf8');
  }

  /**
   * Import DNA from file
   */
  static async importFromFile(filePath: string, options: DNAImportOptions = {}): Promise<AgentDNA> {
    const fileContent = await fs.readFile(filePath, 'utf8');
    const dna = await DNASerializer.import(fileContent, options);

    // Save to library if requested
    if (options.mode === 'permanent' || !options.mode) {
      const saveOptions: DNAExportOptions = {
        encrypt: fileContent.startsWith('ENCRYPTED:'),
      };
      if (options.password !== undefined) {
        saveOptions.password = options.password;
      }
      await this.save(dna, saveOptions);
    }

    return dna;
  }

  /**
   * List all versions of a DNA
   */
  static async listVersions(id: string): Promise<DNAIndexEntry[]> {
    await this.initialize();
    const index = await this.loadIndex();
    return index.entries
      .filter(e => e.id === id)
      .sort((a, b) => this.compareVersions(b.version, a.version)); // Newest first
  }

  /**
   * Get latest version of a DNA
   */
  static async getLatestVersion(id: string): Promise<string | null> {
    const versions = await this.listVersions(id);
    const latest = versions[0];
    return latest ? latest.version : null;
  }

  /**
   * Check if DNA exists
   */
  static async exists(id: string, version?: string): Promise<boolean> {
    await this.initialize();
    return this.findInIndex(id, version) !== null;
  }

  // Private methods

  /**
   * Load index from disk
   */
  private static async loadIndex(): Promise<DNAIndex> {
    if (this.index) {
      return this.index;
    }

    try {
      const indexJson = await fs.readFile(INDEX_FILE, 'utf8');
      this.index = JSON.parse(indexJson);
      return this.index!;
    } catch (error) {
      // Index doesn't exist, create new one
      this.index = {
        version: '1.0.0',
        lastUpdated: Date.now(),
        entries: [],
      };
      await this.saveIndex();
      return this.index;
    }
  }

  /**
   * Save index to disk
   */
  private static async saveIndex(): Promise<void> {
    if (!this.index) {
      return;
    }

    this.index.lastUpdated = Date.now();
    await fs.writeFile(INDEX_FILE, JSON.stringify(this.index, null, 2), 'utf8');
  }

  /**
   * Update index with new DNA entry
   */
  private static async updateIndex(dna: AgentDNA, dnaPath: string, encrypted: boolean): Promise<void> {
    const index = await this.loadIndex();

    // Remove existing entry for this version
    index.entries = index.entries.filter(
      e => !(e.id === dna.id && e.version === dna.metadata.version)
    );

    // Add new entry
    const relativePath = dnaPath.replace(DNA_HOME + '/', '');
    index.entries.push({
      id: dna.id,
      name: dna.metadata.name,
      version: dna.metadata.version,
      description: dna.metadata.description,
      tags: dna.metadata.tags,
      role: dna.config.role,
      createdAt: dna.createdAt,
      updatedAt: dna.updatedAt,
      path: relativePath,
      visibility: dna.metadata.visibility,
      encrypted,
    });

    await this.saveIndex();
  }

  /**
   * Remove entry from index
   */
  private static async removeFromIndex(id: string, version?: string): Promise<void> {
    const index = await this.loadIndex();

    if (version) {
      // Remove specific version
      index.entries = index.entries.filter(
        e => !(e.id === id && e.version === version)
      );
    } else {
      // Remove all versions
      index.entries = index.entries.filter(e => e.id !== id);
    }

    await this.saveIndex();
  }

  /**
   * Find DNA in index
   */
  private static findInIndex(id: string, version?: string): DNAIndexEntry | null {
    if (!this.index) {
      return null;
    }

    if (version) {
      // Find specific version
      const result = this.index.entries.find(e => e.id === id && e.version === version);
      return result ?? null;
    } else {
      // Find latest version
      const entries = this.index.entries
        .filter(e => e.id === id)
        .sort((a, b) => this.compareVersions(b.version, a.version));
      return entries[0] ?? null;
    }
  }

  /**
   * Compare semantic versions
   */
  private static compareVersions(v1: string, v2: string): number {
    const parts1 = v1.split('.').map(Number);
    const parts2 = v2.split('.').map(Number);

    for (let i = 0; i < Math.max(parts1.length, parts2.length); i++) {
      const p1 = parts1[i] || 0;
      const p2 = parts2[i] || 0;
      if (p1 > p2) return 1;
      if (p1 < p2) return -1;
    }

    return 0;
  }
}
