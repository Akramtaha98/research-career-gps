import { useResearcher } from '../context/ResearcherContext';
import MetricCard from '../components/MetricCard';
import HIndexChart from '../components/HIndexChart';

function formatDate(iso) {
  return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short' });
}

export default function Dashboard() {
  const { source, researcher, papers, history, loading, refreshResearcher } = useResearcher();

  const chartHistory = history.map((h) => ({
    label: formatDate(h.recorded_at),
    hIndex: h.h_index,
  }));

  const topPapers = [...papers].sort((a, b) => (b.citations || 0) - (a.citations || 0)).slice(0, 8);

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-10 space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{researcher.name}</h1>
          <p className="text-sm text-slate-500">
            {source === 'demo' ? 'Demo data' : `Semantic Scholar ID: ${researcher.semantic_scholar_id}`}
          </p>
        </div>
        {source === 'live' && (
          <button onClick={refreshResearcher} disabled={loading} className="btn-secondary">
            {loading ? 'Refreshing...' : 'Refresh from Semantic Scholar'}
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard label="H-index" value={researcher.h_index} accent="brand" />
        <MetricCard label="Total citations" value={researcher.total_citations?.toLocaleString?.() ?? researcher.total_citations} accent="sky" />
        <MetricCard label="Tracked papers" value={researcher.paper_count ?? papers.length} accent="emerald" />
        <MetricCard
          label="Avg. citations / paper"
          value={papers.length ? Math.round((researcher.total_citations || 0) / papers.length) : 0}
          accent="amber"
        />
      </div>

      <div className="card">
        <h2 className="text-lg font-semibold text-slate-900 mb-4">H-index growth over time</h2>
        <HIndexChart history={chartHistory} />
      </div>

      <div className="card">
        <h2 className="text-lg font-semibold text-slate-900 mb-4">Top cited papers</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-slate-400 border-b border-slate-100">
                <th className="py-2 pr-4">Title</th>
                <th className="py-2 pr-4">Year</th>
                <th className="py-2 pr-4">Venue</th>
                <th className="py-2 pr-4 text-right">Citations</th>
              </tr>
            </thead>
            <tbody>
              {topPapers.map((p) => (
                <tr key={p.id} className="border-b border-slate-50 last:border-0">
                  <td className="py-2.5 pr-4 font-medium text-slate-700">{p.title}</td>
                  <td className="py-2.5 pr-4 text-slate-500">{p.year || '—'}</td>
                  <td className="py-2.5 pr-4 text-slate-500">{p.venue || '—'}</td>
                  <td className="py-2.5 pr-4 text-right font-semibold text-brand-600">{p.citations}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
