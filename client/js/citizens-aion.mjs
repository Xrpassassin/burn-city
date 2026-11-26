// AION phase 1: authored in-world autobiographies and bounded session recall.
// Pure, deterministic game logic. No model calls, player identifiers, storage or external actions.
const histories = {
  maya: [
    { id: 'first-shop', place: 'shop:coffee', year: -8, line: 'My first shift here, a regular taught me how to make the perfect coffee.' },
    { id: 'storm', place: 'shop:mart', year: -3, line: 'During the big storm, the market shared supplies with our whole neighborhood.' },
    { id: 'arcade-friend', place: 'shop:arcade', year: -1, line: 'I met an old friend at this arcade. We still compete whenever we can.' }
  ],
  skye: [
    { id: 'first-match', place: 'shop:arcade', year: -6, line: 'I lost my first tournament here. Learning from that was better than winning.' },
    { id: 'tower', place: 'tower:BURN', year: -2, line: 'I remember watching the tower lights with my friends after a long match.' },
    { id: 'practice', place: 'shop:coffee', year: -1, line: 'My coach and I used to plan practice sessions over coffee.' }
  ],
  dex: [
    { id: 'first-walk', place: 'spawn', year: -9, line: 'I got lost on my first walk through the city. A neighbor showed me the way home.' },
    { id: 'crew', place: 'fire', year: -4, line: 'The fire crew once helped me find a safer trail. I still stop by to thank them.' },
    { id: 'volunteer', place: 'ems', year: -2, line: 'I started volunteering here after seeing how much the medics do for the city.' }
  ]
};
export const MAX_EPISODES = 12;
export const enabledFor = id => Object.hasOwn(histories, id);
export function makeCitizenMemory(id) {
  return enabledFor(id) ? { id, episodes: [], lastPlace: null, spoken: new Set() } : null;
}
// Record only actual completed NPC visits, not player location or identity.
export function observeVisit(state, place) {
  if (!state || typeof place !== 'string' || !place || place === state.lastPlace) return;
  state.lastPlace = place;
  state.episodes.push(place);
  if (state.episodes.length > MAX_EPISODES) state.episodes.shift();
}
// Recall once per authored memory per session; new observations stay distinct from backstory.
export function recallLine(state, place) {
  if (!state) return null;
  const match = histories[state.id]?.find(m => m.place === place && !state.spoken.has(m.id));
  if (match) { state.spoken.add(match.id); return match.line; }
  const visits = state.episodes.filter(p => p === place).length;
  const key = 'visit:' + place;
  if (visits >= 2 && !state.spoken.has(key) && histories[state.id]?.some(m => m.place === place)) {
    state.spoken.add(key);
    return "I've been back here a few times lately. It's becoming a familiar stop.";
  }
  return null;
}
