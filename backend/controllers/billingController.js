const store = require('../services/store');
const { createCheckoutSession, constructWebhookEvent } = require('../services/stripeService');
const { sendError } = require('../utils/sendError');

/**
 * POST /api/billing/create-checkout-session
 * Auth required. Returns a Stripe-hosted Checkout URL for the Pro plan.
 */
async function createSession(req, res) {
  try {
    const user = await store.findUserById(req.user.id);
    if (!user) return res.status(404).json({ error: 'User not found' });

    const { url, customerId } = await createCheckoutSession(user);
    if (!user.stripe_customer_id) {
      await store.updateUserBilling(user.id, { stripeCustomerId: customerId });
    }
    return res.json({ url });
  } catch (err) {
    return sendError(res, err);
  }
}

/** GET /api/billing/status — auth required. */
async function getStatus(req, res) {
  const user = await store.findUserById(req.user.id);
  if (!user) return res.status(404).json({ error: 'User not found' });
  return res.json({ plan: user.plan, subscriptionStatus: user.subscription_status });
}

/**
 * POST /api/billing/webhook — no auth (Stripe calls this directly). Must be
 * mounted with express.raw() BEFORE the global express.json() middleware,
 * since Stripe's signature verification needs the exact raw request body.
 */
async function webhook(req, res) {
  let event;
  try {
    event = constructWebhookEvent(req.body, req.headers['stripe-signature']);
  } catch (err) {
    console.error('Stripe webhook signature verification failed:', err.message);
    return res.status(400).json({ error: `Webhook Error: ${err.message}` });
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object;
        const userId = session.metadata?.userId;
        if (userId) {
          await store.updateUserBilling(userId, {
            stripeCustomerId: session.customer,
            plan: 'pro',
            subscriptionStatus: 'active',
          });
        }
        break;
      }
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted': {
        const subscription = event.data.object;
        const user = await store.findUserByStripeCustomerId(subscription.customer);
        if (user) {
          const active = subscription.status === 'active' || subscription.status === 'trialing';
          await store.updateUserBilling(user.id, {
            plan: active ? 'pro' : 'free',
            subscriptionStatus: subscription.status,
          });
        }
        break;
      }
      default:
        break; // ignore other event types
    }
    return res.json({ received: true });
  } catch (err) {
    console.error('Stripe webhook handler error:', err.message);
    return res.status(500).json({ error: 'Webhook handler failed' });
  }
}

module.exports = { createSession, getStatus, webhook };
