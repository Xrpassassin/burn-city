'use strict';
// Server-authoritative exploration discoveries and story breadcrumbs for Homefront.
// Discovery is location-validated; this module grants no inventory items or combat advantages.
const Content = require('../client/arena/homefront-exploration-content.mjs');
const LANDMARKS = new Map(Content.LANDMARKS.map(item => [item.id, item]));
const DISCOVERY_RADIUS = 8;
const MAX_DISCOVERIES = 128;
const MAX_LOG = 128;
const clampInt = (n, min, max) => Number.isFinite(n) ? Math.max(min, Math.min(max, Math.floor(n))) : min;
const copy = value => JSON.parse(JSON.stringify(value));

function emptyProgress() {
  return { discovered: [], firstDiscoveredAt: {}, intel: [], updatedAt: 0 };
}
function normalize(input) {
  const out = Object.create(null);
  if (!input || typeof input !== 'object' || Array.isArray(input)) return out;
  for (const [account, saved] of Object.entries(input)) {
    if (!saved || typeof saved !== 'object' || Array.isArray(saved)) continue;
    const discovered = [...new Set((Array.isArray(saved.discovered) ? saved.discovered : []).filter(id => LANDMARKS.has(id)))].slice(0, MAX_DISCOVERIES);
    const firstDiscoveredAt = Object.create(null);
    for (const id of discovered) firstDiscoveredAt[id] = clampInt(saved.firstDiscoveredAt?.[id], 0, Number.MAX_SAFE_INTEGER);
    const intel = (Array.isArray(saved.intel) ? saved.intel : []).filter(item => item && typeof item === 'object' && typeof item.id === 'string' && LANDMARKS.has(item.landmarkId) && discovered.includes(item.landmarkId) && typeof item.text === 'string').slice(-MAX_LOG).map(item => ({
      id: item.id.slice(0, 100), landmarkId: item.landmarkId, text: item.text.slice(0, 240),
      at: clampInt(item.at, 0, Number.MAX_SAFE_INTEGER)
    }));
    out[account] = { discovered, firstDiscoveredAt, intel, updatedAt: clampInt(saved.updatedAt, 0, Number.MAX_SAFE_INTEGER) };
  }
  return out;
}
function storyLeads(discoveredIds) {
  const discovered = new Set(discoveredIds);
  const leads = [];
  for (const thread of Content.STORY_THREADS) {
    const sequence = [thread.startAt, ...thread.clues, thread.payoffAt];
    const found = sequence.filter(id => discovered.has(id));
    const nextId = sequence.find(id => !discovered.has(id));
    if (found.length && nextId) {
      const next = LANDMARKS.get(nextId);
      leads.push({ threadId: thread.id, title: thread.title, discoveredCount: found.length, totalStops: sequence.length, nextLandmarkId: nextId, nextLandmarkTitle: next?.title || nextId, rewardIntent: thread.rewardIntent });
    } else if (found.length === sequence.length) {
      // Visiting every location only surveys the route. Story completion must wait for
      // explicit clue/objective interactions, so never infer a narrative payoff here.
      leads.push({ threadId: thread.id, title: thread.title, discoveredCount: found.length, totalStops: sequence.length, status: 'route_surveyed', rewardIntent: thread.rewardIntent });
    }
  }
  return leads;
}
function snapshot(input, account) {
  const state = normalize(input)[account] || emptyProgress();
  const discoveredSet = new Set(state.discovered);
  const sites = state.discovered.map(id => {
    const item = LANDMARKS.get(id);
    return { id, title: item.title, district: item.district, discoveredAt: state.firstDiscoveredAt[id] || 0 };
  });
  const routeLeads = [...discoveredSet].flatMap(id => {
    const item = LANDMARKS.get(id);
    return (item?.routeTo || []).filter(nextId => !discoveredSet.has(nextId)).map(nextId => ({
      fromId: id, fromTitle: item.title, landmarkId: nextId, title: LANDMARKS.get(nextId)?.title || nextId
    }));
  }).filter((lead, i, all) => all.findIndex(other => other.landmarkId === lead.landmarkId) === i).slice(0, 12);
  return { discovered: sites, discoveredIds: state.discovered.slice(), intel: copy(state.intel), routeLeads, storyLeads: storyLeads(state.discovered), updatedAt: state.updatedAt };
}
function discover(input, { account, player, landmarkId, now = Date.now() }) {
  if (typeof account !== 'string' || !account || account.length > 128) throw new Error('invalid_owner');
  const landmark = LANDMARKS.get(landmarkId);
  if (!landmark) throw new Error('unknown_landmark');
  if (!player || !Number.isFinite(player.x) || !Number.isFinite(player.z)) throw new Error('not_in_expedition');
  if (Math.hypot(player.x - landmark.x, player.z - landmark.z) > DISCOVERY_RADIUS) throw new Error('too_far_to_discover');
  const db = normalize(input);
  const state = db[account] || emptyProgress();
  if (state.discovered.includes(landmarkId)) {
    return { state: db, progress: snapshot(db, account), newlyDiscovered: false, landmark: { id: landmark.id, title: landmark.title } };
  }
  if (state.discovered.length >= MAX_DISCOVERIES) throw new Error('discovery_limit_reached');
  state.discovered.push(landmarkId);
  state.firstDiscoveredAt[landmarkId] = clampInt(now, 0, Number.MAX_SAFE_INTEGER);
  state.updatedAt = clampInt(now, 0, Number.MAX_SAFE_INTEGER);
  state.intel.push({ id: landmarkId + ':' + state.updatedAt, landmarkId, text: landmark.story, at: state.updatedAt });
  state.intel = state.intel.slice(-MAX_LOG);
  db[account] = state;
  return { state: db, progress: snapshot(db, account), newlyDiscovered: true, landmark: { id: landmark.id, title: landmark.title } };
}
module.exports = { DISCOVERY_RADIUS, emptyProgress, normalize, snapshot, discover, storyLeads };
