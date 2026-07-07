import { useEffect, useRef, useState } from 'react';
import client from '../api/client';

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID;

/**
 * Renders a "Sign in with Google" button. Needs a real Client ID from Google
 * Cloud Console to actually authenticate — see docs/SETUP.md. Until
 * VITE_GOOGLE_CLIENT_ID is set, this shows a disabled placeholder instead of
 * a broken button.
 */
export default function SocialLogin({ onSuccess, onError }) {
  const containerRef = useRef(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!GOOGLE_CLIENT_ID) return;

    let cancelled = false;

    function init() {
      if (cancelled || !window.google || !containerRef.current) return;
      window.google.accounts.id.initialize({
        client_id: GOOGLE_CLIENT_ID,
        callback: async (response) => {
          try {
            const { data } = await client.post('/auth/google', { idToken: response.credential });
            onSuccess(data.token, data.user);
          } catch (err) {
            onError(err.response?.data?.error || 'Google sign-in failed');
          }
        },
      });
      window.google.accounts.id.renderButton(containerRef.current, {
        theme: 'outline',
        size: 'large',
        width: '100%',
        text: 'continue_with',
      });
      setReady(true);
    }

    // Google's script loads async — poll briefly until it's available.
    const interval = setInterval(() => {
      if (window.google?.accounts?.id) {
        clearInterval(interval);
        init();
      }
    }, 200);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!GOOGLE_CLIENT_ID) {
    return (
      <button
        type="button"
        disabled
        title="Set VITE_GOOGLE_CLIENT_ID / GOOGLE_CLIENT_ID to enable — see docs/SETUP.md"
        className="btn-secondary w-full opacity-50 cursor-not-allowed"
      >
        Continue with Google (not configured)
      </button>
    );
  }

  return <div ref={containerRef} className={ready ? '' : 'h-10'} />;
}
