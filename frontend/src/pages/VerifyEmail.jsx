import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import client from '../api/client';
import { useAuth } from '../context/AuthContext';

/**
 * Landing page for the signup-confirmation link emailed by
 * services/email.js#sendVerificationEmail (backend/controllers/authController.js#signup).
 * Confirms the token, then refreshes AuthContext's user so the
 * VerifyEmailBanner disappears immediately without a manual reload.
 */
export default function VerifyEmail() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') || '';
  const [status, setStatus] = useState('verifying'); // verifying | success | error
  const [errorMessage, setErrorMessage] = useState(null);
  const { refreshUser, user } = useAuth();
  const { t } = useTranslation();
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    if (!token) {
      setStatus('error');
      setErrorMessage(t('verifyEmail.missingToken'));
      return;
    }

    (async () => {
      try {
        await client.post('/auth/verify-email', { token });
        setStatus('success');
        await refreshUser();
      } catch (err) {
        setStatus('error');
        setErrorMessage(err.response?.data?.error || t('verifyEmail.errorFallback'));
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  return (
    <div className="min-h-[60vh] flex items-center justify-center px-4">
      <div className="card w-full max-w-md text-center space-y-3">
        {status === 'verifying' && (
          <>
            <div className="mx-auto h-8 w-8 rounded-full border-2 border-brand-200 border-t-brand-600 animate-spin" />
            <p className="text-sm text-slate-600">{t('verifyEmail.verifying')}</p>
          </>
        )}

        {status === 'success' && (
          <>
            <p className="text-2xl">✅</p>
            <p className="text-sm font-semibold text-emerald-700">{t('verifyEmail.success')}</p>
            <Link to={user ? '/dashboard' : '/login'} className="text-brand-600 text-sm font-semibold underline">
              {user ? t('verifyEmail.goToDashboard') : t('verifyEmail.goToLogin')}
            </Link>
          </>
        )}

        {status === 'error' && (
          <>
            <p className="text-sm font-semibold text-red-600">{t('verifyEmail.failed')}</p>
            <p className="text-xs text-slate-500">{errorMessage}</p>
            <Link to="/dashboard" className="text-brand-600 text-sm font-semibold underline">
              {t('verifyEmail.goToDashboard')}
            </Link>
          </>
        )}
      </div>
    </div>
  );
}
