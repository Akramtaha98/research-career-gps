/**
 * Client-side parser for Scopus / Web of Science citation export files.
 * Everything here runs entirely in the browser — the file never leaves the
 * user's machine — since Scopus/WOS API access is blocked outside
 * institutional IP ranges (see conversation), the only reliable way to get
 * real numbers from those databases into the app is a manual export/import.
 */

/**
 * Parses CSV text into an array of row objects keyed by header name.
 * Handles quoted fields (including commas and escaped "" quotes inside
 * them), which both Scopus and WOS exports rely on heavily for titles.
 */
export function parseCsv(text) {
  // Normalize line endings and strip a UTF-8 BOM if present (common in
  // exports from Windows-authored tools like Scopus/WOS).
  const clean = text.replace(/^﻿/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < clean.length; i += 1) {
    const char = clean[i];
    const next = clean[i + 1];

    if (inQuotes) {
      if (char === '"' && next === '"') {
        field += '"';
        i += 1;
      } else if (char === '"') {
        inQuotes = false;
      } else {
        field += char;
      }
    } else if (char === '"') {
      inQuotes = true;
    } else if (char === ',') {
      row.push(field);
      field = '';
    } else if (char === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else {
      field += char;
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  const nonEmptyRows = rows.filter((r) => r.some((cell) => cell.trim() !== ''));
  if (nonEmptyRows.length < 2) return [];

  const headers = nonEmptyRows[0].map((h) => h.trim());
  return nonEmptyRows.slice(1).map((r) => {
    const obj = {};
    headers.forEach((h, idx) => {
      obj[h] = (r[idx] || '').trim();
    });
    return obj;
  });
}

// Scopus and Web of Science use different header names for the same
// concept depending on export type (Fast5000 / Full Record / Citation
// Report). Match case-insensitively against every known alias.
const FIELD_ALIASES = {
  title: ['title', 'article title'],
  year: ['year', 'publication year', 'py', 'pub year'],
  citations: [
    'cited by',
    'times cited, wos core',
    'times cited, all databases',
    'times cited',
    'citations',
    'citation count',
  ],
  venue: ['source title', 'venue', 'journal', 'publication name', 'source'],
  doi: ['doi'],
};

function findColumn(headers, aliases) {
  const lowerHeaders = headers.map((h) => h.toLowerCase());
  for (const alias of aliases) {
    const idx = lowerHeaders.indexOf(alias);
    if (idx !== -1) return headers[idx];
  }
  return null;
}

/**
 * Maps parsed CSV rows to the app's paper shape, auto-detecting which
 * column is which regardless of whether the file came from Scopus or WOS.
 * Throws a descriptive error if it can't find the columns it needs.
 */
export function mapRowsToPapers(rows) {
  if (rows.length === 0) {
    const err = new Error('empty');
    err.code = 'EMPTY';
    throw err;
  }

  const headers = Object.keys(rows[0]);
  const cols = {
    title: findColumn(headers, FIELD_ALIASES.title),
    year: findColumn(headers, FIELD_ALIASES.year),
    citations: findColumn(headers, FIELD_ALIASES.citations),
    venue: findColumn(headers, FIELD_ALIASES.venue),
    doi: findColumn(headers, FIELD_ALIASES.doi),
  };

  if (!cols.title || !cols.citations) {
    const err = new Error('missing_columns');
    err.code = 'MISSING_COLUMNS';
    err.detectedHeaders = headers;
    throw err;
  }

  return rows
    .map((r, idx) => ({
      id: `imported-${idx}`,
      title: r[cols.title] || 'Untitled',
      year: cols.year ? parseInt(r[cols.year], 10) || null : null,
      citations: cols.citations ? parseInt(r[cols.citations], 10) || 0 : 0,
      venue: cols.venue ? r[cols.venue] || null : null,
      doi: cols.doi ? r[cols.doi] || null : null,
    }))
    .filter((p) => p.title && p.title !== 'Untitled');
}

/** Standard H-index: largest h such that h papers have >= h citations each. */
export function calculateHIndex(citations) {
  if (!Array.isArray(citations) || citations.length === 0) return 0;
  const sorted = [...citations].sort((a, b) => b - a);
  let h = 0;
  for (let i = 0; i < sorted.length; i += 1) {
    if (sorted[i] >= i + 1) h = i + 1;
    else break;
  }
  return h;
}

export function summarizeImport(papers) {
  const citations = papers.map((p) => p.citations || 0);
  const totalCitations = citations.reduce((a, b) => a + b, 0);
  return {
    paperCount: papers.length,
    totalCitations,
    hIndex: calculateHIndex(citations),
    avgCitations: papers.length ? Math.round(totalCitations / papers.length) : 0,
  };
}
