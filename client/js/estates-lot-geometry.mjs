// Canonical Estates property layout shared by browser and Node.js.
// Keep this module dependency-free so server authorization and client rendering agree.
export const SLOT_LAYOUT = Object.freeze([
  [-42,-91],[-14,-99],[14,-99],[42,-91],[-76,-54],[-48,-47],[-20,-53],[20,-53],[48,-47],[76,-54],
  [-91,-12],[-63,-6],[-35,-12],[35,-12],[63,-6],[91,-12],[-72,38],[-42,52],[-14,62],[14,62],[48,48]
].map(([x,z])=>Object.freeze([x,z])));
export const LOT_WIDTH = 20;
export const LOT_DEPTH = 18;
export const FOOTPRINTS = Object.freeze({
  mansion:Object.freeze({width:13,depth:11,height:8}),
  family:Object.freeze({width:10,depth:9,height:6}),
  starter:Object.freeze({width:8,depth:7,height:5}),
  apartment:Object.freeze({width:7,depth:8,height:10}),
  trailer:Object.freeze({width:6,depth:5,height:3})
});
