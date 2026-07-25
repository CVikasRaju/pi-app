/**
 * api.js — Typed API client for the PI App pi-api Function
 * Attaches Catalyst session cookie automatically (credentials: 'include').
 */

'use client';

const BASE = process.env.NEXT_PUBLIC_PI_API_URL || '';

// ---------------------------------------------------------------------------
// Core fetch wrapper
// ---------------------------------------------------------------------------

async function apiFetch(path, options = {}) {
  const res = await fetch(`${BASE}${path}`, {
    ...options,
    credentials: 'include',
    headers: {
      'Content-Type':  'application/json',
      'X-Request-Id':  generateRequestId(),
      ...(options.headers || {}),
    },
  });

  if (res.status === 204) return null;

  const data = await res.json().catch(() => null);

  if (!res.ok) {
    const err = new Error(data?.error || `HTTP ${res.status}`);
    err.status = res.status;
    err.data   = data;
    throw err;
  }

  return data;
}

// ---------------------------------------------------------------------------
// Auth endpoints
// ---------------------------------------------------------------------------

export const auth = {
  me:     () => apiFetch('/api/auth/me'),
  logout: () => apiFetch('/api/auth/logout', { method: 'POST' }),
};

// ---------------------------------------------------------------------------
// FIR endpoints
// ---------------------------------------------------------------------------

export const fir = {
  /**
   * List FIRs with optional filters.
   * @param {{ station_id?, status_id?, year?, from_date?, to_date?, page?, pageSize? }} params
   */
  list: (params = {}) => {
    const qs = new URLSearchParams(
      Object.fromEntries(Object.entries(params).filter(([, v]) => v != null))
    ).toString();
    return apiFetch(`/api/fir${qs ? '?' + qs : ''}`);
  },

  /**
   * Get single FIR detail with accused and victims.
   * @param {number|string} id
   */
  get: (id) => apiFetch(`/api/fir/${id}`),

  /**
   * Get aggregate FIR statistics (safe for all roles).
   */
  stats: () => apiFetch('/api/fir/stats'),
};

// ---------------------------------------------------------------------------
// Health
// ---------------------------------------------------------------------------

export const health = {
  check: () => apiFetch('/api/health'),
};

// ---------------------------------------------------------------------------
// Utility
// ---------------------------------------------------------------------------

function generateRequestId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}
