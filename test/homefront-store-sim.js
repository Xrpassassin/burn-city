// Homefront persistence: in-memory cache, coalesced atomic writes, isolation, corruption pause, flush on exit/SIGTERM.
'use strict';
const assert = require('assert');
const fs = require('fs'), os = require('os'), path = require('path');
const { spawnSync } = require('child_process');
const DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'hfstore-'));
process.env.DATA_DIR = DATA;
const Store = require('../server/store');
const { createCachedStore } = require('../server/homefront-store');

// --- 1. unit: fake base store + manual timers ---------------------------------------------
{
  const disk = new Map([['homefront.json', { rA: { v: 1, nested: { n: 1 } } }]]);
  const calls = { load: 0, save: 0 };
  const base = { load(n, d) { calls.load++; return disk.has(n) ? JSON.parse(JSON.stringify(disk.get(n))) : d; }, save(n, v) { calls.save++; disk.set(n, JSON.parse(JSON.stringify(v))); } };
  const pending = [];
  const timers = { setTimeout(fn) { const t = { fn }; pending.push(t); return t; }, clearTimeout(t) { const i = pending.indexOf(t); if (i >= 0) pending.splice(i, 1); } };
  const s = createCachedStore({ base, timers, modes: { 'homefront.json': 'shallow', 'homefront-world.json': 'deep' } });

  for (let i = 0; i < 50; i++) s.load('homefront.json', {});
  assert.equal(calls.load, 1, 'file is read from disk once, then served from memory');

  const a = s.load('homefront.json', {}); a.rB = { v: 2 };
  assert.equal(s.load('homefront.json', {}).rB, undefined, 'mutating a loaded map does not leak into the cache before save');

  const fresh = s.load('homefront-world.json', { version: 1, players: {} });
  fresh.players.x = 1;
  assert.deepEqual(s.load('homefront-world.json', { version: 1, players: {} }).players, {}, 'a missing file returns the fallback and caches nothing');

  for (let i = 0; i < 25; i++) { const db = s.load('homefront.json', {}); db['r' + i] = { v: i }; s.save('homefront.json', db); }
  const w = { version: 1, players: { p: { x: 1 } } }; s.save('homefront-world.json', w);
  w.players.p.x = 99;
  assert.equal(s.load('homefront-world.json', null).players.p.x, 1, 'deep files are copied on save, so later caller mutation cannot change the cache');
  const wl = s.load('homefront-world.json', null); wl.players.p.x = 50;
  assert.equal(s.load('homefront-world.json', null).players.p.x, 1, 'deep files are copied on load');
  assert.equal(calls.save, 0, 'saves are deferred off the request path');
  assert.equal(pending.length, 1, 'one timer coalesces a burst of saves');
  assert.deepEqual(s.pending().sort(), ['homefront-world.json', 'homefront.json']);
  pending.shift().fn();
  assert.equal(calls.save, 2, '25 homefront saves + 1 world save -> exactly one write per file');
  assert.equal(disk.get('homefront.json').r24.v, 24, 'last write wins and contains every coalesced change');
  assert.equal(disk.get('homefront.json').rA.v, 1, 'untouched accounts survive the rewrite');
  assert.equal(s.pending().length, 0);

  s.save('homefront.json', { only: 1 }); s.flush();
  assert.equal(calls.save, 3, 'flush writes synchronously');
  assert.equal(pending.length, 0, 'flush cancels the pending timer');

  // write failure: memory stays authoritative and the write is retried
  let fail = true; const realSave = base.save; base.save = (n, v) => { if (fail) throw new Error('ENOSPC'); realSave(n, v); };
  const quiet = { error() {} };
  const s2 = createCachedStore({ base, timers, log: quiet });
  s2.save('homefront.json', { k: 1 }); pending.shift().fn();
  assert.deepEqual(s2.pending(), ['homefront.json'], 'failed write stays dirty');
  assert.equal(s2.load('homefront.json', null).k, 1, 'failed write does not lose the in-memory state');
  fail = false; pending.shift().fn();
  assert.equal(disk.get('homefront.json').k, 1, 'retry writes the file once the disk recovers');
  base.save = realSave;
}

// --- 2. integration with the real store (tmp+rename, .bak, corruption pause) ---------------
{
  const s = createCachedStore({ modes: { 'homefront.json': 'shallow' } });
  s.save('homefront.json', { rA: { level: 1 } });
  assert.ok(!fs.existsSync(path.join(DATA, 'homefront.json')), 'not written synchronously');
  s.flush();
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(DATA, 'homefront.json'), 'utf8')), { rA: { level: 1 } });
  s.save('homefront.json', { rA: { level: 2 } }); s.flush();
  assert.equal(JSON.parse(fs.readFileSync(path.join(DATA, 'homefront.json.bak'), 'utf8')).rA.level, 1, 'store.save keeps the previous file as .bak');
  assert.ok(!fs.existsSync(path.join(DATA, 'homefront.json.tmp')), 'atomic temp file is renamed away');

  // corrupt main file with a good .bak -> recovered, no pause
  fs.writeFileSync(path.join(DATA, 'homefront.json'), '{not json');
  const r = createCachedStore();
  assert.equal(r.load('homefront.json', {}).rA.level, 1, 'corrupt file recovers from .bak through store.load');
  assert.ok(!fs.existsSync(path.join(DATA, 'pause.json')), 'recoverable corruption does not pause payouts');

  // unrecoverable -> same behavior as before: file moved aside, payouts paused, fallback returned
  fs.writeFileSync(path.join(DATA, 'homefront-world.json'), '{bad');
  const u = createCachedStore();
  assert.deepEqual(u.load('homefront-world.json', { fallback: true }), { fallback: true });
  const pause = JSON.parse(fs.readFileSync(path.join(DATA, 'pause.json'), 'utf8'));
  assert.equal(pause.paused, true); assert.equal(pause.reason, 'store_corrupt:homefront-world.json', 'corruption pause behavior preserved');
  assert.ok(fs.readdirSync(DATA).some(f => f.startsWith('homefront-world.json.corrupt-')), 'corrupt file kept for inspection');
  fs.unlinkSync(path.join(DATA, 'pause.json'));
}

// --- 3. shared instance flushes on normal exit and on SIGTERM (server.js handler) -----------
{
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hfexit-'));
  const mod = JSON.stringify(path.join(__dirname, '../server/homefront-store'));
  const res = spawnSync(process.execPath, ['-e', `const {shared}=require(${mod});shared.save('homefront.json',{rExit:{ok:1}});process.exit(0)`], { env: { ...process.env, DATA_DIR: dir } });
  assert.equal(res.status, 0, String(res.stderr));
  assert.equal(JSON.parse(fs.readFileSync(path.join(dir, 'homefront.json'), 'utf8')).rExit.ok, 1, 'pending save is flushed on process exit');

  const hf = JSON.stringify(path.join(__dirname, '../server/homefront'));
  const script = `const H=require(${hf});const {shared}=require(${mod});shared.save('homefront-world.json',{version:1,sig:1});
for (const sig of ['SIGTERM','SIGINT']) process.once(sig,()=>{H.flush();process.exit(0)});
process.kill(process.pid,'SIGTERM');setTimeout(()=>{},5000);`;
  const r2 = spawnSync(process.execPath, ['-e', script], { env: { ...process.env, DATA_DIR: dir }, timeout: 8000 });
  assert.equal(r2.status, 0, String(r2.stderr));
  assert.equal(JSON.parse(fs.readFileSync(path.join(dir, 'homefront-world.json'), 'utf8')).sig, 1, 'SIGTERM handler flushes the world file');
  const src = fs.readFileSync(path.join(__dirname, '../server/server.js'), 'utf8');
  assert.ok(/for \(const sig of \['SIGTERM', 'SIGINT'\]\) process\.once\(sig, \(\) => \{ try \{ Homefront\.flush\(\);/.test(src), 'server.js flushes Homefront saves on SIGTERM/SIGINT');
}

console.log('Homefront cached store: load-once, coalesced atomic writes, isolation, corruption pause, exit/SIGTERM flush passed.');
