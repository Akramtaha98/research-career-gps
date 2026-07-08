import { useTranslation } from 'react-i18next';

const ORCID_CLIENT_ID = import.meta.env.VITE_ORCID_CLIENT_ID;
const ORCID_REDIRECT_URI = import.meta.env.VITE_ORCID_REDIRECT_URI;
const ORCID_BASE = import.meta.env.VITE_ORCID_SANDBOX === 'true' ? 'https://sandbox.orcid.org' : 'https://orcid.org';

function buildAuthorizeUrl() {
  const params = new URLSearchParams({
    client_id: ORCID_CLIENT_ID,
    response_type: 'code',
    scope: '/authenticate',
    redirect_uri: ORCID_REDIRECT_URI,
  });
  return `${ORCID_BASE}/oauth/authorize?${params.toString()}`;
}

/**
 * "Sign in with ORCID" — redirects the whole page to ORCID's own login/
 * consent screen (not a popup like Google's flow, since the code-for-token
 * exchange needs the Client Secret and must happen server-side; see
 * backend/services/orcidAuth.js). ORCID redirects back to
 * VITE_ORCID_REDIRECT_URI — the BACKEND callback route, which does the
 * exchange and hands off to OrcidCallback.jsx with a JWT.
 *
 * Needs VITE_ORCID_CLIENT_ID + VITE_ORCID_REDIRECT_URI from a free ORCID
 * public API app (orcid.org/developer-tools) — shows a disabled placeholder
 * until those are set, same pattern as SocialLogin.jsx's Google button.
 */
export default function OrcidButton() {
  const { t } = useTranslation();

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
