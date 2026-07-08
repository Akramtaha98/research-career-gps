import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import client from '../api/client';

export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState(null);
  const { t } = useTranslation();

  async function handleSubmit(e) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await client.post('/auth/forgot-password', { email });
      // Backend always returns a generic success message regardless of
      // whether the email matches an account — same behavior here.
      setSent(true);
    } catch (err) {
      setError(err.response?.data?.error || t('forgotPassword.errorFallback'));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-[80vh] flex items-center justify-center px-4">
      <div className="card w-full max-w-md">
        <h1 className="text-2xl font-bold text-slate-900">{t('forgotPassword.title')}</h1>
        <p className="mt-1 text-sm text-slate-500">{t('forgotPassword.subtitle')}</p>

        {sent ? (
          <p className="mt-6 text-sm text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-xl px-4 py-3">
            {t('forgotPassword.sent')}
          </p>
        ) : (
          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">{t('forgotPassword.email')}</label>
              <input
                type="email"
                required
                className="input"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={t('login.emailPlaceholder')}
              />
            </div>

            {error && <p className="text-sm text-red-600">{error}</p>}

            <button type="submit" disabled={submitting} className="btn-primary w-full">
              {submitting ? t('forgotPassword.submitting') : t('forgotPassword.submit')}
            </button>
          </form>
        )}

        <p className="mt-6 text-sm text-slate-500 text-center">
          <Link to="/login" className="text-brand-600 font-semibold">{t('forgotPassword.backToLogin')}</Link>
        </p>
      </div>
    </div>
  );
}
