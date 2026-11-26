// The Ashen Cosmodrome — BURN / XRPL launch complex (Zombies map 2).
// Original layout inspired by the *feeling* of a Soviet-era cosmodrome with buyable
// doors, a central launch pad, and pad-to-pad tram travel. Names, geometry, props,
// and audio are BURN City's own. Do not copy Activision / Treyarch assets or titles.
// Grid is 72 x 56 cells (2 m each) = 144 x 112 m, about 3.15x the Refinery footprint.
'use strict';

const LANDER_COST = 250;

const COSMODROME = {
  name: 'The Ashen Cosmodrome',
  kind: 'cosmodrome',
  gw: 72,
  gh: 56,
  env: { tod: 'night', storm: true, glow: 'ember' },
  zones: [
    { n: 'Ember Well', r: [24, 47, 35, 53], col: '#ff8a3a' },
    { n: 'Ash Walk', r: [49, 69, 18, 53], col: '#d6a36b' },
    { n: 'Telemetry Hall', r: [2, 22, 35, 53], col: '#62c7c8' },
    { n: 'Motor Pool', r: [2, 22, 18, 33], col: '#8e9aa6' },
    { n: 'Power Core', r: [24, 47, 18, 33], col: '#d7bd79' },
    { n: 'Blast Court', r: [2, 22, 2, 16], col: '#e47b48' },
    { n: 'Fuel Farm', r: [49, 69, 2, 16], col: '#ff6a2a' },
    { n: 'Launch Pad', r: [24, 47, 2, 16], col: '#ffc23a' }
  ],
  obst: [
    // Ember Well — spin well core and side cover (keep doors, ramp, pad, buys clear)
    [34, 36, 43, 45, 2.2, 'spinner'],
    [29, 30, 38, 39, 1.5, 'crate'],
    [41, 42, 38, 39, 1.5, 'crate'],
    [29, 30, 47, 48, 1.4, 'crate'],
    [43, 44, 47, 48, 1.4, 'rubble'],
    // Telemetry Hall
    [5, 8, 40, 40, 1.1, 'desk'],
    [5, 8, 46, 46, 1.1, 'desk'],
    [16, 17, 38, 39, 1.5, 'crate'],
    [18, 19, 50, 51, 1.4, 'crate'],
    [10, 11, 48, 49, 1.1, 'desk'],
    // Ash Walk (tall east yard)
    [62, 65, 22, 23, 1.8, 'vehicle'],
    [54, 57, 30, 31, 1.8, 'vehicle'],
    [52, 53, 38, 39, 1.5, 'crate'],
    [66, 67, 48, 49, 1.5, 'crate'],
    [54, 56, 20, 20, 1.2, 'fence'],
    [60, 61, 36, 37, 1.4, 'rubble'],
    [66, 67, 26, 27, 2.4, 'scaffold'],
    // Motor Pool
    [5, 8, 22, 23, 1.8, 'vehicle'],
    [14, 17, 28, 29, 1.8, 'vehicle'],
    [18, 19, 20, 21, 1.5, 'crate'],
    [4, 5, 30, 31, 1.4, 'crate'],
    [10, 12, 20, 20, 1.2, 'fence'],
    // Power Core
    [28, 29, 22, 23, 1.1, 'desk'],
    [42, 43, 22, 23, 1.1, 'desk'],
    [28, 29, 28, 29, 2.2, 'tank'],
    [42, 43, 28, 29, 2.6, 'furnace'],
    [36, 37, 20, 21, 1.4, 'crate'],
    // Blast Court
    [5, 6, 5, 6, 2.2, 'tank'],
    [16, 19, 10, 11, 1.8, 'vehicle'],
    [10, 11, 14, 15, 1.4, 'rubble'],
    [18, 19, 4, 5, 1.5, 'crate'],
    [4, 6, 14, 14, 1.2, 'fence'],
    // Fuel Farm
    [52, 53, 5, 6, 2.6, 'tank'],
    [57, 58, 5, 6, 2.6, 'tank'],
    [64, 65, 10, 11, 2.6, 'tank'],
    [52, 53, 12, 13, 1.5, 'crate'],
    [60, 62, 14, 14, 2.8, 'pipe'],
    [66, 67, 4, 5, 2.4, 'scaffold'],
    // Launch Pad — rocket core plus apron cover (walkable ring remains)
    [34, 37, 7, 11, 3.6, 'rocket'],
    [26, 27, 4, 5, 3.2, 'scaffold'],
    [44, 45, 4, 5, 3.2, 'scaffold'],
    [26, 27, 13, 14, 1.4, 'crate'],
    [44, 45, 13, 14, 1.4, 'crate'],
    [30, 31, 14, 14, 1.2, 'fence'],
    [40, 41, 14, 14, 1.2, 'fence'],
    [29, 30, 3, 3, 1.0, 'rubble'],
    [42, 43, 3, 3, 1.0, 'rubble']
  ],
  doordef: [
    [0, 1, [[48, 43], [48, 44]], 750],
    [0, 2, [[23, 43], [23, 44]], 750],
    [0, 4, [[34, 34], [35, 34]], 1000],
    [2, 3, [[11, 34], [12, 34]], 1250],
    [3, 4, [[23, 24], [23, 25]], 1250],
    [1, 4, [[48, 24], [48, 25]], 1250],
    [3, 5, [[11, 17], [12, 17]], 1500],
    [1, 6, [[58, 17], [59, 17]], 1500],
    [4, 7, [[34, 17], [35, 17]], 1750],
    [5, 7, [[23, 8], [23, 9]], 1750],
    [6, 7, [[48, 8], [48, 9]], 2000]
  ],
  // Windows sit on the wall cell touching a floor, outward normal points off the map or into a neighbour.
  windef: [
    // Ember Well south
    [32, 54, 0, 1], [39, 54, 0, 1],
    // Telemetry west + south
    [1, 40, -1, 0], [1, 48, -1, 0], [8, 54, 0, 1], [16, 54, 0, 1],
    // Ash Walk east + south
    [70, 26, 1, 0], [70, 40, 1, 0], [70, 48, 1, 0], [55, 54, 0, 1], [63, 54, 0, 1],
    // Motor Pool west
    [1, 22, -1, 0], [1, 28, -1, 0],
    // Blast Court west + north
    [1, 6, -1, 0], [1, 12, -1, 0], [8, 1, 0, -1], [16, 1, 0, -1],
    // Launch Pad north
    [32, 1, 0, -1], [39, 1, 0, -1],
    // Fuel Farm north + east
    [55, 1, 0, -1], [63, 1, 0, -1], [70, 6, 1, 0], [70, 12, 1, 0],
    // Power Core vents through the north mid-wall
    [30, 17, 0, -1], [41, 17, 0, -1]
  ],
  wallbuys: [
    { w: 'shotgun', cost: 500, s: [24, 40, -1, 0] },
    { w: 'dragon', cost: 1000, s: [46, 36, 1, 0, 1] },
    { w: 'napalm', cost: 1500, s: [20, 20, 1, 0] },
    { w: 'ravager', cost: 3500, s: [69, 10, 1, 0] }
  ],
  box: [
    [36, 50, 0, 1],
    [8, 48, -1, 0],
    [60, 48, 1, 0],
    [3, 25, -1, 0],
    [36, 22, 0, -1],
    [60, 8, 1, 0]
  ],
  forge: [36, 16, 0, 1],
  power: [40, 26, 1, 0],
  perks: {
    jug: [30, 18, 0, -1],
    quick: [2, 26, -1, 0],
    speed: [69, 44, 1, 0],
    revive: [31, 53, 0, 1],
    dbl: [45, 9, 1, 0],
    slag: [8, 2, 0, -1],
    burn: [65, 4, 0, -1],
    valve: [4, 40, -1, 0],
    leech: [14, 53, 0, 1]
  },
  landers: [
    { id: 0, name: 'Pad Ember', zone: 0, c: 40, r: 50 },
    { id: 1, name: 'Pad Rust', zone: 1, c: 63, r: 44 },
    { id: 2, name: 'Pad Coil', zone: 3, c: 8, r: 26 },
    { id: 3, name: 'Pad Flare', zone: 5, c: 8, r: 8 }
  ],
  quest: null,
  // Spawn balcony around the spin well (same zone, open from the start). Ramp climbs north from the south ring.
  upper: {
    zone: 0,
    h: 3.6,
    atrium: [30, 41, 40, 49],
    walk: [
      [24, 47, 35, 36],
      [24, 47, 52, 53],
      [24, 25, 37, 51],
      [46, 47, 37, 51]
    ],
    walls: [
      [23, 48, 34, 34],
      [23, 48, 54, 54],
      [23, 23, 34, 54],
      [48, 48, 34, 54]
    ],
    void: [[30, 41, 40, 49]],
    ramps: [{ c: [26, 27], r: [50, 53], up: 'n' }]
  }
};

module.exports = { COSMODROME, LANDER_COST };
