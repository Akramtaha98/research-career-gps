/**
 * Data access layer. Exposes the same async interface regardless of backend,
 * so controllers never need to know whether they're talking to Postgres or
 * the in-memory demo store.
 *
 * Set DEMO_MODE=false and DATABASE_URL to a real Postgres/Supabase instance
 * for production use. DEMO_MODE=true (default in .env.example) runs entirely
 * in memory — handy for local development and grading/testing without a DB.
 */
const crypto = require('crypto');
const { query, isDemoMode } = require('../config/db');

const uuid = () => crypto.randomUUID();

// Column-name lookup for pgStore's setScore/clearScore — keeps `which`
// ('scopus' | 'wos') from ever being interpolated into SQL directly.
const WHICH_COLUMNS = {
  scopus: {
    hIndex: 'scopus_h_index',
    paperCount: 'scopus_paper_count',
    citations: 'scopus_citations',
    url: 'scopus_url',
    updatedAt: 'scopus_updated_at',
  },
  wos: {
    hIndex: 'wos_h_index',
    paperCount: 'wos_paper_count',
    citations: 'wos_citations',
    url: 'wos_url',
    updatedAt: 'wos_updated_at',
  },
};

// ---------------------------------------------------------------------------
// In-memory demo store
// ---------------------------------------------------------------------------
const memory = {
  users: [], // { id, email, name, password_hash, created_at }
  researchers: [], // { id, user_id, semantic_scholar_id, name, h_index, total_citations, paper_count, updated_at }
  papers: [], // { id, researcher_id, external_id, title, year, citations, venue, updated_at }
  predictions: [], // { id, researcher_id, target_h, monthly_citations, papers_per_year, estimated_months, created_at }
  history: [], // { id, researcher_id, h_index, total_citations, paper_count, source, snapshot_date, recorded_at } — one per researcher per calendar day, see schema.sql's h_index_history comment
  paperSnapshots: [], // { id, researcher_id, external_id, snapshot_date, citation_count, created_at } — see schema.sql's paper_snapshots comment
  sharedScores: [], // { id, orcid, which, h_index, profile_url, status, submitted_by, submitted_at, verified_by, verified_at }
  sharedScoresHistory: [], // { id, orcid, which, h_index, profile_url, result_status, submitted_by, submitted_at, seq }
  // Standalone verification system (see services/verificationService.js) —
  // deliberately separate from the researchers/papers tables above.
  verifiedAuthors: [], // { id, orcid, submitted_name, verified_name, submitted_affiliation, verified_affiliation, openalex_author_id, semantic_scholar_author_id, created_at, updated_at }
  verifiedAuthorMetrics: [], // { id, author_id, submitted_h_index, verified_h_index, submitted_paper_count, verified_paper_count, submitted_citation_count, verified_citation_count, source, verification_status, submitted_by, verified_at }
  verifiedPapers: [], // { id, author_id, external_id, doi, title, year, venue, citation_count, source, updated_at }
  verifiedComparisonResults: [], // { id, author_metrics_id, field_name, submitted_value, verified_value, difference, match, created_at }
  contactMessages: [], // { id, name, email, message, user_id, read_at, created_at } — public "Contact us" form, see schema.sql
  paperVerifications: [], // { id, researcher_id, external_id, status, note, created_at, updated_at } — see schema.sql's paper_verifications comment
};

// Monotonic counter so shared-score history sorts deterministically even
// when two submissions land in the same millisecond (submitted_at alone
// isn't enough resolution to order them — Date.toISOString() is ms-precision).
let sharedScoresHistorySeq = 0;

/**
 * Shared crowdsourced-score submission logic — identical rules for both
 * memoryStore and pgStore (see schema.sql's shared_scores comment for the
 * full rationale). Pure function over plain objects so both backends can
 * reuse it instead of duplicating the branching.
 *
 * @param {object|null} current - existing shared_scores row for (orcid, which), or null
 * @param {{orcid, which, hIndex, profileUrl, submittedByUserId, isOwner}} submission
 * @returns {{ nextCurrent: object, resultStatus: 'verified'|'unverified'|'suggestion', applied: boolean }}
 */
function resolveSharedScoreSubmission(
  current,
  { orcid, which, hIndex, paperCount, citations, profileUrl, submittedByUserId, isOwner }
) {
  const now = new Date().toISOString();

  if (isOwner) {
    // The researcher's own ORCID-authenticated account always wins, whether
    // or not a verified value already exists.
    return {
      nextCurrent: {
        ...(current || { id: uuid(), orcid, which }),
        h_index: hIndex,
        paper_count: paperCount ?? null,
        citations: citations ?? null,
        profile_url: profileUrl || null,
        status: 'verified',
        submitted_by: submittedByUserId,
        submitted_at: now,
        verified_by: submittedByUserId,
        verified_at: now,
      },
      resultStatus: 'verified',
      applied: true,
    };
  }

  if (current && current.status === 'verified') {
    // A verified value already stands — a non-owner submission is recorded
    // as a suggestion (see shared_scores_history) but does not overwrite it.
    return { nextCurrent: current, resultStatus: 'suggestion', applied: false };
  }

  // No current value yet, or the current one is itself unverified — the
  // newest crowd submission becomes the (still unverified) displayed value.
  return {
    nextCurrent: {
      ...(current || { id: uuid(), orcid, which }),
      h_index: hIndex,
      paper_count: paperCount ?? null,
      citations: citations ?? null,
      profile_url: profileUrl || null,
      status: 'unverified',
      submitted_by: submittedByUserId,
      submitted_at: now,
      verified_by: null,
      verified_at: null,
    },
    resultStatus: 'unverified',
    applied: true,
  };
}

const memoryStore = {
  async createUser({ email, name, passwordHash, authProvider = 'local', orcid = null }) {
    const user = {
      id: uuid(),
      email,
      name,
      password_hash: passwordHash,
      auth_provider: authProvider,
      orcid,
      stripe_customer_id: null,
      plan: 'free',
      subscription_status: 'inactive',
      created_at: new Date().toISOString(),
    };
    memory.users.push(user);
    return user;
  },

  async findUserByEmail(email) {
    return memory.users.find((u) => u.email === email) || null;
  },

  async findUserByOrcid(orcid) {
    return memory.users.find((u) => u.orcid === orcid) || null;
  },

  async findUserById(id) {
    return memory.users.find((u) => u.id === id) || null;
  },

  async findUserByStripeCustomerId(stripeCustomerId) {
    return memory.users.find((u) => u.stripe_customer_id === stripeCustomerId) || null;
  },

  async updateUserBilling(userId, { stripeCustomerId, plan, subscriptionStatus }) {
    const user = memory.users.find((u) => u.id === userId);
    if (!user) return null;
    if (stripeCustomerId !== undefined) user.stripe_customer_id = stripeCustomerId;
    if (plan !== undefined) user.plan = plan;
    if (subscriptionStatus !== undefined) user.subscription_status = subscriptionStatus;
    return user;
  },

  async setResetToken(userId, { tokenHash, expiresAt }) {
    const user = memory.users.find((u) => u.id === userId);
    if (!user) return null;
    user.reset_token_hash = tokenHash;
    user.reset_token_expires = expiresAt;
    return user;
  },

  async findUserByValidResetToken(tokenHash) {
    const now = Date.now();
    return (
      memory.users.find(
        (u) =>
          u.reset_token_hash === tokenHash &&
          u.reset_token_expires &&
          new Date(u.reset_token_expires).getTime() > now
      ) || null
    );
  },

  async resetPassword(userId, passwordHash) {
    const user = memory.users.find((u) => u.id === userId);
    if (!user) return null;
    user.password_hash = passwordHash;
    user.reset_token_hash = null;
    user.reset_token_expires = null;
    return user;
  },

  async upsertResearcher({ userId, semanticScholarId, name, hIndex, totalCitations, paperCount, source = 'semantic_scholar', orcid = null }) {
    let researcher = memory.researchers.find(
      (r) => r.user_id === userId && r.semantic_scholar_id === semanticScholarId
    );
    const now = new Date().toISOString();
    if (researcher) {
      Object.assign(researcher, {
        name,
        h_index: hIndex,
        total_citations: totalCitations,
        paper_count: paperCount,
        source,
        orcid: orcid !== null ? orcid : researcher.orcid,
        updated_at: now,
      });
    } else {
      researcher = {
        id: uuid(),
        user_id: userId,
        semantic_scholar_id: semanticScholarId,
        name,
        h_index: hIndex,
        total_citations: totalCitations,
        paper_count: paperCount,
        source,
        orcid,
        scopus_h_index: null,
        scopus_paper_count: null,
        scopus_citations: null,
        scopus_url: null,
        scopus_updated_at: null,
        wos_h_index: null,
        wos_paper_count: null,
        wos_citations: null,
        wos_url: null,
        wos_updated_at: null,
        updated_at: now,
      };
      memory.researchers.push(researcher);
    }
    // Once-per-calendar-day snapshot (see schema.sql's h_index_history
    // comment) -- updates today's row in place instead of piling up a new
    // one on every refresh, so repeated manual refreshes in a day don't
    // pollute the Timeline's "recorded" history with near-duplicate points.
    const today = now.slice(0, 10); // 'YYYY-MM-DD'
    let snapshot = memory.history.find(
      (h) => h.researcher_id === researcher.id && h.snapshot_date === today
    );
    if (snapshot) {
      Object.assign(snapshot, {
        h_index: hIndex,
        total_citations: totalCitations,
        paper_count: paperCount,
        source,
        recorded_at: now,
      });
    } else {
      memory.history.push({
        id: uuid(),
        researcher_id: researcher.id,
        h_index: hIndex,
        total_citations: totalCitations,
        paper_count: paperCount,
        source,
        snapshot_date: today,
        recorded_at: now,
      });
    }
    return researcher;
  },

  /**
   * Records today's citation count for each tracked paper (external_id
   * required; papers without one — vanishingly rare — are skipped, same as
   * paper_verifications). Once-per-day like the researcher-level snapshot
   * above: repeated refreshes the same day just update today's row. This is
   * the paper-level data the Timeline's "since your last visit" diff needs
   * (e.g. "2 papers gained citations") — h_index_history alone can't tell
   * you WHICH papers moved.
   */
  async snapshotPapers(researcherId, papers) {
    // Takes the same shape as replacePapers's `papers` argument (camelCase
    // externalId, straight from researcherSource.fetchAuthorProfile) rather
    // than a stored papers row, so callers can pass profile.papers directly
    // after replacePapers without reshaping anything.
    const today = new Date().toISOString().slice(0, 10);
    for (const p of papers) {
      if (!p.externalId) continue;
      let row = memory.paperSnapshots.find(
        (s) => s.researcher_id === researcherId && s.external_id === p.externalId && s.snapshot_date === today
      );
      if (row) {
        row.citation_count = p.citations || 0;
      } else {
        memory.paperSnapshots.push({
          id: uuid(),
          researcher_id: researcherId,
          external_id: p.externalId,
          snapshot_date: today,
          citation_count: p.citations || 0,
          created_at: new Date().toISOString(),
        });
      }
    }
  },

  /** Every per-paper citation snapshot ever recorded for a researcher, any date, unsorted — callers group by snapshot_date. */
  async getPaperSnapshots(researcherId) {
    return memory.paperSnapshots.filter((s) => s.researcher_id === researcherId);
  },

  async findResearcherById(id) {
    return memory.researchers.find((r) => r.id === id) || null;
  },

  /**
   * Most recently updated researcher this user is tracking, or null if
   * they've never added one. Used to restore the last-tracked researcher on
   * login instead of leaving the demo example showing (see App.jsx /
   * ResearcherContext.jsx — `source` stays 'demo' until something explicitly
   * loads a real researcher).
   */
  async findLatestResearcherByUser(userId) {
    const mine = memory.researchers.filter((r) => r.user_id === userId);
    if (mine.length === 0) return null;
    return mine.reduce((latest, r) => (new Date(r.updated_at) > new Date(latest.updated_at) ? r : latest));
  },

  /**
   * Researchers (across every user) whose most recent snapshot is missing or
   * older than cutoffDate ('YYYY-MM-DD') — feeds the monthly snapshot cron
   * (services/snapshotScheduler.js), which re-fetches and re-snapshots
   * exactly these, so someone who tracks a researcher once and never
   * manually refreshes still gets fresh Timeline history over time.
   */
  async getResearchersNeedingSnapshot(cutoffDate) {
    return memory.researchers.filter((r) => {
      const rows = memory.history.filter((h) => h.researcher_id === r.id);
      if (rows.length === 0) return true;
      const latest = rows.reduce((a, b) => (a.snapshot_date > b.snapshot_date ? a : b));
      return latest.snapshot_date < cutoffDate;
    });
  },

  async setScore(researcherId, which, { profileUrl, hIndex, paperCount, citations }) {
    const researcher = memory.researchers.find((r) => r.id === researcherId);
    if (!researcher) return null;
    researcher[`${which}_h_index`] = hIndex;
    researcher[`${which}_paper_count`] = paperCount ?? null;
    researcher[`${which}_citations`] = citations ?? null;
    researcher[`${which}_url`] = profileUrl || null;
    researcher[`${which}_updated_at`] = new Date().toISOString();
    return researcher;
  },

  async clearScore(researcherId, which) {
    const researcher = memory.researchers.find((r) => r.id === researcherId);
    if (!researcher) return null;
    researcher[`${which}_h_index`] = null;
    researcher[`${which}_paper_count`] = null;
    researcher[`${which}_citations`] = null;
    researcher[`${which}_url`] = null;
    researcher[`${which}_updated_at`] = null;
    return researcher;
  },

  /** Both current shared_scores rows (scopus + wos) for a given researcher ORCID. */
  async getSharedScores(orcid) {
    if (!orcid) return { scopus: null, wos: null };
    return {
      scopus: memory.sharedScores.find((s) => s.orcid === orcid && s.which === 'scopus') || null,
      wos: memory.sharedScores.find((s) => s.orcid === orcid && s.which === 'wos') || null,
    };
  },

  async submitSharedScore({ orcid, which, hIndex, paperCount, citations, profileUrl, submittedByUserId, isOwner }) {
    const current = memory.sharedScores.find((s) => s.orcid === orcid && s.which === which) || null;
    const { nextCurrent, resultStatus, applied } = resolveSharedScoreSubmission(current, {
      orcid,
      which,
      hIndex,
      paperCount,
      citations,
      profileUrl,
      submittedByUserId,
      isOwner,
    });

    if (applied) {
      if (current) {
        Object.assign(current, nextCurrent);
      } else {
        memory.sharedScores.push(nextCurrent);
      }
    }

    memory.sharedScoresHistory.push({
      id: uuid(),
      orcid,
      which,
      h_index: hIndex,
      paper_count: paperCount ?? null,
      citations: citations ?? null,
      profile_url: profileUrl || null,
      result_status: resultStatus,
      submitted_by: submittedByUserId,
      submitted_at: new Date().toISOString(),
      seq: sharedScoresHistorySeq++,
    });

    const finalCurrent = applied
      ? current
        ? current
        : nextCurrent
      : memory.sharedScores.find((s) => s.orcid === orcid && s.which === which) || null;

    return { current: finalCurrent, resultStatus, applied };
  },

  async getSharedScoreHistory(orcid, which) {
    return memory.sharedScoresHistory
      .filter((h) => h.orcid === orcid && h.which === which)
      .sort((a, b) => b.seq - a.seq);
  },

  /** Public "Contact us" form submission — see schema.sql's contact_messages comment. */
  async createContactMessage({ name, email, message, userId }) {
    const row = {
      id: uuid(),
      name,
      email,
      message,
      user_id: userId || null,
      read_at: null,
      created_at: new Date().toISOString(),
    };
    memory.contactMessages.push(row);
    return row;
  },

  // Only clears previously auto-fetched rows (origin='auto') — the papers
  // table also supports an 'import' origin (see schema.sql), left in place
  // for schema stability even though the CSV-import feature that used to
  // write those rows has been removed.
  async replacePapers(researcherId, papers) {
    memory.papers = memory.papers.filter((p) => !(p.researcher_id === researcherId && p.origin === 'auto'));
    const now = new Date().toISOString();
    const rows = papers.map((p) => ({
      id: uuid(),
      researcher_id: researcherId,
      external_id: p.externalId || null,
      title: p.title,
      year: p.year || null,
      citations: p.citations || 0,
      venue: p.venue || null,
      origin: 'auto',
      updated_at: now,
    }));
    memory.papers.push(...rows);
    return rows;
  },

  /**
   * Adds a paper the auto-sync (OpenAlex/Semantic Scholar) hasn't indexed
   * yet, verified against Crossref first (see services/crossref.js) —
   * origin='manual' so replacePapers() (which only clears origin='auto'
   * rows) never wipes it on the next refresh. Keyed by DOI as external_id;
   * rejects if a paper with that same external_id already exists for this
   * researcher (auto or manual) rather than creating a duplicate — a
   * Semantic-Scholar-sourced paper can itself have a bare DOI as its
   * external_id when it has no native paperId, so this also protects
   * against re-adding something auto-sync already has.
   */
  async addManualPaper(researcherId, { doi, title, year, citations, venue }) {
    const existing = memory.papers.find((p) => p.researcher_id === researcherId && p.external_id === doi);
    if (existing) {
      const err = new Error('This paper is already in your tracked list.');
      err.statusCode = 409;
      throw err;
    }
    const now = new Date().toISOString();
    const row = {
      id: uuid(),
      researcher_id: researcherId,
      external_id: doi,
      title,
      year: year || null,
      citations: citations || 0,
      venue: venue || null,
      origin: 'manual',
      updated_at: now,
    };
    memory.papers.push(row);
    return row;
  },

  /** Removes a manually-added paper. Scoped to origin='manual' so this can never delete an auto-synced row. */
  async removeManualPaper(researcherId, externalId) {
    const before = memory.papers.length;
    memory.papers = memory.papers.filter(
      (p) => !(p.researcher_id === researcherId && p.external_id === externalId && p.origin === 'manual')
    );
    return memory.papers.length < before;
  },

  /**
   * Sets (or clears, if status is null) a per-paper "this is mine / not mine
   * / duplicate" correction — see schema.sql's paper_verifications comment
   * for why this is keyed by external_id rather than the paper's own row id.
   */
  async setPaperVerification(researcherId, externalId, status, note) {
    const now = new Date().toISOString();
    let row = memory.paperVerifications.find(
      (v) => v.researcher_id === researcherId && v.external_id === externalId
    );
    if (status === null) {
      memory.paperVerifications = memory.paperVerifications.filter((v) => v !== row);
      return null;
    }
    if (row) {
      row.status = status;
      row.note = note ?? null;
      row.updated_at = now;
    } else {
      row = {
        id: uuid(),
        researcher_id: researcherId,
        external_id: externalId,
        status,
        note: note ?? null,
        created_at: now,
        updated_at: now,
      };
      memory.paperVerifications.push(row);
    }
    return row;
  },

  /** All per-paper corrections for a researcher, keyed by external_id for easy lookup by callers. */
  async getPaperVerifications(researcherId) {
    const rows = memory.paperVerifications.filter((v) => v.researcher_id === researcherId);
    const byExternalId = {};
    for (const row of rows) byExternalId[row.external_id] = row;
    return byExternalId;
  },

  async listPapers(researcherId) {
    const papers = memory.papers
      .filter((p) => p.researcher_id === researcherId)
      .sort((a, b) => (b.citations || 0) - (a.citations || 0));
    const verifications = memory.paperVerifications.filter((v) => v.researcher_id === researcherId);
    return papers.map((p) => {
      const v = p.external_id ? verifications.find((v) => v.external_id === p.external_id) : null;
      return { ...p, verification: v ? v.status : null };
    });
  },

  async getHistory(researcherId) {
    return memory.history
      .filter((h) => h.researcher_id === researcherId)
      .sort((a, b) => new Date(a.recorded_at) - new Date(b.recorded_at));
  },

  async createPrediction({ researcherId, targetH, monthlyCitations, papersPerYear, estimatedMonths }) {
    const row = {
      id: uuid(),
      researcher_id: researcherId,
      target_h: targetH,
      monthly_citations: monthlyCitations,
      papers_per_year: papersPerYear,
      estimated_months: estimatedMonths,
      created_at: new Date().toISOString(),
    };
    memory.predictions.push(row);
    return row;
  },

  /**
   * Persists one verification run (see services/verificationService.js):
   * upserts the verified_authors row (orcid is the whole-app join key, not
   * scoped per user), appends a new verified_author_metrics row (history
   * preserved, never overwritten), replaces the verified_papers snapshot for
   * this author with the freshly fetched list, and writes one
   * verified_comparison_results row per compared field.
   */
  async saveVerificationRun({
    orcid,
    submittedName,
    verifiedName,
    submittedAffiliation,
    verifiedAffiliation,
    openAlexAuthorId,
    semanticScholarAuthorId,
    source,
    verificationStatus,
    submittedHIndex,
    verifiedHIndex,
    submittedPaperCount,
    verifiedPaperCount,
    submittedCitationCount,
    verifiedCitationCount,
    papers,
    comparisons,
    submittedByUserId,
    isOwner = false,
  }) {
    const now = new Date().toISOString();
    let author = memory.verifiedAuthors.find((a) => a.orcid === orcid);
    if (author) {
      Object.assign(author, {
        submitted_name: submittedName ?? author.submitted_name,
        verified_name: verifiedName,
        submitted_affiliation: submittedAffiliation ?? author.submitted_affiliation,
        verified_affiliation: verifiedAffiliation,
        openalex_author_id: openAlexAuthorId || author.openalex_author_id,
        semantic_scholar_author_id: semanticScholarAuthorId || author.semantic_scholar_author_id,
        updated_at: now,
      });
    } else {
      author = {
        id: uuid(),
        orcid,
        submitted_name: submittedName ?? null,
        verified_name: verifiedName,
        submitted_affiliation: submittedAffiliation ?? null,
        verified_affiliation: verifiedAffiliation,
        openalex_author_id: openAlexAuthorId || null,
        semantic_scholar_author_id: semanticScholarAuthorId || null,
        owner_h_index: null,
        owner_paper_count: null,
        owner_citation_count: null,
        owner_confirmed_by: null,
        owner_confirmed_at: null,
        created_at: now,
        updated_at: now,
      };
      memory.verifiedAuthors.push(author);
    }

    // ORCID-OWNER OVERRIDE: only the actual ORCID owner (checked by the
    // controller — submitter.orcid === this orcid — before calling this
    // function) can set these fields, and only the specific fields they
    // actually submitted a value for; anything they left blank keeps
    // whatever was previously confirmed rather than getting wiped to null.
    if (isOwner) {
      if (submittedHIndex != null) author.owner_h_index = submittedHIndex;
      if (submittedPaperCount != null) author.owner_paper_count = submittedPaperCount;
      if (submittedCitationCount != null) author.owner_citation_count = submittedCitationCount;
      author.owner_confirmed_by = submittedByUserId || null;
      author.owner_confirmed_at = now;
    }

    const metrics = {
      id: uuid(),
      author_id: author.id,
      submitted_h_index: submittedHIndex ?? null,
      verified_h_index: verifiedHIndex,
      submitted_paper_count: submittedPaperCount ?? null,
      verified_paper_count: verifiedPaperCount,
      submitted_citation_count: submittedCitationCount ?? null,
      verified_citation_count: verifiedCitationCount,
      source,
      verification_status: verificationStatus,
      submitted_by: submittedByUserId || null,
      verified_at: now,
    };
    memory.verifiedAuthorMetrics.push(metrics);

    // Replace the paper snapshot wholesale — see schema.sql's verified_papers
    // comment for why this table isn't append-only per run.
    memory.verifiedPapers = memory.verifiedPapers.filter((p) => p.author_id !== author.id);
    const paperRows = papers.map((p) => ({
      id: uuid(),
      author_id: author.id,
      external_id: p.externalId || null,
      doi: p.doi || null,
      title: p.title,
      year: p.year || null,
      venue: p.venue || null,
      citation_count: p.citations || 0,
      source,
      updated_at: now,
    }));
    memory.verifiedPapers.push(...paperRows);

    const comparisonRows = comparisons.map((c) => ({
      id: uuid(),
      author_metrics_id: metrics.id,
      field_name: c.fieldName,
      submitted_value: c.submittedValue ?? null,
      verified_value: c.verifiedValue ?? null,
      difference: c.difference ?? null,
      match: c.match,
      created_at: now,
    }));
    memory.verifiedComparisonResults.push(...comparisonRows);

    return { author, metrics, papers: paperRows, comparisons: comparisonRows };
  },

  /**
   * Full latest verification snapshot for an ORCID: the author record, its
   * most recent metrics run, the current paper list, and that run's
   * comparisons. Null if this ORCID has never been verified.
   */
  async getVerificationByOrcid(orcid) {
    const author = memory.verifiedAuthors.find((a) => a.orcid === orcid) || null;
    if (!author) return null;

    const runs = memory.verifiedAuthorMetrics
      .filter((m) => m.author_id === author.id)
      .sort((a, b) => new Date(b.verified_at) - new Date(a.verified_at));
    const latestMetrics = runs[0] || null;

    const papers = memory.verifiedPapers
      .filter((p) => p.author_id === author.id)
      .sort((a, b) => (b.citation_count || 0) - (a.citation_count || 0));

    const comparisons = latestMetrics
      ? memory.verifiedComparisonResults.filter((c) => c.author_metrics_id === latestMetrics.id)
      : [];

    return { author, metrics: latestMetrics, papers, comparisons };
  },

  /** Every past verification run for an ORCID, newest first, each with its own comparison rows — the History view. */
  async getVerificationHistory(orcid) {
    const author = memory.verifiedAuthors.find((a) => a.orcid === orcid) || null;
    if (!author) return [];

    const runs = memory.verifiedAuthorMetrics
      .filter((m) => m.author_id === author.id)
      .sort((a, b) => new Date(b.verified_at) - new Date(a.verified_at));

    return runs.map((m) => ({
      ...m,
      comparisons: memory.verifiedComparisonResults.filter((c) => c.author_metrics_id === m.id),
    }));
  },
};

// ---------------------------------------------------------------------------
// Postgres-backed store
// ---------------------------------------------------------------------------
const pgStore = {
  async createUser({ email, name, passwordHash, authProvider = 'local', orcid = null }) {
    const { rows } = await query(
      `INSERT INTO users (email, name, password_hash, auth_provider, orcid) VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [email, name, passwordHash, authProvider, orcid]
    );
    return rows[0];
  },

  async findUserByEmail(email) {
    const { rows } = await query(`SELECT * FROM users WHERE email = $1`, [email]);
    return rows[0] || null;
  },

  async findUserByOrcid(orcid) {
    const { rows } = await query(`SELECT * FROM users WHERE orcid = $1`, [orcid]);
    return rows[0] || null;
  },

  async findUserById(id) {
    const { rows } = await query(`SELECT * FROM users WHERE id = $1`, [id]);
    return rows[0] || null;
  },

  async findUserByStripeCustomerId(stripeCustomerId) {
    const { rows } = await query(`SELECT * FROM users WHERE stripe_customer_id = $1`, [stripeCustomerId]);
    return rows[0] || null;
  },

  async updateUserBilling(userId, { stripeCustomerId, plan, subscriptionStatus }) {
    const { rows } = await query(
      `UPDATE users SET
         stripe_customer_id = COALESCE($2, stripe_customer_id),
         plan = COALESCE($3, plan),
         subscription_status = COALESCE($4, subscription_status)
       WHERE id = $1
       RETURNING *`,
      [userId, stripeCustomerId ?? null, plan ?? null, subscriptionStatus ?? null]
    );
    return rows[0] || null;
  },

  async setResetToken(userId, { tokenHash, expiresAt }) {
    const { rows } = await query(
      `UPDATE users SET reset_token_hash = $2, reset_token_expires = $3 WHERE id = $1 RETURNING *`,
      [userId, tokenHash, expiresAt]
    );
    return rows[0] || null;
  },

  async findUserByValidResetToken(tokenHash) {
    const { rows } = await query(
      `SELECT * FROM users WHERE reset_token_hash = $1 AND reset_token_expires > now()`,
      [tokenHash]
    );
    return rows[0] || null;
  },

  async resetPassword(userId, passwordHash) {
    const { rows } = await query(
      `UPDATE users SET password_hash = $2, reset_token_hash = NULL, reset_token_expires = NULL
       WHERE id = $1 RETURNING *`,
      [userId, passwordHash]
    );
    return rows[0] || null;
  },

  async upsertResearcher({ userId, semanticScholarId, name, hIndex, totalCitations, paperCount, source = 'semantic_scholar', orcid = null }) {
    const { rows } = await query(
      `INSERT INTO researchers (user_id, semantic_scholar_id, name, h_index, total_citations, paper_count, source, orcid)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (user_id, semantic_scholar_id)
       DO UPDATE SET name = $3, h_index = $4, total_citations = $5, paper_count = $6, source = $7,
         orcid = COALESCE($8, researchers.orcid), updated_at = now()
       RETURNING *`,
      [userId, semanticScholarId, name, hIndex, totalCitations, paperCount, source, orcid]
    );
    const researcher = rows[0];
    // Once-per-calendar-day snapshot -- see schema.sql's uq_h_index_history_
    // researcher_snapshot_date comment. ON CONFLICT updates today's row
    // in place instead of erroring or piling up duplicates when a researcher
    // is refreshed more than once the same day.
    await query(
      `INSERT INTO h_index_history (researcher_id, h_index, total_citations, paper_count, source, snapshot_date)
       VALUES ($1, $2, $3, $4, $5, CURRENT_DATE)
       ON CONFLICT (researcher_id, snapshot_date)
       DO UPDATE SET h_index = $2, total_citations = $3, paper_count = $4, source = $5, recorded_at = now()`,
      [researcher.id, hIndex, totalCitations, paperCount, source]
    );
    return researcher;
  },

  /**
   * Records today's citation count for each tracked paper — the paper-level
   * counterpart to the snapshot above, keyed by external_id (see
   * schema.sql's paper_snapshots comment for why). Papers with no
   * external_id are skipped (vanishingly rare, same as paper_verifications).
   */
  async snapshotPapers(researcherId, papers) {
    for (const p of papers) {
      if (!p.externalId) continue;
      await query(
        `INSERT INTO paper_snapshots (researcher_id, external_id, snapshot_date, citation_count)
         VALUES ($1, $2, CURRENT_DATE, $3)
         ON CONFLICT (researcher_id, external_id, snapshot_date)
         DO UPDATE SET citation_count = $3`,
        [researcherId, p.externalId, p.citations || 0]
      );
    }
  },

  /** Every per-paper citation snapshot ever recorded for a researcher, any date, unsorted — callers group by snapshot_date. */
  async getPaperSnapshots(researcherId) {
    const { rows } = await query(`SELECT * FROM paper_snapshots WHERE researcher_id = $1`, [researcherId]);
    return rows;
  },

  async findResearcherById(id) {
    const { rows } = await query(`SELECT * FROM researchers WHERE id = $1`, [id]);
    return rows[0] || null;
  },

  /** Most recently updated researcher this user is tracking, or null. See memoryStore's version for the full rationale. */
  async findLatestResearcherByUser(userId) {
    const { rows } = await query(
      `SELECT * FROM researchers WHERE user_id = $1 ORDER BY updated_at DESC LIMIT 1`,
      [userId]
    );
    return rows[0] || null;
  },

  /** See memoryStore's version for the full rationale. */
  async getResearchersNeedingSnapshot(cutoffDate) {
    const { rows } = await query(
      `SELECT r.* FROM researchers r
       LEFT JOIN (
         SELECT researcher_id, MAX(snapshot_date) AS latest_date
         FROM h_index_history GROUP BY researcher_id
       ) h ON h.researcher_id = r.id
       WHERE h.latest_date IS NULL OR h.latest_date < $1`,
      [cutoffDate]
    );
    return rows;
  },

  // `which` is always a hardcoded 'scopus' or 'wos' literal from the
  // controller (see WHICH_COLUMNS below) — never raw request input — so
  // building the column names this way is safe, not a SQL-injection vector.
  async setScore(researcherId, which, { profileUrl, hIndex, paperCount, citations }) {
    const cols = WHICH_COLUMNS[which];
    if (!cols) throw new Error(`Unknown score source: ${which}`);
    const { rows } = await query(
      `UPDATE researchers
       SET ${cols.hIndex} = $2, ${cols.paperCount} = $3, ${cols.citations} = $4, ${cols.url} = $5, ${cols.updatedAt} = now()
       WHERE id = $1
       RETURNING *`,
      [researcherId, hIndex, paperCount ?? null, citations ?? null, profileUrl || null]
    );
    return rows[0] || null;
  },

  async clearScore(researcherId, which) {
    const cols = WHICH_COLUMNS[which];
    if (!cols) throw new Error(`Unknown score source: ${which}`);
    const { rows } = await query(
      `UPDATE researchers
       SET ${cols.hIndex} = NULL, ${cols.paperCount} = NULL, ${cols.citations} = NULL, ${cols.url} = NULL, ${cols.updatedAt} = NULL
       WHERE id = $1
       RETURNING *`,
      [researcherId]
    );
    return rows[0] || null;
  },

  /** Both current shared_scores rows (scopus + wos) for a given researcher ORCID. */
  async getSharedScores(orcid) {
    if (!orcid) return { scopus: null, wos: null };
    const { rows } = await query(`SELECT * FROM shared_scores WHERE orcid = $1`, [orcid]);
    return {
      scopus: rows.find((r) => r.which === 'scopus') || null,
      wos: rows.find((r) => r.which === 'wos') || null,
    };
  },

  // Reuses the same resolveSharedScoreSubmission branching logic as
  // memoryStore (see its definition above) so both backends apply
  // identical verification rules — only the persistence differs.
  async submitSharedScore({ orcid, which, hIndex, paperCount, citations, profileUrl, submittedByUserId, isOwner }) {
    const { rows: currentRows } = await query(
      `SELECT * FROM shared_scores WHERE orcid = $1 AND which = $2`,
      [orcid, which]
    );
    const current = currentRows[0] || null;

    const { nextCurrent, resultStatus, applied } = resolveSharedScoreSubmission(current, {
      orcid,
      which,
      hIndex,
      paperCount,
      citations,
      profileUrl,
      submittedByUserId,
      isOwner,
    });

    let finalCurrent = current;
    if (applied) {
      const { rows } = await query(
        `INSERT INTO shared_scores (orcid, which, h_index, paper_count, citations, profile_url, status, submitted_by, submitted_at, verified_by, verified_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, now(), $9, $10)
         ON CONFLICT (orcid, which)
         DO UPDATE SET h_index = $3, paper_count = $4, citations = $5, profile_url = $6, status = $7, submitted_by = $8,
           submitted_at = now(), verified_by = $9, verified_at = $10
         RETURNING *`,
        [
          orcid,
          which,
          hIndex,
          paperCount ?? null,
          citations ?? null,
          profileUrl || null,
          nextCurrent.status,
          submittedByUserId,
          nextCurrent.verified_by || null,
          nextCurrent.verified_at || null,
        ]
      );
      finalCurrent = rows[0];
    }

    await query(
      `INSERT INTO shared_scores_history (orcid, which, h_index, paper_count, citations, profile_url, result_status, submitted_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [orcid, which, hIndex, paperCount ?? null, citations ?? null, profileUrl || null, resultStatus, submittedByUserId]
    );

    return { current: finalCurrent, resultStatus, applied };
  },

  async getSharedScoreHistory(orcid, which) {
    const { rows } = await query(
      `SELECT * FROM shared_scores_history WHERE orcid = $1 AND which = $2 ORDER BY seq DESC`,
      [orcid, which]
    );
    return rows;
  },

  /** Public "Contact us" form submission — see schema.sql's contact_messages comment. */
  async createContactMessage({ name, email, message, userId }) {
    const { rows } = await query(
      `INSERT INTO contact_messages (name, email, message, user_id) VALUES ($1, $2, $3, $4) RETURNING *`,
      [name, email, message, userId || null]
    );
    return rows[0];
  },

  // Only clears previously auto-fetched rows — see memoryStore's version of
  // this function for why the 'auto' filter is here.
  async replacePapers(researcherId, papers) {
    await query(`DELETE FROM papers WHERE researcher_id = $1 AND origin = 'auto'`, [researcherId]);
    const inserted = [];
    for (const p of papers) {
      const { rows } = await query(
        `INSERT INTO papers (researcher_id, external_id, title, year, citations, venue, origin)
         VALUES ($1, $2, $3, $4, $5, $6, 'auto') RETURNING *`,
        [researcherId, p.externalId || null, p.title, p.year || null, p.citations || 0, p.venue || null]
      );
      inserted.push(rows[0]);
    }
    return inserted;
  },

  /** See memoryStore's version for the full rationale. */
  async addManualPaper(researcherId, { doi, title, year, citations, venue }) {
    const existing = await query(`SELECT id FROM papers WHERE researcher_id = $1 AND external_id = $2`, [
      researcherId,
      doi,
    ]);
    if (existing.rows.length > 0) {
      const err = new Error('This paper is already in your tracked list.');
      err.statusCode = 409;
      throw err;
    }
    const { rows } = await query(
      `INSERT INTO papers (researcher_id, external_id, title, year, citations, venue, origin)
       VALUES ($1, $2, $3, $4, $5, $6, 'manual') RETURNING *`,
      [researcherId, doi, title, year || null, citations || 0, venue || null]
    );
    return rows[0];
  },

  /** Scoped to origin='manual' so this can never delete an auto-synced row. */
  async removeManualPaper(researcherId, externalId) {
    const { rowCount } = await query(
      `DELETE FROM papers WHERE researcher_id = $1 AND external_id = $2 AND origin = 'manual'`,
      [researcherId, externalId]
    );
    return rowCount > 0;
  },

  async listPapers(researcherId) {
    const { rows } = await query(
      `SELECT p.*, v.status AS verification
       FROM papers p
       LEFT JOIN paper_verifications v
         ON v.researcher_id = p.researcher_id AND v.external_id = p.external_id
       WHERE p.researcher_id = $1
       ORDER BY p.citations DESC`,
      [researcherId]
    );
    return rows;
  },

  /**
   * Sets (or clears, when status is null) a per-paper "this is mine / not
   * mine / duplicate" correction. Keyed by (researcher_id, external_id) —
   * NOT papers.id — because replacePapers() deletes and reinserts every
   * origin='auto' paper with a fresh UUID on each refresh, which would
   * silently wipe any correction keyed on the internal row id instead.
   */
  async setPaperVerification(researcherId, externalId, status, note) {
    if (status === null) {
      await query(`DELETE FROM paper_verifications WHERE researcher_id = $1 AND external_id = $2`, [
        researcherId,
        externalId,
      ]);
      return null;
    }
    const { rows } = await query(
      `INSERT INTO paper_verifications (researcher_id, external_id, status, note)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (researcher_id, external_id)
       DO UPDATE SET status = EXCLUDED.status, note = EXCLUDED.note, updated_at = now()
       RETURNING *`,
      [researcherId, externalId, status, note ?? null]
    );
    return rows[0];
  },

  async getPaperVerifications(researcherId) {
    const { rows } = await query(`SELECT * FROM paper_verifications WHERE researcher_id = $1`, [researcherId]);
    const byExternalId = {};
    for (const row of rows) byExternalId[row.external_id] = row;
    return byExternalId;
  },

  async getHistory(researcherId) {
    const { rows } = await query(
      `SELECT * FROM h_index_history WHERE researcher_id = $1 ORDER BY recorded_at ASC`,
      [researcherId]
    );
    return rows;
  },

  async createPrediction({ researcherId, targetH, monthlyCitations, papersPerYear, estimatedMonths }) {
    const { rows } = await query(
      `INSERT INTO predictions (researcher_id, target_h, monthly_citations, papers_per_year, estimated_months)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [researcherId, targetH, monthlyCitations, papersPerYear, estimatedMonths]
    );
    return rows[0];
  },

  /** Persists one verification run — see memoryStore's version for the full rationale. */
  async saveVerificationRun({
    orcid,
    submittedName,
    verifiedName,
    submittedAffiliation,
    verifiedAffiliation,
    openAlexAuthorId,
    semanticScholarAuthorId,
    source,
    verificationStatus,
    submittedHIndex,
    verifiedHIndex,
    submittedPaperCount,
    verifiedPaperCount,
    submittedCitationCount,
    verifiedCitationCount,
    papers,
    comparisons,
    submittedByUserId,
    isOwner = false,
  }) {
    const { rows: authorRows } = await query(
      `INSERT INTO verified_authors
         (orcid, submitted_name, verified_name, submitted_affiliation, verified_affiliation,
          openalex_author_id, semantic_scholar_author_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (orcid) DO UPDATE SET
         submitted_name = COALESCE($2, verified_authors.submitted_name),
         verified_name = $3,
         submitted_affiliation = COALESCE($4, verified_authors.submitted_affiliation),
         verified_affiliation = $5,
         openalex_author_id = COALESCE($6, verified_authors.openalex_author_id),
         semantic_scholar_author_id = COALESCE($7, verified_authors.semantic_scholar_author_id),
         updated_at = now()
       RETURNING *`,
      [
        orcid,
        submittedName ?? null,
        verifiedName,
        submittedAffiliation ?? null,
        verifiedAffiliation,
        openAlexAuthorId ?? null,
        semanticScholarAuthorId ?? null,
      ]
    );
    let author = authorRows[0];

    // ORCID-OWNER OVERRIDE: only when the controller has already confirmed
    // submitter.orcid === this orcid — see schema.sql's verified_authors
    // comment. COALESCE keeps any field the owner didn't submit this time
    // unchanged rather than wiping it to null.
    if (isOwner) {
      const { rows: ownerRows } = await query(
        `UPDATE verified_authors SET
           owner_h_index = COALESCE($2, owner_h_index),
           owner_paper_count = COALESCE($3, owner_paper_count),
           owner_citation_count = COALESCE($4, owner_citation_count),
           owner_confirmed_by = $5,
           owner_confirmed_at = now()
         WHERE id = $1
         RETURNING *`,
        [author.id, submittedHIndex ?? null, submittedPaperCount ?? null, submittedCitationCount ?? null, submittedByUserId || null]
      );
      author = ownerRows[0];
    }

    const { rows: metricsRows } = await query(
      `INSERT INTO verified_author_metrics
         (author_id, submitted_h_index, verified_h_index, submitted_paper_count, verified_paper_count,
          submitted_citation_count, verified_citation_count, source, verification_status, submitted_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING *`,
      [
        author.id,
        submittedHIndex ?? null,
        verifiedHIndex,
        submittedPaperCount ?? null,
        verifiedPaperCount,
        submittedCitationCount ?? null,
        verifiedCitationCount,
        source,
        verificationStatus,
        submittedByUserId || null,
      ]
    );
    const metrics = metricsRows[0];

    // Replace the paper snapshot wholesale — see schema.sql's verified_papers
    // comment for why this table isn't append-only per run.
    await query(`DELETE FROM verified_papers WHERE author_id = $1`, [author.id]);
    const paperRows = [];
    for (const p of papers) {
      const { rows } = await query(
        `INSERT INTO verified_papers (author_id, external_id, doi, title, year, venue, citation_count, source)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
        [author.id, p.externalId || null, p.doi || null, p.title, p.year || null, p.venue || null, p.citations || 0, source]
      );
      paperRows.push(rows[0]);
    }

    const comparisonRows = [];
    for (const c of comparisons) {
      const { rows } = await query(
        `INSERT INTO verified_comparison_results (author_metrics_id, field_name, submitted_value, verified_value, difference, match)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
        [metrics.id, c.fieldName, c.submittedValue ?? null, c.verifiedValue ?? null, c.difference ?? null, c.match]
      );
      comparisonRows.push(rows[0]);
    }

    return { author, metrics, papers: paperRows, comparisons: comparisonRows };
  },

  /** Full latest verification snapshot for an ORCID — see memoryStore's version for the full rationale. */
  async getVerificationByOrcid(orcid) {
    const { rows: authorRows } = await query(`SELECT * FROM verified_authors WHERE orcid = $1`, [orcid]);
    const author = authorRows[0];
    if (!author) return null;

    const { rows: metricsRows } = await query(
      `SELECT * FROM verified_author_metrics WHERE author_id = $1 ORDER BY verified_at DESC LIMIT 1`,
      [author.id]
    );
    const latestMetrics = metricsRows[0] || null;

    const { rows: papers } = await query(
      `SELECT * FROM verified_papers WHERE author_id = $1 ORDER BY citation_count DESC`,
      [author.id]
    );

    let comparisons = [];
    if (latestMetrics) {
      const { rows } = await query(
        `SELECT * FROM verified_comparison_results WHERE author_metrics_id = $1`,
        [latestMetrics.id]
      );
      comparisons = rows;
    }

    return { author, metrics: latestMetrics, papers, comparisons };
  },

  /** Every past verification run for an ORCID, newest first, each with its own comparison rows. */
  async getVerificationHistory(orcid) {
    const { rows: authorRows } = await query(`SELECT * FROM verified_authors WHERE orcid = $1`, [orcid]);
    const author = authorRows[0];
    if (!author) return [];

    const { rows: runs } = await query(
      `SELECT * FROM verified_author_metrics WHERE author_id = $1 ORDER BY verified_at DESC`,
      [author.id]
    );

    const results = [];
    for (const run of runs) {
      const { rows: comparisons } = await query(
        `SELECT * FROM verified_comparison_results WHERE author_metrics_id = $1`,
        [run.id]
      );
      results.push({ ...run, comparisons });
    }
    return results;
  },
};

module.exports = isDemoMode ? memoryStore : pgStore;
