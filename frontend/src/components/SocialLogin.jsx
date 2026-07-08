import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import client from '../api/client';

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID;
const SCRIPT_ID = 'google-gsi-script';

/**
 * Renders a "Sign in with Google" button. Needs a real Client ID from Google
 * Cloud Console to actually authenticate — see docs/SETUP.md. Until
 * VITE_GOOGLE_CLIENT_ID is set, this shows a disabled placeholder instead of
 * a broken button.
 *
 * Google's script is loaded dynamically (not from a static <script> tag in
 * index.html) so it can carry an hl= locale param matching the active
 * language — without it, Google always renders the button and popup in
 * English/LTR even on an Arabic RTL page, which looks visually broken
 * (wrong width, wrong text direction) next to the rest of the form.
 */
export default function SocialLogin({ onSuccess, onError }) {
  const containerRef = useRef(null);
  const [ready, setReady] = useState(false);
  const { t, i18n } = useTranslation();

  useEffect(() => {
    if (!GOOGLE_CLIENT_ID) return;

    let cancelled = false;
    setReady(false);

    function renderButton() {
      if (cancelled || !window.google || !containerRef.current) return;

      window.google.accounts.id.initialize({
        client_id: GOOGLE_CLIENT_ID,
        callback: async (response) => {
          try {
            const { data } = await client.post('/auth/google', { idToken: response.credential });
            onSuccess(data.token, data.user);
          } catch (err) {
            onError(err.response?.data?.error || t('socialLogin.errorFallback'));
          }
        },
      });

      // Google's button only accepts a fixed pixel width (max 400), not a
      // percentage — measure the actual container so it matches the rest
      // of the form instead of falling back to Google's narrower default.
      containerRef.current.innerHTML = '';
      const width = Math.min(containerRef.current.offsetWidth || 300, 400);
      window.google.accounts.id.renderButton(containerRef.current, {
        theme: 'outline',
        size: 'large',
        width,
        text: 'continue_with',
      });
      setReady(true);
    }

    function loadScriptAndRender() {
      // Force a fresh script load per language: Google caches its internal
      // state against the script's hl= param, so switching languages
      // requires removing the old script/global and re-adding it.
      const existing = document.getElementById(SCRIPT_ID);
      if (existing) existing.remove();
      delete window.google;

      const script = document.createElement('script');
      script.id = SCRIPT_ID;
      script.src = `https://accounts.google.com/gsi/client?hl=${i18n.language}`;
      script.async = true;
      script.defer = true;
      script.onload = () => {
        // Google's script sometimes needs a tick before window.google.accounts.id is ready.
        const interval = setInterval(() => {
          if (cancelled) {
            clearInterval(interval);
            return;
          }
          if (window.google?.accounts?.id) {
            clearInterval(interval);
            renderButton();
          }
        }, 100);
      };
      document.head.appendChild(script);
    }

    loadScriptAndRender();

    return () => {
      cancelled = true;
    };
    // Re-run whenever the active language changes so the button/popup
    // re-render in the new locale and direction.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [i18n.language]);

  if (!GOOGLE_CLIENT_ID) {
    return (
      <button
        type="button"
        disabled
        title={t('socialLogin.notConfiguredTitle')}
        className="btn-secondary w-full opacity-50 cursor-not-allowed"
      >
        {t('socialLogin.notConfigured')}
      </button>
    );
  }

  return <div ref={containerRef} className={ready ? 'w-full flex justify-center' : 'h-10'} />;
}
