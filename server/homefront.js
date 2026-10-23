// Authenticated, persistent API for the optional unranked Zombies Homefront mode.
'use strict';
const Store = require('./store');
const Core = require('./homefront-core');
const World = require('./homefront-world');

async function handle(req, res, url, { json, gate, ip, body, who, store = Store }) {
  const publicVisit = url.pathname === '/api/homefront/visit';
  const worldRoute = url.pathname === '/api/homefront/world' || url.pathname.startsWith('/api/homefront/world/');
  if (url.pathname !== '/api/homefront' && url.pathname !== '/api/homefront/action' && !publicVisit && !worldRoute) return false;
  if (req.method !== 'GET' && req.method !== 'POST') { json(res, 405, { error: 'method_not_allowed' }); return true; }
  if (publicVisit) {
    if (req.method !== 'GET') { json(res, 405, { error: 'method_not_allowed' }); return true; }
    if (gate('homefront-visit-ip:' + ip, 60, 60e3)) { json(res, 429, { error: 'slow_down' }); return true; }
    try {
      const owner = String(url.searchParams.get('owner') || '').trim();
      if (!owner || owner.length > 128) { json(res, 400, { error: 'invalid_owner' }); return true; }
      const db = store.load('homefront.json', {});
      const saved = db[owner];
      if (!saved || saved.visibility !== 'public') { json(res, 404, { error: 'refuge_private_or_not_found', message: 'This refuge is private or does not exist.' }); return true; }
      const base = Core.validateBase(saved, owner);
      if (!base || base.visibility !== 'public') { json(res, 404, { error: 'refuge_private_or_not_found' }); return true; }
      // Visitors receive a read-only settlement snapshot. Never expose the owner's action route here.
      json(res, 200, { mode: 'homefront-visit', base: { ...base, owner: undefined, log: base.log.slice(-8) } });
      return true;
    } catch (e) { json(res, 500, { error: 'homefront_visit_unavailable' }); return true; }
  }
  const user = who();
  if (!user?.acct) { json(res, 401, { error: 'sign_in_with_xaman', message: 'Sign in to save your personal refuge.' }); return true; }
  if (worldRoute) {
    if (gate('homefront-world:' + user.acct, 120, 60e3) || gate('homefront-world-ip:' + ip, 300, 60e3)) { json(res, 429, { error: 'slow_down' }); return true; }
    try {
      const payload = req.method === 'POST' ? await body() : null;
      const db = store.load('homefront-world.json', World.defaultWorld());
      let outcome;
      if (req.method === 'GET' && url.pathname === '/api/homefront/world') {
        const joined = World.enter(db, user.acct);
        store.save('homefront-world.json', joined.world);
        json(res, 200, { mode: 'homefront-world', ...joined.result }); return true;
      }
      if (req.method !== 'POST' || !payload || typeof payload !== 'object' || Array.isArray(payload)) { json(res, 400, { error: 'invalid_world_action' }); return true; }
      switch (url.pathname) {
        case '/api/homefront/world/move': outcome = World.move(db, user.acct, Number(payload.x), Number(payload.z)); break;
        case '/api/homefront/world/scavenge':
        case '/api/homefront/world/boss-hunt': {
          const player = db.players[user.acct];
          if (!player) throw new Error('not_in_expedition');
          const isBoss = url.pathname.endsWith('/boss-hunt');
          const nearest = World.nearestPoint(player.x, player.z, isBoss ? 'boss' : 'non-boss');
          if (!nearest || nearest.distance > (isBoss ? 14 : 18)) throw new Error(isBoss ? 'not_at_boss_site' : 'too_far_from_site');
          if (isBoss && payload.pointId && payload.pointId !== nearest.point.id) throw new Error('not_at_boss_site');
          const bases = store.load('homefront.json', {});
          const savedBase = bases[user.acct] || Core.createBase(user.acct);
          const base = Core.validateBase(savedBase, user.acct);
          if (!base) throw new Error('save_invalid');
          const nextBase = Core.applyAction(base, user.acct, { type: 'expedition', zone: nearest.point.zone });
          let defeated = false;
          if (isBoss) {
            const boss = db.bosses[nearest.point.id];
            if (boss.respawnAt && boss.respawnAt <= Date.now()) { boss.hp = boss.maxHp; boss.respawnAt = 0; }
            if (boss.respawnAt > Date.now() || boss.hp <= 0) throw new Error('boss_respawning');
            boss.hp = Math.max(0, boss.hp - (nearest.point.id === 'research_annex' ? 30 : 36));
            if (boss.hp === 0) {
              defeated = true; boss.respawnAt = Date.now() + 5 * 60e3;
              nextBase.resources.scrap = Math.min(999999, nextBase.resources.scrap + 45);
              nextBase.resources.meds = Math.min(999999, nextBase.resources.meds + 3);
              nextBase.log.push({ id: (nextBase.log.at(-1)?.id || 0) + 1, kind: 'boss', text: 'Boss defeated at ' + nearest.point.label + '! Recovered 45 bonus scrap and 3 medicine.', at: Date.now() });
              nextBase.log = nextBase.log.slice(-20);
            }
          }
          bases[user.acct] = nextBase; store.save('homefront.json', bases);
          player.lastSeen = Date.now();
          store.save('homefront-world.json', db);
          const snap = World.snapshot(db, user.acct);
          json(res, 200, { mode: 'homefront-world', ...snap, base: nextBase, encounter: isBoss ? { id: nearest.point.id, label: nearest.point.label, hp: db.bosses[nearest.point.id].hp, maxHp: db.bosses[nearest.point.id].maxHp, defeated } : { id: nearest.point.id, label: nearest.point.label, scavenged: true } });
          return true;
        }
        case '/api/homefront/world/party/create': outcome = World.createParty(db, user.acct); break;
        case '/api/homefront/world/party/create': outcome = World.createParty(db, user.acct); break;
        case '/api/homefront/world/party/join': outcome = World.joinParty(db, user.acct, payload.code); break;
        case '/api/homefront/world/leave': outcome = World.leave(db, user.acct); break;
        default: json(res, 404, { error: 'world_route_not_found' }); return true;
      }
      store.save('homefront-world.json', outcome.world);
      json(res, 200, { mode: 'homefront-world', ...outcome.result }); return true;
    } catch (e) {
      const message = String(e?.message || 'homefront_world_error');
      const clientError = /^(not_in_expedition|move_cooldown|party_not_found|party_full|already_in_party|invalid_world_action|party_leader_controls_movement|too_far_from_site|not_at_boss_site|boss_respawning|zone_not_discovered|unknown_exploration_zone|expedition_supplies_required|base_destroyed|insufficient_)/.test(message);
      json(res, clientError ? 400 : 500, { error: message });
      if (!clientError) console.error('[homefront-world]', message);
      return true;
    }
  }
  if (gate('homefront:' + user.acct, 90, 60e3) || gate('homefront-ip:' + ip, 180, 60e3)) {
    json(res, 429, { error: 'slow_down' }); return true;
  }
  try {
    // Parse the request body before reading the shared save file. Once the save is
    // loaded, action validation and the atomic store write contain no await point,
    // preventing concurrent requests from committing stale snapshots over each other.
    const payload = req.method === 'POST' ? await body() : null;
    const db = store.load('homefront.json', {});
    let base = db[user.acct];
    if (!base) {
      base = Core.createBase(user.acct);
      db[user.acct] = base;
      store.save('homefront.json', db);
    } else {
      base = Core.validateBase(base, user.acct);
      if (!base) { json(res, 500, { error: 'save_invalid', message: 'The saved refuge could not be validated; it was not overwritten.' }); return true; }
    }
    if (req.method === 'GET' && url.pathname === '/api/homefront') {
      json(res, 200, { mode: 'homefront', base });
      return true;
    }
    if (req.method !== 'POST' || url.pathname !== '/api/homefront/action') {
      json(res, 405, { error: 'method_not_allowed' }); return true;
    }
    if (!payload || !payload.action || typeof payload.action !== 'object' || Array.isArray(payload.action)) {
      json(res, 400, { error: 'invalid_action' }); return true;
    }
    const next = Core.applyAction(base, user.acct, payload.action);
    db[user.acct] = next;
    store.save('homefront.json', db);
    json(res, 200, { mode: 'homefront', base: next });
    return true;
  } catch (e) {
    const message = String(e?.message || 'homefront_error');
    const clientError = /^(invalid_|unknown_|insufficient_|placement_|building_cap|structure_limit|survivor_capacity|guard_capacity|expedition_supplies_required|base_destroyed|not_enough_food|repair_supplies_required|already_repaired)/.test(message);
    json(res, clientError ? 400 : 500, { error: message });
    if (!clientError) console.error('[homefront]', message);
    return true;
  }
}
module.exports = { handle };
