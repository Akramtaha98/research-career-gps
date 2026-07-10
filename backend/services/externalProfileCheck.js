/**
 * Best-effort, no-AI check of a self-reported Scopus number against the
 * actual profile page the user pasted a link to. Deliberately NOT a
 * guaranteed verification: Scopus has no public API, its author pages are
 * largely rendered client-side, and it actively blocks a lot of automated
 * traffic — so this often won't find anything, and that's an expected
 * outcome, not a bug. When it can't confirm one way or the other, callers
 * should show that honestly rather than treating silence as agreement.
 *
 * Web of Science has no equivalent public, unauthenticated profile page at
 * all, so it is never attempted — see checkWosProfile below.
 */

const FETCH_TIMEOUT_MS = 8000;
const MAX_BODY_BYTES = 2_000_000; // don't buffer an unbounded response

/** Strips tags/scripts/styles down to plain visible-ish text for regex scanning. */
function toPlainText(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** First number found near a keyword, checked in both "N keyword" and "keyword N" order. */
function extractNear(text, keywordPattern) {
  const after = new RegExp(`${keywordPattern}\\W{0,25}(\\d{1,7})`, 'i');
  const before = new RegExp(`(\\d{1,7})\\W{0,25}${keywordPattern}`, 'i');
  const m = after.exec(text) || before.exec(text);
  return m ? Number(m[1]) : null;
}

function compareIfClaimed(claimed, extracted) {
  if (claimed == null || extracted == null) return null;
  return claimed === extracted;
}

/**
 * @param {string} url - the Scopus profile URL the user pasted
 * @param {{hIndex: number|null, paperCount: number|null, citations: number|null}} claimed
 */
async function checkScopusProfile(url, claimed) {
  const result = {
    attempted: true,
    reachable: false,
    extracted: { hIndex: null, paperCount: null, citations: null },
    matches: { hIndex: null, paperCount: null, citations: null },
    note: '',
  };

  if (!url || !/^https?:\/\//i.test(url)) {
    result.attempted = false;
    result.note = 'No profile URL was provided, so nothing to check.';
    return result;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const res = await fetch(url, {
      signal: controller.signal,
      redirect: 'follow',
      headers: {
        // A normal browser-like Accept/User-Agent — this is a single
        // best-effort GET, not an attempt to defeat any bot-detection or
        // CAPTCHA; if Scopus blocks or challenges it, we back off (below).
        'User-Agent':
          'Mozilla/5.0 (compatible; ResearchGPSVerifier/1.0; +https://research-career-gps.vercel.app)',
        Accept: 'text/html,application/xhtml+xml',
      },
    });

    if (!res.ok) {
      result.note = `Scopus responded with status ${res.status} — couldn't confirm automatically.`;
      return result;
    }

    const reader = res.body?.getReader ? res : null;
    let text;
    if (reader) {
      // Cap how much we read — profile pages are small; anything huge is
      // more likely a full app bundle than the info we need.
      const chunks = [];
      let received = 0;
      const readerObj = res.body.getReader();
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const { done, value } = await readerObj.read();
        if (done) break;
        received += value.length;
        chunks.push(value);
        if (received > MAX_BODY_BYTES) {
          readerObj.cancel();
          break;
        }
      }
      text = Buffer.concat(chunks.map((c) => Buffer.from(c))).toString('utf8');
    } else {
      text = await res.text();
    }

    if (/captcha|access denied|are you a robot|unusual traffic/i.test(text)) {
      result.note = "Scopus challenged the request (likely a bot check) — couldn't confirm automatically.";
      return result;
    }

    result.reachable = true;
    const plain = toPlainText(text);

    result.extracted.hIndex = extractNear(plain, 'h[\\s-]?index');
    result.extracted.paperCount = extractNear(plain, '(?:documents?|papers?)');
    result.extracted.citations = extractNear(plain, 'citations?');

    result.matches.hIndex = compareIfClaimed(claimed.hIndex, result.extracted.hIndex);
    result.matches.paperCount = compareIfClaimed(claimed.paperCount, result.extracted.paperCount);
    result.matches.citations = compareIfClaimed(claimed.citations, result.extracted.citations);

    const foundAnything = Object.values(result.extracted).some((v) => v != null);
    result.note = foundAnything
      ? 'Read what we could from the live Scopus page — see the comparison above.'
      : "Reached the page but couldn't recognize its layout — often means the numbers are loaded by JavaScript after the page loads, which this check can't run. Couldn't confirm automatically.";

    return result;
  } catch (err) {
    result.note =
      err.name === 'AbortError'
        ? "Scopus didn't respond in time — couldn't confirm automatically."
        : "Couldn't reach Scopus to check automatically.";
    return result;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Web of Science / Clarivate has no public, unauthenticated author profile
 * page — every real profile view requires an institutional or personal
 * login. There is nothing to fetch, so this is a static, honest answer
 * rather than an attempted (and doomed) request.
 */
function checkWosProfile() {
  return {
    attempted: false,
    reachable: false,
    extracted: { hIndex: null, paperCount: null, citations: null },
    matches: { hIndex: null, paperCount: null, citations: null },
    note: 'Web of Science requires signing in to view a profile, so this cannot be checked automatically.',
  };
}

module.exports = { checkScopusProfile, checkWosProfile };
