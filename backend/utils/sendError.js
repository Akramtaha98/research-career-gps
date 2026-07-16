/**
 * Shared error-response helper. Preserves every controller's existing
 * convention of throwing an Error with a `.statusCode` to control both the
 * HTTP status AND the message shown to the client (see e.g.
 * store.js#addManualPaper, middleware/requirePro.js) -- those are
 * intentional, deliberately user-facing messages ("This paper is already in
 * your tracked list.", "This feature requires a Pro subscription") and are
 * always safe to return as-is, at any status below 500.
 *
 * For a genuine 500 (no statusCode -- an unexpected crash, DB error,
 * upstream API failure, a bug), the raw err.message can leak internal
 * details never meant for a client: connection strings, file paths,
 * third-party API internals, stack fragments. In production this responds
 * with a generic fallback instead, after logging the real error
 * server-side; in development/test it still returns err.message so local
 * debugging isn't hampered.
 */
function sendError(res, err, fallbackMessage = 'Something went wrong. Please try again.') {
  const status = err.statusCode || 500;
  if (status >= 500) {
    // eslint-disable-next-line no-console
    console.error(err);
  }
  const exposeDetail = status < 500 || process.env.NODE_ENV !== 'production';
  return res.status(status).json({ error: exposeDetail ? err.message : fallbackMessage });
}

module.exports = { sendError };
