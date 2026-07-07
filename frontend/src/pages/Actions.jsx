import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useResearcher } from '../context/ResearcherContext';
import { useAuth } from '../context/AuthContext';
import { generateActionItems } from '../utils/actionItems';
import EmptyState from '../components/EmptyState';
import CollaborationAdvisor from '../components/CollaborationAdvisor';
import UpgradeCTA from '../components/UpgradeCTA';

const priorityStyles = {
  high: 'bg-red-50 text-red-700 border-red-100',
  medium: 'bg-amber-50 text-amber-700 border-amber-100',
  low: 'bg-slate-50 text-slate-600 border-slate-100',
  info: 'bg-sky-50 text-sky-700 border-sky-100',
};

export default function Actions() {
  const { source, papers, researcher } = useResearcher();
  const { user } = useAuth();
  const { t } = useTranslation();

  const items = useMemo(() => generateActionItems({ papers }), [papers]);
  const isGated = source === 'live' && (!user || user.plan !== 'pro');

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-10 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">{t('actions.title')}</h1>
        <p className="text-sm text-slate-500 mt-1">
          {t('actions.subtitle', { name: researcher.name })}
        </p>
      </div>

      {papers.length === 0 ? (
        <div className="card">
          <EmptyState
            icon="🧭"
            title={t('actions.emptyTitle')}
            description={t('actions.emptyDesc')}
          />
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((item, idx) => (
            <div key={idx} className={`card border ${priorityStyles[item.priority]}`}>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="font-semibold text-slate-900">{t(item.titleKey, item.titleParams)}</p>
                  <p className="mt-1 text-sm text-slate-600">{t(item.descKey, item.descParams)}</p>
                </div>
                <span className={`shrink-0 text-xs font-semibold uppercase tracking-wide px-2 py-1 rounded-full border ${priorityStyles[item.priority]}`}>
                  {t(`actionItems.priority.${item.priority}`)}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="card">
        <h2 className="text-lg font-semibold text-slate-900 mb-1">{t('actions.collabTitle')}</h2>
        <p className="text-sm text-slate-500 mb-4">{t('actions.collabSubtitle')}</p>
        {isGated ? <UpgradeCTA feature={t('upgrade.collabFeature')} /> : <CollaborationAdvisor />}
      </div>
    </div>
  );
}
