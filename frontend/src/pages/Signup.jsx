import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import client from '../api/client';
import { useAuth } from '../context/AuthContext';
import SocialLogin from '../components/SocialLogin';
import OrcidButton from '../components/OrcidButton';

export default function Signup() {
  const [name, setName] = useState('');
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
      const { data } = await client.post('/auth/signup', { name, email, password });
      login(data.token, data.user);
      navigate('/search');
    } catch (err) {
      setError(err.response?.data?.error || t('signup.errorFallback'));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-[80vh] flex items-center justify-center px-4">
      <div className="card w-full max-w-md">
        <h1 className="text-2xl font-bold text-slate-900">{t('signup.title')}</h1>
        <p className="mt-1 text-sm text-slate-500">{t('signup.subtitle')}</p>

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">{t('signup.name')}</label>
            <input required autoFocus className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder={t('signup.namePlaceholder')} />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">{t('signup.email')}</label>
            <input type="email" required className="input" value={email} onChange={(e) => setEmail(e.target.value)} placeholder={t('signup.emailPlaceholder')} />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">{t('signup.password')}</label>
            <input type="password" required minLength={8} className="input" value={password} onChange={(e) => setPassword(e.target.value)} placeholder={t('signup.passwordPlaceholder')} />
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <button type="submit" disabled={submitting} className="btn-primary w-full">
            {submitting ? t('signup.submitting') : t('signup.submit')}
          </button>
        </form>

        <div className="my-5 flex items-center gap-3">
          <div className="h-px flex-1 bg-slate-200" />
          <span className="text-xs text-slate-400">{t('login.or')}</span>
          <div className="h-px flex-1 bg-slate-200" />
        </div>

        <SocialLogin
          onSuccess={(token, socialUser) => {
            login(token, socialUser);
            navigate('/search');
          }}
          onError={setError}
        />
        <OrcidButton />

        <p className="mt-6 text-sm text-slate-500 text-center">
          {t('signup.haveAccount')} <Link to="/login" className="text-brand-600 font-semibold">{t('signup.logIn')}</Link>
        </p>
      </div>
    </div>
  );
}
