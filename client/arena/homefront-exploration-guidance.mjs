// Exploration guidance is presentation-only. It never grants rewards or changes server state.
import { LANDMARKS, STORY_THREADS } from './homefront-exploration-content.mjs';

const byId = new Map(LANDMARKS.map(landmark => [landmark.id, landmark]));

export function explorationGuidance(position, discoveredIds = []) {
  if (!position || !Number.isFinite(position.x) || !Number.isFinite(position.z)) {
    return { nearest: null, distance: Infinity, discoveredNow: false, alreadyDiscovered: false, routeLeads: [], storyLead: null };
  }
  const discovered = new Set(Array.isArray(discoveredIds) ? discoveredIds.filter(id => byId.has(id)) : []);
  let nearest = null, distance = Infinity;
  for (const landmark of LANDMARKS) {
    const d = Math.hypot(position.x - landmark.x, position.z - landmark.z);
    if (d < distance) { nearest = landmark; distance = d; }
  }
  if (!nearest) return { nearest: null, distance, discoveredNow: false, alreadyDiscovered: false, routeLeads: [], storyLead: null };
  const alreadyDiscovered = discovered.has(nearest.id);
  const discoveredNow = distance <= 8 && !alreadyDiscovered;
  const routeLeads = distance <= 20
    ? nearest.routeTo.filter(id => !discovered.has(id)).slice(0, 2).map(id => byId.get(id)?.title).filter(Boolean)
    : [];
  let storyLead = null;
  if (distance <= 20) {
    for (const thread of STORY_THREADS) {
      const known = [thread.startAt, ...thread.clues].some(id => discovered.has(id) || id === nearest.id);
      if (!known) continue;
      const nextClue = thread.clues.find(id => !discovered.has(id) && id !== nearest.id);
      if (nextClue) {
        storyLead = thread.title + ': investigate ' + (byId.get(nextClue)?.title || nextClue);
        break;
      }
      if (!discovered.has(thread.payoffAt) && thread.payoffAt !== nearest.id) {
        storyLead = thread.title + ': follow the evidence to ' + (byId.get(thread.payoffAt)?.title || thread.payoffAt);
        break;
      }
    }
  }
  return { nearest, distance, discoveredNow, alreadyDiscovered, routeLeads, storyLead };
}
