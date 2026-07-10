const store = require('../services/store');

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_NAME_LEN = 200;
const MAX_MESSAGE_LEN = 5000;

/**
 * POST /api/contact
 * Body: { name, email, message }
 * Public — no auth required, so any visitor (not just signed-in users) can
 * leave a message. No outbound email is sent (no SMTP/Resend/SendGrid
 * configured for this project); the message is stored in contact_messages
 * for direct review, same as every other admin-facing table in this app.
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
    return res.status(201).json({ ok: true, id: saved.id });
  } catch (err) {
    return res.status(err.statusCode || 500).json({ error: err.message });
  }
}

module.exports = { submitContactMessage };
