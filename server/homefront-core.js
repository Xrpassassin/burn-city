// Renderer-independent, server-authoritative rules for the optional Zombies Homefront mode.
'use strict';

const VERSION = 1;
const MAX_STRUCTURES = 60;
const MAX_SURVIVORS = 12;
const ROLES = new Set(['idle', 'guard', 'scavenger', 'farmer', 'medic', 'mechanic']);
const BUILDINGS = Object.freeze({
  wall:       { cost: { wood: 8, scrap: 2 }, hp: 100, defense: 2, cap: 30 },
  watchtower: { cost: { wood: 14, scrap: 10 }, hp: 150, defense: 8, cap: 6 },
  garden:     { cost: { wood: 8, scrap: 3 }, hp: 70, defense: 0, cap: 6 },
  workshop:   { cost: { wood: 12, scrap: 14 }, hp: 120, defense: 1, cap: 3 },
  infirmary:  { cost: { wood: 10, scrap: 8, meds: 2 }, hp: 100, defense: 0, cap: 2 },
  storage:    { cost: { wood: 10, scrap: 5 }, hp: 100, defense: 0, cap: 4 },
  gate:       { cost: { wood: 12, scrap: 8 }, hp: 180, defense: 3, cap: 2 }
});
const clampInt = (v, min, max) => Number.isFinite(v) ? Math.max(min, Math.min(max, Math.floor(v))) : min;
const clampNumber = (v, min, max) => Number.isFinite(v) ? Math.max(min, Math.min(max, v)) : 0;
const cleanOwner = id => typeof id === 'string' && id.trim() && id.length <= 180 ? id.trim() : null;
const clone = v => JSON.parse(JSON.stringify(v));
const hash = s => { let h = 2166136261; for (const c of String(s)) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return h >>> 0; };
const rand = seed => { let x = seed >>> 0; x ^= x << 13; x ^= x >>> 17; x ^= x << 5; return (x >>> 0) / 4294967296; };

function createBase(ownerId, now = Date.now()) {
  const owner = cleanOwner(ownerId);
  if (!owner) throw new Error('invalid_owner');
  return {
    version: VERSION, owner, revision: 1, createdAt: now, updatedAt: now,
    level: 1, day: 1, baseHp: 500, baseMaxHp: 500, wave: 0,
    resources: { wood: 40, scrap: 30, food: 24, meds: 5, ammo: 18 },
    structures: [], survivors: [], expeditionCount: 0, defenseCount: 0,
    log: [{ id: 1, kind: 'welcome', text: 'A refuge is yours. Gather supplies, recruit survivors, and prepare for the first breach.', at: now }]
  };
}
function validateBase(input, ownerId) {
  const owner = cleanOwner(ownerId);
  if (!owner || !input || input.version !== VERSION || input.owner !== owner ||
      !input.resources || !Array.isArray(input.structures) || !Array.isArray(input.survivors) ||
      input.structures.length > MAX_STRUCTURES || input.survivors.length > MAX_SURVIVORS) return null;
  const out = clone(input);
  for (const r of ['wood', 'scrap', 'food', 'meds', 'ammo']) out.resources[r] = clampInt(out.resources[r], 0, 999999);
  out.baseMaxHp = clampInt(out.baseMaxHp, 1, 100000);
  out.baseHp = clampInt(out.baseHp, 0, out.baseMaxHp);
  out.level = clampInt(out.level, 1, 1000); out.day = clampInt(out.day, 1, 1000000);
  out.wave = clampInt(out.wave, 0, 1000000);
  out.revision = clampInt(out.revision, 1, Number.MAX_SAFE_INTEGER);
  out.structures = out.structures.filter(s => s && BUILDINGS[s.type] && typeof s.id === 'string')
    .map(s => ({ id: s.id.slice(0, 80), type: s.type, hp: clampInt(s.hp, 0, BUILDINGS[s.type].hp), maxHp: BUILDINGS[s.type].hp, x: clampNumber(s.x, -9.5, 9.5), z: clampNumber(s.z, -9.5, 9.5) }));
  out.survivors = out.survivors.filter(s => s && typeof s.id === 'string' && ROLES.has(s.role))
    .map(s => ({ id: s.id.slice(0, 80), name: String(s.name || 'Survivor').slice(0, 40), role: s.role, morale: clampInt(s.morale, 0, 100) }));
  out.log = Array.isArray(out.log) ? out.log.slice(-20) : [];
  return out;
}
function record(s, kind, text, now) {
  s.log.push({ id: (s.log.at(-1)?.id || 0) + 1, kind, text, at: now });
  s.log = s.log.slice(-20);
}
function pay(s, cost) {
  for (const [k, v] of Object.entries(cost)) if ((s.resources[k] || 0) < v) throw new Error('insufficient_' + k);
  for (const [k, v] of Object.entries(cost)) s.resources[k] -= v;
}
function applyAction(input, ownerId, action, now = Date.now()) {
  const s = validateBase(input, ownerId);
  if (!s) throw new Error('invalid_or_foreign_base');
  if (!action || typeof action.type !== 'string') throw new Error('invalid_action');
  switch (action.type) {
    case 'build': {
      const spec = BUILDINGS[action.building];
      if (!spec) throw new Error('unknown_building');
      if (s.structures.length >= MAX_STRUCTURES) throw new Error('structure_limit');
      if (s.structures.filter(x => x.type === action.building).length >= spec.cap) throw new Error('building_cap');
      pay(s, spec.cost);
      const id = 'b' + (s.structures.reduce((n, x) => Math.max(n, Number(x.id.slice(1)) || 0), 0) + 1);
      const angle = s.structures.length * 2.399963229728653, radius = 3 + Math.floor(s.structures.length / 8) * 1.8;
      const x = Number.isFinite(action.x) ? action.x : Math.cos(angle) * radius;
      const z = Number.isFinite(action.z) ? action.z : Math.sin(angle) * radius;
      if (Math.abs(x) > 9.5 || Math.abs(z) > 9.5) throw new Error('placement_out_of_bounds');
      if (s.structures.some(v => Math.hypot(v.x - x, v.z - z) < 1.65)) throw new Error('placement_occupied');
      s.structures.push({ id, type: action.building, hp: spec.hp, maxHp: spec.hp, x, z });
      record(s, 'build', 'Constructed ' + action.building + '.', now);
      break;
    }
    case 'expedition': {
      if (s.baseHp <= 0) throw new Error('base_destroyed');
      if (s.resources.food < 2 || s.resources.ammo < 1) throw new Error('expedition_supplies_required');
      if (s.survivors.length >= MAX_SURVIVORS) throw new Error('survivor_capacity');
      s.resources.food -= 2; s.resources.ammo -= 1;
      const n = ++s.expeditionCount, roll = rand(hash(s.owner + ':' + n + ':' + s.revision));
      const scrap = 3 + Math.floor(roll * 8), wood = 2 + Math.floor(rand(hash('wood:' + s.owner + n)) * 7);
      s.resources.scrap = Math.min(999999, s.resources.scrap + scrap);
      s.resources.wood = Math.min(999999, s.resources.wood + wood);
      let found = false;
      if (roll > 0.56 && s.survivors.length < MAX_SURVIVORS) {
        const names = ['Mara','Jules','Rook','Tess','Cal','Niko','June','Ash','Vale','Beck','Iris','Sol'];
        const id = 's' + n;
        s.survivors.push({ id, name: names[hash(id + s.owner) % names.length], role: 'idle', morale: 65 });
        found = true;
      }
      if (roll < 0.12) { s.resources.meds = Math.min(999999, s.resources.meds + 2); }
      record(s, 'expedition', 'Expedition returned with ' + wood + ' wood and ' + scrap + ' scrap' + (found ? ', plus a survivor.' : '.'), now);
      break;
    }
    case 'assign': {
      const survivor = s.survivors.find(x => x.id === action.survivorId);
      if (!survivor) throw new Error('unknown_survivor');
      if (!ROLES.has(action.role)) throw new Error('unknown_role');
      if (action.role === 'guard' && s.survivors.filter(x => x.role === 'guard' && x.id !== survivor.id).length >= 6) throw new Error('guard_capacity');
      survivor.role = action.role;
      record(s, 'assignment', survivor.name + ' assigned to ' + action.role + '.', now);
      break;
    }
    case 'workday': {
      if (s.baseHp <= 0) throw new Error('base_destroyed');
      const farmers = s.survivors.filter(x => x.role === 'farmer').length;
      const scavengers = s.survivors.filter(x => x.role === 'scavenger').length;
      const mechanics = s.survivors.filter(x => x.role === 'mechanic').length;
      const medics = s.survivors.filter(x => x.role === 'medic').length;
      const foodCost = Math.max(1, Math.ceil(s.survivors.length / 3));
      if (s.resources.food < foodCost) throw new Error('not_enough_food_for_shift');
      s.resources.food -= foodCost;
      const gardenCount = s.structures.filter(x => x.type === 'garden' && x.hp > 0).length;
      const workshopCount = s.structures.filter(x => x.type === 'workshop' && x.hp > 0).length;
      const infirmaryCount = s.structures.filter(x => x.type === 'infirmary' && x.hp > 0).length;
      const foodGain = Math.min(999999, farmers * (1 + gardenCount) * 2);
      const scrapGain = Math.min(999999, scavengers * 2 + mechanics * workshopCount);
      s.resources.food = Math.min(999999, s.resources.food + foodGain);
      s.resources.scrap = Math.min(999999, s.resources.scrap + scrapGain);
      s.resources.meds = Math.min(999999, s.resources.meds + Math.min(medics, infirmaryCount));
      s.day++; s.level = Math.max(s.level, 1 + Math.floor((s.day - 1) / 5));
      for (const survivor of s.survivors) survivor.morale = clampInt(survivor.morale + (foodGain >= foodCost ? 2 : -8), 0, 100);
      record(s, 'workday', 'Day ' + s.day + ': +' + foodGain + ' food, +' + scrapGain + ' scrap, +' + Math.min(medics, infirmaryCount) + ' medicine.', now);
      break;
    }
    case 'defend': {
      if (s.baseHp <= 0) throw new Error('base_destroyed');
      s.wave++; s.defenseCount++;
      const guards = s.survivors.filter(x => x.role === 'guard').length;
      const ammoUsed = Math.min(s.resources.ammo, Math.max(1, Math.ceil(guards / 2) + 1));
      s.resources.ammo -= ammoUsed;
      const active = s.structures.filter(x => x.hp > 0);
      const defense = guards * 2 + active.reduce((n, x) => n + BUILDINGS[x.type].defense, 0) + ammoUsed * 0.8;
      const threat = 7 + s.wave * 2 + Math.floor(s.survivors.length / 3);
      const damage = Math.max(0, Math.ceil((threat - defense) * 6));
      s.baseHp = Math.max(0, s.baseHp - Math.ceil(damage * 0.45));
      let remaining = damage;
      for (const structure of active) {
        if (remaining <= 0) break;
        const hit = Math.min(structure.hp, remaining);
        structure.hp -= hit; remaining -= hit;
      }
      const lost = s.baseHp === 0;
      record(s, 'defense', lost ? 'The refuge fell during breach ' + s.wave + '.' : 'Breach ' + s.wave + ' repelled with ' + damage + ' structure damage.', now);
      break;
    }
    case 'repair': {
      if (s.resources.wood < 2 || s.resources.scrap < 1) throw new Error('repair_supplies_required');
      const target = action.target === 'base' ? null : s.structures.find(x => x.id === action.target);
      if (action.target !== 'base' && !target) throw new Error('unknown_repair_target');
      if (target && target.hp >= target.maxHp || !target && s.baseHp >= s.baseMaxHp) throw new Error('already_repaired');
      s.resources.wood -= 2; s.resources.scrap -= 1;
      if (target) target.hp = Math.min(target.maxHp, target.hp + 50);
      else s.baseHp = Math.min(s.baseMaxHp, s.baseHp + 75);
      record(s, 'repair', 'Repairs completed.', now);
      break;
    }
    default: throw new Error('unknown_action');
  }
  s.revision++;
  s.updatedAt = now;
  return s;
}

module.exports = { VERSION, MAX_STRUCTURES, MAX_SURVIVORS, ROLES, BUILDINGS, createBase, validateBase, applyAction };
