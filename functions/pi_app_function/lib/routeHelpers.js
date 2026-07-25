'use strict';

/**
 * routeHelpers.js — HTTP routing + response utilities for the pi-api Function
 */

/**
 * Parse the URL path and method into a route key.
 * e.g. "GET /api/fir" → { method: 'GET', segments: ['api', 'fir'], params: {} }
 */
function parseRoute(req) {
  const rawUrl  = req.url || '/';
  const [path]  = rawUrl.split('?');
  const query   = parseQueryString(rawUrl);
  const segments = path.replace(/^\/+|\/+$/g, '').split('/').filter(Boolean);
  return { method: req.method.toUpperCase(), segments, query, path };
}

/**
 * Parse query string from URL.
 */
function parseQueryString(url) {
  const idx = url.indexOf('?');
  if (idx === -1) return {};
  const qs = url.slice(idx + 1);
  return Object.fromEntries(new URLSearchParams(qs));
}

/**
 * Parse JSON body from request stream.
 */
function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      if (!body) return resolve({});
      try { resolve(JSON.parse(body)); }
      catch (e) { reject(new Error('Invalid JSON body')); }
    });
    req.on('error', reject);
  });
}

/**
 * Send a JSON response.
 */
function sendJSON(res, status, data) {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    'Content-Type':                'application/json',
    'X-Content-Type-Options':      'nosniff',
    'X-Frame-Options':             'DENY',
    'Strict-Transport-Security':   'max-age=31536000; includeSubDomains',
  });
  res.end(body);
}

/**
 * Send a 404.
 */
function send404(res) {
  sendJSON(res, 404, { error: 'Route not found' });
}

/**
 * Send a method-not-allowed.
 */
function send405(res) {
  sendJSON(res, 405, { error: 'Method not allowed' });
}

/**
 * Paginate a Catalyst datastore query.
 * Returns { page, pageSize, offset }.
 */
function getPagination(query) {
  const page     = Math.max(1, parseInt(query.page || '1', 10));
  const pageSize = Math.min(100, Math.max(1, parseInt(query.pageSize || '20', 10)));
  const offset   = (page - 1) * pageSize;
  return { page, pageSize, offset };
}

module.exports = { parseRoute, parseBody, sendJSON, send404, send405, getPagination };
