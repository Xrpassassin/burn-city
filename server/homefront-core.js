// Renderer-independent, server-authoritative rules for the optional Zombies Homefront mode.
'use strict';
const { resolveDirectorLoot } = require('./homefront-director');
const Companions = require('./homefront-companions');
const CindersEffects = require('./homefront-cinders-effects');

// Lookup tables keyed by client-supplied ids are null-prototype so 'constructor'/'__proto__'/'toString' never resolve.
const NP = o => Object.freeze(Object.assign(Object.create(null), o));
const VERSION = 1;
const MAX_STRUCTURES = 60;
const MAX_SURVIVORS = 12;
const MAX_FARM_PLOTS = 24;
const CROPS = NP({ potato: { days: 3, yield: 5, seedCost: 1 }, beans: { days: 4, yield: 7, seedCost: 1 }, corn: { days: 5, yield: 9, seedCost: 2 } });
const ROLES = new Set(['idle', 'guard', 'scavenger', 'farmer', 'medic', 'mechanic']);
const SURVIVOR_TASKS = new Set(['rest_at_refuge', 'perimeter_watch', 'defend_perimeter', 'stockpile_supplies', 'tend_crops', 'infirmary_duty', 'triage_standby', 'maintain_structures', 'emergency_repair', 'stand_by_repairs', 'take_shelter', 'field_escort']);
const SURVIVOR_STATS = Object.freeze(['combat', 'scavenging', 'farming', 'medical', 'engineering', 'endurance']);
const MATERIAL_TIERS = Object.freeze({ wood: { label: 'Wood', hp: 1, defense: 0, resistance: 0, next: 'stone' }, stone: { label: 'Stone', hp: 1.75, defense: 2, resistance: 0.18, next: 'steel' }, steel: { label: 'Steel', hp: 2.8, defense: 5, resistance: 0.35, next: null } });
const MATERIAL_UPGRADE_COSTS = Object.freeze({ stone: { stone: 12, scrap: 6 }, steel: { steel: 18, stone: 10, scrap: 12 } });
const ROLE_STAT = Object.freeze({ guard: 'combat', scavenger: 'scavenging', farmer: 'farming', medic: 'medical', mechanic: 'engineering', idle: 'endurance' });
const BUILDINGS = NP({
  wall:       { cost: { wood: 8, scrap: 2 }, hp: 100, defense: 2, cap: 30 },
  watchtower: { cost: { wood: 14, scrap: 10 }, hp: 150, defense: 8, cap: 6 },
  garden:     { cost: { wood: 8, scrap: 3 }, hp: 70, defense: 0, cap: 6 },
  workshop:   { cost: { wood: 12, scrap: 14 }, hp: 120, defense: 1, cap: 3 },
  infirmary:  { cost: { wood: 10, scrap: 8, meds: 2 }, hp: 100, defense: 0, cap: 2 },
  storage:    { cost: { wood: 10, scrap: 5 }, hp: 100, defense: 0, cap: 4 },
  gate:       { cost: { wood: 12, scrap: 8 }, hp: 180, defense: 3, cap: 2 },
  entrance:   { cost: { wood: 14, scrap: 10 }, hp: 220, defense: 5, cap: 1 },
  exit:       { cost: { wood: 14, scrap: 10 }, hp: 220, defense: 5, cap: 1 },
  sandbags:   { cost: { wood: 4, scrap: 6 }, hp: 130, defense: 4, cap: 12 },
  barbed_wire:{ cost: { wood: 2, scrap: 8 }, hp: 65, defense: 5, cap: 10 },
  trench:     { cost: { wood: 6, scrap: 8 }, hp: 160, defense: 3, cap: 6 },
  turret:     { cost: { wood: 10, scrap: 22, ammo: 2 }, hp: 180, defense: 5, cap: 4 },
  quarry:     { cost: { wood: 18, scrap: 12 }, hp: 140, defense: 0, cap: 2 },
  smelter:    { cost: { wood: 20, scrap: 18, stone: 10 }, hp: 160, defense: 1, cap: 2 },
  salvage_yard:{ cost: { wood: 14, scrap: 16 }, hp: 130, defense: 1, cap: 2 },
  // Siege emplacements (server/homefront-siege.js): an elevated deck with stairs that gives
  // defenders and guards range + line of sight over the walls, and a mortar pit (refuge level 5)
  // for indirect fire at hordes on the approach.
  gun_platform:{ cost: { wood: 18, scrap: 12 }, hp: 200, defense: 3, cap: 4 },
  mortar_pit: { cost: { wood: 8, scrap: 20, steel: 4 }, hp: 150, defense: 2, cap: 2, level: 5 }
});
const DIFFICULTIES = NP({story:{label:'Story',cost:0.8,reward:0.7,threat:0.75},standard:{label:'Standard',cost:1,reward:1,threat:1},veteran:{label:'Veteran',cost:1.35,reward:1.55,threat:1.4},nightmare:{label:'Nightmare',cost:1.8,reward:2.35,threat:1.9}});
const TYCOON_UPGRADES = NP({scavenger_rig:{label:'Scavenger Rig',description:'+15% salvage per level',baseCost:100,max:5},ember_press:{label:'Ember Press',description:'+5 embers per successful expedition per level',baseCost:140,max:5},field_armory:{label:'Field Armory',description:'+2 defense strength per level',baseCost:120,max:5},medic_station:{label:'Field Medic Station',description:'+1 bonus medicine on successful trips per level',baseCost:160,max:3}});
const EMBER_MARKET = NP({wood:{amount:10,cost:22},scrap:{amount:10,cost:30},stone:{amount:8,cost:42},steel:{amount:4,cost:68},food:{amount:10,cost:18},water:{amount:10,cost:14},meds:{amount:3,cost:45},ammo:{amount:10,cost:35}});
// Automatic firearm tiers unlock with settlement development (see homefront-firearms.js).
const Firearms = require('./homefront-firearms');
const Platforms = require('./homefront-platforms');
const WEAPONS = NP(Object.assign({pipe_blade:{label:'Pipe Blade',rarity:'Common',power:1,cost:{scrap:0,embers:0}},pump_shotgun:{label:'Pump Shotgun',rarity:'Rare',power:3,cost:{scrap:55,embers:40}},marksman_rifle:{label:'Marksman Rifle',rarity:'Epic',power:4,cost:{scrap:90,embers:75}},shock_maul:{label:'Shock Maul',rarity:'Legendary',power:5,cost:{scrap:120,embers:100}}}, Object.fromEntries(Object.entries(Firearms.FIREARM_TIERS).map(([id, t]) => [id, { label: t.label, rarity: t.rarity, power: t.power, cost: { ...t.cost }, tier: t.tier, unlockLevel: t.level, unlockZone: t.zone }]))));
const WEAPON_MODS = NP({reinforced_grip:{label:'Reinforced Grip',rarity:'Common',power:1,cost:{scrap:25,embers:20}},salvage_edge:{label:'Salvage Edge',rarity:'Rare',power:1,cost:{scrap:35,embers:25}},shock_coil:{label:'Shock Coil',rarity:'Epic',power:2,cost:{scrap:45,embers:40}}});
const COSMETIC_SKINS = NP({rusted_pipe:{label:'Rusted Steel',slot:'weapon',rarity:'Common',cost:0,color:'#9a7b62'},field_scavenger:{label:'Field Scavenger',slot:'outfit',rarity:'Common',cost:0,color:'#6d7659'},patched_rucksack:{label:'Patched Rucksack',slot:'backpack',rarity:'Common',cost:0,color:'#78604a'},scrap_banner:{label:'Scrap Banner',slot:'refuge',rarity:'Common',cost:0,color:'#a55c35'},hazard_stripe:{label:'Hazard Stripe',slot:'weapon',rarity:'Rare',cost:75,color:'#e6b83f'},medic_fieldcoat:{label:'Field Medic Coat',slot:'outfit',rarity:'Rare',cost:65,color:'#91b5a0'},rescue_pack:{label:'Rescue Pack',slot:'backpack',rarity:'Rare',cost:55,color:'#b56d42'},ember_lanterns:{label:'Ember Lanterns',slot:'refuge',rarity:'Epic',cost:80,color:'#ff8b3d'}});
const DEFAULT_COSMETICS = NP({weapon:'rusted_pipe',outfit:'field_scavenger',backpack:'patched_rucksack',refuge:'scrap_banner'});
const EXPLORATION_ZONES = NP({outskirts:{label:'City Outskirts',risk:1,food:2,ammo:1,scrap:3,wood:2,meds:0,recruit:0.44,boss:false},residential:{label:'Residential Ruins',risk:1,food:3,ammo:1,scrap:5,wood:2,meds:0,recruit:0.5,boss:false},commercial:{label:'Market District',risk:2,food:3,ammo:2,scrap:8,wood:1,meds:1,recruit:0.38,boss:false},hospital:{label:'Overrun Hospital',risk:3,food:4,ammo:3,scrap:5,wood:1,meds:3,recruit:0.32,boss:false},industrial:{label:'Industrial Yard',risk:3,food:4,ammo:3,scrap:12,wood:2,meds:0,recruit:0.24,boss:false},subway:{label:'Buried Subway',risk:4,food:5,ammo:4,scrap:10,wood:1,meds:2,recruit:0.28,boss:true},research_lab:{label:'Sealed Research Annex',risk:5,food:6,ammo:5,scrap:16,wood:1,meds:4,recruit:0.2,boss:true}});
const isBuilding = t => typeof t === 'string' && Object.hasOwn(BUILDINGS, t);
const clampInt = (v, min, max) => Number.isFinite(v) ? Math.max(min, Math.min(max, Math.floor(v))) : min;
const clampNumber = (v, min, max) => Number.isFinite(v) ? Math.max(min, Math.min(max, v)) : 0;
const cleanOwner = id => typeof id === 'string' && id.trim() && id.length <= 180 ? id.trim() : null;
const clone = v => JSON.parse(JSON.stringify(v));
const hash = s => { let h = 2166136261; for (const c of String(s)) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return h >>> 0; };
const rand = seed => { let x = seed >>> 0; x ^= x << 13; x ^= x >>> 17; x ^= x << 5; return (x >>> 0) / 4294967296; };
const SURVIVOR_RARITIES = Object.freeze({
  common: { label: 'Common', weight: 700 },
  uncommon: { label: 'Uncommon', weight: 200 },
  rare: { label: 'Rare', weight: 80 },
  epic: { label: 'Epic', weight: 18 },
  legendary: { label: 'Legendary', weight: 2 }
});
function survivorRarity(seed) {
  const roll = hash(String(seed) + ':survivor-rarity') % 1000;
  if (roll < 2) return 'legendary';
  if (roll < 20) return 'epic';
  if (roll < 100) return 'rare';
  if (roll < 300) return 'uncommon';
  return 'common';
}
function survivorRarityMultiplier(survivor) {
  return ({ common: 1, uncommon: 1.05, rare: 1.10, epic: 1.15, legendary: 1.20 })[
    Object.hasOwn(SURVIVOR_RARITIES, survivor?.rarity) ? survivor.rarity : 'common'
  ];
}
const SURVIVOR_TRAITS = Object.freeze({
  optimistic: { label: 'Optimistic', description: 'Recovers morale faster after a fed workday.' },
  resilient: { label: 'Resilient', description: 'Loses less morale when the refuge cannot feed everyone.' },
  keen_eyed: { label: 'Keen-Eyed', description: 'Produces more salvage when assigned to scavenging.' },
  green_thumb: { label: 'Green Thumb', description: 'Produces more food when assigned to farming.' },
  steady_hands: { label: 'Steady Hands', description: 'Works more efficiently as a mechanic.' },
  compassionate: { label: 'Compassionate', description: 'Provides an extra medicine when working in an infirmary.' },
  vigilant: { label: 'Vigilant', description: 'Contributes more to settlement defense when assigned as a guard.' },
  resourceful: { label: 'Resourceful', description: 'Reduces the impact of a bad workday on morale.' }
});
const SURVIVOR_TALENTS = Object.freeze({
  master_farmer: { label: 'Master Farmer', role: 'farmer', description: '+25% farming output.' },
  scavenger_ace: { label: 'Scavenger Ace', role: 'scavenger', description: '+25% scavenging output.' },
  combat_veteran: { label: 'Combat Veteran', role: 'guard', description: '+25% guard strength.' },
  field_medic: { label: 'Field Medic', role: 'medic', description: '+1 medicine when supported by an infirmary.' },
  engineer: { label: 'Engineer', role: 'mechanic', description: '+25% mechanic salvage output.' }
});
const SURVIVOR_BACKGROUNDS = Object.freeze([
  'Former EMT', 'Apartment caretaker', 'Night-shift mechanic', 'Community gardener',
  'Warehouse picker', 'Volunteer firefighter', 'School cook', 'Transit operator',
  'Rural hunter', 'Hospital orderly', 'Delivery driver', 'Radio hobbyist'
]);
function survivorProfile(seed) {
  const traitIds = Object.keys(SURVIVOR_TRAITS);
  const first = hash(String(seed) + ':trait-a') % traitIds.length;
  let second = hash(String(seed) + ':trait-b') % (traitIds.length - 1);
  if (second >= first) second++;
  const talentIds = Object.keys(SURVIVOR_TALENTS);
  return {
    rarity: survivorRarity(seed),
    traits: [traitIds[first], traitIds[second]],
    talent: talentIds[hash(String(seed) + ':talent') % talentIds.length],
    background: SURVIVOR_BACKGROUNDS[hash(String(seed) + ':background') % SURVIVOR_BACKGROUNDS.length]
  };
}
// Pair chemistry is deterministic, so reloads and clients cannot reroll friendships or rivalries.
function survivorRelationship(a, b) {
  const ids = [String(a?.id || ''), String(b?.id || '')].sort();
  if (!ids[0] || !ids[1] || ids[0] === ids[1]) return 'neutral';
  const roll = hash(ids[0] + ':bond:' + ids[1]) % 10;
  return roll < 2 ? 'friend' : roll === 2 ? 'rival' : 'neutral';
}
function hasSurvivorTrait(survivor, trait) {
  return Array.isArray(survivor?.traits) && survivor.traits.includes(trait);
}
function survivorRoleMultiplier(survivor, role) {
  let multiplier = 1;
  if (role === 'farmer' && hasSurvivorTrait(survivor, 'green_thumb')) multiplier *= 1.10;
  if (role === 'scavenger' && hasSurvivorTrait(survivor, 'keen_eyed')) multiplier *= 1.10;
  if (role === 'mechanic' && hasSurvivorTrait(survivor, 'steady_hands')) multiplier *= 1.10;
  if (role === 'guard' && hasSurvivorTrait(survivor, 'vigilant')) multiplier *= 1.10;
  const talent = SURVIVOR_TALENTS[survivor?.talent];
  if (talent?.role === role && ['farmer','scavenger','mechanic','guard'].includes(role)) multiplier *= 1.25;
  return multiplier;
}

function createBase(ownerId, now = Date.now()) {
  const owner = cleanOwner(ownerId);
  if (!owner) throw new Error('invalid_owner');
  return {
    version: VERSION, owner, revision: 1, createdAt: now, updatedAt: now,
    level: 1, day: 1, baseHp: 500, baseMaxHp: 500, wave: 0, visibility: 'private',
    exploration: { discoveredZones: ['outskirts'], lastExpedition: null },
    resources: { wood: 40, scrap: 30, stone: 0, steel: 0, food: 24, rawFood: 0, water: 18, dirtyWater: 0, meds: 5, ammo: 18, seeds: 6, freshness: { food: [{ qty: 24, acquiredAt: now }], rawFood: [] } },
    embers: 50, upgrades: { scavenger_rig: 0, ember_press: 0, field_armory: 0, medic_station: 0 },
    weapons: ['pipe_blade'], equippedWeapon: 'pipe_blade', weaponMods: {},
    cosmeticsOwned: Object.keys(DEFAULT_COSMETICS).map(slot => DEFAULT_COSMETICS[slot]), cosmeticsEquipped: { ...DEFAULT_COSMETICS },
    structures: [], farmPlots: [], survivors: [], expeditionCompanionId: null, expeditionCount: 0, defenseCount: 0, lastSiege: null,
    log: [{ id: 1, kind: 'welcome', text: 'A refuge is yours. Gather supplies, recruit survivors, and prepare for the first breach.', at: now }]
  };
}
function validateBase(input, ownerId) {
  const owner = cleanOwner(ownerId);
  if (!owner || !input || input.version !== VERSION || input.owner !== owner ||
      !input.resources || !Array.isArray(input.structures) || !Array.isArray(input.survivors) ||
      input.structures.length > MAX_STRUCTURES || input.survivors.length > MAX_SURVIVORS ||
      (Array.isArray(input.farmPlots) && input.farmPlots.length > MAX_FARM_PLOTS)) return null;
  const out = clone(input);
  for (const r of ['wood', 'scrap', 'stone', 'steel', 'food', 'rawFood', 'water', 'dirtyWater', 'meds', 'ammo', 'seeds']) out.resources[r] = clampInt(r === 'water' && !Number.isFinite(out.resources[r]) ? 18 : r === 'seeds' && !Number.isFinite(out.resources[r]) ? 6 : out.resources[r], 0, 999999);
  if (!out.lastSiege || typeof out.lastSiege !== 'object' || !Array.isArray(out.lastSiege.phases)) out.lastSiege = null;
  const FoodFreshness = require('./homefront-freshness');
  out.resources.freshness = FoodFreshness.normalizeBatches(out.resources.freshness, out.resources, Number.isFinite(out.createdAt) ? out.createdAt : Date.now());
  out.embers = clampInt(out.embers, 0, 999999999);
  out.farmPlots = Array.isArray(out.farmPlots) ? out.farmPlots.slice(0, MAX_FARM_PLOTS).filter(p => p && typeof p.id === 'string' && Number.isFinite(p.x) && Number.isFinite(p.z)).map(p => ({ id: p.id.slice(0, 24), x: clampNumber(p.x, -9.5, 9.5), z: clampNumber(p.z, -9.5, 9.5), crop: CROPS[p.crop] ? p.crop : null, growth: clampInt(p.growth, 0, CROPS[p.crop]?.days || 5), watered: p.watered === true, plantedAt: Number.isFinite(p.plantedAt) ? p.plantedAt : 0 })) : []; 
  out.exploration = out.exploration && typeof out.exploration === 'object' ? out.exploration : {};
  out.exploration.discoveredZones = Array.isArray(out.exploration.discoveredZones) ? [...new Set(out.exploration.discoveredZones.filter(z => typeof z === 'string' && EXPLORATION_ZONES[z]))] : ['outskirts'];
  if (!out.exploration.discoveredZones.includes('outskirts')) out.exploration.discoveredZones.unshift('outskirts');
  out.exploration.lastExpedition = out.exploration.lastExpedition && typeof out.exploration.lastExpedition === 'object' ? out.exploration.lastExpedition : null;
  out.upgrades = out.upgrades && typeof out.upgrades === 'object' ? out.upgrades : {};
  out.weapons = Array.isArray(out.weapons) ? [...new Set(out.weapons.filter(id => typeof id === 'string' && WEAPONS[id]))] : ['pipe_blade'];
  if (!out.weapons.includes('pipe_blade')) out.weapons.unshift('pipe_blade');
  out.equippedWeapon = typeof out.equippedWeapon === 'string' && WEAPONS[out.equippedWeapon] && out.weapons.includes(out.equippedWeapon) ? out.equippedWeapon : 'pipe_blade';
  out.weaponMods = out.weaponMods && typeof out.weaponMods === 'object' && !Array.isArray(out.weaponMods) ? out.weaponMods : {};
  for (const [weaponId, modId] of Object.entries(out.weaponMods)) if (!out.weapons.includes(weaponId) || !WEAPON_MODS[modId]) delete out.weaponMods[weaponId];
  out.cosmeticsOwned = Array.isArray(out.cosmeticsOwned) ? [...new Set(out.cosmeticsOwned.filter(id => typeof id === 'string' && COSMETIC_SKINS[id]))] : [];
  for (const id of Object.values(DEFAULT_COSMETICS)) if (!out.cosmeticsOwned.includes(id)) out.cosmeticsOwned.push(id);
  out.cosmeticsEquipped = out.cosmeticsEquipped && typeof out.cosmeticsEquipped === 'object' && !Array.isArray(out.cosmeticsEquipped) ? out.cosmeticsEquipped : {};
  for (const [slot, fallback] of Object.entries(DEFAULT_COSMETICS)) { const id = out.cosmeticsEquipped[slot]; out.cosmeticsEquipped[slot] = COSMETIC_SKINS[id]?.slot === slot && out.cosmeticsOwned.includes(id) ? id : fallback; }
  for (const [id, spec] of Object.entries(TYCOON_UPGRADES)) out.upgrades[id] = clampInt(out.upgrades[id], 0, spec.max);
  out.visibility = input.visibility === 'public' ? 'public' : 'private';
  out.baseMaxHp = clampInt(out.baseMaxHp, 1, 100000);
  out.baseHp = clampInt(out.baseHp, 0, out.baseMaxHp);
  out.level = clampInt(out.level, 1, 1000); out.day = clampInt(out.day, 1, 1000000);
  out.wave = clampInt(out.wave, 0, 1000000);
  out.revision = clampInt(out.revision, 1, Number.MAX_SAFE_INTEGER);
  out.structures = out.structures.filter(s => s && isBuilding(s.type) && typeof s.id === 'string')
    .map(s => {
      const material = MATERIAL_TIERS[s.material] ? s.material : 'wood';
      const gateLike = ['gate', 'entrance', 'exit'].includes(s.type);
      const reinforcementLevel = gateLike ? clampInt(s.reinforcementLevel, 0, 2) : 0;
      const maxHp = Math.round(BUILDINGS[s.type].hp * MATERIAL_TIERS[material].hp * (1 + reinforcementLevel * 0.25));
      const previousMax = Number.isFinite(s.maxHp) && s.maxHp > 0 ? s.maxHp : BUILDINGS[s.type].hp;
      const integrity = clampNumber(Number.isFinite(s.hp) ? s.hp / previousMax : 1, 0, 1);
      return {
       id: s.id.slice(0, 80), type: s.type, material,
       hp: clampInt(Math.round(maxHp * integrity), 0, maxHp), maxHp,
       x: clampNumber(s.x, -9.5, 9.5), z: clampNumber(s.z, -9.5, 9.5),
       rotation: clampNumber(s.rotation, -Math.PI * 2, Math.PI * 2),
       trenchLevel: s.type === 'trench' ? clampInt(s.trenchLevel, 0, 3) : 0,
       reinforcementLevel, manned: s.type === 'turret' && s.manned === true
     };
    });
  out.survivors = out.survivors.filter(s => s && typeof s.id === 'string' && ROLES.has(s.role))
    .map(s => {
      const profile = survivorProfile(s.id);
      return {
        id: s.id.slice(0, 80), name: String(s.name || 'Survivor').slice(0, 40), role: s.role,
        morale: clampInt(s.morale, 0, 100),
        stats: normalizeSurvivorStats(s.stats, s.id, owner),
        task: SURVIVOR_TASKS.has(s.task) ? s.task : defaultSurvivorTask(s.role),
        taskTarget: typeof s.taskTarget === 'string' ? s.taskTarget.slice(0, 80) : '',
        taskReason: typeof s.taskReason === 'string' ? s.taskReason.slice(0, 120) : 'Role assignment',
        taskUpdatedAt: Number.isFinite(s.taskUpdatedAt) ? s.taskUpdatedAt : (Number.isFinite(out.createdAt) ? out.createdAt : Date.now()),
        rarity: Object.hasOwn(SURVIVOR_RARITIES, s.rarity) ? s.rarity : 'common',
        traits: Array.isArray(s.traits) ? [...new Set(s.traits.filter(t => typeof t === 'string' && Object.hasOwn(SURVIVOR_TRAITS, t)))].slice(0, 2) : profile.traits,
        talent: typeof s.talent === 'string' && Object.hasOwn(SURVIVOR_TALENTS, s.talent) ? s.talent : profile.talent,
        background: typeof s.background === 'string' && SURVIVOR_BACKGROUNDS.includes(s.background) ? s.background : profile.background
      };
    });
  out.expeditionCompanionId =
    typeof input.expeditionCompanionId === 'string' &&
    out.survivors.some(v => v.id === input.expeditionCompanionId && Companions.eligible(v))
      ? input.expeditionCompanionId : null;
  out.log = Array.isArray(out.log) ? out.log.slice(-20) : [];
  return out;
}
function weaponPower(base) {
  const id = base?.equippedWeapon;
  const weapon = WEAPONS[id] || WEAPONS.pipe_blade;
  const mod = WEAPON_MODS[base?.weaponMods?.[id]];
  return weapon.power + (mod?.power || 0);
}
function generateSurvivorStats(id, owner) {
  const stats = {};
  for (const stat of SURVIVOR_STATS) stats[stat] = 1 + (hash('survivor-stat:' + owner + ':' + id + ':' + stat) % 10);
  return stats;
}
function normalizeSurvivorStats(input, id, owner) {
  const fallback = generateSurvivorStats(id, owner);
  const source = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
  return Object.fromEntries(SURVIVOR_STATS.map(stat => [stat, Number.isFinite(source[stat]) ? clampInt(source[stat], 1, 10) : fallback[stat]]));
}
function survivorSkill(survivor, role = survivor.role) {
  const stat = ROLE_STAT[role] || 'endurance';
  const value = survivor?.stats?.[stat];
  return Number.isFinite(value) ? clampInt(value, 1, 10) : 5;
}
function defaultSurvivorTask(role) {
  return ({ idle: 'rest_at_refuge', guard: 'perimeter_watch', scavenger: 'stockpile_supplies', farmer: 'tend_crops', medic: 'infirmary_duty', mechanic: 'maintain_structures' })[role] || 'rest_at_refuge';
}
function syncSurvivorBehavior(s, now) {
  const incoming = s.lastSiege?.status === 'incoming';
  const siegeTarget = incoming ? s.lastSiege.target : null;
  const defensiveTypes = new Set(['wall', 'gate', 'watchtower', 'entrance', 'exit', 'sandbags', 'barbed_wire', 'trench', 'turret']);
  const damaged = s.structures.filter(x => x.hp < x.maxHp && (!incoming || defensiveTypes.has(x.type)))
    .sort((a, b) => (a.hp / a.maxHp) - (b.hp / b.maxHp) || a.id.localeCompare(b.id))[0];
  for (const survivor of s.survivors) {
    let task = defaultSurvivorTask(survivor.role), target = '', reason = 'Normal settlement duty';
    if (survivor.id === s.expeditionCompanionId) {
      task='field_escort';reason='Assigned to accompany the player on the next expedition';
    } else
    if (incoming) {
      if (survivor.role === 'guard') { task = 'defend_perimeter'; target = siegeTarget?.id || ''; reason = 'Responding to incoming siege'; }
      else if (survivor.role === 'mechanic') { task = damaged ? 'emergency_repair' : 'stand_by_repairs'; target = damaged?.id || siegeTarget?.id || ''; reason = damaged ? 'Prioritize the weakest structure during siege warning' : 'Ready to reinforce the threatened perimeter'; }
      else if (survivor.role === 'medic') { task = 'triage_standby'; reason = 'Standing by for injuries during the siege'; }
      else { task = 'take_shelter'; reason = 'Sheltering while guards hold the perimeter'; }
    } else if (survivor.role === 'mechanic' && damaged) {
      task = 'maintain_structures'; target = damaged.id; reason = 'Routine maintenance: weakest structure first';
    }
    if (survivor.task !== task || survivor.taskTarget !== target || survivor.taskReason !== reason) survivor.taskUpdatedAt = now;
    survivor.task = task; survivor.taskTarget = target; survivor.taskReason = reason;
  }
}
function record(s, kind, text, now) {
  s.log.push({ id: (s.log.at(-1)?.id || 0) + 1, kind, text, at: now });
  s.log = s.log.slice(-20);
}
function pay(s, cost) {
  for (const [k, v] of Object.entries(cost)) if ((s.resources[k] || 0) < v) throw new Error('insufficient_' + k);
  for (const [k, v] of Object.entries(cost)) s.resources[k] -= v;
}
function threatProfile(input) {
  const s = input && input.version === VERSION ? input : null;
  if (!s || !Array.isArray(s.structures) || !Array.isArray(s.survivors)) throw new Error('invalid_base');
  const active = s.structures.filter(x => x && x.hp > 0 && BUILDINGS[x.type]);
  const activeFarmPlots = (s.farmPlots || []).filter(plot => plot && plot.crop && CROPS[plot.crop]).length;
  const guards = s.survivors.filter(x => x && x.role === 'guard' && x.id !== s.expeditionCompanionId);
  const guardStrength = guards.reduce((total, x) => {
    const morale = clampInt(x.morale, 0, 100);
    const moraleFactor = morale >= 80 ? 1.25 : morale >= 40 ? 1 : morale >= 20 ? 0.75 : 0.5;
    return total + moraleFactor * (0.75 + survivorSkill(x, 'guard') / 20) * survivorRarityMultiplier(x) * survivorRoleMultiplier(x, 'guard');
  }, 0);
  const ammoUsed = Math.min(s.resources?.ammo || 0, Math.max(1, Math.ceil(guards.length / 2) + 1));
  const mannedTurrets = active.filter(x => x.type === 'turret' && x.manned);
  const turretAmmo = Math.min(Math.max(0, (s.resources?.ammo || 0) - ammoUsed), mannedTurrets.length * 3);
  const turretAmmoRatio = mannedTurrets.length ? turretAmmo / (mannedTurrets.length * 3) : 0;
  const structureDefense = active.reduce((total, x) => total + BUILDINGS[x.type].defense + (MATERIAL_TIERS[x.material]?.defense || 0) +
    (['gate', 'entrance', 'exit'].includes(x.type) ? (x.reinforcementLevel || 0) * 2 : 0) +
    (x.type === 'trench' ? (x.trenchLevel || 0) * 3 : 0) +
    (x.type === 'turret' && x.manned ? 7 * turretAmmoRatio : 0), 0);
  const settlementPressure = Math.floor(active.length / 3) + Math.floor(activeFarmPlots / 3);
  const threat = 9 + Math.floor(s.survivors.length / 4) + settlementPressure;
  const guardDefenseBonus = Number((guardStrength * 2).toFixed(2));
  const defense = guardDefenseBonus + (s.upgrades?.field_armory || 0) * 2 +
    structureDefense + ammoUsed * 0.8 + turretAmmo * 1.5;
  const projectedStructureDamage = Math.max(0, Math.ceil((threat - defense) * 6));
  const projectedBaseDamage = Math.ceil(projectedStructureDamage * 0.45);
  return {
    threat, defense: Number(defense.toFixed(2)), guardDefenseBonus, settlementPressure,
    activeStructures: active.length, activeFarmPlots, survivors: s.survivors.length,
    guards: guards.length, ammunitionCommitted: ammoUsed + turretAmmo,
    projectedStructureDamage, projectedBaseDamage,
    outlook: projectedStructureDamage === 0 ? 'stable' :
      projectedStructureDamage >= 60 || projectedBaseDamage >= 25 ? 'critical' : 'strained'
  };
}
function applyAction(input, ownerId, action, now = Date.now(), effects = null) {
  const s = validateBase(input, ownerId);
  if (!s) throw new Error('invalid_or_foreign_base');
  const foodBefore = { food: s.resources.food, rawFood: s.resources.rawFood };
  if (!action || typeof action.type !== 'string') throw new Error('invalid_action');
  switch (action.type) {
    case 'visibility': {
      if (action.value !== 'public' && action.value !== 'private') throw new Error('invalid_visibility');
      s.visibility = action.value;
      record(s, 'visibility', action.value === 'public' ? 'Your refuge is open for visitors.' : 'Your refuge is private again.', now);
      break;
    }
    case 'build': {
      const spec = isBuilding(action.building) ? BUILDINGS[action.building] : null;
      if (!spec) throw new Error('unknown_building');
      if (s.structures.length >= MAX_STRUCTURES) throw new Error('structure_limit');
      if (s.structures.filter(x => x.type === action.building).length >= spec.cap) throw new Error('building_cap');
      if (spec.level && Firearms.developmentLevel(s) < spec.level) throw new Error('structure_requires_refuge_level_' + spec.level);
      pay(s, spec.cost);
      const id = 'b' + (s.structures.reduce((n, x) => Math.max(n, Number(x.id.slice(1)) || 0), 0) + 1);
      const angle = s.structures.length * 2.399963229728653, radius = 3 + Math.floor(s.structures.length / 8) * 1.8;
      const x = Number.isFinite(action.x) ? action.x : Math.cos(angle) * radius;
      const z = Number.isFinite(action.z) ? action.z : Math.sin(angle) * radius;
      if (Math.abs(x) > 9.5 || Math.abs(z) > 9.5) throw new Error('placement_out_of_bounds');
      if (Math.hypot(x, z) < 2.4) throw new Error('placement_occupied');
      if (s.structures.some(v => Math.hypot(v.x - x, v.z - z) < Platforms.structureGap(action.building, v.type))) throw new Error('placement_occupied');
      // Farm plots occupy physical yard space too; keep new structures from burying crops or blocking tending access.
      if (s.farmPlots.some(plot => Math.hypot(plot.x - x, plot.z - z) < Math.max(1.65, Platforms.structureGap(action.building, 'farm_plot')))) throw new Error('placement_occupied');
      const rotation = Number.isFinite(action.rotation) ? clampNumber(action.rotation, -Math.PI * 2, Math.PI * 2) : 0;
      if (!Platforms.footprintInBounds(action.building, x, z, rotation)) throw new Error('placement_out_of_bounds');
      s.structures.push({ id, type: action.building, material: 'wood', hp: spec.hp, maxHp: spec.hp, x, z, rotation, trenchLevel: 0, reinforcementLevel: 0, manned: false });
      record(s, 'build', 'Constructed ' + action.building + '.', now);
      break;
    }
    case 'upgrade_structure_material': {
      const target = s.structures.find(x => x.id === action.target);
      if (!target) throw new Error('unknown_structure');
      const current = MATERIAL_TIERS[target.material] ? target.material : 'wood';
      const next = MATERIAL_TIERS[current].next;
      if (!next) throw new Error('material_tier_maxed');
      pay(s, MATERIAL_UPGRADE_COSTS[next]);
      const integrity = target.maxHp > 0 ? target.hp / target.maxHp : 1;
      target.material = next;
      target.maxHp = Math.round(BUILDINGS[target.type].hp * MATERIAL_TIERS[next].hp * (1 + (target.reinforcementLevel || 0) * 0.25));
      target.hp = Math.min(target.maxHp, Math.round(target.maxHp * integrity));
      record(s, 'construction', 'Upgraded ' + target.type + ' ' + target.id + ' to ' + MATERIAL_TIERS[next].label + ' construction (' + target.maxHp + ' max HP, +' + MATERIAL_TIERS[next].defense + ' material defense).', now);
      break;
    }
    case 'reinforce_gate': {
      const target = s.structures.find(x => x.id === action.target && ['gate', 'entrance', 'exit'].includes(x.type));
      if (!target) throw new Error('unknown_gate');
      const current = clampInt(target.reinforcementLevel, 0, 2);
      if (current >= 2) throw new Error('gate_reinforcement_maxed');
      const next = current + 1;
      pay(s, next === 1 ? { steel: 6, scrap: 12 } : { steel: 12, scrap: 20 });
      const previousMax = target.maxHp;
      target.reinforcementLevel = next;
      const material = MATERIAL_TIERS[target.material] ? target.material : 'wood';
      target.maxHp = Math.round(BUILDINGS[target.type].hp * MATERIAL_TIERS[material].hp * (1 + next * 0.25));
      target.hp = Math.min(target.maxHp, target.hp + target.maxHp - previousMax);
      record(s, 'fortification', 'Reinforced ' + target.type + ' ' + target.id + ' with steel plating tier ' + next + '/2. Max integrity increased to ' + target.maxHp + ' HP; perimeter defense +' + (next * 2) + '.', now);
      break;
    }
    case 'trench_upgrade': {
      const target = s.structures.find(x => x.id === action.target && x.type === 'trench');
      if (!target) throw new Error('unknown_trench');
      if (target.trenchLevel >= 3) throw new Error('trench_max_level');
      const next = target.trenchLevel + 1;
      const costs = { 1: { scrap: 8, wood: 4 }, 2: { wood: 8, scrap: 10 }, 3: { scrap: 14, ammo: 6, meds: 2 } };
      pay(s, costs[next]);
      target.trenchLevel = next;
      const names = ['open earth', 'reinforced revetment', 'spiked kill trench', 'electrified hazard trench'];
      record(s, 'fortification', 'Upgraded trench ' + target.id + ' to tier ' + next + ': ' + names[next] + '.', now);
      break;
    }
    case 'turret_manning': {
      const target = s.structures.find(x => x.id === action.target && x.type === 'turret');
      if (!target) throw new Error('unknown_turret');
      target.manned = action.manned === true;
      record(s, 'fortification', target.manned ? 'Turret ' + target.id + ' is manned and ready for the next defense.' : 'Turret ' + target.id + ' is unmanned.', now);
      break;
    }
    case 'rotate_structure': {
      const target = s.structures.find(x => x.id === action.target);
      if (!target) throw new Error('unknown_structure');
      const nextRotation = (clampNumber(target.rotation, -Math.PI * 2, Math.PI * 2) + Math.PI / 4) % (Math.PI * 2);
      if (!Platforms.footprintInBounds(target.type, target.x, target.z, nextRotation)) throw new Error('placement_out_of_bounds');
      target.rotation = nextRotation;
      record(s, 'fortification', 'Rotated ' + target.id + ' to face a new approach.', now);
      break;
    }
    case 'expedition': {
      if (s.baseHp <= 0) throw new Error('base_destroyed');
      if (s.resources.food < 2 || s.resources.ammo < 1) throw new Error('expedition_supplies_required');
      const zones = EXPLORATION_ZONES;
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
      const stone = Math.max(0, Math.floor(zone.risk * 0.7) + (zoneId === 'residential' ? 1 : 0) + Math.floor(rand(hash('stone:' + seed)) * 2) - 1);
      const steel = Math.max(0, Math.floor((zone.risk - 2) * 0.8) + (zoneId === 'industrial' || zoneId === 'research_lab' ? 1 : 0) + Math.floor(rand(hash('steel:' + seed)) * 2) - 1);
      const firstVisit = !s.exploration.discoveredZones.includes(zoneId);
      if (firstVisit) s.exploration.discoveredZones.push(zoneId);
      s.exploration.lastExpedition = { zone: zoneId, difficulty: difficultyId, risk: zone.risk, at: now, firstVisit };
      s.resources.scrap = Math.min(999999, s.resources.scrap + scrap); s.resources.wood = Math.min(999999, s.resources.wood + wood); s.resources.stone = Math.min(999999, s.resources.stone + stone); s.resources.steel = Math.min(999999, s.resources.steel + steel);
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
      const combatPower = weaponPower(s);
      const pressure = zone.risk * difficulty.threat;
      const effectivePressure = Math.max(0.5, pressure - combatPower * 0.3);
      let directorEvent = 'quiet';
      if (directorRoll < Math.min(0.18, 0.025 * effectivePressure)) directorEvent = 'special_infected';
      else if (directorRoll < Math.min(0.48, 0.09 * effectivePressure)) directorEvent = 'infected_horde';
      else if (directorRoll < Math.min(0.78, 0.18 * effectivePressure)) directorEvent = 'wandering_infected';
      let ambush = false;
      if (directorEvent === 'special_infected' || directorEvent === 'infected_horde') {
        ambush = true;
        const ammoLoss = Math.min(s.resources.ammo, Math.max(1, Math.ceil(pressure / 2) - Math.floor(combatPower / 2)));
        s.resources.ammo -= ammoLoss;
        if (s.survivors.length) {
          const injured = s.survivors[hash('injury:' + seed) % s.survivors.length];
          injured.morale = clampInt(injured.morale - Math.max(2, 8 + zone.risk * 2 - combatPower), 0, 100);
        } else s.resources.food = Math.max(0, s.resources.food - 1);
      }
      const directorLoot = resolveDirectorLoot({
        event: directorEvent, zoneId, risk: zone.risk,
        rewardMultiplier: difficulty.reward, combatPower, seed
      });
      if (directorLoot.scrap) s.resources.scrap = Math.min(999999, s.resources.scrap + directorLoot.scrap);
      if (directorLoot.embers) s.embers = Math.min(999999999, s.embers + directorLoot.embers);
      Object.assign(s.exploration.lastExpedition, {
        director: directorEvent,
        enemy: directorLoot.enemy,
        salvageQuality: directorLoot.quality
      });
      let found = false;
      if (roll > 1 - zone.recruit && s.survivors.length < MAX_SURVIVORS && s.farmPlots.some(p => p.crop)) { const names = ['Mara','Jules','Rook','Tess','Cal','Niko','June','Ash','Vale','Beck','Iris','Sol']; const id = 's' + n; s.survivors.push({ id, name: names[hash(id + s.owner) % names.length], role: 'idle', morale: Math.max(35, 65 - zone.risk * 4), stats: generateSurvivorStats(id, s.owner), ...survivorProfile(id + s.owner) }); found = true; }
      const salvageText = directorLoot.scrap
        ? ' Salvaged ' + directorLoot.quality.toLowerCase() + '-grade infected remains: +' + directorLoot.scrap + ' scrap and +' + directorLoot.embers + ' Embers.'
        : '';
      const eventText = directorEvent === 'special_infected' ? ' A special infected ambushed the team (' + directorLoot.enemy + '); ammunition was spent and a survivor was shaken.' : directorEvent === 'infected_horde' ? ' An infected horde hit the team (' + directorLoot.enemy + '); ammunition was spent and morale suffered.' : directorEvent === 'wandering_infected' ? ' Wandering infected (' + directorLoot.enemy + ') were spotted nearby, but the team avoided a full ambush.' : ' The district was quiet enough to search thoroughly.';
      const finalEventText = eventText + salvageText;
      const result = 'Explored ' + zone.label + ' on ' + difficulty.label + ': recovered ' + wood + ' wood, ' + (scrap + discoveryScrap) + ' scrap, ' + stone + ' stone, ' + steel + ' steel, and ' + totalEmbers + ' embers' + (firstVisit ? ' including a first-visit survey bonus' : '') + (medicine ? ', plus medical supplies' : '') + (found ? ', and rescued a survivor.' : '.') + finalEventText + (zone.risk >= 4 ? ' This is a fixed high-risk location; danger is tied to the site, not completed rounds.' : '');
      record(s, 'exploration', result + (s.farmPlots.some(p => p.crop) ? '' : ' No survivor recruitment is available until you personally plant your first crop.'), now);
      break;
    }
    case 'craft_weapon': {
      const id = typeof action.weapon === 'string' ? action.weapon : '';
      const spec = WEAPONS[id];
      if (!spec || id === 'pipe_blade') throw new Error('unknown_weapon');
      { const unlock = Firearms.unlockStatus(s, id); if (!unlock.unlocked) throw new Error(unlock.reason); }
      if (s.weapons.includes(id)) throw new Error('weapon_already_owned');
      if (s.embers < spec.cost.embers) throw new Error('insufficient_embers');
      pay(s, { scrap: spec.cost.scrap });
      s.embers -= spec.cost.embers;
      s.weapons.push(id);
      record(s, 'armory', 'Crafted ' + spec.rarity + ' weapon: ' + spec.label + '.', now);
      break;
    }
    case 'craft_mod': {
      const id = typeof action.mod === 'string' ? action.mod : '';
      const spec = WEAPON_MODS[id];
      if (!spec) throw new Error('unknown_weapon_mod');
      if (s.weaponMods[s.equippedWeapon]) throw new Error('weapon_mod_slot_used');
      if (s.embers < spec.cost.embers) throw new Error('insufficient_embers');
      pay(s, { scrap: spec.cost.scrap });
      s.embers -= spec.cost.embers;
      s.weaponMods[s.equippedWeapon] = id;
      record(s, 'armory', 'Installed ' + spec.rarity + ' mod ' + spec.label + ' on ' + WEAPONS[s.equippedWeapon].label + '.', now);
      break;
    }
    case 'equip_weapon': {
      const id = typeof action.weapon === 'string' ? action.weapon : '';
      if (!WEAPONS[id] || !s.weapons.includes(id)) throw new Error('weapon_not_owned');
      { const unlock = Firearms.unlockStatus(s, id); if (!unlock.unlocked) throw new Error(unlock.reason); }
      s.equippedWeapon = id;
      record(s, 'armory', 'Equipped ' + WEAPONS[id].label + ' (' + WEAPONS[id].rarity + ').', now);
      break;
    }
    case 'rescue_survivor': {
      if (s.baseHp <= 0) throw new Error('base_destroyed');
      if (s.survivors.length >= MAX_SURVIVORS) throw new Error('survivor_capacity');
      const zoneId = typeof action.zone === 'string' ? action.zone : '';
      const zone = EXPLORATION_ZONES[zoneId];
      const difficultyId = typeof action.difficulty === 'string' ? action.difficulty : 'standard';
      const difficulty = DIFFICULTIES[difficultyId];
      if (!zone || zone.boss) throw new Error('unknown_rescue_zone');
      if (!difficulty) throw new Error('unknown_difficulty');
      const cost = { food: Math.max(1, Math.ceil(zone.food * difficulty.cost)), ammo: Math.max(1, Math.ceil(zone.ammo * difficulty.cost)) };
      pay(s, cost);
      const names = ['Mara','Jules','Rook','Tess','Cal','Niko','June','Ash','Vale','Beck','Iris','Sol','Dara','Finn','Mika','Ren'];
      const seed = hash(s.owner + ':' + zoneId + ':' + now + ':' + s.revision);
      const role = zone.risk >= 3 ? 'medic' : zone.risk === 2 ? 'mechanic' : 'guard';
      const id = 'rescued-' + seed.toString(36);
      const profile = survivorProfile(seed);
      const rarity = profile.rarity;
      s.survivors.push({ id, name: names[seed % names.length], role, morale: clampInt(82 - zone.risk * 8 - Math.max(0, difficulty.threat - 1) * 10, 30, 100), ...profile });
      const embers = Math.floor((5 + zone.risk * 3) * difficulty.reward);
      s.embers = Math.min(999999999, s.embers + embers);
      s.exploration.lastExpedition = { zone: zoneId, difficulty: difficultyId, risk: zone.risk, at: now, rescue: true };
      record(s, 'rescue', 'Rescued ' + names[seed % names.length] + ' at ' + zone.label + '. Recruited a ' + SURVIVOR_RARITIES[rarity].label + ' ' + role + ' with morale ' + s.survivors.at(-1).morale + ' and earned ' + embers + ' Embers.', now);
      break;
    }
    case 'boss_attack': {
      if (s.baseHp <= 0) throw new Error('base_destroyed');
      const zoneId = typeof action.zone === 'string' ? action.zone : '';
      const zone = EXPLORATION_ZONES[zoneId];
      const difficultyId = typeof action.difficulty === 'string' ? action.difficulty : 'standard';
      const difficulty = DIFFICULTIES[difficultyId];
      if (!zone || !zone.boss) throw new Error('unknown_boss_zone');
      if (!difficulty) throw new Error('unknown_difficulty');
      const cost = { food: Math.max(1, Math.ceil(zone.food * difficulty.cost)), ammo: Math.max(1, Math.ceil(zone.ammo * difficulty.cost)) };
      pay(s, cost);
      s.exploration.lastExpedition = { zone: zoneId, difficulty: difficultyId, risk: zone.risk, at: now, bossAttack: true };
      record(s, 'boss', 'Engaged the boss territory at ' + zone.label + ' on ' + difficulty.label + '. Spent ' + cost.food + ' food and ' + cost.ammo + ' ammunition; loot is awarded on boss defeat.', now);
      break;
    }
    case 'buy_cosmetic': {
      const skin = COSMETIC_SKINS[action.skin];
      if (!skin) throw new Error('unknown_cosmetic');
      if (s.cosmeticsOwned.includes(action.skin)) throw new Error('cosmetic_already_owned');
      if (s.embers < skin.cost) throw new Error('insufficient_embers');
      s.embers -= skin.cost;
      s.cosmeticsOwned.push(action.skin);
      record(s, 'cosmetic', 'Unlocked cosmetic: ' + skin.label + '. Appearance never changes combat power.', now);
      break;
    }
    case 'equip_cosmetic': {
      const skin = COSMETIC_SKINS[action.skin];
      if (!skin) throw new Error('unknown_cosmetic');
      if (!s.cosmeticsOwned.includes(action.skin)) throw new Error('cosmetic_not_owned');
      s.cosmeticsEquipped[skin.slot] = action.skin;
      record(s, 'cosmetic', 'Equipped ' + skin.label + ' appearance for ' + skin.slot + '.', now);
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
    case 'farm_till': {
      if (s.farmPlots.length >= MAX_FARM_PLOTS) throw new Error('farm_plot_limit');
      const x = Number.isFinite(action.x) ? action.x : NaN;
      const z = Number.isFinite(action.z) ? action.z : NaN;
      if (!Number.isFinite(x) || !Number.isFinite(z) || Math.abs(x) > 9.5 || Math.abs(z) > 9.5) throw new Error('farm_plot_out_of_bounds');
      if (Math.hypot(x, z) < 2.4 || s.structures.some(v => Math.hypot(v.x - x, v.z - z) < 1.65) || s.farmPlots.some(v => Math.hypot(v.x - x, v.z - z) < 0.8)) throw new Error('farm_plot_occupied');
      const id = 'f' + (s.farmPlots.reduce((n, p) => Math.max(n, Number(p.id.slice(1)) || 0), 0) + 1);
      s.farmPlots.push({ id, x, z, crop: null, growth: 0, watered: false, plantedAt: 0 });
      record(s, 'farming', 'Prepared a soil plot. Plant a crop yourself before recruiting survivors.', now);
      break;
    }
    case 'farm_plant': {
      const plot = s.farmPlots.find(p => p.id === action.plotId);
      const cropId = typeof action.crop === 'string' ? action.crop : '';
      const crop = CROPS[cropId];
      if (!plot) throw new Error('unknown_farm_plot');
      if (!crop) throw new Error('unknown_crop');
      if (plot.crop) throw new Error('farm_plot_already_planted');
      if (s.resources.seeds < crop.seedCost) throw new Error('insufficient_seeds');
      s.resources.seeds -= crop.seedCost;
      plot.crop = cropId; plot.growth = 0; plot.watered = false; plot.plantedAt = now;
      record(s, 'farming', 'Planted ' + cropId + ' in ' + plot.id + '. Keep the soil watered and advance workdays to grow it.', now);
      break;
    }
    case 'farm_water': {
      const plot = s.farmPlots.find(p => p.id === action.plotId);
      if (!plot || !plot.crop) throw new Error('empty_farm_plot');
      if (plot.growth >= CROPS[plot.crop].days) throw new Error('crop_already_mature');
      if (plot.watered) throw new Error('farm_plot_already_watered');
      if (s.resources.water < 1) throw new Error('insufficient_water');
      s.resources.water--; plot.watered = true;
      record(s, 'farming', 'Watered ' + plot.id + '.', now);
      break;
    }
    case 'farm_harvest': {
      const plot = s.farmPlots.find(p => p.id === action.plotId);
      if (!plot || !plot.crop) throw new Error('empty_farm_plot');
      const crop = CROPS[plot.crop];
      if (plot.growth < crop.days) throw new Error('crop_not_ready');
      const yieldQty = crop.yield + (plot.watered ? 2 : 0);
      s.resources.food = Math.min(999999, s.resources.food + yieldQty);
      // Harvest returns the seed cost plus one so a tended farm is self-sustaining.
      const seedReturn = crop.seedCost + 1;
      s.resources.seeds = Math.min(999999, s.resources.seeds + seedReturn);
      record(s, 'farming', 'Harvested ' + yieldQty + ' food and ' + seedReturn + ' seeds from ' + plot.id + '.', now);
      plot.crop = null; plot.growth = 0; plot.watered = false; plot.plantedAt = 0;
      break;
    }
    case 'assign_expedition_companion': {
      if (s.baseHp <= 0) throw new Error('base_destroyed');
      if (action.survivorId === null) {
        s.expeditionCompanionId=null;
        record(s,'assignment','Field companion recalled to regular refuge duty.',now);
      } else {
        if (typeof action.survivorId !== 'string') throw new Error('unknown_survivor');
        const survivor=s.survivors.find(x=>x.id===action.survivorId);
        if (!survivor) throw new Error('unknown_survivor');
        if (!Companions.eligible(survivor)) throw new Error('companion_requires_epic_or_legendary');
        s.expeditionCompanionId=survivor.id;
        record(s,'assignment',survivor.name+' assigned to accompany future field expeditions.',now);
      }
      syncSurvivorBehavior(s,now);
      break;
    }
    case 'assign': {
      if (action.role === 'farmer' && !s.farmPlots.some(p => p.crop)) throw new Error('plant_crops_before_recruiting_farmers');
      const survivor = s.survivors.find(x => x.id === action.survivorId);
      if (!survivor) throw new Error('unknown_survivor');
      if (!ROLES.has(action.role)) throw new Error('unknown_role');
      if (action.role === 'guard' && s.survivors.filter(x => x.role === 'guard' && x.id !== survivor.id).length >= 6) throw new Error('guard_capacity');
      survivor.role = action.role;
      syncSurvivorBehavior(s, now);
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
      const labor = role => {
        const assigned = s.survivors.filter(x => x.role === role && x.id !== s.expeditionCompanionId);
        const baseLabor = assigned.reduce((total, x) => {
          const morale = clampInt(x.morale, 0, 100);
          const moraleFactor = morale >= 80 ? 1.25 : morale >= 40 ? 1 : morale >= 20 ? 0.75 : 0.5;
          return total + moraleFactor * (0.75 + survivorSkill(x, role) / 20) * survivorRarityMultiplier(x) * survivorRoleMultiplier(x, role);
        }, 0);
        let chemistry = 0;
        for (let i = 0; i < assigned.length; i++) for (let j = i + 1; j < assigned.length; j++) {
          const relationship = survivorRelationship(assigned[i], assigned[j]);
          if (relationship === 'friend') chemistry += 0.08;
          else if (relationship === 'rival') chemistry -= 0.08;
        }
        return Math.max(0, baseLabor + chemistry);
      };
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
      const quarryCount = s.structures.filter(x => x.type === 'quarry' && x.hp > 0).length;
      const smelterCount = s.structures.filter(x => x.type === 'smelter' && x.hp > 0).length;
      const salvageYardCount = s.structures.filter(x => x.type === 'salvage_yard' && x.hp > 0).length;
      const foodGain = Math.floor(Math.min(999999, farmers * (1 + gardenCount) * 2));
      // Storage sheds make scavenging trips more efficient, but only while intact.
      const scrapGain = Math.floor(Math.min(999999, scavengers * (2 + storageCount) + mechanics * workshopCount + scavengers * salvageYardCount));
      const medicineGain = Math.floor(Math.min(medics, infirmaryCount)) + (infirmaryCount > 0 ? s.survivors.filter(x => x.role === 'medic' && (x.talent === 'field_medic' || hasSurvivorTrait(x, 'compassionate'))).length : 0);
      const stoneGain = Math.floor(Math.min(999999, mechanics * quarryCount));
      s.resources.food = Math.min(999999, s.resources.food + foodGain);
      s.resources.scrap = Math.min(999999, s.resources.scrap + scrapGain);
      s.resources.stone = Math.min(999999, (s.resources.stone || 0) + stoneGain);
      s.resources.meds = Math.min(999999, s.resources.meds + medicineGain);
      // Smelters turn stored stone and scrap into steel. Mechanics determine throughput;
      // inputs are consumed server-side so steel is never a free passive reward.
      const steelGain = Math.floor(Math.min(999999, mechanics * smelterCount, Math.floor(s.resources.scrap / 2), s.resources.stone));
      s.resources.scrap -= steelGain * 2;
      s.resources.stone -= steelGain;
      s.resources.steel = Math.min(999999, (s.resources.steel || 0) + steelGain);
      // Mechanics perform tangible upkeep during the shift. The most damaged structures are
      // stabilized first; this remains deterministic and server-authoritative.
      let repairedHp = 0;
      const repairBudget = Math.floor(mechanics * 10);
      const damagedStructures = s.structures
        .filter(x => x.hp < x.maxHp)
        .sort((a, b) => (a.hp / a.maxHp) - (b.hp / b.maxHp) || a.id.localeCompare(b.id));
      if (repairBudget > 0 && damagedStructures.length && s.resources.wood > 0 && s.resources.scrap > 0) {
        let remainingRepair = Math.min(repairBudget, s.resources.wood * 12, s.resources.scrap * 12);
        for (const structure of damagedStructures) {
          if (remainingRepair <= 0) break;
          const restored = Math.min(remainingRepair, structure.maxHp - structure.hp);
          structure.hp += restored;
          repairedHp += restored;
          remainingRepair -= restored;
        }
        const materialCost = Math.ceil(repairedHp / 12);
        s.resources.wood -= materialCost;
        s.resources.scrap -= materialCost;
      }
      // Crop simulation is server-authoritative and advances with the settlement workday, not client frame rate.
      for (const plot of s.farmPlots) {
        if (!plot.crop) continue;
        const crop = CROPS[plot.crop];
        if (plot.watered) plot.growth = Math.min(crop.days, plot.growth + 1 + Math.floor(farmers / 2));
        else plot.growth = Math.min(crop.days, plot.growth + (farmers > 0 ? 1 : 0));
        plot.watered = false;
      }
      s.day++; s.level = Math.max(s.level, 1 + Math.floor((s.day - 1) / 5));
      for (const survivor of s.survivors) { const fed = foodGain >= foodCost; const moraleDelta = fed ? 2 + (hasSurvivorTrait(survivor, 'optimistic') ? 1 : 0) : -(8 - (hasSurvivorTrait(survivor, 'resilient') ? 3 : 0) - (hasSurvivorTrait(survivor, 'resourceful') ? 1 : 0)); survivor.morale = clampInt(survivor.morale + moraleDelta, 0, 100); }
      const repairNote = repairedHp ? ' Mechanics repaired ' + repairedHp + ' structure HP.' : '';
      const facilityNote = (stoneGain || steelGain || salvageYardCount)
        ? ' Facilities: +' + stoneGain + ' stone, +' + steelGain + ' steel' + (salvageYardCount ? ', salvage yard active' : '') + '.' : '';
      record(s, 'workday', 'Day ' + s.day + ': +' + foodGain + ' food, +' + scrapGain + ' scrap, +' + medicineGain + ' medicine.' + facilityNote + repairNote, now);
      break;
    }
    case 'start_siege': {
      if (s.baseHp <= 0) throw new Error('base_destroyed');
      if (s.lastSiege?.status === 'incoming') throw new Error('siege_already_active');
      const profile = threatProfile(s);
      const perimeterPriority = { barbed_wire: 0, gate: 1, entrance: 1, exit: 1, sandbags: 2, trench: 3, wall: 4, turret: 5, watchtower: 6 };
      const targets = s.structures.filter(x => x.hp > 0).sort((a, b) =>
        (Math.hypot(b.x, b.z) - Math.hypot(a.x, a.z)) ||
        ((perimeterPriority[a.type] ?? 10) - (perimeterPriority[b.type] ?? 10)) ||
        String(a.id).localeCompare(String(b.id)));
      const target = targets[0] || null;
      const integrity = target && target.maxHp > 0 ? Math.round(target.hp / target.maxHp * 100) : null;
      s.defenseCount++;
      const incidentId = 'siege-' + s.defenseCount;
      const warningText = target
        ? 'SIEGE WARNING: infected are pressing ' + target.type + ' ' + target.id + ' (' + integrity + '% integrity). ' + profile.guards + ' guard(s) assigned to the perimeter.'
        : 'SIEGE WARNING: infected pressure is approaching the refuge; no active defensive structure can intercept the first hit.';
      const guardText = profile.guards
        ? profile.guards + ' guard(s) respond to the perimeter. Morale-weighted guard contribution: ' + profile.guardDefenseBonus + '.'
        : 'No guards are assigned. The perimeter must absorb the attack without survivor guard support.';
      s.lastSiege = {
        id: incidentId, status: 'incoming', day: s.day, startedAt: now, resolvedAt: null,
        target: target ? { id: target.id, type: target.type, integrityBefore: integrity, integrityAfter: integrity } : null,
        guardCount: profile.guards, guardDefenseBonus: profile.guardDefenseBonus,
        structureDamage: 0, refugeHpBefore: s.baseHp, refugeHpAfter: s.baseHp, breachedStructures: [],
        phases: [
          { phase: 'warning', at: now, text: warningText },
          { phase: 'guard_response', at: now, text: guardText }
        ]
      };
      syncSurvivorBehavior(s, now);
      record(s, 'siege_warning', warningText, now);
      record(s, 'guard_response', guardText, now);
      break;
    }
    case 'defend': {
      if (s.baseHp <= 0) throw new Error('base_destroyed');
      const pendingIncident = s.lastSiege?.status === 'incoming';
      if (!pendingIncident) s.defenseCount++;
      const profile = threatProfile(s);
      const active = s.structures.filter(x => x.hp > 0);
      const ammoUsed = Math.min(s.resources.ammo, Math.max(1, Math.ceil(s.survivors.filter(x => x.role === 'guard' && x.id !== s.expeditionCompanionId).length / 2) + 1));
      s.resources.ammo -= ammoUsed;
      const mannedTurrets = active.filter(x => x.type === 'turret' && x.manned);
      const turretAmmo = Math.min(s.resources.ammo, mannedTurrets.length * 3);
      s.resources.ammo -= turretAmmo;
      const threat = profile.threat;
      const defense = profile.defense;
      // Resolve the first structure the siege will hit before calculating cover. Guards
      // only mitigate damage when that actual target is a damaged defensive structure;
      // a damaged gate elsewhere in the yard cannot magically protect an unrelated wall.
      const defensiveTypes = new Set(['wall', 'gate', 'entrance', 'exit', 'sandbags', 'barbed_wire', 'trench', 'turret', 'watchtower']);
      // Siege pressure hits the outer defensive ring first, rather than damaging structures
      // in arbitrary creation order. Perimeter obstacles absorb hits before inner production buildings.
      const perimeterPriority = { barbed_wire: 0, gate: 1, entrance: 1, exit: 1, sandbags: 2, trench: 3, wall: 4, turret: 5, watchtower: 6 };
      const siegeTargets = [...active].sort((a, b) =>
        (Math.hypot(b.x, b.z) - Math.hypot(a.x, a.z)) ||
        ((perimeterPriority[a.type] ?? 10) - (perimeterPriority[b.type] ?? 10)) ||
        String(a.id).localeCompare(String(b.id)));
      const coverTarget = siegeTargets[0];
      const refugeHpBefore = s.baseHp;
      const targetIntegrityBefore = coverTarget && coverTarget.maxHp > 0 ? Math.round(coverTarget.hp / coverTarget.maxHp * 100) : null;
      const incidentId = pendingIncident ? s.lastSiege.id : 'siege-' + s.defenseCount;
      const warningText = coverTarget
        ? 'SIEGE WARNING: infected are pressing ' + coverTarget.type + ' ' + coverTarget.id + ' (' + targetIntegrityBefore + '% integrity). ' + profile.guards + ' guard(s) assigned to the perimeter.'
        : 'SIEGE WARNING: infected pressure is approaching the refuge; no active defensive structure can intercept the first hit.';
      if (!pendingIncident) {
        record(s, 'siege_warning', warningText, now);
        record(s, 'guard_response', profile.guards
          ? profile.guards + ' guard(s) respond to the perimeter. Morale-weighted guard contribution: ' + profile.guardDefenseBonus + '.'
          : 'No guards are assigned. The perimeter must absorb the attack without survivor guard support.', now);
      }
      const damagedPerimeter = Boolean(coverTarget && defensiveTypes.has(coverTarget.type) && coverTarget.hp < coverTarget.maxHp);
      const guardStrength = s.survivors.filter(x => x.role === 'guard').reduce((total, x) => {
        const morale = clampInt(x.morale, 0, 100);
        const moraleFactor = morale >= 80 ? 1.25 : morale >= 40 ? 1 : morale >= 20 ? 0.75 : 0.5;
        return total + moraleFactor * (0.75 + survivorSkill(x, 'guard') / 20);
      }, 0);
      const breachCover = damagedPerimeter ? Math.min(0.25, guardStrength * 0.05) : 0;
      const damage = Math.max(0, breachCover > 0 ? Math.floor(profile.projectedStructureDamage * (1 - breachCover)) : profile.projectedStructureDamage);
      s.baseHp = Math.max(0, s.baseHp - Math.ceil(damage * 0.45));
      let remaining = damage;
      const breached = [];
      for (const structure of siegeTargets) {
        if (remaining <= 0) break;
        const before = structure.hp;
        const incoming = Math.min(structure.hp, remaining);
        const material = MATERIAL_TIERS[structure.material] || MATERIAL_TIERS.wood;
        const reinforcementResistance = ['gate', 'entrance', 'exit'].includes(structure.type) ? (structure.reinforcementLevel || 0) * 0.08 : 0;
        const hit = Math.min(structure.hp, Math.ceil(incoming * (1 - Math.min(0.6, material.resistance + reinforcementResistance))));
        structure.hp -= hit; remaining -= incoming;
        if (before > 0 && structure.hp <= 0) breached.push(structure.type);
      }
      const lost = s.baseHp === 0;
      for (const turret of active.filter(x => x.type === 'turret')) turret.manned = false;
      const breachText = breached.length ? ' Breach opened: ' + siegeTargets.filter(x => x.hp <= 0 && breached.includes(x.type)).map(x => x.type + ' ' + x.id).join(', ') + ' destroyed.' : '';
      let targetOutcome = '';
      if (coverTarget) {
        const integrity = coverTarget.maxHp > 0 ? Math.round(coverTarget.hp / coverTarget.maxHp * 100) : 0;
        const condition = coverTarget.hp <= 0 ? 'BREACHED' : integrity <= 25 ? 'CRITICAL' : integrity <= 60 ? 'DAMAGED' : 'HOLDING';
        targetOutcome = ' Priority target ' + coverTarget.type + ' ' + coverTarget.id + ' is ' + condition + ' (' + integrity + '% integrity).';
      }
      const guardText = profile.guards + ' guard(s) contributed ' + profile.guardDefenseBonus + ' defense strength' + (breachCover > 0 ? ' and reduced perimeter damage by ' + Math.round(breachCover * 100) + '% while covering damaged ' + coverTarget.type + ' ' + coverTarget.id : '');
      const breachedStructures = siegeTargets.filter(x => x.hp <= 0 && breached.includes(x.type)).map(x => ({ id: x.id, type: x.type }));
      const finalTargetIntegrity = coverTarget && coverTarget.maxHp > 0 ? Math.round(coverTarget.hp / coverTarget.maxHp * 100) : null;
      const outcome = lost ? 'refuge_fallen' : breachedStructures.length ? 'breach_opened' : 'repelled';
      const outcomeText = lost
        ? 'AFTER-ACTION REPORT: refuge fell. ' + damage + ' structure damage; refuge integrity ' + s.baseHp + '/' + s.baseMaxHp + '.'
        : breachedStructures.length
          ? 'AFTER-ACTION REPORT: breach opened at ' + breachedStructures.map(x => x.type + ' ' + x.id).join(', ') + '. ' + damage + ' structure damage; refuge integrity ' + s.baseHp + '/' + s.baseMaxHp + '.'
          : 'AFTER-ACTION REPORT: attack repelled. ' + damage + ' structure damage; refuge integrity ' + s.baseHp + '/' + s.baseMaxHp + '.';
      const resolvedTarget = coverTarget ? { id: coverTarget.id, type: coverTarget.type,
        integrityBefore: pendingIncident && s.lastSiege.target?.id === coverTarget.id
          ? s.lastSiege.target.integrityBefore : targetIntegrityBefore,
        integrityAfter: finalTargetIntegrity } : null;
      const outcomePhase = { phase: outcome, at: now, text: outcomeText };
      s.lastSiege = {
        ...(pendingIncident ? s.lastSiege : {}),
        id: incidentId, status: outcome, day: s.day,
        startedAt: pendingIncident ? s.lastSiege.startedAt : now, resolvedAt: now,
        target: resolvedTarget, guardCount: profile.guards, guardDefenseBonus: profile.guardDefenseBonus,
        structureDamage: damage, refugeHpBefore: pendingIncident ? s.lastSiege.refugeHpBefore : refugeHpBefore,
        refugeHpAfter: s.baseHp, breachedStructures,
        phases: [...(pendingIncident ? s.lastSiege.phases : [
          { phase: 'warning', at: now, text: warningText },
          { phase: 'guard_response', at: now, text: profile.guards ? 'Guards responded to the threatened perimeter.' : 'No guards available for the response.' }
        ]), outcomePhase]
      };
      syncSurvivorBehavior(s, now);
      record(s, 'siege_outcome', outcomeText, now);
      record(s, 'defense', lost ? 'The refuge fell during a perimeter breach. ' + guardText + '.' + targetOutcome : 'Perimeter breach repelled with ' + damage + ' structure damage. ' + guardText + '; ' + active.filter(x => x.type === 'trench' && x.trenchLevel > 0).length + ' upgraded trench line(s) and ' + turretAmmo + ' turret ammunition contributed to defense.' + targetOutcome + breachText, now);
      break;
    }
    case 'emergency_repair': {
      const target = s.structures.find(x => x.id === action.target);
      if (!target) throw new Error('unknown_repair_target');
      const defensiveTypes = new Set(['wall', 'gate', 'watchtower', 'entrance', 'exit', 'sandbags', 'barbed_wire', 'trench', 'turret']);
      if (!defensiveTypes.has(target.type)) throw new Error('not_a_defensive_structure');
      if (target.hp >= target.maxHp) throw new Error('already_repaired');
      const material = MATERIAL_TIERS[target.material] ? target.material : 'wood';
      const repairCost = material === 'stone' ? { stone: 2, scrap: 2 } : material === 'steel' ? { steel: 2, scrap: 4 } : { wood: 4, scrap: 2 };
      if (Object.entries(repairCost).some(([resource, amount]) => (s.resources[resource] || 0) < amount)) throw new Error('emergency_repair_supplies_required');
      for (const [resource, amount] of Object.entries(repairCost)) s.resources[resource] -= amount;
      const before = target.hp;
      target.hp = Math.min(target.maxHp, target.hp + 100);
      syncSurvivorBehavior(s, now);
      record(s, 'repair', 'Emergency repair: ' + target.type + ' ' + target.id + ' restored +' + (target.hp - before) + ' HP (' + Math.round(target.hp / target.maxHp * 100) + '% integrity).', now);
      break;
    }
    case 'repair': {
      const repairBonus = Math.floor(CindersEffects.normalizeEffects(effects).repairHpBonus);
      const target = action.target === 'base' ? null : s.structures.find(x => x.id === action.target);
      if (action.target !== 'base' && !target) throw new Error('unknown_repair_target');
      if (target && target.hp >= target.maxHp || !target && s.baseHp >= s.baseMaxHp) throw new Error('already_repaired');
      const material = target && MATERIAL_TIERS[target.material] ? target.material : 'wood';
      const repairCost = !target || material === 'wood' ? { wood: 2, scrap: 1 } :
        material === 'stone' ? { stone: 1, scrap: 1 } : { steel: 1, scrap: 2 };
      if (Object.entries(repairCost).some(([resource, amount]) => (s.resources[resource] || 0) < amount)) throw new Error('repair_supplies_required');
      for (const [resource, amount] of Object.entries(repairCost)) s.resources[resource] -= amount;
      if (target) {
        const before = target.hp;
        target.hp = Math.min(target.maxHp, target.hp + 50 + repairBonus);
        record(s, 'repair', 'Repaired ' + target.type + ' ' + target.id + ': +' + (target.hp - before) + ' HP (' + Math.round(target.hp / target.maxHp * 100) + '% integrity).', now);
      } else {
        const before = s.baseHp;
        s.baseHp = Math.min(s.baseMaxHp, s.baseHp + 75 + repairBonus);
        record(s, 'repair', 'Repaired refuge: +' + (s.baseHp - before) + ' HP (' + Math.round(s.baseHp / s.baseMaxHp * 100) + '% integrity).', now);
      }
      break;
    }
    default: throw new Error('unknown_action');
  }
  // Reconcile persisted task state after every authoritative action, including workday repairs.
  syncSurvivorBehavior(s, now);
  const FoodFreshness = require('./homefront-freshness');
  for (const id of ['food', 'rawFood']) {
    const delta = s.resources[id] - foodBefore[id];
    if (delta > 0) s.resources.freshness = FoodFreshness.addBatch(s.resources.freshness, id, delta, now);
    else if (delta < 0) s.resources.freshness = FoodFreshness.takeBatches(s.resources.freshness, id, -delta, foodBefore, now).batches;
  }
  s.revision++;
  s.updatedAt = now;
  return s;
}

// Live refuge siege outcome (server/homefront-siege.js). Not an applyAction type: only the
// server's siege resolver calls this, with values it computed itself, so clients cannot submit it.
function applyLiveSiegeResult(input, ownerId, result, now = Date.now()) {
  const s = validateBase(input, ownerId);
  if (!s) throw new Error('invalid_or_foreign_base');
  const damage = clampInt(result?.structureDamage, 0, 5000);
  const kills = clampInt(result?.kills, 0, 500), total = clampInt(result?.total, 0, 500);
  const perimeterPriority = { barbed_wire: 0, gate: 1, entrance: 1, exit: 1, sandbags: 2, trench: 3, wall: 4, turret: 5, watchtower: 6 };
  const targets = s.structures.filter(x => x.hp > 0).sort((a, b) =>
    (Math.hypot(b.x, b.z) - Math.hypot(a.x, a.z)) || ((perimeterPriority[a.type] ?? 10) - (perimeterPriority[b.type] ?? 10)) || String(a.id).localeCompare(String(b.id)));
  const refugeHpBefore = s.baseHp;
  let remaining = damage; const breached = [];
  for (const structure of targets) {
    if (remaining <= 0) break;
    const incoming = Math.min(structure.hp, remaining);
    const material = MATERIAL_TIERS[structure.material] || MATERIAL_TIERS.wood;
    const hit = Math.min(structure.hp, Math.ceil(incoming * (1 - Math.min(0.6, material.resistance))));
    structure.hp -= hit; remaining -= incoming;
    if (structure.hp <= 0) breached.push({ id: structure.id, type: structure.type });
  }
  s.baseHp = Math.max(0, s.baseHp - Math.ceil(damage * 0.45));
  const repelled = result?.status === 'repelled';
  const embers = repelled ? 8 + Math.min(24, Math.floor(kills / 3)) : 0;
  s.embers = Math.min(999999999, s.embers + embers);
  s.defenseCount = clampInt((s.defenseCount || 0) + 1, 0, 1e9);
  const outcome = s.baseHp === 0 ? 'refuge_fallen' : breached.length ? 'breach_opened' : 'repelled';
  const text = 'LIVE SIEGE: ' + kills + '/' + total + ' infected killed by ' + clampInt(result?.defenders, 1, 4) + ' defender(s)' +
    (damage ? '; ' + damage + ' wall damage' : '; the walls held untouched') + (breached.length ? '; breach at ' + breached.map(b => b.type + ' ' + b.id).join(', ') : '') +
    (embers ? '. +' + embers + ' Embers.' : '.');
  s.lastSiege = { id: 'live-' + s.defenseCount, status: outcome, live: true, day: s.day, startedAt: Number.isFinite(result?.startedAt) ? result.startedAt : now, resolvedAt: now,
    target: breached[0] ? { id: breached[0].id, type: breached[0].type, integrityBefore: null, integrityAfter: 0 } : null,
    guardCount: s.survivors.filter(x => x.role === 'guard').length, guardDefenseBonus: 0, structureDamage: damage,
    refugeHpBefore, refugeHpAfter: s.baseHp, breachedStructures: breached, phases: [{ phase: outcome, at: now, text }] };
  record(s, 'defense', (outcome === 'repelled' ? 'Perimeter breach repelled. ' : '') + text, now);
  syncSurvivorBehavior(s, now);
  s.revision++; s.updatedAt = now;
  return { base: s, embers, outcome };
}

module.exports = { applyLiveSiegeResult, SURVIVOR_TASKS, VERSION, MAX_STRUCTURES, SURVIVOR_RARITIES, survivorRarity, survivorRarityMultiplier, SURVIVOR_TRAITS, SURVIVOR_TALENTS, SURVIVOR_BACKGROUNDS, survivorProfile, survivorRelationship, survivorRoleMultiplier, MAX_SURVIVORS, MAX_FARM_PLOTS, CROPS, ROLES, BUILDINGS, MATERIAL_TIERS, MATERIAL_UPGRADE_COSTS, DIFFICULTIES, TYCOON_UPGRADES, EMBER_MARKET, WEAPONS, WEAPON_MODS, COSMETIC_SKINS, DEFAULT_COSMETICS, EXPLORATION_ZONES, createBase, validateBase, weaponPower, threatProfile, applyAction };
