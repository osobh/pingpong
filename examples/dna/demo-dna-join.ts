/**
 * DNA Remote Join Demo
 *
 * This script demonstrates how to use Agent DNA to join a remote room.
 * It shows both trial mode (ephemeral) and permanent mode joining.
 */

import WebSocket from 'ws';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configuration
const SERVER_URL = process.env['SERVER_URL'] || 'ws://localhost:8080';
const ROOM_ID = process.env['ROOM_ID'] || 'default';
const MODE = (process.env['MODE'] || 'trial') as 'trial' | 'permanent';
const DNA_FILE = process.argv[2] || 'architect-agent.json';

console.log('🧬 DNA Remote Join Demo');
console.log('======================\n');
console.log(`Server: ${SERVER_URL}`);
console.log(`Room: ${ROOM_ID}`);
console.log(`Mode: ${MODE}`);
console.log(`DNA File: ${DNA_FILE}\n`);

// Load DNA file
const dnaPath = path.join(__dirname, DNA_FILE);
if (!fs.existsSync(dnaPath)) {
  console.error(`❌ Error: DNA file not found: ${dnaPath}`);
  console.error(`\nAvailable DNA files:`);
  const files = fs.readdirSync(__dirname).filter(f => f.endsWith('.json'));
  files.forEach(f => console.error(`  - ${f}`));
  process.exit(1);
}

const dna = JSON.parse(fs.readFileSync(dnaPath, 'utf8'));
console.log(`✓ Loaded DNA: ${dna.metadata.name}`);
console.log(`  Version: ${dna.metadata.version}`);
console.log(`  Creator: ${dna.creator.name}`);
console.log(`  Capabilities: ${dna.config.capabilities.join(', ')}\n`);

// Connect to server
console.log(`Connecting to ${SERVER_URL}...`);
const ws = new WebSocket(SERVER_URL);

ws.on('open', () => {
  console.log('✓ Connected to server\n');

  // Send JOIN_WITH_DNA command
  console.log(`Sending JOIN_WITH_DNA command (mode: ${MODE})...`);
  ws.send(JSON.stringify({
    type: 'JOIN_WITH_DNA',
    dna,
    roomId: ROOM_ID,
    mode: MODE,
    timestamp: Date.now(),
  }));
});

ws.on('message', (data) => {
  try {
    const event = JSON.parse(data.toString());
    handleEvent(event);
  } catch (error) {
    console.error('Error parsing message:', error);
  }
});

ws.on('error', (error) => {
  console.error('❌ WebSocket error:', error.message);
  process.exit(1);
});

ws.on('close', () => {
  console.log('\n👋 Connection closed');
  process.exit(0);
});

function handleEvent(event: any) {
  switch (event.type) {
    case 'WELCOME':
      console.log(`\n📩 WELCOME Event`);
      console.log(`  Room: ${event.roomId}`);
      console.log(`  Topic: ${event.topic}`);
      console.log(`  Mode: ${event.mode}`);
      console.log(`  Agents in room: ${event.agentCount}`);
      break;

    case 'DNA_APPROVED':
      console.log(`\n✅ DNA APPROVED!`);
      console.log(`  Request ID: ${event.requestId}`);
      console.log(`  Agent ID: ${event.agentId}`);
      console.log(`  Agent Name: ${event.agentName}`);
      console.log(`  Mode: ${event.mode}`);
      console.log(`  Approved by: ${event.approvedBy}`);

      if (event.mode === 'trial') {
        console.log(`\n⏱️  Trial mode: Agent will expire after 1 hour`);
      } else {
        console.log(`\n💾 Permanent mode: Agent saved to library`);
      }
      break;

    case 'AGENT_JOINED_DNA':
      console.log(`\n🎉 AGENT JOINED!`);
      console.log(`  Agent: ${event.agentName} (${event.role})`);
      console.log(`  DNA Version: ${event.dnaVersion}`);
      console.log(`  Creator: ${event.creator}`);
      console.log(`\n✓ Successfully joined room "${ROOM_ID}"`);
      console.log(`\nAgent is now participating in the discussion!`);

      // Close connection after successful join
      setTimeout(() => {
        ws.close();
      }, 1000);
      break;

    case 'DNA_REVIEW_REQUEST':
      console.log(`\n⏳ DNA REVIEW REQUESTED`);
      console.log(`  Request ID: ${event.requestId}`);
      console.log(`  Waiting for admin approval...`);
      console.log(`\n  Use DNA_APPROVE command to approve this request`);
      break;

    case 'DNA_REJECTED':
      console.log(`\n❌ DNA REJECTED`);
      console.log(`  Request ID: ${event.requestId}`);
      console.log(`  Reason: ${event.reason}`);
      console.log(`  Rejected by: ${event.rejectedBy}`);
      ws.close();
      break;

    case 'ERROR':
      console.error(`\n❌ ERROR: ${event.message}`);
      ws.close();
      break;

    case 'AGENT_JOINED':
      console.log(`\n👤 Another agent joined: ${event.agentName} (${event.role})`);
      break;

    case 'MESSAGE':
      // Ignore messages for this demo
      break;

    default:
      console.log(`\n📨 ${event.type}:`, JSON.stringify(event, null, 2));
  }
}

// Handle Ctrl+C
process.on('SIGINT', () => {
  console.log('\n\n👋 Disconnecting...');
  ws.close();
  process.exit(0);
});
