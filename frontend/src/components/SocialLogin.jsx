import { useEffect, useRef, useState } from 'react';
import client from '../api/client';

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID;
const APPLE_CLIENT_ID = import.meta.env.VITE_APPLE_CLIENT_ID;
const APPLE_REDIRECT_URI = import.meta.env.VITE_APPLE_REDIRECT_URI;

/**
 * Renders "Sign in with Google" / "Sign in with Apple" buttons. Both need
 * real credentials from their respective developer consoles to actually
 * authenticate — see docs/SETUP.md. Until VITE_GOOGLE_CLIENT_ID /
 * VITE_APPLE_CLIENT_ID are set, this shows a disabled placeholder instead of
 * a broken button.
 */
export default function SocialLogin({ onSuccess, onError }) {
  return (
    <div className="space-y-2">
      <GoogleButton onSuccess={onSuccess} onError={onError} />
      <AppleButton onSuccess={onSuccess} onError={onError} />
    </div>
  );
}

function GoogleButton({ onSuccess, onError }) {
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

function AppleButton({ onSuccess, onError }) {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!APPLE_CLIENT_ID) return;
    let cancelled = false;

    const interval = setInterval(() => {
      if (window.AppleID && !cancelled) {
        clearInterval(interval);
        window.AppleID.auth.init({
          clientId: APPLE_CLIENT_ID,
          scope: 'name email',
          redirectURI: APPLE_REDIRECT_URI,
          usePopup: true,
        });
        setReady(true);
      }
    }, 200);

    function handleSuccess(event) {
      const { authorization, user } = event.detail;
      const name = user?.name ? `${user.name.firstName || ''} ${user.name.lastName || ''}`.trim() : undefined;
      client
        .post('/auth/apple', { idToken: authorization.id_token, name })
        .then(({ data }) => onSuccess(data.token, data.user))
        .catch((err) => onError(err.response?.data?.error || 'Apple sign-in failed'));
    }
    function handleFailure(event) {
      onError(event.detail?.error || 'Apple sign-in failed');
    }

    document.addEventListener('AppleIDSignInOnSuccess', handleSuccess);
    document.addEventListener('AppleIDSignInOnFailure', handleFailure);
    return () => {
      cancelled = true;
      clearInterval(interval);
      document.removeEventListener('AppleIDSignInOnSuccess', handleSuccess);
      document.removeEventListener('AppleIDSignInOnFailure', handleFailure);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!APPLE_CLIENT_ID) {
    return (
      <button
        type="button"
        disabled
        title="Requires a paid Apple Developer account + Services ID — see docs/SETUP.md"
        className="btn-secondary w-full opacity-50 cursor-not-allowed"
      >
        Continue with Apple (not configured)
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={() => window.AppleID?.auth.signIn()}
      disabled={!ready}
      className="btn-secondary w-full"
    >
      Continue with Apple
    </button>
  );
}
