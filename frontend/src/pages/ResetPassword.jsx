import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import client from '../api/client';

export default function ResetPassword() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') || '';
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState(null);
  const navigate = useNavigate();
  const { t } = useTranslation();

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);

    if (password !== confirm) {
      setError(t('resetPassword.mismatch'));
      return;
    }

    setSubmitting(true);
    try {
      await client.post('/auth/reset-password', { token, password });
      setDone(true);
      setTimeout(() => navigate('/login'), 2000);
    } catch (err) {
      setError(err.response?.data?.error || t('resetPassword.errorFallback'));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-[80vh] flex items-center justify-center px-4">
      <div className="card w-full max-w-md">
        <h1 className="text-2xl font-bold text-slate-900">{t('resetPassword.title')}</h1>
        <p className="mt-1 text-sm text-slate-500">{t('resetPassword.subtitle')}</p>

        {!token && (
          <p className="mt-6 text-sm text-red-600">{t('resetPassword.missingToken')}</p>
        )}

        {done ? (
          <p className="mt-6 text-sm text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-xl px-4 py-3">
            {t('resetPassword.success')}
          </p>
        ) : (
          token && (
            <form onSubmit={handleSubmit} className="mt-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">{t('resetPassword.newPassword')}</label>
                <input
                  type="password"
                  required
                  minLength={8}
                  className="input"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={t('signup.passwordPlaceholder')}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">{t('resetPassword.confirmPassword')}</label>
                <input
                  type="password"
                  required
                  minLength={8}
                  className="input"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  placeholder={t('signup.passwordPlaceholder')}
                />
              </div>

              {error && <p className="text-sm text-red-600">{error}</p>}

              <button type="submit" disabled={submitting} className="btn-primary w-full">
                {submitting ? t('resetPassword.submitting') : t('resetPassword.submit')}
              </button>
            </form>
          )
        )}

        <p className="mt-6 text-sm text-slate-500 text-center">
          <Link to="/login" className="text-brand-600 font-semibold">{t('forgotPassword.backToLogin')}</Link>
        </p>
      </div>
    </div>
  );
}
