import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../context/AuthContext';
import client from '../api/client';
import MetricCard from '../components/MetricCard';
import OrcidButton from '../components/OrcidButton';

const FIELD_NAME_KEYS = {
  h_index: 'dashboard.hIndex',
  paper_count: 'verify.field.paperCount',
  citation_count: 'verify.field.citationCount',
  name: 'verify.field.name',
  affiliation: 'verify.field.affiliation',
  journal_impact_factor: 'verify.field.impactFactor',
};

const STATUS_STYLES = {
  verified: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  partial: 'bg-amber-50 text-amber-700 border-amber-200',
  unverifiable: 'bg-slate-100 text-slate-600 border-slate-200',
};

export default function Verify() {
  const { t } = useTranslation();
  const { user } = useAuth();

  const [form, setForm] = useState({
    orcid: '',
    name: '',
    affiliation: '',
    hIndex: '',
    paperCount: '',
    citationCount: '',
    journalImpactFactor: '',
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);

  const [sortKey, setSortKey] = useState('citations');
  const [sortDir, setSortDir] = useState('desc');

  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [history, setHistory] = useState(null);
  const [historyError, setHistoryError] = useState(null);

  function update(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!user) {
      setError(t('verify.loginRequired'));
      return;
    }
    setSubmitting(true);
    setError(null);
    setResult(null);
    setHistoryOpen(false);
    setHistory(null);

    const body = { orcid: form.orcid.trim() };
    if (form.name.trim()) body.name = form.name.trim();
    if (form.affiliation.trim()) body.affiliation = form.affiliation.trim();
    if (form.journalImpactFactor !== '') body.journalImpactFactor = form.journalImpactFactor;
    for (const key of ['hIndex', 'paperCount', 'citationCount']) {
      if (form[key] !== '') body[key] = Number(form[key]);
    }

    try {
      const { data } = await client.post('/verify', body);
      setResult(data);
    } catch (err) {
      setError(err.response?.data?.error || err.message || t('verify.submitFailed'));
    } finally {
      setSubmitting(false);
    }
  }

  async function toggleHistory() {
    if (historyOpen) {
      setHistoryOpen(false);
      return;
    }
    setHistoryOpen(true);
    if (history || !result?.orcid) return;
    setHistoryLoading(true);
    setHistoryError(null);
    try {
      const { data } = await client.get(`/verify/${result.orcid}/history`);
      setHistory(data.history);
    } catch (err) {
      setHistoryError(err.response?.data?.error || err.message || t('verify.historyFailed'));
    } finally {
      setHistoryLoading(false);
    }
  }

  function toggleSort(key) {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir(key === 'title' || key === 'venue' ? 'asc' : 'desc');
    }
  }

  const sortedPapers = result?.papers
    ? [...result.papers].sort((a, b) => {
        let cmp;
        if (sortKey === 'title') cmp = (a.title || '').localeCompare(b.title || '');
        else if (sortKey === 'venue') cmp = (a.venue || '').localeCompare(b.venue || '');
        else if (sortKey === 'year') cmp = (a.year || 0) - (b.year || 0);
        else cmp = (a.citation_count || 0) - (b.citation_count || 0);
        return sortDir === 'asc' ? cmp : -cmp;
      })
    : [];

  function SortArrow({ column }) {
    if (sortKey !== column) return null;
    return <span className="ml-1 text-brand-500">{sortDir === 'asc' ? '↑' : '↓'}</span>;
  }

  const showUnverifiable = result && result.verificationStatus === 'unverifiable';
  const showVerified = result && !showUnverifiable;

  // Owner-confirmed override: only ever set once the ORCID owner themselves
  // (signed in via ORCID, account ORCID matching this one) has submitted a
  // value — see backend's isOwner check. Falls back to the raw Semantic
  // Scholar/OpenAlex snapshot per-field when no owner override exists yet.
  const isOwnerConfirmed = Boolean(result?.author?.owner_confirmed_at);
  const effectiveHIndex = result?.author?.owner_h_index ?? result?.metrics?.verified_h_index;
  const effectivePaperCount = result?.author?.owner_paper_count ?? result?.metrics?.verified_paper_count;
  const effectiveCitationCount = result?.author?.owner_citation_count ?? result?.metrics?.verified_citation_count;

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-10 space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">{t('verify.title')}</h1>
        <p className="mt-1 text-sm text-slate-500">{t('verify.subtitle')}</p>
      </div>

      {/* Signed in but no ORCID linked yet — offer to connect it here, since
          the owner-override path below only trusts submissions whose account
          ORCID matches the profile being verified. */}
      {user && !user.orcid && (
        <div className="card sm:flex items-center justify-between gap-4 space-y-2 sm:space-y-0">
          <p className="text-sm text-slate-600">{t('orcidLogin.connectHint')}</p>
          <div className="shrink-0 sm:w-56">
            <OrcidButton connect />
          </div>
        </div>
      )}

      <form onSubmit={handleSubmit} className="card space-y-4">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">{t('verify.orcidLabel')}</label>
          <input
            required
            className="input"
            placeholder="0000-0002-1825-0097"
            value={form.orcid}
            onChange={(e) => update('orcid', e.target.value)}
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              {t('verify.nameLabel')} <span className="text-slate-400 font-normal">{t('verify.optional')}</span>
            </label>
            <input className="input" value={form.name} onChange={(e) => update('name', e.target.value)} />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              {t('verify.affiliationLabel')} <span className="text-slate-400 font-normal">{t('verify.optional')}</span>
            </label>
            <input className="input" value={form.affiliation} onChange={(e) => update('affiliation', e.target.value)} />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              {t('dashboard.hIndex')} <span className="text-slate-400 font-normal">{t('verify.optional')}</span>
            </label>
            <input
              type="number"
              min="0"
              className="input"
              value={form.hIndex}
              onChange={(e) => update('hIndex', e.target.value)}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              {t('verify.field.paperCount')} <span className="text-slate-400 font-normal">{t('verify.optional')}</span>
            </label>
            <input
              type="number"
              min="0"
              className="input"
              value={form.paperCount}
              onChange={(e) => update('paperCount', e.target.value)}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              {t('verify.field.citationCount')} <span className="text-slate-400 font-normal">{t('verify.optional')}</span>
            </label>
            <input
              type="number"
              min="0"
              className="input"
              value={form.citationCount}
              onChange={(e) => update('citationCount', e.target.value)}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              {t('verify.field.impactFactor')} <span className="text-slate-400 font-normal">{t('verify.optional')}</span>
            </label>
            <input
              type="number"
              min="0"
              step="0.01"
              className="input"
              value={form.journalImpactFactor}
              onChange={(e) => update('journalImpactFactor', e.target.value)}
            />
          </div>
        </div>

        {!user && <p className="text-sm text-amber-600">{t('verify.loginRequired')}</p>}
        {error && <p className="text-sm text-red-600">{error}</p>}

        <button type="submit" disabled={submitting} className="btn-primary">
          {submitting ? t('verify.verifying') : t('verify.submit')}
        </button>
      </form>

      {showUnverifiable && (
        <div className="card border border-slate-200 bg-slate-50">
          <p className="text-sm font-medium text-slate-700">
            {result.reason === 'invalid_orcid' ? t('verify.invalidOrcid') : t('verify.notFound')}
          </p>
        </div>
      )}

      {showVerified && result.isOwner && (
        <div className="card border border-emerald-200 bg-emerald-50">
          <p className="text-sm font-medium text-emerald-700">{t('verify.ownerSubmitSuccess')}</p>
        </div>
      )}

      {showVerified && (
        <>
          <div className="card space-y-3">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <h2 className="text-lg font-semibold text-slate-900">{result.author?.verified_name || t('verify.identityTitle')}</h2>
              <div className="flex items-center gap-2">
                {isOwnerConfirmed && (
                  <span className="text-xs font-semibold px-2.5 py-1 rounded-full border bg-brand-50 text-brand-700 border-brand-200">
                    {t('verify.ownerBadge')}
                  </span>
                )}
                <span
                  className={`text-xs font-semibold px-2.5 py-1 rounded-full border ${STATUS_STYLES[result.verificationStatus]}`}
                >
                  {t(`verify.status.${result.verificationStatus}`)}
                </span>
              </div>
            </div>
            <p className="text-sm text-slate-500">
              {t('verify.sourceLabel')}:{' '}
              {result.source === 'semantic_scholar' ? t('verify.sourceSemanticScholar') : t('verify.sourceOpenAlex')}
            </p>
            {result.author?.verified_affiliation && (
              <p className="text-sm text-slate-500">{result.author.verified_affiliation}</p>
            )}
            {isOwnerConfirmed && (
              <p className="text-xs text-brand-600">
                {t('verify.ownerNote', { date: new Date(result.author.owner_confirmed_at).toLocaleDateString() })}
              </p>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <MetricCard label={t('dashboard.hIndex')} value={effectiveHIndex ?? '—'} accent="brand" />
            <MetricCard
              label={t('verify.field.citationCount')}
              value={(effectiveCitationCount ?? 0).toLocaleString()}
              accent="sky"
            />
            <MetricCard label={t('dashboard.trackedPapers')} value={effectivePaperCount ?? 0} accent="emerald" />
          </div>

          {!isOwnerConfirmed && (
            <p className="text-xs text-slate-400">{t('verify.ownerCorrectionHint')}</p>
          )}

          {result.comparisons?.length > 0 && (
            <div className="card">
              <h2 className="text-lg font-semibold text-slate-900">{t('verify.comparisonTitle')}</h2>
              <p className="text-xs text-slate-400 mb-4">{t('verify.comparisonSourceNote')}</p>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-slate-400 border-b border-slate-100">
                      <th className="py-2 pr-4">{t('verify.colField')}</th>
                      <th className="py-2 pr-4">{t('verify.colSubmitted')}</th>
                      <th className="py-2 pr-4">{t('verify.colVerified')}</th>
                      <th className="py-2 pr-4 text-right">{t('verify.colMatch')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.comparisons.map((c) => (
                      <tr key={c.id || c.field_name} className="border-b border-slate-50 last:border-0">
                        <td className="py-2.5 pr-4 font-medium text-slate-700">
                          {t(FIELD_NAME_KEYS[c.field_name] || c.field_name)}
                        </td>
                        <td className="py-2.5 pr-4 text-slate-600">{c.submitted_value ?? '—'}</td>
                        <td className="py-2.5 pr-4 text-slate-600">{c.verified_value ?? '—'}</td>
                        <td className="py-2.5 pr-4 text-right">
                          {c.match ? (
                            <span className="text-emerald-600 font-semibold">{t('verify.matchYes')}</span>
                          ) : (
                            <span className="text-red-600 font-semibold">
                              {t('verify.matchNo')}
                              {c.difference !== null && c.difference !== undefined && (
                                <span className="ml-1 text-slate-400 font-normal">
                                  ({c.difference > 0 ? '+' : ''}
                                  {c.difference})
                                </span>
                              )}
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <div className="card">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-slate-900">{t('verify.papersTitle')}</h2>
              <button type="button" onClick={toggleHistory} className="btn-secondary text-xs">
                {historyOpen ? t('verify.hideHistory') : t('verify.showHistory')}
              </button>
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
                  {sortedPapers.map((p) => (
                    <tr key={p.id || p.external_id || p.title} className="border-b border-slate-50 last:border-0">
                      <td className="py-2.5 pr-4 font-medium text-slate-700">{p.title}</td>
                      <td className="py-2.5 pr-4 text-slate-500">{p.year || '—'}</td>
                      <td className="py-2.5 pr-4 text-slate-500">{p.venue || '—'}</td>
                      <td className="py-2.5 pr-4 text-right font-semibold text-brand-600">
                        {(p.citation_count || 0).toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {historyOpen && (
            <div className="card">
              <h2 className="text-lg font-semibold text-slate-900 mb-4">{t('verify.historyTitle')}</h2>
              {historyLoading && <p className="text-sm text-slate-400">{t('common.loading')}</p>}
              {historyError && <p className="text-sm text-red-600">{historyError}</p>}
              {!historyLoading && history && history.length === 0 && (
                <p className="text-sm text-slate-400">{t('verify.historyEmpty')}</p>
              )}
              {!historyLoading && history && history.length > 0 && (
                <div className="space-y-3">
                  {history.map((run) => (
                    <div key={run.id} className="rounded-xl border border-slate-100 px-4 py-3">
                      <div className="flex items-center justify-between flex-wrap gap-2">
                        <p className="text-sm text-slate-500">
                          {new Date(run.verified_at).toLocaleString()}
                        </p>
                        <span
                          className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${STATUS_STYLES[run.verification_status]}`}
                        >
                          {t(`verify.status.${run.verification_status}`)}
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-slate-400">
                        {t('verify.sourceLabel')}:{' '}
                        {run.source === 'semantic_scholar' ? t('verify.sourceSemanticScholar') : t('verify.sourceOpenAlex')}
                        {' · '}
                        {t('dashboard.hIndex')}: {run.verified_h_index}
                        {' · '}
                        {t('verify.field.citationCount')}: {run.verified_citation_count}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
