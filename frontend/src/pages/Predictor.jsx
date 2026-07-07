import { useMemo, useState } from 'react';
import { useResearcher } from '../context/ResearcherContext';
import { useAuth } from '../context/AuthContext';
import client from '../api/client';
import { projectHIndex } from '../utils/prediction';
import HIndexChart from '../components/HIndexChart';

export default function Predictor() {
  const { source, researcher, papers } = useResearcher();
  const { user } = useAuth();

  const [targetH, setTargetH] = useState(researcher.h_index + 5);
  const [monthlyCitationRate, setMonthlyCitationRate] = useState(0.5);
  const [papersPerYear, setPapersPerYear] = useState(2);
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState(null);

  const currentCitations = useMemo(() => papers.map((p) => p.citations || 0), [papers]);

  const projection = useMemo(
    () =>
      projectHIndex({
        currentCitations,
        targetH: Number(targetH) || 0,
        monthlyCitationRate: Number(monthlyCitationRate) || 0,
        papersPerYear: Number(papersPerYear) || 0,
      }),
    [currentCitations, targetH, monthlyCitationRate, papersPerYear]
  );

  async function handleSave() {
    if (!user || source !== 'live') {
      setSaveMessage('Log in and look up a real researcher to save predictions.');
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
      });
      setSaveMessage('Prediction saved.');
    } catch (err) {
      setSaveMessage(err.response?.data?.error || 'Failed to save prediction');
    } finally {
      setSaving(false);
    }
  }

  const years = projection.estimatedMonths != null ? (projection.estimatedMonths / 12).toFixed(1) : null;

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-10 space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">H-index Predictor</h1>
        <p className="text-sm text-slate-500 mt-1">
          Project when you'll hit your target H-index based on citation growth and publication rate.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="card space-y-5 lg:col-span-1">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Target H-index (current: {researcher.h_index})
            </label>
            <input
              type="number"
              min={researcher.h_index}
              className="input"
              value={targetH}
              onChange={(e) => setTargetH(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Avg. new citations / paper / month
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
            <label className="block text-sm font-medium text-slate-700 mb-1">New papers / year</label>
            <input
              type="number"
              step="0.5"
              min="0"
              className="input"
              value={papersPerYear}
              onChange={(e) => setPapersPerYear(e.target.value)}
            />
          </div>

          <button onClick={handleSave} disabled={saving} className="btn-primary w-full">
            {saving ? 'Saving...' : 'Save this prediction'}
          </button>
          {saveMessage && <p className="text-xs text-slate-500">{saveMessage}</p>}
        </div>

        <div className="card lg:col-span-2 flex flex-col justify-center items-center text-center">
          {projection.reached ? (
            <>
              <p className="text-sm font-medium text-slate-500">Estimated time to reach H-index {targetH}</p>
              <p className="mt-2 text-5xl font-bold text-brand-600">{projection.estimatedMonths} mo</p>
              <p className="mt-1 text-sm text-slate-400">≈ {years} years, at current rates</p>
            </>
          ) : (
            <>
              <p className="text-sm font-medium text-slate-500">Not reachable within 20 years at this rate</p>
              <p className="mt-2 text-lg text-slate-600">Try increasing citation growth or publication rate.</p>
            </>
          )}
        </div>
      </div>

      <div className="card">
        <h2 className="text-lg font-semibold text-slate-900 mb-4">Projected H-index path</h2>
        <HIndexChart
          history={[{ label: 'Now', hIndex: researcher.h_index }]}
          projection={projection.path.filter((_, i) => i % Math.max(Math.floor(projection.path.length / 24), 1) === 0)}
        />
      </div>
    </div>
  );
}
