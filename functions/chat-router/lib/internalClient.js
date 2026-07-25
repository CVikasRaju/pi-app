'use strict';

/**
 * internalClient.js — HTTP client for calling other PI App Functions internally
 *
 * chat-router uses this to call:
 *   - nl-to-query      (POST)
 *   - response-composer (POST)
 *   - pdf-export       (POST)
 *
 * Each call includes x-internal-secret for auth.
 * Function URLs are configured via environment variables.
 */

const SECRETS = {
  'nl-to-query':        process.env.INTERNAL_NL_SECRET       || '',
  'response-composer':  process.env.INTERNAL_COMPOSER_SECRET  || '',
  'pdf-export':         process.env.INTERNAL_PDF_SECRET        || '',
};

const URLS = {
  'nl-to-query':        process.env.NL_TO_QUERY_URL       || 'http://localhost:9001',
  'response-composer':  process.env.RESPONSE_COMPOSER_URL  || 'http://localhost:9002',
  'pdf-export':         process.env.PDF_EXPORT_URL          || 'http://localhost:9003',
};

/**
 * Call an internal Catalyst Function with JSON body.
 * @param {string} functionName - key in URLS/SECRETS
 * @param {object} body         - JSON payload
 * @param {number} [timeout=30000]
 * @returns {Promise<object>}   - parsed JSON response
 */
async function callFunction(functionName, body, timeout = 30000) {
  const url    = URLS[functionName];
  const secret = SECRETS[functionName];

  if (!url)    throw new Error(`No URL configured for function: ${functionName}`);
  if (!secret) throw new Error(`No internal secret configured for function: ${functionName}`);

  const controller = new AbortController();
  const timer      = setTimeout(() => controller.abort(), timeout);

  try {
    const res = await fetch(url, {
      method:  'POST',
      signal:  controller.signal,
      headers: {
        'Content-Type':      'application/json',
        'x-internal-secret': secret,
      },
      body: JSON.stringify(body),
    });

    const text = await res.text();
    let data;
    try { data = JSON.parse(text); } catch { data = { raw: text }; }

    if (!res.ok) {
      const err = new Error(`${functionName} responded ${res.status}: ${data?.error || text.slice(0, 200)}`);
      err.status = res.status;
      err.data   = data;
      throw err;
    }

    return data;
  } finally {
    clearTimeout(timer);
  }
}

module.exports = { callFunction };
