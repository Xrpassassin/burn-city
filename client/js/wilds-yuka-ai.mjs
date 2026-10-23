// BURN City Wilds: Yuka-powered roaming heading with BURN City's existing collision/boundary safety.
// Yuka is vendored under client/vendor/yuka; see its upstream MIT license alongside the build.
import * as YUKA from '../vendor/yuka/build/yuka.module.js';

const finite = n => Number.isFinite(n);
const clampDt = dt => finite(dt) ? Math.max(0, Math.min(0.05, dt)) : 0;

export function createWildsWanderAgent({ x = 0, z = 0, yaw = 0, maxSpeed = 2 } = {}) {
  if (![x, z, yaw, maxSpeed].every(finite) || maxSpeed < 0) return null;
  const manager = new YUKA.EntityManager();
  const vehicle = new YUKA.Vehicle();
  const target = new YUKA.GameEntity();
  vehicle.position.set(x, 0, z);
  vehicle.rotation.fromEuler(0, yaw, 0);
  vehicle.velocity.set(Math.sin(yaw) * 0.35, 0, Math.cos(yaw) * 0.35);
  vehicle.maxSpeed = Math.max(0.25, maxSpeed);
  vehicle.maxForce = 5;
  const wanderBehavior = new YUKA.WanderBehavior(1.6, 3.5, 1.8);
  vehicle.steering.add(wanderBehavior);
  manager.add(vehicle);
  return {
    manager, vehicle, target, wanderBehavior, seekBehavior: null, pursuing: false,
    disposed: false, headingX: Math.sin(yaw), headingZ: Math.cos(yaw)
  };
}

// Update only this creature's Yuka manager. BURN City still owns physical position,
// obstacle resolution, terrain limits, animation, and gameplay state.
export function updateWildsWanderAgent(agent, dt, x, z, yaw, maxSpeed = 2) {
  if (!agent || agent.disposed || ![dt, x, z, yaw, maxSpeed].every(finite)) return null;
  const step = clampDt(dt);
  const v = agent.vehicle;
  if (agent.pursuing) {
    v.steering.remove(agent.seekBehavior);
    agent.seekBehavior = null;
    v.steering.add(agent.wanderBehavior);
    agent.pursuing = false;
  }
  v.position.set(x, 0, z);
  v.rotation.fromEuler(0, yaw, 0);
  v.maxSpeed = Math.max(0.25, maxSpeed);
  if (step > 0) agent.manager.update(step);
  const vx = v.velocity.x, vz = v.velocity.z, len = Math.hypot(vx, vz);
  if (len > 0.04 && finite(len)) {
    agent.headingX = vx / len;
    agent.headingZ = vz / len;
  }
  return { x: agent.headingX, z: agent.headingZ };
}


/**
 * Use Yuka's SeekBehavior to propose a heading toward a moving target.
 * Callers remain responsible for collision resolution, world bounds, and game state.
 */
export function updateWildsPursuitAgent(agent, dt, x, z, yaw, targetX, targetZ, maxSpeed = 2) {
  if (!agent || agent.disposed || ![dt, x, z, yaw, targetX, targetZ, maxSpeed].every(finite)) return null;
  const step = clampDt(dt);
  const v = agent.vehicle;
  agent.target.position.set(targetX, 0, targetZ);
  if (!agent.pursuing) {
    v.steering.remove(agent.wanderBehavior);
    agent.seekBehavior = new YUKA.SeekBehavior(agent.target.position);
    v.steering.add(agent.seekBehavior);
    agent.pursuing = true;
  }
  v.position.set(x, 0, z);
  v.rotation.fromEuler(0, yaw, 0);
  v.maxSpeed = Math.max(0.25, maxSpeed);
  if (step > 0) agent.manager.update(step);
  const vx = v.velocity.x, vz = v.velocity.z, len = Math.hypot(vx, vz);
  if (len > 0.04 && finite(len)) {
    agent.headingX = vx / len;
    agent.headingZ = vz / len;
  }
  return { x: agent.headingX, z: agent.headingZ };
}

export function disposeWildsWanderAgent(agent) {
  if (!agent || agent.disposed) return false;
  agent.manager.remove(agent.vehicle);
  agent.disposed = true;
  return true;
}
