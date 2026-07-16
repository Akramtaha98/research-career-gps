import { describe, it, expect } from 'vitest';
import { getBotReply, getInitialSuggestions } from './chatAssistant';

const papers = [
  { id: 'a', title: 'Paper A', citations: 12, year: 2019 },
  { id: 'b', title: 'Paper B', citations: 8, year: 2020 },
  { id: 'c', title: 'Paper C', citations: 6, year: 2022 },
  { id: 'd', title: 'Paper D', citations: 1, year: 2023 },
];

const ctxWithResearcher = { hasResearcher: true, researcherName: 'Ada Lovelace', papers, source: 'live' };
const ctxNoResearcher = { hasResearcher: false, researcherName: null, papers: [], source: 'demo' };

describe('chatAssistant', () => {
  it('greets with the researcher\'s real computed H-index', () => {
    const { text } = getBotReply('hello', ctxWithResearcher);
    expect(text).toContain('Ada');
    expect(text).toContain('H-index is currently 3'); // citations [12,8,6,1] -> h=3
  });

  it('greets generically and points to demo/search when no researcher is loaded', () => {
    const { text } = getBotReply('hi', ctxNoResearcher);
    expect(text.toLowerCase()).toContain('search');
  });

  it('answers "what should I do" with grounded action items, not a generic platitude', () => {
    const { text } = getBotReply('what should I do to improve?', ctxWithResearcher);
    expect(text.length).toBeGreaterThan(20);
    expect(text).not.toMatch(/i'?m not (totally )?sure/i);
  });

  it('answers frontier questions using real papersNeeded math', () => {
    const { text } = getBotReply('what do I need to hit my next h-index?', ctxWithResearcher);
    expect(text).toMatch(/4/); // current h=3 -> next threshold 4
  });

  it('explains what an H-index is without needing a researcher loaded', () => {
    const { text } = getBotReply('what is an h-index?', ctxNoResearcher);
    expect(text.toLowerCase()).toContain('citations');
  });

  it('falls back gracefully on unrecognized input instead of throwing', () => {
    const { text, suggestions } = getBotReply('asdkfjasldkfj random gibberish', ctxWithResearcher);
    expect(typeof text).toBe('string');
    expect(suggestions.length).toBeGreaterThan(0);
  });

  it('handles an empty message without throwing', () => {
    expect(() => getBotReply('', ctxWithResearcher)).not.toThrow();
  });

  it('getInitialSuggestions reflects whether a researcher is loaded', () => {
    expect(getInitialSuggestions(ctxWithResearcher).length).toBeGreaterThan(0);
    expect(getInitialSuggestions(ctxNoResearcher).length).toBeGreaterThan(0);
  });
});
