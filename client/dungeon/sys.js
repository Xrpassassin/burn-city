// Eternal Grind v2 systems: items, equipment refs, multiclass stats, upgrades, effects, con colours, save migration.
// Pure logic (no DOM except the icon/tooltip HTML builders). Imported by index.html and ui.js.
import { GEAR, EQ_SLOTS, ITYPES, V1_SLOT, BAGS, SPELLS, EFFECTS, DIFF, CON } from './data.js';
export const SAVE_V = 2;
export const RAR = [['Common', '#bbb', 1], ['Uncommon', '#4c4', 1.25], ['Rare', '#4af', 1.6], ['Epic', '#b5f', 2.1], ['Legendary', '#fa3', 2.8], ['Mythic', '#f44', 3.6]];
export const RACES = { human: ['Human', 'Balanced and adaptable.', { hp: 1, atk: 1, def: 1, mp: 1 }], ashenborn: ['Ashenborn', 'Fire-touched; strong spells.', { hp: .95, atk: 1, def: .95, mp: 1.25 }], stonefolk: ['Stonefolk', 'Hard as rock; tough defense.', { hp: 1.15, atk: .95, def: 1.25, mp: .85 }], wildkin: ['Wildkin', 'Fast and fierce.', { hp: 1, atk: 1.1, def: .95, mp: .95, spd: 1.12 }], gloomkin: ['Gloomkin', 'Small, sly, deadly crits.', { hp: .9, atk: 1.05, def: .9, mp: 1.1, crit: 8 }], ironhide: ['Ironhide', 'Huge; the most health.', { hp: 1.3, atk: 1.05, def: 1.1, mp: .75, spd: .92 }], skyborn: ['Skyborn', 'Light-footed mystics.', { hp: .92, atk: .98, def: .92, mp: 1.2, spd: 1.08 }], emberkin: ['Emberkin', 'Burning strength.', { hp: 1.05, atk: 1.15, def: .95, mp: 1 }] };
export const CLASSES = { warrior: ['Warrior', 'Heavy melee. Big health, wide swings.', { hp: 130, mp: 40, atk: 14, def: 6, crit: 5, melee: 1, range: 2.8, cd: .55 }, 'iron_longsword', 'WAR'], rogue: ['Rogue', 'Fast strikes, high crit.', { hp: 95, mp: 50, atk: 11, def: 3, crit: 20, melee: 1, range: 2.3, cd: .32 }, 'shadow_dagger', 'ROG'], ranger: ['Ranger', 'Arrows from range.', { hp: 100, mp: 55, atk: 12, def: 3, crit: 12, bow: 1, cd: .6 }, 'hunter_longbow', 'RNG'], mage: ['Mage', 'Arcane bolts; cheap fireballs.', { hp: 85, mp: 110, atk: 13, def: 2, crit: 8, bolt: 1, cd: .5 }, 'arcane_staff', 'MAG'] };
export { EQ_SLOTS, ITYPES, BAGS, SPELLS, EFFECTS, DIFF, CON };
const rnd = Math.random, ri = n => Math.floor(rnd() * n), pick = a => a[ri(a.length)];
export const pretty = s => String(s).replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()).replace(/\bOf\b/g, 'of').replace(/s'S\b/, "s'");
const WEBP = new Set(Object.values(GEAR).flat());
// base pools per type (v1 art where we have it, drawn glyphs for the rest)
const ACC_NECK = new Set(ITYPES.neck.bases);
const BASES = { ...Object.fromEntries(Object.entries(ITYPES).map(([k, v]) => [k, v.bases])), primary: GEAR.Weapon, head: GEAR.Helmet, chest: GEAR.Chest, feet: GEAR.Boots, charm: [...GEAR.Relic, 'crit_charm', 'lucky_coin'] };
const CORE = new Set(['primary', 'head', 'chest', 'feet', 'charm']); // v1 slots keep full power; the extra slots are lighter so totals stay sane
const uid = () => Math.random().toString(36).slice(2, 9);
export const itemName = it => (it.up ? `+${it.up} ` : '') + (it.t === 'bag' ? it.n : pretty(it.n));
// ---------- item generation ----------
export function rollRarity(depth, bonus = 0) { const r = rnd() * 100 - Math.min(40, (depth + bonus) * 1.5); return r < 1 ? 5 : r < 4 ? 4 : r < 12 ? 3 : r < 30 ? 2 : r < 58 ? 1 : 0; }
export function mkItem(t, depth, rar, name, bonus = 0) {
  rar = rar ?? rollRarity(depth, bonus); const m = RAR[rar][2], p = (4 + depth * 2.2) * m, f = v => Math.max(1, Math.round(v * (0.85 + rnd() * .3)));
  const T = ITYPES[t], k = CORE.has(t) ? 1 : .45, it = { id: uid(), t, n: name || pick(BASES[t]), r: rar, s: {}, up: 0 };
  for (const [st, w] of Object.entries(T.w)) { if (st === 'spd') it.s.spd = Math.round(3 + rar * 2); else if (st === 'crit') it.s.crit = Math.round((t === 'ring' ? 1 : 2) + rar * (t === 'ring' ? 1.5 : 2)); else it.s[st] = f(p * w * k); }
  if (t === 'charm' && /crit_charm|lucky_coin/.test(it.n)) { it.s.crit = Math.round(2 + rar * 2.5); }
  if (rar >= 2) { const x = pick(['hp', 'atk', 'def', 'mp']); it.s[x] = (it.s[x] || 0) + f(p * (x === 'hp' || x === 'mp' ? 1.5 : .3) * k); }
  const fxCh = rar >= 3 ? .45 : rar === 2 ? .25 : rar === 1 ? .08 : 0; if (rnd() < fxCh) it.fx = pick(Object.keys(EFFECTS).filter(e => EFFECTS[e].t === fxKind(t)));
  it.v = Math.round(5 * (1 + depth) * m * (CORE.has(t) ? 1 : .6)); return it; }
export function mkBag(i) { const [n, size] = BAGS[i]; return { id: uid(), t: 'bag', n, r: Math.min(3, i), size, items: Array(size).fill(null), s: {}, v: 10 + i * 25 }; }
export const fxKind = t => (t === 'primary' || t === 'ranged') ? 'proc' : 'focus';
export const randomType = () => pick(['primary', 'head', 'chest', 'feet', 'charm', 'ring', 'neck', 'primary', 'chest', 'face', 'shoulders', 'back', 'arms', 'wrist', 'hands', 'legs', 'secondary', 'ranged', 'ammo']);
// effective stats (+1..+10 upgrades add 8% each)
export const upMul = it => 1 + .08 * (it.up || 0);
export function istats(it) { const o = {}; for (const [k, v] of Object.entries(it.s || {})) o[k] = k === 'spd' || k === 'crit' ? v + Math.floor((it.up || 0) / 3) : Math.round(v * upMul(it)); return o; }
export const iscore = it => { if (!it || it.t === 'bag') return 0; const s = istats(it); return (s.atk || 0) * 3 + (s.def || 0) * 3 + (s.hp || 0) * .5 + (s.mp || 0) * .3 + (s.crit || 0) * 1.5 + (s.spd || 0) + (it.fx ? 4 : 0); };
export const iweight = it => it.t === 'bag' ? .5 + it.size * .1 : Math.round(ITYPES[it.t].wt * (1 - .06 * it.r) * 10) / 10;
// class affinity (informational, shown as "Suits" line)
export function suits(it) { if (it.t !== 'primary' && it.t !== 'ranged') return it.t === 'bag' ? '' : 'ALL'; const n = it.n;
  if (/bow|crossbow|sling|darts/.test(n)) return 'RNG WAR ROG'; if (/staff|rod|crook|branch/.test(n)) return 'MAG'; if (/dagger|needles|fang|dirk/.test(n)) return 'ROG RNG WAR'; return 'WAR ROG RNG'; }
// ---------- multiclass stats ----------
export const classesOf = P => (P.classes && P.classes.length ? P.classes : [P.cls]).filter(c => CLASSES[c]).slice(0, 3);
export const clsLabel = P => classesOf(P).map(c => CLASSES[c][0]).join(' / ');
export const xpNeed = P => Math.round(60 * Math.pow(P.lvl, 1.45) * (1 + .15 * (classesOf(P).length - 1)));
export function recalc(P, buffs = {}) {
  const cl = classesOf(P), c = CLASSES[cl[0]][2], r = RACES[P.race][2], L = P.lvl - 1;
  let hp = c.hp, mp = c.mp, atk = c.atk, def = c.def, crit = c.crit;
  for (const x of cl.slice(1)) { const e = CLASSES[x][2]; hp += e.hp * .15; mp += e.mp * .15; atk += e.atk * .15; def += e.def * .15; crit = Math.max(crit, e.crit * .75); }
  const s = { hp: (hp + L * 14) * r.hp, mp: (mp + L * 6) * r.mp, atk: (atk + L * 2.2) * r.atk, def: (def + L * 1.2) * r.def, crit: crit + (r.crit || 0), spd: 100 * (r.spd || 1) };
  const fx = { spellDmg: 0, healPow: 0, costRed: 0, haste: 0, regen: 0 }, procs = []; let wt = 0;
  for (const it of Object.values(P.eq)) if (it) { for (const [k, v] of Object.entries(istats(it))) s[k] = (s[k] || 0) + v; wt += iweight(it); const e = it.fx && EFFECTS[it.fx]; if (e) { if (e.t === 'focus') fx[e.k] = Math.max(fx[e.k], e.v); else procs.push(it.fx); } }
  if (buffs.atk) s.atk *= 1 + buffs.atk; if (buffs.def) s.def *= 1 + buffs.def; if (buffs.spd) s.spd *= 1 + buffs.spd;
  for (const k in s) s[k] = Math.round(s[k]); s.crit = Math.min(60, s.crit); s.wt = Math.round(wt * 10) / 10;
  P.st = s; P.fx = fx; P.procs = procs; P.hp = Math.min(P.hp, s.hp); P.mp = Math.min(P.mp, s.mp); return s; }
export const knownSpells = P => Object.keys(SPELLS).filter(k => SPELLS[k].cls === '*' || classesOf(P).includes(SPELLS[k].cls));
export function defaultGems(P) { const k = knownSpells(P), g = Array(8).fill(null); k.slice(0, 8).forEach((s, i) => g[i] = s); return g; }
export const DEFAULT_HOT = () => ['pot:0', 'pot:1', 'gem:0', 'gem:1', 'gem:2', 'gem:3', 'gem:4', 'gem:5', 'gem:6', 'gem:7'];
// ---------- con colours ----------
export function conOf(plvl, elvl) { const d = elvl - plvl, g = plvl < 10 ? 4 : plvl < 25 ? 6 : 8;
  const i = d >= 3 ? 6 : d >= 1 ? 5 : d === 0 ? 4 : d >= -2 ? 3 : d >= -Math.ceil(g * .6) ? 2 : d > -g ? 1 : 0; return { i, key: CON[i][0], col: CON[i][1], desc: CON[i][2] }; }
export const conXp = i => [.2, .75, .9, 1, 1, 1.15, 1.35][i];
// ---------- inventory refs: 'eq:head' | 'gen:3' | 'bag:3:5' ----------
export function getRef(P, ref) { const [k, a, b] = ref.split(':'); if (k === 'eq') return P.eq[a] || null; if (k === 'gen') return P.gen[+a] || null; if (k === 'bag') return P.gen[+a]?.items?.[+b] || null; return null; }
function setRef(P, ref, it) { const [k, a, b] = ref.split(':'); if (k === 'eq') { if (it) P.eq[a] = it; else delete P.eq[a]; } else if (k === 'gen') P.gen[+a] = it || null; else if (k === 'bag') P.gen[+a].items[+b] = it || null; }
export function canPlace(P, it, ref) { if (!it) return true; const [k, a] = ref.split(':'); if (k === 'eq') return EQ_SLOTS[a] && EQ_SLOTS[a][1] === it.t; if (k === 'bag') return it.t !== 'bag' && !!P.gen[+a]?.items; return k === 'gen'; }
export function moveItem(P, from, to) { if (from === to) return false; const a = getRef(P, from), b = getRef(P, to); if (!a) return false;
  // a bag can't be dropped into itself
  if (a.t === 'bag' && to.startsWith('bag:') && to.split(':')[1] === from.split(':')[1]) return false;
  if (!canPlace(P, a, to) || !canPlace(P, b, from)) return false;
  // moving a bag that holds the target slot (bag:i:j while moving gen:i) is blocked by canPlace (bags can't enter bags)
  setRef(P, from, b); setRef(P, to, a); return true; }
export function autoEquip(P, from) { const it = getRef(P, from); if (!it) return false;
  if (from.startsWith('eq:')) { const free = freeSlot(P, it); return free ? moveItem(P, from, free) : false; }
  const cands = Object.keys(EQ_SLOTS).filter(k => EQ_SLOTS[k][1] === it.t); if (!cands.length) return false;
  const tgt = cands.find(k => !P.eq[k]) || cands.reduce((m, k) => iscore(P.eq[k]) < iscore(P.eq[m]) ? k : m, cands[0]); return moveItem(P, from, 'eq:' + tgt); }
export function freeSlot(P, it) { if (it && it.t === 'bag') { const i = P.gen.findIndex(x => !x); return i >= 0 ? 'gen:' + i : null; }
  for (let i = 0; i < 8; i++) if (!P.gen[i]) return 'gen:' + i;
  for (let i = 0; i < 8; i++) { const b = P.gen[i]; if (b?.items) { const j = b.items.findIndex(x => !x); if (j >= 0) return `bag:${i}:${j}`; } } return null; }
export function addItem(P, it) { const r = freeSlot(P, it); if (!r) return null; setRef(P, r, it); return r; }
export function removeRef(P, ref) { const it = getRef(P, ref); if (!it) return null; if (it.t === 'bag' && it.items.some(Boolean)) return null; setRef(P, ref, null); return it; }
export const allItems = P => { const o = []; for (const [k, v] of Object.entries(P.eq)) if (v) o.push(['eq:' + k, v]); P.gen.forEach((g, i) => { if (!g) return; o.push(['gen:' + i, g]); if (g.items) g.items.forEach((x, j) => x && o.push([`bag:${i}:${j}`, x])); }); return o; };
export const freeCount = P => P.gen.filter(x => !x).length + P.gen.reduce((n, b) => n + (b?.items ? b.items.filter(x => !x).length : 0), 0);
// ---------- forge: upgrades + effects ----------
export const UP_CH = [1, 1, 1, .9, .8, .7, .6, .5, .4, .3];
export function upCost(it) { const u = it.up || 0; return { ore: (u + 1) * 2 + it.r, shard: u >= 5 ? u - 3 : 0, gold: Math.round(15 * Math.pow(u + 1, 1.8) * (1 + it.r * .25)), ch: UP_CH[u] ?? 0, risk: u >= 6 }; }
export function tryUpgrade(P, it, roll = rnd()) { if (!it || it.t === 'bag' || (it.up || 0) >= 10) return { ok: false, msg: 'This item cannot be improved further.' };
  const c = upCost(it); if (P.mats.ore < c.ore || P.mats.shard < c.shard || P.gold < c.gold) return { ok: false, msg: 'You lack the materials.' };
  P.mats.ore -= c.ore; P.mats.shard -= c.shard; P.gold -= c.gold;
  if (roll < c.ch) { it.up = (it.up || 0) + 1; return { ok: true, up: it.up, msg: `The forge sings. ${itemName(it)}!` }; }
  if (c.risk) { it.up--; return { ok: false, fail: true, msg: `The metal cracks! ${itemName(it)} loses a level.` }; }
  return { ok: false, fail: true, msg: 'The forge sputters. The attempt fails, materials lost.' }; }
export const IMBUE_COST = { ore: 3, shard: 1, gold: 40 };
export function study(P, ref) { const it = getRef(P, ref); if (!it?.fx || ref.startsWith('eq:')) return { ok: false, msg: 'Take the item off and pick one with an effect.' }; const fx = it.fx; setRef(P, ref, null); if (!P.codex.includes(fx)) P.codex.push(fx); return { ok: true, msg: `You study the ${pretty(it.n)} and learn ${EFFECTS[fx].n}. The item crumbles.` }; }
export function imbue(P, it, fx) { const e = EFFECTS[fx]; if (!it || !e || it.t === 'bag' || fxKind(it.t) !== e.t) return { ok: false, msg: e?.t === 'proc' ? 'Procs go on weapons (Primary or Range).' : 'Focus effects go on armor and jewelry.' };
  const c = IMBUE_COST; if (P.mats.ore < c.ore || P.mats.shard < c.shard || P.gold < c.gold) return { ok: false, msg: 'You lack the materials.' };
  P.mats.ore -= c.ore; P.mats.shard -= c.shard; P.gold -= c.gold; it.fx = fx; return { ok: true, msg: `${itemName(it)} now carries ${e.n}.` }; }
export function scrapValue(it) { return { gold: it.v || 1, ore: it.t === 'bag' ? 0 : 1 + Math.floor(it.r / 2) + Math.floor((it.up || 0) / 2), shard: it.r >= 3 ? it.r - 2 : 0 }; }
// ---------- new character / save migration ----------
export function newChar(name, race, classes) { const P = { v: SAVE_V, name, race, classes: classes.slice(0, 3), cls: classes[0], lvl: 1, xp: 0, gold: 20, depth: 1, best: 1, pots: [3, 2], eq: {}, gen: Array(8).fill(null), mats: { ore: 4, shard: 0 }, codex: [], diff: 0, hp: 1e9, mp: 1e9 };
  P.eq.primary = mkItem('primary', 1, 0, CLASSES[classes[0]][3]); P.gen[0] = mkBag(1); P.gems = defaultGems(P); P.hot = DEFAULT_HOT(); return P; }
export function convertItem(it) { if (!it) return null; if (it.t) return it; const t = V1_SLOT[it.slot] === 'ring' ? (ACC_NECK.has(it.n) ? 'neck' : (/crit_charm|lucky_coin/.test(it.n) ? 'charm' : 'ring')) : V1_SLOT[it.slot] || 'charm';
  const o = { id: uid(), t, n: it.n, r: it.r | 0, s: { ...(it.s || {}) }, up: 0, v: it.v || 5 }; return o; }
export function migrate(P) { if (!P || typeof P !== 'object') return null; let changed = false;
  if (!P.v || P.v < 2) { changed = true; const oldEq = P.eq || {}, oldInv = P.inv || []; P.classes = [CLASSES[P.cls] ? P.cls : 'warrior']; P.cls = P.classes[0]; P.eq = {}; P.gen = Array(8).fill(null);
    const map = { Weapon: 'primary', Helmet: 'head', Chest: 'chest', Boots: 'feet', Relic: 'charm' };
    for (const [k, it] of Object.entries(oldEq)) { if (!it) continue; const n = convertItem(it); const slot = map[k] || (n.t === 'neck' ? 'neck' : n.t === 'charm' ? 'charm' : 'ring1'); if (!P.eq[slot]) P.eq[slot] = n; else oldInv.push(it); }
    const items = oldInv.map(convertItem).filter(Boolean); P.gen[0] = mkBag(1); let cap = 7 + 6; for (let i = 1; cap < items.length && i < 4; i++) { P.gen[i] = mkBag(3); cap += 9; }
    for (const it of items) if (!addItem(P, it)) P.gold += it.v || 1;
    delete P.inv; P.mats = { ore: 6, shard: 1 }; P.codex = []; P.diff = 0; P.gems = defaultGems(P); P.hot = DEFAULT_HOT(); P.v = SAVE_V; P.migratedFrom = 1; }
  // light repairs for any v2 save
  P.gen = (P.gen || []).concat(Array(8).fill(null)).slice(0, 8); P.mats = P.mats || { ore: 0, shard: 0 }; P.codex = P.codex || []; P.pots = P.pots || [0, 0]; P.diff = Math.max(0, Math.min(4, P.diff | 0));
  if (!Array.isArray(P.gems) || P.gems.length !== 8) P.gems = defaultGems(P); if (!Array.isArray(P.hot) || P.hot.length !== 10) P.hot = DEFAULT_HOT(); if (!P.race || !RACES[P.race]) P.race = 'human';
  return { P, changed }; }
// ---------- icons (our own drawn glyphs for slots without webp art) ----------
const GLYPH = {
  face: '<path d="M12 9c6-4 18-4 24 0v10c0 9-6 16-12 18-6-2-12-9-12-18z"/><path d="M16 18h6M26 18h6M20 28h8" stroke="#000a" stroke-width="2.5" fill="none"/>',
  shoulders: '<path d="M4 26c0-9 7-14 14-14h3v8c-6 0-9 3-10 8zM44 26c0-9-7-14-14-14h-3v8c6 0 9 3 10 8z"/><circle cx="12" cy="20" r="1.8" fill="#000a"/><circle cx="36" cy="20" r="1.8" fill="#000a"/>',
  back: '<path d="M16 8h16l3 6 5 26-8-3-4 4-4-4-4 4-4-4-8 3 5-26z"/><path d="M20 12h8" stroke="#000a" stroke-width="2"/>',
  arms: '<path d="M14 6h10l2 16-2 20H14l-2-20z"/><path d="M13 14h12M13 22h13M13 30h12" stroke="#000a" stroke-width="2" fill="none"/><path d="M28 10h6l2 14-2 18h-6z" opacity=".7"/>',
  wrist: '<rect x="10" y="16" width="28" height="16" rx="5"/><path d="M16 16v16M24 16v16M32 16v16" stroke="#000a" stroke-width="2"/>',
  hands: '<path d="M14 42V24l-3-9a2 2 0 0 1 4-1l3 7V8a2 2 0 0 1 4 0v11V6a2 2 0 0 1 4 0v13V8a2 2 0 0 1 4 0v13l2-6a2 2 0 0 1 4 1l-3 13v13z"/>',
  legs: '<path d="M14 6h20l-1 12-3 24h-6l-1-20-1 20h-6l-3-24z"/><path d="M15 12h18" stroke="#000a" stroke-width="2"/>',
  secondary: '<path d="M24 5l16 5v12c0 10-7 17-16 21C15 39 8 32 8 22V10z"/><path d="M24 11v26M14 21h20" stroke="#000a" stroke-width="2.5"/>',
  tome: '<rect x="10" y="7" width="26" height="34" rx="2"/><path d="M14 7v34" stroke="#000a" stroke-width="2"/><circle cx="25" cy="22" r="5" fill="none" stroke="#000a" stroke-width="2"/>',
  ranged: '<path d="M10 38L36 12M30 10h8v8" stroke="currentColor" stroke-width="4" fill="none"/><path d="M8 26c4-10 10-16 20-18" stroke="currentColor" stroke-width="2.5" fill="none" opacity=".8"/><circle cx="10" cy="38" r="4"/>',
  ammo: '<path d="M12 40L34 10M18 42L40 14M8 34L28 8" stroke="currentColor" stroke-width="2.5"/><path d="M30 8l6-2-2 6zM36 12l6-2-2 6zM24 6l6-2-2 6z"/><path d="M10 38l-4 4M16 40l-3 5M7 32l-4 3" stroke="currentColor" stroke-width="2"/>',
  bag: '<path d="M16 14c0-6 16-6 16 0" stroke="currentColor" stroke-width="3" fill="none"/><path d="M10 18h28l3 22c0 3-2 4-4 4H11c-2 0-4-1-4-4z"/><path d="M18 26h12" stroke="#000a" stroke-width="2.5"/>',
};
export const SLOT_GLYPH = { ...GLYPH, head: '<path d="M10 28c0-12 6-19 14-19s14 7 14 19v6H10z"/><path d="M10 28h28" stroke="#000a" stroke-width="2"/>', chest: '<path d="M12 8l7 3h10l7-3 6 8-5 6v20H11V22l-5-6z"/>', feet: '<path d="M14 6h10v24l14 4v8H10z"/>', neck: '<path d="M12 8c0 14 6 20 12 20s12-6 12-20" stroke="currentColor" stroke-width="2.5" fill="none"/><path d="M24 26l6 8-6 8-6-8z"/>', ring: '<circle cx="24" cy="28" r="11" fill="none" stroke="currentColor" stroke-width="4"/><path d="M24 8l5 6-5 5-5-5z"/>', charm: '<path d="M24 6l14 18-14 18-14-18z"/><circle cx="24" cy="24" r="5" fill="#000a"/>', primary: '<path d="M38 6l4 4-22 24-4-4zM14 30l4 4-6 6-4-4z"/><path d="M12 28l8 8" stroke="currentColor" stroke-width="3"/>' };
export function svgIcon(kind, col) { return `<svg viewBox="0 0 48 48" class="glyph" style="color:${col}" fill="currentColor">${SLOT_GLYPH[kind] || GLYPH.bag}</svg>`; }
export function iconHtml(it) { if (!it) return ''; const col = RAR[it.r || 0][1];
  if (WEBP.has(it.n)) return `<img src="a/g/${it.n}.webp" alt="" draggable="false">`;
  const kind = it.t === 'bag' ? 'bag' : (it.t === 'secondary' && /tome|ward/.test(it.n)) ? 'tome' : it.t; return svgIcon(kind, col); }
const STN = { atk: 'DMG', def: 'AC', hp: 'HP', mp: 'MANA', crit: 'CRIT', spd: 'HASTE' };
export function tooltipHtml(P, it, ref) { if (!it) return ''; const col = RAR[it.r || 0][1];
  if (it.t === 'bag') { const used = it.items.filter(Boolean).length; return `<div class="tt-n" style="color:${col}">${it.n}</div><div class="tt-l">CONTAINER</div><div>Capacity: ${it.size} slots <span class="dim">(${used} used)</span></div><div>Holds: anything but other containers</div><div>Weight ${iweight(it)}</div><div class="dim">Right-click or double-click to open.</div>`; }
  const s = istats(it), type = it.t, lbl = Object.entries(EQ_SLOTS).filter(([, v]) => v[1] === type).map(([, v]) => v[0].toUpperCase())[0] || type.toUpperCase();
  const rows = Object.entries(s).map(([k, v]) => `<span class="tt-s"><b>${STN[k] || k.toUpperCase()}:</b> ${k === 'crit' || k === 'spd' ? '+' + v + '%' : (k === 'hp' || k === 'mp' ? '+' : '') + v}</span>`).join('');
  const e = it.fx && EFFECTS[it.fx], cmp = ref && !ref.startsWith('eq:') ? compareLine(P, it) : '';
  return `<div class="tt-n" style="color:${col}">${itemName(it)}</div><div class="tt-l">${RAR[it.r][0].toUpperCase()} ${it.up ? '· FORGED +' + it.up : ''}</div><div>Slot: ${lbl}</div><div class="tt-g">${rows}</div>${e ? `<div class="tt-fx">${e.t === 'proc' ? 'Proc' : 'Focus'}: ${e.n}<br><span class="dim">${e.d}</span></div>` : ''}<div>Weight ${iweight(it)} · Upgrade ${it.up || 0}/10</div><div>Suits: ${suits(it)}</div><div>Races: ALL</div>${cmp}<div class="dim">Scrap: ${scrapValue(it).gold} gold, ${scrapValue(it).ore} ore</div>`; }
function compareLine(P, it) { const slot = Object.keys(EQ_SLOTS).find(k => EQ_SLOTS[k][1] === it.t && P.eq[k]) ; if (!slot) return `<div class="tt-up">Empty slot: equipping is an upgrade</div>`; const d = Math.round(iscore(it) - iscore(P.eq[slot])); return `<div class="${d >= 0 ? 'tt-up' : 'tt-dn'}">${d >= 0 ? '▲' : '▼'} ${Math.abs(d)} vs equipped ${itemName(P.eq[slot])}</div>`; }
