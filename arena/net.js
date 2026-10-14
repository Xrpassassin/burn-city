// Burn City game net client: pay flow + WebSocket + snapshot interpolation. No three.js dependency,
// so the city (js/app.js) can import it directly.
// Free to play. Optional XAMAN sign-in (needed only for the leaderboard and cosmetics).
const sleep = ms => new Promise(r => setTimeout(r, ms));
function openXaman(x, onQr) { onQr?.(x); if (/iPhone|Android/i.test(navigator.userAgent)) location.href = x.deeplink; }
export async function signIn(api, { onQr } = {}) {
  const s = await (await fetch(api + '/api/signin', { method: 'POST' })).json(); if (!s.xaman) throw new Error('XAMAN not configured');
  openXaman(s.xaman, onQr);
  for (let i = 0; i < 100; i++) { await sleep(3000);
    const v = await (await fetch(api + '/api/signin/finish', { method: 'POST', body: JSON.stringify({ sid: s.sid }) })).json();
    if (v.ok) { localStorage.bcToken = v.token; localStorage.bcAcct = v.account; return v; } }
  throw new Error('timeout');
}
export async function buy(api, item, { onQr, confirm } = {}) {
  const h = { authorization: 'Bearer ' + localStorage.bcToken };
  const s = await (await fetch(api + '/api/buy', { method: 'POST', headers: h, body: JSON.stringify({ item }) })).json();
  if (s.error) throw new Error(s.error); if (confirm && !(await confirm(s.tx))) throw new Error('cancelled'); if (s.xaman) openXaman(s.xaman, onQr);
  for (let i = 0; i < 120; i++) { await sleep(3000);
    const v = await (await fetch(api + '/api/verify', { method: 'POST', body: JSON.stringify({ sid: s.sid }) })).json();
    if (v.ok) return v; if (!['no_tx', 'not_validated_yet', 'tx_not_found'].includes(v.reason)) throw new Error(v.reason); }
  throw new Error('timeout');
}
export class GameNet {
  constructor(wsUrl, mode, { token, name, look = [], delay = 110, ranked = null, extra = '' } = {}) {
    this.roster = new Map();
    this.buf = []; this.delay = delay; this.trails = new Map(); this.handlers = {}; this.mode = mode; this.offset = null;
    const u = `${wsUrl}/?mode=${mode}&name=${encodeURIComponent(name || 'runner')}${token ? '&token=' + token : ''}&look=${look.join(',')}${ranked ? '&ranked=' + ranked : ''}${extra}`;
    this.ws = new WebSocket(u);
    this.ws.onmessage = e => this.msg(JSON.parse(e.data));
    this.ws.onclose = e => this.emit('close', e.reason);
    this.lastSend = 0;
  }
  on(k, f) { this.handlers[k] = f; return this; }
  emit(k, ...a) { this.handlers[k]?.(...a); }
  msg(m) {
    if (m.t === 'init') { this.me = m.me; this.life = m.life || 4000; for (const [id, name, look, color, team] of m.roster || []) this.roster.set(id, { name, look, color, team }); this.world = m.world; this.map = m.map; for (const [id, pts] of m.trails || []) this.trails.set(id, pts); return this.emit('init', m); }
    if (m.t !== 's') return;
    const now = performance.now(); const off = now - m.ts;              // smoothed clock offset
    this.offset = this.offset === null ? off : this.offset + (Math.min(off, this.offset + 50) - this.offset) * 0.1;
    this.buf.push(m); if (this.buf.length > 30) this.buf.shift();
    for (const e of m.ev || []) {
      if (e.e === 'round') { this.trails.clear(); for (const [id, x, z] of e.s || []) this.trails.set(id, [[x, z, e.t]]); }
      if (e.e === 'spawn') this.trails.set(e.id, [[e.x, e.z, e.t]]);
      if (e.e === 'leave') { this.trails.delete(e.id); this.roster.delete(e.id); }
      if (e.e === 'join') this.roster.set(e.id, { name: e.name, look: e.look || {}, color: e.color, team: e.team });
      if (e.e === 'team') { const ro = this.roster.get(e.id); if (ro) ro.team = e.team; }
      if (e.e === 'turn') { const t = this.trails.get(e.id) || []; t.push([e.x, e.z, e.t]); this.trails.set(e.id, t); }
      if (e.e === 'crash') { const t = this.trails.get(e.id); if (t) t.push([e.x, e.z, e.t]); }
      this.emit(e.e, e);
    }
    this.emit('snap', m);
  }
  // interpolated state ~110ms in the past: smooth even with jitter/packet bunching
  state() {
    if (!this.buf.length) return null;
    const rt = performance.now() - this.offset - this.delay; let a = this.buf[0], b = a;
    for (let i = this.buf.length - 1; i >= 0; i--) if (this.buf[i].ts <= rt) { a = this.buf[i]; b = this.buf[i + 1] || a; break; }
    const k = b === a ? 0 : Math.min(1, (rt - a.ts) / (b.ts - a.ts)), lerp = (x, y) => x + (y - x) * k;
    const mapB = new Map(b.p.map(p => [p[0], p]));
    const players = a.p.map(p => { const q = mapB.get(p[0]) || p; return { id: p[0], x: lerp(p[1], q[1]), z: lerp(p[2], q[2]), r: p[3], alive: q[4], hp: q[5], fuel: q[6], firing: q[7], pts: q[8], w: q[9] || 0, perks: q[10] || 0, down: q[11] || 0, w2: q[12] ?? -1, inv: q[13] || 0 }; });
    let zombies; if (a.z) { const zb = new Map(b.z.map(z => [z[0], z])); zombies = a.z.map(z => { const q = zb.get(z[0]) || z; return { id: z[0], x: lerp(z[1], q[1]), z: lerp(z[2], q[2]), burn: q[3], ty: z[4] || 0 }; }); }
    return { players, zombies, wave: b.w, score: b.sc, map: b.m };
  }
  get now() { return performance.now() - this.offset - this.delay; }   // server-time we are rendering at
  // trail polyline [x,z,ageMs] = timestamped corners + live head, clipped where segments expire (mirrors server)
  trail(id, hx, hz, alive) {
    const t = this.trails.get(id); if (!t || !t.length) return [];
    const now = this.now, cut = now - this.life, src = alive ? t.concat([[hx, hz, now]]) : t;
    while (t.length > 2 && t[1][2] <= cut - 500) t.shift();           // forget long-expired corners
    if (src.length < 2 || !(src.at(-1)[2] > cut)) return [];
    let i = 0; while (i < src.length - 2 && src[i + 1][2] <= cut) i++;
    const out = [];
    for (let j = i; j < src.length; j++) { const p = src[j];
      if (j === i && p[2] < cut) { const b = src[j + 1], k = (cut - p[2]) / (b[2] - p[2]); out.push([p[0] + (b[0] - p[0]) * k, p[1] + (b[1] - p[1]) * k, this.life]); }
      else out.push([p[0], p[1], Math.max(0, now - p[2])]); }
    return out;
  }
  input(o) { const n = performance.now(); if (o.turn || o.use || o.sw || n - this.lastSend > 50) { this.lastSend = n; this.ws.readyState === 1 && this.ws.send(JSON.stringify({ t: 'i', ...o })); } }
}
