import { findGridPath } from './wilds-pathfinding-core.mjs';
const bounds = { minX: 0, maxX: 4, minZ: 0, maxZ: 4 };
const route = findGridPath({ start: {x:0,z:0}, goal: {x:2,z:0}, bounds });
if (!route || !route.reached || route.path.length !== 3) throw new Error('direct route failed');
const blocked = findGridPath({ start: {x:0,z:0}, goal: {x:2,z:0}, bounds, isBlocked: x => x === 1 });
if (blocked.reached) throw new Error('blocked route should be unreachable');
console.log('pathfinding smoke tests passed');
