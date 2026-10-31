'use strict';
// Bounded, non-XRPL Homefront field-survey contracts.
// Discovery is independently validated by server/homefront-exploration.js.
// This module only grants small carried supplies after a verified route is
// surveyed and records completion in the SAME saved world as the inventory.
const Inventory = require('./homefront-inventory');
const Content = require('../client/arena/homefront-exploration-content.mjs');

const ALL_SITES = new Set(Content.LANDMARKS.map(site => site.id));
const CONTRACTS = Object.freeze([
  Object.freeze({
    id: 'evacuation_survey', title: 'Evacuation Road Survey',
    description: 'Chart the bus evacuation route, river checkpoint, and freight depot.',
    sites: Object.freeze(['north_bus_depot','river_checkpoint','wrecked_depot']),
    supplies: Object.freeze([Object.freeze({ item:'food', amount:1 }), Object.freeze({ item:'water', amount:1 })])
  }),
  Object.freeze({
    id: 'industrial_feeder_survey', title: 'Industrial Feeder Survey',
    description: 'Trace the rail service line through Ironworks to Ashfall station.',
    sites: Object.freeze(['old_rail_yard','ironworks','ashfall_station']),
    supplies: Object.freeze([Object.freeze({ item:'scrap', amount:2 }), Object.freeze({ item:'ammo', amount:1 })])
  }),
  Object.freeze({
    id: 'medical_corridor_survey', title: 'Medical Corridor Survey',
    description: 'Locate the apartments, quarantine shelter, and St. Mercy triage.',
    sites: Object.freeze(['collapsed_apartments','quarantine_shelter','mercy_hospital']),
    supplies: Object.freeze([Object.freeze({ item:'meds', amount:1 }), Object.freeze({ item:'water', amount:1 })])
  }),
  Object.freeze({
    id: 'deep_wastes_survey', title: 'Deep Wastes Survey',
    description: 'Survey the rail tunnel, research annex, and Ashfall access wing.',
    sites: Object.freeze(['buried_subway','research_annex','ashfall_station']),
    supplies: Object.freeze([Object.freeze({ item:'ammo', amount:2 }), Object.freeze({ item:'meds', amount:1 })])
  })
]);
for (const contract of CONTRACTS) {
  if (!contract.sites.every(id => ALL_SITES.has(id)) ||
      !contract.supplies.every(drop => Inventory.ITEMS[drop.item] && drop.amount > 0 && drop.amount <= 2)) {
    throw new Error('invalid_field_survey_catalog');
  }
}
const INDEX = new Map(CONTRACTS.map(c => [c.id,c]));

function normalize(input) {
  const out = Object.create(null);
  if (!input || typeof input !== 'object' || Array.isArray(input)) return out;
  for (const [account, raw] of Object.entries(input)) {
    if (typeof account !== 'string' || !account || account.length > 128 ||
        !raw || typeof raw !== 'object' || Array.isArray(raw)) continue;
    const valid = Object.create(null);
    for (const [id, timestamp] of Object.entries(raw)) {
      if (INDEX.has(id) && Number.isSafeInteger(timestamp) && timestamp > 0)
        valid[id] = timestamp;
    }
    if (Object.keys(valid).length) out[account] = valid;
  }
  return out;
}
function surveySnapshot(ledger, account, discoveredIds) {
  const saved = normalize(ledger)[account] || Object.create(null);
  const sites = new Set((Array.isArray(discoveredIds) ? discoveredIds : [])
    .filter(id => typeof id === 'string' && ALL_SITES.has(id)));
  return CONTRACTS.map(contract => {
    const visited = contract.sites.filter(id => sites.has(id));
    const claimedAt = saved[contract.id] || 0;
    return {
      id: contract.id, title: contract.title, description: contract.description,
      visited: visited.length, required: contract.sites.length,
      remaining: contract.sites.filter(id => !sites.has(id)),
      supplies: contract.supplies.map(item => ({ ...item })),
      status: claimedAt ? 'claimed' : visited.length === contract.sites.length ? 'ready' : 'incomplete',
      claimedAt
    };
  });
}
function claim(input, { account, player, contractId, discoveredIds, now = Date.now() }) {
  if (!account || typeof account !== 'string' || account.length > 128) throw new Error('invalid_owner');
  if (!player || !Number.isFinite(player.x) || !Number.isFinite(player.z)) throw new Error('not_in_expedition');
  const contract = INDEX.get(contractId);
  if (!contract) throw new Error('unknown_field_survey');
  if (!contract.sites.every(id => (Array.isArray(discoveredIds) ? discoveredIds : []).includes(id)))
    throw new Error('field_survey_incomplete');
  const ledger = normalize(input);
  if (ledger[account]?.[contract.id]) throw new Error('field_survey_already_claimed');
  // All-or-nothing pack space check. Never mark a reward consumed when the pack
  // cannot hold it. No refuge-file mutation or cross-file payout transaction.
  let pack = Inventory.normalize(player.inventory, now);
  for (const drop of contract.supplies) {
    const added = Inventory.add(pack, drop.item, drop.amount, now);
    if (added.accepted !== drop.amount) throw new Error('inventory_full');
    pack = added.inventory;
  }
  if (!Number.isSafeInteger(now) || now <= 0) throw new Error('invalid_server_time');
  player.inventory = pack;
  if (!ledger[account]) ledger[account] = Object.create(null);
  ledger[account][contract.id] = now;
  return { ledger, inventory: pack,
    supplies: contract.supplies.map(item => ({ ...item })),
    contract: { id: contract.id, title: contract.title, claimedAt: now } };
}
module.exports = { CONTRACTS, normalize, surveySnapshot, claim };
