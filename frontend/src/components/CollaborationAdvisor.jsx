import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useResearcher } from '../context/ResearcherContext';

/**
 * Ranks the researcher's real, existing co-authors by h-index — grounded in
 * actual Semantic Scholar collaboration history, not invented suggestions.
 */
export default function CollaborationAdvisor() {
  const { getCollaborators, papers } = useResearcher();
  const [collaborators, setCollaborators] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const { t } = useTranslation();

  useEffect(() => {
    let cancelled = false;
    if (papers.length === 0) {
      setCollaborators([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    getCollaborators()
      .then((data) => !cancelled && setCollaborators(data))
      .catch((err) => !cancelled && setError(err.response?.data?.error || err.message))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (loading) {
    return <p className="text-sm text-slate-400">{t('collaboration.analyzing')}</p>;
  }
  if (error) {
    return <p className="text-sm text-red-600">{error}</p>;
  }
  if (!collaborators || collaborators.length === 0) {
    return <p className="text-sm text-slate-500">{t('collaboration.notEnough')}</p>;
  }

  return (
    <div className="space-y-2">
      {collaborators.map((c) => (
        <div
          key={c.semanticScholarId}
          className="flex items-center justify-between gap-3 px-4 py-3 rounded-xl border border-slate-100"
        >
          <div>
            <p className="font-medium text-slate-800">{c.name}</p>
            <p className="text-xs text-slate-500">
              {t('collaboration.papersTogether', { count: c.papersCoAuthored })} · {t('search.hIndexLabel')} {c.hIndex} ·{' '}
              {c.citationCount.toLocaleString()} {t('search.citations')}
            </p>
          </div>
          <span className="text-xs font-semibold text-brand-600 shrink-0">{t('collaboration.strongTrack')}</span>
        </div>
      ))}
    </div>
  );
}
