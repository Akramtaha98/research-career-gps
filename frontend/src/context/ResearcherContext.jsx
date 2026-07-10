import { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';
import client from '../api/client';
import { demoResearcher, demoPapers, demoHistory, demoCollaborators } from '../data/demoData';
import { useAuth } from './AuthContext';

const ResearcherContext = createContext(null);

export function ResearcherProvider({ children }) {
  const { user } = useAuth();
  const [source, setSource] = useState('demo'); // 'demo' | 'live'
  const [researcher, setResearcher] = useState(demoResearcher);
  const [papers, setPapers] = useState(demoPapers);
  const [history, setHistory] = useState(demoHistory);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  // { orcid, scopus, wos } | null while not yet fetched — single source of
  // truth shared by ScoreBox and Dashboard's effective-metrics computation
  // (see computeEffectiveMetrics below), instead of each fetching it separately.
  const [sharedScores, setSharedScores] = useState(null);
  // Guards the auto-load-on-login effect below so it only ever runs once per
  // app session, not every time `user` changes for any other reason (e.g.
  // refreshUser() after a Stripe Checkout redirect).
  const autoLoadAttempted = useRef(false);

  const useDemo = useCallback(() => {
    setSource('demo');
    setResearcher(demoResearcher);
    setPapers(demoPapers);
    setHistory(demoHistory);
    setSharedScores(null);
    setError(null);
  }, []);

  /** Fetches (and caches in context) the crowdsourced Scopus/WOS values for a researcher id. */
  const loadSharedScores = useCallback(async (researcherId) => {
    if (!researcherId) return;
    try {
      const { data } = await client.get(`/researchers/${researcherId}/shared-scores`);
      setSharedScores(data);
    } catch {
      setSharedScores({ orcid: null, scopus: null, wos: null });
    }
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
      loadSharedScores(data.researcher.id);
      return data.researcher;
    } catch (err) {
      const message = err.response?.data?.error || err.message || 'Lookup failed';
      setError(message);
      throw new Error(message);
    } finally {
      setLoading(false);
    }
  }, [loadSharedScores]);

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
    async (which, { profileUrl, hIndex, paperCount, citations }) => {
      if (source !== 'live' || !researcher?.id) return null;
      const { data } = await client.patch(`/researchers/${researcher.id}/${which}-score`, {
        profileUrl,
        hIndex,
        paperCount,
        citations,
      });
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

  /**
   * Re-fetches the CROWDSOURCED Scopus/WOS values for the current live
   * researcher into context state (see sharedScores above) — shared across
   * every user, not just whoever added them (see backend/schema.sql's
   * shared_scores comment). Most callers should just read `sharedScores`
   * directly; this is for an explicit manual refresh.
   */
  const getSharedScores = useCallback(async () => {
    if (source !== 'live' || !researcher?.id) return { orcid: null, scopus: null, wos: null };
    await loadSharedScores(researcher.id);
    return sharedScores;
  }, [source, researcher, sharedScores, loadSharedScores]);

  /**
   * Submits a value to the shared/community pool. Verification model: if the
   * signed-in user's own ORCID matches this researcher's ORCID (they ARE the
   * researcher), it's instantly verified and becomes canonical; otherwise
   * it's recorded as unverified, and can't silently overwrite an
   * already-verified value — see backend's resolveSharedScoreSubmission.
   * Returns { current, resultStatus, applied } so the UI can tell the user
   * exactly what happened to their submission. Updates context state
   * immediately from the response so Dashboard's effective-metrics
   * computation reflects it without a second round-trip.
   */
  const submitSharedScore = useCallback(
    async (which, { profileUrl, hIndex, paperCount, citations }) => {
      if (source !== 'live' || !researcher?.id) return null;
      const { data } = await client.post(`/researchers/${researcher.id}/shared-scores/${which}`, {
        profileUrl,
        hIndex,
        paperCount,
        citations,
      });
      if (data.applied) {
        setSharedScores((prev) => ({ ...(prev || { orcid: researcher.orcid }), [which]: data.current }));
      }
      return data;
    },
    [source, researcher]
  );

  /**
   * Fetches and loads this user's most recently tracked researcher, if any.
   * Used both by the auto-load-on-login effect below and available for a
   * manual "back to my dashboard" action if ever needed.
   */
  const loadLatestResearcher = useCallback(async () => {
    try {
      const { data } = await client.get('/researchers/me/latest');
      if (!data.researcher) return false;
      const papersRes = await client.get(`/researchers/${data.researcher.id}/papers`);
      setSource('live');
      setResearcher(data.researcher);
      setPapers(papersRes.data.papers);
      setHistory(data.history || []);
      loadSharedScores(data.researcher.id);
      return true;
    } catch {
      return false;
    }
  }, [loadSharedScores]);

  // Restores the user's real tracked researcher on login instead of leaving
  // the demo example on screen — runs once per app session, only if nothing
  // else has already loaded a live researcher (e.g. the user hasn't just
  // come from picking a search result).
  useEffect(() => {
    if (user && !autoLoadAttempted.current) {
      autoLoadAttempted.current = true;
      if (source === 'demo') loadLatestResearcher();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const refreshResearcher = useCallback(async () => {
    if (source !== 'live' || !researcher?.id) return;
    setLoading(true);
    try {
      const detailRes = await client.get(`/researchers/${researcher.id}?refresh=true`);
      const papersRes = await client.get(`/researchers/${researcher.id}/papers`);
      setResearcher(detailRes.data.researcher);
      setPapers(papersRes.data.papers);
      setHistory(detailRes.data.history);
      loadSharedScores(researcher.id);
    } finally {
      setLoading(false);
    }
  }, [source, researcher, loadSharedScores]);

  return (
    <ResearcherContext.Provider
      value={{
        source,
        researcher,
        papers,
        history,
        loading,
        error,
        sharedScores,
        useDemo,
        searchByName,
        lookupResearcher,
        refreshResearcher,
        getCollaborators,
        getRealHistory,
        setScore,
        clearScore,
        getSharedScores,
        submitSharedScore,
        loadLatestResearcher,
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
