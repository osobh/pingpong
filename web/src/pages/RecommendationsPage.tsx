import { useState, useEffect } from 'react';
import { api, type Room, type RecommendationsResponse } from '../api/client';

export default function RecommendationsPage() {
  const [rooms, setRooms] = useState<Room[]>([]);
  const [selectedRoom, setSelectedRoom] = useState<string>('');
  const [recommendations, setRecommendations] = useState<RecommendationsResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadRooms();
  }, []);

  useEffect(() => {
    if (selectedRoom) {
      loadRecommendations();
    }
  }, [selectedRoom]);

  const loadRooms = async () => {
    try {
      const data = await api.getRooms();
      setRooms(data.rooms);
      if (data.rooms.length > 0) {
        setSelectedRoom(data.rooms[0].id);
      }
      setLoading(false);
    } catch (err) {
      console.error(err);
      setLoading(false);
    }
  };

  const loadRecommendations = async () => {
    try {
      const data = await api.getRecommendations(selectedRoom);
      setRecommendations(data);
    } catch (err) {
      console.error(err);
    }
  };

  if (loading) return <div className="loading">Loading...</div>;

  return (
    <div className="page">
      <div className="page-header">
        <h2>Agent Recommendations</h2>
        <p>Intelligent suggestions for improving conversation quality</p>
      </div>

      <div className="card">
        <label htmlFor="room-select" style={{ marginRight: '1rem' }}>Select Room:</label>
        <select
          id="room-select"
          className="select"
          value={selectedRoom}
          onChange={(e) => setSelectedRoom(e.target.value)}
        >
          {rooms.map((room) => (
            <option key={room.id} value={room.id}>{room.topic}</option>
          ))}
        </select>
      </div>

      {recommendations && (
        <>
          <div className="stat-grid">
            <div className="stat-card">
              <h3>Conversation Quality</h3>
              <p className="value">{recommendations.conversationNeeds.conversationQuality.toFixed(0)}%</p>
            </div>
            <div className="stat-card">
              <h3>Participation Balance</h3>
              <p className="value">{(recommendations.conversationNeeds.participationBalance * 100).toFixed(0)}%</p>
            </div>
            <div className="stat-card">
              <h3>Missing Capabilities</h3>
              <p className="value">{recommendations.conversationNeeds.missingCapabilities.length}</p>
            </div>
            <div className="stat-card">
              <h3>Recommendations</h3>
              <p className="value">{recommendations.recommendationCount}</p>
            </div>
          </div>

          {recommendations.conversationNeeds.bottlenecks.length > 0 && (
            <div className="card">
              <h3 style={{ marginBottom: '1rem' }}>Identified Bottlenecks</h3>
              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                {recommendations.conversationNeeds.bottlenecks.map((bottleneck) => (
                  <span key={bottleneck} className="badge badge-medium">
                    {bottleneck.replace(/_/g, ' ')}
                  </span>
                ))}
              </div>
            </div>
          )}

          <div className="card">
            <h3 style={{ marginBottom: '1rem' }}>Recommended Agents</h3>
            {recommendations.recommendations.length === 0 ? (
              <p style={{ color: '#666' }}>No recommendations - conversation is well-balanced!</p>
            ) : (
              <div className="grid">
                {recommendations.recommendations.map((rec, index) => (
                  <div
                    key={index}
                    className="card"
                    style={{ margin: 0, borderLeft: `4px solid ${rec.priority === 'high' ? '#c33' : rec.priority === 'medium' ? '#f76707' : '#1971c2'}` }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '0.5rem' }}>
                      <h4 style={{ margin: 0 }}>{rec.recommendedRole}</h4>
                      <span className={`badge badge-${rec.priority}`}>{rec.priority}</span>
                    </div>
                    <p style={{ margin: '0.5rem 0', color: '#666' }}>{rec.reason}</p>
                    <div style={{ display: 'flex', gap: '0.25rem', flexWrap: 'wrap', marginTop: '0.5rem' }}>
                      {rec.recommendedCapabilities.map((cap) => (
                        <span key={cap} className="badge badge-low" style={{ fontSize: '0.75rem' }}>
                          {cap}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
