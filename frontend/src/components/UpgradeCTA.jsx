import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import client from '../api/client';
import { useAuth } from '../context/AuthContext';

/**
 * Paywall teaser shown in place of a Pro-only feature. Redirects to a
 * Stripe-hosted Checkout page — this app never handles card details itself.
 */
export default function UpgradeCTA({ feature = 'this feature' }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  async function handleUpgrade() {
    if (!user) {
      navigate('/login');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const { data } = await client.post('/billing/create-checkout-session');
      window.location.href = data.url;
    } catch (err) {
      setError(err.response?.data?.error || 'Could not start checkout');
      setLoading(false);
    }
  }

  return (
    <div className="text-center py-8 px-4">
      <p className="text-3xl mb-2" aria-hidden>🔒</p>
      <p className="font-semibold text-slate-800">{feature} is a Pro feature</p>
      <p className="mt-1 text-sm text-slate-500 max-w-sm mx-auto">
        Upgrade to Pro ($4.99/mo) to unlock predictions and the collaboration advisor.
      </p>
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      <button onClick={handleUpgrade} disabled={loading} className="btn-primary mt-4">
        {loading ? 'Redirecting...' : 'Upgrade to Pro'}
      </button>
    </div>
  );
}
