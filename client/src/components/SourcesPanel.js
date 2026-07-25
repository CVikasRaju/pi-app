'use client';

import { useState } from 'react';

/**
 * SourcesPanel — Expandable "Why this answer?" citations panel
 *
 * Props:
 *   sources        - array of source objects from response-composer
 *   confidence     - 'high' | 'medium' | 'low' | 'none'
 *   no_results     - boolean
 *   sources_label  - string label ("3 sources cited")
 */

const CONFIDENCE_STYLES = {
  high:   { bg: 'rgba(16,185,129,0.12)', color: '#34D399', label: '●  High confidence' },
  medium: { bg: 'rgba(245,158,11,0.12)', color: '#FBBF24', label: '●  Medium confidence' },
  low:    { bg: 'rgba(239,68,68,0.12)',   color: '#F87171', label: '●  Low confidence' },
  none:   { bg: 'rgba(99,102,241,0.08)', color: '#818CF8', label: '○  No records found' },
};

export default function SourcesPanel({ sources = [], confidence = 'low', no_results = false, sources_label }) {
  const [open, setOpen] = useState(false);

  const confStyle = CONFIDENCE_STYLES[confidence] || CONFIDENCE_STYLES.low;
  const hasSource = sources.length > 0;

  return (
    <div className="sources-panel" id={`sources-panel-${Math.random().toString(36).slice(2, 8)}`}>
      {/* Toggle row */}
      <button
        className="sources-toggle"
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
        style={{ background: confStyle.bg }}
      >
        <span className="sources-confidence-dot" style={{ color: confStyle.color }}>
          {confStyle.label}
        </span>
        <span className="sources-label-text">
          {sources_label || (hasSource ? `${sources.length} source${sources.length > 1 ? 's' : ''}` : 'No records found')}
        </span>
        <span className="sources-chevron" style={{ transform: open ? 'rotate(180deg)' : 'rotate(0deg)' }}>
          ▾
        </span>
      </button>

      {/* Expanded panel */}
      {open && (
        <div className="sources-list" role="list">
          {no_results && !hasSource ? (
            <div className="source-empty">
              No matching records were found in the database for this query.
            </div>
          ) : (
            sources.map((s, i) => (
              <div key={i} className="source-item" role="listitem">
                <div className="source-header">
                  <span className="source-chip">
                    {s.crime_number || s.row_ref || `Row ${s.source_index}`}
                  </span>
                  <span className="source-table-badge">{s.table || 'FIR'}</span>
                  {s.is_aggregate && (
                    <span className="source-aggregate-badge">Aggregate</span>
                  )}
                </div>
                {s.excerpt && (
                  <p className="source-excerpt">{s.excerpt}</p>
                )}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
