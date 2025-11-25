import { useState, useEffect } from 'react';
import { api, type Room, type AgentMetrics } from '../api/client';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

export default function AnalyticsPage() {
  const [rooms, setRooms] = useState<Room[]>([]);
  const [selectedRoom, setSelectedRoom] = useState<string>('');
  const [metrics, setMetrics] = useState<AgentMetrics[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadRooms();
  }, []);

  useEffect(() => {
    if (selectedRoom) {
      loadMetrics();
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

  const loadMetrics = async () => {
    try {
      const data = await api.getRoomAgentMetrics(selectedRoom);
      setMetrics(data.metrics);
    } catch (err) {
      console.error(err);
    }
  };

  if (loading) return <div className="loading">Loading...</div>;

  return (
    <div className="page">
      <div className="page-header">
        <h2>Analytics Dashboard</h2>
        <p>View performance metrics and agent leaderboards</p>
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

      {metrics.length > 0 && (
        <>
          <div className="stat-grid">
            <div className="stat-card">
              <h3>Total Agents</h3>
              <p className="value">{metrics.length}</p>
            </div>
            <div className="stat-card">
              <h3>Total Messages</h3>
              <p className="value">{metrics.reduce((sum, m) => sum + m.totalMessages, 0)}</p>
            </div>
            <div className="stat-card">
              <h3>Total Votes</h3>
              <p className="value">{metrics.reduce((sum, m) => sum + m.totalVotes, 0)}</p>
            </div>
            <div className="stat-card">
              <h3>Avg Engagement</h3>
              <p className="value">
                {(metrics.reduce((sum, m) => sum + m.engagementScore, 0) / metrics.length).toFixed(1)}
              </p>
            </div>
          </div>

          <div className="card">
            <h3 style={{ marginBottom: '1rem' }}>Agent Engagement Scores</h3>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={metrics}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="agentName" />
                <YAxis />
                <Tooltip />
                <Legend />
                <Bar dataKey="engagementScore" fill="#8884d8" name="Engagement" />
                <Bar dataKey="influenceScore" fill="#82ca9d" name="Influence" />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="card">
            <h3 style={{ marginBottom: '1rem' }}>Agent Performance Metrics</h3>
            <table>
              <thead>
                <tr>
                  <th>Agent</th>
                  <th>Messages</th>
                  <th>Votes</th>
                  <th>Engagement</th>
                  <th>Influence</th>
                </tr>
              </thead>
              <tbody>
                {metrics.map((metric) => (
                  <tr key={metric.agentId}>
                    <td><strong>{metric.agentName}</strong></td>
                    <td>{metric.totalMessages}</td>
                    <td>{metric.totalVotes}</td>
                    <td>{metric.engagementScore.toFixed(2)}</td>
                    <td>{metric.influenceScore.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
