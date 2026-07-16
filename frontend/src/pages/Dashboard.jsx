import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useResearcher } from '../context/ResearcherContext';
import MetricCard from '../components/MetricCard';
import HIndexChart from '../components/HIndexChart';
import EmptyState from '../components/EmptyState';
import HIndexFrontier from '../components/HIndexFrontier';
import { calculateHIndex } from '../utils/prediction';

function formatDate(iso) {
  return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short' });
}

export default function Dashboard() {
  const {
    source,
    researcher,
    papers,
    allPapers,
    setPaperVerification,
    addPaperByDoi,
    removeManualPaper,
    history,
    loading,
    refreshResearcher,
    getRealHistory,
  } = useResearcher();
  const { t } = useTranslation();

  // H-index/citations/paper count are always computed directly from the
  // tracked `papers` list (OpenAlex/Semantic Scholar auto-synced, ORCID-
  // resolved when applicable via the Verify page) — so a 'not_mine'/
  // 'duplicate' correction immediately updates the headline numbers rather
  // than waiting for a full refetch.
  const effective = {
    hIndex: calculateHIndex(papers.map((p) => p.citations || 0)),
    totalCitations: papers.reduce((sum, p) => sum + (p.citations || 0), 0),
    paperCount: papers.length,
  };

  const [realHistory, setRealHistory] = useState(null); // { history, papersConsidered, papersSkipped, cached }
  const [realHistoryLoading, setRealHistoryLoading] = useState(false);
  const [realHistoryError, setRealHistoryError] = useState(null);

  async function handleLoadRealHistory() {
    setRealHistoryLoading(true);
    setRealHistoryError(null);
    try {
      const data = await getRealHistory();
      setRealHistory(data);
    } catch (err) {
      setRealHistoryError(err.response?.data?.error || t('dashboard.realHistoryError'));
    } finally {
      setRealHistoryLoading(false);
    }
  }

  const chartHistory = history.map((h) => ({
    label: formatDate(h.recorded_at),
    hIndex: h.h_index,
  }));

  const realChartHistory = realHistory?.history?.map((h) => ({
    label: String(h.year),
    hIndex: h.hIndex,
  }));

  const [showAllPapers, setShowAllPapers] = useState(false);
  const [paperFilter, setPaperFilter] = useState('');
  const [sortKey, setSortKey] = useState('citations'); // 'title' | 'year' | 'venue' | 'citations'
  const [sortDir, setSortDir] = useState('desc'); // 'asc' | 'desc'

  function toggleSort(key) {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      // Citations/year make more sense starting high-to-low; title/venue A-Z.
      setSortDir(key === 'title' || key === 'venue' ? 'asc' : 'desc');
    }
  }

  // The management table below shows EVERY tracked paper (allPapers), not the
  // filtered `papers` used for metrics/Predictor/Actions — otherwise a paper
  // marked 'not_mine' would vanish from the table with no way to undo it.
  const filteredPapers = paperFilter.trim()
    ? allPapers.filter((p) => {
        const q = paperFilter.trim().toLowerCase();
        return (p.title || '').toLowerCase().includes(q) || (p.venue || '').toLowerCase().includes(q);
      })
    : allPapers;

  const sortedPapers = [...filteredPapers].sort((a, b) => {
    let cmp;
    if (sortKey === 'title') cmp = (a.title || '').localeCompare(b.title || '');
    else if (sortKey === 'venue') cmp = (a.venue || '').localeCompare(b.venue || '');
    else if (sortKey === 'year') cmp = (a.year || 0) - (b.year || 0);
    else cmp = (a.citations || 0) - (b.citations || 0);
    return sortDir === 'asc' ? cmp : -cmp;
  });

  const visiblePapers = showAllPapers ? sortedPapers : sortedPapers.slice(0, 8);

  function SortArrow({ column }) {
    if (sortKey !== column) return null;
    return <span className="ml-1 text-brand-500">{sortDir === 'asc' ? '↑' : '↓'}</span>;
  }

  if (allPapers.length === 0) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-10">
        <div className="card">
          <EmptyState
            icon="🌱"
            title={t('dashboard.emptyTitle', { name: researcher.name })}
            description={t('dashboard.emptyDesc')}
            action={
              source === 'live' ? (
                <button onClick={refreshResearcher} disabled={loading} className="btn-secondary">
                  {loading ? t('dashboard.refreshing') : t('dashboard.emptyRefresh')}
                </button>
              ) : null
            }
          />
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-10 space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{researcher.name}</h1>
          <p className="text-sm text-slate-500">
            {source === 'demo' ? t('dashboard.demoData') : `${t('dashboard.semanticScholarId')}: ${researcher.semantic_scholar_id}`}
          </p>
        </div>
        {source === 'live' && (
          <button onClick={refreshResearcher} disabled={loading} className="btn-secondary">
            {loading ? t('dashboard.refreshing') : t('dashboard.refresh')}
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard label={t('dashboard.hIndex')} value={effective.hIndex} accent="brand" />
        <MetricCard
          label={t('dashboard.totalCitations')}
          value={effective.totalCitations?.toLocaleString?.() ?? effective.totalCitations}
          accent="sky"
        />
        <MetricCard label={t('dashboard.trackedPapers')} value={effective.paperCount ?? papers.length} accent="emerald" />
        <MetricCard
          label={t('dashboard.avgCitations')}
          value={(papers.length ? Math.round((effective.totalCitations || 0) / papers.length) : 0).toLocaleString()}
          accent="amber"
        />
      </div>

      <HIndexFrontier papers={papers} />

      <div className="card">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-4">
          <h2 className="text-lg font-semibold text-slate-900">
            {realChartHistory ? t('dashboard.realHistoryTitle') : t('dashboard.growthTitle')}
          </h2>
          {source === 'live' && !realChartHistory && (
            <button
              onClick={handleLoadRealHistory}
              disabled={realHistoryLoading}
              className="btn-secondary text-xs self-start sm:self-auto"
            >
              {realHistoryLoading ? t('dashboard.realHistoryLoading') : t('dashboard.realHistoryCta')}
            </button>
          )}
        </div>

        {realHistoryError && <p className="text-sm text-red-600 mb-3">{realHistoryError}</p>}

        {realChartHistory ? (
          realChartHistory.length > 1 ? (
            <>
              <HIndexChart history={realChartHistory} />
              <p className="mt-3 text-xs text-slate-400">
                {t('dashboard.realHistoryNote', { count: realHistory.papersConsidered })}
                {realHistory.papersSkipped > 0
                  ? ' ' + t('dashboard.realHistorySkipped', { count: realHistory.papersSkipped })
                  : ''}
              </p>
            </>
          ) : (
            <EmptyState icon="📈" title={t('dashboard.notEnoughHistoryTitle')} description={t('dashboard.notEnoughHistoryDesc')} />
          )
        ) : chartHistory.length > 1 ? (
          <HIndexChart history={chartHistory} />
        ) : (
          <EmptyState
            icon="📈"
            title={t('dashboard.notEnoughHistoryTitle')}
            description={t('dashboard.notEnoughHistoryDesc')}
          />
        )}
      </div>

      <div className="card">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
          <h2 className="text-lg font-semibold text-slate-900">{t('dashboard.allPapersTitle')}</h2>
          <input
            type="text"
            value={paperFilter}
            onChange={(e) => setPaperFilter(e.target.value)}
            placeholder={t('dashboard.filterPlaceholder')}
            className="input sm:max-w-xs"
          />
        </div>

        {source === 'live' && <AddPaperByDoi onAdd={addPaperByDoi} />}

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-slate-400 border-b border-slate-100 select-none">
                <th className="py-2 pr-4 cursor-pointer hover:text-slate-600" onClick={() => toggleSort('title')}>
                  {t('dashboard.colTitle')}
                  <SortArrow column="title" />
                </th>
                <th className="py-2 pr-4 cursor-pointer hover:text-slate-600" onClick={() => toggleSort('year')}>
                  {t('dashboard.colYear')}
                  <SortArrow column="year" />
                </th>
                <th className="py-2 pr-4 cursor-pointer hover:text-slate-600" onClick={() => toggleSort('venue')}>
                  {t('dashboard.colVenue')}
                  <SortArrow column="venue" />
                </th>
                <th
                  className="py-2 pr-4 text-right cursor-pointer hover:text-slate-600"
                  onClick={() => toggleSort('citations')}
                >
                  {t('dashboard.colCitations')}
                  <SortArrow column="citations" />
                </th>
                <th className="py-2 pr-4 text-right">{t('dashboard.colVerification')}</th>
              </tr>
            </thead>
            <tbody>
              {visiblePapers.map((p) => {
                const key = p.external_id || p.id;
                const verification = p.verification || null;
                return (
                  <tr
                    key={p.id}
                    className={`border-b border-slate-50 last:border-0 ${
                      verification === 'not_mine' || verification === 'duplicate' ? 'opacity-50' : ''
                    }`}
                  >
                    <td className="py-2.5 pr-4 font-medium text-slate-700">
                      {p.title}
                      {p.origin === 'manual' && (
                        <span className="ml-1.5 text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-sky-100 text-sky-700 align-middle">
                          {t('dashboard.manualBadge')}
                        </span>
                      )}
                    </td>
                    <td className="py-2.5 pr-4 text-slate-500">{p.year || '—'}</td>
                    <td className="py-2.5 pr-4 text-slate-500">{p.venue || '—'}</td>
                    <td className="py-2.5 pr-4 text-right font-semibold text-brand-600">
                      {(p.citations || 0).toLocaleString()}
                    </td>
                    <td className="py-2.5 pr-4">
                      {p.origin === 'manual' ? (
                        <div className="flex items-center justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => removeManualPaper(p.external_id)}
                            className="text-[11px] text-red-500 hover:text-red-700 underline"
                          >
                            {t('dashboard.removeManual')}
                          </button>
                        </div>
                      ) : (
                        <PaperVerificationControl
                          status={verification}
                          onChange={(status) => setPaperVerification(key, status)}
                        />
                      )}
                    </td>
                  </tr>
                );
              })}
              {visiblePapers.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-6 text-center text-slate-400">
                    {t('dashboard.filterNoResults')}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {sortedPapers.length > 8 && (
          <div className="mt-4 text-center">
            <button onClick={() => setShowAllPapers((v) => !v)} className="btn-secondary text-xs">
              {showAllPapers
                ? t('dashboard.showLessPapers')
                : t('dashboard.showMorePapers', { count: sortedPapers.length - 8 })}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Per-paper "this is mine / not mine / duplicate" control. A wrong entry in
 * an auto-synced paper list (common with common author names or merged
 * profiles) would otherwise silently inflate h-index, Predictor projections,
 * and Actions recommendations forever — this lets the owner correct it once,
 * and the correction survives future refreshes (keyed by external_id, see
 * ResearcherContext's setPaperVerification).
 */
function PaperVerificationControl({ status, onChange }) {
  const { t } = useTranslation();

  if (status === 'confirmed') {
    return (
      <div className="flex items-center justify-end gap-1.5">
        <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700">
          {t('dashboard.verification.confirmedBadge')}
        </span>
        <button onClick={() => onChange(null)} className="text-[11px] text-slate-400 hover:text-slate-600">
          {t('dashboard.verification.undo')}
        </button>
      </div>
    );
  }

  if (status === 'not_mine' || status === 'duplicate') {
    return (
      <div className="flex items-center justify-end gap-1.5">
        <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-red-100 text-red-700">
          {status === 'not_mine' ? t('dashboard.verification.notMineBadge') : t('dashboard.verification.duplicateBadge')}
        </span>
        <button onClick={() => onChange(null)} className="text-[11px] text-slate-400 hover:text-slate-600">
          {t('dashboard.verification.undo')}
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-end gap-1 text-[11px]">
      <button
        onClick={() => onChange('confirmed')}
        className="px-1.5 py-0.5 rounded hover:bg-emerald-50 hover:text-emerald-700 text-slate-400"
        title={t('dashboard.verification.confirm')}
      >
        {t('dashboard.verification.confirm')}
      </button>
      <span className="text-slate-200">·</span>
      <button
        onClick={() => onChange('not_mine')}
        className="px-1.5 py-0.5 rounded hover:bg-red-50 hover:text-red-700 text-slate-400"
        title={t('dashboard.verification.notMine')}
      >
        {t('dashboard.verification.notMine')}
      </button>
      <span className="text-slate-200">·</span>
      <button
        onClick={() => onChange('duplicate')}
        className="px-1.5 py-0.5 rounded hover:bg-amber-50 hover:text-amber-700 text-slate-400"
        title={t('dashboard.verification.duplicate')}
      >
        {t('dashboard.verification.duplicate')}
      </button>
    </div>
  );
}

/**
 * Lets the user add a paper OpenAlex/Semantic Scholar hasn't indexed yet by
 * pasting its DOI — verified server-side against Crossref (the DOI
 * registration agency itself) before it's added, so this can't be used to
 * inflate numbers with fabricated entries the way freely typing a title
 * could. See backend/services/crossref.js and the addPaperByDoi endpoint.
 */
function AddPaperByDoi({ onAdd }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [doi, setDoi] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState(null);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!doi.trim()) return;
    setSubmitting(true);
    setMessage(null);
    try {
      const paper = await onAdd(doi.trim());
      setMessage({ ok: true, text: t('dashboard.addDoiSuccess', { title: paper.title }) });
      setDoi('');
      setOpen(false);
    } catch (err) {
      setMessage({ ok: false, text: err.response?.data?.error || t('dashboard.addDoiFailed') });
    } finally {
      setSubmitting(false);
    }
  }

  if (!open) {
    return (
      <div className="mb-4">
        <button type="button" onClick={() => setOpen(true)} className="text-xs text-brand-600 underline">
          {t('dashboard.addDoiOpen')}
        </button>
        {message && (
          <p className={`mt-1 text-xs ${message.ok ? 'text-emerald-600' : 'text-red-600'}`}>{message.text}</p>
        )}
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="mb-4 p-3 rounded-lg border border-slate-100 bg-slate-50">
      <label className="block text-xs font-medium text-slate-600 mb-1">{t('dashboard.addDoiLabel')}</label>
      <div className="flex flex-col sm:flex-row gap-2">
        <input
          className="input flex-1"
          placeholder={t('dashboard.addDoiPlaceholder')}
          value={doi}
          onChange={(e) => setDoi(e.target.value)}
        />
        <div className="flex gap-2 shrink-0">
          <button type="submit" disabled={submitting} className="btn-primary text-xs px-3 py-1.5">
            {submitting ? t('dashboard.addDoiSubmitting') : t('dashboard.addDoiSubmit')}
          </button>
          <button type="button" onClick={() => setOpen(false)} className="text-xs text-slate-500 underline">
            {t('dashboard.addDoiCancel')}
          </button>
        </div>
      </div>
      <p className="mt-1.5 text-[11px] text-slate-400">{t('dashboard.addDoiHint')}</p>
      {message && <p className={`mt-1 text-xs ${message.ok ? 'text-emerald-600' : 'text-red-600'}`}>{message.text}</p>}
    </form>
  );
}
