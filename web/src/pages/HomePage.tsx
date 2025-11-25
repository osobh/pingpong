import { useState, useEffect } from 'react';
import { api, type Room } from '../api/client';

export default function HomePage() {
  const [rooms, setRooms] = useState<Room[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadRooms();
  }, []);

  const loadRooms = async () => {
    try {
      const data = await api.getRooms();
      setRooms(data.rooms);
      setLoading(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load rooms');
      setLoading(false);
    }
  };

  if (loading) return <div className="loading">Loading...</div>;
  if (error) return <div className="error">{error}</div>;

  return (
    <div className="page">
      <div className="page-header">
        <h2>Active Conversation Rooms</h2>
        <p>Monitor and manage multi-agent conversations</p>
      </div>

      {rooms.length === 0 ? (
        <div className="card">
          <p>No active rooms. Start the server with a topic to create a room.</p>
        </div>
      ) : (
        <div className="grid">
          {rooms.map((room) => (
            <div key={room.id} className="card">
              <h3>{room.topic}</h3>
              <div style={{ marginTop: '1rem', display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
                <span className="badge badge-low">{room.mode} mode</span>
                <span>{room.agentCount} agents</span>
                <span>{room.messageCount} messages</span>
              </div>
              <div style={{ marginTop: '1rem', display: 'flex', gap: '0.5rem' }}>
                <button onClick={() => api.exportConversation(room.id, 'json')}>
                  Export JSON
                </button>
                <button onClick={() => api.exportConversation(room.id, 'markdown')}>
                  Export MD
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
