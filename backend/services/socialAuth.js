const { OAuth2Client } = require('google-auth-library');
const jwt = require('jsonwebtoken');
const jwksClient = require('jwks-rsa');

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

// ---------------------------------------------------------------------------
// Apple — verifies the identityToken returned by "Sign in with Apple JS"
// against Apple's published JWKS. Also needs no client secret for basic
// identity verification (a client secret is only required for server-side
// refresh-token exchange, which this MVP doesn't use).
//
// NOTE: actually functioning requires a paid Apple Developer account: a
// registered Services ID (used as APPLE_CLIENT_ID / audience below), and
// domain verification for wherever the frontend is hosted. See docs/SETUP.md.
// ---------------------------------------------------------------------------
const appleJwks = jwksClient({
  jwksUri: 'https://appleid.apple.com/auth/keys',
  cache: true,
  cacheMaxAge: 12 * 60 * 60 * 1000, // 12h
});

function getAppleSigningKey(header, callback) {
  appleJwks.getSigningKey(header.kid, (err, key) => {
    if (err) return callback(err);
    callback(null, key.getPublicKey());
  });
}

async function verifyAppleToken(identityToken) {
  if (!process.env.APPLE_CLIENT_ID) {
    const err = new Error('Apple sign-in is not configured (missing APPLE_CLIENT_ID)');
    err.statusCode = 501;
    throw err;
  }
  return new Promise((resolve, reject) => {
    jwt.verify(
      identityToken,
      getAppleSigningKey,
      {
        algorithms: ['RS256'],
        audience: process.env.APPLE_CLIENT_ID,
        issuer: 'https://appleid.apple.com',
      },
      (err, payload) => {
        if (err) {
          const wrapped = new Error(`Invalid Apple token: ${err.message}`);
          wrapped.statusCode = 401;
          return reject(wrapped);
        }
        if (!payload.email) {
          const noEmail = new Error('Apple account has no email');
          noEmail.statusCode = 400;
          return reject(noEmail);
        }
        resolve({
          email: payload.email.toLowerCase(),
          // Apple doesn't include name in the token after first login — the
          // frontend passes it separately from the one-time `user` object
          // Apple provides on first sign-in (handled in the Apple controller).
          name: null,
          providerId: payload.sub,
        });
      }
    );
  });
}

module.exports = { verifyGoogleToken, verifyAppleToken };
