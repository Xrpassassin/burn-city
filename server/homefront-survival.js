'use strict';

// Server-authoritative field survival state for Homefront expeditions.
// Needs only decay while the explorer is present in the shared Graveyard.
const clamp = (n, min, max) => Math.max(min, Math.min(max, Number.isFinite(n) ? n : min));
const DEFAULTS = Object.freeze({ health: 100, hunger: 100, thirst: 100, stamina: 100, infection: 0, lastTick: 0 });
function normalize(input, now = Date.now()) {
  const s = input && typeof input === 'object' ? input : {};
  return {
    health: clamp(s.health ?? DEFAULTS.health, 0, 100), hunger: clamp(s.hunger ?? DEFAULTS.hunger, 0, 100),
    thirst: clamp(s.thirst ?? DEFAULTS.thirst, 0, 100), stamina: clamp(s.stamina ?? DEFAULTS.stamina, 0, 100),
    infection: clamp(s.infection ?? DEFAULTS.infection, 0, 100),
    lastTick: clamp(s.lastTick, 0, Number.MAX_SAFE_INTEGER) || now
  };
}
function tick(input, now = Date.now()) {
  const s = normalize(input, now);
  const elapsed = clamp((now - s.lastTick) / 1000, 0, 20);
  s.lastTick = now;
  s.hunger = clamp(s.hunger - elapsed * 0.035, 0, 100);
  s.thirst = clamp(s.thirst - elapsed * 0.06, 0, 100);
  // Exhaustion is a pressure, not a timer that kills a player while offline.
  if (s.hunger <= 0 || s.thirst <= 0) s.health = clamp(s.health - elapsed * (s.thirst <= 0 ? 0.22 : 0.12), 0, 100);
  if (s.health > 0 && s.hunger > 35 && s.thirst > 35 && s.infection === 0) s.health = clamp(s.health + elapsed * 0.015, 0, 100);
  return s;
}
function move(input, now = Date.now(), distance = 12) {
  const s = tick(input, now);
  // Travel itself is costly: longer moves use more stamina and gently accelerate metabolism.
  // The caller supplies only server-measured, already-clamped world displacement.
  const traveled = clamp(distance, 0, 12);
  const needPressure = s.hunger <= 25 || s.thirst <= 25;
  const staminaCost = 2 + traveled * 0.25 + (needPressure ? 2.5 : 0);
  s.stamina = clamp(s.stamina - staminaCost, 0, 100);
  s.hunger = clamp(s.hunger - traveled * 0.004, 0, 100);
  s.thirst = clamp(s.thirst - traveled * 0.007, 0, 100);
  return s;
}

function act(input, action, now = Date.now()) {
  const s = tick(input, now);
  switch (action) {
    case 'eat':
      if (s.hunger >= 95) throw new Error('not_hungry');
      s.hunger = clamp(s.hunger + 38, 0, 100); break;
    case 'drink':
      if (s.thirst >= 95) throw new Error('not_thirsty');
      s.thirst = clamp(s.thirst + 45, 0, 100); break;
    case 'bandage':
      if (s.health >= 95) throw new Error('not_injured');
      s.health = clamp(s.health + 30, 0, 100); s.infection = clamp(s.infection - 8, 0, 100); break;
    case 'catch_breath':
      if (s.stamina >= 95) throw new Error('not_exhausted');
      s.stamina = clamp(s.stamina + 45, 0, 100); break;
    default: throw new Error('unknown_survival_action');
  }
  s.lastTick = now;
  return s;
}
module.exports = { DEFAULTS, normalize, tick, move, act };
