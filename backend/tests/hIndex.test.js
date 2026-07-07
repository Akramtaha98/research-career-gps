const test = require('node:test');
const assert = require('node:assert');
const { calculateHIndex } = require('../utils/hIndex');
const { projectHIndex } = require('../utils/prediction');

test('calculateHIndex: standard example', () => {
  // 3 papers with >=3 citations, 4th has only 1 -> h=3
  assert.strictEqual(calculateHIndex([10, 8, 5, 1]), 3);
});

test('calculateHIndex: empty array', () => {
  assert.strictEqual(calculateHIndex([]), 0);
});

test('calculateHIndex: all zero citations', () => {
  assert.strictEqual(calculateHIndex([0, 0, 0]), 0);
});

test('calculateHIndex: classic h=5 example', () => {
  // citations: 25, 8, 5, 3, 3, 2, 0 -> sorted desc, rank5=3>=5? no wait check manually
  const citations = [25, 8, 5, 5, 3, 2, 0];
  // rank1=25>=1 ok, rank2=8>=2 ok, rank3=5>=3 ok, rank4=5>=4 ok, rank5=3>=5 fail -> h=4
  assert.strictEqual(calculateHIndex(citations), 4);
});

test('projectHIndex: already at target returns 0 months', () => {
  const result = projectHIndex({
    currentCitations: [10, 8, 5, 1],
    targetH: 3,
    monthlyCitationRate: 1,
    papersPerYear: 2,
  });
  assert.strictEqual(result.estimatedMonths, 0);
  assert.strictEqual(result.reached, true);
});

test('projectHIndex: reaches higher target eventually', () => {
  const result = projectHIndex({
    currentCitations: [3, 2, 1],
    targetH: 5,
    monthlyCitationRate: 2,
    papersPerYear: 4,
  });
  assert.strictEqual(result.reached, true);
  assert.ok(result.estimatedMonths > 0);
});

test('projectHIndex: no growth never reaches unreachable target within cap', () => {
  const result = projectHIndex({
    currentCitations: [1],
    targetH: 50,
    monthlyCitationRate: 0,
    papersPerYear: 0,
    maxMonths: 12,
  });
  assert.strictEqual(result.reached, false);
  assert.strictEqual(result.estimatedMonths, null);
});
