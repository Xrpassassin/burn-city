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
const DIFFICULTIES = Object.freeze({story:{label:'Story',cost:0.8,reward:0.7,threat:0.75},standard:{label:'Standard',cost:1,reward:1,threat:1},veteran:{label:'Veteran',cost:1.35,reward:1.55,threat:1.4},nightmare:{label:'Nightmare',cost:1.8,reward:2.35,threat:1.9}});
const TYCOON_UPGRADES = Object.freeze({scavenger_rig:{label:'Scavenger Rig',description:'+15% salvage per level',baseCost:100,max:5},ember_press:{label:'Ember Press',description:'+5 embers per successful expedition per level',baseCost:140,max:5},field_armory:{label:'Field Armory',description:'+2 defense strength per level',baseCost:120,max:5},medic_station:{label:'Field Medic Station',description:'+1 bonus medicine on successful trips per level',baseCost:160,max:3}});
const EMBER_MARKET = Object.freeze({wood:{amount:10,cost:22},scrap:{amount:10,cost:30},food:{amount:10,cost:18},meds:{amount:3,cost:45},ammo:{amount:10,cost:35}});
const EXPLORATION_ZONES = Object.freeze({outskirts:{label:'City Outskirts',risk:1,food:2,ammo:1,scrap:3,wood:2,meds:0,recruit:0.44,boss:false},residential:{label:'Residential Ruins',risk:1,food:3,ammo:1,scrap:5,wood:2,meds:0,recruit:0.5,boss:false},commercial:{label:'Market District',risk:2,food:3,ammo:2,scrap:8,wood:1,meds:1,recruit:0.38,boss:false},hospital:{label:'Overrun Hospital',risk:3,food:4,ammo:3,scrap:5,wood:1,meds:3,recruit:0.32,boss:false},industrial:{label:'Industrial Yard',risk:3,food:4,ammo:3,scrap:12,wood:2,meds:0,recruit:0.24,boss:false},subway:{label:'Buried Subway',risk:4,food:5,ammo:4,scrap:10,wood:1,meds:2,recruit:0.28,boss:true},research_lab:{label:'Sealed Research Annex',risk:5,food:6,ammo:5,scrap:16,wood:1,meds:4,recruit:0.2,boss:true}});
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
    level: 1, day: 1, baseHp: 500, baseMaxHp: 500, wave: 0, visibility: 'private',
    exploration: { discoveredZones: ['outskirts'], lastExpedition: null },
    resources: { wood: 40, scrap: 30, food: 24, meds: 5, ammo: 18 },
    embers: 50, upgrades: { scavenger_rig: 0, ember_press: 0, field_armory: 0, medic_station: 0 },
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
  out.embers = clampInt(out.embers, 0, 999999999);
  out.exploration = out.exploration && typeof out.exploration === 'object' ? out.exploration : {};
  out.exploration.discoveredZones = Array.isArray(out.exploration.discoveredZones) ? [...new Set(out.exploration.discoveredZones.filter(z => typeof z === 'string' && EXPLORATION_ZONES[z]))] : ['outskirts'];
  if (!out.exploration.discoveredZones.includes('outskirts')) out.exploration.discoveredZones.unshift('outskirts');
  out.exploration.lastExpedition = out.exploration.lastExpedition && typeof out.exploration.lastExpedition === 'object' ? out.exploration.lastExpedition : null;
  out.upgrades = out.upgrades && typeof out.upgrades === 'object' ? out.upgrades : {};
  for (const [id, spec] of Object.entries(TYCOON_UPGRADES)) out.upgrades[id] = clampInt(out.upgrades[id], 0, spec.max);
  out.visibility = input.visibility === 'public' ? 'public' : 'private';
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
    case 'visibility': {
      if (action.value !== 'public' && action.value !== 'private') throw new Error('invalid_visibility');
      s.visibility = action.value;
      record(s, 'visibility', action.value === 'public' ? 'Your refuge is open for visitors.' : 'Your refuge is private again.', now);
      break;
    }
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
      if (Math.hypot(x, z) < 2.4) throw new Error('placement_occupied');
      if (s.structures.some(v => Math.hypot(v.x - x, v.z - z) < 1.65)) throw new Error('placement_occupied');
      s.structures.push({ id, type: action.building, hp: spec.hp, maxHp: spec.hp, x, z });
      record(s, 'build', 'Constructed ' + action.building + '.', now);
      break;
    }
    case 'expedition': {
      if (s.baseHp <= 0) throw new Error('base_destroyed');
      if (s.resources.food < 2 || s.resources.ammo < 1) throw new Error('expedition_supplies_required');
      const zones = { outskirts: { label: 'City Outskirts', risk: 1, food: 2, ammo: 1, scrap: 3, wood: 2, meds: 0, recruit: 0.44 }, residential: { label: 'Residential Ruins', risk: 1, food: 3, ammo: 1, scrap: 5, wood: 2, meds: 0, recruit: 0.5 }, commercial: { label: 'Market District', risk: 2, food: 3, ammo: 2, scrap: 8, wood: 1, meds: 1, recruit: 0.38 }, hospital: { label: 'Overrun Hospital', risk: 3, food: 4, ammo: 3, scrap: 5, wood: 1, meds: 3, recruit: 0.32 }, industrial: { label: 'Industrial Yard', risk: 3, food: 4, ammo: 3, scrap: 12, wood: 2, meds: 0, recruit: 0.24 }, subway: { label: 'Buried Subway', risk: 4, food: 5, ammo: 4, scrap: 10, wood: 1, meds: 2, recruit: 0.28 }, research_lab: { label: 'Sealed Research Annex', risk: 5, food: 6, ammo: 5, scrap: 16, wood: 1, meds: 4, recruit: 0.2 } };
      const zoneId = typeof action.zone === 'string' ? action.zone : 'outskirts';
      const difficultyId = typeof action.difficulty === 'string' ? action.difficulty : 'standard';
      const difficulty = DIFFICULTIES[difficultyId];
      if (!difficulty) throw new Error('unknown_difficulty');
      const zone = zones[zoneId];
      if (!zone) throw new Error('unknown_exploration_zone');
      // The shared-map API enforces physical proximity to this site. Do not gate districts by completed expeditions or round counters.
      const cost = { food: Math.max(1, Math.ceil(zone.food * difficulty.cost)), ammo: Math.max(1, Math.ceil(zone.ammo * difficulty.cost)) };
      pay(s, cost);
      const n = ++s.expeditionCount, seed = hash(s.owner + ':' + n + ':' + zoneId + ':' + difficultyId + ':' + s.revision), roll = rand(seed);
      const lootMultiplier = difficulty.reward * (1 + (s.upgrades.scavenger_rig || 0) * 0.15);
      const scrap = Math.floor(zone.scrap * lootMultiplier) + Math.floor(rand(hash('scrap:' + seed)) * 5), wood = Math.floor(zone.wood * lootMultiplier) + Math.floor(rand(hash('wood:' + seed)) * 4);
      const firstVisit = !s.exploration.discoveredZones.includes(zoneId);
      if (firstVisit) s.exploration.discoveredZones.push(zoneId);
      s.exploration.lastExpedition = { zone: zoneId, difficulty: difficultyId, risk: zone.risk, at: now, firstVisit };
      s.resources.scrap = Math.min(999999, s.resources.scrap + scrap); s.resources.wood = Math.min(999999, s.resources.wood + wood);
      const discoveryScrap = firstVisit ? zone.risk * 3 : 0;
      const discoveryEmbers = firstVisit ? 10 + zone.risk * 5 : 0;
      if (discoveryScrap) s.resources.scrap = Math.min(999999, s.resources.scrap + discoveryScrap);
      const medicine = Math.floor(zone.meds * difficulty.reward) + (zone.meds > 0 ? (s.upgrades.medic_station || 0) : 0);
      if (medicine) s.resources.meds = Math.min(999999, s.resources.meds + medicine);
      const embersEarned = Math.max(1, Math.floor((8 + zone.risk * 7) * difficulty.reward) + (s.upgrades.ember_press || 0) * 5);
      const totalEmbers = embersEarned + discoveryEmbers;
      s.embers = Math.min(999999999, s.embers + totalEmbers);
      // A location- and difficulty-aware Director varies expedition pressure without escalating rounds.
      const directorRoll = rand(hash('director:' + seed));
      const pressure = zone.risk * difficulty.threat;
      let directorEvent = 'quiet';
      if (directorRoll < Math.min(0.18, 0.025 * pressure)) directorEvent = 'special_infected';
      else if (directorRoll < Math.min(0.48, 0.09 * pressure)) directorEvent = 'infected_horde';
      else if (directorRoll < Math.min(0.78, 0.18 * pressure)) directorEvent = 'wandering_infected';
      let ambush = false;
      if (directorEvent === 'special_infected' || directorEvent === 'infected_horde') {
        ambush = true;
        const ammoLoss = Math.min(s.resources.ammo, Math.max(1, Math.ceil(pressure / 2)));
        s.resources.ammo -= ammoLoss;
        if (s.survivors.length) {
          const injured = s.survivors[hash('injury:' + seed) % s.survivors.length];
          injured.morale = clampInt(injured.morale - 8 - zone.risk * 2, 0, 100);
        } else s.resources.food = Math.max(0, s.resources.food - 1);
      }
      let found = false;
      if (roll > 1 - zone.recruit && s.survivors.length < MAX_SURVIVORS) { const names = ['Mara','Jules','Rook','Tess','Cal','Niko','June','Ash','Vale','Beck','Iris','Sol']; const id = 's' + n; s.survivors.push({ id, name: names[hash(id + s.owner) % names.length], role: 'idle', morale: Math.max(35, 65 - zone.risk * 4) }); found = true; }
      const eventText = directorEvent === 'special_infected' ? ' A special infected ambushed the team; ammunition was spent and a survivor was shaken.' : directorEvent === 'infected_horde' ? ' An infected horde hit the team; ammunition was spent and morale suffered.' : directorEvent === 'wandering_infected' ? ' Wandering infected were spotted nearby, but the team avoided a full ambush.' : ' The district was quiet enough to search thoroughly.';
      const result = 'Explored ' + zone.label + ' on ' + difficulty.label + ': recovered ' + wood + ' wood, ' + (scrap + discoveryScrap) + ' scrap, and ' + totalEmbers + ' embers' + (firstVisit ? ' including a first-visit survey bonus' : '') + (medicine ? ', plus medical supplies' : '') + (found ? ', and rescued a survivor.' : '.') + eventText + (zone.risk >= 4 ? ' This is a fixed high-risk location; danger is tied to the site, not completed rounds.' : '');
      record(s, 'exploration', result, now);
      break;
    }
    case 'buy_upgrade': {
      const id = typeof action.upgrade === 'string' ? action.upgrade : '';
      const spec = TYCOON_UPGRADES[id];
      if (!spec) throw new Error('unknown_upgrade');
      const level = s.upgrades[id] || 0;
      if (level >= spec.max) throw new Error('upgrade_maxed');
      const cost = spec.baseCost * (level + 1);
      if (s.embers < cost) throw new Error('insufficient_embers');
      s.embers -= cost; s.upgrades[id] = level + 1;
      record(s, 'upgrade', spec.label + ' upgraded to level ' + s.upgrades[id] + ' for ' + cost + ' embers.', now);
      break;
    }
    case 'buy_materials': {
      const resource = typeof action.resource === 'string' ? action.resource : '';
      const pack = EMBER_MARKET[resource];
      if (!pack) throw new Error('unknown_market_resource');
      if (s.embers < pack.cost) throw new Error('insufficient_embers');
      if (s.resources[resource] + pack.amount > 999999) throw new Error('resource_capacity');
      s.embers -= pack.cost; s.resources[resource] += pack.amount;
      record(s, 'market', 'Traded ' + pack.cost + ' embers for ' + pack.amount + ' ' + resource + '.', now);
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
    case 'rally': {
      if (s.baseHp <= 0) throw new Error('base_destroyed');
      if (s.survivors.length === 0) throw new Error('no_survivors_to_rally');
      if (s.resources.food < 4) throw new Error('rally_food_required');
      const demoralized = s.survivors.filter(x => x.morale < 100);
      if (demoralized.length === 0) throw new Error('morale_already_max');
      s.resources.food -= 4;
      for (const survivor of demoralized) survivor.morale = clampInt(survivor.morale + 15, 0, 100);
      record(s, 'rally', 'The survivors shared a hot meal by the campfire. Morale rose by up to 15 points.', now);
      break;
    }
    case 'workday': {
      if (s.baseHp <= 0) throw new Error('base_destroyed');
      // Morale is operational, not cosmetic: exhausted or demoralized workers produce less.
      const labor = role => s.survivors.filter(x => x.role === role).reduce((total, x) => {
        const morale = clampInt(x.morale, 0, 100);
        return total + (morale >= 80 ? 1.25 : morale >= 40 ? 1 : morale >= 20 ? 0.75 : 0.5);
      }, 0);
      const farmers = labor('farmer');
      const scavengers = labor('scavenger');
      const mechanics = labor('mechanic');
      const medics = labor('medic');
      const foodCost = Math.max(1, Math.ceil(s.survivors.length / 3));
      if (s.resources.food < foodCost) throw new Error('not_enough_food_for_shift');
      s.resources.food -= foodCost;
      const gardenCount = s.structures.filter(x => x.type === 'garden' && x.hp > 0).length;
      const workshopCount = s.structures.filter(x => x.type === 'workshop' && x.hp > 0).length;
      const infirmaryCount = s.structures.filter(x => x.type === 'infirmary' && x.hp > 0).length;
      const storageCount = s.structures.filter(x => x.type === 'storage' && x.hp > 0).length;
      const foodGain = Math.floor(Math.min(999999, farmers * (1 + gardenCount) * 2));
      // Storage sheds make scavenging trips more efficient, but only while intact.
      const scrapGain = Math.floor(Math.min(999999, scavengers * (2 + storageCount) + mechanics * workshopCount));
      const medicineGain = Math.floor(Math.min(medics, infirmaryCount));
      s.resources.food = Math.min(999999, s.resources.food + foodGain);
      s.resources.scrap = Math.min(999999, s.resources.scrap + scrapGain);
      s.resources.meds = Math.min(999999, s.resources.meds + medicineGain);
      s.day++; s.level = Math.max(s.level, 1 + Math.floor((s.day - 1) / 5));
      for (const survivor of s.survivors) survivor.morale = clampInt(survivor.morale + (foodGain >= foodCost ? 2 : -8), 0, 100);
      record(s, 'workday', 'Day ' + s.day + ': +' + foodGain + ' food, +' + scrapGain + ' scrap, +' + medicineGain + ' medicine.', now);
      break;
    }
    case 'defend': {
      if (s.baseHp <= 0) throw new Error('base_destroyed');
      s.defenseCount++;
      const guards = s.survivors.filter(x => x.role === 'guard');
      const guardStrength = guards.reduce((total, x) => {
        const morale = clampInt(x.morale, 0, 100);
        return total + (morale >= 80 ? 1.25 : morale >= 40 ? 1 : morale >= 20 ? 0.75 : 0.5);
      }, 0);
      const ammoUsed = Math.min(s.resources.ammo, Math.max(1, Math.ceil(guards.length / 2) + 1));
      s.resources.ammo -= ammoUsed;
      const active = s.structures.filter(x => x.hp > 0);
      const defense = guardStrength * 2 + (s.upgrades.field_armory || 0) * 2 + active.reduce((n, x) => n + BUILDINGS[x.type].defense, 0) + ammoUsed * 0.8;
      const threat = 9 + Math.floor(s.survivors.length / 4); // Fixed perimeter threat; never scales with breach count.
      const damage = Math.max(0, Math.ceil((threat - defense) * 6));
      s.baseHp = Math.max(0, s.baseHp - Math.ceil(damage * 0.45));
      let remaining = damage;
      for (const structure of active) {
        if (remaining <= 0) break;
        const hit = Math.min(structure.hp, remaining);
        structure.hp -= hit; remaining -= hit;
      }
      const lost = s.baseHp === 0;
      record(s, 'defense', lost ? 'The refuge fell during a perimeter breach.' : 'Perimeter breach repelled with ' + damage + ' structure damage. Threat is independent of breach count.', now);
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

module.exports = { VERSION, MAX_STRUCTURES, MAX_SURVIVORS, ROLES, BUILDINGS, DIFFICULTIES, TYCOON_UPGRADES, EMBER_MARKET, EXPLORATION_ZONES, createBase, validateBase, applyAction };
