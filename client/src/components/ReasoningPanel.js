'use client';

/**
 * ReasoningPanel.js — XAI Step-by-Step Reasoning Visualization
 * Phase 5 — XAI & Governance Hardening
 *
 * Expandable panel below each AI message showing the full reasoning trace:
 *   Intent parse → Data Store query → Graph traversal → Risk score → Compose
 *
 * Also contains the SourcesPanel content (citations) as the final step.
 * Default: collapsed. Opens with "🔍 Reasoning path" button.
 */

import { useState, useEffect, useCallback } from 'react';
import { chatApi } from '../lib/chatApi';

// Step type → display config
const STEP_CONFIG = {
  intent_parse:  { icon: '🧠', color: '#8B5CF6', label: 'Intent',       bg: 'rgba(139,92,246,0.10)' },
  zcql_query:    { icon: '🗄️',  color: '#3B82F6', label: 'Data Store',  bg: 'rgba(59,130,246,0.10)' },
  graph_lookup:  { icon: '🌐', color: '#6366F1', label: 'Graph',        bg: 'rgba(99,102,241,0.10)' },
  risk_score:    { icon: '🎯', color: '#F59E0B', label: 'Risk ML',      bg: 'rgba(245,158,11,0.10)' },
  llm_compose:   { icon: '✍️',  color: '#10B981', label: 'Compose',     bg: 'rgba(16,185,129,0.10)' },
  citation_check:{ icon: '📎', color: '#6B7280', label: 'Citations',    bg: 'rgba(107,114,128,0.10)' },
};

const CONFIDENCE_COLOR = {
  high:   '#22C55E',
  medium: '#F59E0B',
  low:    '#EF4444',
  none:   '#6B7280',
};

export default function ReasoningPanel({ message }) {
  const [open,    setOpen]    = useState(false);
  const [trace,   setTrace]   = useState(null);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState('');

  const traceId = message?.trace_id;
  const showPanel = message?.show_reasoning_panel || traceId;

  const fetchTrace = useCallback(async () => {
    if (!traceId || trace) return;
    setLoading(true);
    setError('');
    try {
      const res = await chatApi.getTrace(traceId);
      setTrace(res.data);
    } catch (err) {
      setError(err.message || 'Could not load reasoning trace');
    } finally {
      setLoading(false);
    }
  }, [traceId, trace]);

  function handleToggle() {
    setOpen(o => !o);
    if (!open && !trace) fetchTrace();
  }

  if (!showPanel) return null;

  return (
    <div className="reasoning-panel" id={`reasoning-panel-${message.message_id}`}>
      {/* Toggle button */}
      <button
        className="reasoning-toggle-btn"
        onClick={handleToggle}
        id={`reasoning-toggle-${message.message_id}`}
        aria-expanded={open}
      >
        <span className="reasoning-toggle-icon">{open ? '▾' : '▸'}</span>
        <span className="reasoning-toggle-label">
          {open ? 'Hide' : '🔍 Reasoning path'}
        </span>
        {trace && (
          <span className="reasoning-confidence-badge" style={{ color: CONFIDENCE_COLOR[trace.confidence_overall < 0.5 ? 'low' : trace.confidence_overall < 0.8 ? 'medium' : 'high'] }}>
            {Math.round((trace.confidence_overall || 0) * 100)}% confidence
          </span>
        )}
      </button>

      {/* Expanded panel */}
      {open && (
        <div className="reasoning-content animate-fade-in" id={`reasoning-content-${message.message_id}`}>
          {loading && (
            <div className="reasoning-loading">
              <span className="typing-dot" /><span className="typing-dot" /><span className="typing-dot" />
              <span style={{ marginLeft: '8px', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                Loading reasoning trace…
              </span>
            </div>
          )}

          {error && !loading && (
            <div className="reasoning-error">⚠️ {error}</div>
          )}

          {trace && !loading && (
            <>
              {/* Language + model meta */}
              <div className="reasoning-meta">
                <span>🌐 Language: <strong>{trace.language === 'kn' ? 'ಕನ್ನಡ' : 'English'}</strong></span>
                <span>·</span>
                <span>⏱ {trace.steps?.length || 0} reasoning steps</span>
                {trace.mock && <span className="reasoning-mock-badge">demo trace</span>}
              </div>

              {/* Confidence bar */}
              {trace.confidence_overall !== null && (
                <div className="reasoning-confidence-bar-wrap">
                  <div className="reasoning-confidence-bar-label">
                    Overall confidence
                    <span style={{ color: CONFIDENCE_COLOR[trace.confidence_overall < 0.5 ? 'low' : trace.confidence_overall < 0.8 ? 'medium' : 'high'], fontWeight: 700, marginLeft: '6px' }}>
                      {Math.round((trace.confidence_overall || 0) * 100)}%
                    </span>
                  </div>
                  <div className="reasoning-confidence-track">
                    <div
                      className="reasoning-confidence-fill"
                      style={{
                        width: `${Math.round((trace.confidence_overall || 0) * 100)}%`,
                        background: CONFIDENCE_COLOR[trace.confidence_overall < 0.5 ? 'low' : trace.confidence_overall < 0.8 ? 'medium' : 'high'],
                      }}
                    />
                  </div>
                </div>
              )}

              {/* Step timeline */}
              <div className="reasoning-timeline">
                {(trace.steps || []).map((step, i) => {
                  const cfg = STEP_CONFIG[step.type] || { icon: '⚙️', color: '#6B7280', label: step.type, bg: 'rgba(107,114,128,0.08)' };
                  return (
                    <div key={i} className="reasoning-step" id={`trace-step-${i}`} style={{ '--step-color': cfg.color }}>
                      {/* Connector line */}
                      {i < (trace.steps.length - 1) && <div className="reasoning-step-line" />}

                      {/* Icon bubble */}
                      <div className="reasoning-step-icon-wrap" style={{ background: cfg.bg, borderColor: cfg.color + '40' }}>
                        <span className="reasoning-step-icon">{cfg.icon}</span>
                      </div>

                      {/* Content */}
                      <div className="reasoning-step-body">
                        <div className="reasoning-step-header">
                          <span className="reasoning-step-type" style={{ color: cfg.color }}>
                            {cfg.label}
                          </span>
                          <span className="reasoning-step-num">Step {step.step}</span>
                        </div>
                        <div className="reasoning-step-label">{step.label}</div>
                        {step.detail && (
                          <div className="reasoning-step-detail">{step.detail}</div>
                        )}
                        {step.meta && Object.keys(step.meta).length > 0 && (
                          <div className="reasoning-step-meta">
                            {Object.entries(step.meta).map(([k, v]) => (
                              <span key={k} className="reasoning-meta-chip">
                                <span className="reasoning-meta-key">{k}</span>
                                <span className="reasoning-meta-val">{String(v)}</span>
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Sources (citation block) */}
              {trace.sources?.length > 0 && (
                <div className="reasoning-sources">
                  <div className="reasoning-sources-label">📎 Sources cited</div>
                  <div className="reasoning-sources-chips">
                    {trace.sources.map((s, i) => (
                      <span key={i} className="reasoning-source-chip">{s}</span>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
