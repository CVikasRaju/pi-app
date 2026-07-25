'use client';

/**
 * TrendChart.js — FIR Volume Trend Chart (Phase 4)
 * Uses recharts BarChart/LineChart for weekly/monthly FIR volume visualization.
 */

import { useState, useEffect, useCallback } from 'react';
import {
  ResponsiveContainer, ComposedChart, Bar, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from 'recharts';
import { analyticsApi } from '../lib/analyticsApi';

export default function TrendChart({ defaultGroupBy = 'week' }) {
  const [groupBy,  setGroupBy]  = useState(defaultGroupBy);
  const [months,   setMonths]   = useState(6);
  const [data,     setData]     = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState('');

  const loadTrends = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await analyticsApi.getTrends({ groupBy, months });
      setData(res.data || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [groupBy, months]);

  useEffect(() => {
    loadTrends();
  }, [loadTrends]);

  const CustomTooltip = ({ active, payload, label }) => {
    if (!active || !payload?.length) return null;
    return (
      <div style={{
        background: 'rgba(10,10,20,0.95)', border: '1px solid rgba(99,102,241,0.3)',
        borderRadius: '8px', padding: '10px 14px',
      }}>
        <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem', marginBottom: '4px' }}>{label}</div>
        <div style={{ color: '#818CF8', fontWeight: 700 }}>{payload[0]?.value} FIRs</div>
      </div>
    );
  };

  return (
    <div className="glass-card" style={{ padding: '28px' }} id="trend-chart-card">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px', flexWrap: 'wrap', gap: '12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span style={{ fontSize: '1.4rem' }}>📈</span>
          <div>
            <div style={{ fontWeight: 700, fontSize: '1.05rem', color: 'var(--text-primary)' }}>FIR Volume Trends</div>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '2px' }}>Weekly / monthly crime registration patterns</div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          {['week', 'month'].map(g => (
            <button
              key={g}
              id={`trend-group-${g}`}
              onClick={() => setGroupBy(g)}
              style={{
                padding: '6px 14px', fontSize: '0.8rem', borderRadius: 'var(--radius-full)',
                border: `1px solid ${groupBy === g ? '#6366F1' : 'var(--border-subtle)'}`,
                background: groupBy === g ? 'rgba(99,102,241,0.18)' : 'transparent',
                color: groupBy === g ? '#818CF8' : 'var(--text-muted)',
                cursor: 'pointer', transition: 'all 0.2s',
              }}
            >
              {g.charAt(0).toUpperCase() + g.slice(1)}ly
            </button>
          ))}
          {[3, 6, 12].map(m => (
            <button
              key={m}
              id={`trend-months-${m}`}
              onClick={() => setMonths(m)}
              style={{
                padding: '6px 14px', fontSize: '0.8rem', borderRadius: 'var(--radius-full)',
                border: `1px solid ${months === m ? '#6366F1' : 'var(--border-subtle)'}`,
                background: months === m ? 'rgba(99,102,241,0.18)' : 'transparent',
                color: months === m ? '#818CF8' : 'var(--text-muted)',
                cursor: 'pointer', transition: 'all 0.2s',
              }}
            >
              {m}M
            </button>
          ))}
        </div>
      </div>

      {loading && (
        <div style={{ textAlign: 'center', padding: '60px', color: 'var(--text-muted)' }}>
          <div className="typing-dot" /><div className="typing-dot" /><div className="typing-dot" />
        </div>
      )}

      {error && !loading && (
        <div style={{ color: '#EF4444', fontSize: '0.875rem', textAlign: 'center', padding: '40px' }}>⚠️ {error}</div>
      )}

      {!loading && !error && data.length > 0 && (
        <ResponsiveContainer width="100%" height={280}>
          <ComposedChart data={data} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
            <XAxis
              dataKey="period"
              tick={{ fill: '#6B7280', fontSize: 11 }}
              tickLine={false}
              axisLine={false}
              interval="preserveStartEnd"
            />
            <YAxis
              tick={{ fill: '#6B7280', fontSize: 11 }}
              tickLine={false}
              axisLine={false}
            />
            <Tooltip content={<CustomTooltip />} />
            <Bar dataKey="count" fill="rgba(99,102,241,0.55)" radius={[4, 4, 0, 0]} name="FIRs" />
            <Line type="monotone" dataKey="count" stroke="#818CF8" strokeWidth={2} dot={false} name="Trend" />
          </ComposedChart>
        </ResponsiveContainer>
      )}

      {!loading && !error && data.length === 0 && (
        <div style={{ textAlign: 'center', padding: '60px', color: 'var(--text-muted)', fontSize: '0.875rem' }}>
          No trend data available for this period
        </div>
      )}
    </div>
  );
}
