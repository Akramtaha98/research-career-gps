const axios = require('axios');

// ORCID has two environments: the real one and a free sandbox for testing
// registered apps before going live. Toggle with ORCID_SANDBOX=true — the
// Client ID/Secret from the sandbox portal only work against sandbox.orcid.org,
// and vice versa, so this must match wherever the app was registered.
const ORCID_BASE = process.env.ORCID_SANDBOX === 'true' ? 'https://sandbox.orcid.org' : 'https://orcid.org';

/**
 * Exchanges an OAuth authorization code for the signed-in user's ORCID iD.
 * Unlike Google Identity Services (which verifies a client-side ID token
 * against public keys, no secret needed), ORCID's /authenticate scope uses
 * the standard Authorization Code grant — the code-for-token exchange
 * requires the Client Secret, so this can only run server-side. The token
 * response includes the `orcid` iD directly: no separate profile-fetch call
 * needed for basic sign-in.
 *
 * @param {string} code - the `code` query param ORCID redirected back with
 * @param {string} redirectUri - must exactly match the redirect_uri used in
 *   the initial /authorize request AND the one registered in ORCID's
 *   developer portal, or ORCID rejects the exchange.
 */
async function exchangeOrcidCode(code, redirectUri) {
  if (!process.env.ORCID_CLIENT_ID || !process.env.ORCID_CLIENT_SECRET) {
    const err = new Error('ORCID sign-in is not configured (missing ORCID_CLIENT_ID/ORCID_CLIENT_SECRET)');
    err.statusCode = 501;
    throw err;
  }

  try {
    const { data } = await axios.post(
      `${ORCID_BASE}/oauth/token`,
      new URLSearchParams({
        client_id: process.env.ORCID_CLIENT_ID,
        client_secret: process.env.ORCID_CLIENT_SECRET,
        grant_type: 'authorization_code',
        code,
        redirect_uri: redirectUri,
      }).toString(),
      {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
        timeout: 10000,
      }
    );

    if (!data.orcid) {
      const err = new Error('ORCID did not return an ORCID iD for this sign-in');
      err.statusCode = 502;
      throw err;
    }

    return { orcid: data.orcid, name: data.name || null };
  } catch (err) {
    if (err.statusCode) throw err;
    const detail = err.response?.data?.error_description || err.response?.data?.error || err.message;
    const wrapped = new Error(`ORCID sign-in failed: ${detail}`);
    wrapped.statusCode = 401;
    throw wrapped;
  }
}

module.exports = { exchangeOrcidCode };
