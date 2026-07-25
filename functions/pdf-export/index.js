'use strict';

/**
 * pdf-export — Catalyst Function (advancedio)
 * Karnataka SCRB PI App — Phase 1
 *
 * POST /api/chat/pdf
 *   Body: { session_id, title? }
 *   Auth: Catalyst session cookie (user must be authenticated)
 *   Returns: application/pdf binary stream
 *
 * Flow:
 *   1. Auth check (Catalyst session)
 *   2. RBAC: policymaker cannot export (only investigator/supervisor/analyst)
 *   3. Fetch conversation history from NoSQL (historyStore)
 *   4. Render HTML transcript (transcriptRenderer)
 *   5. Call SmartBrowz convertToPdf → pipe binary to response
 *   6. Audit log CHAT_PDF_EXPORT
 */

const catalyst   = require('zcatalyst-sdk-node');

const { getHistory }        = require('./lib/historyStore');
const { renderTranscript }  = require('./lib/transcriptRenderer');

// Roles that cannot export PDF
const PDF_DENIED_ROLES = ['policymaker'];

// ---------------------------------------------------------------------------
// Re-export historyStore from chat-router (shared lib pattern)
// Since functions are separate deployments, pdf-export has its own copy.
// In production, consider a shared Lambda Layer / npm workspace.
// ---------------------------------------------------------------------------

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let d = '';
    req.on('data', c => { d += c; });
    req.on('end',  () => { try { resolve(JSON.parse(d || '{}')); } catch { resolve({}); } });
    req.on('error', reject);
  });
}

module.exports = async (req, res) => {
  // CORS
  const origin = req.headers.origin || process.env.CLIENT_ORIGIN || 'http://localhost:3000';
  res.setHeader('Access-Control-Allow-Origin',      origin);
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Methods',     'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers',     'Content-Type, Authorization');

  if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }
  if (req.method !== 'POST') {
    res.writeHead(405);
    return res.end(JSON.stringify({ error: 'Method not allowed' }));
  }

  const catalystApp = catalyst.initialize(req);

  // ── Auth ──────────────────────────────────────────────────────────────────
  let user;
  try {
    const cu     = await catalystApp.authentication().getUser();
    const groups = (await cu.getGroupDetails?.()) || [];
    const role   = groups[0]?.group_name || 'investigator';
    user = { userId: cu.user_id || cu.userId, email: cu.email_id || cu.email, role };
  } catch {
    res.writeHead(401, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ error: 'Unauthorized' }));
  }

  // ── RBAC ──────────────────────────────────────────────────────────────────
  if (PDF_DENIED_ROLES.includes(user.role)) {
    res.writeHead(403, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ error: 'PDF export is not available for policymaker role.' }));
  }

  // ── Parse request ─────────────────────────────────────────────────────────
  const body       = await parseBody(req);
  const session_id = body.session_id;
  const title      = body.title || `Intelligence Query Transcript — ${session_id?.slice(0, 8) || 'Unknown'}`;

  if (!session_id) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ error: 'session_id is required' }));
  }

  // ── Fetch history ─────────────────────────────────────────────────────────
  let turns;
  try {
    turns = await getHistory(catalystApp, session_id);
  } catch (err) {
    console.error('[pdf-export] getHistory error:', err.message);
    turns = [];
  }

  if (turns.length === 0) {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ error: 'No conversation history found for this session.' }));
  }

  // ── Render HTML ───────────────────────────────────────────────────────────
  const html = renderTranscript({
    title,
    session_id,
    turns,
    exported_by: user.email,
    exported_at: new Date().toISOString(),
  });

  // ── SmartBrowz PDF ────────────────────────────────────────────────────────
  try {
    const smartbrowz = catalystApp.smartbrowz();
    const pdfBuffer  = await smartbrowz.convertToPdf(html, {
      pdf_options: {
        format:                'A4',
        print_background:      true,
        display_header_footer: true,
        margin: { top: '16mm', bottom: '16mm', left: '12mm', right: '12mm' },
        header_template:
          `<span style="font-size:9px;color:#9ca3af;font-family:sans-serif;margin-left:16px;">
            Karnataka SCRB PI App — Confidential
          </span>`,
        footer_template:
          `<span style="font-size:9px;color:#9ca3af;font-family:sans-serif;width:100%;text-align:right;margin-right:16px;">
            Page <span class="pageNumber"></span> of <span class="totalPages"></span>
          </span>`,
      },
    });

    const filename = `pi-app-transcript-${session_id.slice(0, 8)}-${Date.now()}.pdf`;

    res.setHeader('Content-Type',        'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.writeHead(200);

    // pdfBuffer may be a Buffer or a readable stream
    if (Buffer.isBuffer(pdfBuffer)) {
      res.end(pdfBuffer);
    } else if (pdfBuffer?.pipe) {
      pdfBuffer.pipe(res);
    } else {
      res.end(Buffer.from(pdfBuffer));
    }

  } catch (err) {
    console.error('[pdf-export] SmartBrowz error:', err.message);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'PDF generation failed', message: err.message }));
    return;
  }

  // ── Audit ─────────────────────────────────────────────────────────────────
  try {
    const auditUrl    = process.env.AUDIT_LOGGER_URL || 'http://localhost:9005';
    const auditSecret = process.env.INTERNAL_AUDIT_SECRET || '';
    await fetch(`${auditUrl}/internal/audit`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', 'x-audit-secret': auditSecret },
      body: JSON.stringify({
        userId:     user.userId, userEmail: user.email, role: user.role,
        action:     'CHAT_PDF_EXPORT',
        tableName:  'ConversationTurn',
        recordId:   session_id,
        queryParams: { title, turns_count: turns.length },
        statusCode: 200, isSensitive: false,
      }),
    });
  } catch { /* audit failures must not break export */ }
};
