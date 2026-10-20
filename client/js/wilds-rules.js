// BURN City: The Wilds — game rules (no three.js, no DOM). Pure state + rules so they can be tested in node.
// Everything here is LOCAL-ONLY for milestone 1: the save lives in this browser's localStorage, nothing is sent to the server,
// so none of it is competitive or tradeable yet. Quest rewards are idempotent (a quest moves ready -> done exactly once).
export const SAVE_KEY = 'bcWilds';
export const SAVE_VERSION = 1;

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const today = () => new Date().toISOString().slice(0, 10);

export function playerNeed(lv) { return Math.round(100 * Math.pow(lv, 1.35)); }
export function compNeed(lv) { return Math.round(40 * Math.pow(lv, 1.4)); }
export const MAX_LEVEL = 30, ROSTER_MAX = 12;

export function freshSave() {
  return { v: SAVE_VERSION, created: Date.now(), player: { lv: 1, xp: 0, hp: null }, roster: [], active: null, uidN: 1,
    items: { trail_sigil: 1 }, flags: {}, quests: {}, found: {}, seen: {}, recent: { day: today(), n: {} }, bankCompXp: 0, stats: { binds: 0, calms: 0, wins: 0 } };
}
// tolerant loader: unknown/missing fields get defaults; a newer save than this code understands is kept untouched (read-only)
export function migrate(raw) {
  const f = freshSave();
  if (!raw || typeof raw !== 'object') return f;
  if (raw.v > SAVE_VERSION) return Object.assign(f, { readOnly: true, future: raw });
  const s = Object.assign(f, raw);
  s.player = Object.assign(freshSave().player, raw.player || {});
  for (const k of ['items', 'flags', 'quests', 'found', 'seen', 'stats']) s[k] = Object.assign({}, f[k], raw[k] || {});
  s.items.trail_sigil = 1;
  s.roster = Array.isArray(raw.roster) ? raw.roster.filter(c => c && c.sp && c.uid) : [];
  if (!s.roster.some(c => c.uid === s.active)) s.active = s.roster[0] ? s.roster[0].uid : null;
  s.recent = raw.recent && raw.recent.day === today() ? raw.recent : { day: today(), n: {} };
  s.v = SAVE_VERSION;
  return s;
}

export function createGame(data, opts = {}) {
  const store = opts.storage || (typeof localStorage !== 'undefined' ? localStorage : null);
  const rnd = opts.rng || Math.random;
  const SP = {}; for (const c of data.creatures.creatures) SP[c.id] = c;
  const AB = data.abilities.abilities, IT = data.abilities.items, MU = data.abilities.matchups, TEMP = data.abilities.temperament;
  const QS = {}; for (const q of data.quests.quests) QS[q.id] = q;
  let S;
  try { S = migrate(store && JSON.parse(store.getItem(SAVE_KEY) || 'null')); } catch (e) { S = freshSave(); }
  const listeners = new Set();
  const emit = (type, d) => { for (const f of listeners) try { f(type, d); } catch (e) { console.warn('wilds', e); } };
  function save() { if (S.readOnly || !store) return; try { store.setItem(SAVE_KEY, JSON.stringify(S)); } catch (e) { } }

  // ---------------------------------------------------------------- stats
  const player = () => S.player;
  function playerStats(lv = S.player.lv) { return { hp: 52 + 10 * (lv - 1), power: 8 + 1.5 * lv, guard: 6 + lv, speed: 7 + .5 * lv, focus: 5 + lv, insight: 2 + lv }; }
  function stats(c) { const b = SP[c.sp].baseStats, k = c.lv - 1; return { hp: Math.round(b.hp * (1 + .15 * k)), power: b.power * (1 + .12 * k), guard: b.guard * (1 + .12 * k), speed: b.speed * (1 + .1 * k), focus: b.focus * (1 + .1 * k) }; }
  function wild(sp, lv) { const c = { uid: 'w' + Math.floor(rnd() * 1e9), sp, lv, xp: 0, bond: 0 }; c.hp = stats(c).hp; return c; }
  function rollLevel(sp, bandMax = 5) { const r = SP[sp].levelRange, hi = Math.min(r[1], Math.max(r[0], bandMax)); return r[0] + Math.floor(rnd() * (hi - r[0] + 1)); }
  const activeComp = () => S.roster.find(c => c.uid === S.active) || null;
  if (S.player.hp == null) S.player.hp = playerStats().hp;

  function mult(atkAff, defAffs) { if (!atkAff || atkAff === 'None') return 1; let m = 1; for (const d of defAffs) { if ((MU[atkAff] || []).includes(d)) m *= 1.25; else if ((MU[d] || []).includes(atkAff)) m *= .8; } return m; }

  // ---------------------------------------------------------------- XP
  function recentFactor(sp) { if (S.recent.day !== today()) S.recent = { day: today(), n: {} }; const n = S.recent.n[sp] || 0; return Math.max(.25, 1 - .2 * n); }
  function bumpRecent(sp) { S.recent.n[sp] = (S.recent.n[sp] || 0) + 1; }
  function givePlayerXp(n) {
    n = Math.round(n); if (n <= 0) return [];
    const ups = []; S.player.xp += n;
    while (S.player.lv < MAX_LEVEL && S.player.xp >= playerNeed(S.player.lv)) { S.player.xp -= playerNeed(S.player.lv); S.player.lv++; ups.push(S.player.lv); S.player.hp = playerStats().hp; }
    emit('xp', { who: 'player', n, ups }); return ups;
  }
  function giveCompXp(c, n) {
    n = Math.round(n); if (!c || n <= 0) return [];
    const ups = []; c.xp += n;
    while (c.lv < MAX_LEVEL && c.xp >= compNeed(c.lv)) { c.xp -= compNeed(c.lv); c.lv++; ups.push(c.lv); c.hp = stats(c).hp; }
    emit('xp', { who: c.uid, n, ups }); return ups;
  }

  // ---------------------------------------------------------------- quests
  function questState(id) { return S.quests[id] || null; }
  function canAccept(id) { const q = QS[id]; if (!q || S.quests[id]) return false; return (q.prerequisites || []).every(p => S.quests[p] && S.quests[p].st === 'done'); }
  function matches(obj, type, target, meta) {
    if (obj.type !== type) return false;
    if (obj.target === target) return true;
    if (obj.target === 'wild_creature' && type === 'inspect') return true;
    if (obj.target === 'mosskit_or_rillfin') return meta && (meta.sp === 'mosskit' || meta.sp === 'rillfin') && (meta.how === 'calm' || meta.how === 'bind');
    return false;
  }
  function checkReady(id) { const q = QS[id], st = S.quests[id]; if (!st || st.st !== 'active') return; if (q.objectives.every(o => (st.prog[o.id] || 0) >= o.count)) { st.st = 'ready'; emit('quest', { id, st: 'ready' }); } }
  function accept(id) {
    if (!canAccept(id)) return { ok: false, reason: S.quests[id] ? 'already taken' : 'not available yet' };
    const q = QS[id]; S.quests[id] = { st: 'active', prog: {}, at: Date.now() };
    // things you already did before taking the quest still count (markers found on the way in)
    for (const o of q.objectives) if (o.type === 'discover') S.quests[id].prog[o.id] = Math.min(o.count, Object.keys(S.found).filter(k => k.startsWith(o.target)).length);
    checkReady(id); save(); emit('quest', { id, st: S.quests[id].st }); return { ok: true };
  }
  function progress(type, target, meta) {
    let changed = false;
    for (const id in S.quests) { const st = S.quests[id]; if (st.st !== 'active') continue;
      for (const o of QS[id].objectives) if (matches(o, type, target, meta) && (st.prog[o.id] || 0) < o.count) { st.prog[o.id] = (st.prog[o.id] || 0) + 1; changed = true; emit('objective', { id, obj: o.id, n: st.prog[o.id], of: o.count }); }
      checkReady(id); }
    if (changed) save(); return changed;
  }
  // idempotent claim: the state flips to 'done' and is saved BEFORE rewards are handed out, and only from 'ready'
  function claim(id) {
    const st = S.quests[id], q = QS[id];
    if (!st) return { ok: false, reason: 'not started' };
    if (st.st === 'done') return { ok: false, reason: 'already claimed' };
    if (st.st !== 'ready') return { ok: false, reason: 'objectives not finished' };
    st.st = 'done'; st.claimedAt = Date.now();
    const r = q.rewards || {}, out = { playerXp: r.playerXp || 0, companionXp: r.companionXp || 0, items: r.items || [], ups: [] };
    for (const it of out.items) S.items[it] = (S.items[it] || 0) + 1;
    for (const fl of r.flags || []) S.flags[fl] = true;
    out.ups = givePlayerXp(out.playerXp);
    if (out.companionXp) { const c = activeComp(); if (c) out.compUps = giveCompXp(c, out.companionXp); else { S.bankCompXp += out.companionXp; out.banked = true; } }
    save(); emit('quest', { id, st: 'done' }); return { ok: true, rewards: out };
  }
  function discover(markerId) { if (S.found[markerId]) return false; S.found[markerId] = Date.now(); givePlayerXp(10); progress('discover', markerId.replace(/_\d+$/, ''), {}); save(); return true; }

  // ---------------------------------------------------------------- inspect / calm
  function threat(c) { const ref = activeComp() ? activeComp().lv : S.player.lv, d = c.lv - ref; return d <= -2 ? 'Low' : d <= 1 ? 'Even' : d <= 3 ? 'High' : 'Severe'; }
  function inspect(c) { const first = !S.seen[c.sp]; S.seen[c.sp] = (S.seen[c.sp] || 0) + 1; progress('inspect', 'wild_creature', { sp: c.sp }); save(); return { first, def: SP[c.sp], threat: threat(c), stats: stats(c) }; }
  function calmOdds(c) {
    const t = TEMP[SP[c.sp].temperament] || {}, ref = activeComp() ? activeComp().lv : S.player.lv, mods = [];
    mods.push({ label: 'Base', pp: 40 });
    if (t.calm) mods.push({ label: SP[c.sp].temperament[0].toUpperCase() + SP[c.sp].temperament.slice(1) + ' temperament', pp: t.calm });
    mods.push({ label: 'Your Insight', pp: Math.min(20, 2 * playerStats().insight) });
    const gap = c.lv - ref; if (gap > 0) mods.push({ label: 'It outlevels you (+' + gap + ')', pp: -5 * gap });
    const comp = activeComp(); if (comp && SP[comp.sp].abilities.includes('soothing_call')) mods.push({ label: comp.nick || SP[comp.sp].name + ' hums along', pp: 8 });
    const pct = clamp(Math.round(mods.reduce((a, m) => a + m.pp, 0)), 10, 90); return { pct, mods };
  }
  function calm(c) {
    const o = calmOdds(c), roll = Math.floor(rnd() * 100), ok = roll < o.pct;
    if (ok) { const xp = 12 * c.lv * recentFactor(c.sp); bumpRecent(c.sp); S.stats.calms++; const ups = givePlayerXp(xp); const comp = activeComp(); if (comp) giveCompXp(comp, xp * .5); progress('encounter_resolution', c.sp, { sp: c.sp, how: 'calm' }); save(); return { ok, roll, pct: o.pct, xp: Math.round(xp), ups }; }
    const t = TEMP[SP[c.sp].temperament] || {}; save();
    return { ok, roll, pct: o.pct, then: t.flees ? 'flee' : 'fight', reason: reasonsFrom(o.mods) };
  }
  function reasonsFrom(mods) { const neg = mods.filter(m => m.pp < 0).sort((a, b) => a.pp - b.pp).map(m => m.label); return neg.length ? neg.slice(0, 2) : ['Bad luck this time']; }

  // ---------------------------------------------------------------- encounters (turn based)
  function fighterFromComp(c) { const s = stats(c); return { kind: 'comp', ref: c, name: c.nick || SP[c.sp].name, aff: SP[c.sp].affinity, lv: c.lv, hpMax: s.hp, get hp() { return c.hp; }, set hp(v) { c.hp = v; }, s, moves: SP[c.sp].abilities.slice(), st: {} }; }
  function fighterPlayer() { const s = playerStats(); return { kind: 'player', name: 'You', aff: [], lv: S.player.lv, hpMax: s.hp, get hp() { return S.player.hp; }, set hp(v) { S.player.hp = v; }, s, moves: ['staff_strike', 'soothe'], st: {} }; }
  function startEncounter(c, o = {}) {
    const comp = activeComp(); const us = comp && comp.hp > 0 ? fighterFromComp(comp) : fighterPlayer();
    const s = stats(c); const foe = { kind: 'wild', ref: c, name: SP[c.sp].name, aff: SP[c.sp].affinity, lv: c.lv, hpMax: s.hp, get hp() { return c.hp; }, set hp(v) { c.hp = v; }, s, moves: SP[c.sp].abilities.slice(), st: {} };
    const E = { c, foe, us, turn: 1, calm: o.calm ? 3 : 0, calmLock: !!o.calm, bait: false, charmUsed: false, fails: 0, over: null, log: [], kindled: false };
    if (!o.calm) E.intent = pickIntent(E);
    return E;
  }
  function pickIntent(E) {
    const f = E.foe, hpf = f.hp / f.hpMax, opts = f.moves.map(id => AB[id]).filter(Boolean);
    let pick = opts.find(a => a.kind === 'guard' && hpf < .45 && !f.st.guarded && rnd() < .55);
    if (!pick) { const atk = opts.filter(a => a.kind === 'attack'); pick = atk.length ? atk[Math.floor(rnd() * atk.length)] : opts[0]; }
    const id = Object.keys(AB).find(k => AB[k] === pick);
    return { id, name: pick.name, kind: pick.kind, tell: pick.kind === 'guard' ? 'is bracing itself' : pick.power >= 10 ? 'is winding up something big' : 'is sizing you up' };
  }
  function bindOdds(E) {
    const c = E.c, def = SP[c.sp], hpf = E.foe.hp / E.foe.hpMax, mods = [];
    mods.push({ label: def.rarity[0].toUpperCase() + def.rarity.slice(1) + ' creature', pp: data.abilities.rarityBindBase[def.rarity] || 20 });
    if (hpf > .7 && !E.calmLock) mods.push({ label: 'Still too healthy (' + Math.round(hpf * 100) + '% HP)', pp: -18 });
    else mods.push({ label: 'Worn down (' + Math.round(hpf * 100) + '% HP)', pp: Math.round((1 - hpf) * 35) });
    const t = TEMP[def.temperament] || {}; if (t.bind) mods.push({ label: def.temperament[0].toUpperCase() + def.temperament.slice(1) + ' temperament', pp: t.bind });
    if (E.foe.st.root) mods.push({ label: 'Rooted', pp: 10 });
    if (E.foe.st.daze) mods.push({ label: 'Dazed', pp: 6 });
    if (E.calm) mods.push({ label: E.calmLock ? 'Calmed (trusts you)' : 'Settled ×' + E.calm, pp: E.calmLock ? 22 : 7 * E.calm });
    if (E.bait) mods.push({ label: 'Field Bait', pp: 10 });
    if ((S.items.starter_binding_charm || 0) > 0 && !E.charmUsed) mods.push({ label: 'Starter Binding Charm (used on attempt)', pp: 12 });
    const ins = Math.min(16, 2 * (S.player.lv - 1)); if (ins) mods.push({ label: 'Your Insight (Lv ' + S.player.lv + ')', pp: ins });
    const ref = activeComp() ? activeComp().lv : S.player.lv, gap = c.lv - ref; if (gap > 0) mods.push({ label: 'Level gap (+' + gap + ')', pp: -4 * gap });
    if (E.fails) mods.push({ label: 'Wary after ' + E.fails + ' failed tr' + (E.fails > 1 ? 'ies' : 'y'), pp: -5 * E.fails });
    if (S.roster.length >= ROSTER_MAX) return { pct: 0, mods: mods.concat([{ label: 'Roster full (' + ROSTER_MAX + ')', pp: -100 }]), blocked: 'Your roster is full' };
    const pct = clamp(Math.round(mods.reduce((a, m) => a + m.pp, 0)), 5, 92); return { pct, mods };
  }
  function dmgCalc(att, def, ab, E) {
    const aff = ab.affinity, m = mult(aff, def.aff); let k = (.85 + rnd() * .15) * m;
    if (att.st.daze) k *= .6; if (att.kind === 'wild') k *= .65; if (def.st.guarded) k *= .55;
    if (att.kind === 'wild' && E && aff === 'Ember' && !E.kindled && SP[att.ref.sp].passiveTrait.startsWith('Kindle')) { k *= 1.2; E.kindled = true; }
    return { n: Math.max(1, Math.round(att.s.power * ab.power / (4 + def.s.guard * .4) * k)), m };
  }
  function doMove(E, who, tgt, id, L) {
    const ab = AB[id]; if (!ab) return;
    const wasDazed = who.st.daze;
    if (ab.kind === 'attack') {
      if (rnd() > ab.accuracy) { L.push({ t: who.name + ' used ' + ab.name + ' — missed!', who: who.kind, fx: 'miss', aff: ab.affinity }); }
      else { const d = dmgCalc(who, tgt, ab, E); tgt.hp = Math.max(0, tgt.hp - d.n);
        L.push({ t: who.name + ' used ' + ab.name + ': ' + d.n + ' damage' + (d.m > 1.01 ? ' (strong!)' : d.m < .99 ? ' (resisted)' : ''), who: who.kind, fx: 'hit', aff: ab.affinity, dmg: d.n, tgt: tgt.kind });
        if (ab.status && tgt.hp > 0 && rnd() < ab.statusChance && !tgt.st[ab.status]) { tgt.st[ab.status] = data.abilities.statuses[ab.status].turns; L.push({ t: tgt.name + ' is ' + data.abilities.statuses[ab.status].name + (ab.status === 'daze' ? 'd' : ab.status === 'root' ? 'ed' : 'ing') + '!', fx: 'status' }); } }
    } else if (ab.kind === 'guard') { who.st.guarded = data.abilities.statuses.guarded.turns; if (ab.cleanse) delete who.st.burn; if (ab.heal) who.hp = Math.min(who.hpMax, who.hp + Math.round(who.hpMax * ab.heal)); L.push({ t: who.name + ' used ' + ab.name + ' — Guarded.', who: who.kind, fx: 'guard', aff: ab.affinity }); }
    else if (ab.kind === 'soothe') {
      if (who.kind === 'wild') { L.push({ t: who.name + ' hums nervously.', who: who.kind }); }
      else { E.calm = Math.min(3, E.calm + 1); if (ab.heal) who.hp = Math.min(who.hpMax, who.hp + Math.round(who.hpMax * ab.heal)); L.push({ t: who.name + ' used ' + ab.name + ' — the ' + E.foe.name + ' settles a little (bind odds up).', who: who.kind, fx: 'soothe', aff: 'Verdant' }); }
    }
    if (wasDazed) delete who.st.daze;
  }
  function tickStatus(f, L) {
    if (f.st.burn && f.hp > 0) { const n = Math.max(1, Math.round(f.hpMax * .06)); f.hp = Math.max(0, f.hp - n); L.push({ t: f.name + ' takes ' + n + ' burn damage.', fx: 'burn', tgt: f.kind, dmg: n }); }
    for (const k of ['burn', 'root', 'guarded']) if (f.st[k] && --f.st[k] <= 0) delete f.st[k];
  }
  function enemyTurn(E, L) {
    if (E.over || E.calmLock) return;
    const it = E.intent || pickIntent(E); doMove(E, E.foe, E.us, it.id, L);
    if (E.us.hp <= 0) return usDown(E, L);
  }
  function usDown(E, L) {
    if (E.us.kind === 'comp') { L.push({ t: E.us.name + ' is exhausted and steps back. You take over.', fx: 'down' }); E.us = fighterPlayer(); if (E.us.hp <= 0) E.us.hp = 1; return; }
    E.over = { result: 'lost' }; L.push({ t: 'You black out… Mara finds you and carries you back to her camp.', fx: 'down' });
    S.player.hp = playerStats().hp; for (const c of S.roster) c.hp = stats(c).hp; save();
  }
  function endRound(E, L) {
    if (E.over) return;
    tickStatus(E.foe, L); tickStatus(E.us, L);
    if (E.foe.hp <= 0) return win(E, L);
    if (E.us.hp <= 0) usDown(E, L);
    if (!E.over) { E.turn++; if (!E.calmLock) E.intent = pickIntent(E); }
  }
  function win(E, L) {
    const def = SP[E.c.sp], xp = 18 * E.c.lv * (data.abilities.rarityXp[def.rarity] || 1) * recentFactor(E.c.sp); bumpRecent(E.c.sp); S.stats.wins++;
    const ups = givePlayerXp(xp); const comp = activeComp(); let cups = []; if (comp) { cups = giveCompXp(comp, xp * .7); comp.bond = Math.min(10, (comp.bond || 0) + .25); }
    E.over = { result: 'won', xp: Math.round(xp), ups, cups }; L.push({ t: 'The ' + def.name + ' retreats into the brush. +' + Math.round(xp) + ' XP', fx: 'win' }); save();
  }
  // one player action -> resolves the round. Returns the round's log lines for the UI to animate.
  function act(E, action, arg) {
    if (E.over) return [];
    const L = []; const foeFirst = !E.calmLock && E.foe.s.speed > E.us.s.speed + 2 && action !== 'flee' && action !== 'bind';
    if (action === 'move') {
      if (!E.us.moves.includes(arg) && !(arg === 'brace')) return [];
      if (E.calmLock && AB[arg].kind === 'attack') { E.calmLock = false; E.calm = 0; L.push({ t: 'You broke its trust — the ' + E.foe.name + ' bristles!', fx: 'status' }); E.intent = pickIntent(E); }
      if (foeFirst) { enemyTurn(E, L); if (E.over) return E.log = L; }
      doMove(E, E.us, E.foe, arg, L); if (E.foe.hp <= 0) { win(E, L); return E.log = L; }
      if (!foeFirst) enemyTurn(E, L);
      endRound(E, L);
    } else if (action === 'bait') {
      if (!(S.items.field_bait > 0) || E.bait) return [];
      S.items.field_bait--; E.bait = true; E.calm = Math.min(3, E.calm + 1); L.push({ t: 'You toss Field Bait. The ' + E.foe.name + ' sniffs at it (bind odds up).', fx: 'soothe', aff: 'Verdant' });
      enemyTurn(E, L); endRound(E, L);
    } else if (action === 'bind') {
      const o = bindOdds(E); if (o.blocked) { L.push({ t: o.blocked + ' — release one first.', fx: 'status' }); return E.log = L; }
      const charm = (S.items.starter_binding_charm || 0) > 0 && !E.charmUsed; if (charm) { S.items.starter_binding_charm--; E.charmUsed = true; }
      const roll = Math.floor(rnd() * 100), ok = roll < o.pct;
      if (ok) {
        const c = E.c, def = SP[c.sp]; c.uid = 'c' + (S.uidN++) + '_' + Date.now().toString(36); c.hp = stats(c).hp; c.bond = 1; c.caught = Date.now(); c.origin = 'fernway_verge'; c.xp = c.xp || 0;
        S.roster.push(c); if (!S.active) S.active = c.uid; if (S.bankCompXp && S.active === c.uid) { giveCompXp(c, S.bankCompXp); S.bankCompXp = 0; }
        S.stats.binds++; const xp = 25 * c.lv * recentFactor(c.sp); bumpRecent(c.sp); const ups = givePlayerXp(xp);
        progress('encounter_resolution', c.sp, { sp: c.sp, how: 'bind' });
        E.over = { result: 'bound', roll, pct: o.pct, xp: Math.round(xp), ups, uid: c.uid }; L.push({ t: 'Bound! ' + def.name + ' joins your roster. (rolled ' + roll + ' under ' + o.pct + '%) +' + Math.round(xp) + ' XP', fx: 'bind' }); save(); return E.log = L;
      }
      E.fails++; const why = reasonsFrom(o.mods); E.lastFail = { roll, pct: o.pct, why };
      L.push({ t: 'The bind slipped (rolled ' + roll + ', needed under ' + o.pct + '%). ' + why.join(' · '), fx: 'bindfail', why });
      if (E.fails >= 3) { E.over = { result: 'escaped' }; L.push({ t: 'The ' + E.foe.name + ' breaks free and bolts into the ferns.', fx: 'flee' }); save(); return E.log = L; }
      if (E.calmLock) { E.calmLock = false; E.calm = 1; E.intent = pickIntent(E); L.push({ t: 'Startled, it turns on you!', fx: 'status' }); }
      enemyTurn(E, L); endRound(E, L);
    } else if (action === 'flee') {
      if (E.calmLock) { E.over = { result: 'left' }; L.push({ t: 'You let it wander off peacefully.' }); return E.log = L; }
      if (E.us.st.root) { L.push({ t: 'You are Rooted and cannot get away!', fx: 'status' }); enemyTurn(E, L); endRound(E, L); return E.log = L; }
      let p = 65 + (E.us.s.speed - E.foe.s.speed) * 3; if (activeComp() && activeComp().sp === 'mosskit') p += 10; p = clamp(Math.round(p), 25, 95);
      const roll = Math.floor(rnd() * 100); if (roll < p) { E.over = { result: 'fled' }; L.push({ t: 'You slip away along the trail.', fx: 'flee' }); save(); return E.log = L; }
      L.push({ t: 'It cuts you off! (escape ' + p + '%)', fx: 'status' }); enemyTurn(E, L); endRound(E, L);
    }
    save(); return E.log = L;
  }

  // ---------------------------------------------------------------- roster
  function setActive(uid) { if (!S.roster.some(c => c.uid === uid)) return false; S.active = uid; const c = activeComp(); if (S.bankCompXp) { giveCompXp(c, S.bankCompXp); S.bankCompXp = 0; } save(); emit('roster', {}); return true; }
  function release(uid) { const i = S.roster.findIndex(c => c.uid === uid); if (i < 0) return false; S.roster.splice(i, 1); if (S.active === uid) S.active = S.roster[0] ? S.roster[0].uid : null; save(); emit('roster', {}); return true; }
  function restAll() { S.player.hp = playerStats().hp; for (const c of S.roster) c.hp = stats(c).hp; save(); }
  function regen(dt) { const ps = playerStats(); if (S.player.hp < ps.hp) S.player.hp = Math.min(ps.hp, S.player.hp + ps.hp * .01 * dt); for (const c of S.roster) { const h = stats(c).hp; if (c.hp < h) c.hp = Math.min(h, c.hp + h * .01 * dt); } }
  function reset() { S = freshSave(); S.player.hp = playerStats().hp; save(); emit('reset', {}); }

  return {
    get state() { return S; }, SP, AB, IT, QS, on: f => (listeners.add(f), () => listeners.delete(f)), save,
    playerStats, stats, wild, rollLevel, activeComp, threat, inspect, calmOdds, calm, startEncounter, bindOdds, act,
    accept, canAccept, questState, claim, progress, discover, setActive, release, restAll, regen, reset, givePlayerXp, giveCompXp,
    playerNeed, compNeed, mult
  };
}
