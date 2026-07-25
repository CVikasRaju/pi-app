/**
 * /dashboard — Protected main dashboard
 *
 * What it shows (Phase 0):
 *   - Welcome header with user name + role badge
 *   - Access level tag (what this role can see)
 *   - Phase 0 banner (conversational features coming in Phase 1)
 *   - FIR aggregate stats (calls /api/fir/stats — all roles)
 *   - Policymaker notice (if role = policymaker)
 *   - Role capabilities card
 *   - Logout button
 *
 * Protected via ProtectedRoute — redirects to /login if not authenticated.
 */

'use client';

import { useState, useEffect } from 'react';
import { useRouter }            from 'next/navigation';
import ProtectedRoute           from '../../components/ProtectedRoute';
import RoleBadge                from '../../components/RoleBadge';
import { logout }               from '../../lib/catalystAuth';
import { fir as firApi }        from '../../lib/api';

export default function DashboardPage() {
  return (
    <ProtectedRoute>
      {({ user }) => <DashboardContent user={user} />}
    </ProtectedRoute>
  );
}

function DashboardContent({ user }) {
  const router = useRouter();
  const [stats,       setStats]       = useState(null);
  const [statsError,  setStatsError]  = useState('');
  const [loggingOut,  setLoggingOut]  = useState(false);

  useEffect(() => {
    firApi.stats()
      .then(data => setStats(data?.data || null))
      .catch(err => setStatsError(err.message || 'Failed to load stats'));
  }, []);

  async function handleLogout() {
    setLoggingOut(true);
    await logout();
  }

  const firstName = user.firstName || user.email?.split('@')[0] || 'Officer';

  return (
    <div className="dashboard-page">
      {/* ── Header ───────────────────────────────────────────────────── */}
      <header className="app-header" id="app-header">
        <div>
          <div className="app-logo">PI App</div>
          <div className="app-logo-sub">Karnataka SCRB</div>
        </div>

        <div className="flex items-center gap-3">
          <RoleBadge role={user.role} size="sm" />
          <span
            style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}
          >
            {user.email}
          </span>
          <button
            id="logout-btn"
            className="btn btn-ghost"
            style={{ padding: '8px 16px', fontSize: '0.8rem' }}
            onClick={handleLogout}
            disabled={loggingOut}
          >
            {loggingOut ? 'Signing out…' : 'Sign out'}
          </button>
        </div>
      </header>

      {/* ── Main ─────────────────────────────────────────────────────── */}
      <main className="dashboard-main" id="dashboard-main">

        {/* Welcome */}
        <section className="dashboard-hero animate-fade-in" id="dashboard-hero">
          <h1 className="dashboard-welcome">
            Welcome back, <span>{firstName}</span>
          </h1>
          <div className="dashboard-role-row">
            <RoleBadge role={user.role} size="md" showDescription />
            <span className="dashboard-access-tag">{user.accessLevel}</span>
          </div>
        </section>

        {/* Phase 5 banner */}
        <div className="phase-banner animate-fade-in animate-delay-100" id="phase-banner">
          <span className="phase-badge">Phase 5</span>
          <span>
            XAI & Governance Hardening is live. Every chat response now includes a
            <strong style={{ color: 'var(--text-primary)' }}> Reasoning Path</strong> showing
            exactly how the answer was derived. Policymaker audit lockdown and CI/CD pipelines are active.
          </span>
        </div>

        {/* Policymaker aggregate-only notice */}
        {user.role === 'policymaker' && (
          <div className="policymaker-notice animate-fade-in animate-delay-200" id="policymaker-notice" role="note">
            <span style={{ fontSize: '1.2rem' }}>📋</span>
            <div>
              <strong style={{ color: 'var(--success)' }}>Aggregate-only access</strong>
              <p style={{ marginTop: '4px', color: 'var(--text-secondary)' }}>
                Your role provides statistical and aggregated insights only.
                No individual case records, accused names, or victim details are accessible from this account.
              </p>
            </div>
          </div>
        )}

        {/* ── Stats Grid ───────────────────────────────────────────── */}
        <div className="section-header animate-fade-in animate-delay-200">
          <span className="section-title">FIR Overview</span>
          <div className="section-line" />
        </div>

        {statsError && (
          <div
            className="login-error-banner animate-fade-in"
            id="stats-error"
            style={{ marginBottom: '24px' }}
          >
            <span>⚠️</span> {statsError}
          </div>
        )}

        <div className="stats-grid" id="stats-grid">
          <StatCard
            id="stat-total-firs"
            label="Total FIRs"
            value={stats ? String(stats.total) : '—'}
            icon="📁"
            sub="All registered cases"
            delay="animate-delay-200"
          />
          <StatCard
            id="stat-active-cases"
            label="Under Investigation"
            value={
              stats?.byStatus
                ? String(stats.byStatus.find(s => s.status_name === 'Under Investigation')?.count || 0)
                : '—'
            }
            icon="🔍"
            sub="Currently active cases"
            delay="animate-delay-300"
          />
          <StatCard
            id="stat-chargesheeted"
            label="Chargesheeted"
            value={
              stats?.byStatus
                ? String(stats.byStatus.find(s => s.status_name === 'Chargesheeted')?.count || 0)
                : '—'
            }
            icon="📋"
            sub="Filed to court"
            delay="animate-delay-400"
          />
          <StatCard
            id="stat-this-year"
            label="Current Year"
            value={
              stats?.byYear
                ? String(stats.byYear.find(y => y.year === new Date().getFullYear())?.count || 0)
                : '—'
            }
            icon="📅"
            sub={`FIRs in ${new Date().getFullYear()}`}
            delay="animate-delay-400"
          />
        </div>

        {/* ── Role Capabilities ────────────────────────────────────── */}
        <div className="section-header animate-fade-in animate-delay-300" style={{ marginTop: '16px' }}>
          <span className="section-title">Your Access</span>
          <div className="section-line" />
        </div>

        <div
          className="glass-card animate-fade-in animate-delay-300"
          id="role-capabilities-card"
          style={{ padding: '28px' }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '20px' }}>
            <RoleBadge role={user.role} size="lg" showIcon />
            <div>
              <div style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', marginTop: '4px' }}>
                {user.accessLevel}
              </div>
            </div>
          </div>

          {user.permissions && user.permissions.length > 0 && (
            <>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '12px' }}>
                Permitted operations
              </p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                {user.permissions.map(p => (
                  <span
                    key={p}
                    style={{
                      padding:       '4px 12px',
                      background:    'rgba(255,255,255,0.04)',
                      border:        '1px solid var(--border-subtle)',
                      borderRadius:  'var(--radius-full)',
                      fontSize:      '0.75rem',
                      color:         'var(--text-secondary)',
                      fontFamily:    'monospace',
                    }}
                  >
                    {p}
                  </span>
                ))}
              </div>
            </>
          )}

          {user.uiHints?.aggregateOnly && (
            <p style={{ marginTop: '16px', color: 'var(--text-muted)', fontSize: '0.875rem' }}>
              ⚠️ Only aggregate/statistical endpoints are accessible to this role.
              Row-level FIR and PII data is not returned.
            </p>
          )}
        </div>

        {/* ── Chat CTA ─────────────────────────────────────────────── */}
        <div
          className="glass-card chat-cta-card animate-fade-in animate-delay-300"
          id="chat-cta-card"
          onClick={() => router.push('/chat')}
          role="button"
          tabIndex={0}
          onKeyDown={e => e.key === 'Enter' && router.push('/chat')}
          style={{ marginBottom: '16px' }}
        >
          <div className="chat-cta-icon">💬</div>
          <div>
            <div className="chat-cta-title">Open Intelligence Chat</div>
            <div className="chat-cta-sub">
              Ask questions in plain English or Kannada. Every answer cites the FIR records it used.
              {user.role === 'policymaker' && ' Aggregate insights only for your role.'}
            </div>
          </div>
          <span style={{ marginLeft: 'auto', color: 'var(--text-muted)', fontSize: '1.2rem' }}>→</span>
        </div>

        {/* ── Graph CTA ─────────────────────────────────────────────── */}
        <div
          className="glass-card chat-cta-card animate-fade-in animate-delay-300"
          id="graph-cta-card"
          onClick={() => router.push('/graph')}
          role="button"
          tabIndex={0}
          onKeyDown={e => e.key === 'Enter' && router.push('/graph')}
          style={{ marginBottom: '16px', borderLeft: '4px solid #6366F1' }}
        >
          <div className="chat-cta-icon" style={{ background: 'linear-gradient(135deg, #4338CA, #6366F1)' }}>🌐</div>
          <div>
            <div className="chat-cta-title">Open Network Graph Intelligence</div>
            <div className="chat-cta-sub">
              Interactive relationship visualization — surface repeat offender networks, shared bank accounts, and multi-case links.
            </div>
          </div>
          <span style={{ marginLeft: 'auto', color: 'var(--text-muted)', fontSize: '1.2rem' }}>→</span>
        </div>

        {/* ── Analytics CTA ──────────────────────────────────────────── */}
        <div
          className="glass-card chat-cta-card animate-fade-in animate-delay-300"
          id="analytics-cta-card"
          onClick={() => router.push('/analytics')}
          role="button"
          tabIndex={0}
          onKeyDown={e => e.key === 'Enter' && router.push('/analytics')}
          style={{ marginBottom: '20px', borderLeft: '4px solid #7C3AED' }}
        >
          <div className="chat-cta-icon" style={{ background: 'linear-gradient(135deg, #6D28D9, #7C3AED)' }}>📊</div>
          <div>
            <div className="chat-cta-title">Open Analytics & ML Dashboard</div>
            <div className="chat-cta-sub">
              Zia AutoML recidivism risk scoring, geospatial hotspot maps, demographic cross-referencing, and early-warning alerts.
            </div>
          </div>
          <span style={{ marginLeft: 'auto', color: 'var(--text-muted)', fontSize: '1.2rem' }}>→</span>
        </div>

        {/* ── Audit log notice ─────────────────────────────────────── */}
        <div
          className="glass-card animate-fade-in animate-delay-400"
          id="audit-notice-card"
          style={{
            padding:     '16px 24px',
            marginTop:   '20px',
            display:     'flex',
            alignItems:  'center',
            gap:         '12px',
            borderColor: 'rgba(99,102,241,0.12)',
          }}
        >
          <span style={{ fontSize: '1.1rem' }}>🔒</span>
          <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>
            All data access on this platform is logged to an immutable audit trail. Your session activity is recorded.
          </span>
        </div>

      </main>
    </div>
  );
}

// ---------------------------------------------------------------------------
// StatCard sub-component
// ---------------------------------------------------------------------------

function StatCard({ id, label, value, icon, sub, delay }) {
  return (
    <div className={`glass-card glass-card-hover stat-card animate-fade-in ${delay}`} id={id}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
        <span className="stat-label">{label}</span>
        <span style={{ fontSize: '1.4rem' }}>{icon}</span>
      </div>
      <div className="stat-value">{value}</div>
      {sub && <div className="stat-sub">{sub}</div>}
    </div>
  );
}
