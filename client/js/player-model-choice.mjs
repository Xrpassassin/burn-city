// Which body the LOCAL player wears (cosmetic, this device only; remote peers keep Gas Mask Guy until
// presence carries a model id). ?playermodel=hover-mage overrides for one visit (tests, sharing).
export const PLAYER_MODELS = Object.freeze([
  Object.freeze({ id: 'gas-mask-guy', label: 'Gas Mask Guy' }),
  Object.freeze({ id: 'hover-mage', label: 'Hover Mage' })
]);
export const DEFAULT_PLAYER_MODEL = 'gas-mask-guy';
const KEY = 'bc_player_model';
export const isPlayerModel = id => PLAYER_MODELS.some(m => m.id === id);

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
