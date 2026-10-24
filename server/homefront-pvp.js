// Homefront RPG PvP: player-versus-player combat in the shared open world (server-authoritative).
// Rules (Derrik, Oct 23, 2026): PvP is ON in the shared world, there is NO friendly fire inside a party,
// and PvP is OFF inside Homefront instances (players at home are not in `players`, so they can't be hit
// or shoot). Clients send only { targetId (public survivor id), aimPoint }; range, interest, cadence,
// rounds, hit chance and damage are all decided here. Firearms keep the tier burst rules: one burst per
// request, ≥ 900 ms apart (the tier interval), rounds = min(tier rounds, loaded magazine).
'use strict';
const Firearms = require('./homefront-firearms');
const Combat = require('./homefront-combat');
const Survival = require('./homefront-survival');
const Travel = require('./homefront-travel');

const MIN_INTERVAL = 900;
const SPAWN_PROTECTION_MS = 10_000;
const AIM_TOLERANCE = 1.75;
const RESPAWN_HEALTH = 60;
const MELEE = Object.freeze({
  pipe_blade: Object.freeze({ rounds: 1, range: 2.8, damage: 14, spread: 0, falloff: 1 }),
  shock_maul: Object.freeze({ rounds: 1, range: 3.0, damage: 18, spread: 0, falloff: 1 }),
  pump_shotgun: Object.freeze({ rounds: 1, range: 9, damage: 26, spread: 6, falloff: 1 }),
  marksman_rifle: Object.freeze({ rounds: 1, range: 32, damage: 30, spread: 0.8, falloff: 1 })
});
const hash = s => { let h = 2166136261; for (const c of String(s)) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return h >>> 0; };
const rng = seed => { let x = hash(seed) || 1; return () => { x ^= x << 13; x >>>= 0; x ^= x >>> 17; x ^= x << 5; x >>>= 0; return x / 4294967296; }; };
const publicId = acct => 'survivor-' + hash(acct).toString(36).slice(0, 7);

function weaponProfile(weaponId) {
  if (Firearms.isFirearmTier(weaponId)) {
    const t = Firearms.FIREARM_TIERS[weaponId];
    return { firearm: true, rounds: t.rounds, interval: Math.max(MIN_INTERVAL, t.interval), range: 18 + 2 * t.tier, damage: 4 + t.power * 1.2, spread: t.spread, falloff: t.falloff };
  }
  const m = Object.prototype.hasOwnProperty.call(MELEE, weaponId) ? MELEE[weaponId] : MELEE.pipe_blade;
  return { firearm: weaponId === 'pump_shotgun' || weaponId === 'marksman_rifle', rounds: m.rounds, interval: Math.max(MIN_INTERVAL, Combat.WEAPON_FIRE_INTERVAL[weaponId] || MIN_INTERVAL), range: m.range, damage: m.damage, spread: m.spread, falloff: m.falloff };
}

// Resolve one PvP request. `w` is a normalized world (mutated in place); `base` the attacker's refuge
// (equipped weapon + unlocks). `farSpawn(w, acct)` returns a safe far spawn for a downed target.
function attack(w, attacker, { targetId, aimPoint, base, now = Date.now(), farSpawn, visibleAccounts }) {
  const me = w.players[attacker];
  if (!me) throw new Error(w.homefronts?.[attacker] ? 'pvp_disabled_in_homefront' : 'not_in_expedition');
  if (typeof targetId !== 'string' || !/^survivor-[0-9a-z]{1,7}$/.test(targetId)) throw new Error('invalid_target');
  if (!aimPoint || typeof aimPoint !== 'object' || !Number.isFinite(aimPoint.x) || !Number.isFinite(aimPoint.z)) throw new Error('invalid_aim');
  // Only explorers this attacker is allowed to see are targetable: no hitting someone you were never sent.
  const visible = visibleAccounts(w, attacker, now);
  const target = [...visible].find(a => a !== attacker && publicId(a) === targetId) || null;
  if (!target) {
    const home = Object.keys(w.homefronts || {}).find(a => publicId(a) === targetId && Travel.fresh(w, a, now));
    throw new Error(home ? 'pvp_disabled_in_homefront' : 'target_not_found');
  }
  if (Travel.sameParty(w, attacker, target)) throw new Error('friendly_fire_blocked');
  const t = w.players[target];
  if (now - (t.spawnedAt || 0) < SPAWN_PROTECTION_MS) throw new Error('target_spawn_protected');
  const weaponId = Object.prototype.hasOwnProperty.call(Combat.WEAPON_MAGAZINE_CAPACITY, base.equippedWeapon) ? base.equippedWeapon : 'pipe_blade';
  if (Firearms.isFirearmTier(weaponId)) {
    const unlock = Firearms.unlockStatus(base, weaponId);
    if (!unlock.unlocked) throw new Error(unlock.reason || 'weapon_locked');
    if (!Array.isArray(base.weapons) || !base.weapons.includes(weaponId)) throw new Error('weapon_not_owned');
  }
  const w8 = weaponProfile(weaponId);
  if (now - (me.lastPvpAt || 0) < w8.interval) throw new Error('pvp_cooldown');
  const dist = Math.hypot(t.x - me.x, t.z - me.z);
  if (dist > w8.range) throw new Error('target_out_of_range');
  const magazine = me.weaponMagazine && me.weaponMagazine.weaponId === weaponId ? me.weaponMagazine : { weaponId, loaded: 0 };
  const rounds = w8.firearm ? Math.min(w8.rounds, magazine.loaded) : w8.rounds;
  if (w8.firearm && rounds <= 0) throw new Error('reload_required');
  if (w8.firearm) me.weaponMagazine = { weaponId, loaded: magazine.loaded - rounds };
  me.lastPvpAt = now; me.lastSeen = now;
  me.noiseLevel = Math.max(me.noiseLevel || 0, w8.firearm ? 85 : 55); me.lastNoiseAt = now; me.noiseX = me.x; me.noiseZ = me.z;
  // The aim point must sit on the target's server position; a forged or stale aim misses every round.
  const onTarget = Math.hypot(aimPoint.x - t.x, aimPoint.z - t.z) <= AIM_TOLERANCE;
  const roll = rng(attacker + '>' + target + ':' + now);
  const hitChance = Math.max(0.2, Math.min(0.95, 0.92 - (dist / Math.max(1, w8.range)) * 0.35 - w8.spread * 0.03));
  const hits = [];
  let total = 0;
  t.survival = Survival.tick(t.survival, now);
  for (let i = 0; i < rounds; i++) {
    const hit = onTarget && roll() < hitChance;
    const damage = hit ? Math.max(1, Math.round(w8.damage * Math.pow(w8.falloff, i))) : 0;
    hits.push({ round: i + 1, hit, damage });
    total += damage;
  }
  let killed = false;
  if (total > 0) {
    t.survival.health = Math.max(0, t.survival.health - total);
    t.pvpHits = [...(Array.isArray(t.pvpHits) ? t.pvpHits : []), { at: now, fromId: publicId(attacker), damage: total }].slice(-5);
    if (t.survival.health <= 0) {
      killed = true;
      // Downed: respawn far from everyone at reduced health (field pack kept in Phase 1).
      const spot = farSpawn(w, target);
      t.x = spot.position.x; t.z = spot.position.z; t.spawn = spot.spawn.id; t.spawnedAt = now; t.lastMove = now;
      t.survival.health = RESPAWN_HEALTH;
      t.downedAt = now;
      if (w.interiors?.[target]) w.interiors[target].activeLandmarkId = null;
      me.pvpKills = (me.pvpKills || 0) + 1;
    }
  }
  return { weaponId, rounds, hits, damage: total, killed, targetId, distance: Math.round(dist * 10) / 10, onTarget };
}
module.exports = { MIN_INTERVAL, SPAWN_PROTECTION_MS, AIM_TOLERANCE, RESPAWN_HEALTH, weaponProfile, attack, publicId };
