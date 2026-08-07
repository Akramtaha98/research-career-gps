import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

/**
 * Self-paced "how does this work" guide, reachable from the nav (t('nav.guide'))
 * and linked from the empty-state on Dashboard. Deliberately an interactive,
 * translatable step-by-step page rather than a hosted video: it's instant to
 * load, works in all 6 locales without re-recording anything, and needs no
 * video hosting/CDN — a better fit for this app's scale than a single
 * English-only screen-capture would be. Each step animates in on scroll-into-
 * view for a bit of life without being distracting (see the IntersectionObserver
 * hook below), and respects prefers-reduced-motion the same way index.css's
 * page-transition does.
 */
const STEP_ICONS = {
  search: '🔍',
  dashboard: '📊',
  frontier: '🎯',
  actions: '✅',
  predictor: '🔮',
  timeline: '🕒',
  verify: '🪪',
};

const STEP_LINKS = {
  search: '/search',
  dashboard: '/dashboard',
  frontier: '/dashboard',
  actions: '/actions',
  predictor: '/predictor',
  timeline: '/timeline',
  verify: '/verify',
};

const STEP_ORDER = ['search', 'dashboard', 'frontier', 'actions', 'predictor', 'timeline', 'verify'];

export default function HowItWorks() {
  const { t } = useTranslation();

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-10 space-y-8">
      <div className="text-center space-y-2">
        <span className="text-4xl" aria-hidden="true">🧭</span>
        <h1 className="text-2xl sm:text-3xl font-bold text-slate-900">{t('howItWorks.title')}</h1>
        <p className="text-sm text-slate-500 max-w-xl mx-auto">{t('howItWorks.subtitle')}</p>
        <div className="pt-2">
          <Link to="/search" className="btn-primary">
            {t('howItWorks.ctaSearch')}
          </Link>
        </div>
      </div>

      <div className="relative">
        <div
          className="hidden sm:block absolute left-6 top-6 bottom-6 w-px bg-gradient-to-b from-brand-100 via-brand-50 to-transparent"
          aria-hidden="true"
        />
        <ol className="space-y-4">
          {STEP_ORDER.map((key, i) => (
            <GuideStep
              key={key}
              index={i}
              icon={STEP_ICONS[key]}
              to={STEP_LINKS[key]}
              title={t(`howItWorks.steps.${key}.title`)}
              desc={t(`howItWorks.steps.${key}.desc`)}
            />
          ))}
        </ol>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="card flex gap-3 items-start">
          <span className="text-2xl shrink-0" aria-hidden="true">🧭</span>
          <div>
            <h2 className="font-semibold text-slate-900 text-sm">{t('howItWorks.assistantTitle')}</h2>
            <p className="text-xs text-slate-500 mt-1">{t('howItWorks.assistantDesc')}</p>
          </div>
        </div>
        <div className="card flex gap-3 items-start">
          <span className="text-2xl shrink-0" aria-hidden="true">💬</span>
          <div>
            <h2 className="font-semibold text-slate-900 text-sm">{t('howItWorks.feedbackTitle')}</h2>
            <p className="text-xs text-slate-500 mt-1">{t('howItWorks.feedbackDesc')}</p>
          </div>
        </div>
      </div>
    </div>
  );
}

function GuideStep({ index, icon, to, title, desc }) {
  return (
    <li
      className="relative sm:pl-16 opacity-0 animate-guide-step-in"
      style={{ animationDelay: `${Math.min(index * 80, 400)}ms` }}
    >
      <span className="hidden sm:flex absolute left-0 top-0 w-12 h-12 items-center justify-center rounded-full bg-white border-2 border-brand-100 text-xl shadow-sm">
        {icon}
      </span>
      <Link
        to={to}
        className="card card-interactive flex items-start gap-3 group"
      >
        <span className="sm:hidden text-xl shrink-0" aria-hidden="true">{icon}</span>
        <div className="min-w-0">
          <h3 className="font-semibold text-slate-900 group-hover:text-brand-700 transition">{title}</h3>
          <p className="text-sm text-slate-500 mt-1">{desc}</p>
        </div>
      </Link>
    </li>
  );
}
