import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { parseCsv, mapRowsToPapers, summarizeImport } from '../utils/csvImport';
import MetricCard from '../components/MetricCard';

export default function ImportData() {
  const { t } = useTranslation();
  const fileInputRef = useRef(null);
  const [source, setSource] = useState('scopus'); // 'scopus' | 'wos' | 'other'
  const [fileName, setFileName] = useState(null);
  const [papers, setPapers] = useState(null);
  const [summary, setSummary] = useState(null);
  const [error, setError] = useState(null);
  const [sortKey, setSortKey] = useState('citations');
  const [sortDir, setSortDir] = useState('desc');

  function toggleSort(key) {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir(key === 'title' || key === 'venue' ? 'asc' : 'desc');
    }
  }

  function handleFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    setPapers(null);
    setSummary(null);
    setFileName(file.name);

    const reader = new FileReader();
    reader.onload = () => {
      try {
        const rows = parseCsv(String(reader.result));
        const mapped = mapRowsToPapers(rows);
        if (mapped.length === 0) {
          setError(t('import.noRows'));
          return;
        }
        setPapers(mapped);
        setSummary(summarizeImport(mapped));
      } catch (err) {
        if (err.code === 'MISSING_COLUMNS') {
          setError(t('import.missingColumns'));
        } else {
          setError(t('import.parseError'));
        }
      }
    };
    reader.onerror = () => setError(t('import.parseError'));
    reader.readAsText(file);
  }

  function reset() {
    setPapers(null);
    setSummary(null);
    setError(null);
    setFileName(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  const sortedPapers = papers
    ? [...papers].sort((a, b) => {
        let cmp;
        if (sortKey === 'title') cmp = (a.title || '').localeCompare(b.title || '');
        else if (sortKey === 'venue') cmp = (a.venue || '').localeCompare(b.venue || '');
        else if (sortKey === 'year') cmp = (a.year || 0) - (b.year || 0);
        else cmp = (a.citations || 0) - (b.citations || 0);
        return sortDir === 'asc' ? cmp : -cmp;
      })
    : [];

  function SortArrow({ column }) {
    if (sortKey !== column) return null;
    return <span className="ml-1 text-brand-500">{sortDir === 'asc' ? '↑' : '↓'}</span>;
  }

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-10 space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">{t('import.title')}</h1>
        <p className="mt-1 text-sm text-slate-500">{t('import.subtitle')}</p>
      </div>

      <div className="card space-y-4">
        <div className="flex gap-2">
          {['scopus', 'wos', 'other'].map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setSource(s)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition ${
                source === s
                  ? 'bg-brand-600 text-white border-brand-600'
                  : 'bg-white text-slate-600 border-slate-200 hover:border-brand-300'
              }`}
            >
              {t(`import.source.${s}`)}
            </button>
          ))}
        </div>

        <div className="rounded-xl bg-slate-50 border border-slate-100 px-4 py-3 text-sm text-slate-600">
          {source === 'scopus' && <p>{t('import.instructionsScopus')}</p>}
          {source === 'wos' && <p>{t('import.instructionsWos')}</p>}
          {source === 'other' && <p>{t('import.instructionsOther')}</p>}
        </div>

        <div>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,text/csv"
            onChange={handleFile}
            className="block w-full text-sm text-slate-600 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-brand-50 file:text-brand-700 hover:file:bg-brand-100"
          />
          {fileName && <p className="mt-1 text-xs text-slate-400">{fileName}</p>}
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}
      </div>

      {summary && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <MetricCard label={t('dashboard.hIndex')} value={summary.hIndex} accent="brand" />
            <MetricCard label={t('dashboard.totalCitations')} value={summary.totalCitations.toLocaleString()} accent="sky" />
            <MetricCard label={t('dashboard.trackedPapers')} value={summary.paperCount} accent="emerald" />
            <MetricCard label={t('dashboard.avgCitations')} value={summary.avgCitations.toLocaleString()} accent="amber" />
          </div>

          <div className="card">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-slate-900">{t('import.resultsTitle', { source: t(`import.source.${source}`) })}</h2>
              <button onClick={reset} className="btn-secondary text-xs">
                {t('import.clear')}
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

          <p className="text-xs text-slate-400">{t('import.privacyNote')}</p>
        </>
      )}
    </div>
  );
}
