import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useResearcher } from '../context/ResearcherContext';

export default function Search() {
  const [semanticScholarId, setSemanticScholarId] = useState('');
  const { user } = useAuth();
  const { lookupResearcher, useDemo, loading, error } = useResearcher();
  const navigate = useNavigate();

  async function handleSubmit(e) {
    e.preventDefault();
    if (!user) {
      navigate('/login');
      return;
    }
    try {
      await lookupResearcher(semanticScholarId.trim());
      navigate('/dashboard');
    } catch {
      // error surfaced via context
    }
  }

  function handleDemo() {
    useDemo();
    navigate('/dashboard');
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-16">
      <div className="text-center mb-8">
        <h1 className="text-3xl font-bold text-slate-900">Find a researcher</h1>
        <p className="mt-2 text-slate-500">
          Enter a Semantic Scholar Author ID to pull real citation data, or explore with demo data first.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="card space-y-4">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Semantic Scholar Author ID</label>
          <input
            className="input"
            placeholder="e.g. 1741101"
            value={semanticScholarId}
            onChange={(e) => setSemanticScholarId(e.target.value)}
            required
          />
          <p className="mt-1 text-xs text-slate-400">
            Find it in an author's Semantic Scholar profile URL: semanticscholar.org/author/Name/<strong>ID</strong>
          </p>
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}
        {!user && (
          <p className="text-sm text-amber-600">You'll need to log in to save a real researcher lookup.</p>
        )}

        <div className="flex gap-3">
          <button type="submit" disabled={loading} className="btn-primary flex-1">
            {loading ? 'Fetching...' : 'Look up researcher'}
          </button>
          <button type="button" onClick={handleDemo} className="btn-secondary flex-1">
            Use demo data
          </button>
        </div>
      </form>
    </div>
  );
}
