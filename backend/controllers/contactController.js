const store = require('../services/store');
const { sendContactNotificationEmail } = require('../services/email');

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_NAME_LEN = 200;
const MAX_MESSAGE_LEN = 5000;

/**
 * POST /api/contact
 * Body: { name, email, message }
 * Public — no auth required, so any visitor (not just signed-in users) can
 * leave a message. The message is always stored in contact_messages first
 * (source of truth, same as every other admin-facing table in this app);
 * an outbound notification email is then attempted via Resend (see
 * services/email.js), best-effort — a missing RESEND_API_KEY/
 * CONTACT_NOTIFY_EMAIL or a delivery failure never fails the submission
 * itself, since the message is already safely saved either way.
 */
async function submitContactMessage(req, res) {
  try {
    const name = (req.body.name || '').trim();
    const email = (req.body.email || '').trim();
    const message = (req.body.message || '').trim();

    if (!name || name.length > MAX_NAME_LEN) {
      return res.status(400).json({ error: `name is required and must be ${MAX_NAME_LEN} characters or fewer` });
    }
    if (!email || !EMAIL_RE.test(email)) {
      return res.status(400).json({ error: 'A valid email is required' });
    }
    if (!message || message.length > MAX_MESSAGE_LEN) {
      return res.status(400).json({ error: `message is required and must be ${MAX_MESSAGE_LEN} characters or fewer` });
    }

    const saved = await store.createContactMessage({ name, email, message, userId: null });

    let emailed = false;
    try {
      await sendContactNotificationEmail({ name, email, message });
      emailed = true;
    } catch (emailErr) {
      // eslint-disable-next-line no-console
      console.warn('Contact form notification email not sent:', emailErr.message);
    }

    return res.status(201).json({ ok: true, id: saved.id, emailed });
  } catch (err) {
    return res.status(err.statusCode || 500).json({ error: err.message });
  }
}

module.exports = { submitContactMessage };
