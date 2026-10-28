// Burn City "city" presence + chat channel (WebSocket ?mode=city). Separate from the game rooms.
// Presence: clients send {t:'p',x,y,z,r} (<=5/s accepted); server broadcasts one compact snapshot at 3 Hz, only when something changed.
// Chat: signed-in (XAMAN) accounts only, stored in the social SQLite (channel 'CITY'), same clean()/profanity mask,
// same rate limit as social chat (8 / 30 s), bans + admin hide honoured (admin hide/ban go through /admin/social/*).
const Fish = require('./fish'), Pay = require('./payments'), { db, clean } = require('./social'), Nft = require('./nft'), Scam = require('./scam'), Hate = require('./hate'), Flair = require('./flair'), Eco = require('./eco');
Flair.init({ rpc: Eco.rpc, pools: () => (Eco.data() || {}).pools || [] });
const MAX = 60, CH = 'CITY', OWNER = process.env.OWNER_ACCT || Buffer.from('ck5iUjRHdzlkOUpSTGRrYjRyQWhrV0RjSnlLUmszOUZvQQ==', 'base64').toString();
// Jetpack allowlist; compared server-side only. Decoded entries: OWNER (Derrik), rpUaH8G4H1o1np8YBDHZMHGYJwyoR6EgST =
// BURN (Derrik's dad, personal wallet; exemption only, not a burn address), rDtUEMFVDi3K7TUQAQLi6xxa1WCer84dcA = Gnasty.
const JETSET = new Set([OWNER, ...['cnBVYUg4RzRIMW8xbnA4WUJESFpNSEdZSnd5b1I2RWdTVA==', 'ckR0VUVNRlZEaTNLN1RVUUFRTGk2eHhhMVdDZXI4NGRjQQ=='].map(x => Buffer.from(x, 'base64').toString())]);   // jetpack allowlist; compared server-side only
// Plus the env exemption list (JETPACK_FREE_CITY) and paid city-jetpack grants (server/jetpack.js).
const hasJet = a => !!(a && (JETSET.has(a) || require('./jetpack').ownsCity(a)));
const q = s => db.prepare(s);
const st = {
  getP: q('SELECT name, banned, created FROM profiles WHERE acct=?'),
  insP: q('INSERT OR IGNORE INTO profiles(acct,name,created,last_seen) VALUES(?,?,?,?)'),
  seen: q('UPDATE profiles SET last_seen=? WHERE acct=?'),
  ins: q('INSERT INTO chat(channel,acct,body,created) VALUES(?,?,?,?)'),
  recent: q(`SELECT c.id,c.acct,c.body,c.created,pr.name FROM chat c JOIN profiles pr ON pr.acct=c.acct WHERE c.channel=? AND c.hidden=0 AND pr.banned=0 ORDER BY c.id DESC LIMIT 30`),
};
const clients = new Map(); let seq = 1, dirty = false;
const buckets = new Map();
function rate(key, n, ms) { const t = Date.now(), a = (buckets.get(key) || []).filter(x => t - x < ms); if (a.length >= n) return true; a.push(t); buckets.set(key, a); return false; }
setInterval(() => { const t = Date.now(); for (const [k, a] of buckets) if (!a.some(x => t - x < 600e3)) buckets.delete(k); }, 600e3).unref();
const ADJ = ['Ember', 'Neon', 'Ash', 'Blaze', 'Cinder', 'Volt', 'Frost', 'Nova', 'Pyro', 'Spark'], NOUN = ['Fox', 'Runner', 'Owl', 'Wolf', 'Drifter', 'Moth', 'Hawk', 'Lynx'];
const num = v => (typeof v === 'number' && isFinite(v)) ? Math.max(-2000, Math.min(2000, Math.round(v * 10) / 10)) : 0;
const send = (ws, o) => { if (ws.readyState === 1 && ws.bufferedAmount < 64e3) ws.send(typeof o === 'string' ? o : JSON.stringify(o)); };
const bcast = o => { const s = JSON.stringify(o); for (const c of clients.values()) send(c.ws, s); };

function attach(ws, url, pass, ip) {
  if (clients.size >= MAX || [...clients.values()].filter(c => c.ip === ip).length >= 6) { send(ws, { t: 'e', e: 'city_full' }); return ws.close(); }
  const id = seq++; let acct = null, name, og = false;
  if (pass && /^r[1-9A-HJ-NP-Za-km-z]{24,34}$/.test(pass.acct)) {
    const t = Date.now(); st.insP.run(pass.acct, 'burner-' + pass.acct.slice(1, 6), t, t); st.seen.run(t, pass.acct);
    const p = st.getP.get(pass.acct); if (!p.banned) { acct = pass.acct; name = p.name; og = Flair.isOg(p.created); }
  }
  if (!acct) name = ADJ[(Math.random() * ADJ.length) | 0] + NOUN[(Math.random() * NOUN.length) | 0] + '-' + (100 + ((Math.random() * 900) | 0));
  const c = { id, ws, ip, acct, name, og, fl: 0, guest: !acct, x: 0, y: 0, z: 0, r: 0, seen: false, win: Date.now(), msgs: 0 };
  clients.set(id, c); dirty = true;
  if (acct) c.fl = Flair.tier(acct, v => { c.fl = v; dirty = true; });
  c.nft = acct ? Nft.charFor(acct) : null; if (c.nft) bcast({ t: 'n', m: { [id]: c.nft } });
  // Reconnect/join: refresh the ledger proof if it is stale, then publish only the server-verified result.
  const reverify = () => Nft.verify(acct).then(n => { if (clients.get(id) !== c) return; if ((n?.id || null) !== (c.nft?.id || null)) { c.nft = n; bcast({ t: 'n', m: { [id]: n } }); } }).catch(() => {});
  if (acct) reverify();
  { const all = {}; for (const o of clients.values()) if (o.nft) all[o.id] = o.nft; if (Object.keys(all).length) send(ws, { t: 'n', m: all }); }
  send(ws, { t: 'w', id, name, guest: c.guest, canChat: !!acct, jet: hasJet(acct), msgs: st.recent.all(CH).reverse().map(m => ({ id: m.id, acct: m.acct, name: m.name, b: m.body, ts: m.created })) });
  ws.on('message', d => {
    const n = Date.now(); if (n - c.win > 1000) { c.win = n; c.msgs = 0; } if (++c.msgs > 6) return;
    let m; try { m = JSON.parse(d); } catch { return; } if (!m || typeof m !== 'object') return;
    if (m.t === 'p') { c.x = num(m.x); c.y = num(m.y); c.z = num(m.z); c.r = Math.round((+m.r || 0) * 100) / 100; c.b = m.b ? 1 : 0; c.bt = Fish.BOATS.some(v => v.id === m.bt) ? m.bt : 'skiff'; if (c.acct && c.bt !== 'skiff') { if (!c.btOk || c.btOk.id !== c.bt || n - c.btOk.t > 30e3) { let own = false; try { own = Fish.get(c.acct).boats.includes(c.bt); } catch (e) { } c.btOk = { id: c.bt, t: n, ok: own }; } if (!c.btOk.ok) c.bt = 'skiff'; }   /* signed-in: only show a boat class the server says this wallet owns */ c.md = ['w', 'f', 'b'].includes(m.md) ? m.md : 'f'; c.j = (hasJet(acct) && m.j) ? 1 : 0; if (m.k && c.k === undefined) { try { c.k = !!(c.acct && Pay.owned(c.acct).includes('drone_burncoin')); } catch (e) { c.k = false; } } else if (!m.k) c.k = undefined; c.seen = true; dirty = true; }
    else if (m.t === 'fs') {   // fishing pose others can see: 0 off | 1 waiting | 2 bite | 3 reeling, bobber spot, rod look
      if (rate('fs:' + c.id, 12, 10e3)) return; const s = [0, 1, 2, 3].includes(m.s) ? m.s : 0; c.fs = s ? [s, num(m.x), num(m.z), Math.max(0, Math.min(3, m.rd | 0))] : 0; dirty = true; }
    else if (m.t === 'fc') {   // a catch: signed-in players show the server-landed fish; guests a generic one
      if (rate('fc:' + c.id, 1, 4e3)) return; let f = null;
      if (c.acct) { const L = Fish.lastLanded(c.acct); if (!L || Date.now() - L.t > 15e3 || L.shown) return; L.shown = 1; f = { sp: L.id, kg: L.kg, r: L.r }; }
      else f = { sp: 'minnow', kg: 0.2, r: 0 };
      const s = JSON.stringify({ t: 'fc', pid: id, ...f }); for (const o of clients.values()) if (o.id !== id) send(o.ws, s); }
    else if (m.t === 'ab') {   // AEGIS Response Ops relay: a beacon hold heartbeat (h) or stabilization (s); cosmetic only, no rewards server-side
      if (rate('ab:' + c.id, 14, 10e3) || typeof m.k !== 'string' || !/^w\d{1,10}-[0-2]$/.test(m.k)) return;
      const s = JSON.stringify({ t: 'ab', pid: id, name: c.name, k: m.k, h: m.h ? 1 : 0, s: m.s ? 1 : 0 }); for (const o of clients.values()) if (o.id !== id) send(o.ws, s); }
    else if (m.t === 'nft') { if (!c.acct || rate('nft:' + c.id, 4, 60e3)) return; c.nft = Nft.charFor(c.acct); bcast({ t: 'n', m: { [id]: c.nft } }); reverify(); }   // any client-sent id is ignored: the server looks up its own verified selection
    else if (m.t === 'c') {
      if (!c.acct) return send(ws, { t: 'e', e: 'sign_in_with_xaman' });
      const p = st.getP.get(c.acct); if (!p || p.banned) return send(ws, { t: 'e', e: 'banned' });
      if (rate('chat:' + c.acct, 8, 30e3)) return send(ws, { t: 'e', e: 'slow_down' });
      if (Scam.muted(c.acct) || Scam.muted('ip:' + c.ip)) return send(ws, { t: 'e', e: 'muted' });
      if (rate('chatip:' + c.ip, 12, 30e3)) return send(ws, { t: 'e', e: 'slow_down' });
      if (Hate.muted(c.acct)) return send(ws, { t: 'e', e: 'muted' });
      if (Hate.hit(clean(m.b, 280))) { Hate.report(c.acct, clean(m.b, 280)); return send(ws, { t: 'e', e: 'message_removed' }); }
      const sc = Scam.scrub(clean(m.b, 280).replace(/\n/g, ' ')); if (sc.reasons.length) { Scam.strike(c.acct); Scam.strike('ip:' + c.ip); }
      if (sc.blocked) return send(ws, { t: 'e', e: 'blocked_scam' });
      const text = clean(sc.text, 280); if (!text) return;
      const mid = Number(st.ins.run(CH, c.acct, text, n).lastInsertRowid);
      bcast({ t: 'c', id: mid, pid: id, acct: c.acct, name: p.name, b: text, ts: n });
    }
  });
  ws.on('close', () => { clients.delete(id); dirty = true; });
}
setInterval(() => {
  if (!dirty) return; dirty = false;
  const p = [...clients.values()].filter(c => c.seen).map(c => [c.id, c.name, c.guest ? 1 : 0, c.x, c.y, c.z, c.r, c.b ? 1 : 0, c.k ? 1 : 0, c.md || 'f', c.j ? 1 : 0, c.fs || 0, (c.fl || 0) | (c.og ? 4 : 0), c.bt || 'skiff']);
  bcast({ t: 's', n: clients.size, p });
}, 333).unref();
setInterval(() => { for (const c of clients.values()) if (c.acct) { const v = Flair.tier(c.acct, t => { c.fl = t; dirty = true; }); if (v !== c.fl) { c.fl = v; dirty = true; } } }, 120e3).unref();   // holder flair re-check (cache 10 min)
setInterval(() => { const m = {}; let any = false; for (const c of clients.values()) if (c.acct) { const n = Nft.charFor(c.acct); if ((n?.id || null) !== (c.nft?.id || null)) { c.nft = n; m[c.id] = n; any = true; } } if (any) bcast({ t: 'n', m }); }, 60e3).unref();   // drop transferred characters live
module.exports = { attach, count: () => clients.size };
