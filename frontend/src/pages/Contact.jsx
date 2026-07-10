import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../context/AuthContext';
import client from '../api/client';

/**
 * Public "Contact us" form — no login required, so any visitor can leave a
 * message (see backend/routes/contact.js). Prefills name/email for signed-in
 * users as a convenience only; submission never requires an account.
 */
export default function Contact() {
  const { t } = useTranslation();
  const { user } = useAuth();

  const [name, setName] = useState(user?.name || '');
  const [email, setEmail] = useState(user?.email || '');
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState(null);

  async function handleSubmit(e) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await client.post('/contact', { name, email, message });
      setSent(true);
      setMessage('');
    } catch (err) {
      setError(err.response?.data?.error || t('contact.submitFailed'));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-[70vh] flex items-center justify-center px-4 py-10">
      <div className="card w-full max-w-lg">
        <h1 className="text-2xl font-bold text-slate-900">{t('contact.title')}</h1>
        <p className="mt-1 text-sm text-slate-500">{t('contact.subtitle')}</p>

        {sent ? (
          <p className="mt-6 text-sm text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-xl px-4 py-3">
            {t('contact.sent')}
          </p>
        ) : (
          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">{t('contact.nameLabel')}</label>
              <input
                type="text"
                required
                maxLength={200}
                className="input"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t('contact.namePlaceholder')}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">{t('contact.emailLabel')}</label>
              <input
                type="email"
                required
                className="input"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={t('contact.emailPlaceholder')}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">{t('contact.messageLabel')}</label>
              <textarea
                required
                maxLength={5000}
                rows={5}
                className="input resize-y"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder={t('contact.messagePlaceholder')}
              />
            </div>

            {error && <p className="text-sm text-red-600">{error}</p>}

            <button type="submit" disabled={submitting} className="btn-primary w-full">
              {submitting ? t('contact.submitting') : t('contact.submit')}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
