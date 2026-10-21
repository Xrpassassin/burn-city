// node tools/wilds/rules.test.mjs — unit checks for client/js/wilds-rules.js (no browser needed)
import fs from 'fs'; import assert from 'assert';
import { createGame, migrate, SAVE_KEY } from '../../client/js/wilds-rules.js';
const rd = f => JSON.parse(fs.readFileSync(new URL('../../client/data/wilds/' + f, import.meta.url)));
const data = { creatures: rd('creatures.json'), quests: rd('quests.json'), abilities: rd('abilities.json') };
const mem = () => { const m = {}; return { getItem: k => m[k] ?? null, setItem: (k, v) => { m[k] = String(v); }, m }; };
let seed = 7; const rng = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const st = mem(); let G = createGame(data, { storage: st, rng });
// quest 1
assert.equal(G.canAccept('a_gentle_signal'), false, 'q2 locked before q1');
G.discover('fernway_marker_1');
assert.ok(G.accept('first_footfall').ok);
assert.equal(G.questState('first_footfall').prog.follow_markers, 1, 'marker found before accept counts');
G.discover('fernway_marker_1'); assert.equal(G.questState('first_footfall').prog.follow_markers, 1, 'no double count');
G.discover('fernway_marker_2'); G.discover('fernway_marker_3');
assert.equal(G.claim('first_footfall').ok, false, 'not ready without inspect');
const w = G.wild('mosskit', 2); G.inspect(w);
assert.equal(G.questState('first_footfall').st, 'ready');
const r1 = G.claim('first_footfall'); assert.ok(r1.ok); assert.equal(G.state.items.starter_binding_charm, 1);
assert.equal(G.claim('first_footfall').ok, false, 'second claim refused');
// reload from storage: still done, no re-claim
G = createGame(data, { storage: st, rng }); assert.equal(G.claim('first_footfall').reason, 'already claimed'); assert.equal(G.state.items.starter_binding_charm, 1);
assert.ok(G.accept('a_gentle_signal').ok);
// encounter: wear down then bind
let bound = false, rounds = 0, E;
for (let tries = 0; tries < 20 && !bound; tries++) {
  const c = G.wild('mosskit', 2); E = G.startEncounter(c);
  const o0 = G.bindOdds(E); assert.ok(o0.pct >= 5 && o0.pct <= 92 && o0.mods.length >= 2);
  while (!E.over && rounds < 400) { rounds++; const o = G.bindOdds(E); const L = o.pct > 55 || E.foe.hp / E.foe.hpMax < .35 ? G.act(E, 'bind') : G.act(E, 'move', E.us.moves[0]); if (L.some(l => l.fx === 'bindfail')) assert.ok(L.find(l => l.fx === 'bindfail').why.length > 0, 'failure has reasons'); }
  if (E.over.result === 'bound') bound = true; if (E.over.result === 'lost') G.restAll();
}
assert.ok(bound, 'bound a mosskit'); assert.equal(G.state.roster.length, 1); assert.ok(G.activeComp());
assert.equal(G.questState('a_gentle_signal').st, 'ready');
const lv0 = G.activeComp().lv, x0 = G.activeComp().xp; const r2 = G.claim('a_gentle_signal'); assert.ok(r2.ok); assert.equal(r2.rewards.companionXp, 80);
assert.ok(G.activeComp().lv > lv0 || G.activeComp().xp > x0, 'companion got XP'); assert.equal(G.claim('a_gentle_signal').ok, false);
assert.equal(G.state.items.field_bait, 1);
// calm odds bounded
const co = G.calmOdds(G.wild('shardmole', 9)); assert.ok(co.pct >= 10 && co.pct <= 90);
// migration
const m = migrate({ v: 1, player: { lv: 3 }, roster: [{ uid: 'x', sp: 'rillfin', lv: 2 }, null] }); assert.equal(m.roster.length, 1); assert.equal(m.active, 'x'); assert.ok(m.quests && m.items.trail_sigil);
assert.ok(migrate({ v: 99 }).readOnly); assert.equal(migrate(null).v, 2);
// v1 -> v2 (deep area): everything kept, zones.glassroot added; a v2 save round-trips
{ const v1 = { v: 1, player: { lv: 4, xp: 30 }, roster: [{ uid: 'a', sp: 'mosskit', lv: 3 }], quests: { first_footfall: { st: 'done', prog: {} } }, found: { fernway_marker_1: 1 }, flags: { met_trail_warden: true } };
  const m2 = migrate(v1); assert.equal(m2.v, 2); assert.equal(m2.player.lv, 4); assert.equal(m2.quests.first_footfall.st, 'done'); assert.ok(m2.found.fernway_marker_1 && m2.flags.met_trail_warden);
  assert.deepEqual(m2.zones.glassroot, { visits: 0, picked: {} });
  m2.zones.glassroot.visits = 2; m2.zones.glassroot.picked.tag_a = 1; const m3 = migrate(JSON.parse(JSON.stringify(m2))); assert.equal(m3.zones.glassroot.visits, 2); assert.equal(m3.zones.glassroot.picked.tag_a, 1); }
// deep quests: each survey tag counts for its own objective only (shared target), clues stack, territorial resolution
assert.ok(G.accept('tags_in_the_roots').ok, 'Orrick quest unlocks after A Gentle Signal');
G.progress('collect', 'survey_tag', { obj: 'tag_a' }); let tq = G.questState('tags_in_the_roots');
assert.equal(tq.prog.tag_a, 1); assert.ok(!tq.prog.tag_b && !tq.prog.tag_c, 'one tag fills one objective');
G.progress('collect', 'survey_tag', { obj: 'tag_a' }); assert.ok(!G.questState('tags_in_the_roots').prog.tag_b, 'same tag twice does not leak');
G.progress('collect', 'survey_tag', { obj: 'tag_b' }); G.progress('collect', 'survey_tag', { obj: 'tag_c' }); assert.equal(G.questState('tags_in_the_roots').st, 'ready');
assert.ok(G.claim('tags_in_the_roots').ok); assert.ok(G.accept('the_missing_tinker').ok);
for (let i = 0; i < 3; i++) G.progress('interact', 'tinker_clue', {}); G.progress('encounter_resolution', 'territorial_creature', { sp: 'briarback', how: 'won' });
assert.equal(G.questState('the_missing_tinker').st, 'ready'); assert.ok(G.claim('the_missing_tinker').ok); assert.ok(G.state.flags.field_tinker_rescued);
console.log('wilds rules OK', JSON.stringify({ lv: G.state.player.lv, xp: G.state.player.xp, roster: G.state.roster.map(c => c.sp + ' L' + c.lv), rounds }));
