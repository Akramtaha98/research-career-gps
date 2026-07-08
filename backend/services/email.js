const axios = require('axios');

// ---------------------------------------------------------------------------
// Resend — transactional email for the forgot-password flow. Uses the plain
// REST API via axios (already a dependency) instead of the Resend SDK, so no
// new package install is required to deploy this.
//
// Requires RESEND_API_KEY and EMAIL_FROM env vars. EMAIL_FROM must be an
// address on a domain verified in the Resend dashboard (or, for quick
// testing, Resend's shared "onboarding@resend.dev" sender works without any
// domain verification).
// ---------------------------------------------------------------------------

async function sendPasswordResetEmail({ to, resetUrl }) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM || 'onboarding@resend.dev';

  if (!apiKey) {
    const err = new Error('Email sending is not configured (missing RESEND_API_KEY)');
    err.statusCode = 501;
    throw err;
  }

  const html = `
    <div style="font-family: -apple-system, Arial, sans-serif; max-width: 480px; margin: 0 auto;">
      <h2 style="color: #0f172a;">Reset your password</h2>
      <p style="color: #475569;">
        We received a request to reset the password for your Research GPS account.
        This link expires in 1 hour.
      </p>
      <p style="margin: 24px 0;">
        <a href="${resetUrl}" style="background: #4f46e5; color: #fff; padding: 12px 20px; border-radius: 8px; text-decoration: none; font-weight: 600;">
          Reset password
        </a>
      </p>
      <p style="color: #94a3b8; font-size: 13px;">
        If you didn't request this, you can safely ignore this email — your password won't change.
      </p>
      <p style="color: #94a3b8; font-size: 13px;">
        Or copy this link: <br />${resetUrl}
      </p>
    </div>
  `;

  await axios.post(
    'https://api.resend.com/emails',
    {
      from,
      to,
      subject: 'Reset your Research GPS password',
      html,
    },
    {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
    }
  );
}

module.exports = { sendPasswordResetEmail };
