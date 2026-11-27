// Undercroft RPG core: pure rules shared by the game page (client/undercroft/) and the hub (client/js/underground-hub.js).
// No DOM and no three.js. Local-device save under localStorage['bcUndercroftRPG']. Never reads/writes Eternal Grind's egSave.
// Eternal Grind data is reused READ-ONLY through small adapters (races, rarity colours, the XP curve, two spells).
import { RACES as EG_RACES, RAR as EG_RAR } from '../dungeon/sys.js';
import { SPELLS as EG_SPELLS } from '../dungeon/data.js';
import { xpThreshold } from '../dungeon/progression-core.mjs';

export const SAVE_KEY = 'bcUndercroftRPG';
export const SAVE_V = 1;
export const MAX_LVL = 30;

// ------------------------------------------------------------------ skills
export const SKILLS = {
  blade: { n: 'Blade', d: 'Swords, daggers and spears. Raises their damage.', ic: '⚔' },
  blunt: { n: 'Blunt', d: 'Axes, hammers, mauls and staves. Raises their damage.', ic: '🔨' },
  marksman: { n: 'Marksman', d: 'Bows, crossbows and throwing knives. Raises ranged damage and draw speed.', ic: '🏹' },
  block: { n: 'Block', d: 'Stopping blows with a shield or weapon. Less damage and stamina lost when blocking.', ic: '🛡' },
  armor: { n: 'Armor', d: 'Wearing armor well. Raises armor rating when you are hit.', ic: '⛨' },
  destruction: { n: 'Destruction', d: 'Damaging spells. Raises Firebolt damage, lowers its cost.', ic: '🔥' },
  restoration: { n: 'Restoration', d: 'Healing spells. Raises Heal strength, lowers its cost.', ic: '✚' },
  acrobatics: { n: 'Acrobatics', d: 'Rolling and footwork. Cheaper dodges and faster movement.', ic: '➶' },
  security: { n: 'Security', d: 'Picking locks. Widens the sweet spot on each tumbler.', ic: '🗝' },
};
export const SKILL_IDS = Object.keys(SKILLS);

// ------------------------------------------------------------------ races (adapter over Eternal Grind RACES)
// EG gives name + description + stat multipliers. We add skill bonuses, a tint and a body scale for the 3D model.
const RACE_EXTRA = {
  human: { sk: { blade: 5, block: 5, security: 5 }, tint: 0xffffff, scale: 1, lore: 'Folk of the burning city above, of every skin and build. Steady in every craft.' },
  ashenborn: { sk: { destruction: 10, restoration: 5 }, tint: 0xffd2b8, scale: 1, lore: 'Ash-grey elves whose blood remembers the first fire. Spells come easily.' },
  stonefolk: { sk: { armor: 10, block: 5 }, tint: 0xc9c2b8, scale: 1.04, lore: 'Short, broad quarry-folk with braided beards. Slow to anger and slower to fall.' },
  wildkin: { sk: { acrobatics: 10, blade: 5 }, tint: 0xf3dcb0, scale: 1, lore: 'Striped cat-folk from the deep woods: tall ears, long tails, quick claws.' },
  gloomkin: { sk: { security: 10, acrobatics: 5 }, tint: 0xc8d0e8, scale: .9, lore: 'Small, long-eared tunnel elves who see well in the dark.' },
  ironhide: { sk: { blade: 5, armor: 10 }, tint: 0xb8c8b0, scale: 1.1, lore: 'Green-hided, tusked giants who shrug off blows that fell others.' },
  skyborn: { sk: { restoration: 10, destruction: 5 }, tint: 0xe6f0ff, scale: .97, lore: 'Tall golden elves from the high spires, quick of foot and of mind.' },
  emberkin: { sk: { blade: 10, destruction: 5 }, tint: 0xffc8a0, scale: 1.02, lore: 'Horned, scaled lizard-folk of the ember clans, hot-blooded and hard-hitting.' },
};
export const RACES = Object.fromEntries(Object.entries(EG_RACES).filter(([id]) => RACE_EXTRA[id]).map(([id, r]) => [id, {
  id, n: r[0], d: r[1], m: { hp: r[2].hp || 1, atk: r[2].atk || 1, def: r[2].def || 1, mp: r[2].mp || 1, spd: r[2].spd || 1, crit: r[2].crit || 0 }, ...RACE_EXTRA[id],
}]));
export const RACE_IDS = Object.keys(RACES);

// ------------------------------------------------------------------ classes
export const MODELS = ['knight', 'mage', 'rogue', 'barbarian'];
export const CLASSES = {
  sentinel: { n: 'Sentinel', arche: 'Warrior', d: 'Shield and steel. Takes the hits and gives them back.', major: ['blade', 'block', 'armor'], model: 'knight', weapon: 'iron_sword', armor: 'iron_plate', shield: 1, off: 'round_shield', hp: 30, mp: 0, st: 20 },
  arcanist: { n: 'Arcanist', arche: 'Mage', d: 'Fire and mending. Fragile, but the strongest spells.', major: ['destruction', 'restoration', 'blunt'], model: 'mage', weapon: 'oak_staff', armor: 'lumenweave_robe', shield: 0, hp: 0, mp: 50, st: 0 },
  cutpurse: { n: 'Cutpurse', arche: 'Thief', d: 'A hunting bow, a quick dagger, and no lock stays shut.', major: ['security', 'marksman', 'acrobatics'], model: 'rogue', weapon: 'ember_dagger', alt: 'hunting_bow', ammo: ['arrows', 30], armor: 'leather_cuirass', shield: 0, hp: 10, mp: 10, st: 30 },
  spellblade: { n: 'Spellblade', arche: 'Spellsword', d: 'An axe in one hand, a shield in the other, mending light between.', major: ['blunt', 'restoration', 'block'], model: 'barbarian', weapon: 'iron_axe', armor: 'leather_cuirass', shield: 1, off: 'round_shield', hp: 20, mp: 25, st: 10 },
  warmage: { n: 'Warmage', arche: 'Battlemage', d: 'Firebolts first, a war hammer when they get close.', major: ['destruction', 'blunt', 'armor'], model: 'mage', weapon: 'iron_hammer', armor: 'iron_plate', shield: 0, hp: 15, mp: 35, st: 5 },
  duskblade: { n: 'Duskblade', arche: 'Nightblade', d: 'Knives from the shadows, a dagger up close, fire for what survives.', major: ['blade', 'destruction', 'marksman'], model: 'rogue', weapon: 'ember_dagger', alt: 'throwing_knives', ammo: ['knives', 16], armor: 'leather_cuirass', shield: 0, hp: 10, mp: 25, st: 20 },
  ranger: { n: 'Ranger', arche: 'Archer', d: 'A longbow and a spear. Thin them out from afar, hold the line up close.', major: ['marksman', 'blade', 'acrobatics'], model: 'rogue', weapon: 'ash_spear', alt: 'ashwood_longbow', ammo: ['arrows', 40], armor: 'leather_cuirass', shield: 0, hp: 15, mp: 5, st: 30 },
  vanguard: { n: 'Vanguard', arche: 'Barbarian', d: 'A two-handed claymore and thick skin. No shield, no mercy.', major: ['blade', 'armor', 'acrobatics'], model: 'barbarian', weapon: 'steel_claymore', armor: 'iron_plate', shield: 0, hp: 35, mp: 0, st: 25 },
};
export const CLASS_IDS = Object.keys(CLASSES);
export function customClass(major, model = 'knight') {
  const m = [...new Set((major || []).filter(s => SKILLS[s]))].slice(0, 3);
  while (m.length < 3) { const f = SKILL_IDS.find(s => !m.includes(s)); m.push(f); }
  const caster = m.filter(s => s === 'destruction' || s === 'restoration').length;
  const weapon = caster >= 2 ? 'oak_staff' : m.includes('security') ? 'ember_dagger' : m.includes('blunt') ? (m.includes('block') ? 'iron_axe' : 'iron_hammer') : 'iron_sword', mk = m.includes('marksman');
  return { n: 'Custom', arche: 'Custom', d: 'Your own path.', major: m, model: MODELS.includes(model) ? model : 'knight', weapon: mk && !m.includes('blade') && !m.includes('blunt') && caster < 2 ? 'hunting_bow' : weapon, alt: mk ? (m.includes('blade') || m.includes('blunt') || caster >= 2 ? 'hunting_bow' : 'ember_dagger') : undefined, ammo: mk ? ['arrows', 30] : undefined, armor: caster >= 2 ? 'lumenweave_robe' : m.includes('armor') ? 'iron_plate' : 'leather_cuirass', shield: m.includes('block') ? 1 : 0, off: m.includes('block') ? 'round_shield' : undefined, hp: 15, mp: 15 + caster * 15, st: 15 };
}
export const classOf = h => h && h.cls === 'custom' ? customClass(h.custom && h.custom.major, h.custom && h.custom.model) : CLASSES[h && h.cls] || CLASSES.sentinel;

// ------------------------------------------------------------------ starsigns (boons)
export const SIGNS = {
  kindled: { n: 'The Kindled', d: 'Born under the ember star. Firebolt deals 25% more damage.', ic: '🔥', b: { fire: .25 } },
  bulwark: { n: 'The Bulwark', d: 'The tower stands. +20 Health.', ic: '🏰', b: { hp: 20 } },
  wellspring: { n: 'The Wellspring', d: 'A deep well of power. +30 Magicka.', ic: '💧', b: { mp: 30 } },
  fox: { n: 'The Fox', d: 'Sly and lucky. +15 Security and +8% critical chance.', ic: '🦊', b: { security: 15, crit: 8 } },
  drover: { n: 'The Drover', d: 'Tireless on the long road. +25 Stamina and faster stamina recovery.', ic: '🐂', b: { st: 25, stRegen: .3 } },
  lantern: { n: 'The Lantern', d: 'A light for others. Heal restores 40% more.', ic: '🏮', b: { heal: .4 } },
};
export const SIGN_IDS = Object.keys(SIGNS);

// ------------------------------------------------------------------ spells (adapter over Eternal Grind SPELLS)
const EB = EG_SPELLS.ember_bolt || { n: 'Ember Bolt', cost: 18, d: '' }, MD = EG_SPELLS.mend || { n: 'Mend', cost: 22, d: '' };
export const SPELLS = {
  firebolt: { n: 'Firebolt', from: EB.n, skill: 'destruction', cost: EB.cost + 2, cd: .9, dmg: 22, d: 'Hurl an exploding bolt of fire. Splash damage.', ic: '🔥' },
  heal: { n: 'Heal', from: MD.n, skill: 'restoration', cost: MD.cost + 3, cd: 1.6, pct: .3, flat: 12, d: 'Restore 30% of your health, plus a little more.', ic: '✚' },
};

// ------------------------------------------------------------------ items
export const RARITY = EG_RAR.map(r => ({ n: r[0], c: r[1] }));
export const ITEMS = {
  // weapons: kind = how it is held and swung (arsenal.js KINDS), model = arsenal.glb node, sk = skill it trains/uses
  // dmg per hit, spd = attack speed, reach (m), st = stamina per light attack (heavy x2.4), ammo for ranged
  rusty_blade: { n: 'Rusty Blade', t: 'weapon', kind: 'one', model: 'sabre', sk: 'blade', dmg: 6, spd: 1, reach: 2.1, st: 7, val: 4, r: 0 },
  iron_sword: { n: 'Iron Sword', t: 'weapon', kind: 'one', model: 'sword', sk: 'blade', dmg: 9, spd: 1, reach: 2.2, st: 7, val: 20, r: 0 },
  steel_sabre: { n: 'Steel Sabre', t: 'weapon', kind: 'one', model: 'sabre', sk: 'blade', dmg: 12, spd: 1.08, reach: 2.2, st: 7, val: 55, r: 1 },
  lumen_edge: { n: 'Lumen Edge', t: 'weapon', kind: 'one', model: 'goldsword', sk: 'blade', dmg: 15, spd: 1.05, reach: 2.3, st: 7, val: 140, r: 2, spell: .1, glow: 0x5aa8ff, d: 'An elder-forged blade that hums near crystals.' },
  steel_longsword: { n: 'Bloodsteel Greatsword', t: 'weapon', kind: 'two', model: 'claymore', sk: 'blade', dmg: 17, spd: .82, reach: 2.7, st: 11, val: 60, r: 1 },
  steel_claymore: { n: 'Steel Claymore', t: 'weapon', kind: 'two', model: 'greatsword', sk: 'blade', dmg: 13, spd: .85, reach: 2.7, st: 11, val: 45, r: 0 },
  ember_dagger: { n: 'Ember Dagger', t: 'weapon', kind: 'dagger', model: 'dagger', sk: 'blade', dmg: 7, spd: 1.35, reach: 1.8, st: 5, val: 25, r: 1, crit: 10 },
  fang_dagger: { n: 'Gilded Fang', t: 'weapon', kind: 'dagger', model: 'dagger2', sk: 'blade', dmg: 10, spd: 1.4, reach: 1.8, st: 5, val: 70, r: 2, crit: 15, d: 'A gold-hilted dagger from a Vael Ithren tomb.' },
  ash_spear: { n: 'Ash Spear', t: 'weapon', kind: 'spear', model: 'spear', sk: 'blade', dmg: 9, spd: .95, reach: 3.1, st: 8, val: 30, r: 0 },
  iron_axe: { n: 'Iron Hatchet', t: 'weapon', kind: 'one', model: 'axe', sk: 'blunt', dmg: 10, spd: .96, reach: 2.1, st: 7, val: 22, r: 0 },
  bearded_axe: { n: 'Bearded War Axe', t: 'weapon', kind: 'one', model: 'battleaxe', sk: 'blunt', dmg: 13, spd: .92, reach: 2.2, st: 8, val: 60, r: 1 },
  iron_hammer: { n: 'Iron War Hammer', t: 'weapon', kind: 'one', model: 'hammer', sk: 'blunt', dmg: 11, spd: .9, reach: 2.1, st: 8, val: 28, r: 0, stagger: 1.3 },
  quarry_maul: { n: 'Quarry Maul', t: 'weapon', kind: 'two', model: 'maul', sk: 'blunt', dmg: 19, spd: .72, reach: 2.6, st: 13, val: 90, r: 1, stagger: 1.6 },
  hollow_cleaver: { n: "Hollow King's Cleaver", t: 'weapon', kind: 'two', model: 'greataxe', sk: 'blunt', dmg: 22, spd: .78, reach: 2.7, st: 12, val: 260, r: 3, d: 'Heavy, cold and still whispering.' },
  oak_staff: { n: 'Oak Staff', t: 'weapon', kind: 'staff', model: 'staff', sk: 'blunt', dmg: 7, spd: 1, reach: 2.5, st: 7, val: 18, r: 0, spell: .1 },
  hunting_bow: { n: 'Hunting Bow', t: 'weapon', kind: 'bow', model: 'bow', sk: 'marksman', dmg: 12, spd: 1, reach: 30, st: 6, ammo: 'arrows', val: 25, r: 0 },
  ashwood_longbow: { n: 'Ashwood Longbow', t: 'weapon', kind: 'bow', model: 'bow2', sk: 'marksman', dmg: 15, spd: .92, reach: 34, st: 7, ammo: 'arrows', val: 55, r: 1 },
  gilded_bow: { n: 'Gilded Recurve', t: 'weapon', kind: 'bow', model: 'goldbow', sk: 'marksman', dmg: 19, spd: 1.05, reach: 36, st: 7, ammo: 'arrows', val: 150, r: 2, d: 'Strung with lumen-silk. It never seems to slacken.' },
  hollow_bow: { n: "Hollow King's Bow", t: 'weapon', kind: 'bow', model: 'evilbow', sk: 'marksman', dmg: 23, spd: 1, reach: 38, st: 7, ammo: 'arrows', val: 280, r: 3, d: 'Black horn and red sinew. Arrows leave it hissing.' },
  light_crossbow: { n: 'Light Crossbow', t: 'weapon', kind: 'crossbow', model: 'crossbow', sk: 'marksman', dmg: 24, spd: .8, reach: 38, st: 4, ammo: 'bolts', val: 70, r: 1 },
  throwing_knives: { n: 'Throwing Knives', t: 'weapon', kind: 'thrown', model: 'knife', sk: 'marksman', dmg: 8, spd: 1.3, reach: 16, st: 5, ammo: 'knives', val: 12, r: 0 },
  arrows: { n: 'Iron Arrows', t: 'ammo', val: 1, r: 0, stack: 1 },
  bolts: { n: 'Crossbow Bolts', t: 'ammo', val: 2, r: 0, stack: 1 },
  knives: { n: 'Knives (thrown)', t: 'ammo', val: 1, r: 0, stack: 1 },
  round_shield: { n: 'Round Shield', t: 'shield', model: 'shield_round', ar: 4, blk: .12, val: 15, r: 0 },
  studded_shield: { n: 'Studded Round Shield', t: 'shield', model: 'shield_round2', ar: 6, blk: .15, val: 40, r: 1 },
  heater_shield: { n: 'Iron Heater Shield', t: 'shield', model: 'shield_heater', ar: 8, blk: .17, val: 60, r: 1 },
  wardens_heater: { n: "Warden's Heater", t: 'shield', model: 'shield_heater2', ar: 10, blk: .2, val: 120, r: 2 },
  gilded_aegis: { n: 'Gilded Aegis', t: 'shield', model: 'shield_celtic', ar: 13, blk: .24, val: 240, r: 3, d: 'Lumen glass set in gold. Spells seem to slide off it.' },
  ragged_robe: { n: 'Ragged Robe', t: 'armor', ar: 2, val: 2, r: 0 },
  leather_cuirass: { n: 'Leather Cuirass', t: 'armor', ar: 6, val: 18, r: 0 },
  iron_plate: { n: 'Iron Plate', t: 'armor', ar: 10, val: 40, r: 0, heavy: 1 },
  lumenweave_robe: { n: 'Lumenweave Robe', t: 'armor', ar: 4, val: 30, r: 1, mp: 25 },
  wardens_mail: { n: "Warden's Mail", t: 'armor', ar: 15, val: 180, r: 2, hp: 15, d: 'Ledger-blessed mail from Warden Ossia.' },
  scribes_mantle: { n: "Scribe's Ember Mantle", t: 'armor', ar: 7, val: 150, r: 2, mp: 30, d: 'Varro\'s own mantle, singed at the hem.' },
  potion_hp: { n: 'Healing Draught', t: 'potion', heal: 50, val: 10, r: 0, stack: 1 },
  potion_mp: { n: 'Magicka Draught', t: 'potion', mana: 50, val: 10, r: 0, stack: 1 },
  lockpick: { n: 'Lockpick', t: 'tool', val: 2, r: 0, stack: 1 },
  bone_dust: { n: 'Bone Dust', t: 'misc', val: 3, r: 0, stack: 1 },
  lumen_shard: { n: 'Lumen Shard', t: 'misc', val: 15, r: 1, stack: 1 },
  heartstone: { n: 'The Heartstone', t: 'quest', val: 0, r: 3, d: 'The last lit lumen of Vael Ithren. Warden Ossia wants it back.' },
};

// ------------------------------------------------------------------ quests
export const QUESTS = {
  lumen: {
    n: 'The Dimmed Lumen', giver: 'warden', giverName: 'Warden Ossia', kind: 'main',
    d: 'The Heartstone that lit the ruin of Vael Ithren has gone dark in the grip of the Hollow King. Take the Ember Stair down, reach his throne, and bring the stone back to Warden Ossia.',
    steps: { active: 'Reach the throne of the Hollow King in Vael Ithren.', ready: 'Bring the Heartstone to Warden Ossia in the Ledger Hall.', done: 'Completed.' },
    reward: { xp: 300, gold: 120, item: 'wardens_mail' },
  },
  tithe: {
    n: 'The Bone Tithe', giver: 'scribe', giverName: 'Cinder-Scribe Varro', kind: 'side', need: 8,
    d: 'The dead of Vael Ithren are walking again. Varro wants eight of them put back to rest, and he will write your name in the chronicle.',
    steps: { active: 'Put the risen dead to rest in Vael Ithren.', ready: 'Return to Cinder-Scribe Varro in the Ossuary Chapel.', done: 'Completed.' },
    reward: { xp: 140, gold: 60, item: 'scribes_mantle' },
  },
};

// ------------------------------------------------------------------ save
export function emptySave() { return { v: SAVE_V, hero: null, quests: { lumen: { s: 'none' }, tithe: { s: 'none', n: 0 } }, ruin: { chests: {}, solved: false, boss: false, slain: false, seen: {} }, settings: {} }; }
const clampN = (v, lo, hi, d) => (Number.isFinite(+v) ? Math.min(hi, Math.max(lo, +v)) : d);
export function validate(raw) {
  const s = emptySave(); if (!raw || typeof raw !== 'object') return s;
  if (raw.quests && typeof raw.quests === 'object') for (const q of Object.keys(QUESTS)) { const r = raw.quests[q]; if (r && ['none', 'active', 'ready', 'done'].includes(r.s)) s.quests[q] = { s: r.s, n: clampN(r.n, 0, 999, 0) }; }
  if (raw.ruin && typeof raw.ruin === 'object') { s.ruin.solved = !!raw.ruin.solved; s.ruin.boss = !!raw.ruin.boss; s.ruin.slain = !!(raw.ruin.slain || raw.ruin.boss); for (const k of ['chests', 'seen']) if (raw.ruin[k] && typeof raw.ruin[k] === 'object') for (const [id, v] of Object.entries(raw.ruin[k])) if (/^[\w-]{1,24}$/.test(id)) s.ruin[k][id] = !!v; }
  if (raw.settings && typeof raw.settings === 'object') s.settings = { tier: ['low', 'medium', 'high'].includes(raw.settings.tier) ? raw.settings.tier : undefined, sens: clampN(raw.settings.sens, .3, 3, 1) };
  const h = raw.hero; if (h && typeof h === 'object' && RACES[h.race] && (CLASSES[h.cls] || h.cls === 'custom') && SIGNS[h.sign]) {
    const H = { name: String(h.name || 'Wanderer').replace(/[<>&"]/g, '').slice(0, 18) || 'Wanderer', race: h.race, cls: h.cls, sign: h.sign, lvl: clampN(Math.floor(h.lvl), 1, MAX_LVL, 1), xp: clampN(h.xp, 0, 1e7, 0), gold: clampN(Math.floor(h.gold), 0, 1e7, 0), boons: { hp: 0, mp: 0, st: 0 }, pending: clampN(Math.floor(h.pending), 0, MAX_LVL, 0), skills: {}, inv: [], eq: {}, kills: {}, created: clampN(h.created, 0, 9e15, 0), look: cleanLook(h.look) };
    if (h.cls === 'custom') H.custom = { major: customClass(h.custom && h.custom.major).major, model: customClass([], h.custom && h.custom.model).model };
    for (const k of ['hp', 'mp', 'st']) H.boons[k] = clampN(Math.floor(h.boons && h.boons[k]), 0, 99, 0);
    const base = startSkills(H.race, classOf(H), H.sign);
    for (const id of SKILL_IDS) { const r = h.skills && h.skills[id]; H.skills[id] = { v: clampN(Math.floor(r && r.v), 1, 100, base[id]), x: clampN(r && r.x, 0, 1000, 0) }; }
    if (Array.isArray(h.inv)) for (const it of h.inv.slice(0, 80)) if (it && ITEMS[it.id]) H.inv.push({ id: it.id, u: String(it.u || uid()).slice(0, 16), q: clampN(Math.floor(it.q), 1, 999, 1) });
    for (const sl of ['weapon', 'armor', 'shield', 'alt']) { const u = h.eq && h.eq[sl]; if (u && H.inv.some(i => i.u === u && ITEMS[i.id].t === (sl === 'alt' ? 'weapon' : sl))) H.eq[sl] = u; }
    if (H.eq.alt && H.eq.alt === H.eq.weapon) delete H.eq.alt;
    H.ars = 1; if (!h.ars) grantKit(H, classOf(H), false);   // saves from before the arsenal: hand out the class shield / ranged kit once
    if (h.kills && typeof h.kills === 'object') for (const [k, v] of Object.entries(h.kills)) if (/^\w{1,16}$/.test(k)) H.kills[k] = clampN(Math.floor(v), 0, 1e6, 0);
    s.hero = H;
  }
  return s;
}
export function load(storage) { try { const t = storage && storage.getItem(SAVE_KEY); return validate(t ? JSON.parse(t) : null); } catch (e) { return emptySave(); } }
export function store(storage, s) { try { storage && storage.setItem(SAVE_KEY, JSON.stringify(s)); return true; } catch (e) { return false; } }

// ------------------------------------------------------------------ hero
let _u = 0; export const uid = () => (Date.now().toString(36).slice(-5) + (++_u).toString(36) + Math.random().toString(36).slice(2, 5));
export function startSkills(race, cls, sign) {
  const out = {}; for (const id of SKILL_IDS) out[id] = cls.major.includes(id) ? 25 : 8;
  const r = RACES[race]; if (r) for (const [k, v] of Object.entries(r.sk)) out[k] += v;
  const sg = SIGNS[sign]; if (sg && sg.b.security) out.security += sg.b.security;
  return out;
}
export function cleanLook(l) { l = l && typeof l === 'object' ? l : {}; const i = v => clampN(Math.floor(v), 0, 7, 0); return { sex: l.sex === 'f' ? 'f' : 'm', skin: i(l.skin), hair: i(l.hair), hairCol: i(l.hairCol) }; }
export function newHero({ name, race, cls, sign, custom, look }) {
  if (!RACES[race]) race = 'human'; if (!(CLASSES[cls] || cls === 'custom')) cls = 'sentinel'; if (!SIGNS[sign]) sign = 'bulwark';
  const H = { name: String(name || 'Wanderer').replace(/[<>&"]/g, '').trim().slice(0, 18) || 'Wanderer', race, cls, sign, lvl: 1, xp: 0, gold: 25, boons: { hp: 0, mp: 0, st: 0 }, pending: 0, skills: {}, inv: [], eq: {}, kills: {}, created: Date.now(), look: cleanLook(look) };
  if (cls === 'custom') { const c = customClass(custom && custom.major, custom && custom.model); H.custom = { major: c.major, model: c.model }; }
  const C = classOf(H), sk = startSkills(race, C, sign); for (const id of SKILL_IDS) H.skills[id] = { v: sk[id], x: 0 };
  const w = addItem(H, C.weapon), a = addItem(H, C.armor); H.eq.weapon = w.u; H.eq.armor = a.u; H.ars = 1; grantKit(H, C, true);
  addItem(H, 'potion_hp', 3); addItem(H, 'potion_mp', 2); addItem(H, 'lockpick', 4);
  return H;
}
// class off-hand shield, alternate (ranged) weapon and its ammo
function grantKit(H, C, fresh) {
  if (C.off && !H.inv.some(i => ITEMS[i.id].t === 'shield')) { const s = addItem(H, C.off); if (!H.eq.shield) H.eq.shield = s.u; }
  if (C.alt && (fresh || !H.inv.some(i => i.id === C.alt))) { const w = addItem(H, C.alt); if (!H.eq.alt) H.eq.alt = w.u; }
  if (C.ammo && (fresh || !countItem(H, C.ammo[0]))) addItem(H, C.ammo[0], C.ammo[1]);
}
export const TWO_HANDED = { two: 1, spear: 1, staff: 1, bow: 1, crossbow: 1 };
export const RANGED = { bow: 1, crossbow: 1, thrown: 1 };
export function addItem(H, id, q = 1) {
  const D = ITEMS[id]; if (!D) return null;
  if (D.stack) { const ex = H.inv.find(i => i.id === id); if (ex) { ex.q += q; return ex; } }
  const it = { id, u: uid(), q: D.stack ? q : 1 }; H.inv.push(it);
  for (let k = 1; k < (D.stack ? 1 : q); k++) H.inv.push({ id, u: uid(), q: 1 });
  return it;
}
export function countItem(H, id) { return H.inv.filter(i => i.id === id).reduce((a, i) => a + i.q, 0); }
export function takeItem(H, id, q = 1) {
  if (countItem(H, id) < q) return false;
  for (const it of H.inv.filter(i => i.id === id)) { const t = Math.min(q, it.q); it.q -= t; q -= t; if (it.q <= 0) { H.inv.splice(H.inv.indexOf(it), 1); for (const sl in H.eq) if (H.eq[sl] === it.u) delete H.eq[sl]; } if (!q) break; }
  return true;
}
export function equip(H, u) {
  const it = H.inv.find(i => i.u === u); if (!it) return false; const t = ITEMS[it.id].t; if (t !== 'weapon' && t !== 'armor' && t !== 'shield') return false;
  if (t === 'shield' && H.eq.shield === u) { delete H.eq.shield; return true; }   // equipping the worn shield again takes it off
  if (t === 'weapon' && H.eq.weapon && H.eq.weapon !== u) H.eq.alt = H.eq.weapon;  // the old weapon becomes the swap weapon
  if (t === 'weapon' && H.eq.alt === u) delete H.eq.alt;
  H.eq[t] = u; return true;
}
// weapon swap button: main <-> alternate
export function swapWeapon(H) {
  if (!H.eq.alt || !H.inv.some(i => i.u === H.eq.alt)) { const o = H.inv.find(i => ITEMS[i.id].t === 'weapon' && i.u !== H.eq.weapon); if (!o) return false; H.eq.alt = o.u; }
  const w = H.eq.weapon; H.eq.weapon = H.eq.alt; if (w) H.eq.alt = w; else delete H.eq.alt; return true;
}
export const equipped = (H, slot) => { const it = H && H.inv.find(i => i.u === H.eq[slot]); return it ? ITEMS[it.id] : null; };

// derived stats
export function stats(H) {
  const R = RACES[H.race], C = classOf(H), S = SIGNS[H.sign].b, w = equipped(H, 'weapon') || ITEMS.rusty_blade, a = equipped(H, 'armor') || { ar: 0 }, sk = id => H.skills[id].v, L = H.lvl - 1;
  const hp = Math.round((90 + C.hp + L * 9 + H.boons.hp * 10 + (S.hp || 0) + (a.hp || 0)) * R.m.hp);
  const mp = Math.round((50 + C.mp + L * 5 + H.boons.mp * 10 + (S.mp || 0) + (a.mp || 0)) * R.m.mp);
  const st = Math.round(100 + C.st + L * 5 + H.boons.st * 10 + (S.st || 0));
  const kind = w.kind || 'one', wsk = w.sk || 'blade', ranged = !!RANGED[kind], sh = !TWO_HANDED[kind] && equipped(H, 'shield');
  const dmg = w.dmg * (1 + sk(wsk) / 60) * (ranged ? 1 : R.m.atk);
  const ar = Math.round(((a.ar || 0) * (1 + sk('armor') / 50) + (sh ? sh.ar : 0)) * R.m.def);
  return {
    hp, mp, st, dmg, ar, armorRed: Math.min(.6, ar / (ar + 40)),
    crit: (5 + (w.crit || 0) + (S.crit || 0) + R.m.crit) / 100,
    atkSpd: (w.spd || 1) * (ranged ? 1 + sk('marksman') / 300 : 1), kind, wsk, ranged, reach: w.reach || 2.2, wst: Math.max(3, (w.st || 7) * (1 - sk(wsk) / 300)), ammo: w.ammo || null, stagger: w.stagger || 1,
    wModel: w.model || 'sword', shModel: sh ? sh.model : null, glow: w.glow || 0, spd: R.m.spd * (1 + sk('acrobatics') / 400),
    blockRed: Math.min(.92, (sh ? .55 : .42) + sk('block') / 250 + (sh ? sh.blk : 0)), blockSt: Math.max(4, 14 - sk('block') / 10),
    dodgeCost: Math.max(10, 24 - sk('acrobatics') / 6), stRegen: 18 * (1 + (S.stRegen || 0)), mpRegen: 2.2 + sk('restoration') / 60,
    fire: SPELLS.firebolt.dmg * (1 + sk('destruction') / 50) * (1 + (S.fire || 0)) * (1 + (w.spell || 0)), fireCost: Math.round(SPELLS.firebolt.cost * (1 - sk('destruction') / 250)),
    heal: (SPELLS.heal.pct * hp + SPELLS.heal.flat) * (1 + sk('restoration') / 80) * (1 + (S.heal || 0)), healCost: Math.round(SPELLS.heal.cost * (1 - sk('restoration') / 250)),
    lockZone: Math.min(.42, .12 + sk('security') / 300), shield: !!sh, model: C.model,
  };
}

// ------------------------------------------------------------------ progression
export const xpFor = lvl => xpThreshold(Math.max(1, Math.min(MAX_LVL, lvl)));   // EG curve (adapter)
export function gainXp(H, amt) {
  const out = { levels: 0 }; if (!(amt > 0) || H.lvl >= MAX_LVL) return out;
  H.xp += Math.round(amt);
  while (H.lvl < MAX_LVL && H.xp >= xpFor(H.lvl)) { H.xp -= xpFor(H.lvl); H.lvl++; H.pending++; out.levels++; }
  if (H.lvl >= MAX_LVL) H.xp = 0; return out;
}
export const skillNeed = (H, id) => Math.round(6 + H.skills[id].v * .55);
// a use of a skill (amount ~1 = one successful action). Returns {up, xp} where up = skill-ups gained.
export function useSkill(H, id, amt = 1) {
  const s = H.skills[id]; if (!s || s.v >= 100) return { up: 0, lv: { levels: 0 } };
  const major = classOf(H).major.includes(id); s.x += amt * (major ? 1.5 : 1); let up = 0;
  while (s.v < 100 && s.x >= skillNeed(H, id)) { s.x -= skillNeed(H, id); s.v++; up++; }
  const lv = up ? gainXp(H, up * (major ? 6 : 4)) : { levels: 0 };
  return { up, lv, major };
}
export const BOONS = { hp: { n: 'Vigor', d: '+10 Health', ic: '❤' }, mp: { n: 'Insight', d: '+10 Magicka', ic: '✦' }, st: { n: 'Endurance', d: '+10 Stamina', ic: '⚡' } };
export function spendLevel(H, boon) { if (!H.pending || !BOONS[boon]) return false; H.boons[boon]++; H.pending--; return true; }

// ------------------------------------------------------------------ quests
export const shownLevel = H => Math.max(1, H.lvl - (H.pending || 0));
export function questState(save, id) { return (save.quests[id] && save.quests[id].s) || 'none'; }
export function acceptQuest(save, id) { const q = save.quests[id]; if (!QUESTS[id] || !q || q.s !== 'none') return false; q.s = 'active'; q.n = 0; return true; }
// game events -> quest progress. Returns list of human-readable updates.
export function questEvent(save, ev) {
  const out = []; const H = save.hero;
  if (ev.type === 'kill' && ev.undead) { const q = save.quests.tithe; if (q.s === 'active') { q.n = Math.min(QUESTS.tithe.need, (q.n || 0) + 1); out.push(`${QUESTS.tithe.n}: ${q.n}/${QUESTS.tithe.need}`); if (q.n >= QUESTS.tithe.need) { q.s = 'ready'; out.push(`${QUESTS.tithe.n}: return to ${QUESTS.tithe.giverName}`); } } }
  if (ev.type === 'boss') { save.ruin.slain = true; }
  if (ev.type === 'heartstone') { save.ruin.boss = true; save.ruin.slain = true; if (H && !countItem(H, 'heartstone') && save.quests.lumen.s !== 'done') addItem(H, 'heartstone'); const q = save.quests.lumen; if (q.s === 'none') q.s = 'active'; if (q.s === 'active') { q.s = 'ready'; out.push(`${QUESTS.lumen.n}: bring the Heartstone to ${QUESTS.lumen.giverName}`); } }
  return out;
}
export function canTurnIn(save, id) { return !!(save.hero && save.quests[id] && save.quests[id].s === 'ready' && (id !== 'lumen' || countItem(save.hero, 'heartstone') > 0)); }
export function turnIn(save, id) {
  if (!canTurnIn(save, id)) return null; const Q = QUESTS[id], H = save.hero;
  if (id === 'lumen') takeItem(H, 'heartstone');
  save.quests[id].s = 'done'; H.gold += Q.reward.gold; const it = addItem(H, Q.reward.item); const lv = gainXp(H, Q.reward.xp);
  return { xp: Q.reward.xp, gold: Q.reward.gold, item: Q.reward.item, itemName: ITEMS[Q.reward.item].n, levels: lv.levels, uid: it && it.u };
}
export function journal(save) {
  return Object.entries(QUESTS).map(([id, Q]) => { const st = questState(save, id), q = save.quests[id]; return { id, n: Q.n, kind: Q.kind, giver: Q.giverName, s: st, d: Q.d, step: st === 'none' ? `Speak with ${Q.giverName}.` : Q.steps[st] + (id === 'tithe' && st === 'active' ? ` (${q.n || 0}/${Q.need})` : ''), reward: Q.reward }; });
}

// ------------------------------------------------------------------ loot (deterministic per chest id)
export function hash(str) { let h = 2166136261; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
export function rng(seed) { let s = seed >>> 0 || 1; return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; }; }
export const CHESTS = {
  hall: { gold: [15, 30], pool: [['potion_hp', 1], ['lockpick', 2], ['arrows', 15], ['bone_dust', 2]], pick: 2, sure: [], arms: [['hunting_bow', 'iron_hammer', 'ash_spear', 'throwing_knives', 'round_shield', 'steel_claymore'], 1] },
  vault: { gold: [40, 70], pool: [['potion_mp', 1], ['lumen_shard', 1], ['potion_hp', 1], ['bolts', 12]], pick: 1, sure: ['steel_longsword', 'light_crossbow', ['bolts', 16]], locked: 3 },
  gallery: { gold: [10, 25], pool: [['lockpick', 2], ['potion_hp', 1], ['knives', 10], ['arrows', 20]], pick: 2, sure: [], arms: [['bearded_axe', 'steel_sabre', 'studded_shield', 'ashwood_longbow', 'quarry_maul'], 1] },
  ante: { gold: [50, 90], pool: [['potion_hp', 2], ['potion_mp', 2], ['lumen_shard', 2], ['arrows', 25]], pick: 2, sure: ['lumen_edge', 'heater_shield'], locked: 2 },
  throne: { gold: [120, 180], pool: [['potion_hp', 2], ['lumen_shard', 3]], pick: 2, sure: ['hollow_cleaver', 'gilded_bow', 'gilded_aegis', ['arrows', 30]] },
};
export function rollChest(id, salt = '') {
  const C = CHESTS[id]; if (!C) return { gold: 0, items: [] }; const r = rng(hash('vael:' + id + salt));
  const gold = C.gold[0] + Math.floor(r() * (C.gold[1] - C.gold[0] + 1)); const pool = C.pool.slice(), items = C.sure.map(x => (Array.isArray(x) ? x : [x, 1]));
  for (let k = 0; k < C.pick && pool.length; k++) items.push(pool.splice(Math.floor(r() * pool.length), 1)[0]);
  if (C.arms) { const a = C.arms[0].slice(); for (let k = 0; k < C.arms[1] && a.length; k++) items.push([a.splice(Math.floor(r() * a.length), 1)[0], 1]); }
  return { gold, items };
}
export function lootChest(save, id) {
  if (!save.hero || save.ruin.chests[id]) return null; const L = rollChest(id, save.hero.created ? String(save.hero.created % 997) : '');
  save.ruin.chests[id] = true; save.hero.gold += L.gold; for (const [it, q] of L.items) addItem(save.hero, it, q); return L;
}

// enemy drops (random, rolled when an enemy dies): returns [[id, q]...]
export const DROPS = {
  minion: [[.18, 'arrows', 6], [.08, 'knives', 4], [.05, 'rusty_blade', 1]],
  skeleton: [[.22, 'arrows', 8], [.12, 'bolts', 5], [.1, 'iron_sword', 1], [.07, 'iron_axe', 1], [.06, 'ash_spear', 1], [.06, 'round_shield', 1], [.05, 'hunting_bow', 1], [.04, 'iron_hammer', 1], [.03, 'steel_claymore', 1]],
  wraith: [[.25, 'knives', 6], [.15, 'arrows', 10], [.08, 'fang_dagger', 1], [.06, 'steel_sabre', 1], [.05, 'throwing_knives', 1], [.04, 'ashwood_longbow', 1], [.04, 'studded_shield', 1]],
  boss: [[1, 'hollow_bow', 1], [1, 'wardens_heater', 1], [1, 'arrows', 20]],
};
export function rollDrops(kind, r = Math.random) { const out = []; for (const [p, id, q] of DROPS[kind] || []) if (r() < p) out.push([id, q]); return kind === 'boss' ? out : out.slice(0, 2); }

// ------------------------------------------------------------------ combat helpers (pure)
export const ENEMY = {
  skeleton: { n: 'Risen Sentinel', hp: 46, dmg: 9, xp: 26, ar: .1, poise: 30, spd: 2.7, undead: 1 },
  wraith: { n: 'Lumen Wraith', hp: 38, dmg: 11, xp: 40, ar: 0, poise: 18, spd: 2.4, undead: 1 },
  minion: { n: 'Bone Thrall', hp: 22, dmg: 6, xp: 10, ar: 0, poise: 12, spd: 3, undead: 1 },
  boss: { n: 'Vaelor, the Hollow King', hp: 420, dmg: 18, xp: 260, ar: .2, poise: 140, spd: 2.5, undead: 1, boss: 1 },
};
// scale an enemy to the hero's level a little (Oblivion-style light level scaling)
export function enemyStats(kind, heroLvl = 1) { const E = ENEMY[kind], s = 1 + .1 * Math.max(0, Math.min(10, heroLvl - 1)); return { ...E, hp: Math.round(E.hp * s), dmg: E.dmg * (1 + .07 * Math.max(0, heroLvl - 1)), xp: Math.round(E.xp * (1 + .05 * (heroLvl - 1))) }; }
export function meleeDamage(st, heavy, r = Math.random()) { const crit = r < st.crit; return { amt: st.dmg * (heavy ? 2 : 1) * (crit ? 1.6 : 1) * st.atkSpd ** .2, crit }; }
// ranged hit: draw = 0..1 how far the bow was drawn (crossbow/thrown always 1)
export function rangedDamage(st, draw = 1, r = Math.random()) { const crit = r < st.crit + (draw >= .98 ? .05 : 0); return { amt: st.dmg * (.35 + .65 * Math.min(1, draw)) * (crit ? 1.6 : 1), crit }; }
export function incoming(st, raw, { blocking = false, perfect = false } = {}) {
  let amt = raw * (1 - st.armorRed); let stam = 0;
  if (perfect) { amt = 0; stam = 2; } else if (blocking) { amt *= (1 - st.blockRed); stam = st.blockSt + raw * .35; }
  return { amt: Math.max(0, amt), stam };
}
