'use strict';
// Live refuge siege: hordes march on a refuge from far out and defenders shoot them down.
// Everything here is server-owned. Clients send only aim intent ({ aim: { x, z } }) and the post
// they want to stand at; the server decides unlocks, ammo, cooldowns, line of sight, which
// infected each round hits, damage, mortar range/scatter/splash and the outcome.
//
// Approach (fair by construction): 2–4 packs spawn 46–58 units out on a wide arc (directions at
// least ~45° apart) and walk straight at the walls (radius 10.5), arriving 26–40 s after the
// siege starts. Member positions are a closed-form function of time, so the server never needs a
// background tick: every request advances the siege to "now" (guard volleys, arrivals, the end).
//
// Rate budget: the world API allows 120 requests/min per account (shared with moves and polls),
// so every weapon is >= 900 ms between requests; automatic guns fire one burst per request.
const Core = require('./homefront-core');
const Firearms = require('./homefront-firearms');
const Platforms = require('./homefront-platforms');

const NP = o => Object.freeze(Object.assign(Object.create(null), o));
const RULES = NP({
  spawnMin: 46, spawnMax: 58, approachMin: 26, approachMax: 40, wallRadius: 10.5,
  packsMin: 2, packsMax: 4, arcMin: Math.PI * 0.9, arcMax: Math.PI * 1.4, minSeparation: Math.PI / 4,
  maxMembers: 36, compactMaxMembers: 24, maxDefenders: 4, pressureWindowMs: 20000,
  wallDps: 0.25, bruteWallDps: 0.6, walkerHp: 34, bruteHp: 80, cooldownMs: 90000, keepResultMs: 10 * 60e3,
  gunBaseRange: 18, gunTierRange: 2, platformRangeBonus: 10, groundPostRadius: 7.5,
  guardIntervalMs: 2000, guardPlatformRange: 34, guardGroundRange: 22
});
const MORTAR = NP({ level: 5, minRange: 12, maxRange: 52, dangerClose: 11, splash: 3.2, damage: 48, edgeFactor: 0.4, cooldownMs: 3200, shellAmmo: 3, scatter: 0.8, flightMs: 1400 });
const GUN_DAMAGE_PER_POWER = 3.2;

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const hash = s => { let h = 2166136261; for (const c of String(s)) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return h >>> 0; };
function rng(seed) { let x = (seed >>> 0) || 1; return () => { x ^= x << 13; x >>>= 0; x ^= x >>> 17; x ^= x << 5; x >>>= 0; return x / 4294967296; }; }
const label = acct => 'Defender-' + hash(acct).toString(36).slice(0, 5);

function memberPos(m, now) {
  const t = clamp((now - m.startedAt) / 1000, 0, Infinity);
  const travel = Math.min(m.travel, m.speed * t);
  return { x: m.sx + m.dx * travel, z: m.sz + m.dz * travel };
}
function alive(m) { return m.hp > 0; }

// Plan the horde for a refuge. Deterministic for (seed, level, threat, compact).
function planHorde({ seed, level = 1, threat = 9, compact = false, now = Date.now() }) {
  const r = rng(seed);
  const packs = clamp(2 + Math.floor((threat - 9) / 4) + (level >= 6 ? 1 : 0), RULES.packsMin, RULES.packsMax);
  const arc = RULES.arcMin + r() * (RULES.arcMax - RULES.arcMin);
  const center = r() * Math.PI * 2;
  const step = packs > 1 ? arc / (packs - 1) : 0;
  const cap = compact ? RULES.compactMaxMembers : RULES.maxMembers;
  const perPack = clamp(3 + Math.floor(level / 2), 3, Math.floor(cap / packs));
  const out = { packs: [], members: [] };
  for (let p = 0; p < packs; p++) {
    const jitter = (r() - 0.5) * Math.min(0.3, step - RULES.minSeparation > 0 ? step - RULES.minSeparation : 0);
    const angle = center - arc / 2 + step * p + jitter;
    const spawnR = RULES.spawnMin + r() * (RULES.spawnMax - RULES.spawnMin);
    const approach = RULES.approachMin + r() * (RULES.approachMax - RULES.approachMin);
    const speed = (spawnR - RULES.wallRadius) / approach;
    const pack = { id: 'p' + (p + 1), angle: Number(angle.toFixed(4)), spawnR: Number(spawnR.toFixed(2)), approachSec: Number(approach.toFixed(2)) };
    out.packs.push(pack);
    const ux = Math.cos(angle), uz = Math.sin(angle), px = -uz, pz = ux;
    for (let i = 0; i < perPack; i++) {
      const lateral = (i - (perPack - 1) / 2) * 0.9 + (r() - 0.5) * 0.4;
      const back = (i % 3) * 0.6;           // a short column, everyone still inside the 26–40 s window
      const sx = ux * (spawnR + back) + px * lateral, sz = uz * (spawnR + back) + pz * lateral;
      const dist = Math.hypot(sx, sz), tx = sx / dist * RULES.wallRadius, tz = sz / dist * RULES.wallRadius;
      const travel = Math.hypot(tx - sx, tz - sz);
      const brute = i % 5 === 4;
      const hp = brute ? RULES.bruteHp : RULES.walkerHp;
      out.members.push({ id: pack.id + 'm' + (i + 1), pack: pack.id, sx: Number(sx.toFixed(3)), sz: Number(sz.toFixed(3)), dx: (tx - sx) / travel, dz: (tz - sz) / travel,
        travel, speed: travel / approach, startedAt: now, arriveAt: now + Math.round(travel / (travel / approach) * 1000), hp, maxHp: hp, brute, killedAt: null, killedBy: null });
    }
  }
  return out;
}

function createSiege({ owner, base, now = Date.now(), compact = false }) {
  const seed = hash(owner + ':' + now + ':' + (base.defenseCount || 0));
  const profile = Core.threatProfile(base);
  const horde = planHorde({ seed, level: Firearms.developmentLevel(base), threat: profile.threat, compact: compact === true, now });
  const platforms = Platforms.platformsOf(base.structures);
  const guards = base.survivors.filter(s => s.role === 'guard').slice(0, 8).map((g, i) => ({
    id: g.id, name: String(g.name || 'Guard').slice(0, 40), skill: clamp(Number(g.stats?.combat) || 5, 1, 10),
    post: platforms[i] ? platforms[i].id : 'ground', nextAt: now + 1500 + i * 250 }));
  return { id: 'live-' + seed.toString(36), owner, status: 'active', startedAt: now, updatedAt: now, endedAt: null, seed, shots: 0,
    packs: horde.packs, members: horde.members, guards, compact: compact === true,
    defenders: { [owner]: { post: 'ground', joinedAt: now, lastFireAt: 0, kills: 0, damage: 0 } }, mortars: {}, result: null, impacts: [] };
}

function normalizeState(input) {
  const out = Object.create(null);
  if (!input || typeof input !== 'object' || Array.isArray(input)) return {};
  for (const [owner, s] of Object.entries(input)) {
    if (!s || typeof s !== 'object' || !Array.isArray(s.members) || !Array.isArray(s.packs) || !s.defenders || typeof s.defenders !== 'object') continue;
    if (!['active', 'repelled', 'breached'].includes(s.status)) continue;
    s.members = s.members.filter(m => m && typeof m.id === 'string' && [m.sx, m.sz, m.dx, m.dz, m.travel, m.speed, m.startedAt, m.hp].every(Number.isFinite)).slice(0, RULES.maxMembers);
    s.guards = Array.isArray(s.guards) ? s.guards.slice(0, 8) : [];
    s.mortars = s.mortars && typeof s.mortars === 'object' ? s.mortars : {};
    s.impacts = Array.isArray(s.impacts) ? s.impacts.slice(-6) : [];
    out[owner] = s;
  }
  return { ...out };
}

// Shooter eye for a post. Ground posts stand just inside the wall toward the aim.
function eyeFor(structures, post, aim) {
  if (post && post !== 'ground') {
    const st = structures.find(s => s.id === post && s.hp > 0);
    if (st) return { ...Platforms.postEye(st), id: st.id, type: st.type };
  }
  const d = Math.hypot(aim?.x || 0, aim?.z || 1) || 1;
  return { x: (aim?.x || 0) / d * RULES.groundPostRadius, y: Platforms.EYE, z: (aim?.z || 1) / d * RULES.groundPostRadius, elevated: false, id: null, type: 'ground' };
}

function kill(siege, m, acct, now) { m.hp = 0; m.killedAt = now; m.killedBy = acct; }

// Advance guard volleys and arrivals up to `now`; ends the siege when everyone is dead or the
// walls have been under pressure for the window. Returns true if the siege ended in this call.
function advance(siege, structures, now = Date.now()) {
  if (!siege || siege.status !== 'active') return false;
  for (const g of siege.guards) {
    let guard = 0;
    while (g.nextAt <= now && guard++ < 60) {
      const at = g.nextAt; g.nextAt += RULES.guardIntervalMs;
      const st = g.post !== 'ground' ? structures.find(s => s.id === g.post && s.hp > 0) : null;
      const eye = st ? Platforms.postEye(st) : null;
      const range = st ? RULES.guardPlatformRange : RULES.guardGroundRange;
      let best = null, bestR = Infinity;
      for (const m of siege.members) {
        if (!alive(m) || (m.killedAt && m.killedAt <= at)) continue;
        const p = memberPos(m, at), r = Math.hypot(p.x, p.z);
        const from = eye || { x: p.x / r * RULES.groundPostRadius, y: Platforms.EYE, z: p.z / r * RULES.groundPostRadius };
        if (Math.hypot(p.x - from.x, p.z - from.z) > range) continue;
        if (!Platforms.lineOfSight(structures, from, { x: p.x, y: 1.0, z: p.z }, st?.id)) continue;
        if (r < bestR) { best = m; bestR = r; }
      }
      if (best) { best.hp = Math.max(0, best.hp - Math.round(8 + g.skill * 1.2)); if (best.hp === 0) kill(siege, best, 'guard:' + g.id, at); }
    }
  }
  const living = siege.members.filter(alive);
  const lastArrival = Math.max(...siege.members.map(m => m.arriveAt));
  if (!living.length) return finish(siege, 'repelled', Math.max(siege.startedAt, ...siege.members.map(m => m.killedAt || 0)));
  if (now >= lastArrival + RULES.pressureWindowMs) return finish(siege, 'breached', lastArrival + RULES.pressureWindowMs);
  siege.updatedAt = now;
  return false;
}
function finish(siege, status, at) {
  siege.status = status; siege.endedAt = at;
  let wall = 0;
  for (const m of siege.members) {
    const end = m.killedAt != null ? Math.min(m.killedAt, at) : at;
    if (end > m.arriveAt) wall += (end - m.arriveAt) / 1000 * (m.brute ? RULES.bruteWallDps : RULES.wallDps);
  }
  const kills = siege.members.filter(m => m.hp <= 0).length;
  siege.result = { status, structureDamage: Math.round(wall), kills, total: siege.members.length, defenders: Object.keys(siege.defenders).length, startedAt: siege.startedAt,
    killsBy: Object.fromEntries(Object.entries(siege.defenders).map(([a, d]) => [label(a), d.kills])) };
  return true;
}

function firearmFor(base) {
  const id = base.equippedWeapon;
  if (!Firearms.isFirearmTier(id) || !base.weapons.includes(id)) throw new Error('siege_requires_firearm');
  const u = Firearms.unlockStatus(base, id);
  if (!u.unlocked) throw new Error(u.reason || 'weapon_locked');
  return { id, spec: Firearms.FIREARM_TIERS[id] };
}
function readAim(payload) {
  const a = payload && payload.aim;
  if (!a || typeof a !== 'object' || !Number.isFinite(a.x) || !Number.isFinite(a.z) || Math.abs(a.x) > 120 || Math.abs(a.z) > 120) throw new Error('invalid_aim');
  return { x: a.x, z: a.z };
}

// One burst from the defender's equipped firearm at their post. Mutates siege and shooterBase.
function fireGun({ siege, acct, shooterBase, structures, payload, now = Date.now() }) {
  const d = siege.defenders[acct];
  const { id, spec } = firearmFor(shooterBase);
  if (now - (d.lastFireAt || 0) < Math.max(900, spec.interval)) throw new Error('siege_fire_cooldown');
  const aim = readAim(payload);
  const eye = eyeFor(structures, d.post, aim);
  if (eye.type === 'mortar_pit') throw new Error('use_mortar_at_this_post');
  const ammo = Math.max(0, Math.floor(shooterBase.resources.ammo || 0));
  if (ammo < 1) throw new Error('insufficient_ammo');
  const rounds = Math.min(spec.rounds, ammo);
  shooterBase.resources.ammo = ammo - rounds;
  const range = RULES.gunBaseRange + spec.tier * RULES.gunTierRange + (eye.elevated ? RULES.platformRangeBonus : 0);
  const cone = spec.spread * 2.5 * Math.PI / 180;
  const ax = aim.x - eye.x, az = aim.z - eye.z, aimAngle = Math.atan2(az, ax);
  const pierce = Math.max(1, spec.pierce || 1);
  const hits = [];
  for (let i = 0; i < rounds; i++) {
    const base = Math.round(spec.power * GUN_DAMAGE_PER_POWER * Math.pow(spec.falloff, i));
    let best = null, bestDev = Infinity, bestDist = Infinity;
    for (const m of siege.members) {
      if (!alive(m)) continue;
      const p = memberPos(m, now), dx = p.x - eye.x, dz = p.z - eye.z, dist = Math.hypot(dx, dz);
      if (dist > range || dist < 0.5) continue;
      let dev = Math.abs(Math.atan2(dz, dx) - aimAngle); if (dev > Math.PI) dev = Math.PI * 2 - dev;
      if (dev > cone) continue;
      if (!Platforms.lineOfSight(structures, eye, { x: p.x, y: 1.0, z: p.z }, eye.id)) continue;
      if (dev < bestDev - 1e-9 || (Math.abs(dev - bestDev) < 1e-9 && dist < bestDist)) { best = m; bestDev = dev; bestDist = dist; }
    }
    if (!best) { hits.push({ round: i, memberId: null, damage: 0, killed: false }); continue; }
    const struck = [best];
    if (pierce > 1) {
      const bp = memberPos(best, now), ux = (bp.x - eye.x) / bestDist, uz = (bp.z - eye.z) / bestDist;
      const behind = siege.members.filter(m => alive(m) && m !== best).map(m => {
        const p = memberPos(m, now), along = (p.x - eye.x) * ux + (p.z - eye.z) * uz, lateral = Math.abs((p.x - eye.x) * uz - (p.z - eye.z) * ux);
        return { m, along, lateral };
      }).filter(o => o.along > bestDist && o.along <= range && o.lateral <= 0.9).sort((a, b) => a.along - b.along).slice(0, pierce - 1);
      for (const o of behind) struck.push(o.m);
    }
    struck.forEach((m, k) => {
      const dmg = k === 0 ? base : Math.round(base * 0.75);
      const dealt = Math.min(m.hp, dmg); m.hp -= dealt; d.damage += dealt;
      const killed = m.hp <= 0; if (killed) { kill(siege, m, acct, now); d.kills++; }
      hits.push({ round: i, memberId: m.id, damage: dealt, killed, pierced: k > 0 });
    });
  }
  d.lastFireAt = now; siege.shots++;
  return { weaponId: id, rounds, ammoSpent: rounds, range, elevated: eye.elevated, from: { x: eye.x, y: eye.y, z: eye.z }, aim, hits };
}

// Indirect fire from a mortar pit. Shells come from the host refuge's ammo stock.
function fireMortar({ siege, acct, hostBase, structures, payload, now = Date.now() }) {
  const d = siege.defenders[acct];
  const pit = structures.find(s => s.id === d.post && s.type === 'mortar_pit' && s.hp > 0);
  if (!pit) throw new Error('not_at_mortar');
  if (Firearms.developmentLevel(hostBase) < MORTAR.level) throw new Error('mortar_requires_refuge_level_' + MORTAR.level);
  const last = Math.max(d.lastFireAt || 0, siege.mortars[pit.id] || 0);
  if (now - last < MORTAR.cooldownMs) throw new Error('mortar_cooldown');
  const aim = readAim(payload);
  const range = Math.hypot(aim.x - pit.x, aim.z - pit.z);
  if (range < MORTAR.minRange) throw new Error('mortar_too_close');
  if (range > MORTAR.maxRange) throw new Error('mortar_out_of_range');
  if (Math.hypot(aim.x, aim.z) < MORTAR.dangerClose) throw new Error('mortar_danger_close');
  const ammo = Math.max(0, Math.floor(hostBase.resources.ammo || 0));
  if (ammo < MORTAR.shellAmmo) throw new Error('insufficient_ammo');
  hostBase.resources.ammo = ammo - MORTAR.shellAmmo;
  const r = rng(hash(siege.seed + ':' + siege.shots + ':' + acct));
  const ang = r() * Math.PI * 2, off = r() * MORTAR.scatter * (range / MORTAR.maxRange);
  const impact = { x: aim.x + Math.cos(ang) * off, z: aim.z + Math.sin(ang) * off };
  const hits = [];
  for (const m of siege.members) {
    if (!alive(m)) continue;
    const p = memberPos(m, now), dist = Math.hypot(p.x - impact.x, p.z - impact.z);
    if (dist > MORTAR.splash) continue;
    const dmg = Math.round(MORTAR.damage * (1 - (1 - MORTAR.edgeFactor) * dist / MORTAR.splash));
    const dealt = Math.min(m.hp, dmg); m.hp -= dealt; d.damage += dealt;
    const killed = m.hp <= 0; if (killed) { kill(siege, m, acct, now); d.kills++; }
    hits.push({ memberId: m.id, damage: dealt, killed });
  }
  d.lastFireAt = now; siege.mortars[pit.id] = now; siege.shots++;
  const shot = { at: now, x: Number(impact.x.toFixed(2)), z: Number(impact.z.toFixed(2)), from: { x: pit.x, z: pit.z }, by: label(acct) };
  siege.impacts = [...(siege.impacts || []), shot].slice(-6);
  return { weaponId: 'mortar', rounds: 1, ammoSpent: MORTAR.shellAmmo, impact: shot, splash: MORTAR.splash, range: Number(range.toFixed(2)), hits };
}

function takePost(siege, acct, structures, post) {
  const d = siege.defenders[acct];
  if (post === 'ground') { d.post = 'ground'; return; }
  if (typeof post !== 'string') throw new Error('unknown_post');
  const st = structures.find(s => s.id === post && s.hp > 0 && (s.type === 'gun_platform' || s.type === 'mortar_pit'));
  if (!st) throw new Error('unknown_post');
  for (const [a, other] of Object.entries(siege.defenders)) if (a !== acct && other.post === post) throw new Error('post_taken');
  d.post = post;
  // A guard holding that deck climbs down and covers from the ground instead.
  for (const g of siege.guards) if (g.post === post) g.post = 'ground';
}

function publicSnapshot(siege, acct, structures, now = Date.now()) {
  if (!siege) return null;
  const posts = structures.filter(s => s.hp > 0 && (s.type === 'gun_platform' || s.type === 'mortar_pit')).map(s => {
    const holder = Object.entries(siege.defenders).find(([, d]) => d.post === s.id);
    return { id: s.id, type: s.type, x: s.x, z: s.z, rotation: s.rotation || 0, takenBy: holder ? (holder[0] === acct ? 'You' : label(holder[0])) : null, guard: !holder && siege.guards.some(g => g.post === s.id) };
  });
  return {
    id: siege.id, status: siege.status, startedAt: siege.startedAt, endedAt: siege.endedAt, serverNow: now, compact: siege.compact,
    packs: siege.packs.map(p => ({ id: p.id, angle: p.angle, spawnR: p.spawnR, approachSec: p.approachSec, alive: siege.members.filter(m => m.pack === p.id && alive(m)).length })),
    members: siege.members.filter(alive).map(m => { const p = memberPos(m, now); return { id: m.id, pack: m.pack, x: Number(p.x.toFixed(2)), z: Number(p.z.toFixed(2)), dx: Number(m.dx.toFixed(4)), dz: Number(m.dz.toFixed(4)), speed: Number(m.speed.toFixed(3)), arriveAt: m.arriveAt, hp: m.hp, maxHp: m.maxHp, brute: m.brute }; }),
    total: siege.members.length, killed: siege.members.filter(m => !alive(m)).length,
    defenders: Object.entries(siege.defenders).map(([a, d]) => ({ label: a === acct ? 'You' : label(a), host: a === siege.owner, post: d.post, kills: d.kills })),
    guards: siege.guards.map(g => ({ name: g.name, post: g.post })), posts, impacts: siege.impacts || [], result: siege.result,
    you: siege.defenders[acct] ? { post: siege.defenders[acct].post, kills: siege.defenders[acct].kills, nextFireAt: siege.defenders[acct].lastFireAt } : null,
    rules: { wallRadius: RULES.wallRadius, mortar: { minRange: MORTAR.minRange, maxRange: MORTAR.maxRange, dangerClose: MORTAR.dangerClose, splash: MORTAR.splash, cooldownMs: MORTAR.cooldownMs, shellAmmo: MORTAR.shellAmmo, level: MORTAR.level }, platformRangeBonus: RULES.platformRangeBonus, gunBaseRange: RULES.gunBaseRange, gunTierRange: RULES.gunTierRange }
  };
}

// ---- HTTP glue (called from server/homefront.js inside the world route, so it shares the
// 120/min/account + 300/min/IP world gate and bearer auth). Synchronous from load to save, so
// concurrent defenders can never commit stale snapshots over each other.
const SIEGE_FILE = 'homefront-siege.json';
function sameParty(worldDb, a, b) {
  const pa = worldDb?.players?.[a]?.partyCode, pb = worldDb?.players?.[b]?.partyCode;
  return !!pa && pa === pb && !!worldDb.parties?.[pa]?.members?.includes(a) && worldDb.parties[pa].members.includes(b);
}
function grantDefenderEmbers(bases, acct, kills, now) {
  const b = Core.validateBase(bases[acct], acct);
  if (!b) return;
  const embers = Math.min(10, Math.floor(kills / 2));
  if (!embers) return;
  b.embers = Math.min(999999999, b.embers + embers);
  b.log.push({ id: (b.log.at(-1)?.id || 0) + 1, kind: 'defense', text: 'Helped defend an allied refuge: ' + kills + ' infected killed, +' + embers + ' Embers.', at: now });
  b.log = b.log.slice(-20); b.revision++; b.updatedAt = now; bases[acct] = b;
}
function route({ method, path, query, payload, acct, store, worldDb, now = Date.now() }) {
  const sub = path.slice('/api/homefront/world/siege'.length);
  if (!['', '/start', '/join', '/post', '/fire', '/leave'].includes(sub)) return { status: 404, body: { error: 'world_route_not_found' } };
  if ((sub === '') !== (method === 'GET')) return { status: 405, body: { error: 'method_not_allowed' } };
  const rawOwner = sub === '/start' ? acct : method === 'GET' ? query.get('owner') : payload?.owner;
  const owner = typeof rawOwner === 'string' && rawOwner.trim() && rawOwner.length <= 128 ? rawOwner.trim() : acct;
  const sieges = normalizeState(store.load(SIEGE_FILE, {}));
  let siege = sieges[owner] || null;
  if (siege && siege.status !== 'active' && now - (siege.endedAt || 0) > RULES.keepResultMs) { delete sieges[owner]; siege = null; }
  const eligible = acct === owner || !!siege?.defenders?.[acct] || sameParty(worldDb, acct, owner);
  if (!eligible) return { status: 404, body: { error: 'siege_not_found' } };
  const bases = store.load('homefront.json', {});
  if (!bases[owner] && acct !== owner) return { status: 404, body: { error: 'siege_not_found' } };
  let hostBase = Core.validateBase(bases[owner] || Core.createBase(owner, now), owner);
  if (!hostBase) throw new Error('save_invalid');
  const structures = hostBase.structures;
  let ended = siege ? advance(siege, structures, now) : false;
  let fire = null, shooterBase = null, dirtyBases = false;
  switch (sub) {
    case '/start': {
      if (siege?.status === 'active') throw new Error('siege_already_active');
      if (siege && now - (siege.endedAt || 0) < RULES.cooldownMs) throw new Error('siege_cooldown');
      if (hostBase.baseHp <= 0) throw new Error('base_destroyed');
      siege = sieges[owner] = createSiege({ owner, base: hostBase, now, compact: payload?.compact === true });
      ended = false;
      break;
    }
    case '/join': {
      if (!siege || siege.status !== 'active') throw new Error('no_active_siege');
      if (!siege.defenders[acct]) {
        if (Object.keys(siege.defenders).length >= RULES.maxDefenders) throw new Error('siege_full');
        siege.defenders[acct] = { post: 'ground', joinedAt: now, lastFireAt: 0, kills: 0, damage: 0 };
      }
      break;
    }
    case '/post': {
      if (!siege || siege.status !== 'active') throw new Error('no_active_siege');
      if (!siege.defenders[acct]) throw new Error('not_a_defender');
      takePost(siege, acct, structures, payload?.post);
      break;
    }
    case '/leave': {
      if (siege && acct !== owner) delete siege.defenders[acct];
      break;
    }
    case '/fire': {
      if (!siege || siege.status !== 'active') throw new Error('no_active_siege');
      if (!siege.defenders[acct]) throw new Error('not_a_defender');
      const post = structures.find(s => s.id === siege.defenders[acct].post && s.hp > 0);
      if (post && post.type === 'mortar_pit') {
        fire = fireMortar({ siege, acct, hostBase, structures, payload, now });
      } else {
        shooterBase = acct === owner ? hostBase : Core.validateBase(bases[acct], acct);
        if (!shooterBase) throw new Error('siege_requires_firearm');
        fire = fireGun({ siege, acct, shooterBase, structures, payload, now });
        if (shooterBase !== hostBase) { shooterBase.revision++; shooterBase.updatedAt = now; bases[acct] = shooterBase; }
      }
      dirtyBases = true;
      if (!ended) ended = advance(siege, structures, now);
      break;
    }
  }
  if (ended && siege && siege.result && !siege.rewarded) {
    const applied = Core.applyLiveSiegeResult(hostBase, owner, siege.result, now);
    hostBase = applied.base;
    hostBase.repelledCount = (Number.isSafeInteger(hostBase.repelledCount) ? hostBase.repelledCount : 0) + (applied.outcome === 'repelled' && siege.result.status === 'repelled' ? 1 : 0);
    siege.result.embers = applied.embers; siege.result.outcome = applied.outcome;
    for (const [a, d] of Object.entries(siege.defenders)) if (a !== owner) grantDefenderEmbers(bases, a, d.kills, now);
    siege.rewarded = true; dirtyBases = true;
    if (applied.outcome === 'repelled' && siege.result.status === 'repelled') for (const a of new Set([owner, ...Object.keys(siege.defenders)])) require('./homefront-rpg').award(store, a, 'siege_repelled', { now });   // RPG XP for every defender
  }
  if (dirtyBases) {
    if (fire && fire.weaponId === 'mortar') { hostBase.revision++; hostBase.updatedAt = now; }
    else if (shooterBase === hostBase) { hostBase.revision++; hostBase.updatedAt = now; }
    bases[owner] = hostBase;
    store.save('homefront.json', bases);
  }
  store.save(SIEGE_FILE, sieges);
  const wantRefuge = sub === '/start' || sub === '/join' || query?.get?.('refuge') === '1';
  const own = acct === owner ? hostBase : (shooterBase || Core.validateBase(bases[acct], acct));
  return { status: 200, body: {
    mode: 'homefront-siege', owner: acct === owner ? undefined : owner,
    siege: siege ? publicSnapshot(siege, acct, hostBase.structures, now) : null,
    fire, ammo: own ? own.resources.ammo : null, equippedWeapon: own ? own.equippedWeapon : null, hostAmmo: hostBase.resources.ammo, hostLevel: hostBase.level,
    refuge: wantRefuge ? { ...hostBase, owner: undefined, log: hostBase.log.slice(-8) } : undefined,
    base: acct === owner && (dirtyBases || sub === '/start') ? hostBase : undefined
  } };
}

module.exports = { route, sameParty, SIEGE_FILE, RULES, MORTAR, GUN_DAMAGE_PER_POWER, memberPos, planHorde, createSiege, normalizeState, advance, fireGun, fireMortar, takePost, publicSnapshot, label, eyeFor };
