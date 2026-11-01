// Homefront RPG character sheet: level/XP, skills, gear inventory with equipment slots, a quest journal
// stub and the loot-pickup hook. Server-authoritative; persisted per account in DATA_DIR/homefront-rpg.json
// through homefront-store (load → mutate → save with no await in between).
// XP is only ever granted by server events (award()); there is no client route that adds XP, items or
// quest progress. Old saves (no profile) normalize to a fresh sheet back-filled once from the refuge.
'use strict';
const NP = o => Object.freeze(Object.assign(Object.create(null), o));
const Cinders = require('./homefront-cinders');
const FILE = 'homefront-rpg.json';
const MAX_LEVEL = 30;
const SKILL_MAX = 5;
const SKILLS = NP({
  marksman: NP({ label: 'Marksman', planned: '+3% firearm hit chance per rank' }),
  scavenger: NP({ label: 'Scavenger', planned: '+1 loot roll every 2 ranks' }),
  survivalist: NP({ label: 'Survivalist', planned: '−5% hunger/thirst drain per rank' }),
  engineer: NP({ label: 'Engineer', planned: '−4% build and repair cost per rank' }),
  leader: NP({ label: 'Leader', planned: '+2 survivor morale per rank' }),
  field_medic: NP({ label: 'Field Medic', planned: 'Faster and safer emergency treatment' }),
  wayfinder: NP({ label: 'Wayfinder', planned: 'Improved navigation and tracking' })
});
const SLOTS = Object.freeze(['head', 'body', 'back', 'gadget']);
// Gear catalog. `back` also takes jetpacks (PR d) — they are granted by purchase/exemption only, never loot.
const ITEMS = NP({
  scav_cap: NP({ label: 'Scavenger cap', slot: 'head', armor: 1, loot: true }),
  gas_mask: NP({ label: 'Gas mask', slot: 'head', armor: 2, loot: true }),
  padded_jacket: NP({ label: 'Padded jacket', slot: 'body', armor: 3, loot: true }),
  riot_vest: NP({ label: 'Riot vest', slot: 'body', armor: 5, loot: true }),
  field_pack: NP({ label: 'Field pack', slot: 'back', armor: 0, loot: false }),
  flashlight: NP({ label: 'Flashlight', slot: 'gadget', armor: 0, loot: true }),
  radio: NP({ label: 'Hand radio', slot: 'gadget', armor: 0, loot: true }),
  homefront_jetpack: NP({ label: 'Homefront jetpack', slot: 'back', armor: 0, loot: false, jetpack: 'homefront' }),
  city_jetpack: NP({ label: 'City jetpack', slot: 'back', armor: 0, loot: false, jetpack: 'city' })
});
const LOOT_ITEMS = Object.freeze(Object.keys(ITEMS).filter(k => ITEMS[k].loot));
const XP = NP({ kill_infected: 12, loot: 5, discover: 15, rescue: 20, workday: 8, pvp_kill: 25, boss: 60, siege_repelled: 30, enter_world: 0 });
// Verified actions increase familiarity independently of purchased skill
// ranks. This is a small, capped use-to-grow XP benefit, not client-supplied
// proficiency or an unbounded multiplier on combat and equipment.
const PRACTICE = NP({
  marksman: ['kill_infected','boss'],
  scavenger: ['loot'],
  survivalist: ['workday','siege_repelled'],
  engineer: ['workday'],
  leader: ['rescue','siege_repelled'],
  field_medic: ['rescue'],
  wayfinder: ['discover']
});
const PRACTICE_THRESHOLDS = Object.freeze([0,10,30,70]);
const PRACTICE_TITLES = Object.freeze(['Unseasoned','Spark','Flame','Inferno']);
const practiceTier = count => count >= 70 ? 3 : count >= 30 ? 2 : count >= 10 ? 1 : 0;
function practiceFor(profile,skill) {
  const count=(PRACTICE[skill] || []).reduce((n,source)=>n+(profile.counters?.[source]||0),0);
  const tier=practiceTier(count);
  return { count,tier,label:PRACTICE_TITLES[tier],
    next: tier>=3 ? null : PRACTICE_THRESHOLDS[tier+1] };
}
const PRACTICED_SOURCES = new Set(Object.values(PRACTICE).flat());
const practiceBonus = (profile,source) =>
  PRACTICED_SOURCES.has(source) && XP[source] > 0
    ? Math.min(2,practiceTier(profile.counters?.[source]||0)) : 0;
const QUESTS = NP({
  first_steps: NP({ label: 'First steps', text: 'Travel from your Homefront into the Wastes.', counter: 'enter_world', goal: 1, xp: 20 }),
  scavenger: NP({ label: 'Scavenger', text: 'Search 3 supply crates in the Wastes.', counter: 'loot', goal: 3, xp: 40 }),
  cartographer: NP({ label: 'Cartographer', text: 'Discover 3 landmarks.', counter: 'discover', goal: 3, xp: 50 }),
  infected_down: NP({ label: 'Clear the streets', text: 'Defeat 5 infected.', counter: 'kill_infected', goal: 5, xp: 60 }),
  hold_the_line: NP({ label: 'Hold the line', text: 'Repel a siege at your Homefront.', counter: 'siege_repelled', goal: 1, xp: 80 })
});
const hash = s => { let h = 2166136261; for (const c of String(s)) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return h >>> 0; };
const xpForLevel = n => 50 * n * (n - 1);            // L1 0 · L2 100 · L3 300 · L4 600 · …
function levelFor(xp) { let n = 1; while (n < MAX_LEVEL && xp >= xpForLevel(n + 1)) n++; return n; }
const int = (v, lo, hi) => Number.isSafeInteger(v) ? Math.max(lo, Math.min(hi, v)) : lo;

function defaultProfile() {
  return { version: 2, xp: 0, skills: Object.fromEntries(Object.keys(SKILLS).map(k => [k, 0])), attributes: Cinders.defaultAttributes(), perks: {}, equipment: { head: 'scav_cap', body: null, back: 'field_pack', gadget: null }, items: ['scav_cap', 'field_pack'], counters: {}, quests: {}, tracked: 'first_steps', backfilled: false, log: [] };
}
function normalizeProfile(p) {
  const d = defaultProfile();
  if (!p || typeof p !== 'object' || Array.isArray(p)) return d;
  const out = { version: 2, xp: int(p.xp, 0, xpForLevel(MAX_LEVEL)), skills: {}, attributes: {}, perks: {}, equipment: {}, items: [], counters: {}, quests: {}, tracked: null, backfilled: p.backfilled === true, log: [] };
  out.items = [...new Set((Array.isArray(p.items) ? p.items : d.items).filter(i => typeof i === 'string' && Object.prototype.hasOwnProperty.call(ITEMS, i)))];
  for (const k of Object.keys(SKILLS)) out.skills[k] = int(p.skills?.[k], 0, SKILL_MAX);
  // Never more skill ranks than earned points.
  let over = Object.values(out.skills).reduce((a, b) => a + b, 0) - (levelFor(out.xp) - 1);
  for (const k of Object.keys(SKILLS).reverse()) while (over > 0 && out.skills[k] > 0) { out.skills[k]--; over--; }
  // Existing character XP and ranks are preserved. New C.I.N.D.E.R.S. points
  // are granted retroactively from the earned level, never accepted from POSTs.
  out.attributes = Cinders.normalizeAttributes(p.attributes, levelFor(out.xp));
  out.perks = Cinders.normalizePerks(p.perks, levelFor(out.xp), out.attributes, out.skills);
  for (const s of SLOTS) { const v = p.equipment?.[s]; out.equipment[s] = typeof v === 'string' && out.items.includes(v) && ITEMS[v].slot === s ? v : null; }
  for (const k of Object.keys(XP)) out.counters[k] = int(p.counters?.[k], 0, 1e9);
  for (const q of Object.keys(QUESTS)) if (p.quests?.[q] === 'done') out.quests[q] = 'done';
  out.tracked = typeof p.tracked === 'string' && Object.prototype.hasOwnProperty.call(QUESTS, p.tracked) ? p.tracked : null;
  out.log = (Array.isArray(p.log) ? p.log : []).filter(e => e && typeof e.text === 'string' && Number.isFinite(e.at)).slice(-12).map(e => ({ at: e.at, text: e.text.slice(0, 120) }));
  return out;
}
function loadDb(store) { const db = store.load(FILE, {}); return db && typeof db === 'object' && !Array.isArray(db) ? db : {}; }
// One-time back-fill from existing progression so veterans don't start at level 1.
function backfill(profile, base) {
  if (profile.backfilled || !base) return profile;
  const days = int(base.day, 1, 1e6) - 1, zones = Array.isArray(base?.exploration?.discoveredZones) ? base.exploration.discoveredZones.filter(z => z !== 'outskirts').length : 0;   // outskirts is every refuge's starting zone
  profile.xp = Math.min(xpForLevel(MAX_LEVEL), profile.xp + days * XP.workday + zones * XP.discover);
  profile.backfilled = true;
  return profile;
}
function get(store, acct, base = null) {
  const db = loadDb(store);
  const had = Object.prototype.hasOwnProperty.call(db, acct);
  let profile = normalizeProfile(had ? db[acct] : null);
  if (!profile.backfilled && base) { profile = backfill(profile, base); db[acct] = profile; store.save(FILE, db); }
  return profile;
}
function questProgress(profile) {
  return Object.entries(QUESTS).map(([id, q]) => ({ id, label: q.label, text: q.text, goal: q.goal, progress: Math.min(q.goal, profile.counters[q.counter] || 0), done: profile.quests[id] === 'done', xp: q.xp, tracked: profile.tracked === id }));
}
function sheet(profile, base = null) {
  const level = levelFor(profile.xp), spent = Object.values(profile.skills).reduce((a, b) => a + b, 0);
  return {
    level, xp: profile.xp, xpThisLevel: profile.xp - xpForLevel(level), xpNextLevel: level >= MAX_LEVEL ? null : xpForLevel(level + 1) - xpForLevel(level), maxLevel: MAX_LEVEL,
    skillPoints: Math.max(0, level - 1 - spent),
    progression: 'C.I.N.D.E.R.S.',
    attributePoints: Cinders.attributePoints(level, profile.attributes),
    perkPoints: Cinders.perkPoints(level, profile.perks),
    attributes: Cinders.ATTRIBUTES.map(a => ({
      id:a.id, letter:a.letter, label:a.name, focus:a.focus,
      value:profile.attributes[a.id], max:Cinders.ATTR_MAX
    })),
    perks: Cinders.perksForSheet(level, profile.attributes, profile.skills, profile.perks),
    skills: Object.entries(SKILLS).map(([id, s]) => ({ id, label: s.label, rank: profile.skills[id], max: SKILL_MAX, planned: s.planned, practice: practiceFor(profile,id) })),
    slots: SLOTS, equipment: { ...profile.equipment, weapon: base?.equippedWeapon || 'pipe_blade' },
    items: profile.items.map(id => ({ id, label: ITEMS[id].label, slot: ITEMS[id].slot, armor: ITEMS[id].armor, jetpack: ITEMS[id].jetpack || null, equipped: profile.equipment[ITEMS[id].slot] === id })),
    armor: SLOTS.reduce((a, s) => a + (profile.equipment[s] ? ITEMS[profile.equipment[s]].armor : 0), 0),
    quests: questProgress(profile), log: profile.log.slice(-8)
  };
}
// Server-side progression hook. Returns { levelUp, item, questsDone } for UI feedback.
function award(store, acct, source, { now = Date.now(), lootKey = null, base = null } = {}) {
  if (!Object.prototype.hasOwnProperty.call(XP, source) || typeof acct !== 'string' || !acct) return null;
  const db = loadDb(store);
  let p = normalizeProfile(Object.prototype.hasOwnProperty.call(db, acct) ? db[acct] : null);
  if (base) p = backfill(p, base);
  const before = levelFor(p.xp);
  // Only authenticated server events can award XP. Earned perk bonuses apply
  // here, not from user-supplied client quantities or item counts.
  const earnedXp = XP[source] + Cinders.bonusExperience(source, p.perks) + practiceBonus(p,source);
  p.xp = Math.min(xpForLevel(MAX_LEVEL), p.xp + earnedXp);
  p.counters[source] = (p.counters[source] || 0) + 1;
  const questsDone = [];
  for (const [id, q] of Object.entries(QUESTS)) if (p.quests[id] !== 'done' && q.counter === source && p.counters[source] >= q.goal) { p.quests[id] = 'done'; p.xp = Math.min(xpForLevel(MAX_LEVEL), p.xp + q.xp); questsDone.push(id); p.log.push({ at: now, text: 'Quest complete: ' + q.label + ' (+' + q.xp + ' XP)' }); }
  if (p.tracked && p.quests[p.tracked] === 'done') p.tracked = Object.keys(QUESTS).find(id => p.quests[id] !== 'done') || null;
  // Loot pickup hook: a searched crate has a deterministic 15 % chance (per account + crate + day) to hold gear.
  let item = null;
  if (source === 'loot' && lootKey) {
    const roll = hash(acct + ':' + lootKey + ':' + Math.floor(now / 86400e3));
    const missing = LOOT_ITEMS.filter(i => !p.items.includes(i));
    if (missing.length && roll % 100 < Cinders.gearFindChance(p.perks)) { item = missing[roll % missing.length]; p.items.push(item); p.log.push({ at: now, text: 'Found gear: ' + ITEMS[item].label }); }
  }
  const after = levelFor(p.xp);
  if (after > before) {
    const gainedAttribute = Cinders.earnedAttributePoints(after) - Cinders.earnedAttributePoints(before);
    const gainedPerk = Cinders.earnedPerkPoints(after) - Cinders.earnedPerkPoints(before);
    p.log.push({ at: now, text: 'Reached level ' + after + ' · +' + (after - before) +
      ' skill point' + (after - before > 1 ? 's' : '') +
      (gainedAttribute ? ' · +' + gainedAttribute + ' attribute point' : '') +
      (gainedPerk ? ' · +' + gainedPerk + ' ember perk point' : '') });
  }
  p.log = p.log.slice(-12);
  db[acct] = p; store.save(FILE, db);
  return { source, xp: earnedXp, levelUp: after > before ? after : null, item, questsDone };
}
// Grant a catalog item (purchases/exemptions; PR d). Idempotent.
function grantItem(store, acct, itemId, { now = Date.now(), note = '' } = {}) {
  if (!Object.prototype.hasOwnProperty.call(ITEMS, itemId)) throw new Error('unknown_item');
  const db = loadDb(store);
  const p = normalizeProfile(Object.prototype.hasOwnProperty.call(db, acct) ? db[acct] : null);
  if (!p.items.includes(itemId)) { p.items.push(itemId); p.log.push({ at: now, text: 'Received ' + ITEMS[itemId].label + (note ? ' · ' + note : '') }); p.log = p.log.slice(-12); }
  db[acct] = p; store.save(FILE, db);
  return p;
}
function hasItem(store, acct, itemId) { const db = loadDb(store); const p = db[acct]; return !!p && Array.isArray(p.items) && p.items.includes(itemId); }
// Player actions: spend skill points, equip/unequip owned gear, track a quest.
function act(store, acct, payload, base = null) {
  const db = loadDb(store);
  let p = normalizeProfile(Object.prototype.hasOwnProperty.call(db, acct) ? db[acct] : null);
  if (base) p = backfill(p, base);
  const action = typeof payload?.action === 'string' ? payload.action : '';
  if (action === 'learn') {
    const skill = typeof payload.skill === 'string' && Object.prototype.hasOwnProperty.call(SKILLS, payload.skill) ? payload.skill : null;
    if (!skill) throw new Error('unknown_skill');
    if (p.skills[skill] >= SKILL_MAX) throw new Error('skill_maxed');
    if (sheet(p).skillPoints < 1) throw new Error('no_skill_points');
    p.skills[skill]++;
  } else if (action === 'train-attribute') {
    const attribute = typeof payload.attribute === 'string' &&
      Cinders.attributeIds.has(payload.attribute) ? payload.attribute : null;
    if (!attribute) throw new Error('unknown_attribute');
    if (p.attributes[attribute] >= Cinders.ATTR_MAX) throw new Error('attribute_maxed');
    if (Cinders.attributePoints(levelFor(p.xp),p.attributes) < 1) throw new Error('no_attribute_points');
    p.attributes[attribute]++;
  } else if (action === 'learn-perk') {
    const perk = typeof payload.perk === 'string' && Cinders.perkIds.has(payload.perk)
      ? Cinders.PERKS.find(def => def.id === payload.perk) : null;
    if (!perk) throw new Error('unknown_perk');
    if (p.perks[perk.id] === true) throw new Error('perk_already_owned');
    if (Cinders.perkPoints(levelFor(p.xp),p.perks) < 1) throw new Error('no_perk_points');
    const blocked = Cinders.perkRequirement(perk,levelFor(p.xp),p.attributes,p.skills);
    if (blocked) throw new Error('perk_locked_by_' + blocked);
    p.perks[perk.id] = true;
  } else if (action === 'equip') {
    const item = typeof payload.item === 'string' && Object.prototype.hasOwnProperty.call(ITEMS, payload.item) ? payload.item : null;
    if (!item) throw new Error('unknown_item');
    if (!p.items.includes(item)) throw new Error('item_not_owned');
    p.equipment[ITEMS[item].slot] = item;
  } else if (action === 'unequip') {
    if (!SLOTS.includes(payload.slot)) throw new Error('unknown_slot');
    p.equipment[payload.slot] = null;
  } else if (action === 'track') {
    if (typeof payload.quest !== 'string' || !Object.prototype.hasOwnProperty.call(QUESTS, payload.quest)) throw new Error('unknown_quest');
    p.tracked = payload.quest;
  } else throw new Error('unknown_rpg_action');
  db[acct] = p; store.save(FILE, db);
  return p;
}
module.exports = { FILE, MAX_LEVEL, SKILL_MAX, SKILLS, Cinders, PRACTICE, practiceFor, SLOTS, ITEMS, XP, QUESTS, xpForLevel, levelFor, defaultProfile, normalizeProfile, get, sheet, award, grantItem, hasItem, act };
