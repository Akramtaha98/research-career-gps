import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useResearcher } from '../context/ResearcherContext';
import MetricCard from '../components/MetricCard';
import HIndexChart from '../components/HIndexChart';
import EmptyState from '../components/EmptyState';

function formatDate(iso) {
  return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short' });
}

export default function Dashboard() {
  const { source, researcher, papers, history, loading, refreshResearcher, getRealHistory } = useResearcher();
  const { t } = useTranslation();

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

  const filteredPapers = paperFilter.trim()
    ? papers.filter((p) => {
        const q = paperFilter.trim().toLowerCase();
        return (p.title || '').toLowerCase().includes(q) || (p.venue || '').toLowerCase().includes(q);
      })
    : papers;

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

  if (papers.length === 0) {
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
        <MetricCard label={t('dashboard.hIndex')} value={researcher.h_index} accent="brand" />
        <MetricCard label={t('dashboard.totalCitations')} value={researcher.total_citations?.toLocaleString?.() ?? researcher.total_citations} accent="sky" />
        <MetricCard label={t('dashboard.trackedPapers')} value={researcher.paper_count ?? papers.length} accent="emerald" />
        <MetricCard
          label={t('dashboard.avgCitations')}
          value={(papers.length ? Math.round((researcher.total_citations || 0) / papers.length) : 0).toLocaleString()}
          accent="amber"
        />
      </div>

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
              </tr>
            </thead>
            <tbody>
              {visiblePapers.map((p) => (
                <tr key={p.id} className="border-b border-slate-50 last:border-0">
                  <td className="py-2.5 pr-4 font-medium text-slate-700">{p.title}</td>
                  <td className="py-2.5 pr-4 text-slate-500">{p.year || '—'}</td>
                  <td className="py-2.5 pr-4 text-slate-500">{p.venue || '—'}</td>
                  <td className="py-2.5 pr-4 text-right font-semibold text-brand-600">{(p.citations || 0).toLocaleString()}</td>
                </tr>
              ))}
              {visiblePapers.length === 0 && (
                <tr>
                  <td colSpan={4} className="py-6 text-center text-slate-400">
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
