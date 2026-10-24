// Pure fishing-fight rules shared by the browser UI and deterministic tests.
// This is a gameplay helper, not an authority for wallet-backed catch validation.
const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, Number.isFinite(+n) ? +n : lo));

// Preferred bait nudges catch odds without making any species impossible to catch.
// Tier 0=worm, 1=shrimp, 2=glow lure, 3=Burn Fly.
const PREFERRED_BAIT = {
  minnow: 0, bluegill: 0, perch: 0, shiner: 0, dace: 0,
  carp: 1, catfish: 1, eel: 2, gar: 2, koi: 2, cod: 1,
  sturgeon: 1, snapper: 3, trout: 3, bass: 3, pike: 3,
  salmon: 3, leviathan: 2, marlin: 2, whaleshark: 2
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

const ROD_LEVELS = { basic: 1, carbon: 2, pro: 5, legend: 10 };
export function rodUnlockLevel(rodId) {
  return ROD_LEVELS[rodId] ?? 1;
}

export function baitAffinity(speciesId, baitTier) {
  const tier = Math.max(0, Math.min(3, Number.isFinite(+baitTier) ? +baitTier : 0));
  const preferred = PREFERRED_BAIT[speciesId];
  if (preferred === undefined) return 1;
  return tier === preferred ? 1.25 : 0.9;
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
