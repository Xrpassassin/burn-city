// Authoritative simulation for both modes. Clients only send inputs; server owns all state,
// collisions and damage. Numbers are quantized in snapshots to keep bandwidth small.
const Heli = require('./heli');   // helicopter finale (Night Shift ch. 4)
const C = require('./config'), Z = require('./cod'), Quest = require('./quest'), IFRAME = +(process.env.ZOMBIE_IFRAME || 1), SPAWN_GAP = +(process.env.ZOMBIE_SPAWN_GAP || 1.8), REGEN_DELAY = +(process.env.ZOMBIE_REGEN_DELAY || 3.5), REGEN_RATE = +(process.env.ZOMBIE_REGEN_RATE || 22), HS_LAT = 0.3, HS_BONUS = 40, TEST_GOD = process.env.ZOMBIE_TEST_GOD === '1' && !process.env.FLY_APP_NAME;   // local screenshot runs only
// between-round upgrade draft (Mortuus-style): after each cleared wave every standing player picks 1 of 3 stacking boons
const DRAFT = { dmg: ['Searing Fuel', '+12% damage', 5, '🔥'], fuel: ['Deep Tanks', '+25% fuel refill', 4, '⛽'], armor: ['Slag Plating', '-10% damage taken', 3, '🛡️'], hp: ['Thick Skin', '+20 max health', 5, '❤️'],
  pts: ['Bounty Hunter', '+15% kill points', 4, '💰'], regen: ['Second Wind', 'Faster health regen', 3, '🌬️'], range: ['Long Reach', '+8% weapon range', 3, '🎯'], hs: ['Executioner', '+25% headshot damage', 3, '💀'],
  crit: ['Flashpoint', '7% chance a hit flares for 2.5x damage', 3, '✴️'], rof: ['Overpressure', '+8% fire rate · 8% less fuel burn', 3, '⏩'] };
const bon = (p, k) => (p.bon && p.bon[k]) || 0, maxHp = p => (Z.has(p, 'jug') ? 250 : 100) + 20 * bon(p, 'hp');
// effective weapon range (m) right now: gun in hand (Forged = +15%) x Long Reach boon (+8% per level); downed = last-stand pistol (17 m, 22 m if any gun is Forged).
// The server fires with exactly this number and sends it in the snapshot (field 21) so the client's auto-fire reach follows weapon swaps, Forge and boons.
const LS_RANGE = 17, LS_RANGE_HOT = 22, REACH_PER = 0.08;
const fireRange = p => p.down ? (p.up && p.up.length ? LS_RANGE_HOT : LS_RANGE) : Z.wpn(p).range * (1 + REACH_PER * bon(p, 'range'));
function offerDraft(p, ev) { const ks = Object.keys(DRAFT).filter(k => bon(p, k) < DRAFT[k][2]); for (let i = ks.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [ks[i], ks[j]] = [ks[j], ks[i]]; }
  p.draft = ks.slice(0, 3); if (p.draft.length) ev.push({ e: 'draft', id: p.id, o: p.draft.map(k => [k, DRAFT[k][0], DRAFT[k][1], bon(p, k), DRAFT[k][3]]) }); else p.draft = null; }
function takeDraft(p, i, ev) { const k = p.draft?.[i]; if (!k) return; p.bon ||= {}; p.bon[k] = bon(p, k) + 1; p.draft = null; if (k === 'hp') p.hp += 20; ev.push({ e: 'drafted', id: p.id, k, n: DRAFT[k][0], lv: p.bon[k], ic: DRAFT[k][3] }); }
const HPM = [1, 0.5, 3, 7, 0.6, 0.35], SPM = [1, 1, 0.6, 0.55, 1.75, 1.55], ZPTS = [60, 80, 130, 350, 110, 90], ZHIT = [12, 12, 22, 30, 12, 8];
// 3D aim (pitch): eye height, max pitch (~80°) and a vertical hit test. The aim line from the eye, pitched, must pass within a zombie's
// height band at its horizontal distance (forgiving band grows a little with distance, so flat aim still hits crawlers like before).
const EYE = 1.6, PMAX = 1.4, zTop = zb => (zb.cr || zb.ty === 4 || zb.ty === 5) ? 0.9 : zb.ty === 3 ? 2.3 : 1.9;
const aimY = (p, along) => (p.y || 0) + EYE + Math.tan(p.pitch || 0) * along;
function vAim(p, zb, along, extra = 0) { const ay = aimY(p, along), b = zb.y || 0, tol = 0.6 + 0.08 * along + extra; return ay >= b - tol && ay <= b + zTop(zb) + tol; }
const hsV = (p, zb, along) => aimY(p, along) > (zb.y || 0) + zTop(zb) * 0.55;
// horizontal reach of a pitched shot, and where a miss ends (own floor when aiming down)
const reachH = (p, r) => r * Math.cos(p.pitch || 0), missD = (p, r) => (p.pitch || 0) < -0.05 ? Math.min(r, EYE / Math.tan(-p.pitch)) : r;
const endY = (p, d) => Math.max((p.y || 0) - 6, Math.min((p.y || 0) + 12, (p.y || 0) + Math.tan(p.pitch || 0) * d));
const W = 120;                      // world half-size (city streets span -W..W)
const q = v => Math.round(v * 10) / 10;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const LIFE = 4;                     // tron: seconds a trail segment lives before it fades out and stops killing
// high-contrast neon palette; a color is only reused once its rider has left the room
const TEAM_COLORS = ['#ff3b30', '#2f8cff', '#2bd96b', '#ffcc00'], TEAM_NAMES = ['Red', 'Blue', 'Green', 'Gold'];
const PALETTE = ['#00f0ff', '#ff2bd6', '#39ff14', '#ffe600', '#ff6a00', '#8a5cff', '#ff1744', '#00ffa3', '#ffffff', '#2979ff', '#ff9ec4', '#b6ff00', '#00b3ff', '#ffb300', '#d500f9', '#76ffde'];

class Room {
  constructor(id, mode, mapId = null) { this.born = Date.now(); this.id = id; this.mode = mode; this.mapId = mapId === 'refinery' ? 'refinery' : null; this.players = new Map(); this.t = 0; this.events = []; this.nextId = 1; this.reset(); }
  get full() { if (this.tl) return this.tl.state !== 'lobby' || this.players.size >= (this.tl.max || 8); return this.ranked ? (this.ranked.state !== 'lobby' || this.players.size >= this.ranked.max) : this.players.size >= C.ROOM_SIZE; }
  add(p) { const used = new Set([...this.players.values()].map(o => o.color)); p.color = PALETTE.find(c => !used.has(c)) || PALETTE[this.nextId % PALETTE.length]; p.id = this.nextId++; this.players.set(p.id, p); this.spawn(p); this.events.push({ e: 'spawn', id: p.id, x: q(p.x), z: q(p.z), t: ms(this.t) }); return p.id; }
  roster() { return [...this.players.values()].map(p => [p.id, p.name, p.look || {}, p.color, p.team ?? null]); }
  // team mode: pick a team (1..n) or 0 = auto-balance to the smallest team
  setTeam(p, want) { const n = this.tl?.cfg.teams; if (!n) { p.team = null; return; } const cnt = Array(n).fill(0); for (const o of this.players.values()) if (o !== p && o.team) cnt[o.team - 1]++;
    p.team = want >= 1 && want <= n ? want : cnt.indexOf(Math.min(...cnt)) + 1; if (p.id) this.events.push({ e: 'team', id: p.id, team: p.team }); }
  remove(id) { const p = this.players.get(id); if (p && this.mode === 'zombie' && p.alive) this.life(p);
    if (p && this.tl?.state === 'live' && p.alive && this.mode === 'tron') { p.alive = false; this.tl.order.push({ id: p.id, acct: p.acct, team: p.team, t: this.t }); this.events.push({ e: 'crash', id: p.id, by: 0, x: q(p.x), z: q(p.z), t: ms(this.t) }); } this.players.delete(id); this.events.push({ e: 'leave', id }); }
  // ---------- shared ----------
  reset() {
    this.round = (this.round || 0) + 1;
    if (this.mode === 'zombie') { this.over = 0; this.zombies = new Map(); this.spawned = 0; this.wave = (!process.env.FLY_APP_NAME && +process.env.ZOMBIE_START_WAVE) || 0;   // start-wave override: local testing only
    this.score = 0; this.toSpawn = 0; this.waveDelay = 5; this.zid = 1; Heli.reset(this); this.onFlare = e => Heli.start(this, e); const oldM = this.M; Z.resetMap(this); if (oldM && oldM !== this.M) this.events.push({ e: 'map', map: Z.layout() }); for (const p of this.players.values()) Z.initPlayer(p); }
    else this.roundEnd = null;
    for (const p of this.players.values()) this.spawn(p);
    if (this.tl) this.tl.order = [];
    this.events.push({ e: 'round', n: this.round, t: ms(this.t), s: [...this.players.values()].map(p => [p.id, q(p.x), q(p.z)]) });
  }
  spawn(p) {
    const a = Math.random() * Math.PI * 2, r = this.mode === 'tron' ? 60 + Math.random() * 40 : 8 * Math.random();
    p.x = Math.cos(a) * r; p.z = Math.sin(a) * r; if (this.mode === 'zombie') { Z.bind(this); let best = null, bd = -1, arriving = false;
      if (this.arrivalSpawn && !p.arrivalSpawnUsed && Z.QDEF?.pad) {
        arriving = true;
        // Arrival flights use the map's authored helicopter pad once, then normal respawns use the Spawn Bay.
        const pad = Z.QDEF.pad, centre = [Z.WX(pad[0]), Z.WZ(pad[1])], index = Math.max(0, this.players.size - 1), angle = index * 2.399;
        best = [centre[0] + Math.cos(angle) * Math.min(1.5, index * 0.22), centre[1] + Math.sin(angle) * Math.min(1.5, index * 0.22)];
        p.arrivalSpawnUsed = true;
      } else {
        for (let k = 0; k < 20; k++) { const c = Z.zoneSpawn(), d = Math.min(99, ...[...(this.zombies?.values() || [])].map(z => Math.hypot(z.x - c[0], z.z - c[1]))); if (d > bd) { bd = d; best = c; } if (d > 8) break; }
      }
      [p.x, p.z] = best; p.inv = Math.max(p.inv || 0, arriving ? 5 : 2); p.lv = 0; p.y = 0; } p.alive = true; p.in = p.in || { mx: 0, mz: 0, fire: false, turn: 0 };
    if (this.mode === 'tron') {   // grid-aligned heading, pointed roughly inward
      p.dir = Math.abs(p.x) > Math.abs(p.z) ? (p.x > 0 ? 2 : 0) : (p.z > 0 ? 3 : 1);
      p.trail = [[p.x, p.z, this.t]]; p.turnCd = 0; p.deadT = null;
    } else { if (p.pts === undefined) Z.initPlayer(p); p.hp = maxHp(p); p.fuel = 100; p.yaw = 0; p.firing = false; p.down = 0; p.lifeKills = 0; p.lifeStart = this.t; }
  }
  input(p, m) {                  // validate + clamp everything a client sends
    if (this.mode === 'tron') { if (m.turn === -1 || m.turn === 1) p.in.turn = m.turn; }
    else {
      p.in.mx = clamp(+m.mx || 0, -1, 1); p.in.mz = clamp(+m.mz || 0, -1, 1);
      if (Number.isFinite(+m.yaw)) p.yaw = +m.yaw % (Math.PI * 2);
      p.in.fire = !!m.fire; if (m.use) p.in.use = true; if (m.hold !== undefined) p.in.hold = !!m.hold; if (m.sw && p.guns?.length > 1) p.slot = p.slot ? 0 : 1; if (m.pk === 0 || m.pk === 1 || m.pk === 2) p.in.pk = m.pk; if (Number.isFinite(+m.pi)) p.pitch = clamp(+m.pi, -PMAX, PMAX); if (m.vote) p.in.vote = true;
    }
  }
  step(dt) { this.t += dt; if (this.rng) { const R0 = Math.random; Math.random = this.rng; try { this.zomb(dt); } finally { Math.random = R0; } return; } this.mode === 'tron' ? this.tron(dt) : this.zomb(dt); }
  // ---------- TRON ----------
  tron(dt) {
    const SPEED = 22, DX = [1, 0, -1, 0], DZ = [0, 1, 0, -1];
    const ps = [...this.players.values()], tl = this.tl;
    if (tl && tl.state !== 'live') return;   // custom/ranked match: frozen in lobby and after the match
    if (this.roundEnd !== null) { if ((this.roundEnd -= dt) <= 0) this.reset(); return; }
    for (const p of ps) if (p.alive) {
      p.turnCd -= dt;
      if (p.in.turn && p.turnCd <= 0) { p.dir = (p.dir + (p.in.turn > 0 ? 1 : 3)) % 4; p.trail.push([p.x, p.z, this.t]); p.turnCd = 0.12; p.turns = (p.turns || 0) + 1; this.events.push({ e: 'turn', id: p.id, x: q(p.x), z: q(p.z), d: p.dir, t: ms(this.t) }); }
      p.in.turn = 0;
      p.px = p.x; p.pz = p.z; p.x += DX[p.dir] * SPEED * dt; p.z += DZ[p.dir] * SPEED * dt;
    }
    for (const p of ps) expire(p, this.t - LIFE);   // dead riders' walls keep fading too
    // collisions: movement segment vs every trail segment (incl. other heads' live segments)
    for (const p of ps) if (p.alive) {
      let dead = Math.abs(p.x) > W || Math.abs(p.z) > W, killer = null;
      for (const o of ps) { if (dead) break; if (o !== p && tl?.cfg.teams && !tl.cfg.ff && o.team === p.team) continue;   // teammates' trails optional
        const pts = o.trail.length ? o.trail.concat(o.alive ? [[o.x, o.z]] : []) : [];
        const n = o === p ? pts.length - 3 : pts.length - 1;   // skip own live segment + the corner it turned from
        for (let i = 0; i < n; i++) if (hit(p.px, p.pz, p.x, p.z, pts[i], pts[i + 1])) { dead = true; killer = o.id; break; }
      }
      if (dead) p.dead = killer ?? 0;
    }
    for (const p of ps) if (p.dead !== undefined) { p.alive = false; p.trail.push([p.x, p.z, this.t]); p.deadT = this.t; if (tl) tl.order.push({ id: p.id, acct: p.acct, team: p.team, t: this.t }); this.events.push({ e: 'crash', id: p.id, by: p.dead, x: q(p.x), z: q(p.z), t: ms(this.t) }); delete p.dead; }
    const alive = ps.filter(p => p.alive);
    if (tl && tl.cfg.teams) {   // team mode: a team wins when it has the last rider(s) alive
      const present = new Set([...ps.map(p => p.team), ...tl.order.map(o => o.team)]), aliveT = new Set(alive.map(p => p.team));
      if (ps.length && (aliveT.size === 0 || (present.size > 1 && aliveT.size <= 1))) {
        const lastT = tl.order.length ? tl.order.at(-1).t : this.t, winT = aliveT.size ? [...aliveT] : [...new Set(tl.order.filter(o => o.t === lastT).map(o => o.team))].sort();   // simultaneous wipe = draw between those teams
        this.roundEnd = 3; this.events.push({ e: 'win', team: winT.length === 1 ? winT[0] : 0, teams: winT }); this.onRound?.({ teams: winT, alive: alive.map(p => p.id) });
      }
    } else if (ps.length && alive.length <= (ps.length > 1 ? 1 : 0)) {
      this.roundEnd = 3; this.events.push({ e: 'win', id: alive[0]?.id ?? 0 });
      if (tl) {   // FFA placement: survivors first, then reverse crash order; same-tick crashes share a place
        const place = new Map(); let k = 1; for (const p of alive) place.set(p.id, k); k += alive.length ? 1 : 0;
        const ticks = [...new Set(tl.order.map(o => o.t))].sort((a, b) => b - a);
        for (const t of ticks) { const g = tl.order.filter(o => o.t === t); for (const o of g) place.set(o.id, k); k += g.length; }
        this.onRound?.({ place });
      }
    }
  }
  // ---------- ZOMBIE SURVIVAL ----------
  zomb(dt) { Z.bind(this);
    const ps = [...this.players.values()].filter(p => !p.away), MAX_Z = 40, ev = this.events;
    if (!ps.length) return;   // empty, or everyone briefly disconnected: the match holds until they're back
    if (this.ranked && this.ranked.state !== 'live') return;   // lobby: nothing spawns, nobody can be hurt
    if (this.ranked && this.t - this.ranked.startT > this.ranked.cap) { for (const p of ps) if (p.alive) { this.life(p); p.alive = false; } this.ranked.state = 'over'; return; }   // time cap
    if (this.over > 0) { if ((this.over -= dt) <= 0) this.reset(); return; }   // show game-over screen before restarting
    this.dtNow = dt; Z.tickBox(this, ev);
    if (this.toSpawn === 0 && this.zombies.size === 0) {        // next wave
      if (!this.ranked && this.wave >= 1 && this.drafted !== this.wave) { this.drafted = this.wave; for (const p of ps) if (p.alive && !p.down && !p.spectator) offerDraft(p, ev); }
      Quest.onBreak(this, ev);   // between rounds: the next radio call (once per break)
      if ((this.waveDelay -= dt) <= 0) { this.wave++; const np = Math.max(1, ps.filter(p => !p.spectator).length); this.toSpawn = Math.round((6 + this.wave * 4) * Z.scaleN(np)); this.waveTotal = this.toSpawn; this.spawnT = 2.5; this.waveDelay = Z.waveGap(np); ev.push({ e: 'wave', n: this.wave }); for (const p of ps) if (p.draft) takeDraft(p, 0, ev);
        for (const p of ps) if (!p.alive && !this.ranked) { this.spawn(p); ev.push({ e: 'spawn', id: p.id, x: q(p.x), z: q(p.z) }); } }
    }
    // paced spawning: one zombie per gap instead of all at once. The gap starts at SPAWN_GAP, tightens a little each wave, and
    // stretches out as the wave goes on (up to ~1.9x by the last zombie), so a round builds and then thins. Alive count is capped per wave too.
    const npl = Math.max(1, ps.filter(p => !p.spectator).length), capZ = Math.min(MAX_Z, Math.round((6 + this.wave * 2.5) * Math.sqrt(npl)));
    this.spawnT = (this.spawnT ?? 0) - dt;
    while (this.toSpawn > 0 && this.zombies.size < capZ && this.spawnT <= 0) {    // trickle in through windows of unlocked zones
      const prog = 1 - this.toSpawn / Math.max(1, this.waveTotal || this.toSpawn);
      this.spawnT += Math.max(0.55, SPAWN_GAP * Math.pow(0.95, this.wave - 1)) * (1 + 0.9 * prog) / Math.sqrt(npl) * (0.8 + Math.random() * 0.4);
      const wi = Z.windowSpawn(this), wn = Z.WINDOWS[wi], [sx, sz] = wn ? [wn.ox + (wn.ox - wn.x) * 3 + (Math.random() - .5) * 3, wn.oz + (wn.oz - wn.z) * 3 + (Math.random() - .5) * 3] : Z.zoneSpawn(this); this.toSpawn--; this.spawned++;
      const roll = Math.random(), sr = this.ranked ? 1 : Math.random(), wv = this.wave;   // specials (not in ranked): 3 Juggernaut, 4 Lope (runs on its arms), 5 Skitter
      const ty = wv >= 5 && sr < 0.035 ? 3 : wv >= 4 && sr < 0.11 ? 4 : wv >= 6 && sr < 0.17 ? 5 : wv >= 2 && roll < 0.18 ? 1 : wv >= 3 && roll > 0.9 ? 2 : 0;   // 1 runner (fast, frail), 2 brute (slow, tanky)
      const base = (60 + this.wave * 15) * (this.mod?.hp || 1) * Z.hpN(Math.max(1, ps.filter(p => !p.spectator).length)), sp = (2.2 + Math.min(this.wave * 0.25, 2.5) + Math.random()) * (this.mod?.sp || 1);
      this.zombies.set(this.zid, { id: this.zid++, ty, x: sx, z: sz, lv: wn?.lv || 0, y: (wn?.lv || 0) * Z.UH, hp: base * HPM[ty], maxhp: base * HPM[ty], sp: sp * (ty === 1 ? Z.RUNNER : SPM[ty]), win: wn ? wi : null, ph: 0 });
    }
    if (this.spawnT < 0) this.spawnT = 0;   // no banked burst while the alive cap is full
    const hurt = (zb, amt, p, hs = 0, dot = false) => { let d = amt * (Z.has(p, 'dbl') ? 2 : 1) * (hs ? hs * (1 + 0.25 * bon(p, 'hs')) : 1) * (1 + 0.12 * bon(p, 'dmg'));
      if (!dot && bon(p, 'crit') && Math.random() < 0.07 * bon(p, 'crit')) { d *= 2.5; p._cr = 1; }   // Flashpoint boon
      if (!dot && Z.has(p, 'burn') && zb.hp > 0) { zb.dot = Math.min((zb.dot || 0) + d * 0.35, zb.maxhp || 1e9); zb.dotBy = p.id; }   // Afterburn perk: 35% extra as burn over ~2 s
      zb.hs = hs ? 1 : 0; if (hs) p._hs = 1; const _ = 0, real = Math.min(d, Math.max(0, zb.hp)); zb.hp -= d; if (!this.ranked && !zb.crR && zb.hp > 0 && zb.maxhp && zb.hp < zb.maxhp * 0.4 && zb.ty <= 1) { zb.crR = 1; if (Math.random() < 0.3) { zb.cr = 1; zb.sp *= 0.45; } } zb.burn = 1; zb.by = p.id; if (real > 0) p._hm = Math.max(p._hm || 0, zb.hp <= 0 ? 2 : 1);
      p.ptsAcc += real * 0.2; if (p.ptsAcc >= 1) { const k = Math.floor(p.ptsAcc); p.pts += k; p.ptsAcc -= k; } };   // points per hit (by damage dealt)
    const up = ps.filter(p => p.alive && !p.down && !p.aboard), AIM = { vAim, hsV, reachH, missD, endY, hurt };
    // Last stand: downed players crawl and fire a BURN pistol (hotter if they own any Forged gun)
    const lastStand = (p, dt) => { const s = Math.sin(p.yaw), c = Math.cos(p.yaw), CR = 1.6; let vx = p.in.mz * s - p.in.mx * c, vz = p.in.mz * c + p.in.mx * s; const l = Math.hypot(vx, vz); if (l > 1) { vx /= l; vz /= l; }
      const nx = clamp(p.x + vx * CR * dt, -W, W), nz = clamp(p.z + vz * CR * dt, -W, W); if (Z.inside(this, nx, p.z, 0.42, p.lv)) p.x = nx; if (Z.inside(this, p.x, nz, 0.42, p.lv)) p.z = nz; Z.lift(p);
      const hot = !!(p.up && p.up.length), dmg = hot ? 85 : 42, range = hot ? LS_RANGE_HOT : LS_RANGE, cd = hot ? 0.28 : 0.42, splash = hot ? 1.3 : 0; p.cd = Math.max(0, (p.cd || 0) - dt);
      if (!(p.in.fire && p.cd <= 0)) return; p.cd = cd; p.firing = true; let hit = null, hd = reachH(p, range);
      for (const zb of this.zombies.values()) { const dx = zb.x - p.x, dz = zb.z - p.z, along = dx * s + dz * c, lat = Math.abs(dx * c - dz * s); if (along > 0 && along < hd && lat < 0.9 && vAim(p, zb, along) && Z.los(this, p.x, p.z, zb.x, zb.z, p.y, zb.y)) { hd = along; hit = zb; hit._lat = lat; hit._hv = hsV(p, zb, along); } }
      let ex = p.x + s * hd, ez = p.z + c * hd; if (!hit) { let d2 = missD(p, reachH(p, range)); while (d2 > 1 && !Z.los(this, p.x, p.z, p.x + s * d2, p.z + c * d2, p.y)) d2 -= 0.7; ex = p.x + s * d2; ez = p.z + c * d2; }
      if (hit) for (const zb of this.zombies.values()) { if (zb === hit) hurt(zb, dmg, p, hit._lat < HS_LAT && hit._hv ? 2 : 0); else if (splash && Math.hypot(zb.x - ex, zb.z - ez) < splash) hurt(zb, dmg * 0.4, p); }
      ev.push({ e: 'shot', id: p.id, w: 'napalm', x: q(p.x), z: q(p.z), tx: q(ex), tz: q(ez), ty: hit ? q(hit.y || 0) : q(endY(p, Math.hypot(ex - p.x, ez - p.z))), ray: 1, ls: hot ? 2 : 1 }); };
    if ((this.flowT = (this.flowT || 0) - dt) <= 0) { this.flowT = 0.25; Z.flow(this, up); }   // refresh the zombie flow field 4x/s
    for (const p of ps) if (p.alive) {
      if (p.down) {   // downed: bleed out unless revived (teammate stands close) or Phoenix self-revive (solo)
        p.firing = false; p.in.use = false; p.in.pk = null; const helper = up.find(o => Math.hypot(o.x - p.x, o.z - p.z) < Z.REVIVE_R && Math.abs((o.y || 0) - (p.y || 0)) < 1.3);
        if (p.selfRev) { if ((p.selfRev -= dt) <= 0) { p.down = 0; p.selfRev = 0; p.hp = 60; ev.push({ e: 'revived', id: p.id, by: p.id }); } continue; }
        if (helper) { p.revNeed = Z.has(helper, 'revive') ? 1.5 : 4; p.revT = (p.revT || 0) + dt; p.revBy = helper.id;
          if (p.revT >= p.revNeed) { p.down = 0; p.revT = 0; p.hp = 50; helper.pts += 50;   // a revive hands back one random perk you held before going down
            const had = []; for (let i = 0, v = p.prevPerks || 0; v; i++, v >>= 1) if (v & 1) had.push(i); const keep = had.length ? had[Math.floor(Math.random() * had.length)] : -1;
            if (keep >= 0) p.perks |= 1 << keep; p.prevPerks = 0; ev.push({ e: 'revived', id: p.id, by: helper.id, ...(keep >= 0 ? { kp: Z.PERKS[keep]?.k } : {}) }); continue; } }
        else { p.revT = 0; p.revBy = null; }
        if ((!helper && (p.bleed -= dt) <= 0) || !up.length) { p.down = 0; p.alive = false; p.prevPerks = 0; this.life(p); ev.push({ e: 'down', id: p.id }); continue; }   // bleed-out clock pauses while a teammate is reviving
        lastStand(p, dt);   // crawl + BURN pistol while down
        continue;
      }
      { const mx = maxHp(p); if (p.hp < mx && this.t - (p.hurtT ?? -99) > REGEN_DELAY - 0.8 * bon(p, 'regen')) p.hp = Math.min(mx, p.hp + REGEN_RATE * (Z.has(p, 'jug') ? 1.5 : 1) * (1 + 0.35 * bon(p, 'regen')) * dt); }
      if (p.in.pk != null) { takeDraft(p, p.in.pk, ev); p.in.pk = null; }   // health regen after a few seconds without damage
      if (p.aboard) { Heli.rider(this, p, dt, ev, AIM); continue; }   // seated in the helicopter: vote / minigun only
      if (p.in.use) { p.in.use = false; if (!Quest.use(this, p, ev)) Z.use(this, p, ev); } Z.repair(this, p, dt, ev);
      const s = Math.sin(p.yaw), c = Math.cos(p.yaw), SP = Z.has(p, 'speed') ? 8.2 : 6;           // move relative to view
      let vx = p.in.mz * s - p.in.mx * c, vz = p.in.mz * c + p.in.mx * s; const l = Math.hypot(vx, vz); if (l > 1) { vx /= l; vz /= l; }
      const nx = clamp(p.x + vx * SP * dt, -W, W), nz = clamp(p.z + vz * SP * dt, -W, W);   // stay inside unlocked zones (doors = barriers)
      if (Z.inside(this, nx, p.z, 0.42, p.lv)) p.x = nx; if (Z.inside(this, p.x, nz, 0.42, p.lv)) p.z = nz; Z.lift(p);
      const w0 = Z.wpn(p), ro = bon(p, 'rof'), w = bon(p, 'range') || bon(p, 'fuel') || ro ? { ...w0, range: fireRange(p), regen: w0.regen * (1 + 0.25 * bon(p, 'fuel')), use: w0.use * (1 - 0.08 * ro), cd: w0.cd && w0.cd * (1 - 0.08 * ro) } : w0, quick = Z.has(p, 'quick'); p.cd = Math.max(0, p.cd - dt);
      if (w.kind === 'cone' || w.kind === 'beam') {
        p.firing = p.in.fire && p.fuel > 0; p.fuel = clamp(p.fuel + (p.firing ? -w.use : w.regen * (quick ? 2 : 1)) * dt, 0, 100);
        if (p.firing) for (const zb of this.zombies.values()) { const dx = zb.x - p.x, dz = zb.z - p.z, d = Math.hypot(dx, dz), along = dx * s + dz * c;
          if (d >= w.range || d <= 0 || along <= 0) continue;
          if ((w.kind === 'beam' ? Math.abs(dx * c - dz * s) < w.width : along / d > w.cos) && vAim(p, zb, along, w.kind === 'beam' ? w.width : along * Math.sqrt(Math.max(0, 1 - w.cos * w.cos)) / Math.max(0.2, w.cos)) && Z.los(this, p.x, p.z, zb.x, zb.z, p.y, zb.y)) hurt(zb, w.dps * dt * (w.kind === 'beam' ? 1 : 1 - d / w.range * 0.5), p, w.kind === 'beam' && Math.abs(dx * c - dz * s) < HS_LAT ? 1.5 : 0); }
      } else {
        p.fuel = clamp(p.fuel + w.regen * (quick ? 2 : 1) * dt, 0, 100); p.firing = false;
        if (p.in.fire && p.cd <= 0 && p.fuel >= w.use) { p.fuel -= w.use; p.cd = w.cd * (quick ? 0.6 : 1); p.firing = true;
          if (w.kind === 'burst') { for (const zb of this.zombies.values()) { const dx = zb.x - p.x, dz = zb.z - p.z, d = Math.hypot(dx, dz); if (d < w.range && d > 0 && (dx * s + dz * c) / d > w.cos && vAim(p, zb, dx * s + dz * c, (dx * s + dz * c) * Math.sqrt(Math.max(0, 1 - w.cos * w.cos)) / Math.max(0.2, w.cos)) && Z.los(this, p.x, p.z, zb.x, zb.z, p.y, zb.y)) hurt(zb, w.dmg * (1 - d / w.range * 0.6), p, Math.abs(dx * c - dz * s) < HS_LAT ? 1.5 : 0); }
            ev.push({ e: 'shot', id: p.id, w: w.id, x: q(p.x), z: q(p.z), y: Math.round(p.yaw * 100) / 100, pi: Math.round((p.pitch || 0) * 100) / 100 }); }
          else if (w.kind === 'ray') { let hit = null, hd = reachH(p, w.range); for (const zb of this.zombies.values()) { const dx = zb.x - p.x, dz = zb.z - p.z, along = dx * s + dz * c, lat = Math.abs(dx * c - dz * s); if (along > 0 && along < hd && lat < 0.9 && vAim(p, zb, along) && Z.los(this, p.x, p.z, zb.x, zb.z, p.y, zb.y)) { hd = along; hit = zb; hit._lat = lat; hit._hv = hsV(p, zb, along); } }
            let ex = p.x + s * hd, ez = p.z + c * hd; if (!hit) { let d2 = missD(p, reachH(p, w.range)); while (d2 > 1 && !Z.los(this, p.x, p.z, p.x + s * d2, p.z + c * d2, p.y)) d2 -= 0.7; ex = p.x + s * d2; ez = p.z + c * d2; }
            if (hit) { for (const zb of this.zombies.values()) { const d = Math.hypot(zb.x - ex, zb.z - ez); if (zb === hit) hurt(zb, w.dmg, p, hit._lat < HS_LAT && hit._hv ? 2 : 0); else if (d < w.splash && Math.abs((zb.y || 0) - (hit.y || 0)) < 1.5) hurt(zb, w.dmg * 0.4, p); } }
            ev.push({ e: 'shot', id: p.id, w: w.id, x: q(p.x), z: q(p.z), tx: q(ex), tz: q(ez), ty: hit ? q(hit.y || 0) : q(endY(p, Math.hypot(ex - p.x, ez - p.z))), ray: 1 }); }
          else { let dist = clamp(14 + (p.pitch || 0) * 30, 5, 24); while (dist > 1 && !Z.los(this, p.x, p.z, p.x + s * dist, p.z + c * dist, p.y)) dist -= 0.7; const tx = p.x + s * dist, tz = p.z + c * dist;   // napalm lands short of walls this.proj.push({ x: tx, z: tz, t: 0.6, by: p.id, w });
            ev.push({ e: 'shot', id: p.id, w: w.id, x: q(p.x), z: q(p.z), tx: q(tx), tz: q(tz) }); } }
      }
    }
    for (let i = this.proj.length - 1; i >= 0; i--) { const pr = this.proj[i]; if ((pr.t -= dt) > 0) continue; this.proj.splice(i, 1); const p = this.players.get(pr.by);
      if (p) for (const zb of this.zombies.values()) { const d = Math.hypot(zb.x - pr.x, zb.z - pr.z); if (d < pr.w.splash) hurt(zb, pr.w.dmg * (1 - d / pr.w.splash * 0.5), p); }
      this.pools.push({ x: pr.x, z: pr.z, t: pr.w.pool, by: pr.by, w: pr.w }); }
    for (let i = this.pools.length - 1; i >= 0; i--) { const pl = this.pools[i], p = this.players.get(pl.by); if ((pl.t -= dt) <= 0 || !p) { this.pools.splice(i, 1); continue; }
      for (const zb of this.zombies.values()) if (Math.hypot(zb.x - pl.x, zb.z - pl.z) < pl.w.splash) hurt(zb, pl.w.pdps * dt, p); }
    for (const p of this.players.values()) if (p.inv > 0) p.inv -= dt;
    for (const p of ps) if (p._hm) { ev.push({ e: 'hm', id: p.id, k: p._hm === 2 ? 1 : 0, hs: p._hs ? 1 : 0, ...(p._cr ? { cr: 1 } : {}) }); p._hm = 0; p._hs = 0; p._cr = 0; }
    Quest.tick(this, ps, ev); if (Heli.tick(this, ps, dt, ev)) return;
    this.zt = (this.zt || 0) + dt; if (!this.winLast) this.winLast = Z.WINDOWS.map(() => -99);
    for (const zb of this.zombies.values()) {
      if (zb.dot > 0 && zb.hp > 0) { const k = this.players.get(zb.dotBy), a = Math.min(zb.dot, Math.max(12, zb.dot * 0.6) * dt); zb.dot -= a; if (k) hurt(zb, a / ((Z.has(k, 'dbl') ? 2 : 1) * (1 + 0.12 * bon(k, 'dmg'))), k, 0, true); else zb.dot = 0; }   // Afterburn tick (already scaled when banked)
      if (zb.hp <= 0) { this.zombies.delete(zb.id); this.score += 10; const k = this.players.get(zb.by); if (k && Z.has(k, 'leech') && k.alive && !k.down) k.hp = Math.min(maxHp(k), k.hp + 8); if (k) { k.lifeKills++; k.pts += Math.round(((ZPTS[zb.ty] ?? 60) + (zb.hs ? HS_BONUS : 0)) * (1 + 0.15 * bon(k, 'pts'))); if (zb.hs) k.lifeHs = (k.lifeHs || 0) + 1; } ev.push({ e: 'zdie', id: zb.id, x: q(zb.x), z: q(zb.z), ty: zb.ty, hs: zb.hs ? 1 : 0 }); continue; }
      if (Z.atWindow(this, zb, dt, ev)) { zb.burn = Math.max(0, (zb.burn || 0) - dt); continue; }
      let best = null, bd = 1e9; for (const p of ps) if (p.alive && !p.down && !p.aboard) { const d = Math.hypot(p.x - zb.x, p.z - zb.z) + (Math.abs((p.y || 0) - (zb.y || 0)) > 1.3 ? 6 : 0); if (d < bd) { bd = d; best = p; } }   // another floor counts as further away
      if (!best) continue;
      const sameLv = Math.abs((best.y || 0) - (zb.y || 0)) < 1.3;
      if (bd > 1.1 || !sameLv) {   // follow the flow field; go straight only when close with a clear line
        let tx = best.x, tz = best.z; const st = Z.nextStep(this, zb.x, zb.z, zb.lv); if (st && !(bd < 3 && sameLv && Z.los(this, zb.x, zb.z, best.x, best.z, zb.y, best.y))) { tx = st[0]; tz = st[1]; }
        if (zb.ty === 3) { zb.chT = (zb.chT ?? 5) - dt; zb.charge = Math.max(0, (zb.charge || 0) - dt); if (zb.chT <= 0 && bd < 14 && sameLv && Z.los(this, zb.x, zb.z, best.x, best.z, zb.y, best.y)) { zb.chT = 7 + Math.random() * 3; zb.charge = 1.3; ev.push({ e: 'jcharge', id: zb.id }); } }
        const dx = tx - zb.x, dz = tz - zb.z, dl = Math.hypot(dx, dz) || 1, mv = zb.sp * (zb.charge > 0 ? 3.2 : 1) * dt, nx = zb.x + dx / dl * mv, nz = zb.z + dz / dl * mv;
        if (Z.inside(this, nx, zb.z, 0.32, zb.lv)) zb.x = nx; if (Z.inside(this, zb.x, nz, 0.32, zb.lv)) zb.z = nz;
        if (!Z.inside(this, zb.x, zb.z, 0.32, zb.lv) && st) { zb.x += (st[0] - zb.x) * Math.min(1, dt * 4); zb.z += (st[1] - zb.z) * Math.min(1, dt * 4); }   // never wedge into a corner
        Z.lift(zb);
        zb.mv = (zb.mv || 0) + Math.hypot(zb.x - (zb.lx ?? zb.x), zb.z - (zb.lz ?? zb.z)); zb.lx = zb.x; zb.lz = zb.z;
        if ((zb.stT = (zb.stT || 0) + dt) > 4) { if (zb.mv < 0.6) { const wi = Z.windowSpawn(this), w = Z.WINDOWS[wi]; if (w) { zb.x = w.ox; zb.z = w.oz; zb.lv = w.lv || 0; zb.y = zb.lv * Z.UH; zb.win = wi; zb.ph = 0; this.stuckN = (this.stuckN || 0) + 1; } } zb.stT = 0; zb.mv = 0; }   // stuck safety net: re-enter via a window
      }
      else if (!(best.inv > 0) && (ev.push({ e: 'phit', id: best.id, x: q(zb.x), z: q(zb.z), ty: zb.ty }), best.inv = IFRAME, best.hurtT = this.t, Z.has(best, 'slag') && (hurt(zb, 120 + 20 * this.wave, best), ev.push({ e: 'slag', id: best.id, zid: zb.id })), (best.hp -= (TEST_GOD ? 0 : (ZHIT[zb.ty] ?? 12) * (zb.charge > 0 ? 1.5 : 1) * (1 - 0.1 * bon(best, 'armor'))) * Math.max(IFRAME, 0.05)) <= 0)) {   // discrete hit + i-frames (same avg DPS); Slag Skin burns the attacker
        const others = ps.some(o => o !== best && o.alive && !o.down), phoenix = Z.has(best, 'revive');
        best.hp = 0; best.prevPerks = best.perks; best.perks = phoenix && !others ? best.perks & ~Z.PB.revive : 0;   // going down costs your perks (Phoenix is used up on a solo self-revive)
        if (phoenix && !others && !best.usedSelf) { best.down = 1; best.selfRev = 3; best.usedSelf = true; ev.push({ e: 'downed', id: best.id, self: 1 }); }
        else if (others) { best.down = 1; best.bleed = 30; best.revT = 0; ev.push({ e: 'downed', id: best.id }); }
        else { best.alive = false; this.life(best); ev.push({ e: 'down', id: best.id }); }
      }
      zb.burn = Math.max(0, (zb.burn || 0) - dt);
    }
    for (const p of ps) if (p.alive && !p.down && Z.has(p, 'valve') && p.hp < maxHp(p) * 0.35 && this.t >= (p.valveT || 0)) {   // Pressure Valve: fire nova + shove, then a 30 s recharge
      p.valveT = this.t + 30; p.inv = Math.max(p.inv || 0, 1.5); ev.push({ e: 'nova', id: p.id, x: q(p.x), z: q(p.z), y: q(p.y || 0) });
      for (const zb of this.zombies.values()) { if (zb.win != null || Math.abs((zb.y || 0) - (p.y || 0)) > 1.5) continue; const dx = zb.x - p.x, dz = zb.z - p.z, d = Math.hypot(dx, dz); if (d > 5) continue;
        hurt(zb, 250 + 40 * this.wave, p); const k = (5 - d) * 0.6 / (d || 1), nx = zb.x + dx * k, nz = zb.z + dz * k; if (Z.inside(this, nx, nz, 0.32, zb.lv)) { zb.x = nx; zb.z = nz; } } }
    const zl = [...this.zombies.values()].filter(z => z.win == null); for (let i = 0; i < zl.length; i++) for (let j = i + 1; j < zl.length; j++) { const a = zl[i], b = zl[j], dx = b.x - a.x, dz = b.z - a.z, d = Math.hypot(dx, dz);   // light crowd separation
      if (d < 0.7 && d > 1e-3 && Math.abs((a.y || 0) - (b.y || 0)) < 1.3) { const k = (0.7 - d) / d * 0.25, ax = a.x - dx * k, az = a.z - dz * k, bx = b.x + dx * k, bz = b.z + dz * k; if (Z.inside(this, ax, az, 0.3, a.lv)) { a.x = ax; a.z = az; } if (Z.inside(this, bx, bz, 0.3, b.lv)) { b.x = bx; b.z = bz; } } }
    const anyUp = ps.some(p => p.alive && (!p.down || p.selfRev));
    if (this.ranked) { if (!anyUp && this.ranked.state === 'live') { for (const p of ps) if (p.alive) { p.alive = false; p.down = 0; this.life(p); } this.ranked.state = 'over'; } return; }
    if (!anyUp) { for (const p of ps) { p.alive = false; p.down = 0; } ev.push({ e: 'gameover', score: this.score, wave: this.wave, in: 5 }); this.over = 5; }
  }
  life(p) {
    if (this.ranked) {   // one life per paid entry; result kept even if the player disconnects
      if (p.lifeDone || this.ranked.state !== 'live') return; p.lifeDone = true;
      const r = { acct: p.acct, ip: p.ip, ticket: p.ticket, paidAt: p.paidAt, kills: p.lifeKills, secs: this.t - p.lifeStart, wave: this.wave, spawned: this.spawned };
      this.ranked.results.set(p.acct, r); this.events.push({ e: 'ranked_down', id: p.id, kills: r.kills, wave: r.wave }); return;
    }
    this.onLife?.({ acct: p.acct, kills: p.lifeKills, wave: this.wave, secs: this.t - p.lifeStart });
  }
  snapshot() {
    const P = [...this.players.values()].map(p => this.mode === 'tron'
      ? [p.id, q(p.x), q(p.z), p.dir, p.alive ? 1 : 0]
      : [p.id, q(p.x), q(p.z), Math.round(p.yaw * 100) / 100, p.alive ? 1 : 0, Math.round(p.hp), Math.round(p.fuel), p.firing ? 1 : 0, p.pts | 0, Z.WI[p.guns[p.slot]] ?? 0, p.perks, p.down ? (p.revT > 0 || p.selfRev ? 2 : 1) : 0, p.guns[1 - p.slot] ? Z.WI[p.guns[1 - p.slot]] : -1, p.inv > 0 && !p.aboard ? 1 : 0, Z.upBits(p), p.down && p.bleed > 0 ? Math.ceil(p.bleed) : 0, p.down && p.revT > 0 && p.revNeed ? Math.round(p.revT / p.revNeed * 100) : 0, p.down && p.up && p.up.length ? 1 : 0, q(p.y || 0), this.quest?.it?.by === p.id ? this.quest.it.kind : 0, Math.round((p.pitch || 0) * 100) / 100, q(fireRange(p))]);
    const s = { t: 's', ts: ms(this.t), p: P };
    if (this.ranked) s.rk = [this.ranked.state, this.ranked.countdown === null ? 0 : Math.ceil(this.ranked.countdown), this.players.size, this.ranked.id];
    if (this.tl) { const k = this.tl, cr = k.ranked ? [...this.players.values()].find(p => p.acct === k.creatorAcct)?.id : k.creatorId;
      s.tl = [k.state, k.countdown == null ? 0 : Math.ceil(k.countdown), k.id, cr ?? 0, k.cfg.teams, k.cfg.ff ? 1 : 0, k.cfg.bo3 ? 1 : 0, k.round || 0, k.ranked ? 1 : 0, k.wins || {}]; }
    if (this.mode === 'zombie') { s.m = [this.open, this.box.spot, this.box.state, this.power ?? 1]; s.b = this.boards; s.z = [...this.zombies.values()].map(z => [z.id, q(z.x), q(z.z), z.burn > 0 || z.dot > 0 ? 1 : 0, z.ty, (z.cr ? 1 : 0) | (z.charge > 0 ? 2 : 0) | (z.win != null ? 4 : 0), q(z.y || 0)]); s.w = this.wave; s.sc = this.score; if (this.quest) s.q = Quest.snap(this); if (this.heli) s.h = Heli.snap(this); }
    if (this.events.length) { s.ev = this.events; this.events = []; }
    return s;
  }
  init(me) {   // full state for a joiner (trails included)
    if (this.mode === 'zombie') Z.bind(this);
    return { t: 'init', me, mode: this.mode, room: this.id, round: this.round, hz: C.SNAP_HZ, world: W,
      roster: this.roster(), trails: this.mode === 'tron' ? [...this.players.values()].map(p => [p.id, p.trail.map(([x, z, t]) => [q(x), q(z), ms(t)])]) : undefined, life: LIFE * 1000, map: this.mode === 'zombie' ? Z.layout() : undefined, qnote: this.quest?.note || undefined };
  }
}
const ms = t => Math.round(t * 1000);
// drop trail points older than the cutoff; the oldest kept segment is clipped where it was laid at `cut`
// (timestamped corners + constant speed -> exact). Live head counts as laid "now"; dead riders' last point is their crash.
function expire(p, cut) {
  const T = p.trail; if (!T || !T.length) return;
  const pts = p.alive ? T.concat([[p.x, p.z, cut + LIFE]]) : T;
  if (pts.at(-1)[2] <= cut) { T.length = 0; return; }
  let i = 0; while (pts[i + 1][2] <= cut) i++;
  if (pts[i][2] < cut) { const a = pts[i], b = pts[i + 1], k = (cut - a[2]) / (b[2] - a[2]);
    a[0] += (b[0] - a[0]) * k; a[1] += (b[1] - a[1]) * k; a[2] = cut; }
  if (i) T.splice(0, Math.min(i, T.length));
}
function hit(ax, az, bx, bz, p, r) {      // segment intersection with small wall thickness
  const T = 0.4, minx = Math.min(p[0], r[0]) - T, maxx = Math.max(p[0], r[0]) + T, minz = Math.min(p[1], r[1]) - T, maxz = Math.max(p[1], r[1]) + T;
  for (let k = 1; k <= 4; k++) { const x = ax + (bx - ax) * k / 4, z = az + (bz - az) * k / 4; if (x >= minx && x <= maxx && z >= minz && z <= maxz) return true; }
  return false;
}
module.exports = { fireRange, Room, W, LIFE, PALETTE, TEAM_COLORS, TEAM_NAMES };
