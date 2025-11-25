/**
 * Mock Search Tool
 *
 * Simulates codebase/document search for testing and demonstration.
 */

import { IToolHandler } from './tool-executor.js';
import { SearchToolConfig } from '../../shared/room-tools.js';

/**
 * Mock Codebase Files
 */
const MOCK_CODEBASE = [
  {
    path: 'src/server/room.ts',
    content: 'export class Room { private agents: Map<string, Agent>; async handleCommand(...) {...} }',
    language: 'typescript',
    lines: 450,
  },
  {
    path: 'src/server/room-manager.ts',
    content: 'export class RoomManager { private rooms: Map<string, Room>; createRoom(...) {...} }',
    language: 'typescript',
    lines: 120,
  },
  {
    path: 'src/agent/runtime.ts',
    content: 'export class AgentRuntime { private client: AgentClient; async run(...) {...} }',
    language: 'typescript',
    lines: 350,
  },
  {
    path: 'src/shared/protocol.ts',
    content: 'export const MessageSchema = z.object({ type: z.string(), content: z.string() });',
    language: 'typescript',
    lines: 280,
  },
  {
    path: 'docs/ARCHITECTURE.md',
    content: '# Architecture\n\nThe system consists of rooms, agents, and a message bus for communication.',
    language: 'markdown',
    lines: 150,
  },
  {
    path: 'docs/DNA_GUIDE.md',
    content: '# Agent DNA Guide\n\nAgent DNA allows portable agent configurations.',
    language: 'markdown',
    lines: 200,
  },
  {
    path: 'README.md',
    content: '# PingPong\n\nMulti-agent AI discussion platform for collaborative problem-solving.',
    language: 'markdown',
    lines: 80,
  },
  {
    path: 'src/server/proposal-repository.ts',
    content: 'export class ProposalRepository { saveProposal(...) {...} getProposalsByRoom(...) {...} }',
    language: 'typescript',
    lines: 250,
  },
  {
    path: 'src/agent/llm.ts',
    content: 'export class AgentLLM { async generateResponse(prompt: string): Promise<string> {...} }',
    language: 'typescript',
    lines: 180,
  },
  {
    path: 'tests/integration/conversation-flow.test.ts',
    content: 'describe("Conversation Flow", () => { it("should handle multi-agent discussion", ...) });',
    language: 'typescript',
    lines: 300,
  },
];

/**
 * Search Result
 */
interface SearchResult {
  path: string;
  language: string;
  lines: number;
  matchCount: number;
  excerpt: string;
  relevanceScore: number;
}

/**
 * Mock Search Tool Handler
 */
export class MockSearchToolHandler implements IToolHandler {
  /**
   * Execute mock search
   */
  async execute(
    config: unknown,
    parameters: Record<string, unknown>
  ): Promise<unknown> {
    const searchConfig = config as SearchToolConfig;
    const query = String(parameters['query'] || '').trim().toLowerCase();
    const fileType = parameters['fileType'] as string | undefined;

    if (!query) {
      throw new Error('Search query is required');
    }

    // Simulate search delay
    await this.delay(100 + Math.random() * 200); // 100-300ms

    // Filter by file type if specified
    let files = MOCK_CODEBASE;
    if (fileType) {
      files = files.filter((file) => file.path.endsWith(fileType));
    }

    // Apply config filters
    if (searchConfig.fileTypes && searchConfig.fileTypes.length > 0) {
      files = files.filter((file) =>
        searchConfig.fileTypes!.some((ext) => file.path.endsWith(ext))
      );
    }

    if (searchConfig.excludePaths && searchConfig.excludePaths.length > 0) {
      files = files.filter(
        (file) => !searchConfig.excludePaths!.some((excluded) => file.path.includes(excluded))
      );
    }

    // Search for query in files
    const results: SearchResult[] = [];
    for (const file of files) {
      const matchCount = this.countMatches(file.content.toLowerCase(), query);
      if (matchCount > 0) {
        results.push({
          path: file.path,
          language: file.language,
          lines: file.lines,
          matchCount,
          excerpt: this.extractExcerpt(file.content, query),
          relevanceScore: this.calculateRelevance(file, query, matchCount),
        });
      }
    }

    // Sort by relevance
    results.sort((a, b) => b.relevanceScore - a.relevanceScore);

    // Apply limit
    const limit = searchConfig.maxResults || 10;
    const limitedResults = results.slice(0, limit);

    return {
      query,
      totalResults: results.length,
      results: limitedResults,
    };
  }

  /**
   * Count matches of query in content
   */
  private countMatches(content: string, query: string): number {
    const regex = new RegExp(query, 'gi');
    const matches = content.match(regex);
    return matches ? matches.length : 0;
  }

  /**
   * Extract excerpt around match
   */
  private extractExcerpt(content: string, query: string): string {
    const lowerContent = content.toLowerCase();
    const index = lowerContent.indexOf(query.toLowerCase());

    if (index === -1) {
      return content.substring(0, 100) + '...';
    }

    const start = Math.max(0, index - 50);
    const end = Math.min(content.length, index + query.length + 50);

    let excerpt = content.substring(start, end);
    if (start > 0) excerpt = '...' + excerpt;
    if (end < content.length) excerpt = excerpt + '...';

    return excerpt;
  }

  /**
   * Calculate relevance score
   */
  private calculateRelevance(
    file: { path: string; content: string; language: string },
    query: string,
    matchCount: number
  ): number {
    let score = matchCount * 10;

    // Boost for matches in file name
    if (file.path.toLowerCase().includes(query)) {
      score += 50;
    }

    // Boost for exact matches
    if (file.content.includes(query)) {
      score += 20;
    }

    // Boost for TypeScript files (assuming they're more relevant)
    if (file.language === 'typescript') {
      score += 5;
    }

    // Boost for matches in documentation
    if (file.path.includes('docs/') || file.path.includes('README')) {
      score += 10;
    }

    return score;
  }

  /**
   * Simulate delay
   */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
