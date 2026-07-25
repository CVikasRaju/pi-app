'use strict';

/**
 * transcriptRenderer.js — HTML builder for pdf-export
 *
 * Generates a print-ready HTML document from a conversation history array.
 * All CSS is inlined (required for SmartBrowz headless rendering).
 */

function renderTranscript({ title, session_id, turns, exported_by, exported_at }) {
  const turnHTML = turns.map((turn, i) => renderTurn(turn, i + 1)).join('\n');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escHtml(title)}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: 'Segoe UI', Arial, sans-serif;
      font-size: 12pt;
      color: #1a1a2e;
      background: #fff;
      padding: 40px 48px;
      line-height: 1.6;
    }
    .header {
      border-bottom: 3px solid #4338ca;
      padding-bottom: 20px;
      margin-bottom: 32px;
    }
    .header-top {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
    }
    .org-name {
      font-size: 9pt;
      color: #6b7280;
      text-transform: uppercase;
      letter-spacing: 0.1em;
      margin-bottom: 4px;
    }
    .doc-title {
      font-size: 20pt;
      font-weight: 700;
      color: #1e1b4b;
    }
    .seal {
      width: 60px;
      height: 60px;
      background: linear-gradient(135deg, #4338ca, #7c3aed);
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      color: #fff;
      font-size: 24pt;
    }
    .meta-grid {
      display: grid;
      grid-template-columns: 1fr 1fr 1fr;
      gap: 12px;
      margin-top: 16px;
      font-size: 10pt;
    }
    .meta-item label {
      font-weight: 600;
      color: #6b7280;
      text-transform: uppercase;
      font-size: 8pt;
      letter-spacing: 0.08em;
      display: block;
      margin-bottom: 2px;
    }
    .meta-item span { color: #1a1a2e; }
    .turn {
      margin-bottom: 28px;
      page-break-inside: avoid;
    }
    .turn-number {
      font-size: 8pt;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.1em;
      color: #9ca3af;
      margin-bottom: 8px;
    }
    .question-block {
      background: #f0f4ff;
      border-left: 3px solid #4338ca;
      padding: 12px 16px;
      border-radius: 0 6px 6px 0;
      margin-bottom: 12px;
    }
    .question-label {
      font-size: 8pt;
      font-weight: 700;
      text-transform: uppercase;
      color: #4338ca;
      letter-spacing: 0.08em;
      margin-bottom: 4px;
    }
    .question-text { font-size: 11pt; color: #1a1a2e; }
    .answer-block {
      background: #fafafa;
      border: 1px solid #e5e7eb;
      border-radius: 6px;
      padding: 14px 16px;
    }
    .answer-label {
      font-size: 8pt;
      font-weight: 700;
      text-transform: uppercase;
      color: #6b7280;
      letter-spacing: 0.08em;
      margin-bottom: 6px;
    }
    .answer-text {
      font-size: 11pt;
      white-space: pre-wrap;
      color: #1a1a2e;
    }
    .sources-block {
      margin-top: 10px;
      padding-top: 10px;
      border-top: 1px dashed #e5e7eb;
    }
    .sources-label {
      font-size: 8pt;
      font-weight: 700;
      text-transform: uppercase;
      color: #6b7280;
      letter-spacing: 0.08em;
      margin-bottom: 6px;
    }
    .source-chip {
      display: inline-block;
      background: #ede9fe;
      color: #4c1d95;
      border-radius: 4px;
      padding: 2px 8px;
      font-size: 8pt;
      margin: 2px 4px 2px 0;
      font-family: 'Courier New', monospace;
    }
    .source-excerpt {
      font-size: 9pt;
      color: #6b7280;
      margin-top: 4px;
      font-style: italic;
    }
    .no-results-tag {
      display: inline-block;
      background: #fef3c7;
      color: #92400e;
      border-radius: 4px;
      padding: 2px 8px;
      font-size: 8pt;
      margin-bottom: 6px;
    }
    .confidence-tag {
      display: inline-block;
      padding: 2px 8px;
      border-radius: 4px;
      font-size: 8pt;
      font-weight: 600;
    }
    .confidence-high   { background: #d1fae5; color: #065f46; }
    .confidence-medium { background: #fef3c7; color: #92400e; }
    .confidence-low    { background: #fee2e2; color: #991b1b; }
    .footer {
      margin-top: 40px;
      padding-top: 16px;
      border-top: 1px solid #e5e7eb;
      font-size: 8pt;
      color: #9ca3af;
      display: flex;
      justify-content: space-between;
    }
    .disclaimer {
      font-size: 8pt;
      color: #ef4444;
      font-style: italic;
      margin-top: 24px;
      padding: 8px 12px;
      border: 1px solid #fecaca;
      border-radius: 4px;
      background: #fef2f2;
    }
  </style>
</head>
<body>

<div class="header">
  <div class="header-top">
    <div>
      <div class="org-name">Karnataka State Crime Records Bureau — PI App</div>
      <div class="doc-title">${escHtml(title)}</div>
    </div>
    <div class="seal">🔍</div>
  </div>
  <div class="meta-grid">
    <div class="meta-item">
      <label>Session ID</label>
      <span>${escHtml(session_id)}</span>
    </div>
    <div class="meta-item">
      <label>Exported By</label>
      <span>${escHtml(exported_by || 'Unknown')}</span>
    </div>
    <div class="meta-item">
      <label>Exported At</label>
      <span>${escHtml(formatDate(exported_at))}</span>
    </div>
    <div class="meta-item">
      <label>Total Turns</label>
      <span>${turns.length}</span>
    </div>
  </div>
</div>

${turnHTML}

<div class="disclaimer">
  CONFIDENTIAL — For authorised Karnataka Police personnel only.
  All access to this system is logged and audited.
  Do not reproduce or share without written authorisation.
</div>

<div class="footer">
  <span>PI App — Karnataka SCRB Crime Intelligence Platform</span>
  <span>Generated: ${escHtml(formatDate(new Date().toISOString()))}</span>
</div>

</body>
</html>`;
}

function renderTurn(turn, index) {
  const sources = Array.isArray(turn.sources) ? turn.sources : [];

  const sourceHTML = sources.length > 0
    ? `<div class="sources-block">
        <div class="sources-label">Sources cited (${sources.length})</div>
        ${sources.map(s => `
          <div>
            <span class="source-chip">${escHtml(s.crime_number || s.row_ref || `Row ${s.source_index}`)}</span>
            <span style="font-size:8pt;color:#6b7280;">via ${escHtml(s.table || 'FIR')}</span>
            ${s.excerpt ? `<div class="source-excerpt">${escHtml(s.excerpt.slice(0, 200))}</div>` : ''}
          </div>`).join('\n')}
      </div>`
    : (turn.no_results
        ? `<div class="sources-block"><span class="no-results-tag">No matching records found</span></div>`
        : '');

  const confClass = `confidence-${turn.confidence || 'low'}`;

  return `
<div class="turn">
  <div class="turn-number">Turn ${index} · ${escHtml(turn.timestamp || '')}</div>

  <div class="question-block">
    <div class="question-label">Question</div>
    <div class="question-text">${escHtml(turn.question || '')}</div>
  </div>

  <div class="answer-block">
    <div class="answer-label">
      Answer &nbsp;
      <span class="confidence-tag ${confClass}">${escHtml(turn.confidence || 'low')} confidence</span>
      ${turn.is_aggregate ? '<span class="confidence-tag" style="background:#e0e7ff;color:#3730a3;margin-left:4px;">Aggregate</span>' : ''}
    </div>
    <div class="answer-text">${escHtml(turn.answer || '')}</div>
    ${sourceHTML}
  </div>
</div>`;
}

function escHtml(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function formatDate(d) {
  try { return new Date(d).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }); }
  catch { return String(d || ''); }
}

module.exports = { renderTranscript };
