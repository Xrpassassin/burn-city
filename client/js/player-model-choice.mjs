// Which body a player wears. The Hover Mage is the default for everyone (Derrik, Nov 22, 2026: "implement it
// as the main model our players play as"); Gas Mask Guy stays selectable in Settings > Player and a player
// who saved it keeps it (the choice is only written when the select changes, so unset players get the mage).
// ?playermodel=hover-mage|gas-mask-guy overrides for one visit (tests, sharing).
// Other players see the choice through presence: the city WS `p` message carries `pm` and the 3 Hz snapshot
// repeats it (city.js / server/city.js); Zombies/arena sends `&pm=g` on the join URL (server.js look.pm).
// On the wire 'g' = Gas Mask Guy; anything else or absent = the default (old clients show as the mage).
export const PLAYER_MODELS = Object.freeze([
  Object.freeze({ id: 'hover-mage', label: 'Hover Mage' }),
  Object.freeze({ id: 'gas-mask-guy', label: 'Gas Mask Guy' })
]);
export const DEFAULT_PLAYER_MODEL = 'hover-mage';
const KEY = 'bc_player_model';
export const isPlayerModel = id => PLAYER_MODELS.some(m => m.id === id);
export const playerModelOr = (id, fallback = DEFAULT_PLAYER_MODEL) => isPlayerModel(id) ? id : fallback;
export const modelToWire = id => id === 'gas-mask-guy' ? 'g' : 'm';
export const modelFromWire = code => code === 'g' ? 'gas-mask-guy' : DEFAULT_PLAYER_MODEL;

export function getPlayerModel(search, storage) {
  try {
    const q = new URLSearchParams(search ?? (typeof location !== 'undefined' ? location.search : ''));
    const forced = q.get('playermodel');
    if (isPlayerModel(forced)) return forced;
    const saved = (storage ?? (typeof localStorage !== 'undefined' ? localStorage : null))?.getItem(KEY);
    if (isPlayerModel(saved)) return saved;
  } catch { /* private mode / no storage */ }
  return DEFAULT_PLAYER_MODEL;
}

export function savePlayerModel(id, storage) {
  if (!isPlayerModel(id)) return false;
  try { (storage ?? localStorage).setItem(KEY, id); } catch { return false; }
  return true;
}
