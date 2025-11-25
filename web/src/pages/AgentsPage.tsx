import { useState, useEffect } from 'react';
import { api, type Agent } from '../api/client';

export default function AgentsPage() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadAgents();
  }, []);

  const loadAgents = async () => {
    try {
      const data = await api.getAgents();
      setAgents(data.agents);
      setLoading(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load agents');
      setLoading(false);
    }
  };

  if (loading) return <div className="loading">Loading...</div>;
  if (error) return <div className="error">{error}</div>;

  return (
    <div className="page">
      <div className="page-header">
        <h2>Agent Discovery</h2>
        <p>Browse all active agents across conversation rooms</p>
      </div>

      <div className="card">
        <table>
          <thead>
            <tr>
              <th>Agent Name</th>
              <th>Role</th>
              <th>Room</th>
              <th>Capabilities</th>
            </tr>
          </thead>
          <tbody>
            {agents.map((agent) => (
              <tr key={`${agent.id}-${agent.roomId}`}>
                <td><strong>{agent.name}</strong></td>
                <td>{agent.role}</td>
                <td>{agent.roomTopic || agent.roomId}</td>
                <td>
                  {agent.metadata?.capabilities ? (
                    <div style={{ display: 'flex', gap: '0.25rem', flexWrap: 'wrap' }}>
                      {agent.metadata.capabilities.slice(0, 3).map((cap: string) => (
                        <span key={cap} className="badge badge-low" style={{ fontSize: '0.75rem' }}>
                          {cap}
                        </span>
                      ))}
                      {agent.metadata.capabilities.length > 3 && (
                        <span className="badge badge-low" style={{ fontSize: '0.75rem' }}>
                          +{agent.metadata.capabilities.length - 3} more
                        </span>
                      )}
                    </div>
                  ) : (
                    <span style={{ color: '#999' }}>No metadata</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
