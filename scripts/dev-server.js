'use strict';

/**
 * dev-server.js — Standalone local development HTTP server for pi_app_function
 * Allows running the backend locally on port 3001 without requiring Java / catalyst serve.
 */

const http = require('http');
const handler = require('../functions/pi_app_function/index.js');

const PORT = process.env.PORT || 3001;

const server = http.createServer((req, res) => {
  handler(req, res).catch(err => {
    console.error('[dev-server] Handler error:', err);
    if (!res.headersSent) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Internal server error', message: err.message }));
    }
  });
});

server.listen(PORT, () => {
  console.log(`\n==================================================`);
  console.log(`⚡ PI App Backend Dev Server running on port ${PORT}`);
  console.log(`👉 Health Check: http://localhost:${PORT}/api/health`);
  console.log(`==================================================\n`);
});
