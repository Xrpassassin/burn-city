// Version 2 preview graph audit: checks topology only, not physical walkability.
// Collision and route clearance are separate checks before world activation.
import { homefrontRoadNetworkPreview } from './homefront-road-network-preview.mjs';

export function auditOrganicRouteReachability(network = homefrontRoadNetworkPreview()) {
  const adjacency = new Map();
  const connect = (a, b) => {
    if (!adjacency.has(a)) adjacency.set(a, new Set());
    adjacency.get(a).add(b);
  };
  for (const road of network.roads) {
    connect(road.from.id, road.to.id);
    connect(road.to.id, road.from.id);
  }
  const start = network.nodes[0]?.id;
  const visited = new Set(start ? [start] : []);
  const queue = start ? [start] : [];
  for (let index = 0; index < queue.length; index++) {
    for (const neighbor of adjacency.get(queue[index]) || []) {
      if (!visited.has(neighbor)) { visited.add(neighbor); queue.push(neighbor); }
    }
  }
  const missing = [...adjacency.keys()].filter(id => !visited.has(id)).sort();
  const degenerate = network.roads.filter(r => Math.hypot(
    r.from.x - r.to.x, r.from.z - r.to.z) < 0.001).map(r => r.id);
  const disconnectedSpurs = network.roads.filter(r => r.kind === 'district' &&
    (!visited.has(r.from.id) || !visited.has(r.to.id))).map(r => r.id);
  return { version: network.version, reachableNodes: visited.size,
    totalNodes: adjacency.size, disconnectedNodes: missing, disconnectedSpurs,
    degenerateRoads: degenerate, connected: missing.length === 0 && degenerate.length === 0 };
}
