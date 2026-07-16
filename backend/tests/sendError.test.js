const test = require('node:test');
const assert = require('node:assert');
const { sendError } = require('../utils/sendError');

// Minimal fake Express `res` — just enough for sendError's chained
// .status(...).json(...) call.
function fakeRes() {
  const res = { statusCalledWith: null, jsonCalledWith: null };
  res.status = (code) => {
    res.statusCalledWith = code;
    return res;
  };
  res.json = (body) => {
    res.jsonCalledWith = body;
    return res;
  };
  return res;
}

test('sendError passes through intentional, user-facing messages below 500 in any environment', () => {
  const err = Object.assign(new Error('This paper is already in your tracked list.'), { statusCode: 409 });
  const res = fakeRes();
  sendError(res, err);
  assert.strictEqual(res.statusCalledWith, 409);
  assert.strictEqual(res.jsonCalledWith.error, 'This paper is already in your tracked list.');
});

test('sendError exposes the real message for an unexpected 500 outside production', () => {
  const originalEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = 'test';
  try {
    const err = new Error('relation "users" does not exist');
    const res = fakeRes();
    sendError(res, err);
    assert.strictEqual(res.statusCalledWith, 500);
    assert.strictEqual(res.jsonCalledWith.error, 'relation "users" does not exist');
  } finally {
    process.env.NODE_ENV = originalEnv;
  }
});

test('sendError hides the real message behind a generic fallback for a 500 in production', () => {
  const originalEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = 'production';
  try {
    const err = new Error('relation "users" does not exist');
    const res = fakeRes();
    sendError(res, err, 'Signup failed');
    assert.strictEqual(res.statusCalledWith, 500);
    assert.strictEqual(res.jsonCalledWith.error, 'Signup failed');
    assert.doesNotMatch(res.jsonCalledWith.error, /relation|users/);
  } finally {
    process.env.NODE_ENV = originalEnv;
  }
});
