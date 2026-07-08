import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useResearcher } from '../context/ResearcherContext';
import { useAuth } from '../context/AuthContext';
import client from '../api/client';
import { projectHIndex } from '../utils/prediction';
import { TIERS, getMultiplier, getTierForVenue } from '../utils/venueTiers';
import HIndexChart from '../components/HIndexChart';
import UpgradeCTA from '../components/UpgradeCTA';
import ManualScoreCard from '../components/ManualScoreCard';

export default function Predictor() {
  const { source, researcher, papers } = useResearcher();
  const { user, refreshUser } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const { t } = useTranslation();

  // After returning from Stripe Checkout, refresh the user's plan. Stripe's
  // webhook may take a moment to land, so this is best-effort — reloading
  // the page later will always reflect the true state once it has.
  useEffect(() => {
    const checkout = searchParams.get('checkout');
    if (checkout === 'success') {
      refreshUser();
      const next = new URLSearchParams(searchParams);
      next.delete('checkout');
      setSearchParams(next, { replace: true });
    } else if (checkout === 'cancelled') {
      const next = new URLSearchParams(searchParams);
      next.delete('checkout');
      setSearchParams(next, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Seed the initial target off the manual score when one exists and would
  // already be used as the baseline — otherwise a researcher with e.g. an
  // auto H-index of 36 but a verified Scopus H-index of 48 would start on
  // a target (41) already below their real current number.
  const [targetH, setTargetH] = useState((researcher.manual_h_index || researcher.h_index) + 5);
  const [monthlyCitationRate, setMonthlyCitationRate] = useState(0.5);
  const [papersPerYear, setPapersPerYear] = useState(2);
  const [venueName, setVenueName] = useState('');
  const [venueTier, setVenueTier] = useState('average');
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState(null);

  // A self-reported official H-index (Scopus/WOS) has no per-paper citation
  // breakdown behind it, so it can't directly drive the simulation the way
  // the real papers list does. When the user opts to use it as the baseline,
  // we approximate with the minimal citation distribution that produces
  // that H-index (h papers each with exactly h citations) — an
  // approximation, clearly labeled as such in the UI.
  const [useManualBaseline, setUseManualBaseline] = useState(Boolean(researcher.manual_h_index));

  const currentCitations = useMemo(() => {
    if (useManualBaseline && researcher.manual_h_index) {
      return Array(researcher.manual_h_index).fill(researcher.manual_h_index);
    }
    return papers.map((p) => p.citations || 0);
  }, [papers, useManualBaseline, researcher.manual_h_index]);

  const effectiveHIndex =
    useManualBaseline && researcher.manual_h_index ? researcher.manual_h_index : researcher.h_index;

  // If the typed venue name matches a known pattern, suggest its tier —
  // the dropdown remains the source of truth the user can override.
  const suggestedTier = useMemo(() => getTierForVenue(venueName), [venueName]);

  const projection = useMemo(
    () =>
      projectHIndex({
        currentCitations,
        targetH: Number(targetH) || 0,
        monthlyCitationRate: Number(monthlyCitationRate) || 0,
        papersPerYear: Number(papersPerYear) || 0,
        newPaperCitationMultiplier: getMultiplier(venueTier),
      }),
    [currentCitations, targetH, monthlyCitationRate, papersPerYear, venueTier]
  );

  async function handleSave() {
    if (!user || source !== 'live') {
      setSaveMessage(t('predictor.saveLoginRequired'));
      return;
    }
    setSaving(true);
    setSaveMessage(null);
    try {
      await client.post('/predictions', {
        researcherId: researcher.id,
        targetH: Number(targetH),
        monthlyCitationRate: Number(monthlyCitationRate),
        papersPerYear: Number(papersPerYear),
        venueTier,
      });
      setSaveMessage(t('predictor.saveSuccess'));
    } catch (err) {
      setSaveMessage(err.response?.data?.error || t('predictor.saveFailed'));
    } finally {
      setSaving(false);
    }
  }

  const years = projection.estimatedMonths != null ? (projection.estimatedMonths / 12).toFixed(1) : null;

  // Demo data is always free to play with; a real tracked researcher's
  // predictions are a Pro feature.
  const isGated = source === 'live' && (!user || user.plan !== 'pro');

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-10 space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">{t('predictor.title')}</h1>
        <p className="text-sm text-slate-500 mt-1">{t('predictor.subtitle')}</p>
      </div>

      {isGated ? (
        <div className="card">
          <UpgradeCTA feature={t('upgrade.predictorFeature')} />
        </div>
      ) : (
        <PredictorBody
          researcher={researcher}
          source={source}
          papers={papers}
          targetH={targetH}
          setTargetH={setTargetH}
          monthlyCitationRate={monthlyCitationRate}
          setMonthlyCitationRate={setMonthlyCitationRate}
          papersPerYear={papersPerYear}
          setPapersPerYear={setPapersPerYear}
          venueName={venueName}
          setVenueName={setVenueName}
          venueTier={venueTier}
          setVenueTier={setVenueTier}
          suggestedTier={suggestedTier}
          projection={projection}
          years={years}
          saving={saving}
          saveMessage={saveMessage}
          handleSave={handleSave}
          effectiveHIndex={effectiveHIndex}
          useManualBaseline={useManualBaseline}
          setUseManualBaseline={setUseManualBaseline}
        />
      )}
    </div>
  );
}

function PredictorBody({
  researcher,
  source,
  papers,
  targetH,
  setTargetH,
  monthlyCitationRate,
  setMonthlyCitationRate,
  papersPerYear,
  setPapersPerYear,
  venueName,
  setVenueName,
  venueTier,
  setVenueTier,
  suggestedTier,
  projection,
  years,
  saving,
  saveMessage,
  handleSave,
  effectiveHIndex,
  useManualBaseline,
  setUseManualBaseline,
}) {
  const { t } = useTranslation();
  return (
    <>
      {papers.length === 0 && (
        <div className="card border border-amber-100 bg-amber-50">
          <p className="text-sm text-amber-700">{t('predictor.noPapersWarning')}</p>
        </div>
      )}

      {source === 'live' && (
        <ManualScoreCard
          researcher={researcher}
          useManualBaseline={useManualBaseline}
          setUseManualBaseline={setUseManualBaseline}
        />
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="card space-y-5 lg:col-span-1">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              {t('predictor.targetH', { current: effectiveHIndex })}
            </label>
            <input
              type="number"
              min={effectiveHIndex + 1}
              className="input"
              value={targetH}
              onChange={(e) => setTargetH(e.target.value)}
              onBlur={(e) => {
                // The `min` attribute only blocks the browser's built-in
                // spinner/validation, not free typing — clamp explicitly on
                // blur so a target at or below the current H-index (which
                // otherwise silently shows a confusing "0 mo, already
                // reached") can't be left in place.
                if (e.target.value !== '' && Number(e.target.value) <= effectiveHIndex) {
                  setTargetH(effectiveHIndex + 1);
                }
              }}
            />
            {Number(targetH) <= effectiveHIndex && (
              <p className="mt-1 text-xs text-amber-600">
                {t('predictor.targetTooLow', { current: effectiveHIndex })}
              </p>
            )}
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              {t('predictor.monthlyRate')}
            </label>
            <input
              type="number"
              step="0.1"
              min="0"
              className="input"
              value={monthlyCitationRate}
              onChange={(e) => setMonthlyCitationRate(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">{t('predictor.papersPerYear')}</label>
            <input
              type="number"
              step="0.5"
              min="0"
              className="input"
              value={papersPerYear}
              onChange={(e) => setPapersPerYear(e.target.value)}
            />
          </div>

          <div className="pt-1 border-t border-slate-100">
            <label className="flex items-center gap-1.5 text-sm font-medium text-slate-700 mb-1">
              {t('predictor.targetVenue')} <span className="text-slate-400 font-normal">{t('predictor.optional')}</span>
              <span
                tabIndex={0}
                title={t('predictor.venueTooltip')}
                className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-slate-100 text-slate-500 text-[10px] font-bold cursor-help shrink-0"
              >
                ?
              </span>
            </label>
            <input
              className="input mb-2"
              placeholder={t('predictor.venuePlaceholder')}
              value={venueName}
              onChange={(e) => setVenueName(e.target.value)}
            />
            <select
              className="input"
              value={venueTier}
              onChange={(e) => setVenueTier(e.target.value)}
            >
              {Object.entries(TIERS).map(([key, tier]) => (
                <option key={key} value={key}>
                  {t(`venueTiers.${key}`)} ({tier.multiplier}x)
                </option>
              ))}
            </select>
            {suggestedTier && suggestedTier !== venueTier && (
              <button
                type="button"
                onClick={() => setVenueTier(suggestedTier)}
                className="mt-1 text-xs text-brand-600 underline"
              >
                {t('predictor.venueSuggest', { venue: venueName, tier: t(`venueTiers.${suggestedTier}`) })}
              </button>
            )}
            <p className="mt-1 text-xs text-slate-400">{t('predictor.venueHint')}</p>
          </div>

          <button onClick={handleSave} disabled={saving} className="btn-primary w-full">
            {saving ? t('predictor.saving') : t('predictor.save')}
          </button>
          {saveMessage && <p className="text-xs text-slate-500">{saveMessage}</p>}
        </div>

        <div className="card lg:col-span-2 flex flex-col justify-center items-center text-center">
          {projection.reached ? (
            <>
              <p className="text-sm font-medium text-slate-500">{t('predictor.reachedTitle', { target: targetH })}</p>
              <p className="mt-2 text-5xl font-bold text-brand-600">{t('predictor.reachedMonths', { months: projection.estimatedMonths })}</p>
              <p className="mt-1 text-sm text-slate-400">{t('predictor.reachedYears', { years })}</p>
            </>
          ) : (
            <>
              <p className="text-sm font-medium text-slate-500">{t('predictor.notReachedTitle')}</p>
              <p className="mt-2 text-lg text-slate-600">{t('predictor.notReachedDesc')}</p>
            </>
          )}
        </div>
      </div>

      <div className="card">
        <h2 className="text-lg font-semibold text-slate-900 mb-4">{t('predictor.pathTitle')}</h2>
        <HIndexChart
          history={[{ label: t('predictor.now'), hIndex: effectiveHIndex }]}
          projection={projection.path.filter((_, i) => i % Math.max(Math.floor(projection.path.length / 24), 1) === 0)}
        />
      </div>
    </>
  );
}
