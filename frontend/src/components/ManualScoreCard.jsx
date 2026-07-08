import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useResearcher } from '../context/ResearcherContext';

const PROFILE_LINKS = {
  scopus: 'https://www.scopus.com/freelookup/form/author.uri',
  wos: 'https://www.webofscience.com/wos/author/search',
  other: null,
};

/**
 * Lets a user self-report their official Scopus/WOS H-index and — since the
 * app has no way to call Scopus/WOS APIs directly (see backend/schema.sql
 * comment on manual_h_index) — walks them through checking it themselves:
 * open their real profile in a new tab, read the number, type it in here.
 * Not cryptographically verified; the profile URL is stored so it can be
 * spot-checked, and it's clearly labeled "self-reported" throughout.
 */
export default function ManualScoreCard({ researcher, useManualBaseline, setUseManualBaseline }) {
  const { t } = useTranslation();
  const { setManualScore, clearManualScore } = useResearcher();
  const hasManual = researcher.manual_h_index != null;

  const [editing, setEditing] = useState(!hasManual);
  const [scoreSource, setScoreSource] = useState(researcher.manual_h_index_source || 'scopus');
  const [profileUrl, setProfileUrl] = useState(researcher.manual_h_index_url || '');
  const [hIndexInput, setHIndexInput] = useState(researcher.manual_h_index ?? '');
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [message, setMessage] = useState(null);

  const openHref = profileUrl.trim() || PROFILE_LINKS[scoreSource] || null;

  async function handleSave(e) {
    e.preventDefault();
    const parsed = Number(hIndexInput);
    if (!Number.isInteger(parsed) || parsed < 0) {
      setMessage(t('manualScore.invalidNumber'));
      return;
    }
    setSaving(true);
    setMessage(null);
    try {
      await setManualScore({ source: scoreSource, profileUrl: profileUrl.trim() || null, hIndex: parsed });
      setUseManualBaseline(true);
      setEditing(false);
      setMessage(t('manualScore.saved'));
    } catch (err) {
      setMessage(err.response?.data?.error || t('manualScore.saveFailed'));
    } finally {
      setSaving(false);
    }
  }

  async function handleRemove() {
    setRemoving(true);
    setMessage(null);
    try {
      await clearManualScore();
      setUseManualBaseline(false);
      setEditing(true);
      setHIndexInput('');
      setProfileUrl('');
    } catch (err) {
      setMessage(err.response?.data?.error || t('manualScore.removeFailed'));
    } finally {
      setRemoving(false);
    }
  }

  return (
    <div className="card border border-brand-100 bg-brand-50/40">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h3 className="text-sm font-semibold text-slate-900">{t('manualScore.title')}</h3>
          <p className="text-xs text-slate-500 mt-0.5">{t('manualScore.subtitle')}</p>
        </div>
        {hasManual && !editing && (
          <button type="button" onClick={() => setEditing(true)} className="text-xs text-brand-600 underline shrink-0">
            {t('manualScore.edit')}
          </button>
        )}
      </div>

      {hasManual && !editing ? (
        <div className="mt-3 flex items-center justify-between gap-3 flex-wrap">
          <div className="text-sm text-slate-700">
            <span className="font-semibold">{researcher.manual_h_index}</span>{' '}
            <span className="text-slate-500">
              ({t(`manualScore.source.${researcher.manual_h_index_source}`)} ·{' '}
              {t('manualScore.selfReported')})
            </span>
            {researcher.manual_h_index_url && (
              <>
                {' · '}
                <a
                  href={researcher.manual_h_index_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-brand-600 underline"
                >
                  {t('manualScore.viewProfile')}
                </a>
              </>
            )}
          </div>
          <label className="flex items-center gap-2 text-xs text-slate-600 shrink-0">
            <input
              type="checkbox"
              checked={useManualBaseline}
              onChange={(e) => setUseManualBaseline(e.target.checked)}
            />
            {t('manualScore.useAsBaseline')}
          </label>
        </div>
      ) : (
        <form onSubmit={handleSave} className="mt-3 grid grid-cols-1 sm:grid-cols-4 gap-3 items-end">
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">{t('manualScore.sourceLabel')}</label>
            <select className="input" value={scoreSource} onChange={(e) => setScoreSource(e.target.value)}>
              <option value="scopus">Scopus</option>
              <option value="wos">Web of Science</option>
              <option value="other">{t('manualScore.source.other')}</option>
            </select>
          </div>
          <div className="sm:col-span-2">
            <label className="block text-xs font-medium text-slate-600 mb-1">{t('manualScore.profileUrlLabel')}</label>
            <div className="flex gap-2">
              <input
                className="input flex-1"
                placeholder={t('manualScore.profileUrlPlaceholder')}
                value={profileUrl}
                onChange={(e) => setProfileUrl(e.target.value)}
              />
              {openHref && (
                <a
                  href={openHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn-secondary text-xs px-3 whitespace-nowrap"
                >
                  {t('manualScore.openProfile')}
                </a>
              )}
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">{t('manualScore.hIndexLabel')}</label>
            <input
              type="number"
              min="0"
              className="input"
              value={hIndexInput}
              onChange={(e) => setHIndexInput(e.target.value)}
              required
            />
          </div>
          <div className="sm:col-span-4 flex items-center gap-3">
            <button type="submit" disabled={saving} className="btn-primary text-sm">
              {saving ? t('manualScore.saving') : t('manualScore.save')}
            </button>
            {hasManual && (
              <button
                type="button"
                onClick={() => setEditing(false)}
                className="text-xs text-slate-500 underline"
              >
                {t('manualScore.cancel')}
              </button>
            )}
            {hasManual && (
              <button
                type="button"
                onClick={handleRemove}
                disabled={removing}
                className="text-xs text-red-600 underline ml-auto"
              >
                {removing ? t('manualScore.removing') : t('manualScore.remove')}
              </button>
            )}
          </div>
        </form>
      )}

      {message && <p className="mt-2 text-xs text-slate-500">{message}</p>}
      <p className="mt-2 text-[11px] text-slate-400">{t('manualScore.disclaimer')}</p>
    </div>
  );
}
