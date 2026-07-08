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

// ---------------------------------------------------------------------------
// In-memory demo store
// ---------------------------------------------------------------------------
const memory = {
  users: [], // { id, email, name, password_hash, created_at }
  researchers: [], // { id, user_id, semantic_scholar_id, name, h_index, total_citations, paper_count, updated_at }
  papers: [], // { id, researcher_id, external_id, title, year, citations, venue, updated_at }
  predictions: [], // { id, researcher_id, target_h, monthly_citations, papers_per_year, estimated_months, created_at }
  history: [], // { id, researcher_id, h_index, total_citations, recorded_at }
};

const memoryStore = {
  async createUser({ email, name, passwordHash, authProvider = 'local' }) {
    const user = {
      id: uuid(),
      email,
      name,
      password_hash: passwordHash,
      auth_provider: authProvider,
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

  async upsertResearcher({ userId, semanticScholarId, name, hIndex, totalCitations, paperCount, source = 'semantic_scholar' }) {
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
        manual_h_index: null,
        manual_h_index_source: null,
        manual_h_index_url: null,
        manual_h_index_updated_at: null,
        updated_at: now,
      };
      memory.researchers.push(researcher);
    }
    memory.history.push({
      id: uuid(),
      researcher_id: researcher.id,
      h_index: hIndex,
      total_citations: totalCitations,
      recorded_at: now,
    });
    return researcher;
  },

  async findResearcherById(id) {
    return memory.researchers.find((r) => r.id === id) || null;
  },

  async setManualScore(researcherId, { source, profileUrl, hIndex }) {
    const researcher = memory.researchers.find((r) => r.id === researcherId);
    if (!researcher) return null;
    researcher.manual_h_index = hIndex;
    researcher.manual_h_index_source = source;
    researcher.manual_h_index_url = profileUrl || null;
    researcher.manual_h_index_updated_at = new Date().toISOString();
    return researcher;
  },

  async clearManualScore(researcherId) {
    const researcher = memory.researchers.find((r) => r.id === researcherId);
    if (!researcher) return null;
    researcher.manual_h_index = null;
    researcher.manual_h_index_source = null;
    researcher.manual_h_index_url = null;
    researcher.manual_h_index_updated_at = null;
    return researcher;
  },

  async replacePapers(researcherId, papers) {
    memory.papers = memory.papers.filter((p) => p.researcher_id !== researcherId);
    const now = new Date().toISOString();
    const rows = papers.map((p) => ({
      id: uuid(),
      researcher_id: researcherId,
      external_id: p.externalId || null,
      title: p.title,
      year: p.year || null,
      citations: p.citations || 0,
      venue: p.venue || null,
      updated_at: now,
    }));
    memory.papers.push(...rows);
    return rows;
  },

  async listPapers(researcherId) {
    return memory.papers
      .filter((p) => p.researcher_id === researcherId)
      .sort((a, b) => (b.citations || 0) - (a.citations || 0));
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
};

// ---------------------------------------------------------------------------
// Postgres-backed store
// ---------------------------------------------------------------------------
const pgStore = {
  async createUser({ email, name, passwordHash, authProvider = 'local' }) {
    const { rows } = await query(
      `INSERT INTO users (email, name, password_hash, auth_provider) VALUES ($1, $2, $3, $4) RETURNING *`,
      [email, name, passwordHash, authProvider]
    );
    return rows[0];
  },

  async findUserByEmail(email) {
    const { rows } = await query(`SELECT * FROM users WHERE email = $1`, [email]);
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

  async upsertResearcher({ userId, semanticScholarId, name, hIndex, totalCitations, paperCount, source = 'semantic_scholar' }) {
    const { rows } = await query(
      `INSERT INTO researchers (user_id, semantic_scholar_id, name, h_index, total_citations, paper_count, source)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (user_id, semantic_scholar_id)
       DO UPDATE SET name = $3, h_index = $4, total_citations = $5, paper_count = $6, source = $7, updated_at = now()
       RETURNING *`,
      [userId, semanticScholarId, name, hIndex, totalCitations, paperCount, source]
    );
    const researcher = rows[0];
    await query(
      `INSERT INTO h_index_history (researcher_id, h_index, total_citations) VALUES ($1, $2, $3)`,
      [researcher.id, hIndex, totalCitations]
    );
    return researcher;
  },

  async findResearcherById(id) {
    const { rows } = await query(`SELECT * FROM researchers WHERE id = $1`, [id]);
    return rows[0] || null;
  },

  async setManualScore(researcherId, { source, profileUrl, hIndex }) {
    const { rows } = await query(
      `UPDATE researchers
       SET manual_h_index = $2, manual_h_index_source = $3, manual_h_index_url = $4, manual_h_index_updated_at = now()
       WHERE id = $1
       RETURNING *`,
      [researcherId, hIndex, source, profileUrl || null]
    );
    return rows[0] || null;
  },

  async clearManualScore(researcherId) {
    const { rows } = await query(
      `UPDATE researchers
       SET manual_h_index = NULL, manual_h_index_source = NULL, manual_h_index_url = NULL, manual_h_index_updated_at = NULL
       WHERE id = $1
       RETURNING *`,
      [researcherId]
    );
    return rows[0] || null;
  },

  async replacePapers(researcherId, papers) {
    await query(`DELETE FROM papers WHERE researcher_id = $1`, [researcherId]);
    const inserted = [];
    for (const p of papers) {
      const { rows } = await query(
        `INSERT INTO papers (researcher_id, external_id, title, year, citations, venue)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
        [researcherId, p.externalId || null, p.title, p.year || null, p.citations || 0, p.venue || null]
      );
      inserted.push(rows[0]);
    }
    return inserted;
  },

  async listPapers(researcherId) {
    const { rows } = await query(
      `SELECT * FROM papers WHERE researcher_id = $1 ORDER BY citations DESC`,
      [researcherId]
    );
    return rows;
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
};

module.exports = isDemoMode ? memoryStore : pgStore;
