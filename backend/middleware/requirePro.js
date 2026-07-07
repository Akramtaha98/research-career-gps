const store = require('../services/store');

/**
 * Gates a route behind an active Pro subscription. Must run after
 * requireAuth (needs req.user.id already set).
 */
async function requirePro(req, res, next) {
  const user = await store.findUserById(req.user.id);
  if (!user) return res.status(404).json({ error: 'User not found' });

  if (user.plan !== 'pro' || user.subscription_status !== 'active') {
    return res.status(402).json({
      error: 'This feature requires a Pro subscription',
      upgradeRequired: true,
    });
  }
  next();
}

module.exports = { requirePro };
