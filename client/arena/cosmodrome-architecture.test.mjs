import assert from 'node:assert/strict';
import { createRequire } from 'module';
import { planCosmodromeArchitecture, planCounts, INDOOR_ZONES } from './cosmodrome-architecture-plan.mjs';

const require = createRequire(import.meta.url);
const { Room } = require('../../server/game');
const Cod = require('../../server/cod');

const room = new Room('arch-cosmo', 'zombie');
room.mapId = 'cosmodrome';
room.reset();
Cod.bind(room);
const layout = Cod.layout();
assert.equal(layout.kind, 'cosmodrome');
assert.equal(layout.doors.length, 11);
assert.equal(layout.gw, 72);
assert.equal(layout.gh, 56);

const before = JSON.stringify(layout);
const full = planCosmodromeArchitecture(layout, { low: false });
const thin = planCosmodromeArchitecture(layout, { low: true });
assert.equal(JSON.stringify(layout), before, 'planner must never mutate the authoritative map');

assert(full.walls.length > 80, 'modular wall cladding covers the rooms');
assert(full.corners.length > 20, 'corners get pillars');
assert.equal(full.gates.length, 11);
assert.equal(full.frames.length, 11);
assert.equal(full.hazards.length, 11);
assert(full.windows.length === layout.windows.filter(w => !w.lv).length);
assert(full.beams.length > 40, 'indoor zones get overhead beams');
assert(full.ceilings.length > 40, 'indoor rooms get ceilings');
assert(full.strips.length > 40, 'emissive wall strips');
assert(full.treads.length > 0, 'visual treads on the authored spawn ramp');
assert(full.caps.length > 10, 'outdoor parapets break the roofline');

const atrium = layout.up.atrium;
assert(atrium, 'spawn balcony atrium exists');
assert(full.ceilings.every(c => {
  // No ceiling tile should sit in the open well.
  const CELL = layout.cell, GW = layout.gw, GH = layout.gh;
  const cCell = Math.round((c.x - 1) / CELL + GW / 2);
  const rCell = Math.round((c.z - 1) / CELL + GH / 2);
  const inA = cCell >= atrium[0] && cCell <= atrium[1] && rCell >= atrium[2] && rCell <= atrium[3];
  return !inA;
}), 'atrium stays open to the sky');

const fc = planCounts(full), tc = planCounts(thin);
assert(tc.walls < fc.walls, 'low-graphics thins wall tiles');
assert.equal(tc.cables, 0);
assert.equal(tc.antennae, 0);
assert.equal(tc.pools, 0);
assert.equal(tc.gates, 11);
assert.equal(tc.frames, 11);
assert([2, 3].every(z => full.ceilings.some(c => c.zone === z)), 'Telemetry Hall and Motor Pool get solid ceilings');
assert(!full.ceilings.some(c => c.zone === 4 || c.zone === 0), 'Power Core and Ember Well stay high-bay so the launch pad still reads from spawn');

// Ranked isolation: classic grid is unchanged after a Cosmodrome bind/reset cycle
const ranked = { ranked: true, mapId: 'cosmodrome', zombies: new Map() };
Cod.resetMap(ranked);
assert.notEqual(Cod.layout().kind, 'cosmodrome');
assert.equal(Cod.layout().gh, 32);

console.log('Cosmodrome architecture planner passed:', fc);
