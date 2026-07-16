import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../context/AuthContext';
import client from '../api/client';
import Modal from './Modal';

/**
 * Site-wide "hear from users" entry point — a small floating button, always
 * present (mounted once in App.jsx, not per-page), on every route including
 * for anonymous visitors. Deliberately global rather than tucked into a
 * settings page or the Dashboard: the whole point is to catch a thought
 * ("this is confusing", "I wish it did X") in the moment it happens,
 * wherever the user happens to be, instead of requiring them to remember it
 * and navigate to a separate Contact page later.
 *
 * Reuses the existing POST /api/contact pipeline (contactController.js —
 * already public, rate-limited, stores to contact_messages, and best-effort
 * emails CONTACT_NOTIFY_EMAIL) rather than standing up a parallel feedback
 * system. The only difference from the Contact page is a "[Feedback]"
 * prefix on the stored message, so submissions are easy to tell apart in
 * the inbox/table without any schema change.
 */
export default function FeedbackWidget() {
  const { t } = useTranslation();
  const { user } = useAuth();

  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState(null);

  function openModal() {
    // Prefill fresh each time it's opened (rather than once on mount) so a
    // user who logs in partway through a session still gets their real
    // name/email the next time they open it.
    setName(user?.name || '');
    setEmail(user?.email || '');
    setError(null);
    setOpen(true);
  }

  function closeModal() {
    setOpen(false);
    // Reset the "thanks" state on close, not on open, so a quick re-open
    // right after submitting doesn't flash back to a blank form.
    if (sent) {
      setSent(false);
      setMessage('');
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await client.post('/contact', { name, email, message: `[Feedback] ${message}` });
      setSent(true);
    } catch (err) {
      setError(err.response?.data?.error || t('feedback.submitFailed'));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={openModal}
        className="fixed bottom-5 right-5 z-40 flex items-center gap-2 rounded-full bg-brand-gradient px-4 py-3 text-sm font-semibold text-white shadow-lg hover:shadow-xl transition hover:-translate-y-0.5"
        aria-label={t('feedback.openButton')}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
        </svg>
        <span className="hidden sm:inline">{t('feedback.openButton')}</span>
      </button>

      <Modal open={open} onClose={closeModal} title={t('feedback.title')}>
        {sent ? (
          <div className="text-center py-4">
            <p className="text-2xl mb-2">🙏</p>
            <p className="text-sm text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-xl px-4 py-3">
              {t('feedback.sent')}
            </p>
            <button type="button" onClick={closeModal} className="btn-secondary mt-4">
              {t('feedback.close')}
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <p className="text-sm text-slate-500">{t('feedback.subtitle')}</p>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">{t('feedback.messageLabel')}</label>
              <textarea
                required
                maxLength={5000}
                rows={4}
                autoFocus
                className="input resize-y"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder={t('feedback.messagePlaceholder')}
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">{t('feedback.nameLabel')}</label>
                <input
                  type="text"
                  required
                  maxLength={200}
                  className="input"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={t('feedback.namePlaceholder')}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">{t('feedback.emailLabel')}</label>
                <input
                  type="email"
                  required
                  className="input"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder={t('feedback.emailPlaceholder')}
                />
              </div>
            </div>

            {error && <p className="text-sm text-red-600">{error}</p>}

            <button type="submit" disabled={submitting} className="btn-primary w-full">
              {submitting ? t('feedback.submitting') : t('feedback.submit')}
            </button>
          </form>
        )}
      </Modal>
    </>
  );
}
