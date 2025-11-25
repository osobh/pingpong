#!/usr/bin/env node
/**
 * DNA CLI - Command-line interface for Agent DNA operations
 *
 * Commands:
 * - pingpong dna save     - Export running agent to DNA
 * - pingpong dna load     - Import DNA and run agent
 * - pingpong dna list     - List local DNA library
 * - pingpong dna info     - Show DNA details
 * - pingpong dna delete   - Remove from library
 * - pingpong dna export   - Export to shareable file
 * - pingpong dna import   - Import DNA file
 * - pingpong dna sign     - Sign DNA with private key
 * - pingpong dna verify   - Verify DNA signature
 */

import { Command } from 'commander';
import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import { DNAManager } from './dna-manager.js';
import { DNASerializer } from '../shared/dna-serializer.js';

const program = new Command();

program
  .name('pingpong dna')
  .description('Agent DNA management commands')
  .version('1.0.0');

/**
 * Save running agent to DNA
 */
program
  .command('save')
  .description('Export running agent configuration to DNA file')
  .requiredOption('--agent-id <id>', 'Agent ID to save')
  .option('--version <version>', 'Version number (semver)', '1.0.0')
  .option('--description <text>', 'Agent description')
  .option('--tags <tags>', 'Comma-separated tags', (val) => val.split(','))
  .option('--license <license>', 'License identifier (SPDX)', 'MIT')
  .option('--visibility <vis>', 'Visibility: public, private, unlisted', 'public')
  .option('--encrypt', 'Encrypt DNA with password', false)
  .option('--password <pass>', 'Password for encryption')
  .action(async (options) => {
    try {
      // TODO: This would connect to running agent to extract config
      // For now, we'll create a sample DNA
      console.log('Saving agent DNA...');
      console.log(`Agent ID: ${options.agentId}`);
      console.log(`Version: ${options.version}`);

      // In real implementation, this would extract from AgentRuntime
      throw new Error('Not implemented: Need to connect to running agent to extract config');

    } catch (error) {
      console.error('Error:', error instanceof Error ? error.message : 'Unknown error');
      process.exit(1);
    }
  });

/**
 * Load DNA and run agent
 */
program
  .command('load')
  .description('Load DNA from library and spawn agent')
  .requiredOption('--id <id>', 'DNA ID to load')
  .option('--version <version>', 'Specific version to load (default: latest)')
  .option('--server <url>', 'WebSocket server URL', 'ws://localhost:8080')
  .option('--password <pass>', 'Password for encrypted DNA')
  .action(async (options) => {
    try {
      console.log(`Loading DNA: ${options.id}${options.version ? ` v${options.version}` : ' (latest)'}...`);

      const dna = await DNAManager.load(options.id, options.version, options.password);

      console.log(`\nLoaded: ${dna.metadata.name} v${dna.metadata.version}`);
      console.log(`Role: ${dna.config.role}`);
      console.log(`Description: ${dna.metadata.description}`);

      // TODO: Spawn agent from DNA
      console.log('\nTo spawn agent, use:');
      console.log(`  node dist/agent/index.js --id ${dna.id} --name "${dna.metadata.name}" --role ${dna.config.role} --server ${options.server}`);

    } catch (error) {
      console.error('Error:', error instanceof Error ? error.message : 'Unknown error');
      process.exit(1);
    }
  });

/**
 * List DNA in library
 */
program
  .command('list')
  .description('List all DNA in local library')
  .option('--tags <tags>', 'Filter by tags (comma-separated)', (val) => val.split(','))
  .option('--role <role>', 'Filter by role')
  .option('--visibility <vis>', 'Filter by visibility')
  .option('--json', 'Output as JSON', false)
  .action(async (options) => {
    try {
      const filters: any = {};
      if (options.tags) filters.tags = options.tags;
      if (options.role) filters.role = options.role;
      if (options.visibility) filters.visibility = options.visibility;

      const entries = await DNAManager.list(filters);

      if (options.json) {
        console.log(JSON.stringify(entries, null, 2));
        return;
      }

      if (entries.length === 0) {
        console.log('No DNA found in library.');
        return;
      }

      console.log(`\nFound ${entries.length} agent(s):\n`);

      for (const entry of entries) {
        const encrypted = entry.encrypted ? ' 🔒' : '';
        const visibility = entry.visibility === 'private' ? ' [PRIVATE]' : entry.visibility === 'unlisted' ? ' [UNLISTED]' : '';

        console.log(`${entry.name} v${entry.version}${encrypted}${visibility}`);
        console.log(`  ID: ${entry.id}`);
        console.log(`  Role: ${entry.role}`);
        console.log(`  Description: ${entry.description}`);
        if (entry.tags.length > 0) {
          console.log(`  Tags: ${entry.tags.join(', ')}`);
        }
        console.log(`  Updated: ${new Date(entry.updatedAt).toLocaleDateString()}`);
        console.log('');
      }

    } catch (error) {
      console.error('Error:', error instanceof Error ? error.message : 'Unknown error');
      process.exit(1);
    }
  });

/**
 * Show DNA info
 */
program
  .command('info')
  .description('Show detailed information about a DNA')
  .requiredOption('--id <id>', 'DNA ID')
  .option('--version <version>', 'Specific version (default: latest)')
  .option('--json', 'Output as JSON', false)
  .action(async (options) => {
    try {
      const entry = await DNAManager.info(options.id, options.version);

      if (!entry) {
        console.error(`DNA not found: ${options.id}`);
        process.exit(1);
      }

      if (options.json) {
        console.log(JSON.stringify(entry, null, 2));
        return;
      }

      console.log(`\n${entry.name} v${entry.version}`);
      console.log('='.repeat(50));
      console.log(`ID: ${entry.id}`);
      console.log(`Role: ${entry.role}`);
      console.log(`Visibility: ${entry.visibility}`);
      console.log(`Encrypted: ${entry.encrypted ? 'Yes 🔒' : 'No'}`);
      console.log(`\nDescription:\n${entry.description}`);
      if (entry.tags.length > 0) {
        console.log(`\nTags: ${entry.tags.join(', ')}`);
      }
      console.log(`\nCreated: ${new Date(entry.createdAt).toLocaleString()}`);
      console.log(`Updated: ${new Date(entry.updatedAt).toLocaleString()}`);
      console.log('');

    } catch (error) {
      console.error('Error:', error instanceof Error ? error.message : 'Unknown error');
      process.exit(1);
    }
  });

/**
 * Delete DNA
 */
program
  .command('delete')
  .description('Delete DNA from local library')
  .requiredOption('--id <id>', 'DNA ID to delete')
  .option('--version <version>', 'Specific version (default: all versions)')
  .option('--force', 'Skip confirmation', false)
  .action(async (options) => {
    try {
      const entry = await DNAManager.info(options.id, options.version);

      if (!entry) {
        console.error(`DNA not found: ${options.id}`);
        process.exit(1);
      }

      if (!options.force) {
        console.log(`\nAbout to delete: ${entry.name} v${entry.version}`);
        console.log('This action cannot be undone.');
        console.log('\nUse --force to confirm deletion');
        process.exit(1);
      }

      await DNAManager.delete(options.id, options.version);
      console.log(`Deleted: ${entry.name} v${entry.version}`);

    } catch (error) {
      console.error('Error:', error instanceof Error ? error.message : 'Unknown error');
      process.exit(1);
    }
  });

/**
 * Export DNA to file
 */
program
  .command('export')
  .description('Export DNA to shareable file')
  .requiredOption('--id <id>', 'DNA ID to export')
  .option('--version <version>', 'Specific version (default: latest)')
  .requiredOption('--output <file>', 'Output file path')
  .option('--encrypt', 'Encrypt exported file', false)
  .option('--password <pass>', 'Password for encryption')
  .option('--no-signature', 'Exclude signature from export')
  .option('--no-stats', 'Exclude statistics from export')
  .action(async (options) => {
    try {
      console.log(`Exporting DNA: ${options.id}...`);

      await DNAManager.exportToFile(options.id, options.version, options.output, {
        encrypt: options.encrypt,
        password: options.password,
        includeSignature: options.signature !== false,
        includeStats: options.stats !== false,
        pretty: true,
      });

      console.log(`Exported to: ${options.output}`);

      const stats = await fs.stat(options.output);
      console.log(`File size: ${(stats.size / 1024).toFixed(2)} KB`);

    } catch (error) {
      console.error('Error:', error instanceof Error ? error.message : 'Unknown error');
      process.exit(1);
    }
  });

/**
 * Import DNA from file
 */
program
  .command('import')
  .description('Import DNA from file to local library')
  .requiredOption('--file <path>', 'DNA file to import')
  .option('--password <pass>', 'Password for encrypted files')
  .option('--mode <mode>', 'Import mode: trial or permanent', 'permanent')
  .option('--overwrite', 'Overwrite existing DNA', false)
  .action(async (options) => {
    try {
      console.log(`Importing DNA from: ${options.file}...`);

      const dna = await DNAManager.importFromFile(options.file, {
        password: options.password,
        mode: options.mode as 'trial' | 'permanent',
        overwrite: options.overwrite,
        verifySignature: true,
      });

      console.log(`\nImported: ${dna.metadata.name} v${dna.metadata.version}`);
      console.log(`ID: ${dna.id}`);
      console.log(`Role: ${dna.config.role}`);
      console.log(`Description: ${dna.metadata.description}`);

      if (dna.signature) {
        console.log(`\n✓ Signature verified`);
        console.log(`  Creator: ${dna.creator.name}`);
      }

    } catch (error) {
      console.error('Error:', error instanceof Error ? error.message : 'Unknown error');
      process.exit(1);
    }
  });

/**
 * Sign DNA
 */
program
  .command('sign')
  .description('Sign DNA with private key')
  .requiredOption('--id <id>', 'DNA ID to sign')
  .option('--version <version>', 'Specific version (default: latest)')
  .requiredOption('--private-key <path>', 'Path to private key (PEM format)')
  .option('--algorithm <alg>', 'Signature algorithm: ed25519 or rsa-sha256', 'ed25519')
  .action(async (options) => {
    try {
      console.log(`Signing DNA: ${options.id}...`);

      // Load DNA
      const dna = await DNAManager.load(options.id, options.version);

      // Load private key
      const privateKeyPEM = await fs.readFile(options.privateKey, 'utf8');

      // Sign DNA
      const signedDNA = DNASerializer.signDNA(dna, privateKeyPEM, options.algorithm);

      // Save back to library
      await DNAManager.save(signedDNA);

      console.log(`\n✓ DNA signed successfully`);
      console.log(`  Algorithm: ${signedDNA.signature!.algorithm}`);
      console.log(`  Content hash: ${signedDNA.signature!.contentHash.slice(0, 16)}...`);
      console.log(`  Timestamp: ${new Date(signedDNA.signature!.timestamp).toLocaleString()}`);

    } catch (error) {
      console.error('Error:', error instanceof Error ? error.message : 'Unknown error');
      process.exit(1);
    }
  });

/**
 * Verify DNA signature
 */
program
  .command('verify')
  .description('Verify DNA signature')
  .requiredOption('--file <path>', 'DNA file to verify')
  .option('--password <pass>', 'Password for encrypted files')
  .action(async (options) => {
    try {
      console.log(`Verifying DNA: ${options.file}...`);

      const fileContent = await fs.readFile(options.file, 'utf8');
      const dna = await DNASerializer.import(fileContent, {
        password: options.password,
        verifySignature: false, // We'll verify manually
      });

      if (!dna.signature) {
        console.log('\n⚠ DNA is not signed');
        process.exit(1);
      }

      const valid = DNASerializer.verifySignature(dna);

      if (valid) {
        console.log('\n✓ Signature is VALID');
        console.log(`  Creator: ${dna.creator.name}`);
        console.log(`  Algorithm: ${dna.signature.algorithm}`);
        console.log(`  Signed: ${new Date(dna.signature.timestamp).toLocaleString()}`);
      } else {
        console.log('\n✗ Signature is INVALID');
        console.log('  This DNA may have been tampered with!');
        process.exit(1);
      }

    } catch (error) {
      console.error('Error:', error instanceof Error ? error.message : 'Unknown error');
      process.exit(1);
    }
  });

/**
 * Generate key pair for signing
 */
program
  .command('keygen')
  .description('Generate Ed25519 key pair for signing DNA')
  .requiredOption('--output <dir>', 'Output directory for keys')
  .action(async (options) => {
    try {
      console.log('Generating Ed25519 key pair...');

      const { privateKey, publicKey } = DNASerializer.generateKeyPair();

      // Save keys
      const privateKeyPath = join(options.output, 'private.pem');
      const publicKeyPath = join(options.output, 'public.pem');

      await fs.mkdir(options.output, { recursive: true });
      await fs.writeFile(privateKeyPath, privateKey, 'utf8');
      await fs.writeFile(publicKeyPath, publicKey, 'utf8');

      // Set restrictive permissions on private key
      await fs.chmod(privateKeyPath, 0o600);

      console.log(`\n✓ Key pair generated`);
      console.log(`  Private key: ${privateKeyPath}`);
      console.log(`  Public key: ${publicKeyPath}`);
      console.log('\n⚠ Keep your private key secure!');

    } catch (error) {
      console.error('Error:', error instanceof Error ? error.message : 'Unknown error');
      process.exit(1);
    }
  });

/**
 * Validate DNA
 */
program
  .command('validate')
  .description('Validate DNA structure and content')
  .requiredOption('--file <path>', 'DNA file to validate')
  .option('--password <pass>', 'Password for encrypted files')
  .action(async (options) => {
    try {
      console.log(`Validating DNA: ${options.file}...`);

      const fileContent = await fs.readFile(options.file, 'utf8');
      const dna = await DNASerializer.import(fileContent, {
        password: options.password,
        verifySignature: false,
      });

      const validation = DNASerializer.validate(dna);

      if (validation.valid) {
        console.log('\n✓ DNA is VALID');
      } else {
        console.log('\n✗ DNA has ERRORS:');
        validation.errors.forEach(err => console.log(`  - ${err}`));
      }

      if (validation.warnings.length > 0) {
        console.log('\n⚠ Warnings:');
        validation.warnings.forEach(warn => console.log(`  - ${warn}`));
      }

      if (validation.signatureValid !== undefined) {
        console.log(`\nSignature: ${validation.signatureValid ? '✓ Valid' : '✗ Invalid'}`);
      }

      if (validation.estimatedResources) {
        console.log('\nEstimated Resources:');
        console.log(`  Memory: ${validation.estimatedResources.memory}`);
        console.log(`  Tokens: ${validation.estimatedResources.tokens}`);
        console.log(`  Cost: ${validation.estimatedResources.cost}`);
      }

      process.exit(validation.valid ? 0 : 1);

    } catch (error) {
      console.error('Error:', error instanceof Error ? error.message : 'Unknown error');
      process.exit(1);
    }
  });

// Parse command line arguments
program.parse(process.argv);

// Show help if no command provided
if (!process.argv.slice(2).length) {
  program.outputHelp();
}
