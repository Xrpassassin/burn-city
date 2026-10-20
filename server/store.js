// Tiny append-only JSON store (swap for SQLite/Redis if you scale). Survives restarts on a volume.
const fs = require('fs'), path = require('path'), C = require('./config');
fs.mkdirSync(C.DATA_DIR, { recursive: true });
const f = n => path.join(C.DATA_DIR, n);
function load(n, d) {
  const p = f(n); let raw;
  try { raw = fs.readFileSync(p, 'utf8'); } catch (e) { if (e.code === 'ENOENT') return d; console.error('[store] cannot read', n, e.message); raw = null; }
  if (raw !== null) { try { return JSON.parse(raw); } catch { console.error('[store] CORRUPT', n); } }
  try { const v = JSON.parse(fs.readFileSync(p + '.bak', 'utf8')); console.error('[store] recovered', n, 'from .bak'); return v; } catch {}
  // unrecoverable: keep the bad file for inspection and pause payouts so counters can't silently reset
  try { if (raw !== null) fs.renameSync(p, p + '.corrupt-' + Date.now()); if (n !== 'pause.json') fs.writeFileSync(f('pause.json'), JSON.stringify({ paused: true, reason: 'store_corrupt:' + n, t: Date.now() })); } catch {}
  console.error('[store] UNRECOVERABLE', n, '- payouts paused');
  return d;
}
function save(n, v) { const p = f(n), t = p + '.tmp'; fs.writeFileSync(t, JSON.stringify(v)); try { fs.copyFileSync(p, p + '.bak'); } catch {} fs.renameSync(t, p); }
function append(n, line) { fs.appendFileSync(f(n), JSON.stringify(line) + '\n'); }
module.exports = { load, save, append, file: f };
