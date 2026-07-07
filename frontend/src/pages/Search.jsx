import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
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

    if (!user) {
      navigate('/login');
      return;
    }

    // A pure number is treated as a direct Semantic Scholar Author ID —
    // skip the search step and look it up immediately.
    if (NUMERIC_ID.test(trimmed)) {
      try {
        await lookupResearcher(trimmed);
        navigate('/dashboard');
      } catch {
        // error surfaced via context
      }
      return;
    }

    // Otherwise treat it as a name and search for matching authors.
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
    setPickingId(candidate.semanticScholarId);
    try {
      await lookupResearcher(candidate.semanticScholarId);
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
    <div className="max-w-2xl mx-auto px-4 py-16">
      <div className="text-center mb-8">
        <h1 className="text-3xl font-bold text-slate-900">{t('search.title')}</h1>
        <p className="mt-2 text-slate-500">{t('search.subtitle')}</p>
      </div>

      <form onSubmit={handleSubmit} className="card space-y-4">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">{t('search.label')}</label>
          <input
            className="input"
            placeholder={t('search.placeholder')}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            required
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
          <button type="button" onClick={handleDemo} className="btn-secondary flex-1">
            {t('search.demoBtn')}
          </button>
        </div>
      </form>

      {candidates && (
        <div className="card mt-6">
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
                className="w-full text-left px-4 py-3 rounded-xl border border-slate-100 hover:border-brand-300 hover:bg-brand-50 transition flex items-center justify-between gap-3 disabled:opacity-50"
              >
                <div>
                  <p className="font-medium text-slate-800">{c.name}</p>
                  <p className="text-xs text-slate-500">
                    {c.affiliations?.length ? c.affiliations.join(', ') + ' · ' : ''}
                    {c.paperCount} {t('search.papers')} · {c.citationCount.toLocaleString()} {t('search.citations')} · {t('search.hIndexLabel')} {c.hIndex}
                  </p>
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
