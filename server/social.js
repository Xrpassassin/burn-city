// Burn City Social: profiles, feed (posts/replies/likes), follows, global + per-token chat.
// Identity = XAMAN-signed XRPL account (bearer token from payments.js). No passwords/emails stored.
// Persistent SQLite on the Fly volume (DATA_DIR/social.db). All user text is stored as plain text,
// stripped of control chars, length-limited, profanity-masked, and must be rendered with textContent.
const path = require('path'), { DatabaseSync } = require('node:sqlite'), C = require('./config');
const db = new DatabaseSync(path.join(C.DATA_DIR, 'social.db'));
db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=3000;
CREATE TABLE IF NOT EXISTS profiles(acct TEXT PRIMARY KEY, name TEXT, avatar TEXT DEFAULT 'flame', avatar_url TEXT, bio TEXT DEFAULT '', created INTEGER, last_seen INTEGER, banned INTEGER DEFAULT 0);
CREATE TABLE IF NOT EXISTS posts(id INTEGER PRIMARY KEY AUTOINCREMENT, acct TEXT, body TEXT, parent INTEGER, created INTEGER, hidden INTEGER DEFAULT 0);
CREATE INDEX IF NOT EXISTS posts_parent ON posts(parent, id);
CREATE INDEX IF NOT EXISTS posts_acct ON posts(acct, id);
CREATE TABLE IF NOT EXISTS likes(post INTEGER, acct TEXT, PRIMARY KEY(post, acct));
CREATE TABLE IF NOT EXISTS follows(follower TEXT, followee TEXT, created INTEGER, PRIMARY KEY(follower, followee));
CREATE TABLE IF NOT EXISTS chat(id INTEGER PRIMARY KEY AUTOINCREMENT, channel TEXT, acct TEXT, body TEXT, created INTEGER, hidden INTEGER DEFAULT 0);
CREATE INDEX IF NOT EXISTS chat_ch ON chat(channel, id);
CREATE TABLE IF NOT EXISTS reports(id INTEGER PRIMARY KEY AUTOINCREMENT, kind TEXT, target INTEGER, reporter TEXT, reason TEXT, created INTEGER, resolved INTEGER DEFAULT 0);`);

const LIM = { name: 24, bio: 280, post: 500, chat: 280, reason: 200 };
const PRESETS = ['flame', 'skull', 'bear', 'rocket', 'diamond', 'robot', 'zombie', 'cycle', 'crown', 'alien', 'dragon', 'bolt'];
const TOKENS = { BURN: 'rwgNTwrsZKPe7xYCy4emjFAYpgnuioHSkd', IMG: C.IMG_ISSUER };   // extra issuers via SOCIAL_TOKENS=CODE:issuer,...
for (const kv of (process.env.SOCIAL_TOKENS || '').split(',').filter(Boolean)) { const [k, v] = kv.split(':'); if (k && /^r[1-9A-HJ-NP-Za-km-z]{24,34}$/.test(v || '')) TOKENS[k.toUpperCase()] = v; }
const BAD = ['fuck', 'shit', 'cunt', 'bitch', 'nigger', 'nigga', 'faggot', 'fag', 'retard', 'whore', 'slut', 'dick', 'pussy', 'asshole', 'bastard', 'kike', 'spic', 'chink'];
const badRe = new RegExp('\\b(' + BAD.join('|') + ')(s|es|ed|ing|er|ers)?\\b', 'gi');
const ACCT = /^r[1-9A-HJ-NP-Za-km-z]{24,34}$/;

function clean(s, max) {
  if (typeof s !== 'string') return '';
  s = s.normalize('NFKC').replace(/[\u0000-\u0008\u000B-\u001F\u007F-\u009F\u200B-\u200F\u202A-\u202E\u2066-\u2069]/g, '').replace(/\n{3,}/g, '\n\n').replace(/</g, '‹').replace(/>/g, '›').trim();
  return [...s].slice(0, max).join('').replace(badRe, m => m[0] + '*'.repeat(m.length - 1));
}
const buckets = new Map();
function rate(key, n, ms) { const t = Date.now(), a = (buckets.get(key) || []).filter(x => t - x < ms); if (a.length >= n) return true; a.push(t); buckets.set(key, a); return false; }
setInterval(() => { const t = Date.now(); for (const [k, a] of buckets) if (!a.some(x => t - x < 600e3)) buckets.delete(k); }, 600e3).unref();

const q = s => db.prepare(s);
const st = {
  getP: q('SELECT * FROM profiles WHERE acct=?'),
  insP: q('INSERT OR IGNORE INTO profiles(acct,name,created,last_seen) VALUES(?,?,?,?)'),
  seen: q('UPDATE profiles SET last_seen=? WHERE acct=?'),
  updP: q('UPDATE profiles SET name=?, bio=?, avatar=?, avatar_url=? WHERE acct=?'),
  cnt: q(`SELECT (SELECT count(*) FROM follows WHERE followee=?) followers, (SELECT count(*) FROM follows WHERE follower=?) following, (SELECT count(*) FROM posts WHERE acct=? AND hidden=0) posts`),
};
function pub(p) { if (!p) return null; return { acct: p.acct, name: p.name, avatar: p.avatar, avatarUrl: p.avatar_url, bio: p.bio, created: p.created, banned: !!p.banned }; }
function ensure(acct) { const t = Date.now(); st.insP.run(acct, 'burner-' + acct.slice(1, 6), t, t); st.seen.run(t, acct); return st.getP.get(acct); }

const POSTSEL = `SELECT p.id,p.acct,p.body,p.parent,p.created, pr.name, pr.avatar, pr.avatar_url,
  (SELECT count(*) FROM likes l WHERE l.post=p.id) likes, (SELECT count(*) FROM posts r WHERE r.parent=p.id AND r.hidden=0) replies,
  EXISTS(SELECT 1 FROM likes l WHERE l.post=p.id AND l.acct=:me) liked
  FROM posts p JOIN profiles pr ON pr.acct=p.acct WHERE p.hidden=0 AND pr.banned=0`;
const rowPost = r => ({ id: r.id, acct: r.acct, name: r.name, avatar: r.avatar, avatarUrl: r.avatar_url, body: r.body, parent: r.parent, created: r.created, likes: r.likes, replies: r.replies, liked: !!r.liked });

// ---- read-only ledger badges (holdings + burns), cached 10 min ----
const badgeCache = new Map();
async function badges(acct, ledger) {
  const c = badgeCache.get(acct); if (c && Date.now() - c.t < 600e3) return c.v;
  const v = { holdings: [], burns: 0, burned: {} };
  try {
    const cl = await ledger(), issuers = Object.fromEntries(Object.entries(TOKENS).map(([k, i]) => [i, k]));
    const lines = (await cl.request({ command: 'account_lines', account: acct, limit: 400 })).result.lines;
    for (const l of lines) if (issuers[l.account] && +l.balance > 0) v.holdings.push({ token: issuers[l.account], balance: +(+l.balance).toPrecision(6) });
    const txs = (await cl.request({ command: 'account_tx', account: acct, limit: 200 })).result.transactions;
    for (const t of txs) { const tx = t.tx_json || t.tx, m = t.meta;
      if (tx?.TransactionType === 'Payment' && tx.Account === acct && issuers[tx.Destination] && m?.TransactionResult === 'tesSUCCESS' && typeof m.delivered_amount === 'object' && m.delivered_amount.issuer === tx.Destination) {
        const k = issuers[tx.Destination]; v.burns++; v.burned[k] = +((v.burned[k] || 0) + +m.delivered_amount.value).toPrecision(8); } }
  } catch (e) { v.error = 'ledger_unavailable'; }
  badgeCache.set(acct, { t: Date.now(), v }); return v;
}
async function nftAvatar(acct, id, ledger) {   // only NFTs the account actually holds
  if (!/^[0-9A-F]{64}$/i.test(id)) return null;
  const nfts = (await (await ledger()).request({ command: 'account_nfts', account: acct, limit: 400 })).result.account_nfts;
  const n = nfts.find(x => x.NFTokenID.toUpperCase() === id.toUpperCase()); if (!n || !n.URI) return null;
  let u = Buffer.from(n.URI, 'hex').toString('utf8').trim();
  if (u.startsWith('ipfs://')) u = 'https://ipfs.io/ipfs/' + u.slice(7).replace(/^ipfs\//, '');
  if (!/^https:\/\/[^\s"'<>]+$/.test(u) || u.length > 400) return null;
  if (/\.json(\?|$)/i.test(u) || !/\.(png|jpe?g|gif|webp|avif|svg)(\?|$)/i.test(u)) {   // metadata JSON -> image field
    try { const r = await fetch(u, { signal: AbortSignal.timeout(5000) }); const j = await r.json(); let im = String(j.image || j.image_url || '');
      if (im.startsWith('ipfs://')) im = 'https://ipfs.io/ipfs/' + im.slice(7).replace(/^ipfs\//, '');
      if (/^https:\/\/[^\s"'<>]+$/.test(im) && im.length <= 400) return im; } catch {}
    return null;
  }
  return u;
}
const channelOk = c => c === 'global' || (typeof c === 'string' && /^[A-Z0-9]{2,12}$/.test(c));

// ---- HTTP handler. Returns true if it handled the request. ----
async function handle(req, res, url, { json, body, who, ledger, signinReady }) {
  const p = url.pathname; if (!p.startsWith('/social/') && !p.startsWith('/admin/social')) return false;
  const M = req.method, ip = req.headers['fly-client-ip'] || req.socket.remoteAddress;
  if (rate('ip:' + ip, 180, 60e3)) return json(res, 429, { error: 'slow_down' }), true;
  const parts = p.split('/').filter(Boolean);   // ['social', ...]
  const me = () => { const u = who(); if (!u || !ACCT.test(u.acct)) return null; const pr = ensure(u.acct); return pr.banned ? { banned: true } : pr; };
  const need = () => { const u = me(); if (!u) { json(res, 401, { error: signinReady ? 'sign_in_with_xaman' : 'signin_coming_soon' }); return null; } if (u.banned) { json(res, 403, { error: 'banned' }); return null; } return u; };

  // admin moderation
  if (parts[0] === 'admin') {
    if (!C.ADMIN_TOKEN || req.headers['x-admin-token'] !== C.ADMIN_TOKEN) return json(res, 403, { error: 'forbidden' }), true;
    if (parts[2] === 'reports') return json(res, 200, { reports: q(`SELECT * FROM reports WHERE resolved=0 ORDER BY id DESC LIMIT 200`).all() }), true;
    if (M !== 'POST') return json(res, 405, { error: 'post' }), true;
    const b = await body();
    if (parts[2] === 'hide') { const tbl = b.kind === 'chat' ? 'chat' : 'posts'; q(`UPDATE ${tbl} SET hidden=? WHERE id=?`).run(b.hidden === false ? 0 : 1, +b.id | 0);
      q(`UPDATE reports SET resolved=1 WHERE kind=? AND target=?`).run(tbl === 'chat' ? 'chat' : 'post', +b.id | 0); return json(res, 200, { ok: true }), true; }
    if (parts[2] === 'ban') { if (!ACCT.test(b.acct || '')) return json(res, 400, { error: 'acct' }), true; ensure(b.acct);
      q(`UPDATE profiles SET banned=? WHERE acct=?`).run(b.banned === false ? 0 : 1, b.acct); return json(res, 200, { ok: true }), true; }
    if (parts[2] === 'resolve') { q(`UPDATE reports SET resolved=1 WHERE id=?`).run(+b.id | 0); return json(res, 200, { ok: true }), true; }
    return json(res, 404, { error: 'not_found' }), true;
  }

  const r = parts[1];
  if (r === 'status') return json(res, 200, { signin: signinReady, presets: PRESETS, tokens: Object.keys(TOKENS), limits: LIM }), true;
  if (r === 'me') { const u = need(); if (!u) return true; return json(res, 200, { profile: pub(u), ...st.cnt.get(u.acct, u.acct, u.acct) }), true; }
  if (r === 'profile' && M === 'POST') {
    const u = need(); if (!u) return true; if (rate('prof:' + u.acct, 10, 600e3)) return json(res, 429, { error: 'slow_down' }), true;
    const b = await body(); const Scam = require('./scam'), sn = Scam.scrub(clean(b.name ?? u.name, LIM.name).replace(/\n/g, ' ')), sb = Scam.scrub(clean(b.bio ?? u.bio, LIM.bio)); if (sn.blocked || sb.blocked || sn.reasons.length) return json(res, 400, { error: 'blocked_scam' }), true;
    const name = clean(sn.text, LIM.name) || u.name, bio = clean(sb.text, LIM.bio);
    let avatar = u.avatar, url2 = u.avatar_url;
    if (typeof b.avatar === 'string') {
      if (PRESETS.includes(b.avatar)) { avatar = b.avatar; url2 = null; }
      else if (b.avatar.startsWith('nft:')) { const im = await nftAvatar(u.acct, b.avatar.slice(4), ledger).catch(() => null); if (!im) return json(res, 400, { error: 'nft_not_owned_or_no_image' }), true; avatar = 'nft:' + b.avatar.slice(4).toUpperCase(); url2 = im; }
      else return json(res, 400, { error: 'bad_avatar' }), true;
    }
    st.updP.run(name, bio, avatar, url2, u.acct); return json(res, 200, { profile: pub(st.getP.get(u.acct)) }), true;
  }
  if (r === 'profile' && parts[2]) {
    const a = parts[2]; if (!ACCT.test(a)) return json(res, 400, { error: 'acct' }), true;
    const pr = st.getP.get(a); if (!pr || pr.banned) return json(res, 404, { error: 'not_found' }), true;
    const u = me(); const fol = u && !u.banned ? !!q('SELECT 1 FROM follows WHERE follower=? AND followee=?').get(u.acct, a) : false;
    return json(res, 200, { profile: pub(pr), ...st.cnt.get(a, a, a), isFollowing: fol, badges: await badges(a, ledger),
      posts: q(POSTSEL + ' AND p.acct=:a AND p.parent IS NULL ORDER BY p.id DESC LIMIT 30').all({ me: u?.acct || '', a }).map(rowPost) }), true;
  }
  if (r === 'feed') {
    const u = me(), before = +url.searchParams.get('before') || 9e15, fol = url.searchParams.get('following') === '1' && u && !u.banned;
    const rows = q(POSTSEL + ` AND p.parent IS NULL AND p.id < :before ${fol ? 'AND (p.acct IN (SELECT followee FROM follows WHERE follower=:me) OR p.acct=:me)' : ''} ORDER BY p.id DESC LIMIT 30`).all({ me: u?.acct || '', before });
    return json(res, 200, { posts: rows.map(rowPost) }), true;
  }
  if (r === 'post' && parts[2] && M === 'GET') {
    const u = me(), id = +parts[2] | 0, post = q(POSTSEL + ' AND p.id=:id').get({ me: u?.acct || '', id }); if (!post) return json(res, 404, { error: 'not_found' }), true;
    return json(res, 200, { post: rowPost(post), replies: q(POSTSEL + ' AND p.parent=:id ORDER BY p.id ASC LIMIT 200').all({ me: u?.acct || '', id }).map(rowPost) }), true;
  }
  if (r === 'post' && M === 'POST') {
    const u = need(); if (!u) return true; if (rate('post:' + u.acct, 5, 60e3) || rate('postd:' + u.acct, 100, 86400e3)) return json(res, 429, { error: 'slow_down' }), true;
    const Scam = require('./scam'); if (Scam.muted(u.acct)) return json(res, 429, { error: 'muted' }), true;
    const b = await body(), Hate = require('./hate'); if (Hate.muted(u.acct)) return json(res, 429, { error: 'muted' }), true; if (Hate.hit(clean(b.body, LIM.post))) { Hate.report(u.acct, clean(b.body, LIM.post)); return json(res, 400, { error: 'message_removed' }), true; } const sc = Scam.scrub(clean(b.body, LIM.post)); if (sc.reasons.length) Scam.strike(u.acct); if (sc.blocked) return json(res, 400, { error: 'blocked_scam' }), true;
    const text = clean(sc.text, LIM.post); if (!text) return json(res, 400, { error: 'empty' }), true;
    let parent = null; if (b.parent != null) { parent = +b.parent | 0; if (!q('SELECT 1 FROM posts WHERE id=? AND hidden=0').get(parent)) return json(res, 404, { error: 'parent_not_found' }), true; }
    const id = q('INSERT INTO posts(acct,body,parent,created) VALUES(?,?,?,?)').run(u.acct, text, parent, Date.now()).lastInsertRowid;
    return json(res, 200, { ok: true, id: Number(id) }), true;
  }
  if (r === 'like' && M === 'POST') {
    const u = need(); if (!u) return true; if (rate('like:' + u.acct, 60, 60e3)) return json(res, 429, { error: 'slow_down' }), true;
    const b = await body(), id = +b.id | 0; if (!q('SELECT 1 FROM posts WHERE id=? AND hidden=0').get(id)) return json(res, 404, { error: 'not_found' }), true;
    if (b.on === false) q('DELETE FROM likes WHERE post=? AND acct=?').run(id, u.acct); else q('INSERT OR IGNORE INTO likes VALUES(?,?)').run(id, u.acct);
    return json(res, 200, { ok: true, likes: q('SELECT count(*) n FROM likes WHERE post=?').get(id).n }), true;
  }
  if (r === 'follow' && M === 'POST') {
    const u = need(); if (!u) return true; if (rate('fol:' + u.acct, 30, 60e3)) return json(res, 429, { error: 'slow_down' }), true;
    const b = await body(); if (!ACCT.test(b.acct || '') || b.acct === u.acct) return json(res, 400, { error: 'acct' }), true;
    if (b.on === false) q('DELETE FROM follows WHERE follower=? AND followee=?').run(u.acct, b.acct);
    else { if (!st.getP.get(b.acct)) return json(res, 404, { error: 'not_found' }), true; q('INSERT OR IGNORE INTO follows VALUES(?,?,?)').run(u.acct, b.acct, Date.now()); }
    return json(res, 200, { ok: true }), true;
  }
  if (r === 'chat' && parts[2]) {
    const ch = parts[2] === 'global' ? 'global' : parts[2].toUpperCase(); if (!channelOk(ch)) return json(res, 400, { error: 'channel' }), true;
    if (M === 'GET') { const after = +url.searchParams.get('after') || 0;
      const rows = q(`SELECT c.id,c.acct,c.body,c.created,pr.name,pr.avatar,pr.avatar_url FROM chat c JOIN profiles pr ON pr.acct=c.acct WHERE c.channel=? AND c.id>? AND c.hidden=0 AND pr.banned=0 ORDER BY c.id DESC LIMIT 60`).all(ch, after).reverse();
      return json(res, 200, { channel: ch, messages: rows.map(m => ({ id: m.id, acct: m.acct, name: m.name, avatar: m.avatar, avatarUrl: m.avatar_url, body: m.body, created: m.created })) }), true; }
    const u = need(); if (!u) return true; if (rate('chat:' + u.acct, 8, 30e3)) return json(res, 429, { error: 'slow_down' }), true;
    const Scam = require('./scam'); if (Scam.muted(u.acct)) return json(res, 429, { error: 'muted' }), true;
    const cb = (await body()).body, Hate = require('./hate'); if (Hate.muted(u.acct)) return json(res, 429, { error: 'muted' }), true; if (Hate.hit(clean(cb, LIM.chat))) { Hate.report(u.acct, clean(cb, LIM.chat)); return json(res, 400, { error: 'message_removed' }), true; } const sc = Scam.scrub(clean(cb, LIM.chat).replace(/\n/g, ' ')); if (sc.reasons.length) Scam.strike(u.acct); if (sc.blocked) return json(res, 400, { error: 'blocked_scam' }), true;
    const text = clean(sc.text, LIM.chat); if (!text) return json(res, 400, { error: 'empty' }), true;
    const id = q('INSERT INTO chat(channel,acct,body,created) VALUES(?,?,?,?)').run(ch, u.acct, text, Date.now()).lastInsertRowid;
    return json(res, 200, { ok: true, id: Number(id) }), true;
  }
  if (r === 'report' && M === 'POST') {
    const u = need(); if (!u) return true; if (rate('rep:' + u.acct, 10, 3600e3)) return json(res, 429, { error: 'slow_down' }), true;
    const b = await body(), kind = b.kind === 'chat' ? 'chat' : b.kind === 'user' ? 'user' : 'post';
    q('INSERT INTO reports(kind,target,reporter,reason,created) VALUES(?,?,?,?,?)').run(kind, kind === 'user' ? 0 : +b.id | 0, u.acct, clean(String(b.reason || '') + (kind === 'user' ? ' [' + String(b.acct || '').slice(0, 35) + ']' : ''), LIM.reason), Date.now());
    return json(res, 200, { ok: true }), true;
  }
  return json(res, 404, { error: 'not_found' }), true;
}
module.exports = { handle, clean, db };
