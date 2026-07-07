import { createContext, useContext, useState, useCallback } from 'react';
import client from '../api/client';
import { demoResearcher, demoPapers, demoHistory } from '../data/demoData';

const ResearcherContext = createContext(null);

export function ResearcherProvider({ children }) {
  const [source, setSource] = useState('demo'); // 'demo' | 'live'
  const [researcher, setResearcher] = useState(demoResearcher);
  const [papers, setPapers] = useState(demoPapers);
  const [history, setHistory] = useState(demoHistory);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const useDemo = useCallback(() => {
    setSource('demo');
    setResearcher(demoResearcher);
    setPapers(demoPapers);
    setHistory(demoHistory);
    setError(null);
  }, []);

  /** Search Semantic Scholar by name — returns lightweight candidates, no auth required. */
  const searchByName = useCallback(async (name) => {
    setError(null);
    try {
      const { data } = await client.get('/researchers/search', { params: { q: name } });
      return data.candidates;
    } catch (err) {
      const message = err.response?.data?.error || err.message || 'Search failed';
      setError(message);
      throw new Error(message);
    }
  }, []);

  /** Look up (and persist, if logged in) a real Semantic Scholar author. */
  const lookupResearcher = useCallback(async (semanticScholarId) => {
    setLoading(true);
    setError(null);
    try {
      const { data } = await client.post('/researchers', { semanticScholarId });
      const papersRes = await client.get(`/researchers/${data.researcher.id}/papers`);
      const detailRes = await client.get(`/researchers/${data.researcher.id}`);
      setSource('live');
      setResearcher(data.researcher);
      setPapers(papersRes.data.papers);
      setHistory(
        detailRes.data.history.map((h) => ({
          recorded_at: h.recorded_at,
          h_index: h.h_index,
          total_citations: h.total_citations,
        }))
      );
      return data.researcher;
    } catch (err) {
      const message = err.response?.data?.error || err.message || 'Lookup failed';
      setError(message);
      throw new Error(message);
    } finally {
      setLoading(false);
    }
  }, []);

  const refreshResearcher = useCallback(async () => {
    if (source !== 'live' || !researcher?.id) return;
    setLoading(true);
    try {
      const detailRes = await client.get(`/researchers/${researcher.id}?refresh=true`);
      const papersRes = await client.get(`/researchers/${researcher.id}/papers`);
      setResearcher(detailRes.data.researcher);
      setPapers(papersRes.data.papers);
      setHistory(detailRes.data.history);
    } finally {
      setLoading(false);
    }
  }, [source, researcher]);

  return (
    <ResearcherContext.Provider
      value={{
        source,
        researcher,
        papers,
        history,
        loading,
        error,
        useDemo,
        searchByName,
        lookupResearcher,
        refreshResearcher,
      }}
    >
      {children}
    </ResearcherContext.Provider>
  );
}

export function useResearcher() {
  const ctx = useContext(ResearcherContext);
  if (!ctx) throw new Error('useResearcher must be used within ResearcherProvider');
  return ctx;
}
