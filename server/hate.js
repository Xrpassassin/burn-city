// Server-side hate/slur filter. List is stored encoded (collapsed-repeat roots) so it is not plain text in the repo.
// Normalizes: NFKC + lookalikes, case, leetspeak, separators inside words, repeated letters, spaced-out letters.
// Token-based (whole word + small suffix set) so ordinary words that merely contain a root are not hit (Scunthorpe-safe).
const crypto = require('crypto'), { db } = require('./social'), { deob } = require('./scam');
const ROOTS = new Set(Buffer.from('bmlnZXIgbmlnYSBuaWdhaCBuaWdheiBuaWdsZXQgbmlnbm9nIHNhbmRuaWdlciBraWtlIGt5a2Ugc3BpYyB3ZXRiYWNrIGJlYW5lciBnb2sgcmFnaGVhZCB0b3dlbGhlYWQgcG9yY2htb25rZXkganVuZ2xlYnVubnkgZmFnb3QgZmFnIHRyYW55IHppcHBlcmhlYWQgZ29saXdvZyBwYWtpIGppZ2FibyBjaGlua3k=', 'base64').toString().split(' '));
const NEEDS_DOUBLE = new Set(['niger', 'gok']);   // collapsed form is also a real word -> only hit when the original had the doubled letter
const SUF = ['', 's', 'z', 'a', 'as', 'az', 'ah', 'er', 'ers', 'uh'];
const LEET = { '0': 'o', '1': 'i', '3': 'e', '4': 'a', '5': 's', '7': 't', '8': 'b', '9': 'g', '@': 'a', '$': 's', '!': 'i', '|': 'i', '€': 'e', '¡': 'i' };
const leet = s => deob(s).toLowerCase().replace(/[!|¡](?![a-z0-9])/g, " ").replace(/[0-9@$!|€¡]/g, c => LEET[c]).normalize('NFD').replace(/[\u0300-\u036f]/g, '');
const coll = s => s.replace(/(.)\1+/g, '$1');
function hitTok(t) { if (t.length < 3) return false; const c = coll(t);
  for (const s of SUF) { if (!c.endsWith(s)) continue; const r = c.slice(0, c.length - s.length); if (!ROOTS.has(r)) continue;
    if (NEEDS_DOUBLE.has(r) && !/(.)\1/.test(t.slice(0, t.length - s.length || undefined))) continue; return true; }
  return false; }
function hit(raw) { const toks = leet(String(raw || '')).split(/\s+/).map(t => t.replace(/[^a-z]/g, '')).filter(Boolean);
  if (toks.some(hitTok)) return true;
  for (let i = 0; i < toks.length; i++) { // spaced-out letters ("n i g ...") and split words ("ni gga")
    if (toks[i].length <= 2) { let j = i, s = ''; while (j < toks.length && toks[j].length <= 2) s += toks[j++]; if (j - i >= 3 && hitTok(s)) return true; }
    if (i + 1 < toks.length && ROOTS.has(coll(toks[i] + toks[i + 1])) && !NEEDS_DOUBLE.has(coll(toks[i] + toks[i + 1]))) return true; }
  return false; }
db.exec('CREATE TABLE IF NOT EXISTS hate_reports(id INTEGER PRIMARY KEY, kh TEXT, acct_mask TEXT, text_hash TEXT, len INTEGER, created INTEGER)');
const ins = db.prepare('INSERT INTO hate_reports(kh,acct_mask,text_hash,len,created) VALUES(?,?,?,?,?)'), cnt = db.prepare('SELECT COUNT(*) n FROM hate_reports WHERE kh=? AND created>?');
const list = db.prepare('SELECT r.id,r.acct_mask,r.text_hash,r.len,r.created,(SELECT COUNT(*) FROM hate_reports x WHERE x.kh=r.kh) total FROM hate_reports r ORDER BY r.id DESC LIMIT ?');
const SALT = process.env.HATE_SALT || 'bc-hate', H = s => crypto.createHash('sha256').update(SALT + s).digest('hex').slice(0, 16);
const mask = a => a ? (a.startsWith('ip:') ? 'ip:***' : a.slice(0, 4) + '…' + a.slice(-4)) : '?';
const mutes = new Map(), STRIKES = 3, WIN = 86400e3, MUTE = 3600e3;
function report(key, text) { const t = Date.now(), kh = H(key); ins.run(kh, mask(key), H(text), String(text).length, t);
  const n = cnt.get(kh, t - WIN).n; if (n >= STRIKES) mutes.set(key, t + MUTE); return n; }
const muted = key => (mutes.get(key) || 0) > Date.now();
const reports = (lim = 100) => list.all(Math.min(500, lim));
module.exports = { hit, report, muted, reports };
