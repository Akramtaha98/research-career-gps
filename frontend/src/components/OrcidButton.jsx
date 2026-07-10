import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import client from '../api/client';

const ORCID_CLIENT_ID = import.meta.env.VITE_ORCID_CLIENT_ID;
const ORCID_REDIRECT_URI = import.meta.env.VITE_ORCID_REDIRECT_URI;
const ORCID_BASE = import.meta.env.VITE_ORCID_SANDBOX === 'true' ? 'https://sandbox.orcid.org' : 'https://orcid.org';

function buildAuthorizeUrl(state) {
  const params = new URLSearchParams({
    client_id: ORCID_CLIENT_ID,
    response_type: 'code',
    scope: '/authenticate',
    redirect_uri: ORCID_REDIRECT_URI,
  });
  // Present only for the "Connect ORCID" flow — the backend callback treats a
  // valid `state` as "link this ORCID to the signed-in account" instead of
  // "sign in / create an ORCID account" (see authController#orcidCallback).
  if (state) params.set('state', state);
  return `${ORCID_BASE}/oauth/authorize?${params.toString()}`;
}

/**
 * ORCID button with two modes:
 *  - default (sign-in): a plain link to ORCID's consent screen; on return the
 *    backend find-or-creates an ORCID-keyed account.
 *  - `connect` (link): for an already-signed-in user. Fetches a short-lived
 *    link `state` from the backend, then redirects to ORCID with it so the
 *    callback attaches the ORCID to their EXISTING account rather than making
 *    a second one.
 *
 * The whole page redirects (not a popup like Google's flow) because the
 * code-for-token exchange needs the Client Secret and must happen
 * server-side; see backend/services/orcidAuth.js. Needs VITE_ORCID_CLIENT_ID
 * + VITE_ORCID_REDIRECT_URI — shows a disabled placeholder until they're set.
 */
export default function OrcidButton({ connect = false }) {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  if (!ORCID_CLIENT_ID || !ORCID_REDIRECT_URI) {
    return (
      <button
        type="button"
        disabled
        title={t('orcidLogin.notConfiguredTitle')}
        className="btn-secondary w-full opacity-50 cursor-not-allowed mt-2 flex items-center justify-center gap-2"
      >
        <OrcidMark />
        {t('orcidLogin.notConfigured')}
      </button>
    );
  }

  if (connect) {
    async function startConnect() {
      setBusy(true);
      setError(null);
      try {
        const { data } = await client.get('/auth/orcid/link-state');
        window.location.href = buildAuthorizeUrl(data.state);
      } catch (err) {
        setError(err.response?.data?.error || t('orcidLogin.connectFailed'));
        setBusy(false);
      }
    }

    return (
      <div>
        <button
          type="button"
          onClick={startConnect}
          disabled={busy}
          className="btn-secondary w-full flex items-center justify-center gap-2"
        >
          <OrcidMark />
          {busy ? t('orcidLogin.connecting') : t('orcidLogin.connectCta')}
        </button>
        {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
      </div>
    );
  }

  return (
    <a
      href={buildAuthorizeUrl()}
      className="btn-secondary w-full mt-2 flex items-center justify-center gap-2 no-underline"
    >
      <OrcidMark />
      {t('orcidLogin.cta')}
    </a>
  );
}

/** Lightweight stand-in for the ORCID iD mark (brand green circle + "iD") — not the official logo asset. */
function OrcidMark() {
  return (
    <span
      aria-hidden="true"
      className="inline-flex items-center justify-center w-4 h-4 rounded-full text-[9px] font-bold text-white shrink-0"
      style={{ backgroundColor: '#A6CE39' }}
    >
      iD
    </span>
  );
}
