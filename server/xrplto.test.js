// xrpl.to API key: X-Api-Key only when XRPLTO_API_KEY is set, anonymous otherwise; `keyed` on the status routes; the key never leaks.
'use strict';
const assert = require('assert'), fs = require('fs'), os = require('os'), path = require('path');
process.env.DATA_DIR = process.env.DATA_DIR || fs.mkdtempSync(path.join(os.tmpdir(), 'xk-'));
delete process.env.XRPLTO_API_KEY;
const X = require('./xrplto'), MC = require('./memes-circle');
const KEY = 'test-key-123456';

// helper
assert.strictEqual(X.keyed(), false);
assert.deepStrictEqual(X.headers({ a: '1' }), { a: '1' }, 'unset: no key header');
process.env.XRPLTO_API_KEY = '   '; assert.strictEqual(X.keyed(), false, 'blank counts as unset');
process.env.XRPLTO_API_KEY = KEY;
assert.strictEqual(X.keyed(), true); assert.deepStrictEqual(X.headers({ a: '1' }), { a: '1', 'X-Api-Key': KEY });

// every server file that talks to api.xrpl.to routes its headers through the helper
for (const f of fs.readdirSync(__dirname).filter(f => f.endsWith('.js') && !/\.test\.js$|^xrplto\.js$/.test(f))) {
  const s = fs.readFileSync(path.join(__dirname, f), 'utf8');
  if (/api\.xrpl\.to/.test(s)) assert.ok(/require\('\.\/xrplto'\)/.test(s) && /XrplTo\.headers\(/.test(s), f + ' calls api.xrpl.to without XrplTo.headers');
  assert.ok(!/console\.\w+\([^)]*XRPLTO_API_KEY/.test(s), f + ' must not log the key');
}

(async () => {
  const seen = []; MC._reset();
  MC._setFetch(async (u, o) => { seen.push(o.headers); return { ok: false, status: 429, json: async () => ({}) }; });
  const json = (res, code, j) => { res.code = code; res.j = j; };
  const call = q => { const res = { writeHead() {}, end() {} }; MC.handle({ headers: {} }, res, new URL('http://x/api/memes-circle' + q), { json }); return res; };
  // keyed: header sent on memes-circle pulls; status + warming_up say keyed:true; key text never in a response
  await MC.refresh({ gap: 0 });
  assert.ok(seen.length && seen.every(h => h['X-Api-Key'] === KEY && h['user-agent'] === 'burn-city/1'));
  let st = call('?status=1'); assert.strictEqual(st.code, 200); assert.strictEqual(st.j.keyed, true);
  assert.ok(!JSON.stringify(st.j).includes(KEY) && !JSON.stringify(MC.status()).includes(KEY));
  let w = call(''); assert.strictEqual(w.code, 503); assert.strictEqual(w.j.keyed, true);
  // unset: anonymous, keyed:false
  delete process.env.XRPLTO_API_KEY; seen.length = 0;
  await MC.refresh({ gap: 0 });
  assert.ok(seen.length && seen.every(h => !('X-Api-Key' in h)), 'no key header when unset');
  assert.strictEqual(call('?status=1').j.keyed, false); assert.strictEqual(MC.status().keyed, false);
  // eco status carries keyed too (status() only; no network)
  const Eco = require('./eco'); assert.strictEqual(Eco.status().keyed, false);
  process.env.XRPLTO_API_KEY = KEY; assert.strictEqual(Eco.status().keyed, true); assert.ok(!JSON.stringify(Eco.status()).includes(KEY));
  delete process.env.XRPLTO_API_KEY; MC._reset();
  console.log('xrplto key tests ok');
})().catch(e => { console.error(e); process.exit(1); });
