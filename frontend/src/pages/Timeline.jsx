import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { useResearcher } from '../context/ResearcherContext';
import MetricCard from '../components/MetricCard';
import HIndexChart from '../components/HIndexChart';
import EmptyState from '../components/EmptyState';

function formatDate(dateStr) {
  return new Date(dateStr).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

function SignedDelta({ value, suffix = '' }) {
  if (value == null) return null;
  if (value === 0) return <span className="text-slate-500">±0{suffix}</span>;
  const positive = value > 0;
  return (
    <span className={positive ? 'text-emerald-600 font-semibold' : 'text-red-600 font-semibold'}>
      {positive ? '+' : ''}
      {value}
      {suffix}
    </span>
  );
}

/**
 * Milestone list, newest first — derived purely from recorded snapshots
 * (see backend/services/timeline.js), so it never fabricates history from
 * before this researcher was first tracked. Each entry is one of
 * 'first_snapshot' | 'h_index_increase' | 'citation_milestone'.
 */
function MilestoneList({ milestones }) {
  const { t } = useTranslation();
  if (!milestones || milestones.length === 0) return null;

  const sorted = [...milestones].sort((a, b) => (a.date < b.date ? 1 : -1));

  return (
    <div className="card">
      <h2 className="text-lg font-semibold text-slate-900">{t('timeline.milestonesTitle')}</h2>
      <ul className="mt-3 space-y-3">
        {sorted.map((m, i) => (
          <li key={i} className="flex items-start gap-3">
            <span className="mt-0.5 shrink-0 w-2 h-2 rounded-full bg-brand-500" aria-hidden />
            <div>
              <p className="text-sm font-medium text-slate-700">
                {m.type === 'first_snapshot' &&
                  t('timeline.milestones.firstSnapshot', { hIndex: m.hIndex, citations: m.totalCitations })}
                {m.type === 'h_index_increase' &&
                  t('timeline.milestones.hIndexIncrease', { hIndex: m.hIndex, previous: m.previousHIndex })}
                {m.type === 'citation_milestone' &&
                  t('timeline.milestones.citationMilestone', { threshold: m.threshold.toLocaleString() })}
              </p>
              <p className="text-xs text-slate-400">{formatDate(m.date)}</p>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function Timeline() {
  const { source, researcher, papers, getTimeline } = useResearcher();
  const { t } = useTranslation();

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (source !== 'live') {
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    getTimeline()
      .then((result) => {
        if (!cancelled) setData(result);
      })
      .catch((err) => {
        if (!cancelled) setError(err.response?.data?.error || t('timeline.loadError'));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source, researcher?.id]);

  if (source !== 'live') {
    return (
      <div className="max-w-3xl mx-auto px-4 py-10">
        <div className="card">
          <EmptyState
            icon="🧭"
            title={t('timeline.demoEmptyTitle')}
            description={t('timeline.demoEmptyDesc')}
            action={
              <Link to="/search" className="btn-secondary">
                {t('timeline.demoEmptyCta')}
              </Link>
            }
          />
        </div>
      </div>
    );
  }

  if (loading) {
    return <div className="max-w-6xl mx-auto px-4 py-10 text-center text-slate-400">{t('timeline.loading')}</div>;
  }

  if (error) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-10">
        <div className="card text-center text-red-600 text-sm">{error}</div>
      </div>
    );
  }

  const snapshots = data?.snapshots || [];
  const sinceLastVisit = data?.sinceLastVisit || null;
  const milestones = data?.milestones || [];
  const latest = snapshots[snapshots.length - 1];
  const first = snapshots[0];

  const earliestPaperYear = papers.reduce((min, p) => (p.year && (!min || p.year < min) ? p.year : min), null);

  const chartHistory = snapshots.map((s) => ({ label: formatDate(s.snapshot_date), hIndex: s.h_index }));

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-10 space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">{t('timeline.title')}</h1>
        <p className="text-sm text-slate-500 mt-1">
          {first
            ? t('timeline.recordedSince', { date: formatDate(first.snapshot_date) })
            : t('timeline.subtitle')}
          {earliestPaperYear && ` · ${t('timeline.earliestPublication', { year: earliestPaperYear })}`}
        </p>
      </div>

      {latest && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <MetricCard label={t('dashboard.hIndex')} value={latest.h_index} accent="brand" />
          <MetricCard label={t('dashboard.totalCitations')} value={(latest.total_citations || 0).toLocaleString()} accent="sky" />
          <MetricCard label={t('dashboard.trackedPapers')} value={latest.paper_count ?? papers.length} accent="emerald" />
        </div>
      )}

      <div className="card">
        <h2 className="text-lg font-semibold text-slate-900">{t('timeline.sinceLastVisitTitle')}</h2>
        {sinceLastVisit ? (
          <div className="mt-2 flex flex-wrap gap-x-6 gap-y-2 text-sm">
            <span>
              {t('timeline.citations')}: <SignedDelta value={sinceLastVisit.citationsDelta} />
            </span>
            <span>
              {t('dashboard.hIndex')}: <SignedDelta value={sinceLastVisit.hIndexDelta} />
            </span>
            {sinceLastVisit.paperCountDelta != null && (
              <span>
                {t('dashboard.trackedPapers')}: <SignedDelta value={sinceLastVisit.paperCountDelta} />
              </span>
            )}
            {sinceLastVisit.papersWithIncreasedCitations != null && (
              <span className="text-slate-600">
                {t('timeline.papersGainedCitations', { count: sinceLastVisit.papersWithIncreasedCitations })}
              </span>
            )}
            <span className="text-xs text-slate-400 w-full">
              {t('timeline.sinceLastVisitRange', {
                from: formatDate(sinceLastVisit.fromDate),
                to: formatDate(sinceLastVisit.toDate),
              })}
            </span>
          </div>
        ) : (
          <p className="mt-2 text-sm text-slate-500">{t('timeline.sinceLastVisitEmpty')}</p>
        )}
      </div>

      <div className="card">
        <h2 className="text-lg font-semibold text-slate-900">{t('timeline.chartTitle')}</h2>
        <p className="text-xs text-slate-400 mt-0.5">{t('timeline.chartRecordedLabel')}</p>
        {chartHistory.length > 1 ? (
          <div className="mt-3">
            <HIndexChart history={chartHistory} />
          </div>
        ) : (
          <div className="mt-3">
            <EmptyState
              icon="📈"
              title={t('timeline.notEnoughHistoryTitle')}
              description={t('timeline.notEnoughHistoryDesc')}
            />
          </div>
        )}
      </div>

      <MilestoneList milestones={milestones} />

      <p className="text-[11px] text-slate-400">{t('timeline.disclaimer')}</p>
    </div>
  );
}
