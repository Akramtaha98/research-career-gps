import { useEffect, useRef, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../context/AuthContext';
import { useResearcher } from '../context/ResearcherContext';

/**
 * Where the backend's /auth/orcid/callback redirects to once it's exchanged
 * ORCID's code for a JWT (see authController.js#orcidCallback). Two steps:
 * 1. Pick the token out of the URL fragment and log in.
 * 2. Once the account's ORCID iD is known, auto-look-up their OpenAlex
 *    profile by that ORCID (reusing the exact-match ORCID search built for
 *    the main search box) and load it straight into the dashboard — no
 *    manual search needed after signing in.
 */
export default function OrcidCallback() {
  const [status, setStatus] = useState('signing-in'); // signing-in | looking-up | error
  const [errorMessage, setErrorMessage] = useState(null);
  const { loginWithToken, user } = useAuth();
  const { searchByName, lookupResearcher } = useResearcher();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const lookupStarted = useRef(false);

  useEffect(() => {
    const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''));
    const token = hash.get('token');
    const error = hash.get('error');

    if (error) {
      setStatus('error');
      setErrorMessage(error);
      return;
    }
    if (!token) {
      setStatus('error');
      setErrorMessage(t('orcidLogin.missingToken'));
      return;
    }
    loginWithToken(token);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (status !== 'signing-in' || !user || lookupStarted.current) return;
    lookupStarted.current = true;

    if (!user.orcid) {
      // Shouldn't normally happen (this page only runs after ORCID sign-in),
      // but fall through gracefully rather than getting stuck.
      navigate('/dashboard');
      return;
    }

    setStatus('looking-up');
    (async () => {
      try {
        const candidates = await searchByName(user.orcid);
        if (candidates && candidates[0]) {
          await lookupResearcher(candidates[0].semanticScholarId, candidates[0].source);
        }
      } catch {
        // No OpenAlex profile for this ORCID yet, or the lookup failed —
        // not fatal, they can still search manually from the dashboard/search page.
      } finally {
        navigate('/dashboard');
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, status]);

  return (
    <div className="min-h-[60vh] flex items-center justify-center px-4">
      <div className="card w-full max-w-md text-center space-y-3">
        {status === 'error' ? (
          <>
            <p className="text-sm font-semibold text-red-600">{t('orcidLogin.failed')}</p>
            <p className="text-xs text-slate-500">{errorMessage}</p>
            <Link to="/login" className="text-brand-600 text-sm font-semibold underline">
              {t('orcidLogin.backToLogin')}
            </Link>
          </>
        ) : (
          <>
            <div className="mx-auto h-8 w-8 rounded-full border-2 border-brand-200 border-t-brand-600 animate-spin" />
            <p className="text-sm text-slate-600">
              {status === 'looking-up' ? t('orcidLogin.lookingUp') : t('orcidLogin.signingIn')}
            </p>
          </>
        )}
      </div>
    </div>
  );
}
