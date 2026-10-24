import assert from 'node:assert/strict';
import { isPositionBlocked, isWorkingTask, obstacleRadius, safeMovePosition, separationVector, steeringDirection, updateAwarenessReaction, updateRoutePlan, updateRouteRecovery } from './homefront-navigation.mjs';


const calmAwareness = updateAwarenessReaction({}, { playerDistance: 8, threatDistance: 12 }, 100);
assert.equal(calmAwareness.mode, 'ambient', 'survivors remain in ambient mode when stimuli are distant');
const playerAwareness = updateAwarenessReaction(calmAwareness, { playerDistance: 3, playerYaw: 1.2, threatDistance: 12 }, 200);
assert.equal(playerAwareness.mode, 'player', 'survivors notice the player within conversational range');
assert.equal(playerAwareness.targetYaw, 1.2, 'player awareness supplies a facing direction');
const hysteresis = updateAwarenessReaction(playerAwareness, { playerDistance: 4.2, playerYaw: 0, threatDistance: 12 }, 300);
assert.equal(hysteresis.mode, 'player', 'awareness does not flicker while the player crosses the entry radius');
const threatAwareness = updateAwarenessReaction(hysteresis, { playerDistance: 1, playerYaw: 0, threatDistance: 5, threatYaw: -1 }, 400);
assert.equal(threatAwareness.mode, 'threat', 'nearby threats take priority over player greeting');
assert.equal(threatAwareness.targetYaw, -1, 'threat awareness supplies a facing direction');
const threatClear = updateAwarenessReaction(threatAwareness, { playerDistance: 10, threatDistance: 9.5 }, 500);
assert.equal(threatClear.mode, 'ambient', 'survivors return to ambient awareness after a threat leaves the exit radius');

const wall = { id: 'w', type: 'wall', hp: 100, x: 0, z: 0 };
assert.ok(obstacleRadius(wall) > 0.7, 'structures have a conservative physical footprint');
assert.equal(isPositionBlocked(0, 0, [wall]), true, 'actors cannot occupy the centre of a solid structure');
assert.equal(isPositionBlocked(2, 0, [wall]), false, 'clear ground remains traversable');
assert.equal(isPositionBlocked(0, 0, [{ ...wall, hp: 0 }]), false, 'destroyed structures stop blocking');


const safeStep = safeMovePosition({ x: -1.3, z: 0 }, { x: 1, z: 0.4 }, [wall]);
assert.equal(isPositionBlocked(safeStep.x, safeStep.z, [wall]), false, 'safe movement never ends inside a structure');
assert.ok(safeStep.z !== 0, 'blocked forward movement slides along a clear axis when possible');
const sealedStep = safeMovePosition({ x: -1.3, z: 0 }, { x: 1, z: 1 }, [wall, { id: 'north-block', type: 'wall', radius: 0.2, hp: 100, x: -1.3, z: 1 }]);
assert.deepEqual(sealedStep, { x: -1.3, z: 0 }, 'when all candidate steps are blocked the actor remains at its clear position');
assert.equal(isPositionBlocked(sealedStep.x, sealedStep.z, [wall, { id: 'north-block', type: 'wall', radius: 0.2, hp: 100, x: -1.3, z: 1 }]), false, 'a rejected move never tunnels through the structure');

const steer = steeringDirection({ x: -2, z: 0 }, { x: 2, z: 0 }, [wall]);
assert.ok(steer.x > 0, 'steering still makes forward progress around an obstacle');
assert.ok(Math.abs(steer.z) > 0.1, 'steering chooses a lateral route around a blocking obstacle');
const stationTarget = steeringDirection({ x: 1.4, z: 1.4 }, { x: 0.7, z: 0.7 }, [wall]);
assert.ok(Number.isFinite(stationTarget.x) && Number.isFinite(stationTarget.z), 'actors can approach a work target adjacent to a structure');
const crowd = separationVector({ x: 0, z: 0 }, [{ x: 0.2, z: 0 }, { x: 0, z: 0.2 }]);
assert.ok(crowd.x < 0 && crowd.z < 0, 'separation steers away from nearby survivors');
assert.ok(Math.hypot(crowd.x, crowd.z) <= 1.001, 'separation remains bounded');
assert.deepEqual(separationVector({ x: 0, z: 0 }, [{ x: 2, z: 0 }]), { x: 0, z: 0 }, 'distant agents do not repel each other');
console.log('Homefront obstacle steering and survivor separation tests passed');

assert.equal(isWorkingTask('farmer','tend_crops'), true, 'farmers animate active crop work');
assert.equal(isWorkingTask('mechanic','emergency_repair'), true, 'mechanics animate active repair work');
assert.equal(isWorkingTask('medic','triage_standby'), false, 'medical standby remains an idle posture');
assert.equal(isWorkingTask('scavenger','stockpile_supplies'), true, 'scavengers animate active stockpiling');
assert.equal(isWorkingTask('guard','perimeter_watch'), true, 'guards use an alert posture while on watch');
assert.equal(isWorkingTask('mechanic','stand_by_repairs'), false, 'repair standby does not look like active wrench work');


let route = updateRouteRecovery({}, { x: 0, z: 0 }, { x: 5, z: 0 }, 0);
route = updateRouteRecovery(route, { x: 0.01, z: 0 }, { x: 5, z: 0 }, 1500);
assert.equal(route.stuck, true, 'route recovery detects a survivor that has stopped making progress');
assert.notEqual(route.preferredOffset, 0, 'a stalled survivor receives a deterministic alternate approach');
const firstOffset = route.preferredOffset;
route = updateRouteRecovery(route, { x: 0.01, z: 0 }, { x: 5, z: 0 }, 2500);
assert.notEqual(route.preferredOffset, firstOffset, 'repeated stalls cycle to another approach instead of retrying the same side');
route = updateRouteRecovery(route, { x: 1, z: 0 }, { x: 5, z: 0 }, 2700);
assert.equal(route.preferredOffset, 0, 'real progress clears the temporary route bias');
const changedTarget = updateRouteRecovery(route, { x: 1, z: 0 }, { x: -5, z: 0 }, 2800);
assert.equal(changedTarget.retries, 0, 'a changed destination resets stale route recovery state');
console.log('Homefront survivor route recovery tests passed');

const routeWall = { id: 'route-wall', type: 'wall', hp: 100, x: 0, z: 0 };
let plan = updateRoutePlan({}, { x: -2, z: 0 }, { x: 2, z: 0 }, [routeWall]);
assert.ok(plan.detour, 'a route crossing a solid structure receives a detour waypoint');
assert.equal(isPositionBlocked(plan.detour.x, plan.detour.z, [routeWall]), false, 'detour waypoint is outside the structure footprint');
const stablePlan = updateRoutePlan(plan, { x: -1.8, z: 0.05 }, { x: 2, z: 0 }, [routeWall]);
assert.deepEqual(stablePlan.detour, plan.detour, 'detour waypoint remains stable while the survivor approaches it');
const changedPlan = updateRoutePlan(stablePlan, { x: -1.8, z: 0.05 }, { x: 2, z: 2 }, [routeWall]);
assert.equal(changedPlan.targetKey, '8/8', 'changed assignments rebuild the route plan');
console.log('Homefront stable route waypoint tests passed');

const openedGatePlan = updateRoutePlan(plan, { x: -2, z: 0 }, { x: 2, z: 0 }, []);
assert.equal(openedGatePlan.detour, null, 'a changed obstacle set, such as an opened gate, clears obsolete detours');

const blockedRoute = updateRoutePlan({}, { x: -2, z: 0 }, { x: 2, z: 0 }, [routeWall, { id: 'north-blocker', type: 'wall', hp: 100, x: 1.26, z: 1.4 }, { id: 'south-blocker', type: 'wall', hp: 100, x: 1.26, z: -1.4 }]);
assert.equal(blockedRoute.unreachable, true, 'when both safe detour sides are blocked the planner reports the route as unreachable instead of inventing a waypoint');
const recoveredRoute = updateRoutePlan(blockedRoute, { x: 2, z: 0 }, { x: 2, z: 0 }, [routeWall, { id: 'north-blocker', type: 'wall', hp: 100, x: 1.26, z: 1.4 }, { id: 'south-blocker', type: 'wall', hp: 100, x: 1.26, z: -1.4 }]);
assert.equal(recoveredRoute.unreachable, false, 'a new position at the destination clears stale blocked-route status');
