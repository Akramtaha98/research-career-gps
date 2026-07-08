import { createContext, useContext, useState, useCallback } from 'react';
import client from '../api/client';
import { demoResearcher, demoPapers, demoHistory, demoCollaborators } from '../data/demoData';

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

  /** Look up (and persist, if logged in) a real researcher — OpenAlex primary, Semantic Scholar fallback. */
  const lookupResearcher = useCallback(async (semanticScholarId, source) => {
    setLoading(true);
    setError(null);
    try {
      const { data } = await client.post('/researchers', { semanticScholarId, source });
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

  /** Top collaborators ranked by h-index (real data for 'live', canned example for 'demo'). */
  const getCollaborators = useCallback(async () => {
    if (source === 'demo') return demoCollaborators;
    if (!researcher?.id) return [];
    const { data } = await client.get(`/researchers/${researcher.id}/collaborators`);
    return data.collaborators;
  }, [source, researcher]);

  /**
   * Fetches the researcher's REAL historical H-index (one year at a time,
   * computed from actual Semantic Scholar citation data — not estimated).
   * Slower than everything else here since it's one extra request per
   * paper server-side; the backend caches it for a few hours per researcher.
   */
  const getRealHistory = useCallback(async () => {
    if (source !== 'live' || !researcher?.id) return null;
    const { data } = await client.get(`/researchers/${researcher.id}/real-history`);
    return data;
  }, [source, researcher]);

  /**
   * Saves a self-reported official Scopus or WOS H-index for the current
   * live researcher. Scopus and WOS are independent slots — setting one
   * never touches the other. Not auto-verified against the source — see
   * schema.sql's scopus_h_index/wos_h_index comment for why (no public
   * Scopus/WOS API this app can call).
   */
  const setScore = useCallback(
    async (which, { profileUrl, hIndex }) => {
      if (source !== 'live' || !researcher?.id) return null;
      const { data } = await client.patch(`/researchers/${researcher.id}/${which}-score`, { profileUrl, hIndex });
      setResearcher(data.researcher);
      return data.researcher;
    },
    [source, researcher]
  );

  const clearScore = useCallback(
    async (which) => {
      if (source !== 'live' || !researcher?.id) return null;
      const { data } = await client.delete(`/researchers/${researcher.id}/${which}-score`);
      setResearcher(data.researcher);
      return data.researcher;
    },
    [source, researcher]
  );

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
        getCollaborators,
        getRealHistory,
        setScore,
        clearScore,
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
