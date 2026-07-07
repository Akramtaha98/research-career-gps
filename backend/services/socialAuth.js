const { OAuth2Client } = require('google-auth-library');

// ---------------------------------------------------------------------------
// Google — verifies the ID token issued by Google Identity Services on the
// frontend. No client secret needed for this flow: verifyIdToken checks the
// token's signature against Google's public keys and confirms it was issued
// for our GOOGLE_CLIENT_ID.
// ---------------------------------------------------------------------------
const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

async function verifyGoogleToken(idToken) {
  if (!process.env.GOOGLE_CLIENT_ID) {
    const err = new Error('Google sign-in is not configured (missing GOOGLE_CLIENT_ID)');
    err.statusCode = 501;
    throw err;
  }
  try {
    const ticket = await googleClient.verifyIdToken({
      idToken,
      audience: process.env.GOOGLE_CLIENT_ID,
    });
    const payload = ticket.getPayload();
    if (!payload.email) {
      const err = new Error('Google account has no email');
      err.statusCode = 400;
      throw err;
    }
    return {
      email: payload.email.toLowerCase(),
      name: payload.name || payload.email.split('@')[0],
      providerId: payload.sub,
    };
  } catch (err) {
    if (err.statusCode) throw err;
    const wrapped = new Error(`Invalid Google token: ${err.message}`);
    wrapped.statusCode = 401;
    throw wrapped;
  }
}

module.exports = { verifyGoogleToken };
