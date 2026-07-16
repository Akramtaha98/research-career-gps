import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../context/AuthContext';
import client from '../api/client';

/**
 * Persistent, dismissible-per-click-not-permanently banner shown under the
 * navbar whenever a signed-in user's account is not yet email_verified.
 * Mounted globally in App.jsx (not per-page) so it follows the user around
 * regardless of which route they land on after signup. Only local-auth
 * accounts can ever be unverified — Google/ORCID accounts are created
 * already verified (see authController.js) — but the check here is just
 * `!user.emailVerified` since that alone is sufficient.
 */
export default function VerifyEmailBanner() {
  const { user } = useAuth();
  const { t } = useTranslation();
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState(null);

  if (!user || user.emailVerified) return null;

  async function handleResend() {
    setSending(true);
    setMessage(null);
    try {
      const { data } = await client.post('/auth/resend-verification');
      setMessage(data.message || t('verifyBanner.sent'));
    } catch (err) {
      setMessage(err.response?.data?.error || t('verifyBanner.failed'));
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="bg-amber-50 border-b border-amber-200 text-amber-800 text-sm">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-2.5 flex flex-wrap items-center justify-between gap-2">
        <span>✉️ {t('verifyBanner.message')}</span>
        <div className="flex items-center gap-3">
          {message && <span className="text-xs">{message}</span>}
          <button
            type="button"
            onClick={handleResend}
            disabled={sending}
            className="font-semibold underline underline-offset-2 disabled:opacity-60"
          >
            {sending ? t('verifyBanner.sending') : t('verifyBanner.resend')}
          </button>
        </div>
      </div>
    </div>
  );
}
