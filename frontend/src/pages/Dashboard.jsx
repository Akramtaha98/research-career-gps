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

  const topPapers = [...papers].sort((a, b) => (b.citations || 0) - (a.citations || 0)).slice(0, 8);

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
        <h2 className="text-lg font-semibold text-slate-900 mb-4">{t('dashboard.topPapersTitle')}</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-slate-400 border-b border-slate-100">
                <th className="py-2 pr-4">{t('dashboard.colTitle')}</th>
                <th className="py-2 pr-4">{t('dashboard.colYear')}</th>
                <th className="py-2 pr-4">{t('dashboard.colVenue')}</th>
                <th className="py-2 pr-4 text-right">{t('dashboard.colCitations')}</th>
              </tr>
            </thead>
            <tbody>
              {topPapers.map((p) => (
                <tr key={p.id} className="border-b border-slate-50 last:border-0">
                  <td className="py-2.5 pr-4 font-medium text-slate-700">{p.title}</td>
                  <td className="py-2.5 pr-4 text-slate-500">{p.year || '—'}</td>
                  <td className="py-2.5 pr-4 text-slate-500">{p.venue || '—'}</td>
                  <td className="py-2.5 pr-4 text-right font-semibold text-brand-600">{(p.citations || 0).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
