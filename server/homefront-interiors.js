'use strict';
// Server-authoritative Homefront interior state. Geometry is shared with the client catalog,
// but account progress and rewards are only committed here after distance/room/requirement checks.
const Catalog = require('../client/arena/homefront-interior-world.mjs');
const Inventory = require('./homefront-inventory');

const LANDMARKS = Object.freeze({
  north_bus_depot: { x: -8, z: -65 },
  collapsed_apartments: { x: -22, z: 48 },
  exchange_market: { x: -38, z: 32 },
  mercy_hospital: { x: 24, z: 30 },
  ironworks: { x: -16, z: 22 },
  buried_subway: { x: 6, z: -8 },
  research_annex: { x: -4, z: 6 }
});
const ENTRY_RADIUS = 14;
const INTERACTION_RADIUS = 4.8;
const REWARDS = Object.freeze({
  dispatch_drawer: [['scrap', 1, 3], ['ammo', 1, 2]],
  bus_luggage: [['food', 1, 2], ['water', 1, 2]],
  stockroom_shelves: [['food', 1, 2], ['scrap', 1, 3]],
  emergency_locker: [['meds', 1, 2], ['water', 1, 2]],
  tool_crate: [['scrap', 2, 5], ['wood', 1, 3]],
  terminal_archive: [['ammo', 2, 4], ['meds', 1, 2]]
});
const clampInt = (n, min, max) => Number.isFinite(n) ? Math.max(min, Math.min(max, Math.floor(n))) : min;
const copy = value => JSON.parse(JSON.stringify(value));
function normalize(input) {
  // Null-prototype maps: saved keys such as "__proto__" or "constructor" stay inert data.
  const out = Object.create(null);
  if (!input || typeof input !== 'object' || Array.isArray(input)) return out;
  for (const [account, saved] of Object.entries(input)) {
    if (!saved || typeof saved !== 'object' || Array.isArray(saved)) continue;
    const interiors = Object.create(null);
    for (const [landmarkId, state] of Object.entries(saved.interiors || {})) {
      const blueprint = Catalog.interiorForLandmark(landmarkId);
      if (!blueprint || !state || typeof state !== 'object') continue;
      const roomId = Catalog.interiorRoom(blueprint, state.roomId) ? state.roomId : blueprint.entryRoom;
      interiors[landmarkId] = {
        landmarkId, roomId,
        flags: [...new Set((Array.isArray(state.flags) ? state.flags : []).filter(v => typeof v === 'string' && v.length <= 64))].slice(0, 64),
        discovered: [...new Set((Array.isArray(state.discovered) ? state.discovered : []).filter(v => blueprint.interactables.some(item => item.id === v)))].slice(0, 64),
        used: [...new Set((Array.isArray(state.used) ? state.used : []).filter(v => blueprint.interactables.some(item => item.id === v)))].slice(0, 64),
        openedDoors: [...new Set((Array.isArray(state.openedDoors) ? state.openedDoors : []).filter(v => blueprint.rooms.some(room => room.exits.some(exit => exit.id === v))))].slice(0, 64),
        noise: clampInt(state.noise, 0, 100),
        doorDamage: Object.assign(Object.create(null), Object.fromEntries(Object.entries(state.doorDamage && typeof state.doorDamage === 'object' ? state.doorDamage : {}).filter(([doorId]) => blueprint.rooms.some(room => room.exits.some(exit => exit.id === doorId))).map(([doorId, value]) => [doorId, clampInt(value, 0, 100)]))),
        updatedAt: clampInt(state.updatedAt, 0, Number.MAX_SAFE_INTEGER)
      };
    }
    out[account] = { activeLandmarkId: Catalog.interiorForLandmark(saved.activeLandmarkId) ? saved.activeLandmarkId : null, interiors };
  }
  return out;
}
function currentState(input, account, landmarkId) {
  return input?.[account]?.interiors?.[landmarkId] || null;
}
function near(player, landmarkId, radius) {
  const point = LANDMARKS[landmarkId];
  return !!point && !!player && Math.hypot(player.x - point.x, player.z - point.z) <= radius;
}
function normalizeMutable(input) { return normalize(input); }
function enter(input, { account, player, landmarkId, now = Date.now() }) {
  const catalog = Catalog.interiorForLandmark(landmarkId);
  if (!catalog || !LANDMARKS[landmarkId]) throw new Error('unknown_interior');
  if (!player) throw new Error('not_in_expedition');
  if (!near(player, landmarkId, ENTRY_RADIUS)) throw new Error('too_far_from_interior');
  const stateMap = normalizeMutable(input);
  if (!stateMap[account]) stateMap[account] = { activeLandmarkId: null, interiors: Object.create(null) };
  if (!stateMap[account].interiors[landmarkId]) stateMap[account].interiors[landmarkId] = {
    ...Catalog.createInteriorState(landmarkId), doorDamage: {}, updatedAt: now
  };
  stateMap[account].activeLandmarkId = landmarkId;
  stateMap[account].interiors[landmarkId].updatedAt = now;
  return { state: stateMap, interior: copy(stateMap[account].interiors[landmarkId]), title: catalog.title };
}
function requireActive(input, account, player, now) {
  const stateMap = normalizeMutable(input);
  const owner = stateMap[account];
  if (!player) throw new Error('not_in_expedition');
  if (!owner?.activeLandmarkId) throw new Error('not_inside_interior');
  const landmarkId = owner.activeLandmarkId;
  const catalog = Catalog.interiorForLandmark(landmarkId);
  const state = owner.interiors[landmarkId];
  if (!catalog || !state) throw new Error('interior_state_missing');
  if (!near(player, landmarkId, ENTRY_RADIUS + 3)) throw new Error('too_far_from_interior');
  state.updatedAt = now;
  return { stateMap, owner, landmarkId, catalog, state };
}
function action(input, { account, player, actionId, now = Date.now() }) {
  const ctx = requireActive(input, account, player, now);
  const item = ctx.catalog.interactables.find(target => target.id === actionId && target.roomId === ctx.state.roomId);
  if (!item || ctx.state.used.includes(actionId)) throw new Error('interior_action_unavailable');
  const landmark = LANDMARKS[ctx.landmarkId];
  const room = Catalog.interiorRoom(ctx.catalog, ctx.state.roomId);
  const targetX = landmark.x + item.x, targetZ = landmark.z + item.z;
  if (Math.hypot(player.x - targetX, player.z - targetZ) > INTERACTION_RADIUS) throw new Error('too_far_from_interior_action');
  const result = Catalog.applyInteriorAction(ctx.catalog, ctx.state, actionId);
  if (result.state.noise > ctx.state.noise) {
    player.noiseLevel = Math.max(player.noiseLevel || 0, result.state.noise);
    player.lastNoiseAt = now; player.noiseX = player.x; player.noiseZ = player.z;
  }
  let reward = [];
  if (item.action === 'search') {
    const table = REWARDS[actionId] || [['scrap', 1, 2], ['food', 1, 1]];
    let seed = 2166136261;
    for (const ch of String(account) + ':' + actionId + ':' + Math.floor(now / 60000)) seed = Math.imul(seed ^ ch.charCodeAt(0), 16777619) >>> 0;
    const roll = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
    for (const [itemId, min, max] of table) {
      const amount = min + Math.floor(roll() * (max - min + 1));
      const added = Inventory.add(player.inventory, itemId, amount);
      player.inventory = added.inventory;
      if (added.accepted) reward.push({ item: itemId, amount: added.accepted });
      if (added.rejected) reward.push({ item: itemId, amount: 0, overflow: added.rejected });
    }
  }
  ctx.owner.interiors[ctx.landmarkId] = { ...result.state, updatedAt: now };
  ctx.owner.activeLandmarkId = ctx.landmarkId;
  return { state: ctx.stateMap, interior: copy(ctx.owner.interiors[ctx.landmarkId]), message: result.message, reward, inventory: Inventory.normalize(player.inventory), noise: result.state.noise };
}
function traverse(input, { account, player, doorId, now = Date.now() }) {
  const ctx = requireActive(input, account, player, now);
  const room = Catalog.interiorRoom(ctx.catalog, ctx.state.roomId);
  const exit = room?.exits.find(item => item.id === doorId);
  if (!exit) throw new Error('interior_door_unavailable');
  const landmark = LANDMARKS[ctx.landmarkId];
  const targetX = landmark.x + room.x + (exit.side === 'east' ? room.width / 2 : exit.side === 'west' ? -room.width / 2 : 0);
  const targetZ = landmark.z + room.z + (exit.side === 'south' ? room.depth / 2 : exit.side === 'north' ? -room.depth / 2 : 0);
  if (Math.hypot(player.x - targetX, player.z - targetZ) > INTERACTION_RADIUS) throw new Error('too_far_from_interior_door');
  const next = Catalog.traverseInteriorDoor(ctx.catalog, ctx.state, doorId);
  ctx.owner.interiors[ctx.landmarkId] = { ...next, updatedAt: now };
  return { state: ctx.stateMap, interior: copy(ctx.owner.interiors[ctx.landmarkId]), room: Catalog.interiorRoom(ctx.catalog, next.roomId) };
}
function breachDoor(input, { account, landmarkId, doorId, damage, now = Date.now() }) {
  const stateMap = normalize(input);
  const owner = stateMap[account];
  if (!owner || owner.activeLandmarkId !== landmarkId) throw new Error('interior_not_active');
  const blueprint = Catalog.interiorForLandmark(landmarkId);
  const state = owner.interiors?.[landmarkId];
  if (!blueprint || !state) throw new Error('interior_state_missing');
  const exits = blueprint.rooms.flatMap(room => room.exits.filter(exit => exit.id === doorId).map(exit => ({ room, exit })));
  if (!exits.length) throw new Error('interior_door_unavailable');
  if (exits.some(({ exit }) => exit.requires?.length)) throw new Error('interior_door_secure');
  if (state.openedDoors.includes(doorId)) return { state: stateMap, broken: true, progress: 100 };
  state.doorDamage = state.doorDamage || {};
  const progress = Math.min(100, (state.doorDamage[doorId] || 0) + Math.max(0, Number.isFinite(damage) ? damage : 0));
  state.doorDamage[doorId] = progress;
  state.updatedAt = now;
  const broken = progress >= 100;
  if (broken) state.openedDoors = [...new Set([...state.openedDoors, doorId])];
  owner.interiors[landmarkId] = state;
  return { state: stateMap, broken, progress };
}
function leave(input, { account, player, now = Date.now() }) {
  const ctx = requireActive(input, account, player, now);
  ctx.owner.activeLandmarkId = null;
  ctx.stateMap[account] = ctx.owner;
  return { state: ctx.stateMap, left: true };
}
// A physical building is one shared world space, NOT one copy per player.
// Account room/progression remains private; room presence is exposed only for
// active, nearby, fresh players already returned by world interest management.
function roomPresence(input, players, account, now = Date.now(), ttl = 45_000) {
  const player = players?.[account];
  const landmarkId = input?.[account]?.activeLandmarkId;
  const blueprint = Catalog.interiorForLandmark(landmarkId);
  const point = LANDMARKS[landmarkId];
  const roomId = input?.[account]?.interiors?.[landmarkId]?.roomId;
  if (!player || !point || !blueprint || !Catalog.interiorRoom(blueprint, roomId) ||
      !Number.isFinite(player.x) || !Number.isFinite(player.z) ||
      !Number.isFinite(player.lastSeen) || now - player.lastSeen > ttl ||
      Math.hypot(player.x - point.x, player.z - point.z) > ENTRY_RADIUS + 6) return null;
  return { instanceId: 'homefront:building:' + landmarkId, landmarkId, roomId };
}

function publicState(input, account) {
  const owner = input?.[account];
  if (!owner?.activeLandmarkId) return null;
  const landmarkId = owner.activeLandmarkId;
  const blueprint = Catalog.interiorForLandmark(landmarkId);
  const state = owner.interiors?.[landmarkId];
  return blueprint && state ? { ...copy(state), title: blueprint.title, room: Catalog.interiorRoom(blueprint, state.roomId), actions: Catalog.availableInteriorActions(blueprint, state) } : null;
}
module.exports = { LANDMARKS, ENTRY_RADIUS, INTERACTION_RADIUS, REWARDS, normalize, enter, action, traverse, breachDoor, leave, publicState, roomPresence };
