/**
 * /analytics — Analytics & ML Dashboard (Phase 4)
 *
 * Sections:
 *   1. Risk Scorer (investigator / analyst / supervisor)
 *   2. Hotspot Map (all roles)
 *   3. Trend Chart (all roles)
 *   4. Demographics Panel (all roles; sensitive tab: supervisor / policymaker)
 *   5. Early Warning Alerts Feed (supervisor only)
 *
 * Protected via ProtectedRoute.
 */

'use client';

import { useRouter } from 'next/navigation';
import ProtectedRoute from '../../components/ProtectedRoute';
import RiskScoreCard    from '../../components/RiskScoreCard';
import HotspotMap       from '../../components/HotspotMap';
import TrendChart       from '../../components/TrendChart';
import DemographicsPanel from '../../components/DemographicsPanel';
import AlertsFeed       from '../../components/AlertsFeed';

export default function AnalyticsPage() {
  return (
    <ProtectedRoute>
      {({ user }) => <AnalyticsContent user={user} />}
    </ProtectedRoute>
  );
}

function AnalyticsContent({ user }) {
  const router = useRouter();
  const role = user.role;

  const canSeeRisk   = ['investigator', 'analyst', 'supervisor'].includes(role);
  const canSeeAlerts = role === 'supervisor';

  return (
    <div className="analytics-page" id="analytics-page">
      {/* Header */}
      <header className="app-header" id="analytics-header">
        <div>
          <div className="app-logo">PI App</div>
          <div className="app-logo-sub">Karnataka SCRB</div>
        </div>
        <div className="flex items-center gap-3">
          <button
            id="back-to-dashboard"
            className="btn btn-ghost"
            style={{ padding: '8px 16px', fontSize: '0.8rem' }}
            onClick={() => router.push('/dashboard')}
          >
            ← Dashboard
          </button>
        </div>
      </header>

      <main className="analytics-main" id="analytics-main">

        {/* Page title */}
        <div className="analytics-hero animate-fade-in" id="analytics-hero">
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
            <div style={{
              width: 52, height: 52,
              borderRadius: 'var(--radius-md)',
              background: 'linear-gradient(135deg, #7C3AED, #6366F1)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '1.6rem',
            }}>📊</div>
            <div>
              <h1 style={{ margin: 0, fontSize: '1.6rem', fontWeight: 800, color: 'var(--text-primary)' }}>
                Analytics & Intelligence
              </h1>
              <div style={{ fontSize: '0.875rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                Phase 4 · Zia AutoML · Hotspot detection · Sociological cross-referencing · Early warning
              </div>
            </div>
          </div>
        </div>

        {/* Phase 4 banner */}
        <div className="phase-banner animate-fade-in animate-delay-100" id="analytics-phase-banner" style={{ marginBottom: '28px' }}>
          <span className="phase-badge">Phase 4</span>
          <span>
            Analytics & ML is live. Zia AutoML recidivism scoring, geospatial hotspot detection,
            demographic cross-referencing, and Catalyst Circuits early-warning pipeline are active.
          </span>
        </div>

        {/* ── Row 1: Risk + Trends ────────────────────────────────── */}
        <div className="analytics-grid-2" id="analytics-row-1">
          {canSeeRisk ? (
            <div className="animate-fade-in animate-delay-200">
              <RiskScoreCard />
            </div>
          ) : (
            <div className="glass-card animate-fade-in animate-delay-200" style={{ padding: '28px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: '0.875rem' }}>
              🔒 Risk scoring is not available for Policymaker role (PII restriction)
            </div>
          )}
          <div className="animate-fade-in animate-delay-300">
            <TrendChart />
          </div>
        </div>

        {/* ── Row 2: Hotspot Map ─────────────────────────────────── */}
        <div className="animate-fade-in animate-delay-300" id="analytics-row-2" style={{ marginBottom: '24px' }}>
          <HotspotMap />
        </div>

        {/* ── Row 3: Demographics + Alerts ───────────────────────── */}
        <div className="analytics-grid-2" id="analytics-row-3">
          <div className="animate-fade-in animate-delay-400">
            <DemographicsPanel userRole={role} />
          </div>
          {canSeeAlerts ? (
            <div className="animate-fade-in animate-delay-400">
              <AlertsFeed />
            </div>
          ) : (
            <div className="glass-card animate-fade-in animate-delay-400" style={{ padding: '28px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: '0.875rem' }}>
              🔒 Early warning alerts feed is available to Supervisors only
            </div>
          )}
        </div>

        {/* Footer note */}
        <div
          style={{
            marginTop: '32px', padding: '16px 24px',
            background: 'rgba(255,255,255,0.02)', borderRadius: 'var(--radius-md)',
            border: '1px solid var(--border-subtle)',
            fontSize: '0.78rem', color: 'var(--text-muted)',
            display: 'flex', alignItems: 'center', gap: '10px',
          }}
          id="analytics-footer-note"
        >
          <span>🔒</span>
          <span>
            All analytics access is logged to the immutable AuditLog. Caste/religion data is returned
            as rounded aggregate percentages only — never at individual record level (per architecture §4a).
            Risk scores use Zia AutoML classification; mock scores are returned in local dev.
          </span>
        </div>
      </main>
    </div>
  );
}
