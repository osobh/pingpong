#!/usr/bin/env node
/**
 * PingPong Agent CLI
 * Entry point for running an autonomous agent
 */

import { AgentRuntime } from './runtime.js';
import { AgentRole } from '../shared/types.js';

/**
 * Parse command line arguments
 */
function parseArgs(): {
  agentId: string;
  agentName: string;
  role: AgentRole;
  serverUrl: string;
  ollamaHost: string;
  ollamaModel: string;
} {
  const args = process.argv.slice(2);

  // Default values
  const defaults = {
    serverUrl: 'ws://localhost:8080',
    ollamaHost: process.env['OLLAMA_HOST'] || 'http://192.168.1.4:11434',
    ollamaModel: process.env['OLLAMA_MODEL'] || 'deepseek-r1:latest',
  };

  // Parse arguments
  let agentId = '';
  let agentName = '';
  let role: AgentRole = 'architect';
  let serverUrl = defaults.serverUrl;
  let ollamaHost = defaults.ollamaHost;
  let ollamaModel = defaults.ollamaModel;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    const nextArg = args[i + 1];

    switch (arg) {
      case '--id':
        if (nextArg) agentId = nextArg;
        i++;
        break;
      case '--name':
        if (nextArg) agentName = nextArg;
        i++;
        break;
      case '--role':
        const validRoles: AgentRole[] = ['architect', 'critic', 'pragmatist', 'moderator', 'participant'];
        if (nextArg && validRoles.includes(nextArg as AgentRole)) {
          role = nextArg as AgentRole;
        }
        i++;
        break;
      case '--server':
        if (nextArg) serverUrl = nextArg;
        i++;
        break;
      case '--ollama-host':
        if (nextArg) ollamaHost = nextArg;
        i++;
        break;
      case '--ollama-model':
        if (nextArg) ollamaModel = nextArg;
        i++;
        break;
      case '--help':
      case '-h':
        printHelp();
        process.exit(0);
    }
  }

  // Validate required arguments
  if (!agentId || !agentName) {
    console.error('Error: --id and --name are required\n');
    printHelp();
    process.exit(1);
  }

  return {
    agentId,
    agentName,
    role,
    serverUrl,
    ollamaHost,
    ollamaModel,
  };
}

/**
 * Print help message
 */
function printHelp(): void {
  console.log(`
PingPong Agent CLI

Usage: node agent/index.js [options]

Required Options:
  --id <id>              Unique agent ID
  --name <name>          Agent name

Optional Options:
  --role <role>          Agent role: architect, critic, pragmatist, moderator, participant (default: architect)
  --server <url>         WebSocket server URL (default: ws://localhost:8080)
  --ollama-host <url>    Ollama host URL (default: http://192.168.1.4:11434)
  --ollama-model <model> Ollama model name (default: deepseek-r1:latest)
  -h, --help            Show this help message

Environment Variables:
  OLLAMA_HOST           Ollama host URL (overridden by --ollama-host)
  OLLAMA_MODEL          Ollama model name (overridden by --ollama-model)

Examples:
  node agent/index.js --id alice-1 --name Alice --role architect
  node agent/index.js --id bob-1 --name Bob --role critic --server ws://localhost:9000
`);
}

/**
 * Main entry point
 */
async function main(): Promise<void> {
  const config = parseArgs();

  console.log(`🤖 Starting PingPong Agent`);
  console.log(`   ID: ${config.agentId}`);
  console.log(`   Name: ${config.agentName}`);
  console.log(`   Role: ${config.role}`);
  console.log(`   Server: ${config.serverUrl}`);
  console.log(`   Ollama: ${config.ollamaHost} (${config.ollamaModel})\n`);

  // Create runtime
  const runtime = new AgentRuntime(config);

  // Set up event handlers
  runtime.on('messageSent', (message: string) => {
    console.log(`[${config.agentName}] Sent: ${message}\n`);
  });

  runtime.on('messageReceived', (message: string) => {
    console.log(`[${config.agentName}] Received: ${message}\n`);
  });

  runtime.on('agentJoined', (name: string) => {
    console.log(`[${config.agentName}] Agent joined: ${name}`);
  });

  runtime.on('agentLeft', (name: string) => {
    console.log(`[${config.agentName}] Agent left: ${name}`);
  });

  runtime.on('error', (error: Error) => {
    console.error(`[${config.agentName}] Error: ${error.message}`);
  });

  // Graceful shutdown handler
  const shutdown = async () => {
    console.log(`\n\n👋 Shutting down ${config.agentName}...`);
    await runtime.stop();
    console.log('Agent stopped');
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  // Start the runtime
  console.log(`Connecting to server...\n`);
  const connected = await runtime.start();

  if (!connected) {
    console.error(`Failed to connect to server at ${config.serverUrl}`);
    process.exit(1);
  }

  console.log(`✅ Connected! Listening for messages...\n`);
}

// Run main if this is the entry point
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

export { main };
