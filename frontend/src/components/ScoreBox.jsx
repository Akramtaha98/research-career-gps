import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useResearcher } from '../context/ResearcherContext';
import { useAuth } from '../context/AuthContext';
import Modal from './Modal';

const GENERIC_PROFILE_LINK = {
  scopus: 'https://www.scopus.com/freelookup/form/author.uri',
  wos: 'https://www.webofscience.com/wos/author/search',
};

/**
 * One box, two independent slots: self-reported official numbers from Scopus
 * and Web of Science (h-index, paper count, citations). Separate because a
 * researcher may have one, both, or neither, and the two are unrelated
 * citation databases with their own (usually different) numbers — see
 * backend/schema.sql comment on scopus_h_index/wos_h_index for why this is
 * self-reported instead of fetched automatically (no public API either
 * service offers).
 *
 * Verification: there's no API to check the number against, so the best
 * this can honestly do is help the user check it *themselves* — open the
 * real profile, and if they signed in via ORCID (so we have a
 * platform-confirmed ORCID, not a typed one), show it next to the input as
 * a concrete thing to cross-check against the ORCID badge on that profile
 * page before saving. That doesn't prove the number, but it does catch the
 * "grabbed a same-named stranger's profile" mistake.
 *
 * Below each private entry is the CommunityRow — the shared/crowdsourced
 * counterpart (see backend/schema.sql's shared_scores comment) — reading
 * from ResearcherContext's `sharedScores`, a single fetch shared with
 * Dashboard's effective-metrics computation rather than fetching separately.
 */
export default function ScoreBox({ researcher, baselineSource, setBaselineSource }) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { sharedScores } = useResearcher();

  return (
    <div className="card border border-brand-100 bg-brand-50/40">
      <h3 className="text-sm font-semibold text-slate-900">{t('scoreBox.title')}</h3>
      <p className="text-xs text-slate-500 mt-0.5">{t('scoreBox.subtitle')}</p>

      {user?.orcid && (
        <p className="mt-2 text-xs text-slate-600 bg-white/70 border border-brand-100 rounded-lg px-3 py-2">
          {t('scoreBox.orcidCrossCheck', { orcid: user.orcid })}
        </p>
      )}

      <div className="mt-3 divide-y divide-brand-100/70">
        <ScoreRow
          which="scopus"
          label="Scopus"
          researcher={researcher}
          baselineSource={baselineSource}
          setBaselineSource={setBaselineSource}
          shared={sharedScores?.scopus}
          sharedOrcid={sharedScores?.orcid}
        />
        <ScoreRow
          which="wos"
          label="Web of Science"
          researcher={researcher}
          baselineSource={baselineSource}
          setBaselineSource={setBaselineSource}
          shared={sharedScores?.wos}
          sharedOrcid={sharedScores?.orcid}
        />
      </div>

      <p className="mt-3 text-[11px] text-slate-400">{t('scoreBox.disclaimer')}</p>
    </div>
  );
}

function ScoreRow({ which, label, researcher, baselineSource, setBaselineSource, shared, sharedOrcid }) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { setScore, clearScore, submitSharedScore } = useResearcher();

  const currentH = researcher[`${which}_h_index`];
  const currentPaperCount = researcher[`${which}_paper_count`];
  const currentCitations = researcher[`${which}_citations`];
  const currentUrl = researcher[`${which}_url`];
  const hasValue = currentH != null;

  const [editing, setEditing] = useState(!hasValue);
  const [profileUrl, setProfileUrl] = useState(currentUrl || '');
  const [hIndexInput, setHIndexInput] = useState(currentH ?? '');
  const [paperCountInput, setPaperCountInput] = useState(currentPaperCount ?? '');
  const [citationsInput, setCitationsInput] = useState(currentCitations ?? '');
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [message, setMessage] = useState(null);
  const [claiming, setClaiming] = useState(false);
  const [claimMessage, setClaimMessage] = useState(null);
  const [claimModalOpen, setClaimModalOpen] = useState(false);

  const openHref = profileUrl.trim() || GENERIC_PROFILE_LINK[which];

  // "Claiming" ties this private, self-reported number to the same
  // ORCID-owner verification already proven out for the community pool (see
  // CommunityRow / submitSharedScore below): the ONLY thing that actually
  // establishes "this account belongs to the same person as this profile" is
  // a matching ORCID from real ORCID sign-in — there's no Scopus/WOS API to
  // check the number against directly (see scoreBox.disclaimer).
  const isOwner = Boolean(user?.orcid) && Boolean(researcher?.orcid) && user.orcid === researcher.orcid;

  function openClaimModal() {
    setClaimMessage(null);
    setClaimModalOpen(true);
  }

  // Split from the submit step on purpose — the modal presents these as two
  // separate, explicit choices instead of one click silently doing both.
  function handleOpenProfile() {
    if (openHref) window.open(openHref, '_blank', 'noopener,noreferrer');
  }

  async function handleConfirmClaim() {
    if (!hasValue) {
      setClaimMessage(t('scoreBox.claimNeedsNumbers'));
      return;
    }
    setClaiming(true);
    setClaimMessage(null);
    try {
      const result = await submitSharedScore(which, {
        profileUrl: currentUrl || null,
        hIndex: currentH,
        paperCount: currentPaperCount,
        citations: currentCitations,
      });
      setClaimMessage(
        result?.resultStatus === 'verified' ? t('scoreBox.claimVerified') : t('scoreBox.claimSubmitted')
      );
    } catch (err) {
      setClaimMessage(err.response?.data?.error || t('scoreBox.claimFailed'));
    } finally {
      setClaiming(false);
    }
  }

  function parseOptionalInt(value) {
    if (value === '' || value === null || value === undefined) return { ok: true, value: null };
    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed < 0) return { ok: false };
    return { ok: true, value: parsed };
  }

  async function handleSave(e) {
    e.preventDefault();
    const parsedH = Number(hIndexInput);
    if (!Number.isInteger(parsedH) || parsedH < 0) {
      setMessage(t('scoreBox.invalidNumber'));
      return;
    }
    const parsedPaperCount = parseOptionalInt(paperCountInput);
    const parsedCitations = parseOptionalInt(citationsInput);
    if (!parsedPaperCount.ok || !parsedCitations.ok) {
      setMessage(t('scoreBox.invalidNumber'));
      return;
    }
    if (parsedPaperCount.value != null && parsedH > parsedPaperCount.value) {
      setMessage(t('scoreBox.hIndexExceedsPapers', { hIndex: parsedH, paperCount: parsedPaperCount.value }));
      return;
    }
    setSaving(true);
    setMessage(null);
    try {
      await setScore(which, {
        profileUrl: profileUrl.trim() || null,
        hIndex: parsedH,
        paperCount: parsedPaperCount.value,
        citations: parsedCitations.value,
      });
      if (setBaselineSource) setBaselineSource(which);
      setEditing(false);
      setMessage(t('scoreBox.saved'));
    } catch (err) {
      setMessage(err.response?.data?.error || t('scoreBox.saveFailed'));
    } finally {
      setSaving(false);
    }
  }

  async function handleRemove() {
    setRemoving(true);
    setMessage(null);
    try {
      await clearScore(which);
      setEditing(true);
      setHIndexInput('');
      setPaperCountInput('');
      setCitationsInput('');
      setProfileUrl('');
    } catch (err) {
      setMessage(err.response?.data?.error || t('scoreBox.removeFailed'));
    } finally {
      setRemoving(false);
    }
  }

  return (
    <div className="py-3 first:pt-0 last:pb-0">
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm font-medium text-slate-700">{label}</span>
        {hasValue && !editing && (
          <button type="button" onClick={() => setEditing(true)} className="text-xs text-brand-600 underline shrink-0">
            {t('scoreBox.edit')}
          </button>
        )}
      </div>

      {hasValue && !editing ? (
        <div className="mt-1.5 flex items-center justify-between gap-3 flex-wrap">
          <div className="text-sm text-slate-700">
            <span className="font-semibold">{t('scoreBox.hIndexLabel')} {currentH}</span>
            {currentPaperCount != null && (
              <span className="text-slate-500"> · {t('scoreBox.paperCountLabel')} {currentPaperCount}</span>
            )}
            {currentCitations != null && (
              <span className="text-slate-500"> · {t('scoreBox.citationsLabel')} {currentCitations}</span>
            )}
            {' '}
            <span className="text-slate-500">({t('scoreBox.selfReported')})</span>
            {currentUrl && (
              <>
                {' · '}
                <a href={currentUrl} target="_blank" rel="noopener noreferrer" className="text-brand-600 underline">
                  {t('scoreBox.viewProfile')}
                </a>
              </>
            )}
          </div>
          {setBaselineSource && (
            <label className="flex items-center gap-2 text-xs text-slate-600 shrink-0">
              <input
                type="radio"
                name="baselineSource"
                checked={baselineSource === which}
                onChange={() => setBaselineSource(which)}
              />
              {t('scoreBox.useAsBaseline')}
            </label>
          )}
        </div>
      ) : null}

      {hasValue && !editing && (
        <div className="mt-2 flex items-center gap-2 flex-wrap">
          <button type="button" onClick={openClaimModal} className="btn-secondary text-xs px-3 py-1.5">
            {t('scoreBox.claimProfile')}
          </button>
          {isOwner && (
            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700">
              {t('scoreBox.claimedBadge')}
            </span>
          )}
        </div>
      )}

      <Modal open={claimModalOpen} onClose={() => setClaimModalOpen(false)} title={t('scoreBox.claimModalTitle')}>
        <p className="text-sm text-slate-600">{t('scoreBox.claimModalBody')}</p>
        {currentUrl && <p className="mt-2 text-xs text-slate-500 break-all">{currentUrl}</p>}

        <div className="mt-4 flex flex-col gap-2">
          <button type="button" onClick={handleOpenProfile} className="btn-secondary w-full text-sm">
            {t('scoreBox.claimModalOpen')}
          </button>
          {isOwner ? (
            <button
              type="button"
              onClick={handleConfirmClaim}
              disabled={claiming}
              className="btn-primary w-full text-sm"
            >
              {claiming ? t('scoreBox.claiming') : t('scoreBox.claimModalConfirm')}
            </button>
          ) : (
            <p className="text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
              {t('scoreBox.claimNeedsOrcid')}
            </p>
          )}
        </div>

        {claimMessage && <p className="mt-3 text-xs text-slate-500">{claimMessage}</p>}
      </Modal>

      {!(hasValue && !editing) && (
        <form onSubmit={handleSave} className="mt-2 grid grid-cols-1 sm:grid-cols-3 gap-2 items-end">
          <div className="sm:col-span-3">
            <label className="block text-xs font-medium text-slate-600 mb-1">{t('scoreBox.profileUrlLabel')}</label>
            <div className="flex gap-2">
              <input
                className="input flex-1"
                placeholder={t('scoreBox.profileUrlPlaceholder', { label })}
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
                  {t('scoreBox.openProfile')}
                </a>
              )}
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">{t('scoreBox.hIndexLabel')}</label>
            <input
              type="number"
              min="0"
              className="input"
              value={hIndexInput}
              onChange={(e) => setHIndexInput(e.target.value)}
              required
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">{t('scoreBox.paperCountLabel')}</label>
            <input
              type="number"
              min="0"
              className="input"
              placeholder={t('scoreBox.optional')}
              value={paperCountInput}
              onChange={(e) => setPaperCountInput(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">{t('scoreBox.citationsLabel')}</label>
            <input
              type="number"
              min="0"
              className="input"
              placeholder={t('scoreBox.optional')}
              value={citationsInput}
              onChange={(e) => setCitationsInput(e.target.value)}
            />
          </div>
          <div className="sm:col-span-3 flex items-center gap-3">
            <button type="submit" disabled={saving} className="btn-primary text-xs px-3 py-1.5">
              {saving ? t('scoreBox.saving') : t('scoreBox.save')}
            </button>
            {hasValue && (
              <button type="button" onClick={() => setEditing(false)} className="text-xs text-slate-500 underline">
                {t('scoreBox.cancel')}
              </button>
            )}
            {hasValue && (
              <button
                type="button"
                onClick={handleRemove}
                disabled={removing}
                className="text-xs text-red-600 underline ml-auto"
              >
                {removing ? t('scoreBox.removing') : t('scoreBox.remove')}
              </button>
            )}
          </div>
        </form>
      )}

      {message && <p className="mt-1 text-xs text-slate-500">{message}</p>}

      <CommunityRow which={which} shared={shared} orcid={sharedOrcid} />
    </div>
  );
}

/**
 * The crowdsourced counterpart to the private "self-reported" section above:
 * shows whatever value the COMMUNITY has on file for this researcher (shared
 * across every user, keyed by the researcher's ORCID — see
 * backend/schema.sql's shared_scores comment), with a verified/unverified
 * badge, and a small form to submit or update it. Submitting doesn't
 * guarantee the value becomes canonical — see the result message after
 * submit, which reflects exactly what the backend's ORCID-owner-override
 * verification rule decided (verified / unverified / suggestion-only).
 * Updates flow back into ResearcherContext's `sharedScores` directly (see
 * submitSharedScore there), so this component doesn't need its own
 * onChange callback anymore.
 */
function CommunityRow({ which, shared, orcid }) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { submitSharedScore } = useResearcher();

  const [open, setOpen] = useState(false);
  const [profileUrl, setProfileUrl] = useState('');
  const [hIndexInput, setHIndexInput] = useState('');
  const [paperCountInput, setPaperCountInput] = useState('');
  const [citationsInput, setCitationsInput] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [resultMessage, setResultMessage] = useState(null);

  const isOwner = Boolean(user?.orcid) && Boolean(orcid) && user.orcid === orcid;

  function parseOptionalInt(value) {
    if (value === '' || value === null || value === undefined) return { ok: true, value: null };
    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed < 0) return { ok: false };
    return { ok: true, value: parsed };
  }

  async function handleSubmit(e) {
    e.preventDefault();
    const parsed = Number(hIndexInput);
    if (!Number.isInteger(parsed) || parsed < 0) {
      setResultMessage(t('scoreBox.invalidNumber'));
      return;
    }
    const parsedPaperCount = parseOptionalInt(paperCountInput);
    const parsedCitations = parseOptionalInt(citationsInput);
    if (!parsedPaperCount.ok || !parsedCitations.ok) {
      setResultMessage(t('scoreBox.invalidNumber'));
      return;
    }
    if (parsedPaperCount.value != null && parsed > parsedPaperCount.value) {
      setResultMessage(t('scoreBox.hIndexExceedsPapers', { hIndex: parsed, paperCount: parsedPaperCount.value }));
      return;
    }
    setSubmitting(true);
    setResultMessage(null);
    try {
      const result = await submitSharedScore(which, {
        profileUrl: profileUrl.trim() || null,
        hIndex: parsed,
        paperCount: parsedPaperCount.value,
        citations: parsedCitations.value,
      });
      setResultMessage(
        t(
          result.resultStatus === 'verified'
            ? 'scoreBox.community.resultVerified'
            : result.resultStatus === 'unverified'
            ? 'scoreBox.community.resultUnverified'
            : 'scoreBox.community.resultSuggestion'
        )
      );
      setOpen(false);
      setProfileUrl('');
      setHIndexInput('');
      setPaperCountInput('');
      setCitationsInput('');
    } catch (err) {
      setResultMessage(err.response?.data?.error || t('scoreBox.community.submitFailed'));
    } finally {
      setSubmitting(false);
    }
  }

  if (orcid === undefined) {
    // Parent's shared-scores fetch hasn't resolved yet — render nothing rather than
    // flash a misleading "no ORCID" message before we actually know.
    return null;
  }

  if (orcid === null) {
    // researcher has no ORCID on file at all — feature genuinely unavailable, not just empty.
    return (
      <div className="mt-2 pt-2 border-t border-slate-100">
        <p className="text-[11px] text-slate-400">{t('scoreBox.community.noOrcid')}</p>
      </div>
    );
  }

  return (
    <div className="mt-2 pt-2 border-t border-slate-100">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-slate-500">{t('scoreBox.community.title')}</span>
        {shared && (
          <span
            className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${
              shared.status === 'verified' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'
            }`}
          >
            {shared.status === 'verified' ? t('scoreBox.community.verified') : t('scoreBox.community.unverified')}
          </span>
        )}
      </div>

      {shared ? (
        <div className="mt-1 flex items-center justify-between gap-3 flex-wrap">
          <div className="text-sm text-slate-700">
            <span className="font-semibold">{t('scoreBox.hIndexLabel')} {shared.h_index}</span>
            {shared.paper_count != null && (
              <span className="text-slate-500"> · {t('scoreBox.paperCountLabel')} {shared.paper_count}</span>
            )}
            {shared.citations != null && (
              <span className="text-slate-500"> · {t('scoreBox.citationsLabel')} {shared.citations}</span>
            )}
            {shared.profile_url && (
              <>
                {' · '}
                <a href={shared.profile_url} target="_blank" rel="noopener noreferrer" className="text-brand-600 underline text-xs">
                  {t('scoreBox.viewProfile')}
                </a>
              </>
            )}
          </div>
          {!open && (
            <button type="button" onClick={() => setOpen(true)} className="text-xs text-brand-600 underline shrink-0">
              {t('scoreBox.community.suggestButton')}
            </button>
          )}
        </div>
      ) : (
        <div className="mt-1 flex items-center justify-between gap-3 flex-wrap">
          <p className="text-xs text-slate-400">{t('scoreBox.community.empty')}</p>
          {!open && (
            <button type="button" onClick={() => setOpen(true)} className="text-xs text-brand-600 underline shrink-0">
              {t('scoreBox.community.suggestButton')}
            </button>
          )}
        </div>
      )}

      {isOwner && (
        <p className="mt-1 text-[11px] text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-lg px-2 py-1">
          {t('scoreBox.community.ownerHint')}
        </p>
      )}

      {open && (
        <form onSubmit={handleSubmit} className="mt-2 grid grid-cols-1 sm:grid-cols-3 gap-2 items-end">
          <div className="sm:col-span-3">
            <label className="block text-xs font-medium text-slate-600 mb-1">{t('scoreBox.profileUrlLabel')}</label>
            <input
              className="input"
              placeholder={t('scoreBox.profileUrlPlaceholder', { label: which === 'scopus' ? 'Scopus' : 'Web of Science' })}
              value={profileUrl}
              onChange={(e) => setProfileUrl(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">{t('scoreBox.hIndexLabel')}</label>
            <input
              type="number"
              min="0"
              className="input"
              value={hIndexInput}
              onChange={(e) => setHIndexInput(e.target.value)}
              required
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">{t('scoreBox.paperCountLabel')}</label>
            <input
              type="number"
              min="0"
              className="input"
              placeholder={t('scoreBox.optional')}
              value={paperCountInput}
              onChange={(e) => setPaperCountInput(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">{t('scoreBox.citationsLabel')}</label>
            <input
              type="number"
              min="0"
              className="input"
              placeholder={t('scoreBox.optional')}
              value={citationsInput}
              onChange={(e) => setCitationsInput(e.target.value)}
            />
          </div>
          <div className="sm:col-span-3 flex items-center gap-3">
            <button type="submit" disabled={submitting} className="btn-primary text-xs px-3 py-1.5">
              {submitting ? t('scoreBox.community.submitting') : t('scoreBox.community.submit')}
            </button>
            <button type="button" onClick={() => setOpen(false)} className="text-xs text-slate-500 underline">
              {t('scoreBox.community.cancel')}
            </button>
          </div>
        </form>
      )}

      {resultMessage && <p className="mt-1 text-xs text-slate-500">{resultMessage}</p>}
    </div>
  );
}
