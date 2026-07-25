'use client';

/**
 * RiskScoreCard.js — Offender Recidivism Risk Score Panel (Phase 4)
 *
 * Displays risk level (HIGH/MEDIUM/LOW), numeric score, confidence %,
 * contributing factors, and cited source FIR/accused IDs.
 */

import { useState } from 'react';
import { analyticsApi } from '../lib/analyticsApi';

const LEVEL_CONFIG = {
  HIGH:   { color: '#EF4444', bg: 'rgba(239,68,68,0.12)',   label: '🔴 High Risk',   glow: '0 0 20px rgba(239,68,68,0.35)' },
  MEDIUM: { color: '#F59E0B', bg: 'rgba(245,158,11,0.12)',  label: '🟡 Medium Risk', glow: '0 0 20px rgba(245,158,11,0.35)' },
  LOW:    { color: '#22C55E', bg: 'rgba(34,197,94,0.12)',   label: '🟢 Low Risk',    glow: '0 0 20px rgba(34,197,94,0.35)'  },
};

export default function RiskScoreCard() {
  const [query,   setQuery]   = useState('');
  const [result,  setResult]  = useState(null);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState('');

  async function handleSearch(e) {
    e.preventDefault();
    if (!query.trim()) return;
    setLoading(true);
    setError('');
    setResult(null);
    try {
      const data = await analyticsApi.scoreAccused({ accusedName: query.trim() });
      setResult(data.data);
    } catch (err) {
      setError(err.message || 'Failed to fetch risk score');
    } finally {
      setLoading(false);
    }
  }

  const cfg = result ? (LEVEL_CONFIG[result.risk_level] || LEVEL_CONFIG.LOW) : null;

  return (
    <div className="glass-card" style={{ padding: '28px' }} id="risk-score-card">
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '20px' }}>
        <span style={{ fontSize: '1.4rem' }}>🎯</span>
        <div>
          <div style={{ fontWeight: 700, fontSize: '1.05rem', color: 'var(--text-primary)' }}>
            Recidivism Risk Scorer
          </div>
          <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '2px' }}>
            Powered by Zia AutoML — cites source FIR records
          </div>
        </div>
      </div>

      <form onSubmit={handleSearch} style={{ display: 'flex', gap: '10px', marginBottom: '20px' }}>
        <input
          id="risk-accused-input"
          type="text"
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Enter accused name or ID…"
          style={{
            flex: 1,
            background: 'rgba(255,255,255,0.05)',
            border: '1px solid var(--border-subtle)',
            borderRadius: 'var(--radius-md)',
            padding: '10px 14px',
            color: 'var(--text-primary)',
            fontSize: '0.9rem',
          }}
        />
        <button
          id="risk-score-btn"
          type="submit"
          className="btn btn-primary"
          disabled={loading}
          style={{ whiteSpace: 'nowrap' }}
        >
          {loading ? 'Scoring…' : 'Score'}
        </button>
      </form>

      {error && (
        <div style={{ color: '#EF4444', fontSize: '0.875rem', marginBottom: '16px' }}>
          ⚠️ {error}
        </div>
      )}

      {result && (
        <div style={{
          background: cfg.bg,
          border: `1px solid ${cfg.color}`,
          borderRadius: 'var(--radius-lg)',
          padding: '24px',
          boxShadow: cfg.glow,
          animation: 'fadeIn 0.4s ease',
        }}>
          {/* Score dial */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '20px', marginBottom: '20px' }}>
            <div style={{
              width: 90, height: 90,
              borderRadius: '50%',
              border: `4px solid ${cfg.color}`,
              display: 'flex', flexDirection: 'column',
              alignItems: 'center', justifyContent: 'center',
              flexShrink: 0,
              boxShadow: cfg.glow,
            }}>
              <span style={{ fontSize: '1.5rem', fontWeight: 800, color: cfg.color }}>
                {Math.round(result.score * 100)}
              </span>
              <span style={{ fontSize: '0.6rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>/ 100</span>
            </div>
            <div>
              <div style={{ fontSize: '1.1rem', fontWeight: 700, color: cfg.color }}>{cfg.label}</div>
              <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: '4px' }}>
                {result.accusedName && <span>Accused: <strong>{result.accusedName}</strong></span>}
              </div>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                Confidence: <strong style={{ color: 'var(--text-secondary)' }}>{result.confidence}%</strong>
                &nbsp;·&nbsp; Model: <code style={{ fontSize: '0.75rem' }}>{result.model}</code>
              </div>
            </div>
          </div>

          {/* Factors */}
          {result.factors?.length > 0 && (
            <div style={{ marginBottom: '16px' }}>
              <div style={{ fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-muted)', marginBottom: '8px' }}>
                Contributing factors
              </div>
              {result.factors.map((f, i) => (
                <div key={i} style={{
                  display: 'flex', alignItems: 'flex-start', gap: '8px',
                  fontSize: '0.85rem', color: 'var(--text-secondary)',
                  marginBottom: '6px',
                }}>
                  <span style={{ color: cfg.color, flexShrink: 0 }}>▸</span>
                  {f}
                </div>
              ))}
            </div>
          )}

          {/* Sources (citation contract) */}
          {result.sources?.length > 0 && (
            <div style={{
              borderTop: '1px solid var(--border-subtle)',
              paddingTop: '12px',
              fontSize: '0.75rem',
              color: 'var(--text-muted)',
            }}>
              <span style={{ color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                Sources · 
              </span>
              {' '}{result.sources.map((s, i) => (
                <code key={i} style={{ marginRight: '8px', color: 'var(--indigo-400, #818CF8)' }}>{s}</code>
              ))}
            </div>
          )}
        </div>
      )}

      {!result && !loading && !error && (
        <div style={{
          textAlign: 'center', padding: '32px',
          color: 'var(--text-muted)', fontSize: '0.875rem',
          border: '1px dashed var(--border-subtle)', borderRadius: 'var(--radius-md)',
        }}>
          Search an accused name above to compute their recidivism risk score
        </div>
      )}
    </div>
  );
}
