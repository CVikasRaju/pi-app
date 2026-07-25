'use client';

/**
 * AlertsFeed.js — Early Warning Alerts Feed (Phase 4)
 * Shows recent fired threshold alerts. Supervisor role only (enforced at API).
 */

import { useState, useEffect } from 'react';
import { analyticsApi } from '../lib/analyticsApi';

export default function AlertsFeed() {
  const [alerts,  setAlerts]  = useState([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState('');

  useEffect(() => {
    analyticsApi.getAlerts()
      .then(res => setAlerts(res.data?.alerts || []))
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="glass-card" style={{ padding: '28px' }} id="alerts-feed-card">
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '20px' }}>
        <span style={{ fontSize: '1.4rem' }}>🚨</span>
        <div>
          <div style={{ fontWeight: 700, fontSize: '1.05rem', color: 'var(--text-primary)' }}>Early Warning Alerts</div>
          <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '2px' }}>
            Threshold breach notifications — Catalyst Signals + Circuits
          </div>
        </div>
        {!loading && alerts.length > 0 && (
          <span style={{
            marginLeft: 'auto',
            background: 'rgba(239,68,68,0.18)', color: '#EF4444',
            fontSize: '0.72rem', fontWeight: 700,
            padding: '4px 10px', borderRadius: 'var(--radius-full)',
          }}>
            {alerts.length} Alert{alerts.length !== 1 ? 's' : ''}
          </span>
        )}
      </div>

      {loading && <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>Loading alerts…</div>}
      {error && !loading && <div style={{ color: '#EF4444', fontSize: '0.875rem', textAlign: 'center', padding: '30px' }}>⚠️ {error}</div>}

      {!loading && !error && alerts.length === 0 && (
        <div style={{
          textAlign: 'center', padding: '40px',
          border: '1px dashed var(--border-subtle)', borderRadius: 'var(--radius-md)',
          color: 'var(--text-muted)', fontSize: '0.875rem',
        }}>
          ✅ No threshold alerts — all districts within normal parameters
        </div>
      )}

      {!loading && !error && alerts.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {alerts.map((alert, i) => {
            const severity = alert.actual_count >= alert.threshold_count * 1.5 ? 'critical' : 'warning';
            const color    = severity === 'critical' ? '#EF4444' : '#F59E0B';
            const bg       = severity === 'critical' ? 'rgba(239,68,68,0.08)' : 'rgba(245,158,11,0.08)';
            return (
              <div
                key={alert.id || i}
                id={`alert-${alert.id || i}`}
                style={{
                  background: bg,
                  border: `1px solid ${color}30`,
                  borderLeft: `3px solid ${color}`,
                  borderRadius: 'var(--radius-md)',
                  padding: '14px 16px',
                  animation: 'fadeIn 0.3s ease',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '12px' }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600, color: color, fontSize: '0.9rem', marginBottom: '4px' }}>
                      {severity === 'critical' ? '🚨' : '⚠️'} {alert.threshold_name}
                    </div>
                    <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
                      <strong style={{ color: 'var(--text-primary)' }}>{alert.actual_count}</strong> FIRs registered —
                      threshold was <strong>{alert.threshold_count}</strong>
                      {alert.district_id ? ` · District ${alert.district_id}` : ' · All districts'}
                    </div>
                  </div>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', whiteSpace: 'nowrap', flexShrink: 0 }}>
                    {alert.fired_date}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
