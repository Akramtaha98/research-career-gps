const axios = require('axios');
const cron = require('node-cron');
const { pool, isDemoMode } = require('../config/db');

/**
 * Keeps the two managed services this app depends on from going to sleep on
 * their free/hobby tiers. These are two DIFFERENT idle timers with different
 * triggers, so this does two different things — pinging one does not keep
 * the other awake:
 *
 * 1. Railway (the API host) — idles the container out when no INBOUND HTTP
 *    traffic arrives on its public domain. Crucially, an internal/loopback
 *    request doesn't count: the request has to actually come in through
 *    Railway's edge. That's why selfPing() hits the app's own PUBLIC URL
 *    rather than 127.0.0.1 — a loopback ping would keep the Node process
 *    busy but wouldn't reset Railway's inbound-traffic idle timer, which is
 *    the thing that actually causes the cold start users notice as "the
 *    site took 30 seconds to load the first time".
 *
 * 2. Supabase (Postgres) — pauses a free-tier project after ~7 consecutive
 *    days with no DATABASE activity. HTTP traffic to this API doesn't count
 *    for that at all; only a real query does. touchDatabase() runs a
 *    trivial `SELECT 1`, which is enough to reset that timer and costs
 *    essentially nothing.
 *
 * Both are best-effort by design: a failed ping logs a warning and the next
 * tick tries again. This must never be able to crash the server it's
 * supposed to be keeping alive.
 */

// Railway's idle timeout is on the order of minutes, so ping well inside it.
// Every 10 minutes is ~144 requests/day — negligible load, and comfortably
// frequent enough to never let the container spin down.
const PING_CRON = '*/10 * * * *';

// Supabase's pause threshold is measured in DAYS, so this deliberately does
// NOT need to be frequent — running it alongside the 10-minute HTTP ping
// would be pointless churn against the connection pool. Once every 6 hours
// gives a ~28x safety margin against a 7-day timer even if several
// consecutive runs fail.
const DB_TOUCH_CRON = '0 */6 * * *';

const PING_TIMEOUT_MS = 8000;

/**
 * Resolves the app's own publicly-reachable base URL. Railway injects
 * RAILWAY_PUBLIC_DOMAIN automatically (hostname only, no scheme), so in the
 * normal deployment case this needs zero manual configuration. PUBLIC_URL is
 * an explicit override for anything else (a custom domain, another host, or
 * local testing).
 *
 * Returns null when neither is set — which is the expected case in local dev
 * and in tests, and correctly disables the HTTP ping rather than guessing at
 * a URL and logging a failed request every 10 minutes.
 */
function resolvePublicUrl() {
  if (process.env.PUBLIC_URL) return process.env.PUBLIC_URL.replace(/\/$/, '');
  if (process.env.RAILWAY_PUBLIC_DOMAIN) return `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`;
  return null;
}

/**
 * Hits this app's own /health endpoint over its public URL. Exported for
 * tests and manual invocation.
 *
 * @returns {Promise<{ok: boolean, skipped?: boolean, reason?: string, status?: number}>}
 */
async function selfPing() {
  const baseUrl = resolvePublicUrl();
  if (!baseUrl) {
    return { ok: false, skipped: true, reason: 'no PUBLIC_URL or RAILWAY_PUBLIC_DOMAIN set' };
  }
  try {
    const res = await axios.get(`${baseUrl}/health`, {
      timeout: PING_TIMEOUT_MS,
      // Identifies these in access logs so the traffic isn't mistaken for
      // real users inflating analytics or for a bot hammering /health.
      headers: { 'User-Agent': 'research-gps-keepalive/1.0' },
    });
    return { ok: true, status: res.status };
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('Keep-alive self-ping failed:', err.message);
    return { ok: false, reason: err.message };
  }
}

/**
 * Runs a trivial query so Supabase counts the project as active. Exported
 * for tests and manual invocation.
 *
 * @returns {Promise<{ok: boolean, skipped?: boolean, reason?: string}>}
 */
async function touchDatabase() {
  if (isDemoMode || !pool) {
    return { ok: false, skipped: true, reason: 'demo mode, no database to keep alive' };
  }
  try {
    await pool.query('SELECT 1');
    return { ok: true };
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('Keep-alive database touch failed:', err.message);
    return { ok: false, reason: err.message };
  }
}

/**
 * Starts both keep-alive schedules.
 *
 * Set ENABLE_KEEP_ALIVE=false to disable — worth doing if you move to a
 * paid Railway plan that never idles and a Supabase plan that never pauses,
 * since at that point this is just noise in the logs. Also skipped
 * automatically when there's no public URL to ping (local dev), so running
 * the server locally doesn't spam warnings.
 */
function startKeepAlive() {
  if (process.env.ENABLE_KEEP_ALIVE === 'false') {
    // eslint-disable-next-line no-console
    console.log('Keep-alive disabled (ENABLE_KEEP_ALIVE=false).');
    return;
  }

  const baseUrl = resolvePublicUrl();
  if (baseUrl) {
    cron.schedule(PING_CRON, () => {
      selfPing().catch(() => {
        // selfPing already logs and never rejects; this is belt-and-braces
        // so an unexpected throw can't take down the cron tick.
      });
    });
    // eslint-disable-next-line no-console
    console.log(`Keep-alive: pinging ${baseUrl}/health every 10 minutes to prevent Railway idle-sleep.`);
  } else {
    // eslint-disable-next-line no-console
    console.log('Keep-alive: HTTP self-ping skipped (set PUBLIC_URL or deploy on Railway to enable).');
  }

  if (!isDemoMode && pool) {
    cron.schedule(DB_TOUCH_CRON, () => {
      touchDatabase().catch(() => {
        // see comment above
      });
    });
    // eslint-disable-next-line no-console
    console.log('Keep-alive: touching the database every 6 hours to prevent Supabase free-tier pausing.');
  }
}

module.exports = { startKeepAlive, selfPing, touchDatabase, resolvePublicUrl };
