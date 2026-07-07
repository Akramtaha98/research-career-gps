const Stripe = require('stripe');

let stripe = null;
function getStripe() {
  if (!process.env.STRIPE_SECRET_KEY) {
    const err = new Error('Billing is not configured (missing STRIPE_SECRET_KEY)');
    err.statusCode = 501;
    throw err;
  }
  if (!stripe) stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
  return stripe;
}

/**
 * Creates (or reuses) a Stripe Customer for the user, then creates a
 * subscription Checkout Session for the configured Pro price. Returns the
 * hosted checkout URL — the frontend just redirects to it.
 */
async function createCheckoutSession(user) {
  if (!process.env.STRIPE_PRICE_ID) {
    const err = new Error('Billing is not configured (missing STRIPE_PRICE_ID)');
    err.statusCode = 501;
    throw err;
  }
  const client = getStripe();
  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';

  let customerId = user.stripe_customer_id;
  if (!customerId) {
    const customer = await client.customers.create({
      email: user.email,
      name: user.name,
      metadata: { userId: user.id },
    });
    customerId = customer.id;
  }

  const session = await client.checkout.sessions.create({
    customer: customerId,
    mode: 'subscription',
    line_items: [{ price: process.env.STRIPE_PRICE_ID, quantity: 1 }],
    success_url: `${frontendUrl}/predictor?checkout=success`,
    cancel_url: `${frontendUrl}/predictor?checkout=cancelled`,
    metadata: { userId: user.id },
  });

  return { url: session.url, customerId };
}

/** Verifies and parses a Stripe webhook payload using the raw request body. */
function constructWebhookEvent(rawBody, signature) {
  if (!process.env.STRIPE_WEBHOOK_SECRET) {
    const err = new Error('Billing webhook is not configured (missing STRIPE_WEBHOOK_SECRET)');
    err.statusCode = 501;
    throw err;
  }
  const client = getStripe();
  return client.webhooks.constructEvent(rawBody, signature, process.env.STRIPE_WEBHOOK_SECRET);
}

module.exports = { createCheckoutSession, constructWebhookEvent };
