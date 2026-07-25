/**
 * /login — Catalyst Auth login page
 *
 * Two flows:
 *   1. Email/password login: calls Catalyst Auth JS SDK (window.catalyst or fetch)
 *   2. "Sign in via Catalyst" button: redirects to the Catalyst Auth hosted page
 *
 * After successful login, pi-api /api/auth/me is called to get role, then
 * session is stored in sessionStorage and user is redirected to /dashboard.
 */

'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { getSession, getCurrentUser, setSession, redirectToLogin } from '../../lib/catalystAuth';

const CATALYST_AUTH_BASE = process.env.NEXT_PUBLIC_CATALYST_AUTH_BASE || '';
const PI_API_BASE = process.env.NEXT_PUBLIC_PI_API_URL || '';

export default function LoginPage() {
  const router = useRouter();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);
  const [error, setError] = useState('');

  // If already logged in, skip to dashboard
  useEffect(() => {
    const cached = getSession();
    if (cached) { router.replace('/dashboard'); return; }

    getCurrentUser().then(u => {
      if (u) { setSession(u); router.replace('/dashboard'); }
      else { setCheckingSession(false); }
    });
  }, [router]);

  // ---------------------------------------------------------------------------
  // Email + password sign-in
  // ---------------------------------------------------------------------------

  async function handleEmailLogin(e) {
    e.preventDefault();
    if (!email || !password) {
      setError('Please enter your email and password.');
      return;
    }

    setLoading(true);
    setError('');

    try {
      // Step 1: Authenticate with Catalyst Auth API
      const authRes = await fetch(`${CATALYST_AUTH_BASE}/login`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ zaid: email, password }),
      });

      if (!authRes.ok) {
        const body = await authRes.json().catch(() => ({}));
        throw new Error(body.message || body.error || 'Invalid credentials');
      }

      // Step 2: Fetch role from pi-api
      const user = await getCurrentUser();
      if (!user) throw new Error('Authentication succeeded but unable to retrieve user profile.');

      setSession(user);
      router.replace('/dashboard');

    } catch (err) {
      setError(err.message || 'Login failed. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  // ---------------------------------------------------------------------------
  // Catalyst-hosted login redirect
  // ---------------------------------------------------------------------------

  function handleCatalystLogin() {
    if (CATALYST_AUTH_BASE) {
      // Get current origin and swap localhost for local.myapp.com to bypass Catalyst's regex check
      let origin = typeof window !== 'undefined' ? window.location.origin : 'http://local.myapp.com:3000';
      if (origin.includes('localhost')) {
        origin = origin.replace('localhost', 'local.myapp.com');
      }

      const returnUrl = `${origin}/dashboard`;
      const baseUrl = CATALYST_AUTH_BASE.replace(/\/$/, '');

      // Direct redirect to Hosted Auth using the whitelisted domain
      window.location.href = `${baseUrl}/__catalyst/auth/login?redirect_url=${encodeURIComponent(returnUrl)}`;
    } else {
      setError('Catalyst Auth URL not configured. Set NEXT_PUBLIC_CATALYST_AUTH_BASE in your .env.');
    }
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  if (checkingSession) {
    return (
      <div className="auth-loading-screen">
        <div className="auth-spinner-wrap">
          <div className="auth-spinner" />
          <p className="auth-loading-text">Checking session…</p>
        </div>
      </div>
    );
  }

  return (
    <main className="login-page" id="login-main">
      <div className="login-card glass-card animate-fade-in">

        {/* Logo / Emblem */}
        <div className="login-logo-area">
          <div className="login-emblem" aria-hidden="true">🔍</div>
          <h1 className="login-title">PI App</h1>
          <p className="login-subtitle">
            Karnataka SCRB · Crime Intelligence Platform
          </p>
        </div>

        {/* Error banner */}
        {error && (
          <div className="login-error-banner" role="alert" id="login-error">
            <span aria-hidden="true">⚠️</span>
            {error}
          </div>
        )}

        {/* Email / Password form */}
        <form
          className="login-form"
          onSubmit={handleEmailLogin}
          id="login-form"
          noValidate
        >
          <div className="form-group">
            <label className="form-label" htmlFor="login-email">
              Email address
            </label>
            <input
              id="login-email"
              type="email"
              className={`form-input${error ? ' error' : ''}`}
              placeholder="officer@ksp.gov.in"
              value={email}
              onChange={e => { setEmail(e.target.value); setError(''); }}
              autoComplete="email"
              required
              disabled={loading}
            />
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="login-password">
              Password
            </label>
            <input
              id="login-password"
              type="password"
              className={`form-input${error ? ' error' : ''}`}
              placeholder="••••••••"
              value={password}
              onChange={e => { setPassword(e.target.value); setError(''); }}
              autoComplete="current-password"
              required
              disabled={loading}
            />
          </div>

          <button
            id="login-submit-btn"
            type="submit"
            className="btn btn-primary"
            disabled={loading}
            style={{ width: '100%', padding: '14px', fontSize: '0.95rem' }}
          >
            {loading ? (
              <><span className="btn-spinner" /> Signing in…</>
            ) : (
              'Sign in'
            )}
          </button>
        </form>

        {/* Divider */}
        <div className="login-divider" style={{ marginTop: '24px', marginBottom: '20px' }}>
          or
        </div>

        {/* Catalyst Auth redirect button */}
        <button
          id="login-catalyst-btn"
          type="button"
          className="login-catalyst-btn"
          onClick={handleCatalystLogin}
          disabled={loading}
        >
          <span style={{ fontSize: '1.1rem' }}>⚡</span>
          Sign in via Catalyst Auth
        </button>

        {/* Footer */}
        <div className="login-footer">
          <span>Authorised personnel only · Karnataka State Police</span>
          <br />
          <span>All access is logged and audited</span>
        </div>
      </div>
    </main>
  );
}