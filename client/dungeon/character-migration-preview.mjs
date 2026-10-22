/**
 * Non-destructive preview helpers for a future Eternal Grind beta migration.
 * This module never writes saves or transforms a character.
 */
export const TARGET_CLASSES = Object.freeze({
  vanguard: { label: 'Vanguard', paths: ['Bulwark', 'Weaponmaster'] },
  warden: { label: 'Warden', paths: ['Grovekeeper', 'Wildbound'] },
  arcanist: { label: 'Arcanist', paths: ['Spellfire', 'Runeseer'] },
  ranger: { label: 'Ranger', paths: ['Deadeye', 'Trapper'] },
  reaver: { label: 'Reaver', paths: ['Bloodedge', 'Ravager'] },
  binder: { label: 'Binder', paths: ['Pactcaller', 'Hexbinder'] }
});

const LEGACY_LABELS = Object.freeze({
  warrior: 'Warrior', rogue: 'Rogue', ranger: 'Ranger', mage: 'Mage'
});

// Recommendations are deliberately many-to-many: they are prompts for player choice,
// not an automatic conversion rule.
const SUGGESTIONS = Object.freeze({
  warrior: ['vanguard', 'reaver'],
  rogue: ['reaver', 'ranger'],
  ranger: ['ranger', 'warden'],
  mage: ['arcanist', 'binder']
});

const isRecord = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const safeCount = value => isRecord(value) ? Object.keys(value).filter(k => value[k] != null).length : Array.isArray(value) ? value.filter(Boolean).length : 0;

export function previewLegacyCharacter(save, selectedTarget = null) {
  if (!isRecord(save)) throw new TypeError('Character save must be a JSON object.');
  const legacyClasses = (Array.isArray(save.classes) && save.classes.length ? save.classes : [save.cls])
    .filter(c => typeof c === 'string' && LEGACY_LABELS[c])
    .slice(0, 3);
  if (!legacyClasses.length) throw new TypeError('No recognized legacy class was found (Warrior, Rogue, Ranger, or Mage).');
  if (selectedTarget !== null && !Object.hasOwn(TARGET_CLASSES, selectedTarget)) {
    throw new TypeError('Choose one of the supported proposed target classes.');
  }

  const suggestions = [...new Set(legacyClasses.flatMap(c => SUGGESTIONS[c]))];
  const level = Number.isInteger(save.lvl) && save.lvl >= 1 ? save.lvl : null;
  const xp = Number.isFinite(save.xp) && save.xp >= 0 ? save.xp : null;
  const summary = {
    name: typeof save.name === 'string' && save.name.trim() ? save.name : 'Unnamed character',
    level,
    xp,
    race: typeof save.race === 'string' ? save.race : null,
    gold: Number.isFinite(save.gold) && save.gold >= 0 ? save.gold : null,
    deepestFloor: Number.isFinite(save.best) && save.best >= 0 ? save.best : null,
    equippedItems: safeCount(save.eq),
    occupiedBagSlots: safeCount(save.gen),
    materials: isRecord(save.mats) ? { ...save.mats } : null,
    potions: isRecord(save.pots) ? { ...save.pots } : null
  };

  return Object.freeze({
    previewOnly: true,
    sourceVersion: Number.isInteger(save.v) ? save.v : null,
    legacyClasses: legacyClasses.map(c => ({ id: c, label: LEGACY_LABELS[c] })),
    suggestions: suggestions.map(id => ({ id, ...TARGET_CLASSES[id] })),
    selectedTarget: selectedTarget ? { id: selectedTarget, ...TARGET_CLASSES[selectedTarget] } : null,
    preservedSummary: summary,
    warnings: [
      'This is a preview only. The original save has not been changed.',
      'Suggested class mappings are not final balance rules; choose explicitly when multiple paths fit.',
      'Class-derived stats and abilities may change in the redesigned system and need a reviewed conversion rule.',
      'Inventory and equipment are counted for review here, not converted or written.',
      'Keep an export/backup of the original save before any future migration.'
    ]
  });
}
