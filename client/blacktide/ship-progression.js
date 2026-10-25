// Data-driven BlackTide ship progression. Pure rules: no wallet or authoritative rewards.
export const SHIP_CLASSES = Object.freeze({
  sloop: { name: 'Sloop', hull: 100, speed: 1.2, slots: { cannon: 2, sail: 1, hull: 1, utility: 1 } },
  brigantine: { name: 'Brigantine', hull: 170, speed: 1, slots: { cannon: 3, sail: 1, hull: 2, utility: 2 } },
  frigate: { name: 'Frigate', hull: 260, speed: 0.8, slots: { cannon: 4, sail: 2, hull: 3, utility: 2 } }
});
export const EQUIPMENT = Object.freeze({
  light_cannon: { name: 'Light Cannon', slot: 'cannon', cost: 40, damage: 10 },
  heavy_cannon: { name: 'Heavy Cannon', slot: 'cannon', cost: 110, damage: 20 },
  swift_canvas: { name: 'Swift Canvas', slot: 'sail', cost: 65, speed: 0.12 },
  reinforced_plating: { name: 'Reinforced Plating', slot: 'hull', cost: 90, hull: 40 },
  cargo_racks: { name: 'Cargo Racks', slot: 'utility', cost: 50, cargo: 25 },
  repair_tools: { name: 'Repair Tools', slot: 'utility', cost: 75, repair: 1 }
});
export const UPGRADES = Object.freeze({
  gun_drills: { name: 'Gun Drills', cost: 90, requires: [], reload: 0.1 },
  chainshot: { name: 'Chainshot', cost: 130, requires: ['gun_drills'], sailDamage: 0.2 },
  reinforced_keel: { name: 'Reinforced Keel', cost: 100, requires: [], hull: 30 },
  ironclad: { name: 'Ironclad', cost: 170, requires: ['reinforced_keel'], hull: 60 },
  wind_reader: { name: 'Wind Reader', cost: 80, requires: [], speed: 0.08 },
  storm_runner: { name: 'Storm Runner', cost: 145, requires: ['wind_reader'], speed: 0.12 }
});
const own = (object, key) => Object.prototype.hasOwnProperty.call(object, key);
export function createShip(shipClass = 'sloop') {
  if (!own(SHIP_CLASSES, shipClass)) throw new Error('Unknown ship class');
  return { shipClass, equipment: [], upgrades: [], currency: 0 };
}
export function shipStats(ship) {
  const base = SHIP_CLASSES[ship?.shipClass];
  if (!base) throw new Error('Unknown ship class');
  const stats = { hull: base.hull, speed: base.speed, damage: 0, cargo: 0, repair: 0, reload: 0, sailDamage: 0 };
  for (const id of [...(ship.equipment || []), ...(ship.upgrades || [])]) {
    const item = EQUIPMENT[id] || UPGRADES[id];
    if (!item) continue;
    for (const key of Object.keys(stats)) if (typeof item[key] === 'number') stats[key] += item[key];
  }
  return stats;
}
export function purchaseEquipment(ship, id) {
  const item = own(EQUIPMENT, id) ? EQUIPMENT[id] : null;
  const base = SHIP_CLASSES[ship?.shipClass];
  if (!base || !item || !Number.isSafeInteger(ship.currency) || ship.currency < item.cost) return false;
  if (!Array.isArray(ship.equipment)) return false;
  const occupied = ship.equipment.filter(e => EQUIPMENT[e]?.slot === item.slot).length;
  if (occupied >= base.slots[item.slot]) return false;
  ship.currency -= item.cost;
  ship.equipment.push(id);
  return true;
}
export function purchaseUpgrade(ship, id) {
  const item = own(UPGRADES, id) ? UPGRADES[id] : null;
  if (!SHIP_CLASSES[ship?.shipClass] || !item || !Array.isArray(ship.upgrades) || !Number.isSafeInteger(ship.currency)) return false;
  if (ship.upgrades.includes(id) || !item.requires.every(req => ship.upgrades.includes(req)) || ship.currency < item.cost) return false;
  ship.currency -= item.cost;
  ship.upgrades.push(id);
  return true;
}
