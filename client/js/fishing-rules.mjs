// Pure fishing-fight rules shared by the browser UI and deterministic tests.
export const SPECIES = [
  ["minnow", "Ledger Minnow", 0, [0.05, 0.3], 3, {}],
  ["bluegill", "Bluegill Byte", 0, [0.1, 0.6], 4, {}],
  ["perch", "Pond Perch", 0, [0.2, 1.2], 5, {}],
  ["carp", "Mud Carp", 0, [0.8, 6], 6, {}],
  ["shiner", "River Shiner", 0, [0.05, 0.4], 3, {}],
  ["dace", "Silver Dace", 0, [0.1, 0.5], 4, {}],
  ["trout", "Neon Trout", 1, [0.5, 4], 12, {}],
  ["bass", "Amber Bass", 1, [0.6, 5], 14, {}],
  ["catfish", "Glass Catfish", 1, [1, 9], 15, {"night": 1}],
  ["pike", "Spotted Pike", 1, [1, 8], 16, {}],
  ["eel", "Moon Eel", 2, [0.8, 5], 40, {"night": 1}],
  ["gar", "Storm Gar", 2, [2, 12], 45, {"weather": "storm"}],
  ["koi", "Gold Koi", 2, [1, 7], 50, {}],
  ["cod", "Deepwater Cod", 2, [3, 20], 48, {"deep": 1, "boat": 2}],
  ["sturgeon", "Phantom Sturgeon", 3, [10, 60], 140, {"night": 1, "deep": 2, "boat": 3}],
  ["snapper", "Lava Snapper", 3, [2, 14], 120, {}],
  ["salmon", "Aurora Salmon", 3, [3, 18], 130, {"weather": "bull"}],
  ["leviathan", "Burn Leviathan", 4, [80, 300], 600, {"deep": 3, "night": 1, "boat": 4, "lure": "glow"}],
  ["marlin", "Crystal Marlin", 4, [40, 180], 520, {"deep": 2, "boat": 3}],
  ["whaleshark", "XRP Whale Shark", 4, [200, 900], 750, {"deep": 3, "weather": "bull", "boat": 4, "lure": "glow"}],
  ["sunfish", "Copper Sunfish", 0, [0.1, 0.8], 5, {}],
  ["goldentrout", "Gilded Trout", 2, [1, 7], 65, {"night": 1, "boat": 2}],
  ["swordfish", "Bluewater Swordfish", 3, [30, 120], 220, {"deep": 2, "boat": 3}],
  ["anglerfish", "Abyssal Lanternfish", 4, [5, 80], 700, {"deep": 3, "night": 1, "boat": 4, "lure": "glow"}],
  ["smelt", "Silver Smelt", 0, [0.05, 0.45], 4, {}],
  ["pumpkinseed", "Ember Pumpkinseed", 0, [0.12, 0.9], 5, {}],
  ["crappie", "Ash Crappie", 1, [0.3, 2.2], 13, {}],
  ["walleye", "Dusk Walleye", 1, [0.9, 7], 19, {"night": 1}],
  ["char", "Frostback Char", 2, [1, 8], 56, {"rod": "carbon", "lure": "glow"}],
  ["burbot", "Cinder Burbot", 2, [2, 13], 62, {"night": 1, "deep": 1, "boat": 2, "rod": "carbon", "lure": "shrimp"}],
  ["redfish", "Copper Redfish", 2, [3, 24], 74, {"deep": 1, "boat": 2, "rod": "carbon"}],
  ["muskie", "Obsidian Muskie", 3, [8, 32], 180, {"boat": 2, "lure": "burnfly"}],
  ["grouper", "Basalt Grouper", 3, [28, 145], 245, {"deep": 2, "boat": 3, "lure": "shrimp"}],
  ["tuna", "Cobalt Bluefin", 3, [44, 195], 280, {"deep": 2, "boat": 3, "lure": "burnfly"}],
  ["oarfish", "Ghost Oarfish", 4, [65, 280], 690, {"night": 1, "deep": 3, "boat": 4, "lure": "glow"}],
  ["alligatorgar", "Thunderjaw Gar", 4, [120, 380], 825, {"weather": "storm", "deep": 3, "boat": 4, "lure": "burnfly"}],
];
export const SHOP = {
  rods: [
    ["basic", "Basic Rod", 0, 0],
    ["carbon", "Carbon Rod", 150, 1],
    ["pro", "Pro Rod", 600, 2],
    ["legend", "Ember Legend Rod", 2000, 3],
  ],
  baits: [
    ["worm", "Worm (free)", 0, 0],
    ["shrimp", "Shrimp", 5, 1],
    ["glow", "Glow Lure", 20, 2],
    ["burnfly", "Burn Fly", 60, 3],
  ],
};
const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, Number.isFinite(+n) ? +n : lo));

// Affinity nudges catch odds after tackle and water requirements are met.
// Tier 0=worm, 1=shrimp, 2=glow lure, 3=Burn Fly.
const PREFERRED_BAIT = {
  minnow: 0, bluegill: 0, perch: 0, shiner: 0, dace: 0,
  carp: 1, catfish: 1, eel: 2, gar: 2, koi: 2, cod: 1,
  sturgeon: 1, snapper: 3, trout: 3, bass: 3, pike: 3,
  salmon: 3, leviathan: 2, marlin: 2, whaleshark: 2,
  sunfish: 0, goldentrout: 2, swordfish: 2, anglerfish: 2,
  smelt: 0, pumpkinseed: 0, crappie: 0, walleye: 1, char: 2, burbot: 1,
  redfish: 1, muskie: 3, grouper: 1, tuna: 3, oarfish: 2, alligatorgar: 3
};

// Catch XP is deterministic so guest and signed-in anglers see the same progression.
// Weight XP is capped so one enormous catch cannot skip the entire progression ladder.
export function xpForCatch(fish = {}) {
  const rarity = Math.max(0, Math.min(4, Math.floor(Number(fish.r) || 0)));
  const kg = Math.max(0, Math.min(30, Number(fish.kg) || 0));
  return Math.round(10 + rarity * 12 + kg);
}

const ANGLER_XP_THRESHOLDS = [0, 100, 250, 450, 700, 1000, 1400, 1850, 2400, 3050];
export function anglerProgress(xp = 0) {
  const total = Math.max(0, Math.floor(Number(xp) || 0));
  let level = 1;
  for (let i = 1; i < ANGLER_XP_THRESHOLDS.length; i++) {
    if (total < ANGLER_XP_THRESHOLDS[i]) break;
    level = i + 1;
  }
  const current = ANGLER_XP_THRESHOLDS[level - 1];
  const next = ANGLER_XP_THRESHOLDS[level] ?? null;
  return { level, xp: total, currentLevelXp: total - current, nextLevelXp: next === null ? 0 : next - current, nextLevelAt: next, progress: next === null ? 1 : Math.max(0, Math.min(1, (total - current) / (next - current))) };
}

export const BOATS = [
  { id: 'skiff', name: 'Harbor Skiff', price: 0, tier: 1, capacityKg: 12, depth: 0, speed: 1, color: 0x2a9d8f, description: 'Starter boat for sheltered water and smaller catches.' },
  { id: 'bass', name: 'Bass Runner', price: 1200, tier: 2, capacityKg: 60, depth: 1, speed: 1.2, color: 0x2878b8, description: 'A faster fishing boat for larger lake species.' },
  { id: 'offshore', name: 'Offshore Cruiser', price: 5000, tier: 3, capacityKg: 200, depth: 2, speed: 1.35, color: 0xd97732, description: 'Reaches deep water and supports heavy game fish.' },
  { id: 'abyss', name: 'Abyssal Hunter', price: 14000, tier: 4, capacityKg: 900, depth: 3, speed: 1.5, color: 0x7657d5, description: 'Deep-water specialist built for legendary catches.' }
];
export function boatById(id) {
  return BOATS.find(boat => boat.id === id) || BOATS[0];
}
export function canBoatCatch(boatId, fish = {}, deepWater = false) {
  const boat = boatById(boatId);
  const meta = fish.meta || fish[5] || {};
  if ((Number(fish.kg) || 0) > boat.capacityKg) return false;
  if (meta.deep && (!deepWater || boat.depth < meta.deep)) return false;
  if ((Number(meta.boat) || 1) > boat.tier) return false;
  return true;
}

export const ROD_LEVELS = { basic: 1, carbon: 2, pro: 5, legend: 10 };
export function rodUnlockLevel(rodId) {
  return Object.hasOwn(ROD_LEVELS, rodId) ? ROD_LEVELS[rodId] : 1;
}

// Casts inside a visible feeding school receive a modest, deterministic bite/fight bonus.
export function feedingSpotBonus(distance, radius = 9) {
  const d = Number(distance), r = clamp(radius, 0, 100);
  return Number.isFinite(d) && d >= 0 && d <= r ? 1.28 : 1;
}

export function baitAffinity(speciesId, baitTier) {
  const tier = Math.max(0, Math.min(3, Number.isFinite(+baitTier) ? +baitTier : 0));
  const preferred = Object.hasOwn(PREFERRED_BAIT, speciesId) ? PREFERRED_BAIT[speciesId] : undefined;
  if (preferred === undefined) return 1;
  return tier === preferred ? 1.25 : 0.9;
}

const RARITY_WEIGHTS = [60, 25, 10, 4, 1];
const rodRequirement = species => species[5].rod || [null, null, null, 'pro', 'legend'][species[2]];
const itemName = (list, id) => list.find(item => item[0] === id)?.[1];
export const gearTier = (list, id) => list.find(item => item[0] === id)?.[3] ?? 0;

export function fishRequirements(species) {
  const meta = species[5], rod = rodRequirement(species);
  const requirements = [];
  if (rod) requirements.push(itemName(SHOP.rods, rod) + (rod === 'legend' ? '' : ' or better'));
  if (meta.lure) requirements.push(itemName(SHOP.baits, meta.lure));
  else if (species[2] === 4) requirements.push('Glow Lure or Burn Fly');
  if (meta.boat) requirements.push(BOATS[meta.boat - 1].name + (meta.boat < BOATS.length ? ' or better' : ''));
  if (meta.deep) requirements.push('marked deep basin');
  if (meta.night) requirements.push('night (7 PM–6 AM Arizona time)');
  if (meta.weather) requirements.push(meta.weather === 'bull' ? 'bull market weather' : 'storm weather');
  return requirements;
}

export function eligibleSpecies(rodId, baitId, context = {}) {
  const rodTier = gearTier(SHOP.rods, rodId);
  const baitTier = gearTier(SHOP.baits, baitId);
  return SPECIES.filter(species => {
    const [,, rarity, [minKg],, meta] = species;
    return (!meta.night || context.night)
      && (!meta.weather || meta.weather === context.weather)
      && rodTier >= gearTier(SHOP.rods, rodRequirement(species))
      && (meta.lure ? meta.lure === baitId : rarity !== 4 || baitTier >= 2)
      && (context.onBoat
        ? canBoatCatch(context.boatId, { kg: minKg, meta }, context.deep)
        : !meta.deep && !meta.boat && minKg <= 9);
  });
}

export function roll(rodId, baitId, context = {}, random = Math.random) {
  const rodTier = gearTier(SHOP.rods, rodId);
  const baitTier = gearTier(SHOP.baits, baitId);
  const luck = rodTier * .5 + baitTier;
  const capacity = context.onBoat ? boatById(context.boatId).capacityKg : 9;
  const pool = eligibleSpecies(rodId, baitId, context);
  const weights = pool.map(([id,, rarity]) => {
    const affinity = baitAffinity(id, baitTier);
    return RARITY_WEIGHTS[rarity] * Math.pow(1 + luck, rarity * .6) * affinity;
  });
  let ticket = random() * weights.reduce((total, weight) => total + weight, 0);
  let index = 0;
  while (index < pool.length - 1 && ticket >= weights[index]) ticket -= weights[index++];
  const [id, name, rarity, [min, max], baseValue] = pool[index];
  const size = Math.pow(random(), Math.max(.6, 1.6 - .25 * rodTier));
  const kg = +Math.min(capacity, min + (max - min) * size).toFixed(2);
  return {
    id, name, r: rarity, kg, val: Math.round(baseValue * (1 + size)),
    hits: 1 + rarity, zone: +(.3 - .04 * rarity + .05 * rodTier).toFixed(2)
  };
}

export function resolveFightTap({ position, zoneStart, zoneWidth, running = false, tension = 0, rodTier = 0, rarity = 0 } = {}) {
  const p = clamp(position, 0, 1), start = clamp(zoneStart, 0, 1), width = clamp(zoneWidth, 0, 1);
  const rod = clamp(rodTier, 0, 3), r = clamp(rarity, 0, 4), before = clamp(tension, 0, 1.5);
  const hit = !running && p >= start && p <= start + width;
  // Rare fish pull harder. Better rods reduce the penalty and recover more tension on a clean reel.
  const nextTension = hit
    ? Math.max(0, before - (0.2 + rod * 0.035))
    : Math.min(1.5, before + (running ? 0.24 + r * 0.035 : Math.max(0.04, 0.11 + r * 0.025 - rod * 0.015)));
  return { hit, miss: !hit, tension: +nextTension.toFixed(3), broke: nextTension >= 1 };
}

export function journalAchievements(log = {}, species = []) {
  const entries = Object.entries(log || {}).filter(([id, value]) => species.some(s => s[0] === id) && value && Number(value.n) > 0);
  const caught = new Set(entries.map(([id]) => id));
  const total = entries.reduce((sum, [, value]) => sum + Math.max(0, Number(value.n) || 0), 0);
  const rarities = new Set(species.filter(s => caught.has(s[0])).map(s => s[2]));
  const biggest = entries.reduce((best, [, value]) => Math.max(best, Number(value.best) || 0), 0);
  return [
    { id: 'first-catch', title: 'First Catch', detail: 'Land your first fish', progress: Math.min(total, 1), goal: 1 },
    { id: 'five-species', title: 'Curious Angler', detail: 'Discover 5 species', progress: Math.min(caught.size, 5), goal: 5 },
    { id: 'ten-species', title: 'Lake Naturalist', detail: 'Discover 10 species', progress: Math.min(caught.size, 10), goal: 10 },
    { id: 'full-journal', title: 'Living Encyclopedia', detail: 'Discover every species', progress: Math.min(caught.size, species.length), goal: species.length },
    { id: 'rarity-tour', title: 'Rarity Tour', detail: 'Catch fish from all 5 rarity tiers', progress: Math.min(rarities.size, 5), goal: 5 },
    { id: 'big-game', title: 'Big Game', detail: 'Record a fish weighing at least 100 kg', progress: biggest >= 100 ? 1 : 0, goal: 1 }
  ].map(a => ({ ...a, unlocked: a.progress >= a.goal }));
}

const DAILY_TARGETS = ['minnow', 'bluegill', 'perch', 'carp', 'shiner', 'dace', 'trout', 'bass', 'pike', 'koi', 'snapper'];
export function challengeBoard(catches = [], date = new Date()) {
  const day = date instanceof Date ? date.toISOString().slice(0, 10) : String(date).slice(0, 10);
  const dayNumber = Math.floor(Date.parse(day + 'T00:00:00Z') / 86400000);
  const target = DAILY_TARGETS[((dayNumber % DAILY_TARGETS.length) + DAILY_TARGETS.length) % DAILY_TARGETS.length];
  const valid = Array.isArray(catches) ? catches.filter(c => c && typeof c.sp === 'string' && Number.isFinite(+c.kg) && +c.kg >= 0) : [];
  const unique = new Set(valid.map(c => c.sp));
  const bestKg = valid.reduce((best, c) => Math.max(best, +c.kg), 0);
  const items = [
    { id: 'daily-three', title: 'Keep the Line Tight', detail: 'Land 3 fish today', progress: Math.min(valid.length, 3), goal: 3 },
    { id: 'daily-target', title: 'Species Spotlight', detail: 'Catch today’s featured species: ' + target, progress: Math.min(valid.filter(c => c.sp === target).length, 1), goal: 1, species: target },
    { id: 'daily-variety', title: 'A Varied Creel', detail: 'Land 2 different species today', progress: Math.min(unique.size, 2), goal: 2 },
    { id: 'daily-heavy', title: 'Heavy Haul', detail: 'Land a fish weighing at least 5 kg today', progress: bestKg >= 5 ? 1 : 0, goal: 1 }
  ].map(item => ({ ...item, unlocked: item.progress >= item.goal }));
  return { day, target, catches: valid.length, items };
}
