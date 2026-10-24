// Live refuge siege: approach fairness, unlocks, cooldowns, ammo, line of sight, mortar rules,
// forged fields, and a multiplayer defense (host on a mortar + two allies on separate gun
// platforms) that wipes out one horde. Runs the real route glue against an in-memory store
// with a controlled clock, so it is fast and deterministic.
'use strict';
const assert = require('node:assert/strict');
const Core = require('../server/homefront-core');
const Siege = require('../server/homefront-siege');
const Firearms = require('../server/homefront-firearms');

function memStore(init = {}) {
  const m = structuredClone(init);
  return { m, load: (n, fb) => Object.prototype.hasOwnProperty.call(m, n) ? structuredClone(m[n]) : fb, save: (n, v) => { m[n] = structuredClone(v); } };
}
const H = 'rSiegeHost', A = 'rSiegeAllyA', B = 'rSiegeAllyB', N = 'rSiegeNoGun', O = 'rSiegeOutsider';
function refuge(acct, { level = 6, weapon = 'pipe_blade', ammo = 400 } = {}) {
  const b = Core.createBase(acct, 1000);
  b.level = level; b.day = (level - 1) * 5 + 1; b.resources.wood = 900; b.resources.scrap = 900; b.resources.steel = 90; b.resources.ammo = ammo;
  b.exploration.discoveredZones = ['outskirts', 'industrial', 'research_lab'];
  if (weapon !== 'pipe_blade') { b.weapons.push(weapon); b.equippedWeapon = weapon; }
  return b;
}
let host = refuge(H, { weapon: 'fifty_cal' });
host = Core.applyAction(host, H, { type: 'build', building: 'gun_platform', x: 6, z: -6, rotation: 0 }, 1001);
host = Core.applyAction(host, H, { type: 'build', building: 'gun_platform', x: -6, z: -6, rotation: 0 }, 1002);
host = Core.applyAction(host, H, { type: 'build', building: 'mortar_pit', x: 0, z: 7 }, 1003);
host.survivors.push({ id: 'g1', name: 'Mara', role: 'guard', morale: 80 });
host = Core.validateBase(host, H);
const [P1, P2, PIT] = host.structures.map(s => s.id);
const store = memStore({ 'homefront.json': { [H]: host, [A]: refuge(A, { level: 5, weapon: 'heavy_machine_gun' }), [B]: refuge(B, { level: 3, weapon: 'assault_rifle' }), [N]: refuge(N, { level: 1 }), [O]: refuge(O, { weapon: 'fifty_cal' }) } });
const party = 'ABC123';
const worldDb = { players: Object.fromEntries([H, A, B, N, O].map(a => [a, { partyCode: a === O ? null : party }])), parties: { [party]: { leader: H, members: [H, A, B, N] } } };
const q = (o = {}) => new URLSearchParams(o);
const call = (acct, sub, payload, now, query = {}) => Siege.route({ method: sub ? 'POST' : 'GET', path: '/api/homefront/world/siege' + sub, query: q(query), payload, acct, store, worldDb, now });
const expectErr = (fn, re, msg) => assert.throws(fn, re, msg);

// ---- start + approach fairness
let t = 50_000;
const started = call(H, '/start', { compact: false }, t);
assert.equal(started.status, 200);
let snap = started.body.siege;
assert.equal(snap.status, 'active');
assert.ok(snap.packs.length >= 2 && snap.packs.length <= 4, '2–4 directions');
for (const p of snap.packs) { assert.ok(p.spawnR >= 46 && p.spawnR <= 58, 'packs spawn 46–58 out'); assert.ok(p.approachSec >= 26 && p.approachSec <= 40, 'packs reach the walls in 26–40 s'); }
const angles = snap.packs.map(p => p.angle).sort((a, b) => a - b);
for (let i = 1; i < angles.length; i++) assert.ok(angles[i] - angles[i - 1] >= Math.PI / 4 - 1e-6, 'directions at least 45° apart on a wide arc');
for (const m of snap.members) { const r = Math.hypot(m.x, m.z); assert.ok(r >= 45 && r <= 61, 'members start far out: ' + r.toFixed(1)); assert.ok(m.arriveAt - t >= 26000 && m.arriveAt - t <= 40000); }
assert.ok(snap.members.length <= Siege.RULES.maxMembers);
// Fairness across many seeds/levels.
for (let s = 1; s < 200; s++) {
  const h = Siege.planHorde({ seed: s * 7919, level: 1 + (s % 10), threat: 9 + (s % 20), compact: s % 2 === 0, now: 0 });
  assert.ok(h.packs.length >= 2 && h.packs.length <= 4);
  assert.ok(h.members.length <= (s % 2 === 0 ? Siege.RULES.compactMaxMembers : Siege.RULES.maxMembers), 'compact (phone) hordes are smaller');
  const a = h.packs.map(p => p.angle).sort((x, y) => x - y);
  for (let i = 1; i < a.length; i++) assert.ok(a[i] - a[i - 1] >= Math.PI / 4 - 1e-6);
  for (const m of h.members) assert.ok(m.arriveAt >= 26000 && m.arriveAt <= 40000);
}
expectErr(() => call(H, '/start', {}, t + 10), /siege_already_active/);

// ---- access: outsiders never see or join; party members can.
assert.equal(call(O, '', null, t + 100, { owner: H }).status, 404, 'outsider cannot read the siege');
assert.equal(call(O, '/join', { owner: H }, t + 100).status, 404, 'outsider cannot join');
assert.equal(call(A, '', null, t + 100, { owner: H }).status, 200, 'party member can watch');
for (const who of [A, B, N]) assert.equal(call(who, '/join', { owner: H }, t + 200).body.siege.you.post, 'ground');

// ---- posts: one defender per platform, guards step aside, mortars need their own post.
assert.equal(call(A, '/post', { owner: H, post: P1 }, t + 300).body.siege.you.post, P1);
expectErr(() => call(B, '/post', { owner: H, post: P1 }, t + 310), /post_taken/);
let bs = call(B, '/post', { owner: H, post: P2 }, t + 320).body.siege;
assert.equal(bs.you.post, P2);
assert.ok(bs.guards.every(g => g.post !== P2 && g.post !== P1), 'guards climb down from decks the players took');
assert.equal(call(H, '/post', { post: PIT }, t + 330).body.siege.you.post, PIT);
expectErr(() => call(A, '/post', { owner: H, post: 'b999' }, t + 340), /unknown_post/);
expectErr(() => call(N, '/fire', { owner: H, aim: { x: 0, z: -30 } }, t + 400), /siege_requires_firearm/, 'pipe blade cannot defend from a post');

// ---- mortar rules (host's mortar, shells from the host refuge)
const pit = host.structures.find(s => s.id === PIT);
expectErr(() => call(H, '/fire', { aim: { x: pit.x, z: pit.z + 8 } }, t + 500), /mortar_too_close/);
expectErr(() => call(H, '/fire', { aim: { x: pit.x, z: pit.z + 60 } }, t + 500), /mortar_out_of_range/);
expectErr(() => call(H, '/fire', { aim: { x: 0, z: -6 } }, t + 500), /mortar_danger_close|mortar_too_close/);
expectErr(() => call(H, '/fire', { aim: { x: 'a', z: 1 } }, t + 500), /invalid_aim/);

// ---- forged fields are ignored: only aim is read; the server picks rounds, damage, post, shooter.
const ammoA0 = store.m['homefront.json'][A].resources.ammo;
const forged = call(A, '/fire', { owner: H, aim: { x: 6, z: -40 }, damage: 99999, rounds: 99, hits: [{ memberId: snap.members[0].id, damage: 9999, killed: true }], post: P2, targetId: snap.members[0].id, from: { x: 0, y: 99, z: -50 }, killed: true, weaponId: 'fifty_cal' }, t + 600).body;
const hmg = Firearms.FIREARM_TIERS.heavy_machine_gun;
assert.equal(forged.fire.weaponId, 'heavy_machine_gun', 'server uses the equipped weapon');
assert.equal(forged.fire.rounds, hmg.rounds, 'server decides the burst size');
assert.equal(store.m['homefront.json'][A].resources.ammo, ammoA0 - hmg.rounds, 'ammo spent server-side from the shooter refuge');
assert.ok(forged.fire.elevated && forged.fire.from.y > 3 && forged.fire.from.y < 4.5, 'eye is the platform deck, not the forged origin');
assert.equal(forged.siege.you.post, P1, 'forged post ignored');
assert.ok(forged.fire.hits.every(h => h.damage <= Math.round(hmg.power * Siege.GUN_DAMAGE_PER_POWER)), 'forged damage ignored');
assert.equal(forged.siege.killed, 0, 'members 40+ out are beyond platform range at the start: nothing died');
expectErr(() => call(A, '/fire', { owner: H, aim: { x: 6, z: -40 } }, t + 900), /siege_fire_cooldown/, 'bursts are >= 900 ms apart');
assert.equal(call(A, '/fire', { owner: O, aim: { x: 6, z: -40 } }, t + 2000).status, 404, 'cannot fire into a refuge you are not defending');

// ---- multiplayer defense: A and B on separate platforms + H on the mortar wipe out one horde.
const hostAmmo0 = store.m['homefront.json'][H].resources.ammo;
snap = call(H, '', null, t + 1000).body.siege;
// Target the pack whose lane is closest to both platforms (they sit at z = -6).
const target = snap.packs.slice().sort((a, b) => Math.sin(a.angle) - Math.sin(b.angle))[0];
const by = { [A]: 0, [B]: 0, mortar: 0 }, dmg = { [A]: 0, [B]: 0 };
let mortarHits = 0, lastMortar = 0, packDead = false;
for (let now = t + 1000; now < t + 75_000 && !packDead; now += 1000) {
  snap = call(H, '', null, now).body.siege;
  if (snap.status !== 'active') break;
  const mine = snap.members.filter(m => m.pack === target.id);
  if (!mine.length) { packDead = true; break; }
  const lead = mine.slice().sort((a, b) => Math.hypot(a.x, a.z) - Math.hypot(b.x, b.z))[0];
  for (const who of [A, B]) {
    try {
      const r = call(who, '/fire', { owner: H, aim: { x: lead.x, z: lead.z } }, now + (who === A ? 10 : 20)).body; if (process.env.DBG) console.log(who.slice(-5), now - t, lead.id, lead.x.toFixed(1), lead.z.toFixed(1), r.fire.range, r.fire.hits.map(h => h.memberId + ':' + h.damage).join(' '));
      const onPack = r.fire.hits.filter(h => h.memberId && h.memberId.startsWith(target.id + 'm')); by[who] += onPack.filter(h => h.killed).length; dmg[who] += onPack.reduce((n, h) => n + h.damage, 0);
    } catch (e) { if (!/siege_fire_cooldown|no_active_siege/.test(e.message)) throw e; }
  }
  if (now - lastMortar >= Siege.MORTAR.cooldownMs && (dmg[B] > 0 || Math.hypot(lead.x, lead.z) < 34)) {
    const cx = mine.reduce((n, m) => n + m.x, 0) / mine.length, cz = mine.reduce((n, m) => n + m.z, 0) / mine.length;
    if (Math.hypot(cx - pit.x, cz - pit.z) >= 12 && Math.hypot(cx - pit.x, cz - pit.z) <= 52 && Math.hypot(cx, cz) >= 11) {
      try { const r = call(H, '/fire', { aim: { x: cx, z: cz } }, now + 30).body; lastMortar = now; mortarHits += r.fire.hits.length; by.mortar += r.fire.hits.filter(h => h.killed).length; }
      catch (e) { if (!/no_active_siege/.test(e.message)) throw e; }
    }
  }
}
const finalSnap = call(H, '', null, t + 76_000).body.siege;
const packAfter = finalSnap.packs.find(p => p.id === target.id);
assert.ok(packDead || packAfter.alive === 0, 'one horde wiped out by the combined defense');
assert.ok(dmg[A] > 0 && dmg[B] > 0 && by[A] + by[B] > 0, 'both platform defenders hit the horde and scored kills: ' + JSON.stringify({ by, dmg }));
assert.ok(mortarHits > 0, 'the mortar hit the approaching horde');
assert.ok(store.m['homefront.json'][H].resources.ammo < hostAmmo0, 'mortar shells came from the host refuge');
// The siege resolves (repelled or the walls took pressure) and is applied exactly once.
let end = finalSnap;
for (let now = t + 76_000; end.status === 'active' && now < t + 200_000; now += 5000) end = call(H, '', null, now).body.siege;
assert.notEqual(end.status, 'active', 'siege ends');
const hostAfter = store.m['homefront.json'][H];
assert.ok(hostAfter.log.some(l => /LIVE SIEGE/.test(l.text)), 'outcome logged on the host refuge');
assert.equal(hostAfter.lastSiege.live, true);
const rev = hostAfter.revision;
call(H, '', null, t + 210_000);
assert.equal(store.m['homefront.json'][H].revision, rev, 'result applied once');
expectErr(() => call(H, '/start', {}, end.endedAt + 1000), /siege_cooldown/, 'the horde regroups before the next call');

// ---- breach: an undefended siege lets the horde hit the walls and damages structures.
let lone = refuge('rLone', { level: 2 }); lone = Core.applyAction(lone, 'rLone', { type: 'build', building: 'wall', x: 8, z: 0 }, 1);
const st2 = memStore({ 'homefront.json': { rLone: lone } });
const c2 = (sub, payload, now) => Siege.route({ method: sub ? 'POST' : 'GET', path: '/api/homefront/world/siege' + sub, query: q(), payload, acct: 'rLone', store: st2, worldDb: { players: {}, parties: {} }, now });
c2('/start', {}, 1_000_000);
const res = c2('', null, 1_000_000 + 70_000).body.siege;
assert.equal(res.status, 'breached');
assert.ok(res.result.structureDamage > 0);
assert.ok(st2.m['homefront.json'].rLone.structures[0].hp < lone.structures[0].hp, 'wall took siege damage');

// ---- persistence normalization: garbage or old siege files load safely.
assert.deepEqual(Siege.normalizeState(null), {});
assert.deepEqual(Siege.normalizeState({ x: { status: 'weird' }, y: 5, z: { status: 'active', members: 'no', packs: [], defenders: {} } }), {});
// Live siege results cannot be submitted through the public action route.
expectErr(() => Core.applyAction(Core.createBase('rX', 1), 'rX', { type: 'live_siege_result', structureDamage: 0, status: 'repelled' }, 2), /unknown_action/);
console.log('Homefront live siege tests passed.', JSON.stringify(by), 'mortar hits', mortarHits);
