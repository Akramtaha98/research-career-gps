import { calculateHIndex, ageGrowthMultiplier, projectHIndex } from './prediction';
import { computeHIndexFrontier } from './frontier';
import { generateActionItemsPlain } from './actionItemsPlain';

/**
 * Grounded, rule-based assistant for the in-app chat widget (see
 * components/ChatWidget.jsx). Deliberately NOT a call out to a general LLM:
 * every answer is assembled from numbers this app has already computed from
 * the researcher's real tracked papers (h-index, frontier, action items,
 * the same projection model Predictor.jsx uses) — so it can't hallucinate a
 * citation count or invent advice that doesn't apply to this researcher.
 * That's a deliberate trade-off (see the "chatbot strategy" discussion this
 * was scoped from): a smaller, always-correct assistant beats a more
 * eloquent one that's occasionally wrong about someone's own career data.
 *
 * Matching is intentionally generous (many phrasings per intent, case-
 * insensitive, substring-based) so normal conversational phrasing works
 * without needing an exact command syntax — the "intelligent" part is
 * picking the right grounded answer for a wide range of ways to ask the
 * same question, not open-ended generation.
 */

function buildContext({ hasResearcher, researcherName, papers, source }) {
  if (!hasResearcher || !papers || papers.length === 0) {
    return { hasResearcher: false };
  }
  const citations = papers.map((p) => p.citations || 0);
  const hIndex = calculateHIndex(citations);
  const totalCitations = citations.reduce((a, b) => a + b, 0);
  const frontier = computeHIndexFrontier(papers);
  const actionItems = generateActionItemsPlain({ papers });
  return {
    hasResearcher: true,
    researcherName,
    source,
    papers,
    hIndex,
    totalCitations,
    paperCount: papers.length,
    frontier,
    actionItems,
  };
}

const GREETING_SUGGESTIONS = [
  "How's my H-index trending?",
  'What should I do to grow it faster?',
  'What do I need to hit my next H-index?',
  'How do I add a missing paper?',
];

const NO_RESEARCHER_SUGGESTIONS = [
  'How does H-index work?',
  'How do I get started?',
  'What can you help with?',
];

function greeting(ctx) {
  if (!ctx.hasResearcher) {
    return {
      text:
        "Hi! I'm your Research GPS assistant 👋 Search for yourself (or load the demo) and I can talk through your actual H-index, what's holding it back, and what would move it fastest. Until then, ask me how any of this works.",
      suggestions: NO_RESEARCHER_SUGGESTIONS,
    };
  }
  return {
    text: `Hi ${firstName(ctx.researcherName)}! Your H-index is currently ${ctx.hIndex}, across ${ctx.paperCount} tracked papers and ${ctx.totalCitations.toLocaleString()} total citations. What would you like to know?`,
    suggestions: GREETING_SUGGESTIONS,
  };
}

function firstName(name) {
  if (!name) return 'there';
  return name.trim().split(/\s+/)[0];
}

function explainHIndex() {
  return {
    text:
      "Your H-index is H if you have H papers that each have at least H citations. It rewards a body of consistently-cited work over one lucky hit — one paper with 500 citations doesn't help your H-index nearly as much as ten papers with 20+ citations each.",
    suggestions: ["What's my H-index?", 'What should I do to grow it?'],
  };
}

function currentStatus(ctx) {
  if (!ctx.hasResearcher) return needResearcher();
  const growth =
    ctx.frontier.papersNeeded === 0
      ? "you're right at a clean threshold"
      : `you need ${ctx.frontier.papersNeeded} more paper${ctx.frontier.papersNeeded === 1 ? '' : 's'} over ${ctx.frontier.nextThreshold - 1} citations to reach ${ctx.frontier.nextThreshold}`;
  return {
    text: `You're at H-index ${ctx.hIndex} right now, from ${ctx.paperCount} tracked papers and ${ctx.totalCitations.toLocaleString()} citations total. To reach ${ctx.frontier.nextThreshold}, ${growth}.`,
    suggestions: ['What should I do to grow it faster?', 'When will I hit my next milestone?'],
  };
}

function frontierAnswer(ctx) {
  if (!ctx.hasResearcher) return needResearcher();
  const { nextThreshold, papersNeeded, papersNeededFromNewWork, candidates } = ctx.frontier;
  if (papersNeeded === 0) {
    return {
      text: `Good news — you're already positioned right at H-index ${ctx.hIndex}. Add virtually any citation to a qualifying paper and you'll tip over to ${nextThreshold}.`,
      suggestions: ['What should I do to grow it faster?'],
    };
  }
  let text = `To go from ${ctx.hIndex} to ${nextThreshold}, ${papersNeeded} more paper${papersNeeded === 1 ? '' : 's'} need${papersNeeded === 1 ? 's' : ''} to reach ${nextThreshold}+ citations.`;
  if (candidates.length > 0) {
    const closest = candidates[0];
    text += ` Your closest candidate is "${closest.title}" — just ${closest.citationsNeeded} more citation${closest.citationsNeeded === 1 ? '' : 's'} away.`;
  }
  if (papersNeededFromNewWork > 0) {
    text += ` ${papersNeededFromNewWork} of those will have to come from new papers you haven't published yet — your existing papers alone can't cover the gap.`;
  }
  return { text, suggestions: ['What should I do to grow it faster?', 'When will I hit my next milestone?'] };
}

function actionAdvice(ctx) {
  if (!ctx.hasResearcher) return needResearcher();
  const top = ctx.actionItems.filter((i) => i.priority !== 'info').slice(0, 3);
  if (top.length === 0) {
    return {
      text: "You're in solid shape — I don't see any urgent gaps in your current paper set. Keep publishing consistently and citations will keep compounding.",
      suggestions: ['What do I need to hit my next H-index?'],
    };
  }
  const lines = top.map((item, i) => `${i + 1}. ${item.title} — ${item.description}`);
  return {
    text: `Here's what would move the needle most, in order:\n\n${lines.join('\n\n')}`,
    suggestions: ['What do I need to hit my next H-index?', 'When will I hit my next milestone?'],
  };
}

function extractTargetH(message, currentH) {
  const match = message.match(/\b(\d{1,3})\b/);
  if (match) {
    const n = Number(match[1]);
    if (n > currentH && n < 1000) return n;
  }
  return currentH + 3;
}

function predictionAnswer(ctx, message) {
  if (!ctx.hasResearcher) return needResearcher();
  const targetH = extractTargetH(message, ctx.hIndex);
  const currentCitations = ctx.papers.map((p) => p.citations || 0);
  const currentPaperYears = ctx.papers.map((p) => p.year || null);
  const projection = projectHIndex({
    currentCitations,
    currentPaperYears,
    targetH,
    monthlyCitationRate: 0.5,
    papersPerYear: 2,
    newPaperCitationMultiplier: 1,
  });
  if (!projection.reached) {
    return {
      text: `Using typical assumptions (0.5 citations/paper/month, 2 new papers/year), I don't see you reaching H-index ${targetH} within 20 years — you'd likely need a faster publication pace or higher-impact venues. Try the Predictor page to tune the assumptions to your real situation.`,
      suggestions: ['What should I do to grow it faster?'],
    };
  }
  const years = (projection.estimatedMonths / 12).toFixed(1);
  return {
    text: `At a typical pace (0.5 citations/paper/month, ~2 new papers/year), you'd reach H-index ${targetH} in roughly ${projection.estimatedMonths} months (about ${years} years). Head to the Predictor page to plug in your real publishing rate and venue tier for a sharper estimate.`,
    suggestions: ['What should I do to grow it faster?', 'What do I need to hit my next H-index?'],
  };
}

function addPaperAnswer() {
  return {
    text:
      "If a paper of yours is missing, open Dashboard → \"Add paper by DOI\" and paste its DOI — I'll verify it against Crossref before adding it, so it can't be faked. If a paper that ISN'T yours got mixed in (common with shared names), use the \"not mine\" / \"duplicate\" controls next to it in the papers table.",
    suggestions: ["What's my H-index?", 'How do I get started?'],
  };
}

function collaboratorsAnswer() {
  return {
    text:
      "Collaboration suggestions (ranked by your most frequent, highest-impact co-authors) are a Pro feature — check the Actions page. It's grounded in your real Semantic Scholar co-authorship graph, not guesses.",
    suggestions: ['What should I do to grow it faster?'],
  };
}

function howItWorksAnswer() {
  return {
    text:
      "Quick tour: Search finds you by name → Dashboard shows your live H-index, citations, and paper list → the H-index Frontier tells you exactly what's needed for your next point → Actions gives prioritized recommendations → Predictor projects when you'll hit a target H-index. There's also a full step-by-step guide — look for \"How it works\" in the navigation.",
    suggestions: ["What's my H-index?", 'What should I do to grow it faster?'],
  };
}

function thanksAnswer() {
  return { text: "You're welcome! Anything else you'd like to know about your H-index or what to work on next?", suggestions: GREETING_SUGGESTIONS };
}

function needResearcher() {
  return {
    text: "I don't have a researcher loaded yet — search for yourself (or try the demo) from the Search page, then come back and I can talk through your actual numbers.",
    suggestions: NO_RESEARCHER_SUGGESTIONS,
  };
}

function fallback(ctx) {
  return {
    text:
      "I'm not totally sure I followed that — I'm built to answer questions about your H-index, what's holding it back, and how to grow it faster, using your real tracked data (not general chit-chat). Here's what I can help with:",
    suggestions: ctx.hasResearcher ? GREETING_SUGGESTIONS : NO_RESEARCHER_SUGGESTIONS,
  };
}

const INTENTS = [
  { test: /\b(thanks|thank you|thx|appreciate it)\b/i, handler: () => thanksAnswer() },
  { test: /^\s*(hi|hello|hey|yo|sup|good (morning|afternoon|evening))\b/i, handler: (ctx) => greeting(ctx) },
  { test: /what (is|'s) (an? )?h-?index|h-?index mean|explain h-?index/i, handler: () => explainHIndex() },
  {
    test: /add(ing)? (a )?(missing )?paper|doi|not (my|mine)|duplicate paper/i,
    handler: () => addPaperAnswer(),
  },
  { test: /collaborat|co-?author/i, handler: () => collaboratorsAnswer() },
  {
    test: /how (do|does) (this|the) (app|site|website) work|tutorial|getting started|get started|how it works/i,
    handler: () => howItWorksAnswer(),
  },
  {
    test: /(when will i|how long|how many months|how many years|predict|projection|reach (h-?index )?\d)/i,
    handler: (ctx, msg) => predictionAnswer(ctx, msg),
  },
  {
    test: /(what (do|would) i need|what('s| is) needed|next (h-?index|threshold|milestone)|how (many|much) (more )?(citation|paper)s? (do i )?need)/i,
    handler: (ctx) => frontierAnswer(ctx),
  },
  {
    test: /(what should i do|how (can|do) i improve|grow my|boost my|increase my|help me improve|advice)/i,
    handler: (ctx) => actionAdvice(ctx),
  },
  {
    test: /(my|current) h-?index|how am i doing|how('s| is) (it|my h-?index) (trending|going|doing)|progress|status/i,
    handler: (ctx) => currentStatus(ctx),
  },
];

/**
 * @param {string} message - raw user input
 * @param {{ hasResearcher: boolean, researcherName?: string, papers?: object[], source?: string }} rawContext
 * @returns {{ text: string, suggestions: string[] }}
 */
export function getBotReply(message, rawContext) {
  const ctx = buildContext(rawContext);
  const trimmed = (message || '').trim();
  if (!trimmed) return fallback(ctx);

  for (const intent of INTENTS) {
    if (intent.test.test(trimmed)) {
      return intent.handler(ctx, trimmed);
    }
  }
  return fallback(ctx);
}

export function getInitialSuggestions(rawContext) {
  const ctx = buildContext(rawContext);
  return ctx.hasResearcher ? GREETING_SUGGESTIONS : NO_RESEARCHER_SUGGESTIONS;
}
