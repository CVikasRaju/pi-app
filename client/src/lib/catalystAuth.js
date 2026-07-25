/**
 * catalystAuth.js — Catalyst Authentication SDK wrapper
 * Handles login, logout, session management, and user profile fetching.
 *
 * Catalyst Auth in Next.js (client-side):
 *   - Uses the Catalyst JS SDK (window.catalyst) loaded via the Catalyst-provided script tag.
 *   - Alternatively, uses raw fetch to the Catalyst Auth API for SSR-compatible calls.
 *   - Session is cookie-based (Catalyst manages the session cookie automatically).
 */

'use client';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PI_API_BASE = process.env.NEXT_PUBLIC_PI_API_URL || '';
// The Catalyst Auth login URL — Catalyst hosts this page automatically.
// Format: https://<project>.catalystappsail.com/__catalyst/auth/login
const CATALYST_AUTH_BASE = process.env.NEXT_PUBLIC_CATALYST_AUTH_BASE || '';

// ---------------------------------------------------------------------------
// Session management (client-side only)
// ---------------------------------------------------------------------------

const SESSION_KEY = 'pi_app_user';

/**
 * Store user session data in sessionStorage.
 * @param {{ id, email, firstName, lastName, role, permissions, uiHints }} userData
 */
export function setSession(userData) {
  if (typeof window === 'undefined') return;
  sessionStorage.setItem(SESSION_KEY, JSON.stringify(userData));
}

/**
 * Retrieve stored session data.
 * @returns {{ id, email, firstName, lastName, role, permissions, uiHints } | null}
 */
export function getSession() {
  if (typeof window === 'undefined') return null;
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

/**
 * Clear the stored session.
 */
export function clearSession() {
  if (typeof window === 'undefined') return;
  sessionStorage.removeItem(SESSION_KEY);
}

// ---------------------------------------------------------------------------
// getCurrentUser — fetch profile from pi-api Function
// ---------------------------------------------------------------------------

/**
 * Fetches the current authenticated user's profile + role from the pi-api Function.
 * The Catalyst session cookie is sent automatically by the browser.
 *
 * @returns {Promise<{ id, email, firstName, lastName, role, permissions, uiHints, displayName, accessLevel } | null>}
 */
export async function getCurrentUser() {
  try {
    const res = await fetch(`${PI_API_BASE}/api/auth/me`, {
      method: 'GET',
      credentials: 'include',     // send Catalyst session cookie
      headers: { 'Content-Type': 'application/json' },
    });

    if (res.status === 401 || res.status === 403) return null;
    if (!res.ok) return null;

    const data = await res.json();
    return {
      ...data.user,
      role: data.role,
      permissions: data.permissions || [],
      displayName: data.displayName || data.role,
      accessLevel: data.accessLevel || '',
      uiHints: data.uiHints || {},
    };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// login — redirect to Catalyst Auth login page
// ---------------------------------------------------------------------------

export function redirectToLogin(redirectPath = '/dashboard') {
  if (typeof window === 'undefined') return;

  // Use encodeURIComponent to ensure Catalyst parses the URL correctly
  const returnUrl = encodeURIComponent(window.location.origin + redirectPath);
  const loginUrl = `${CATALYST_AUTH_BASE}/__catalyst/auth/login?redirect_url=${returnUrl}`;

  window.location.href = loginUrl;
}

// ---------------------------------------------------------------------------
// logout
// ---------------------------------------------------------------------------

/**
 * Calls the pi-api logout endpoint (for audit logging), then clears local
 * session and redirects to the Catalyst Auth logout URL.
 */
export async function logout() {
  try {
    await fetch(`${PI_API_BASE}/api/auth/logout`, {
      method: 'POST',
      credentials: 'include',
    });
  } catch {
    // Swallow — we still clear local state
  }

  clearSession();

  // FIXED: Appended the correct Catalyst hosted auth logout path
  const logoutUrl = `${CATALYST_AUTH_BASE}/__catalyst/auth/logout`;
  window.location.href = logoutUrl;
}

// ---------------------------------------------------------------------------
// Role utility helpers
// ---------------------------------------------------------------------------

export const ROLES = {
  INVESTIGATOR: 'investigator',
  ANALYST: 'analyst',
  SUPERVISOR: 'supervisor',
  POLICYMAKER: 'policymaker',
};

export const ROLE_META = {
  investigator: {
    label: 'Investigator',
    color: '#3B82F6',   // blue
    bgColor: 'rgba(59,130,246,0.15)',
    icon: '🔍',
    description: 'Full access to assigned case details, accused & victim records',
  },
  analyst: {
    label: 'Analyst',
    color: '#8B5CF6',   // violet
    bgColor: 'rgba(139,92,246,0.15)',
    icon: '📊',
    description: 'Cross-case pattern analysis, no PII editing',
  },
  supervisor: {
    label: 'Supervisor',
    color: '#F59E0B',   // amber
    bgColor: 'rgba(245,158,11,0.15)',
    icon: '🛡️',
    description: 'Station/district oversight, case reassignment, audit log access',
  },
  policymaker: {
    label: 'Policymaker',
    color: '#10B981',   // emerald
    bgColor: 'rgba(16,185,129,0.15)',
    icon: '📋',
    description: 'Aggregate & statistical insights only — no case-level PII',
  },
};

/**
 * Returns display metadata for a role.
 * @param {string} role
 */
export function getRoleMeta(role) {
  return ROLE_META[role] || { label: role, color: '#6B7280', bgColor: 'rgba(107,114,128,0.15)', icon: '👤', description: '' };
}