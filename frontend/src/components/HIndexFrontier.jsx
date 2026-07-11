import { useTranslation } from 'react-i18next';
import { computeHIndexFrontier } from '../utils/frontier';

/**
 * The h-index frontier: not just the current score, but exactly which
 * papers are closest to pushing it to the next value, and how many more
 * citations each would need. See utils/frontier.js for the underlying
 * (pure, client-side) calculation — this component only renders it.
 */
export default function HIndexFrontier({ papers }) {
  const { t } = useTranslation();

  if (!papers || papers.length === 0) {
    return null;
  }

  const { currentHIndex, nextThreshold, candidates, papersNeededFromNewWork } = computeHIndexFrontier(papers);

  return (
    <div className="card">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <h2 className="text-lg font-semibold text-slate-900">{t('frontier.title')}</h2>
        <span className="text-xs font-semibold px-2 py-1 rounded-full bg-brand-50 text-brand-700 self-start sm:self-auto">
          {t('frontier.nextMilestone', { next: nextThreshold })}
        </span>
      </div>
      <p className="text-sm text-slate-500 mt-0.5">{t('frontier.subtitle')}</p>

      <p className="mt-4 text-sm text-slate-700">
        {candidates.length === 1
          ? t('frontier.summarySingle', {
              next: nextThreshold,
              count: candidates[0].citationsNeeded,
              title: candidates[0].title || t('frontier.untitled'),
            })
          : t('frontier.summaryMultiple', { next: nextThreshold, count: candidates.length })}
      </p>

      {papersNeededFromNewWork > 0 && (
        <p className="mt-2 text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
          {t('frontier.newWorkNeeded', { count: papersNeededFromNewWork, next: nextThreshold })}
        </p>
      )}

      {candidates.length > 0 && (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-slate-400 border-b border-slate-100">
                <th className="py-2 pr-4">{t('frontier.colPaper')}</th>
                <th className="py-2 pr-4 text-right">{t('frontier.colCitations')}</th>
                <th className="py-2 pr-4 text-right">{t('frontier.colNeeded')}</th>
              </tr>
            </thead>
            <tbody>
              {candidates.map((c) => (
                <tr key={c.id} className="border-b border-slate-50 last:border-0">
                  <td className="py-2.5 pr-4 font-medium text-slate-700">{c.title || t('frontier.untitled')}</td>
                  <td className="py-2.5 pr-4 text-right text-slate-500">{c.citations.toLocaleString()}</td>
                  <td className="py-2.5 pr-4 text-right font-semibold text-brand-600">
                    {t('frontier.citationsNeededValue', { count: c.citationsNeeded })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="mt-4 text-[11px] text-slate-400">
        {t('frontier.disclaimer', { h: currentHIndex })}
      </p>
    </div>
  );
}
