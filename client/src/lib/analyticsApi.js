'use strict';

/**
 * analyticsApi.js — Client API for Phase 4 Analytics & ML endpoints
 */

const BASE_URL = process.env.NEXT_PUBLIC_API_URL || '/api';

async function apiFetch(path, options = {}) {
  const res = await fetch(`${BASE_URL}${path}`, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    ...options,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || err.message || `HTTP ${res.status}`);
  }
  return res.json();
}

export const analyticsApi = {
  // Risk scoring
  scoreAccused: (payload) =>
    apiFetch('/api/ml/risk', { method: 'POST', body: JSON.stringify(payload) }),

  batchScore: (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return apiFetch(`/api/ml/risk/batch${qs ? `?${qs}` : ''}`);
  },

  // Hotspots & trends
  getHotspots: (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return apiFetch(`/api/analytics/hotspots${qs ? `?${qs}` : ''}`);
  },

  getTrends: (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return apiFetch(`/api/analytics/trends${qs ? `?${qs}` : ''}`);
  },

  // Demographics
  getDemographics: (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return apiFetch(`/api/analytics/demographics${qs ? `?${qs}` : ''}`);
  },

  getSensitiveAggregates: (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return apiFetch(`/api/analytics/sensitive${qs ? `?${qs}` : ''}`);
  },

  // Alerts feed
  getAlerts: () => apiFetch('/api/analytics/alerts'),
};
