const axios = require('axios');

// ---------------------------------------------------------------------------
// Resend — transactional email (password reset, signup confirmation, weekly
// goal-progress digest, Contact Us notifications). Uses the plain REST API
// via axios (already a dependency) instead of the Resend SDK, so no new
// package install is required to deploy this.
//
// Requires RESEND_API_KEY and EMAIL_FROM env vars. EMAIL_FROM must be an
// address on a domain verified in the Resend dashboard (or, for quick
// testing, Resend's shared "onboarding@resend.dev" sender works without any
// domain verification).
// ---------------------------------------------------------------------------

const BRAND_GRADIENT = 'linear-gradient(135deg, #6d28d9 0%, #4f46e5 50%, #0ea5e9 100%)';
const BRAND_SOLID = '#4f46e5';
const APP_NAME = 'Research GPS';

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/**
 * Shared branded shell every outbound email is built on — a single visual
 * identity (header wordmark on the same gradient the app's navbar uses,
 * card body, optional CTA button, muted footer) instead of each email type
 * hand-rolling its own inline styles. Keeps every email looking like it
 * came from the same product.
 *
 * @param {object} opts
 * @param {string} opts.preheader - hidden preview text shown next to the subject line in most inboxes
 * @param {string} opts.heading - main heading inside the card
 * @param {string} opts.bodyHtml - pre-rendered inner HTML (already escaped by the caller where needed)
 * @param {{label: string, url: string}} [opts.cta] - optional call-to-action button
 * @param {string} [opts.footerNote] - optional extra line under the standard footer (e.g. an unsubscribe hint)
 */
function renderEmailShell({ preheader = '', heading, bodyHtml, cta, footerNote }) {
  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(APP_NAME)}</title>
  </head>
  <body style="margin:0; padding:0; background:#f1f5f9; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
    <!-- Preheader: hidden, but shown by inbox previews -->
    <div style="display:none; max-height:0; overflow:hidden; opacity:0;">${escapeHtml(preheader)}</div>

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9; padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px; background:#ffffff; border-radius:16px; overflow:hidden; box-shadow:0 1px 3px rgba(15,23,42,0.08);">
            <tr>
              <td style="background:${BRAND_GRADIENT}; padding:28px 32px;">
                <span style="font-size:20px; font-weight:700; color:#ffffff; letter-spacing:-0.01em;">
                  🧭 ${escapeHtml(APP_NAME)}
                </span>
              </td>
            </tr>
            <tr>
              <td style="padding:36px 32px 8px;">
                <h1 style="margin:0 0 16px; font-size:22px; line-height:1.3; font-weight:700; color:#0f172a;">${heading}</h1>
                <div style="font-size:15px; line-height:1.65; color:#475569;">
                  ${bodyHtml}
                </div>
                ${
                  cta
                    ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:28px 0 8px;">
                        <tr>
                          <td style="border-radius:10px; background:${BRAND_SOLID};">
                            <a href="${cta.url}" style="display:inline-block; padding:13px 26px; font-size:15px; font-weight:600; color:#ffffff; text-decoration:none; border-radius:10px;">
                              ${escapeHtml(cta.label)}
                            </a>
                          </td>
                        </tr>
                      </table>
                      <p style="margin:4px 0 0; font-size:12px; color:#94a3b8; word-break:break-all;">
                        ${escapeHtml(cta.label)} not working? Paste this link into your browser:<br />
                        <a href="${cta.url}" style="color:#7c3aed;">${cta.url}</a>
                      </p>`
                    : ''
                }
              </td>
            </tr>
            <tr>
              <td style="padding:24px 32px 32px;">
                <hr style="border:none; border-top:1px solid #e2e8f0; margin:0 0 20px;" />
                <p style="margin:0; font-size:12px; color:#94a3b8; line-height:1.6;">
                  ${escapeHtml(APP_NAME)} &middot; track your H-index, plan your next paper, hit your goal.
                  ${footerNote ? `<br />${footerNote}` : ''}
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

async function sendViaResend({ to, subject, html, replyTo }) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM || 'onboarding@resend.dev';

  if (!apiKey) {
    const err = new Error('Email sending is not configured (missing RESEND_API_KEY)');
    err.statusCode = 501;
    throw err;
  }

  await axios.post(
    'https://api.resend.com/emails',
    {
      from: from.includes('<') ? from : `${APP_NAME} <${from}>`,
      to,
      subject,
      html,
      ...(replyTo ? { reply_to: replyTo } : {}),
    },
    {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
    }
  );
}

/**
 * POST /api/auth/forgot-password flow. Link expires in 1 hour (enforced
 * server-side in authController.js#forgotPassword).
 */
async function sendPasswordResetEmail({ to, resetUrl }) {
  const html = renderEmailShell({
    preheader: 'Reset your Research GPS password — this link expires in 1 hour.',
    heading: 'Reset your password',
    bodyHtml: `
      <p style="margin:0 0 12px;">We received a request to reset the password for your ${escapeHtml(APP_NAME)} account.</p>
      <p style="margin:0;">This link expires in <strong>1 hour</strong>. If you didn't request this, you can safely ignore this email — your password won't change.</p>
    `,
    cta: { label: 'Reset password', url: resetUrl },
  });

  await sendViaResend({ to, subject: `Reset your ${APP_NAME} password`, html });
}

/**
 * Signup confirmation. Sent (best-effort) right after account creation for
 * `auth_provider = 'local'` signups only — Google/ORCID accounts arrive
 * already `email_verified = true` since the provider vouches for the
 * identity. Link expires in 24 hours. See authController.js#signup and
 * #verifyEmail.
 */
async function sendVerificationEmail({ to, name, verifyUrl }) {
  const html = renderEmailShell({
    preheader: `Confirm ${name ? name + "'s" : 'your'} ${APP_NAME} account to get started.`,
    heading: `Welcome to ${APP_NAME}${name ? `, ${escapeHtml(name)}` : ''} 👋`,
    bodyHtml: `
      <p style="margin:0 0 12px;">One last step — confirm your email address to activate your account.</p>
      <p style="margin:0;">This link expires in <strong>24 hours</strong>. If you didn't create this account, you can safely ignore this email.</p>
    `,
    cta: { label: 'Confirm my email', url: verifyUrl },
  });

  await sendViaResend({ to, subject: `Confirm your ${APP_NAME} account`, html });
}

/**
 * Weekly progress digest — see services/digestScheduler.js. Reports movement
 * since the last sweep (papers/citations gained, H-index change) alongside
 * the saved goal from the Predictor page, so the whole thing reads like a
 * short status update rather than a raw data dump.
 *
 * @param {object} p
 * @param {string} p.to
 * @param {string} p.name
 * @param {string} p.researcherName
 * @param {number} p.currentH
 * @param {number} p.targetH
 * @param {number} p.hGained - change in H-index since the last digest window
 * @param {number} p.citationsGained
 * @param {number} p.papersGained
 * @param {number|null} p.estimatedMonthsRemaining - null if the goal is already reached or no estimate exists
 * @param {string} p.dashboardUrl
 * @param {string} p.unsubscribeUrl
 */
async function sendProgressDigestEmail({
  to,
  name,
  researcherName,
  currentH,
  targetH,
  hGained,
  citationsGained,
  papersGained,
  estimatedMonthsRemaining,
  dashboardUrl,
  unsubscribeUrl,
}) {
  const reached = currentH >= targetH;
  const progressPct = Math.max(0, Math.min(100, Math.round((currentH / Math.max(targetH, 1)) * 100)));

  const statChip = (label, value) => `
    <td style="padding:14px 12px; text-align:center; background:#f8fafc; border-radius:10px;">
      <div style="font-size:20px; font-weight:700; color:#0f172a;">${value}</div>
      <div style="font-size:11px; color:#94a3b8; margin-top:2px; text-transform:uppercase; letter-spacing:0.03em;">${label}</div>
    </td>`;

  const progressBar = `
    <div style="margin:20px 0 4px; background:#e2e8f0; border-radius:999px; height:10px; overflow:hidden;">
      <div style="height:10px; width:${progressPct}%; background:${BRAND_GRADIENT}; border-radius:999px;"></div>
    </div>
    <p style="margin:0; font-size:12px; color:#94a3b8;">H-index ${currentH} of ${targetH} goal &middot; ${progressPct}% there</p>
  `;

  const statusLine = reached
    ? `<p style="margin:0 0 12px; color:#059669; font-weight:600;">🎉 You've reached your H-index goal of ${targetH}!</p>`
    : estimatedMonthsRemaining != null
      ? `<p style="margin:0 0 12px;">At your current pace, you're on track to hit H-index ${targetH} in about <strong>${estimatedMonthsRemaining} month${estimatedMonthsRemaining === 1 ? '' : 's'}</strong>.</p>`
      : '';

  const bodyHtml = `
    <p style="margin:0 0 4px;">Hi ${name ? escapeHtml(name) : 'there'}, here's your weekly update for <strong>${escapeHtml(researcherName)}</strong>.</p>
    ${statusLine}
    ${progressBar}
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:22px;">
      <tr>
        ${statChip('H-index', `${hGained > 0 ? '+' : ''}${hGained}`)}
        <td style="width:10px;"></td>
        ${statChip('Citations', `+${citationsGained}`)}
        <td style="width:10px;"></td>
        ${statChip('New papers', `+${papersGained}`)}
      </tr>
    </table>
    <p style="margin:22px 0 0; font-size:13px; color:#94a3b8;">Changes since your last weekly update.</p>
  `;

  const html = renderEmailShell({
    preheader: `${researcherName}: H-index ${currentH}/${targetH} — ${progressPct}% toward your goal.`,
    heading: 'Your weekly progress',
    bodyHtml,
    cta: { label: 'Open my dashboard', url: dashboardUrl },
    footerNote: unsubscribeUrl
      ? `Don't want these? <a href="${unsubscribeUrl}" style="color:#94a3b8; text-decoration:underline;">Unsubscribe from weekly updates</a>.`
      : undefined,
  });

  await sendViaResend({ to, subject: `📈 ${researcherName}: ${progressPct}% toward H-index ${targetH}`, html });
}

/**
 * Notifies the site owner (CONTACT_NOTIFY_EMAIL) whenever someone submits the
 * public Contact Us form. Best-effort — the message is always stored in
 * contact_messages regardless (see contactController.js), so a missing
 * RESEND_API_KEY or a delivery failure here should never block the
 * submission; the caller is expected to catch and swallow errors from this.
 * reply_to is set to the submitter's own address so replying from your inbox
 * goes straight back to them.
 */
async function sendContactNotificationEmail({ name, email, message }) {
  const to = process.env.CONTACT_NOTIFY_EMAIL;
  if (!to) {
    const err = new Error('Email sending is not configured (missing CONTACT_NOTIFY_EMAIL)');
    err.statusCode = 501;
    throw err;
  }

  const html = renderEmailShell({
    preheader: `New contact form message from ${name}`,
    heading: 'New message from the contact form',
    bodyHtml: `
      <p style="margin:0 0 12px;"><strong>${escapeHtml(name)}</strong> (${escapeHtml(email)}) wrote:</p>
      <p style="margin:0; white-space:pre-wrap; background:#f8fafc; border:1px solid #e2e8f0; border-radius:10px; padding:14px 16px; color:#0f172a;">${escapeHtml(message)}</p>
      <p style="margin:16px 0 0; font-size:13px; color:#94a3b8;">Reply to this email to respond directly to them.</p>
    `,
  });

  await sendViaResend({ to, subject: `New contact form message from ${name}`, html, replyTo: email });
}

module.exports = {
  sendPasswordResetEmail,
  sendVerificationEmail,
  sendProgressDigestEmail,
  sendContactNotificationEmail,
};
