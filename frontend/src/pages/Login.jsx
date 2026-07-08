import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import client from '../api/client';
import { useAuth } from '../context/AuthContext';
import SocialLogin from '../components/SocialLogin';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();
  const { t } = useTranslation();

  async function handleSubmit(e) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const { data } = await client.post('/auth/login', { email, password });
      login(data.token, data.user);
      navigate('/dashboard');
    } catch (err) {
      setError(err.response?.data?.error || t('login.errorFallback'));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-[80vh] flex items-center justify-center px-4">
      <div className="card w-full max-w-md">
        <h1 className="text-2xl font-bold text-slate-900">{t('login.title')}</h1>
        <p className="mt-1 text-sm text-slate-500">{t('login.subtitle')}</p>

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">{t('login.email')}</label>
            <input
              type="email"
              required
              className="input"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={t('login.emailPlaceholder')}
            />
          </div>
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-sm font-medium text-slate-700">{t('login.password')}</label>
              <Link to="/forgot-password" className="text-xs text-brand-600 font-semibold">
                {t('login.forgotPassword')}
              </Link>
            </div>
            <input
              type="password"
              required
              className="input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={t('login.passwordPlaceholder')}
            />
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <button type="submit" disabled={submitting} className="btn-primary w-full">
            {submitting ? t('login.submitting') : t('login.submit')}
          </button>
        </form>

        <div className="my-5 flex items-center gap-3">
          <div className="h-px flex-1 bg-slate-200" />
          <span className="text-xs text-slate-400">{t('login.or')}</span>
          <div className="h-px flex-1 bg-slate-200" />
        </div>

        <SocialLogin
          onSuccess={(token, user) => {
            login(token, user);
            navigate('/dashboard');
          }}
          onError={setError}
        />

        <p className="mt-6 text-sm text-slate-500 text-center">
          {t('login.noAccount')} <Link to="/signup" className="text-brand-600 font-semibold">{t('login.signUp')}</Link>
        </p>
        <p className="mt-2 text-xs text-slate-400 text-center">
          {t('login.demoPrompt')} <Link to="/dashboard" className="underline">{t('login.demoLink')}</Link> {t('login.demoSuffix')}
        </p>
      </div>
    </div>
  );
}
