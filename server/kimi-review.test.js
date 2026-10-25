'use strict';
const assert = require('node:assert/strict');
const { createKimiReviewer, MAX_CONTEXT_CHARS } = require('./kimi-review');

(async () => {
  const missing = createKimiReviewer({ apiKey: '', fetchImpl: async () => { throw new Error('must not call'); } });
  assert.deepEqual(await missing.review('review this'), { ok: false, status: 503, error: 'kimi_not_configured' });
  assert.deepEqual(await missing.review(''), { ok: false, status: 400, error: 'review_context_required' });
  assert.equal((await missing.review('x'.repeat(MAX_CONTEXT_CHARS + 1))).status, 413);

  let request;
  const reviewer = createKimiReviewer({
    apiKey: 'test-secret',
    model: 'test-model',
    fetchImpl: async (url, options) => {
      request = { url, options, body: JSON.parse(options.body) };
      return { ok: true, json: async () => ({ model: 'test-model', choices: [{ message: { content: 'Finding: validate ownership.' } }] }) };
    }
  });
  const result = await reviewer.review('server/estates-rights.js');
  assert.equal(result.ok, true);
  assert.match(result.review, /validate ownership/);
  assert.equal(request.url, 'https://api.moonshot.ai/v1/chat/completions');
  assert.equal(request.options.headers.authorization, 'Bearer test-secret');
  assert.equal(request.body.model, 'test-model');
  assert.equal(request.body.messages.length, 2);
  assert.equal(request.body.temperature, 0.1);

  const failing = createKimiReviewer({ apiKey: 'x', fetchImpl: async () => ({ ok: false, status: 429, text: async () => 'sensitive provider details' }) });
  assert.deepEqual(await failing.review('context'), { ok: false, status: 502, error: 'kimi_rate_limited' });

  const timeout = createKimiReviewer({ apiKey: 'x', timeoutMs: 1, fetchImpl: async () => { const e = new Error('timeout'); e.name = 'AbortError'; throw e; } });
  assert.deepEqual(await timeout.review('context'), { ok: false, status: 502, error: 'kimi_timeout' });
  console.log('kimi-review: ok');
})().catch(error => { console.error(error); process.exitCode = 1; });
