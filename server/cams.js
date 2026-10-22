// AEGIS Pyramid live cams: real YouTube live streams, by category, ranked by concurrent viewers, + per-stream comments.
//  - Key: process.env.YT_API_KEY || process.env.Youtube_API (Fly secret). Never sent to the client.
//  - Quota (10k units/day): search.list = 100 units, videos.list = 1. One category is re-searched per tick (round-robin, every
//    CAMS_TICK_MIN, default 20 min -> each category every 2 h, ~7.2k units/day), and every tick one videos.list call refreshes
//    viewer counts + embeddable/live status for every cached stream. No key / error = the curated FALLBACK list below.
//  - Cache: <DATA_DIR>/cams.json (DATA_DIR=/data on Fly). Comments: <DATA_DIR>/cam-comments.json, last 100 per stream.
//  - GET /api/cams -> { source, updated, categories:[{ name, streams:[{ id, title, channel, viewers }] }] } (viewers desc)
//    GET /api/cams/:id/comments -> { comments:[{ name, text, ts }] }   POST same { name, text } -> 1 per 5 s per player/IP, 200 chars.
const fs = require('fs'), path = require('path'), C = require('./config');
const KEY = () => process.env.YT_API_KEY || process.env.Youtube_API || '';
const CATS = [
  { name: 'City/Traffic', q: 'city live cam traffic street 24/7' },
  { name: 'Nature/Wildlife', q: 'wildlife live cam nature 24/7' },
  { name: 'Beach/Ocean', q: 'beach live cam ocean 24/7' },
  { name: 'Space/ISS', q: 'ISS live earth from space' },
  { name: 'Weather/Storms', q: 'live weather cam storm' },
  { name: 'Airports', q: 'airport live cam planes 24/7' },
];
// Curated 24/7 cams (each id checked embeddable via youtube oembed = 200, Oct 2026). viewers unknown (0) in fallback.
const FALLBACK = {
  'City/Traffic': [['1EiC9bvVGnk', 'Jackson Hole Town Square Live Webcam', 'See Jackson Hole'], ['DjdUEyjx8GM', 'Tokyo Shinjuku Kabukicho Live', 'Kabukicho Live Channel'], ['5uZa3-RMFos', 'Sydney Harbour Live 24/7', 'WebcamSydney']],
  'Nature/Wildlife': [['ydYDqZQpim8', 'Namibia: Live stream in the Namib Desert', 'NamibiaCam']],
  'Beach/Ocean': [['98jOtUeM3m8', 'Venice Beach Live Cam 24/7', 'Ready When You\'re Ready'], ['lBiwm4UZJ4A', 'Live Webcam: Amelia Island, Florida', 'HD Beach Cams']],
  'Space/ISS': [['xAieE-QtOeM', 'Live Video from the ISS (Official NASA Stream)', 'NASA'], ['fO9e9jnhYK8', 'Live 4K video of Earth from the ISS', 'Sen']],
  'Weather/Storms': [['1j1lgppb0PY', 'Fort Lauderdale Beach LIVE: Surf, Wind & Weather', 'ElboTV']],
  'Airports': [['iSeH45R-8R0', 'Maho Beach / Princess Juliana Airport 24/7', 'SHOWME Caribbean'], ['V7_orOtu-oo', 'Las Vegas Airport LIVE 24/7', 'Flightradar24'], ['uDBYuEV4zjI', 'Heathrow Airport LIVE 24/7', 'BIG JET TV']],
};
const ID = /^[A-Za-z0-9_-]{11}$/;
const txt = (s, n) => String(s == null ? '' : s).replace(/[\u0000-\u001f\u007f<>]/g, '').replace(/&(amp|quot|#39|lt|gt);/g, (m, e) => ({ amp: '&', quot: '"', '#39': "'", lt: '', gt: '' }[e])).replace(/\s+/g, ' ').trim().slice(0, n);
const file = n => path.join(C.DATA_DIR, n);
const canDisk = () => { try { return fs.existsSync(C.DATA_DIR); } catch { return false; } };
const saveJson = (n, v) => { if (!canDisk()) return; try { const p = file(n); fs.writeFileSync(p + '.tmp', JSON.stringify(v)); fs.renameSync(p + '.tmp', p); } catch (e) { console.warn('[cams] save', n, e.message); } };
const loadJson = (n, d) => { try { return JSON.parse(fs.readFileSync(file(n), 'utf8')); } catch { return d; } };

function fallback() { return { source: 'fallback', updated: Date.now(), categories: CATS.map(c => ({ name: c.name, streams: (FALLBACK[c.name] || []).map(([id, title, channel]) => ({ id, title, channel, viewers: 0 })) })) }; }
// live state: per category list of streams; persisted
let live = null;   // { updated, cats: { name: [{id,title,channel,viewers}] }, next: 0 }
{ const c = loadJson('cams.json', null); if (c && c.cats && typeof c.cats === 'object') live = c; }
const ST = { lastErr: null, lastOk: 0, runs: 0, units: 0 };

async function yt(ep, params, fetchImpl = fetch) {
  const u = new URL('https://www.googleapis.com/youtube/v3/' + ep); for (const [k, v] of Object.entries({ ...params, key: KEY() })) u.searchParams.set(k, v);
  const ctl = new AbortController(), to = setTimeout(() => ctl.abort(), 12e3);
  try { const r = await fetchImpl(u, { signal: ctl.signal }); if (!r.ok) throw new Error(ep + ' http ' + r.status); return await r.json(); } finally { clearTimeout(to); }
}
async function tick(fetchImpl) {
  if (!KEY()) return false; ST.runs++;
  try {
    const st = live && live.cats ? live : { updated: 0, cats: {}, next: 0 };
    const cold = !CATS.some(c => (st.cats[c.name] || []).length);   // nothing cached yet: search every category once (600 units)
    const todo = cold ? CATS : [CATS[(st.next | 0) % CATS.length]], found = new Map();
    for (const cat of todo) { const s = await yt('search', { part: 'snippet', type: 'video', eventType: 'live', videoEmbeddable: 'true', q: cat.q, maxResults: '10', safeSearch: 'moderate' }, fetchImpl); ST.units += 100;
      found.set(cat.name, (s.items || []).map(i => i && i.id && i.id.videoId).filter(x => ID.test(x || ''))); }
    const ids = new Set([].concat(...found.values())); for (const l of Object.values(st.cats)) for (const x of l) ids.add(x.id);
    const info = new Map(), all = [...ids].slice(0, 150);
    for (let i = 0; i < all.length; i += 50) { const v = await yt('videos', { part: 'liveStreamingDetails,snippet,status', id: all.slice(i, i + 50).join(','), maxResults: '50' }, fetchImpl); ST.units += 1;
      for (const it of v.items || []) { if (!it || !ID.test(it.id || '')) continue; const sn = it.snippet || {}, ls = it.liveStreamingDetails || {};
        if (!it.status || it.status.embeddable !== true || it.status.privacyStatus !== 'public' || sn.liveBroadcastContent !== 'live' || ls.actualEndTime) continue;
        info.set(it.id, { id: it.id, title: txt(sn.title, 90) || 'Live cam', channel: txt(sn.channelTitle, 48), viewers: Math.max(0, parseInt(ls.concurrentViewers, 10) || 0) }); } }
    const cats = {};
    for (const c of CATS) { const ids0 = found.has(c.name) ? [...new Set(found.get(c.name))] : (st.cats[c.name] || []).map(x => x.id); cats[c.name] = ids0.map(id => info.get(id)).filter(Boolean).sort((a, b) => b.viewers - a.viewers).slice(0, 10); }
    live = { updated: Date.now(), cats, next: cold ? 0 : ((st.next | 0) + 1) % CATS.length }; ST.lastOk = Date.now(); ST.lastErr = null; saveJson('cams.json', live); return true;
  } catch (e) { ST.lastErr = String(e && e.message || e).replace(/key=[^&\s]+/g, 'key=…'); console.warn('[cams]', ST.lastErr); return false; }
}
function snapshot() {
  const fb = fallback(); if (!live || !live.cats) return fb;
  const categories = CATS.map(c => { const l = (live.cats[c.name] || []).slice(); return { name: c.name, streams: l.length ? l.sort((a, b) => b.viewers - a.viewers) : fb.categories.find(x => x.name === c.name).streams }; });
  return { source: Object.values(live.cats).some(l => l.length) ? 'youtube' : 'fallback', updated: live.updated, categories };
}

// ---------------------------------------------------------------- comments
const MAX_LEN = 200, KEEP = 100, GAP = 5e3;
let comments = {}; { const c = loadJson('cam-comments.json', null); if (c && typeof c === 'object' && !Array.isArray(c)) for (const [k, v] of Object.entries(c)) if (ID.test(k) && Array.isArray(v)) comments[k] = v.slice(-KEEP); }
const last = new Map();   // rate key -> ts
let saveT = 0; const persist = () => { if (saveT) return; saveT = setTimeout(() => { saveT = 0; saveJson('cam-comments.json', comments); }, 2000); saveT.unref && saveT.unref(); };
const URLRE = /\b(?:https?:\/\/|hxxps?:\/\/|www\.)\S+|\b[a-z0-9-]+(?:\.|\s*\[\.\]\s*|\s+dot\s+)(?:com|net|org|io|gg|xyz|ru|ly|me|co|app|site|link|fun|tk|cc|info|biz|live|tv)\b\S*/gi;
let Social = null; const soc = () => { try { return Social || (Social = require('./social')); } catch { return null; } };
function filterText(s, n) {
  s = typeof s === 'string' ? s : ''; const S = soc();
  let t = S ? S.clean(s, n + 50) : s.replace(/[\u0000-\u001f\u007f]/g, '');
  t = t.replace(URLRE, '[link removed]').replace(/\s+/g, ' ').trim();
  return [...t].slice(0, n).join('');
}
function postComment(id, b, keys) {
  if (!ID.test(id || '')) return { code: 400, body: { error: 'bad_stream' } };
  const raw = typeof b.text === 'string' ? b.text : '';
  if (!raw.trim()) return { code: 400, body: { error: 'empty' } };
  if ([...raw].length > MAX_LEN) return { code: 400, body: { error: 'too_long', max: MAX_LEN } };
  const now = Date.now(); for (const k of keys) if (now - (last.get(k) || 0) < GAP) return { code: 429, body: { error: 'slow_down', waitMs: GAP - (now - last.get(k)) } };
  const text = filterText(raw, MAX_LEN); if (!text) return { code: 400, body: { error: 'empty' } };
  const name = filterText(b.name, 24).replace(/\[link removed\]/g, '').trim() || 'guest';
  for (const k of keys) last.set(k, now); if (last.size > 5000) for (const [k, t] of last) if (now - t > GAP) last.delete(k);
  const c = { name, text, ts: now }; const l = comments[id] || (comments[id] = []); l.push(c); if (l.length > KEEP) l.splice(0, l.length - KEEP);
  if (Object.keys(comments).length > 500) { const old = Object.entries(comments).sort((a, b) => (a[1].at(-1)?.ts || 0) - (b[1].at(-1)?.ts || 0))[0]; if (old) delete comments[old[0]]; }
  persist(); return { code: 200, body: { ok: true, comment: c } };
}

// ---------------------------------------------------------------- HTTP (server.js calls this before its generic routes)
async function handle(req, res, url, { json, gate, ip, body }) {
  const p = url.pathname;
  if (p === '/api/cams') { if (req.method !== 'GET') return json(res, 405, { error: 'method' }), true; if (gate('cams:' + ip, 30, 60e3)) return json(res, 429, { error: 'slow_down' }), true; return json(res, 200, snapshot()), true; }
  const m = p.match(/^\/api\/cams\/([^/]+)\/comments$/); if (!m) return false;
  const id = decodeURIComponent(m[1]); if (!ID.test(id)) return json(res, 400, { error: 'bad_stream' }), true;
  if (req.method === 'GET') { if (gate('camc:' + ip, 60, 60e3)) return json(res, 429, { error: 'slow_down' }), true; return json(res, 200, { comments: (comments[id] || []).slice(-KEEP) }), true; }
  if (req.method === 'POST') { let b = {}; try { b = await body(); } catch { return json(res, 413, { error: 'too_big' }), true; }
    const pk = typeof b.pid === 'string' && /^[A-Za-z0-9_-]{6,40}$/.test(b.pid) ? 'p:' + b.pid : null;
    const r = postComment(id, b, ['ip:' + ip].concat(pk ? [pk] : [])); return json(res, r.code, r.body), true; }
  return json(res, 405, { error: 'method' }), true;
}

let timer = null;
function start() {
  if (timer || !KEY()) return; const min = Math.max(10, +process.env.CAMS_TICK_MIN || 20);
  const stale = !live || Date.now() - (live.updated || 0) > min * 60e3; setTimeout(() => tick(), stale ? 3000 : min * 60e3).unref();
  timer = setInterval(() => tick(), min * 60e3); timer.unref();
}
module.exports = { handle, start, tick, snapshot, fallback, postComment, filterText, status: () => ({ ...ST, key: !!KEY(), source: snapshot().source }), CATS, FALLBACK, _reset() { comments = {}; last.clear(); live = null; } };
