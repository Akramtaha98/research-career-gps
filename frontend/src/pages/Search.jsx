import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../context/AuthContext';
import { useResearcher } from '../context/ResearcherContext';

const NUMERIC_ID = /^\d+$/;

export default function Search() {
  const [query, setQuery] = useState('');
  const [candidates, setCandidates] = useState(null);
  const [searching, setSearching] = useState(false);
  const [pickingId, setPickingId] = useState(null);
  const { user } = useAuth();
  const { searchByName, lookupResearcher, useDemo, loading, error } = useResearcher();
  const navigate = useNavigate();
  const { t } = useTranslation();

  async function handleSubmit(e) {
    e.preventDefault();
    const trimmed = query.trim();
    if (!trimmed) return;

    // A pure number is treated as a direct Semantic Scholar Author ID.
    // Persisting a tracked researcher requires an account, so gate only
    // this path — free-text name search below is public on the backend
    // and should work for anonymous visitors too.
    if (NUMERIC_ID.test(trimmed)) {
      if (!user) {
        navigate('/login');
        return;
      }
      try {
        await lookupResearcher(trimmed, 'semantic_scholar');
        navigate('/dashboard');
      } catch {
        // error surfaced via context
      }
      return;
    }

    // Name search hits a public, unauthenticated endpoint — no login
    // required just to see who's out there.
    setSearching(true);
    setCandidates(null);
    try {
      const results = await searchByName(trimmed);
      setCandidates(results);
    } catch {
      // error surfaced via context
    } finally {
      setSearching(false);
    }
  }

  async function handlePick(candidate) {
    // Picking a candidate to actually track/persist does require an
    // account — gate here instead, after the user has already seen
    // real search results.
    if (!user) {
      navigate('/login');
      return;
    }
    setPickingId(candidate.semanticScholarId);
    try {
      await lookupResearcher(candidate.semanticScholarId, candidate.source);
      navigate('/dashboard');
    } catch {
      // error surfaced via context
    } finally {
      setPickingId(null);
    }
  }

  function handleDemo() {
    useDemo();
    navigate('/dashboard');
  }

  return (
    <div className="relative max-w-2xl mx-auto px-4 py-16 overflow-hidden">
      {/*
        Purely decorative, low-opacity gradient blobs drifting slowly behind
        the hero — the "break the ice" touch on the first page a visitor
        sees. aria-hidden + pointer-events-none since they carry no
        information and must never intercept clicks on the real content
        that sits above them (z-10 below). Clipped by this wrapper's
        overflow-hidden so they can't cause horizontal scroll on narrow
        viewports.
      */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-24 -left-24 w-72 h-72 rounded-full bg-brand-400/20 blur-3xl animate-blob-drift"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -bottom-16 -right-16 w-80 h-80 rounded-full bg-sky-400/20 blur-3xl animate-blob-drift-slow"
      />

      <div className="relative z-10 text-center mb-8 opacity-0 animate-hero-in">
        <span className="inline-block text-4xl mb-2" aria-hidden="true">🧭</span>
        <h1 className="text-3xl sm:text-4xl font-bold text-slate-900">{t('search.title')}</h1>
        <p className="mt-2 text-slate-500">{t('search.subtitle')}</p>
        <Link
          to="/how-it-works"
          className="mt-3 inline-flex items-center gap-1 text-sm text-brand-600 hover:text-brand-700 underline underline-offset-2"
        >
          {t('search.howItWorksLink')}
        </Link>
      </div>

      <form
        onSubmit={handleSubmit}
        className="relative z-10 card space-y-4 opacity-0 animate-hero-in"
        style={{ animationDelay: '120ms' }}
      >
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">{t('search.label')}</label>
          <input
            className="input"
            placeholder={t('search.placeholder')}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoFocus
            required
            autoComplete="off"
            // Chrome's newer "suggest a saved payment card" autofill can
            // trigger on any generic text input once it's focused/typed
            // into, not just ones that look like a card-number field --
            // name="search" plus autoComplete="off" is the combination that
            // reliably keeps it from offering saved cards/addresses here.
            name="search"
          />
          <p className="mt-1 text-xs text-slate-400">{t('search.hint')}</p>
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}
        {!user && (
          <p className="text-sm text-amber-600">{t('search.loginRequired')}</p>
        )}

        <div className="flex gap-3">
          <button type="submit" disabled={searching || loading} className="btn-primary flex-1">
            {searching ? t('search.searching') : loading ? t('search.fetching') : t('search.searchBtn')}
          </button>
          {/* Demo data is only useful for anonymous visitors deciding whether to
              sign up — once logged in, showing it just risks accidentally
              replacing a real tracked researcher with the canned example. */}
          {!user && (
            <button type="button" onClick={handleDemo} className="btn-secondary flex-1">
              {t('search.demoBtn')}
            </button>
          )}
        </div>
      </form>

      {candidates && (
        <div className="relative z-10 card mt-6">
          <h2 className="text-sm font-semibold text-slate-700 mb-3">
            {candidates.length > 0
              ? t('search.matchesFound', { count: candidates.length })
              : t('search.noMatches')}
          </h2>
          <div className="space-y-2">
            {candidates.map((c) => (
              <button
                key={c.semanticScholarId}
                onClick={() => handlePick(c)}
                disabled={pickingId === c.semanticScholarId}
                className="w-full text-left px-4 py-3 rounded-xl border border-slate-100 hover:border-brand-300 hover:bg-brand-50 hover:shadow-btn transition duration-200 flex items-center justify-between gap-3 disabled:opacity-50 disabled:hover:border-slate-100 disabled:hover:bg-transparent"
              >
                <div>
                  <p className="font-medium text-slate-800">{c.fullName || c.name}</p>
                  {c.fullName && c.fullName !== c.name && (
                    <p className="text-xs text-slate-400">{t('search.akaLabel', { name: c.name })}</p>
                  )}
                  <p className="text-xs text-slate-500">
                    {c.affiliations?.length ? c.affiliations.join(', ') + ' · ' : ''}
                    {c.paperCount} {t('search.papers')} · {c.citationCount.toLocaleString()} {t('search.citations')} · {t('search.hIndexLabel')} {c.hIndex}
                  </p>
                  {c.orcid && <p className="text-xs text-slate-400">ORCID: {c.orcid}</p>}
                </div>
                <span className="text-xs text-brand-600 font-semibold shrink-0">
                  {pickingId === c.semanticScholarId ? t('search.pickLoading') : t('search.select')}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
