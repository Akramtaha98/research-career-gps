const { Pool } = require('pg');

const isDemoMode = String(process.env.DEMO_MODE).toLowerCase() === 'true';

let pool = null;
if (!isDemoMode) {
  pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: String(process.env.PGSSL).toLowerCase() === 'true' ? { rejectUnauthorized: false } : false,
  });
}

/**
 * Thin query helper. In demo mode this throws — demo mode should always go
 * through services/store.js instead, which has an in-memory implementation.
 */
async function query(text, params) {
  if (isDemoMode) {
    throw new Error('query() called while DEMO_MODE=true — use services/store.js');
  }
  return pool.query(text, params);
}

module.exports = { pool, query, isDemoMode };
