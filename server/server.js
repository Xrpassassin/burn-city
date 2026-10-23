// Burn City game server: HTTP (session/payment API, health, public burn log) + WebSocket game rooms.
const http = require('http'), fs = require('fs'), path = require('path'), { WebSocketServer } = require('ws');
const Retain = require('./retain'), Fish = require('./fish'), LB = require('./leaderboard'), Ranked = require('./ranked'), { items } = require('./shop');
const Nft = require('./nft'), Social = require('./social'), C = require('./config'), Pay = require('./payments'), { Room } = require('./game'), S = require('./store'), City = require('./city'), Eco = require('./eco');

const AegisClips = require('./aegis-clips'), Cams = require('./cams');
const BT = require('./blacktide'), Homefront = require('./homefront'), FlightLobby = require('./flight-lobby');
const AmmLock = require('./amm-lock');   // verified AMM LP locks + black-hole supply (/api/amm-lock)   // Blacktide pirate region: gold doubloons + cargo trade (/api/bt/*)
const rooms = { tron: [], zombie: [] }; let roomSeq = 1;
const stats = { tickMs: [], bytesOut: 0, started: Date.now() };
const resumeIdx = new Map();   // free-play zombie reconnect: resume key -> { p, room } (25s grace after a dropped socket)
function findRoom(mode, ranked, daily, mapId = null, arrivalSpawn = false, flight = null) {   // ranked = match id; flight = airport departure token (one room per flight)
  if (daily && mode === 'zombie') { const d = Retain.daily(); let r = rooms.zombie.find(x => x.daily?.day === d.day && !x.full); if (!r) { r = new Room(roomSeq++, 'zombie'); r.daily = d; r.mod = d.mod; r.rng = Retain.rng(d.seed); r.onLife = x => Retain.recordDaily({ ...x, day: d.day }); rooms.zombie.push(r); } return r; }
  if (ranked) { let r = rooms.zombie.find(x => x.ranked?.id === ranked); if (r && r.full) return null; if (!r) { r = new Room(roomSeq++, 'zombie');
    r.ranked = { state: 'lobby', countdown: null, max: Ranked.R.MAX, min: Ranked.R.MIN, cap: 20 * 60, results: new Map(), id: ranked, opened: r.t }; rooms.zombie.push(r); } return r; }
  const wantedMap = mode === 'zombie' && mapId === 'refinery' ? 'refinery' : null;
  const flightId = mode === 'zombie' && arrivalSpawn && typeof flight === 'string' && /^flight-\d{1,9}-[0-9a-f]{8}$/.test(flight) ? flight : null;
  let r = rooms[mode].find(r => !r.ranked && !r.tl && !r.daily && !r.full && (r.mapId || null) === wantedMap && !!r.arrivalSpawn === !!arrivalSpawn && (r.flightId || null) === flightId);
  if (!r) { r = new Room(roomSeq++, mode, wantedMap); r.arrivalSpawn = !!arrivalSpawn; if (flightId) r.flightId = flightId; rooms[mode].push(r); r.onLife = LB.record; }
  return r; }

const adminFails = new Map();
function adminOk(req, ip) {   // constant-time compare, header only, 10 bad tries / 15 min per IP lock out
  const f = adminFails.get(ip) || { n: 0, t: Date.now() }; if (Date.now() - f.t > 15 * 60e3) { f.n = 0; f.t = Date.now(); } if (f.n >= 10) return false;
  const a = Buffer.from(String(req.headers['x-admin-token'] || '')), b = Buffer.from(C.ADMIN_TOKEN || '');
  const ok = !!C.ADMIN_TOKEN && a.length === b.length && require('crypto').timingSafeEqual(a, b); if (!ok) { f.n++; adminFails.set(ip, f); } return ok;
}
const ORIGINS = /^(?:https:\/\/xrpassassin\.github\.io|https:\/\/burn-city-game\.fly\.dev|https?:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?)$/;
const okOrigin = o => !o || ORIGINS.test(o);
const SEC = { 'strict-transport-security': 'max-age=31536000; includeSubDomains', 'x-frame-options': 'DENY', 'referrer-policy': 'no-referrer', 'content-security-policy': "default-src 'none'; frame-ancestors 'none'", vary: 'Origin' };
const json = (res, code, o) => { const og = res.req?.headers?.origin; res.writeHead(code, { ...SEC, 'content-type': 'application/json', 'access-control-allow-origin': og && ORIGINS.test(og) ? og : 'https://xrpassassin.github.io', 'access-control-allow-headers': 'content-type, authorization', 'access-control-allow-methods': 'GET, POST, OPTIONS', 'x-content-type-options': 'nosniff', 'cache-control': 'no-store' }); res.end(JSON.stringify(o)); };
const gates = new Map();   // sliding-window limiter shared by HTTP + WS
function gate(k, n, ms) { const t = Date.now(), a = (gates.get(k) || []).filter(x => t - x < ms); a.push(t); gates.set(k, a); return a.length > n; }
setInterval(() => { const t = Date.now(); for (const [k, a] of gates) if (!a.some(x => t - x < 600e3)) gates.delete(k); for (const [k, a] of hits) if (!a.some(x => t - x < 120e3)) hits.delete(k); }, 300e3).unref();
const hits = new Map();   // naive per-IP rate limit for the API
function limited(ip) { const n = Date.now(), h = hits.get(ip) || []; const r = h.filter(t => n - t < 60e3); r.push(n); hits.set(ip, r); return r.length > 30; }

function serveStatic(req, res, url) {   // static site files: served before the API rate limits (a page load pulls ~100 modules)
  if (req.method !== 'GET' && req.method !== 'HEAD') return false; if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/admin/')) return false;
  if (url.pathname === '/data.js' && Eco.serve(req, res)) return true;
  try {
    // serve the demo client for local testing
    let f = path.join(__dirname, '..', 'client', decodeURIComponent(url.pathname).slice(1));
    if (f.startsWith(path.join(__dirname, '..', 'client')) && fs.existsSync(f) && fs.statSync(f).isDirectory()) { if (!url.pathname.endsWith('/')) { res.writeHead(301, { location: url.pathname + '/' + url.search }); res.end(); return true; } f = path.join(f, 'index.html'); }
    if (f.startsWith(path.join(__dirname, '..', 'client')) && fs.existsSync(f) && fs.statSync(f).isFile()) {
      const MIME = { '.js': 'text/javascript', '.mjs': 'text/javascript', '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.mp3': 'audio/mpeg', '.m4a': 'audio/mp4', '.ogg': 'audio/ogg', '.wav': 'audio/wav', '.glb': 'model/gltf-binary', '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8' };
      // app code/html/css/json always revalidate (ETag -> cheap 304) so a deploy reaches every player on their next load; vendor libs, images and audio cache for a day
      const st = fs.statSync(f), etag = `W/"${st.size.toString(36)}-${Math.floor(st.mtimeMs).toString(36)}"`, ext = path.extname(f).toLowerCase(), fresh = /\/vendor\//.test(f) || /^\.(png|jpe?g|webp|gif|svg|ico|mp3|m4a|ogg|woff2?)$/.test(ext);
      const hdr = { 'content-type': MIME[ext] || 'application/octet-stream', 'cache-control': fresh ? 'public, max-age=86400' : 'no-cache', etag };
      if (req.headers['if-none-match'] === etag) { res.writeHead(304, hdr); res.end(); return true; }
      // byte ranges for audio/video: iOS Safari will not play an <audio> source that can't seek by range
      const rg = /^\.(mp3|m4a|ogg|wav|mp4)$/.test(ext) && /^bytes=(\d*)-(\d*)$/.exec(req.headers.range || ''); if (/^\.(mp3|m4a|ogg|wav|mp4)$/.test(ext)) hdr['accept-ranges'] = 'bytes';
      if (rg && (rg[1] || rg[2])) { let a = rg[1] ? +rg[1] : Math.max(0, st.size - +rg[2]), b = rg[1] && rg[2] ? Math.min(+rg[2], st.size - 1) : st.size - 1;
        if (a >= st.size || a > b) { res.writeHead(416, { ...hdr, 'content-range': `bytes */${st.size}` }); res.end(); return true; }
        res.writeHead(206, { ...hdr, 'content-range': `bytes ${a}-${b}/${st.size}`, 'content-length': b - a + 1 }); if (req.method === 'HEAD') { res.end(); return true; } fs.createReadStream(f, { start: a, end: b }).pipe(res); return true; }
      hdr['content-length'] = st.size; res.writeHead(200, hdr); if (req.method === 'HEAD') { res.end(); return true; } fs.createReadStream(f).pipe(res); return true;
    }
  } catch { }
  return false;
}
const server = http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') return json(res, 204, {});
  const url = new URL(req.url, 'http://x'), ip = req.headers['fly-client-ip'] || req.socket.remoteAddress;
  if (url.pathname.startsWith('/aegis/') && (req.method === 'GET' || req.method === 'HEAD') && AegisClips.handle(req, res, url)) return;   // AEGIS preview clips (AEGIS_CLIPS=1 only; otherwise reports disabled)
  if (serveStatic(req, res, url)) return;
  if (gate('http:' + ip, 300, 60e3)) return json(res, 429, { error: 'slow_down' });
  try {
    if (url.pathname === '/api/history') { if (gate('hist:' + ip, 20, 60e3)) return json(res, 429, { error: 'slow_down' });
      const u = Pay.checkToken((req.headers.authorization || '').replace(/^Bearer /, '')), a = String(url.searchParams.get('acct') || u?.acct || '');
      return json(res, 200, { ...require('./history').forAcct(a, { before: url.searchParams.get('before'), limit: +url.searchParams.get('limit') || 25 }), mine: !!u && u.acct === a }); }
    if (url.pathname === '/health') return json(res, 200, { ok: true, rooms: Object.values(rooms).flat().length, players: Object.values(rooms).flat().reduce((a, r) => a + r.players.size, 0) });
    if (url.pathname === '/burns') {    // public transparency log of every burn batch
      let lines = []; try { lines = fs.readFileSync(S.file('burns.jsonl'), 'utf8').trim().split('\n').filter(Boolean).map(JSON.parse); } catch {}
      return json(res, 200, { dryRun: C.DRY_RUN, owedDrops: S.load('burn_owed.json', { drops: 0 }).drops, burns: lines.slice(-200) });
    }
    if (url.pathname === '/stats') { const a = [...stats.tickMs].sort((x, y) => x - y);
      return json(res, 200, { tickAvgMs: a.reduce((x, y) => x + y, 0) / (a.length || 1), tickP99Ms: a[Math.floor(a.length * 0.99)] || 0, tickMaxMs: a.at(-1) || 0, bytesOut: stats.bytesOut, upS: (Date.now() - stats.started) / 1e3, mem: process.memoryUsage().rss }); }
    const body = async () => { let b = ''; for await (const c of req) { b += c; if (b.length > 8000) throw new Error('big'); } try { const o = JSON.parse(b || '{}'); return o && typeof o === 'object' ? o : {}; } catch { return {}; } };
    const who = () => Pay.checkToken((req.headers.authorization || '').replace(/^Bearer /, ''));
    if (url.pathname === '/api/homefront' || url.pathname === '/api/homefront/action' || url.pathname === '/api/homefront/visit' || url.pathname === '/api/homefront/world' || url.pathname.startsWith('/api/homefront/world/')) { if (await Homefront.handle(req, res, url, { json, gate, ip, body, who })) return; }
    if (url.pathname.startsWith('/api/cams') && await Cams.handle(req, res, url, { json, gate, ip, body })) return;
    if (url.pathname.startsWith('/api/bt/') && await BT.handle(req, res, url, { json, gate, ip, body, who })) return;   // Blacktide trade/progression (server/blacktide.js)   // AEGIS Pyramid live cams + per-stream comments (server/cams.js)
    if (url.pathname === '/api/eco/live') { if (Eco.serveLive(req, res)) return; return json(res, 503, { error: 'warming_up' }); }
    if (url.pathname === '/api/eco') return json(res, 200, Eco.status());
    if (url.pathname === '/api/amm-lock' && AmmLock.handle(req, res, url, { json })) return;
    if (url.pathname === '/api/status') return json(res, 200, { signin: !!C.XUMM_KEY, shop: !!(C.XUMM_KEY && C.TREASURY), dryRun: C.DRY_RUN, social: true, ranked: Ranked.status(), payoutsPaused: require('./guard').paused() });
    if (url.pathname.startsWith('/nftimg/')) { if (Nft.image(req, res, url.pathname)) return; }
    // PYRETHEUM (BURN Tower interior) private floor: server-side gate. Allowlist comes only from the MIDNIGHTBLUFF_WALLETS env/Fly secret
    // (comma-separated r-addresses) and is never sent to the browser. Empty/unset = locked for everyone.
    if (url.pathname === '/api/tower/residence') { const u = who(); if (!u) return json(res, 401, { error: 'sign_in_with_xaman' }); if (limited(ip)) return json(res, 429, { error: 'slow_down' });
      return json(res, 503, { error: 'not_available_yet', residences: [] }); }   // Pyretheum private residences: NFT ownership check not built yet (client shows a clean message)
    if (url.pathname === '/api/tower/midnightbluff') { const u = who(); if (!u) return json(res, 401, { allowed: false, error: 'sign_in_with_xaman' }); if (limited(ip)) return json(res, 429, { allowed: false, error: 'slow_down' });
      const allow = new Set(String(process.env.MIDNIGHTBLUFF_WALLETS || '').split(/[\s,]+/).filter(a => /^r[1-9A-HJ-NP-Za-km-z]{24,34}$/.test(a)));
      return json(res, 200, { allowed: allow.has(u.acct) }); }
    if (url.pathname === '/api/nft/mine') { const u = who(); if (!u) return json(res, 401, { error: 'sign_in_with_xaman' }); if (limited(ip)) return json(res, 429, { error: 'slow_down' });
      try { return json(res, 200, await Nft.mine(u.acct, Nft.mainLedger)); } catch (e) { console.error('nft mine', e.message); return json(res, 200, { error: 'ledger_unavailable', nfts: [] }); } }
    if (url.pathname === '/api/nft/select' && req.method === 'POST') { const u = who(); if (!u) return json(res, 401, { error: 'sign_in_with_xaman' }); if (limited(ip)) return json(res, 429, { error: 'slow_down' });
      try { return json(res, 200, await Nft.select(u.acct, (await body()).id ?? null, Nft.mainLedger)); } catch (e) { console.error('nft select', e.message); return json(res, 200, { error: 'ledger_unavailable' }); } }
    if (await Social.handle(req, res, url, { json, body, who, ledger: Pay.ledger, signinReady: !!C.XUMM_KEY })) return;
    if (limited(ip)) return json(res, 429, { error: 'slow_down' });
    if (url.pathname === '/api/shop') { const u = who(); return json(res, 200, { items: Object.entries(items).filter(([, i]) => !i.reward).map(([id, i]) => ({ id, ...i, xrp: i.drops / 1e6 })), rewards: Object.entries(items).filter(([, i]) => i.reward).map(([id, i]) => ({ id, ...i })), owned: u ? Pay.owned(u.acct) : [], burnShare: C.BURN_SHARE, cosmeticOnly: true, available: !!(C.XUMM_KEY && C.TREASURY), note: (C.XUMM_KEY && C.TREASURY) ? null : 'coming_soon' }); }
    if (url.pathname === '/api/tron/lobbies') return json(res, 200, { lobbies: rooms.tron.filter(x => x.tl && !x.tl.ranked && x.tl.state === 'lobby' && x.players.size).map(x => ({ id: x.tl.id, cfg: x.tl.cfg, players: x.players.size, teams: x.tl.cfg.teams ? Array.from({ length: x.tl.cfg.teams }, (_, i) => [...x.players.values()].filter(p => p.team === i + 1).length) : null })) });
    if (url.pathname === '/api/ranked') { const here = {}; for (const x of rooms.zombie) if (x.ranked?.state === 'lobby') here[x.ranked.id] = x.players.size; for (const x of rooms.tron) if (x.tl?.ranked && x.tl.state === 'lobby') here[x.tl.id] = x.players.size; return json(res, 200, Ranked.publicInfo(here)); }
    if (url.pathname === '/api/ranked/enter' && req.method === 'POST') {
      const u = who(); if (!u) return json(res, 401, { error: 'sign_in_with_xaman' });
      const q = await body(), e = Ranked.enter(u.acct, { create: !!q.create, buyinXrp: q.buyinXrp, match: String(q.match || ''), game: q.game, cfg: q.cfg }); if (e.error) return json(res, 200, e);
      let xaman = null; try { xaman = await Ranked.xamanPayload(e.sid, () => { const { XummSdk } = require('xumm-sdk'); return new XummSdk(C.XUMM_KEY, C.XUMM_SECRET); }); } catch (er) { console.error('xaman', er.message); }
      return json(res, 200, { ...e, xaman });
    }
    if (url.pathname === '/api/ranked/verify' && req.method === 'POST') { const u = who(); if (!u) return json(res, 401, { error: 'sign_in_with_xaman' });
      return json(res, 200, await Ranked.verify((await body()).sid, Pay.ledger, xsdk, u.acct)); }
    if (url.pathname === '/api/ranked/payout') return json(res, 200, Ranked.payoutStatus(String(url.searchParams.get('match') || '')));
    if (url.pathname === '/api/ranked/mine') { const u = who(); if (!u) return json(res, 401, { error: 'sign_in_with_xaman' }); return json(res, 200, { payouts: Ranked.Q.forAcct(u.acct) }); }
    if (url.pathname === '/admin/chat/reports' && req.method === 'GET') { if (!adminOk(req, ip)) return json(res, 403, { error: 'forbidden' }); return json(res, 200, { reports: require('./hate').reports(+url.searchParams.get('n') || 100) }); }
    if (url.pathname === '/admin/unpause' && req.method === 'POST') { if (!adminOk(req, ip)) return json(res, 403, { error: 'forbidden' }); return json(res, 200, require('./watch').unpause()); }
    if (url.pathname.startsWith('/admin/ranked')) {   // manual approval only
      if (!adminOk(req, ip)) return json(res, 403, { error: 'forbidden' });
      if (url.pathname === '/admin/ranked/matches') return json(res, 200, Ranked.adminMatches());
      const b = req.method === 'POST' ? await body() : {};
      if (url.pathname === '/admin/ranked/review' && req.method === 'POST') return json(res, 200, Ranked.review(String(b.match || ''), String(b.acct || ''), !!b.accept));
      if (url.pathname === '/admin/ranked/approve' && req.method === 'POST') return json(res, 200, await Ranked.approve(String(b.match || '')));
      if (url.pathname === '/admin/ranked/refunded' && req.method === 'POST') return json(res, 200, Ranked.markRefunded(String(b.ticket || '')));
    }
    if (url.pathname === '/api/fish/top') { if (gate('fishtop:' + (req.headers['fly-client-ip'] || req.socket.remoteAddress), 30, 60e3)) return json(res, 429, { error: 'slow_down' }); return json(res, 200, { week: Fish.weekStart(), top: Fish.weekTop(10), streaks: Fish.streakTop(10) }); }
    if (url.pathname.startsWith('/api/fish/')) { const u = who(); if (!u) return json(res, 401, { error: 'sign_in_with_xaman' }); if (gate('fish:' + u.acct, 40, 60e3)) return json(res, 429, { error: 'slow_down' });
      const b = req.method === 'POST' ? await body() : {}, op = url.pathname.slice(10);
      if (op === 'state') return json(res, 200, { ...Fish.get(u.acct), today: Fish.today(u.acct) });
      if (op === 'challenges' && req.method === 'GET') return json(res, 200, Fish.challenges(u.acct));
      if (op === 'challenges' && req.method === 'GET') return json(res, 200, Fish.challenges(u.acct));
      if (op === 'cast' && req.method === 'POST' && (!b.near || !Number.isFinite(+b.x) || !Number.isFinite(+b.z) || Math.abs(+b.x) > 900 || Math.abs(+b.z) > 900)) return json(res, 200, { error: 'not_near_water' });
      if (op === 'cast' && req.method === 'POST') return json(res, 200, Fish.cast(u.acct, { bait: String(b.bait || 'worm'), deep: !!b.deep, weather: String(b.weather || '') }));
      if (op === 'reel' && req.method === 'POST') return json(res, 200, Fish.reel(u.acct, String(b.cid || ''), !!b.ok));
      if (op === 'import' && req.method === 'POST') return json(res, 200, Fish.importGuest(u.acct, b.guest));
      if (op === 'sell' && req.method === 'POST') return json(res, 200, Fish.sell(u.acct));
      if (op === 'buy' && req.method === 'POST') return json(res, 200, Fish.buy(u.acct, b.kind === 'rod' ? 'rod' : 'bait', String(b.id || ''), +b.qty || 1));
      return json(res, 404, { error: 'not_found' }); }
    if (url.pathname === '/api/daily') { const d = Retain.daily(); return json(res, 200, { day: d.day, mod: d.mod, top: Retain.dailyTop(d.day) }); }
    if (url.pathname === '/api/streak' && req.method === 'POST') { const u = who(); if (!u) return json(res, 401, { error: 'sign_in_with_xaman' }); return json(res, 200, { ...Retain.streak(u.acct), hunt: Retain.huntGot(u.acct), week: LB.week() }); }
    if (url.pathname === '/api/hunt' && req.method === 'POST') { const u = who(); if (!u) return json(res, 401, { error: 'sign_in_with_xaman' }); if (gate('hunt:' + u.acct, 12, 60e3)) return json(res, 429, { error: 'slow_down' }); const b = await body(); return json(res, 200, Retain.hunt(u.acct, String(b.week || ''), +b.coin, +b.secs)); }
    if (url.pathname === '/api/leaderboard') return json(res, 200, { week: LB.week(), top: LB.top().map(({ flags, ...e }) => e) });
    if (url.pathname === '/api/signin' && req.method === 'POST') { if (!C.XUMM_KEY) return json(res, 200, { xaman: null, error: 'signin_coming_soon' }); return json(res, 200, await Pay.startSignIn()); }
    if (url.pathname === '/api/signin/finish' && req.method === 'POST') return json(res, 200, await Pay.finishSignIn((await body()).sid));
    if (url.pathname === '/api/buy' && req.method === 'POST') {
      if (!C.XUMM_KEY || !C.TREASURY) return json(res, 200, { error: 'shop_coming_soon' });
      const u = who(); if (!u) return json(res, 401, { error: 'sign_in_with_xaman' });
      const { item } = await body(); if (items[item]?.reward) return json(res, 400, { error: 'reward_only' }); if (Pay.owned(u.acct).includes(item)) return json(res, 200, { error: 'already_owned' });
      const sid = Pay.newPurchase(u.acct, item); if (!sid) return json(res, 400, { error: 'unknown_item' });
      let xaman = null; try { xaman = await Pay.createXamanPayload(sid); } catch (e) { console.error('xaman', e.message); }
      return json(res, 200, { sid, tx: Pay.txJsonFor(sid), xaman });
    }
    if (url.pathname === '/api/verify' && req.method === 'POST') { const { sid, txHash } = await body(); return json(res, 200, await Pay.verify(sid, txHash)); }
    if (url.pathname === '/admin/payouts') {   // manual approval only: prints list, sends nothing
      if (!adminOk(req, ip)) return json(res, 403, { error: 'forbidden' });
      return json(res, 200, await LB.payoutList(await Pay.ledger(), url.searchParams.get('week') || undefined));
    }
    json(res, 404, { error: 'not_found' });
  } catch (e) { console.error(e); json(res, 500, { error: 'server' }); }
});

const wss = new WebSocketServer({ server, maxPayload: 512, perMessageDeflate: false });
const wsPerIp = new Map();
// heartbeat: every ~25s ping all sockets (game + city); one that missed the previous pong is half-open -> terminate so its slot/lobby seat is freed
setInterval(() => { for (const w of wss.clients) { if (w.isAlive === false) { try { w.terminate(); } catch {} continue; } w.isAlive = false; try { w.ping(); } catch {} } }, 25e3).unref();
process.on('uncaughtException', e => console.error('uncaughtException', e && e.stack || e));
process.on('unhandledRejection', e => console.error('unhandledRejection', e && e.stack || e));
wss.on('connection', (ws, req) => {
  ws.isAlive = true; ws.on('pong', () => { ws.isAlive = true; });
  ws.on('error', () => { try { ws.terminate(); } catch {} });   // oversized/garbled frames must never crash the process
  const wip = req.headers['fly-client-ip'] || req.socket.remoteAddress;
  if (!okOrigin(req.headers.origin) || gate('wsc:' + wip, 30, 60e3) || (wsPerIp.get(wip) || 0) >= 12) return ws.close(1008, 'rejected');
  wsPerIp.set(wip, (wsPerIp.get(wip) || 0) + 1); ws.on('close', () => { const n = (wsPerIp.get(wip) || 1) - 1; n > 0 ? wsPerIp.set(wip, n) : wsPerIp.delete(wip); });
  if ((req.url || '').includes('mode=city')) { const u = new URL(req.url, 'http://x'); return City.attach(ws, u, Pay.checkToken(u.searchParams.get('token')), req.headers['fly-client-ip'] || req.socket.remoteAddress); }   // city presence/chat (server/city.js)
  const url = new URL(req.url, 'http://x');
  if (url.searchParams.get('mode') === 'flight') return FlightLobby.attach(ws, url);
  const mode = url.searchParams.get('mode') === 'zombie' ? 'zombie' : 'tron';
  const pass = Pay.checkToken(url.searchParams.get('token'));   // optional sign-in: free play either way
  const want = (url.searchParams.get('look') || '').split(',').filter(Boolean), own = pass ? Pay.owned(pass.acct) : [], look = {};
  for (const id of want) if (own.includes(id) && items[id]) look[items[id].kind] = id;   // only equip what the account owns
  if (pass && url.searchParams.get('nft') !== '0') { const n = Nft.charFor(pass.acct); if (n) look.nft = n; }   // verified-owner NFT character only
  const rt = url.searchParams.get('ranked'), lob = rt ? Ranked.lobbies[Ranked.ticketMatch(rt)] : null;
  if (rt && pass && Object.values(rooms).flat().some(r => (r.ranked || r.tl?.ranked) && [...r.players.values()].some(x => x.acct === pass.acct))) return ws.close(4004, 'one_ranked_match_at_a_time');
  const recon = Ranked.reconOk(rt, pass?.acct, lob);   // started ranked match: only an already-admitted entrant may reconnect (as spectator); everyone else is locked out
  if (rt && lob && lob.state !== 'open' && !recon) return ws.close(4006, 'ranked_locked');
  if (rt && !recon && (!lob || !pass || !Ranked.live() || !Ranked.ticketOk(rt, pass.acct))) return ws.close(4003, 'ranked_ticket_invalid');
  const gm = lob ? (lob.game || 'zombie') : mode;
  const ip = req.headers['fly-client-ip'] || req.socket.remoteAddress;
  const rkq = url.searchParams.get('resume'), rs = rkq && gm === 'zombie' && !rt ? resumeIdx.get(rkq) : null, rsOk = rs && rooms.zombie.includes(rs.room) && rs.room.players.has(rs.p.id);
  let room;
  if (rsOk) room = rs.room;
  else if (rt) { room = gm === 'tron' ? tronRoom({ id: lob.id, ranked: true, cfg: lob.cfg, creatorAcct: lob.creator }) : findRoom('zombie', lob.id); if (!room) return ws.close(4005, 'match_already_started'); }
  else if (gm === 'tron' && url.searchParams.get('create')) room = tronRoom({ cfg: { teams: +url.searchParams.get('teams') || 0, ff: url.searchParams.get('ff') !== '0', bo3: url.searchParams.get('bo3') === '1' } });
  else if (gm === 'tron' && url.searchParams.get('room')) { room = rooms.tron.find(r => r.tl && !r.tl.ranked && r.tl.id === url.searchParams.get('room')); if (!room || room.full) return ws.close(4005, 'match_already_started_or_full'); }
  else room = findRoom(gm, null, url.searchParams.get('daily') === '1', url.searchParams.get('map') === 'refinery' ? 'refinery' : null, gm === 'zombie' && url.searchParams.get('arrival') === 'helicopter', url.searchParams.get('flight'));
  let p, id;
  if (rsOk) { p = rs.p; id = p.id; const old = p.ws; p.ws = ws; p.away = 0; p.ip = ip; p.msgs = 0; p.win = Date.now(); clearTimeout(p.awayT); p.awayT = null; if (old && old !== ws) { try { old.terminate(); } catch {} } }   // resumed: same player, same points/guns/perks
  else {
    p = { ws, ip, acct: pass?.acct, look, name: String(url.searchParams.get('name') || 'anon').replace(/[^\w .-]/g, '').slice(0, 16), msgs: 0, win: Date.now() };
    if (rt) { p.ticket = rt; p.paidAt = Ranked.tickets[rt].paidAt; }
    if (room.tl) room.setTeam(p, +url.searchParams.get('team') || 0);
    id = room.add(p); if (recon) { p.alive = false; p.lifeDone = true; p.spectator = true; } if (room.tl && !room.tl.creatorId && !room.tl.ranked) room.tl.creatorId = id;
    if (gm === 'zombie' && !rt && !room.ranked && !room.tl) { p.rk = require('crypto').randomBytes(12).toString('hex'); resumeIdx.set(p.rk, { p, room }); } }
  ws.send(JSON.stringify(p.rk ? { ...room.init(id), rk: p.rk } : room.init(id)));
  if (!rsOk) room.events.push({ e: 'join', id, name: p.name, look, color: p.color, team: p.team ?? null }); else room.events.push({ e: 'back', id });
  ws.on('message', d => {
    const n = Date.now(); if (n - p.win > 1000) { p.win = n; p.msgs = 0; }
    if (++p.msgs > 40) return;                     // input flood guard (clients send ≤20/s)
    let m; try { m = JSON.parse(d); } catch { return; }
    if (!m || typeof m !== 'object' || Array.isArray(m) || !['i', 'ping', 'start', 'team', 'leave', ...(process.env.ZOMBIE_TEST_TP === '1' && !process.env.FLY_APP_NAME ? ['tp'] : [])].includes(m.t)) return;
    if (m.t === 'leave') { p.left = 1; if (p.ticket && (room.tl?.state === 'lobby' || room.ranked?.state === 'lobby')) Ranked.leaveLobby(p.ticket); ws.close(1000, 'left'); setTimeout(() => { try { ws.terminate(); } catch {} }, 150); return; }   // explicit leave; close handler removes the player, moves host, drops empty room
    if (m.t === 'ping' && !(typeof m.c === 'number' && isFinite(m.c))) return;
    if (m && m.t === 'start') { if (room.ranked) room.ranked.wantStart = p; if (room.tl) room.tl.wantStart = p; }
    if (m && m.t === 'team' && room.tl?.state === 'lobby') room.setTeam(p, +m.team || 0);
    if (m && m.t === 'tp' && process.env.ZOMBIE_TEST_TP === '1' && !process.env.FLY_APP_NAME && room.mode === 'zombie') { p.x = +m.x || 0; p.z = +m.z || 0; p.lv = m.lv ? 1 : 0; { const Z = require('./cod'); Z.bind(room); Z.lift(p); } if (m.hp) p.hp = +m.hp; if (m.heli) { const Z = require('./cod'), Heli = require('./heli'); Z.bind(room); if (!room.heli) { if (room.quest) room.quest.st = 10; Heli.start(room, room.events); } if (Number.isFinite(+m.ht)) room.heli.t = +m.ht; } return; }   // local test runs only: teleport (+ helicopter finale shortcut)
    if (m && m.t === 'i') room.input(p, m); else if (m && m.t === 'ping') ws.send(JSON.stringify({ t: 'pong', c: m.c }));
  });
  const drop = () => { if (p.rk) resumeIdx.delete(p.rk); if (room.tl?.ranked && room.tl.state === 'live' && p.acct) { room.tl.left = room.tl.left || {}; room.tl.left[p.acct] = room.t; } room.remove(id); if (room.tl && room.tl.creatorId === id) room.tl.creatorId = room.players.keys().next().value; if (!room.players.size && !(room.tl?.ranked && room.tl.state === 'live')) if (!room.players.size && !(room.tl?.ranked && room.tl.state === 'live') && !(room.ranked && room.ranked.state !== 'lobby' && !room.ranked.settled)) rooms[gm] = rooms[gm].filter(r => r !== room); };
  ws.on('close', () => { if (p.ws !== ws) return;   // superseded by a resumed socket
    if (p.rk && !p.left && room.players.has(id)) { p.away = 1; if (p.in) { p.in.fire = false; p.in.mx = 0; p.in.mz = 0; p.in.use = false; p.in.hold = false; } p.awayT = setTimeout(() => { if (p.away && p.ws === ws) drop(); }, 25e3); return; }
    drop(); });
});

// idle empty lobbies/rooms (created but nobody stayed) expire after 2 min
setInterval(() => { for (const gm of Object.keys(rooms)) rooms[gm] = rooms[gm].filter(r => r.players.size || Date.now() - (r.born || 0) < 120e3 || r.tl?.state === 'live' || (r.ranked && r.ranked.state !== 'lobby' && !r.ranked.settled)); }, 30e3).unref();

// ---------- Light Cycles custom matches (free or ranked): FFA / 2 / 3 / 4 teams, optional teammate-trail kills, optional best of 3 ----------
const crypto = require('crypto');
function tronRoom({ id, ranked = false, cfg = {}, creatorAcct }) {
  if (id) { const r = rooms.tron.find(x => x.tl?.id === id); if (r) return r.full ? null : r; }
  const r = new Room(roomSeq++, 'tron'); r.tl = { id: id || 'T' + crypto.randomBytes(4).toString('hex'), ranked, creatorAcct, state: 'lobby', max: 8, opened: 0,
    cfg: { teams: [0, 2, 3, 4].includes(+cfg.teams) ? +cfg.teams : 0, ff: cfg.ff !== false, bo3: !!cfg.bo3 }, order: [], wins: {}, sumPlace: {}, lastPlace: {}, round: 0, roster: new Map() };
  r.onRound = res => tronRound(r, res); rooms.tron.push(r); return r;
}
// pre-game lobby screen: players (masked), count vs max, countdown, auto-start after LOBBY_SECS once min players are in
const LOBBY_SECS = +process.env.LOBBY_SECS || 60;
const handle = p => /^r[1-9A-HJ-NP-Za-km-z]{24,34}$/.test(p.name || '') ? Ranked.maskA(p.name) : String(p.name || 'runner').slice(0, 16);
function lobbyEvent(r, k, min, max, ranked) {
  if (r.t - (k.lsT || -9) < 1) return; k.lsT = r.t; const pay = ranked ? Ranked.lobbyPay(k.id) : null, here = new Set();
  const players = [...r.players.values()].map(p => { if (p.acct) here.add(p.acct); return { id: p.id, name: handle(p), look: p.look || {}, pay: ranked ? (p.ticket && pay.paid.includes(p.acct) ? 'confirmed' : 'pending') : null }; });
  if (pay) for (const a of pay.pending) if (!here.has(a)) players.push({ id: 0, name: Ranked.maskA(a), pay: 'pending' });
  r.events.push({ e: 'lobby_state', id: k.id, ranked: !!ranked, n: r.players.size, max, min, countdown: k.countdown == null ? null : Math.ceil(k.countdown), autoIn: r.players.size >= min ? Math.max(0, Math.ceil(LOBBY_SECS - (r.t - (k.minT ?? r.t)))) : null, players });
}
function tronTick(r) {
  const k = r.tl, n = r.players.size;
  if (k.ranked && k.state === 'live' && n === 0) {   // everyone left mid-match: always finalize
    if (k.round > 0) tronFinal(r, true);                // >= 1 round finished: score by standing at disconnect
    else { k.state = 'over'; Ranked.refundMatch(k.id, [...k.roster.values()].map(p => p.ticket), 'all_players_left_before_first_round'); }
    rooms.tron = rooms.tron.filter(x => x !== r); return;
  }
  if (k.state === 'lobby') {
    if (k.ranked) { const lob = Ranked.lobbies[k.id]; if (!lob || Ranked.openLobbies().every(l => l.id !== k.id)) { for (const p of r.players.values()) p.ws.close(4006, 'match_expired_refund_due'); return; } }
    const tmin = k.ranked ? Ranked.R.MIN : 2; if (n >= tmin) { if (k.minT == null) k.minT = r.t; if (k.countdown == null && r.t - k.minT >= LOBBY_SECS) k.countdown = 4; } else k.minT = null;
    lobbyEvent(r, k, tmin, k.max || 8, k.ranked);
    const w = k.wantStart; k.wantStart = null;
    const isCreator = p => k.ranked ? p.acct === k.creatorAcct : p.id === k.creatorId, here = [...r.players.values()].some(isCreator);
    if (w && r.players.has(w.id) && n >= 1 && (isCreator(w) || (!here && r.t - k.opened > 120)) && k.countdown == null) k.countdown = 4;
    if (k.countdown == null) return; if ((k.countdown -= dt) > 0) return; k.countdown = null;
    if (k.ranked) { const ok = []; for (const p of r.players.values()) { if (Ranked.useTicket(p.ticket, p.acct, k.id)) ok.push(p); else p.ws.close(4003, 'ranked_ticket_invalid'); }
      if (!ok.length) return; Ranked.markStarted(k.id); for (const p of ok) k.roster.set(p.acct, { acct: p.acct, ticket: p.ticket, paidAt: p.paidAt, ip: p.ip, team: p.team, id: p.id, name: p.name }); }
    k.state = 'live'; k.round = 0; k.wins = {}; k.sumPlace = {}; k.lastPlace = {}; k.startT = r.t; r.roundEnd = null; r.reset();
    r.events.push({ e: 'match_start', id: k.id, ranked: k.ranked, cfg: k.cfg, players: n });
  }
}
function tronRound(r, res) {
  const k = r.tl; if (k.state !== 'live') return; k.round++;
  const key = p => k.ranked ? p.acct : p.id;
  if (k.cfg.teams) { if (res.teams.length === 1) k.wins[res.teams[0]] = (k.wins[res.teams[0]] || 0) + 1; k.lastTeams = res.teams; }
  else for (const [id, pl] of res.place) { const p = r.players.get(id), kk = p ? key(p) : null; if (kk == null) continue; k.sumPlace[kk] = (k.sumPlace[kk] || 0) + pl; k.lastPlace[kk] = pl; if (pl === 1) k.wins[kk] = (k.wins[kk] || 0) + 1; }
  // ranked riders who disconnected mid-round count as last place
  if (k.ranked && !k.cfg.teams) for (const a of k.roster.keys()) if (k.lastPlace[a] === undefined || ![...r.players.values()].some(p => p.acct === a)) { k.sumPlace[a] = (k.sumPlace[a] || 0) + 99; k.lastPlace[a] = 99; }
  const maxW = Math.max(0, ...Object.values(k.wins));
  const over = !k.cfg.bo3 || maxW >= 2 || k.round >= 3;
  r.events.push({ e: 'round_result', round: k.round, wins: k.wins, teams: res.teams, winner: res.place ? [...res.place].find(([, pl]) => pl === 1)?.[0] ?? null : undefined, over });
  if (!over) return;
  tronFinal(r);
}
function tronFinal(r, forfeit = false) {
  const k = r.tl, maxW = Math.max(0, ...Object.values(k.wins)); k.left = k.left || {};
  k.state = 'over'; r.roundEnd = null;
  // final standings (deterministic): FFA = round wins, total placement, last-round placement, entry time, wallet/id
  const list = k.ranked ? [...k.roster.values()] : [...r.players.values()].map(p => ({ acct: null, id: p.id, name: p.name, team: p.team, paidAt: 0 }));
  let winners = [], standings;
  if (k.cfg.teams) {
    const tw = Object.keys(k.wins).length ? Object.entries(k.wins).filter(([, v]) => v === maxW).map(([t]) => +t) : (k.lastTeams || []);
    let winTeams = k.cfg.bo3 ? tw : (k.lastTeams || tw); if (!winTeams.length) winTeams = [...new Set(list.map(p => p.team))];   // nobody left standing at all: every team shares (deterministic, no house cut)
    standings = list.sort((a, b) => (winTeams.includes(b.team) - winTeams.includes(a.team)) || a.team - b.team || (a.paidAt - b.paidAt) || String(a.acct ?? a.id).localeCompare(String(b.acct ?? b.id)));
    winners = standings.filter(p => winTeams.includes(p.team)).map(p => p.acct ?? p.id); k.winTeams = winTeams;
  } else {
    const kk = p => p.acct ?? p.id;
    standings = list.sort((a, b) => (k.wins[kk(b)] || 0) - (k.wins[kk(a)] || 0) || (k.sumPlace[kk(a)] ?? 99) - (k.sumPlace[kk(b)] ?? 99) || (k.lastPlace[kk(a)] ?? 99) - (k.lastPlace[kk(b)] ?? 99) || ((k.left[kk(b)] ?? 1e12) - (k.left[kk(a)] ?? 1e12)) || (a.paidAt - b.paidAt) || String(kk(a)).localeCompare(String(kk(b))));
  }
  const ev = { e: 'match_over', id: k.id, ranked: k.ranked, teams: k.cfg.teams, winTeams: k.winTeams || null,
    standings: standings.map((p, i) => ({ rank: i + 1, id: p.id, name: p.name, acct: p.acct, team: p.team ?? null, wins: k.cfg.teams ? (k.wins[p.team] || 0) : (k.wins[p.acct ?? p.id] || 0) })) };
  if (k.ranked) {
    const flags = new Map(); for (const p of standings) { const pl = [...r.players.values()].find(x => x.acct === p.acct); if (k.cfg.teams && pl && !pl.turns && r.t - k.startT > 5) flags.set(p.acct, ['no inputs all match (possible throw)']); }
    const rec = Ranked.settleTron({ id: k.id, team: !!k.cfg.teams, winners, secs: r.t - k.startT, extraFlags: flags,
      ranking: standings.map(p => ({ ...p, place: k.lastPlace[p.acct], wins: ev.standings.find(s => s.acct === p.acct)?.wins })) });
    ev.potXrp = rec.potDrops / 1e6; ev.status = rec.status; ev.standings.forEach((s, i) => { s.prizeXrp = rec.standings[i].prizeDrops / 1e6; s.review = rec.standings[i].flags.length > 0; });
    setTimeout(() => { for (const p of r.players.values()) p.ws.close(1000, 'ranked_match_over'); rooms.tron = rooms.tron.filter(x => x !== r); }, 8000);
  } else setTimeout(() => { if (rooms.tron.includes(r)) { k.state = 'lobby'; r.roundEnd = null; r.reset(); r.events.push({ e: 'lobby' }); } }, 7000);   // free match: back to the lobby for a rematch
  r.events.push(ev);
}
// ranked match lifecycle: lobby (>= MIN paid players, 20s countdown so others can join) -> live (one life each) -> over (settle, admin review)
function rankedTick(r) {
  const k = r.ranked, n = r.players.size;
  if (k.state === 'lobby') {
    const lob = Ranked.lobbies[k.id];
    if (!lob || lob.state !== 'open' || Ranked.openLobbies().every(l => l.id !== k.id)) { for (const p of r.players.values()) p.ws.close(4006, 'match_expired_refund_due'); return; }
    if (n >= k.min) { if (k.minT == null) k.minT = r.t; if (k.countdown === null && r.t - k.minT >= LOBBY_SECS) k.countdown = 5; } else k.minT = null;
    lobbyEvent(r, k, k.min, k.max, true);
    const w = k.wantStart; k.wantStart = null;   // creator starts it; if the creator isn't here, anyone in the lobby may after 2 min
    const may = w && r.players.has(w.id) && (w.acct === lob.creator || ![...r.players.values()].some(p => p.acct === lob.creator) && r.t - k.opened > 120);
    if (may && k.countdown === null && n >= k.min) k.countdown = 5;
    if (n >= k.max && k.countdown === null) k.countdown = 5;
    if (k.countdown === null) return; if (n < k.min) { k.countdown = null; return; }
    if ((k.countdown -= dt) > 0) return;
    const ok = [];   // tickets are consumed only now; anyone whose ticket fails is removed, ticket untouched
    for (const p of r.players.values()) { if (Ranked.useTicket(p.ticket, p.acct, k.id)) ok.push(p); else p.ws.close(4003, 'ranked_ticket_invalid'); }
    if (ok.length < k.min) { for (const p of ok) Ranked.unconsume(p.ticket); k.countdown = null; return; }
    k.state = 'live'; Ranked.markStarted(k.id); r.reset(); k.startT = r.t; for (const p of r.players.values()) { p.lifeStart = r.t; p.lifeKills = 0; }
    r.events.push({ e: 'ranked_start', id: k.id, players: ok.length, buyinXrp: Ranked.lobbies[k.id].buyin / 1e6 });
  } else if (k.state === 'over' && !k.settled) {
    k.settled = true; const rec = Ranked.settle({ id: k.id, players: [...k.results.values()] });
    r.events.push({ e: 'ranked_result', id: k.id, potXrp: rec.potDrops / 1e6, burnXrp: rec.burnDrops / 1e6, status: rec.status,
      standings: rec.standings.map(s => ({ rank: s.rank, acct: s.acct, kills: s.kills, prizeXrp: s.prizeDrops / 1e6, review: s.flags.length > 0 })) });
    setTimeout(() => { for (const p of r.players.values()) p.ws.close(1000, 'ranked_match_over'); rooms.zombie = rooms.zombie.filter(x => x !== r); }, 6000);
  }
}
// fixed-step sim, decoupled snapshot rate
const dt = 1 / C.TICK_HZ, every = Math.round(C.TICK_HZ / C.SNAP_HZ); let tick = 0;
setInterval(() => {
  const t0 = process.hrtime.bigint(); tick++;
  for (const r of Object.values(rooms).flat()) {
    try {   // one bad room must never stop the loop for everyone else
    r.step(dt);
    if (tick % every === 0) { const msg = JSON.stringify(r.snapshot());
      for (const p of r.players.values()) if (p.ws.readyState === 1 && p.ws.bufferedAmount < 64e3) { p.ws.send(msg); stats.bytesOut += msg.length; } }
    if (r.ranked) rankedTick(r); if (r.tl) tronTick(r);
    } catch (e) { console.error('room tick', r.id, e && e.stack || e); }
  }
  stats.tickMs.push(Number(process.hrtime.bigint() - t0) / 1e6); if (stats.tickMs.length > 3000) stats.tickMs.shift();
}, 1000 * dt);

if (C.BURN_INTERVAL_MS > 0 && process.env.BURN_JOB_IN_SERVER === 'true') setInterval(() => require('./burn').run().catch(e => console.error('burn', e.message)), C.BURN_INTERVAL_MS);
Nft.start();
if (!C.DRY_RUN && C.TREASURY) require('./watch').start(Pay.ledger);
const xsdk = () => { const { XummSdk } = require('xumm-sdk'); return new XummSdk(C.XUMM_KEY, C.XUMM_SECRET); };
Ranked.Q.start({ ledger: Pay.ledger, live: () => Ranked.live() && !C.DRY_RUN, wallet: () => { if (!C.TREASURY_SEED) return null; try { return require('xrpl').Wallet.fromSeed(C.TREASURY_SEED); } catch { return null; } } });
setInterval(() => { try { Ranked.sweepRefunds(); } catch (e) { console.error('refunds', e.message); } Ranked.sweepSessions(Pay.ledger, xsdk).catch(() => {}); Pay.sweepBuys().catch(() => {}); }, 30000);
server.headersTimeout = 15e3; server.requestTimeout = 30e3; server.keepAliveTimeout = 10e3;   // slow-loris protection
AegisClips.start({ online: () => City.count() });
Cams.start();   // YouTube live-cam refresh: no-op unless YT_API_KEY / Youtube_API is set   // no-op unless AEGIS_CLIPS=1
server.listen(C.PORT, () => console.log(`burn-city-game :${C.PORT} free=true shop=on dryRun=${C.DRY_RUN} net=${C.NETWORK}`));
// Homefront saves are cached in memory and written on a short timer; write them out before Fly stops the machine (SIGINT on deploy) or on SIGTERM.
for (const sig of ['SIGTERM', 'SIGINT']) process.once(sig, () => { try { Homefront.flush(); } catch (e) { console.error('[homefront] flush on', sig, 'failed', e?.message); } process.exit(0); });
Eco.start();
AmmLock.start(Eco);
module.exports = { server, stats, rooms, tronRoom, tronTick, tronRound, tronFinal };
