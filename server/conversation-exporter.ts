/**
 * ConversationExporter - Export conversations to various formats
 */

import type { ProposalRepository, MessageRecord } from './proposal-repository.js';
import type { AgentMetadata } from '../shared/agent-metadata.js';
import { ProposalStatus } from '../agent/proposal.js';

/**
 * Export format types
 */
export type ExportFormat = 'json' | 'markdown' | 'html';

/**
 * Conversation export data structure
 */
export interface ConversationExport {
  roomId: string;
  topic: string;
  mode: string;
  exportedAt: number;
  messages: MessageRecord[];
  proposals: Array<{
    id: string;
    title: string;
    description: string;
    proposerId: string;
    proposerName: string;
    threshold: number;
    status: string;
    createdAt: number;
    resolvedAt: number | null;
    votes: Array<{
      agentId: string;
      agentName: string;
      voteType: string;
      rationale: string | null;
      timestamp: number;
    }>;
  }>;
  agents: AgentMetadata[];
  statistics: {
    totalMessages: number;
    totalProposals: number;
    approvedProposals: number;
    rejectedProposals: number;
    pendingProposals: number;
    totalAgents: number;
    conversationDuration: number; // milliseconds
  };
}

/**
 * ConversationExporter handles exporting conversations to different formats
 */
export class ConversationExporter {
  constructor(private repository: ProposalRepository) {}

  /**
   * Export conversation to specified format
   */
  async exportConversation(
    roomId: string,
    topic: string,
    mode: string,
    format: ExportFormat,
  ): Promise<string> {
    const data = await this.gatherConversationData(roomId, topic, mode);

    switch (format) {
      case 'json':
        return this.exportToJSON(data);
      case 'markdown':
        return this.exportToMarkdown(data);
      case 'html':
        return this.exportToHTML(data);
      default:
        throw new Error(`Unsupported export format: ${format}`);
    }
  }

  /**
   * Gather all conversation data from database
   */
  private async gatherConversationData(
    roomId: string,
    topic: string,
    mode: string,
  ): Promise<ConversationExport> {
    // Get all messages
    const messages = this.repository.getMessagesByRoom(roomId);

    // Get all proposals with votes
    const proposalRecords = this.repository.getProposalsByRoom(roomId);
    const proposals = proposalRecords.map((p) => ({
      id: p.id,
      title: p.title,
      description: p.description,
      proposerId: p.proposerId,
      proposerName: p.proposerName,
      threshold: p.threshold,
      status: p.status,
      createdAt: p.createdAt,
      resolvedAt: p.resolvedAt,
      votes: this.repository.getVotesByProposal(p.id).map((v) => ({
        agentId: v.agentId,
        agentName: v.agentName,
        voteType: v.voteType,
        rationale: v.rationale,
        timestamp: v.timestamp,
      })),
    }));

    // Get all agent metadata
    const agents = this.repository.getAgentMetadataByRoom(roomId);

    // Calculate statistics
    const statistics = this.calculateStatistics(messages, proposals);

    return {
      roomId,
      topic,
      mode,
      exportedAt: Date.now(),
      messages,
      proposals,
      agents,
      statistics,
    };
  }

  /**
   * Calculate conversation statistics
   */
  private calculateStatistics(
    messages: MessageRecord[],
    proposals: Array<{ status: string }>,
  ): ConversationExport['statistics'] {
    const approvedProposals = proposals.filter((p) => p.status === ProposalStatus.APPROVED).length;
    const rejectedProposals = proposals.filter((p) => p.status === ProposalStatus.REJECTED).length;
    const pendingProposals = proposals.filter((p) => p.status === ProposalStatus.PENDING).length;

    // Calculate conversation duration
    const timestamps = messages.map((m) => m.timestamp);
    const conversationDuration =
      timestamps.length > 0 ? Math.max(...timestamps) - Math.min(...timestamps) : 0;

    return {
      totalMessages: messages.length,
      totalProposals: proposals.length,
      approvedProposals,
      rejectedProposals,
      pendingProposals,
      totalAgents: new Set(messages.map((m) => m.agentId)).size,
      conversationDuration,
    };
  }

  /**
   * Export to JSON format
   */
  private exportToJSON(data: ConversationExport): string {
    return JSON.stringify(data, null, 2);
  }

  /**
   * Export to Markdown format
   */
  private exportToMarkdown(data: ConversationExport): string {
    const lines: string[] = [];

    // Header
    lines.push(`# Conversation Export: ${data.topic}`);
    lines.push('');
    lines.push(`**Room ID:** ${data.roomId}`);
    lines.push(`**Mode:** ${data.mode}`);
    lines.push(`**Exported:** ${new Date(data.exportedAt).toISOString()}`);
    lines.push('');

    // Statistics
    lines.push('## Statistics');
    lines.push('');
    lines.push(`- **Total Messages:** ${data.statistics.totalMessages}`);
    lines.push(`- **Total Agents:** ${data.statistics.totalAgents}`);
    lines.push(`- **Total Proposals:** ${data.statistics.totalProposals}`);
    lines.push(`  - Approved: ${data.statistics.approvedProposals}`);
    lines.push(`  - Rejected: ${data.statistics.rejectedProposals}`);
    lines.push(`  - Pending: ${data.statistics.pendingProposals}`);
    lines.push(
      `- **Duration:** ${this.formatDuration(data.statistics.conversationDuration)}`,
    );
    lines.push('');

    // Agents
    if (data.agents.length > 0) {
      lines.push('## Agents');
      lines.push('');
      for (const agent of data.agents) {
        lines.push(`### ${agent.agentName} (${agent.role})`);
        lines.push('');
        lines.push(`- **Type:** ${agent.type}`);
        lines.push(`- **Capabilities:** ${agent.capabilities.join(', ')}`);
        if (agent.llmConfig) {
          lines.push(
            `- **LLM:** ${agent.llmConfig.provider}/${agent.llmConfig.model}`,
          );
        }
        if (agent.personality) {
          lines.push(
            `- **Personality:** Verbosity: ${agent.personality.verbosity}, Formality: ${agent.personality.formality}`,
          );
        }
        lines.push('');
      }
    }

    // Messages
    lines.push('## Conversation');
    lines.push('');
    for (const msg of data.messages) {
      const timestamp = new Date(msg.timestamp).toLocaleTimeString();
      lines.push(`**[${timestamp}] ${msg.agentName} (${msg.role}):**`);
      lines.push('');
      lines.push(msg.content);
      lines.push('');
    }

    // Proposals
    if (data.proposals.length > 0) {
      lines.push('## Proposals');
      lines.push('');
      for (const proposal of data.proposals) {
        lines.push(`### ${proposal.title}`);
        lines.push('');
        lines.push(`**Status:** ${proposal.status}`);
        lines.push(`**Proposed by:** ${proposal.proposerName}`);
        lines.push(`**Threshold:** ${(proposal.threshold * 100).toFixed(0)}%`);
        lines.push('');
        lines.push(proposal.description);
        lines.push('');

        if (proposal.votes.length > 0) {
          lines.push('**Votes:**');
          lines.push('');
          for (const vote of proposal.votes) {
            const rationale = vote.rationale ? ` - "${vote.rationale}"` : '';
            lines.push(`- ${vote.agentName}: **${vote.voteType}**${rationale}`);
          }
          lines.push('');
        }
      }
    }

    return lines.join('\n');
  }

  /**
   * Export to HTML format
   */
  private exportToHTML(data: ConversationExport): string {
    const html: string[] = [];

    html.push('<!DOCTYPE html>');
    html.push('<html lang="en">');
    html.push('<head>');
    html.push('  <meta charset="UTF-8">');
    html.push('  <meta name="viewport" content="width=device-width, initial-scale=1.0">');
    html.push(`  <title>Conversation: ${this.escapeHtml(data.topic)}</title>`);
    html.push('  <style>');
    html.push('    body { font-family: system-ui, -apple-system, sans-serif; max-width: 1200px; margin: 0 auto; padding: 20px; background: #f5f5f5; }');
    html.push('    .container { background: white; padding: 30px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }');
    html.push('    h1 { color: #333; border-bottom: 3px solid #4CAF50; padding-bottom: 10px; }');
    html.push('    h2 { color: #555; margin-top: 30px; border-bottom: 2px solid #ddd; padding-bottom: 8px; }');
    html.push('    h3 { color: #666; }');
    html.push('    .metadata { background: #f9f9f9; padding: 15px; border-radius: 4px; margin: 20px 0; }');
    html.push('    .metadata p { margin: 5px 0; }');
    html.push('    .stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 15px; margin: 20px 0; }');
    html.push('    .stat-card { background: #e3f2fd; padding: 15px; border-radius: 4px; border-left: 4px solid #2196F3; }');
    html.push('    .stat-card h4 { margin: 0 0 5px 0; color: #1976D2; font-size: 0.9em; }');
    html.push('    .stat-card p { margin: 0; font-size: 1.5em; font-weight: bold; color: #333; }');
    html.push('    .message { margin: 15px 0; padding: 15px; border-left: 4px solid #4CAF50; background: #f9f9f9; border-radius: 4px; }');
    html.push('    .message-header { font-weight: bold; color: #4CAF50; margin-bottom: 8px; }');
    html.push('    .message-timestamp { color: #999; font-size: 0.9em; }');
    html.push('    .message-content { color: #333; line-height: 1.6; white-space: pre-wrap; }');
    html.push('    .proposal { margin: 20px 0; padding: 20px; border: 2px solid #FF9800; border-radius: 4px; background: #fff3e0; }');
    html.push('    .proposal-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; }');
    html.push('    .proposal-title { font-size: 1.2em; font-weight: bold; color: #E65100; }');
    html.push('    .proposal-status { padding: 5px 12px; border-radius: 4px; font-size: 0.9em; font-weight: bold; text-transform: uppercase; }');
    html.push('    .status-approved { background: #4CAF50; color: white; }');
    html.push('    .status-rejected { background: #f44336; color: white; }');
    html.push('    .status-pending { background: #FFC107; color: #333; }');
    html.push('    .vote { margin: 8px 0; padding: 8px; background: white; border-radius: 4px; }');
    html.push('    .vote-yes { border-left: 4px solid #4CAF50; }');
    html.push('    .vote-no { border-left: 4px solid #f44336; }');
    html.push('    .vote-abstain { border-left: 4px solid #9E9E9E; }');
    html.push('    .agent-card { margin: 15px 0; padding: 15px; background: #f5f5f5; border-radius: 4px; }');
    html.push('    .agent-name { font-weight: bold; color: #333; font-size: 1.1em; }');
    html.push('    .agent-details { margin-top: 8px; color: #666; font-size: 0.95em; }');
    html.push('  </style>');
    html.push('</head>');
    html.push('<body>');
    html.push('  <div class="container">');

    // Header
    html.push(`    <h1>${this.escapeHtml(data.topic)}</h1>`);
    html.push('    <div class="metadata">');
    html.push(`      <p><strong>Room ID:</strong> ${this.escapeHtml(data.roomId)}</p>`);
    html.push(`      <p><strong>Mode:</strong> ${this.escapeHtml(data.mode)}</p>`);
    html.push(`      <p><strong>Exported:</strong> ${new Date(data.exportedAt).toLocaleString()}</p>`);
    html.push('    </div>');

    // Statistics
    html.push('    <h2>Statistics</h2>');
    html.push('    <div class="stats">');
    html.push('      <div class="stat-card">');
    html.push('        <h4>Total Messages</h4>');
    html.push(`        <p>${data.statistics.totalMessages}</p>`);
    html.push('      </div>');
    html.push('      <div class="stat-card">');
    html.push('        <h4>Total Agents</h4>');
    html.push(`        <p>${data.statistics.totalAgents}</p>`);
    html.push('      </div>');
    html.push('      <div class="stat-card">');
    html.push('        <h4>Total Proposals</h4>');
    html.push(`        <p>${data.statistics.totalProposals}</p>`);
    html.push('      </div>');
    html.push('      <div class="stat-card">');
    html.push('        <h4>Duration</h4>');
    html.push(`        <p style="font-size:1.2em">${this.formatDuration(data.statistics.conversationDuration)}</p>`);
    html.push('      </div>');
    html.push('    </div>');

    // Agents
    if (data.agents.length > 0) {
      html.push('    <h2>Agents</h2>');
      for (const agent of data.agents) {
        html.push('    <div class="agent-card">');
        html.push(`      <div class="agent-name">${this.escapeHtml(agent.agentName)} (${this.escapeHtml(agent.role)})</div>`);
        html.push('      <div class="agent-details">');
        html.push(`        <p><strong>Type:</strong> ${this.escapeHtml(agent.type)}</p>`);
        html.push(`        <p><strong>Capabilities:</strong> ${agent.capabilities.join(', ')}</p>`);
        if (agent.llmConfig) {
          html.push(`        <p><strong>LLM:</strong> ${this.escapeHtml(agent.llmConfig.provider)}/${this.escapeHtml(agent.llmConfig.model)}</p>`);
        }
        if (agent.personality) {
          html.push(`        <p><strong>Personality:</strong> Verbosity: ${agent.personality.verbosity}, Formality: ${agent.personality.formality}</p>`);
        }
        html.push('      </div>');
        html.push('    </div>');
      }
    }

    // Messages
    html.push('    <h2>Conversation</h2>');
    for (const msg of data.messages) {
      const timestamp = new Date(msg.timestamp).toLocaleString();
      html.push('    <div class="message">');
      html.push('      <div class="message-header">');
      html.push(`        ${this.escapeHtml(msg.agentName)} <span style="color: #999;">(${this.escapeHtml(msg.role)})</span>`);
      html.push(`        <span class="message-timestamp">${timestamp}</span>`);
      html.push('      </div>');
      html.push(`      <div class="message-content">${this.escapeHtml(msg.content)}</div>`);
      html.push('    </div>');
    }

    // Proposals
    if (data.proposals.length > 0) {
      html.push('    <h2>Proposals</h2>');
      for (const proposal of data.proposals) {
        const statusClass = `status-${proposal.status.toLowerCase()}`;
        html.push('    <div class="proposal">');
        html.push('      <div class="proposal-header">');
        html.push(`        <div class="proposal-title">${this.escapeHtml(proposal.title)}</div>`);
        html.push(`        <div class="proposal-status ${statusClass}">${proposal.status}</div>`);
        html.push('      </div>');
        html.push(`      <p><strong>Proposed by:</strong> ${this.escapeHtml(proposal.proposerName)}</p>`);
        html.push(`      <p><strong>Threshold:</strong> ${(proposal.threshold * 100).toFixed(0)}%</p>`);
        html.push(`      <p>${this.escapeHtml(proposal.description)}</p>`);

        if (proposal.votes.length > 0) {
          html.push('      <h4>Votes:</h4>');
          for (const vote of proposal.votes) {
            html.push(`      <div class="vote vote-${vote.voteType.toLowerCase()}">`);
            html.push(`        <strong>${this.escapeHtml(vote.agentName)}:</strong> ${vote.voteType.toUpperCase()}`);
            if (vote.rationale) {
              html.push(`        <p style="margin: 5px 0 0 0; color: #666;">${this.escapeHtml(vote.rationale)}</p>`);
            }
            html.push('      </div>');
          }
        }
        html.push('    </div>');
      }
    }

    html.push('  </div>');
    html.push('</body>');
    html.push('</html>');

    return html.join('\n');
  }

  /**
   * Format duration in human-readable format
   */
  private formatDuration(ms: number): string {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);

    if (hours > 0) {
      return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
    } else if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`;
    } else {
      return `${seconds}s`;
    }
  }

  /**
   * Escape HTML special characters
   */
  private escapeHtml(text: string): string {
    const map: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#039;',
    };
    return text.replace(/[&<>"']/g, (char) => map[char] ?? char);
  }
}
