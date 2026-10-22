/**
 * Deterministic, dependency-free room graph generator for Eternal Grind.
 *
 * This is an isolated generation core: it does not build Three.js meshes,
 * spawn enemies, or change the live floor/save flow. Consumers can render the
 * returned room graph after reviewing the layout and collision requirements.
 */

function hashSeed(seed) {
  const text = String(seed);
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function makeRandom(seed) {
  let state = hashSeed(seed) || 0x6d2b79f5;
  return () => {
    state += 0x6d2b79f5;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function edgeKey(a, b) {
  return a < b ? a + ':' + b : b + ':' + a;
}

function farthestRoom(start, adjacency) {
  const distances = new Map([[start, 0]]);
  const queue = [start];
  for (let head = 0; head < queue.length; head += 1) {
    const current = queue[head];
    for (const next of adjacency[current]) {
      if (!distances.has(next)) {
        distances.set(next, distances.get(current) + 1);
        queue.push(next);
      }
    }
  }
  let best = start;
  for (const [id, distance] of distances) {
    if (distance > distances.get(best)) best = id;
  }
  return { id: best, distance: distances.get(best) };
}

/**
 * @param {{seed: string|number, columns?: number, rows?: number, loopChance?: number}} options
 * @returns {{seed: string, columns: number, rows: number, rooms: Array, corridors: Array, entranceId: number, bossId: number, mainPathLength: number}}
 */
export function generateDungeonLayout(options = {}) {
  const { seed, columns = 5, rows = 5, loopChance = 0.12 } = options;
  if (seed === undefined || seed === null || String(seed).trim() === '') {
    throw new TypeError('seed is required');
  }
  if (!Number.isInteger(columns) || columns < 2 || columns > 20) {
    throw new RangeError('columns must be an integer from 2 to 20');
  }
  if (!Number.isInteger(rows) || rows < 2 || rows > 20) {
    throw new RangeError('rows must be an integer from 2 to 20');
  }
  if (!Number.isFinite(loopChance) || loopChance < 0 || loopChance > 1) {
    throw new RangeError('loopChance must be between 0 and 1');
  }

  const seedText = String(seed);
  const random = makeRandom(seedText);
  const count = columns * rows;
  const adjacency = Array.from({ length: count }, () => []);
  const edges = new Map();
  const addEdge = (a, b) => {
    const key = edgeKey(a, b);
    if (edges.has(key)) return;
    edges.set(key, { a, b });
    adjacency[a].push(b);
    adjacency[b].push(a);
  };
  const neighbors = id => {
    const x = id % columns;
    const z = Math.floor(id / columns);
    const result = [];
    if (z > 0) result.push(id - columns);
    if (x < columns - 1) result.push(id + 1);
    if (z < rows - 1) result.push(id + columns);
    if (x > 0) result.push(id - 1);
    return result;
  };

  // Randomized depth-first spanning tree: every room is reachable by design.
  const visited = new Set([0]);
  const stack = [0];
  while (stack.length) {
    const current = stack[stack.length - 1];
    const candidates = neighbors(current).filter(id => !visited.has(id));
    if (!candidates.length) {
      stack.pop();
      continue;
    }
    const next = candidates[Math.floor(random() * candidates.length)];
    addEdge(current, next);
    visited.add(next);
    stack.push(next);
  }

  // Optional loops make some floors less corridor-linear without disconnecting.
  for (let id = 0; id < count; id += 1) {
    for (const next of neighbors(id)) {
      if (next > id && !edges.has(edgeKey(id, next)) && random() < loopChance) {
        addEdge(id, next);
      }
    }
  }

  const entranceId = 0;
  const farthest = farthestRoom(entranceId, adjacency);
  const bossId = farthest.id;
  const rooms = Array.from({ length: count }, (_, id) => ({
    id,
    gridX: id % columns,
    gridZ: Math.floor(id / columns),
    x: (id % columns) * 24,
    z: Math.floor(id / columns) * 24,
    type: id === entranceId ? 'entrance' : id === bossId ? 'boss' : 'chamber'
  }));
  const corridors = [...edges.values()].map(({ a, b }) => ({ a, b }));
  return {
    seed: seedText,
    columns,
    rows,
    rooms,
    corridors,
    entranceId,
    bossId,
    mainPathLength: farthest.distance
  };
}
