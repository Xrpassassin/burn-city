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
assert.ok(migrate({ v: 99 }).readOnly); assert.equal(migrate(null).v, 1);
console.log('wilds rules OK', JSON.stringify({ lv: G.state.player.lv, xp: G.state.player.xp, roster: G.state.roster.map(c => c.sp + ' L' + c.lv), rounds }));
