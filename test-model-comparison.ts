/**
 * Model Comparison Test for Memory Extraction
 *
 * Tests both DeepSeek-R1 and Qwen2.5 7B models
 */

import { MemoryExtractor } from './server/memory-extractor.js';
import type { MessageEvent } from './shared/protocol.js';

const ollamaHost = process.env['OLLAMA_HOST'] || 'http://192.168.1.4:11434';

// Test conversation about a technical decision
const testMessages: MessageEvent[] = [
  {
    type: 'MESSAGE',
    agentId: 'alice',
    agentName: 'Alice',
    role: 'architect',
    content: 'We need to decide on a database for our new microservice. What are our options?',
    timestamp: Date.now() - 50000,
  },
  {
    type: 'MESSAGE',
    agentId: 'bob',
    agentName: 'Bob',
    role: 'critic',
    content: 'The main options are PostgreSQL, MySQL, and MongoDB. PostgreSQL has the best support for complex queries.',
    timestamp: Date.now() - 40000,
  },
  {
    type: 'MESSAGE',
    agentId: 'charlie',
    agentName: 'Charlie',
    role: 'pragmatist',
    content: 'I agree with PostgreSQL. We already use it in production, so it reduces operational complexity.',
    timestamp: Date.now() - 30000,
  },
  {
    type: 'MESSAGE',
    agentId: 'alice',
    agentName: 'Alice',
    role: 'architect',
    content: 'Great point. PostgreSQL also has excellent JSON support for flexible schemas.',
    timestamp: Date.now() - 20000,
  },
  {
    type: 'MESSAGE',
    agentId: 'bob',
    agentName: 'Bob',
    role: 'critic',
    content: 'We should make sure to use connection pooling. That was an issue in our last service.',
    timestamp: Date.now() - 15000,
  },
  {
    type: 'MESSAGE',
    agentId: 'charlie',
    agentName: 'Charlie',
    role: 'pragmatist',
    content: 'Absolutely. We need to configure pgBouncer for connection pooling.',
    timestamp: Date.now() - 10000,
  },
  {
    type: 'MESSAGE',
    agentId: 'alice',
    agentName: 'Alice',
    role: 'architect',
    content: 'Okay, so we are decided: PostgreSQL with pgBouncer for connection pooling.',
    timestamp: Date.now() - 5000,
  },
  {
    type: 'MESSAGE',
    agentId: 'bob',
    agentName: 'Bob',
    role: 'critic',
    content: 'One question: should we use read replicas for scaling read operations?',
    timestamp: Date.now() - 3000,
  },
  {
    type: 'MESSAGE',
    agentId: 'charlie',
    agentName: 'Charlie',
    role: 'pragmatist',
    content: 'Good question. We should evaluate that after we see the actual load patterns.',
    timestamp: Date.now() - 2000,
  },
  {
    type: 'MESSAGE',
    agentId: 'alice',
    agentName: 'Alice',
    role: 'architect',
    content: 'Makes sense. Charlie, can you create a task to monitor database performance for the first month?',
    timestamp: Date.now() - 1000,
  },
];

async function testModel(modelName: string) {
  console.log(`\n${'='.repeat(70)}`);
  console.log(`Testing: ${modelName}`);
  console.log('='.repeat(70));

  const extractor = new MemoryExtractor({
    ollamaHost,
    model: modelName,
    minConfidence: 0.7,
  });

  try {
    const startTime = Date.now();
    const result = await extractor.extractFromMessages('test-room', testMessages);
    const duration = Date.now() - startTime;

    console.log(`\n✅ Extraction completed in ${(duration / 1000).toFixed(2)}s\n`);
    console.log(`📊 Results:`);
    console.log(`   Messages analyzed: ${result.messagesAnalyzed}`);
    console.log(`   Memories extracted: ${result.memories.length}`);
    console.log(`   Speed: ${(duration / 1000).toFixed(2)} seconds`);
    console.log();

    if (result.memories.length > 0) {
      console.log('🧠 Extracted Memories:');
      console.log('─'.repeat(70));

      const typeCount = {
        decision: 0,
        insight: 0,
        question: 0,
        action_item: 0,
      };

      for (const memory of result.memories) {
        typeCount[memory.type]++;
        console.log();
        console.log(`📌 ${memory.type.toUpperCase()} [Priority: ${memory.priority}] [Confidence: ${memory.confidence.toFixed(2)}]`);
        console.log(`   ${memory.content}`);
        if (memory.context) {
          console.log(`   Context: ${memory.context}`);
        }
        console.log(`   Tags: ${memory.tags.join(', ')}`);
      }

      console.log();
      console.log('─'.repeat(70));
      console.log();
      console.log('📈 Memory Type Breakdown:');
      console.log(`   Decisions: ${typeCount.decision}`);
      console.log(`   Insights: ${typeCount.insight}`);
      console.log(`   Questions: ${typeCount.question}`);
      console.log(`   Action Items: ${typeCount.action_item}`);

      return {
        model: modelName,
        duration,
        memories: result.memories,
        count: result.memories.length,
        typeCount,
      };
    } else {
      console.log('⚠️  No memories extracted');
      return {
        model: modelName,
        duration,
        memories: [],
        count: 0,
        typeCount: { decision: 0, insight: 0, question: 0, action_item: 0 },
      };
    }
  } catch (error) {
    console.error(`❌ Error during extraction:`, error);
    return null;
  }
}

async function compareModels() {
  console.log('🧪 Memory Extraction Model Comparison\n');
  console.log(`📡 Ollama Host: ${ollamaHost}\n`);
  console.log(`📝 Test Conversation: ${testMessages.length} messages about database selection\n`);

  const models = ['deepseek-r1:latest', 'qwen2.5:7b'];
  const results = [];

  for (const model of models) {
    const result = await testModel(model);
    if (result) {
      results.push(result);
    }
  }

  if (results.length === 2) {
    console.log('\n' + '='.repeat(70));
    console.log('🏆 COMPARISON SUMMARY');
    console.log('='.repeat(70));
    console.log();

    const r1 = results[0];
    const r2 = results[1];

    console.log('⚡ Speed:');
    console.log(`   ${r1.model}: ${(r1.duration / 1000).toFixed(2)}s`);
    console.log(`   ${r2.model}: ${(r2.duration / 1000).toFixed(2)}s`);
    const faster = r1.duration < r2.duration ? r1.model : r2.model;
    const speedup = Math.max(r1.duration, r2.duration) / Math.min(r1.duration, r2.duration);
    console.log(`   Winner: ${faster} (${speedup.toFixed(2)}x faster)`);
    console.log();

    console.log('📊 Quality:');
    console.log(`   ${r1.model}: ${r1.count} memories extracted`);
    console.log(`   ${r2.model}: ${r2.count} memories extracted`);
    console.log();

    console.log('📋 Type Coverage:');
    console.log(`   ${r1.model}:`);
    console.log(`      Decisions: ${r1.typeCount.decision}, Insights: ${r1.typeCount.insight}`);
    console.log(`      Questions: ${r1.typeCount.question}, Action Items: ${r1.typeCount.action_item}`);
    console.log(`   ${r2.model}:`);
    console.log(`      Decisions: ${r2.typeCount.decision}, Insights: ${r2.typeCount.insight}`);
    console.log(`      Questions: ${r2.typeCount.question}, Action Items: ${r2.typeCount.action_item}`);
    console.log();

    const r1Coverage = Object.values(r1.typeCount).filter(v => v > 0).length;
    const r2Coverage = Object.values(r2.typeCount).filter(v => v > 0).length;
    console.log('✅ Expected Coverage (all 4 types: decision, question, action_item, insight):');
    console.log(`   ${r1.model}: ${r1Coverage}/4 types covered`);
    console.log(`   ${r2.model}: ${r2Coverage}/4 types covered`);
    console.log();

    if (r1Coverage === 4 && r2Coverage === 4) {
      console.log('🎉 Both models extracted all expected memory types!');
    } else if (r1Coverage > r2Coverage) {
      console.log(`🏆 ${r1.model} has better type coverage`);
    } else if (r2Coverage > r1Coverage) {
      console.log(`🏆 ${r2.model} has better type coverage`);
    }

    console.log();
    console.log('💡 Recommendation:');
    if (r1Coverage === 4 && r2Coverage === 4) {
      if (r1.duration < r2.duration) {
        console.log(`   Use ${r1.model} - faster with complete coverage`);
      } else {
        console.log(`   Use ${r2.model} - faster with complete coverage`);
      }
    } else if (r1Coverage > r2Coverage) {
      console.log(`   Use ${r1.model} - better type coverage`);
    } else {
      console.log(`   Use ${r2.model} - better type coverage`);
    }
  }
}

// Run comparison
compareModels().catch(console.error);
