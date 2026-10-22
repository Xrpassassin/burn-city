/**
 * Deterministic, read-only draft planner for Eternal Grind beta migration.
 *
 * This deliberately does NOT emit a game-ready save, mutate storage, calculate
 * target stats, or claim item compatibility. The target class model is proposed
 * and still requires gameplay review.
 */
export const MIGRATION_RULESET_ID = 'eg-beta-class-preview-v1';

const TARGET_CLASSES = Object.freeze({
  vanguard: { label: 'Vanguard', specializations: ['Bulwark', 'Weaponmaster'] },
  warden: { label: 'Warden', specializations: ['Grovekeeper', 'Wildbound'] },
  arcanist: { label: 'Arcanist', specializations: ['Spellfire', 'Runeseer'] },
  ranger: { label: 'Ranger', specializations: ['Deadeye', 'Trapper'] },
  reaver: { label: 'Reaver', specializations: ['Bloodedge', 'Ravager'] },
  binder: { label: 'Binder', specializations: ['Pactcaller', 'Hexbinder'] }
});
const LEGACY_CLASSES = new Set(['warrior', 'rogue', 'ranger', 'mage']);
const isObject = x => x !== null && typeof x === 'object' && !Array.isArray(x);
const countOccupied = x => Array.isArray(x)
  ? x.filter(Boolean).length
  : isObject(x) ? Object.values(x).filter(Boolean).length : 0;
const cloneJson = value => JSON.parse(JSON.stringify(value));

function validateSource(save) {
  if (!isObject(save)) throw new TypeError('Source save must be a JSON object.');
  if (!Number.isInteger(save.v) || save.v < 1) throw new TypeError('Source save must have a recognized integer version.');
  if (!Number.isInteger(save.lvl) || save.lvl < 1) throw new TypeError('Source level must be a positive integer.');
  if (!Number.isFinite(save.xp) || save.xp < 0) throw new TypeError('Source XP must be a finite non-negative number.');
  if (save.gold !== undefined && (!Number.isFinite(save.gold) || save.gold < 0)) throw new TypeError('Source gold must be a finite non-negative number.');
  const classes = (Array.isArray(save.classes) && save.classes.length ? save.classes : [save.cls])
    .filter(c => typeof c === 'string' && LEGACY_CLASSES.has(c)).slice(0, 3);
  if (!classes.length) throw new TypeError('Source must contain a recognized legacy class.');
  return classes;
}

/**
 * Build a stable draft plan for a player-selected target class.
 * The result is a report, not a serializable replacement save.
 */
export function buildMigrationPlan(save, selectedTarget, rulesetId = MIGRATION_RULESET_ID) {
  const legacyClasses = validateSource(save);
  if (!Object.hasOwn(TARGET_CLASSES, selectedTarget)) {
    throw new TypeError('Select a supported proposed target class.');
  }
  if (typeof rulesetId !== 'string' || !rulesetId.trim()) {
    throw new TypeError('A non-empty migration ruleset ID is required.');
  }

  const source = cloneJson(save);
  const target = TARGET_CLASSES[selectedTarget];
  const summary = {
    name: typeof source.name === 'string' && source.name.trim() ? source.name : 'Unnamed character',
    sourceVersion: source.v,
    legacyClasses: legacyClasses.map(id => ({ id, label: id[0].toUpperCase() + id.slice(1) })),
    level: source.lvl,
    xp: source.xp,
    race: typeof source.race === 'string' ? source.race : null,
    gold: Number.isFinite(source.gold) ? source.gold : null,
    deepestFloor: Number.isFinite(source.best) ? source.best : null,
    equippedItems: countOccupied(source.eq),
    occupiedBagSlots: countOccupied(source.gen),
    materials: isObject(source.mats) ? cloneJson(source.mats) : null,
    potions: isObject(source.pots) ? cloneJson(source.pots) : null
  };

  return {
    planType: 'preview-only',
    readyForCommit: false,
    rulesetId,
    sourceSummary: summary,
    proposed: {
      targetClass: { id: selectedTarget, label: target.label },
      specializationChoiceRequired: true,
      availableSpecializations: [...target.specializations],
      tentativeProgression: {
        level: source.lvl,
        xp: source.xp,
        status: 'preserve-as-preview-only; target level/XP conversion rule is not approved'
      }
    },
    fieldDisposition: [
      { field: 'identity/race', status: 'review-retention' },
      { field: 'class and derived stats', status: 'requires-target-ruleset' },
      { field: 'level and XP', status: 'tentative-retention-only' },
      { field: 'abilities and weapon skills', status: 'requires-explicit-mapping' },
      { field: 'equipment and inventory', status: 'requires-item-by-item-compatibility-review' },
      { field: 'gold, materials, potions', status: 'review-retention-and-bounds' },
      { field: 'depth, unlocks, quests', status: 'requires-progression-compatibility-review' }
    ],
    sourceIntegrity: {
      inputMutated: false,
      originalSaveWritten: false,
      storageAccessed: false
    },
    blockers: [
      'The proposed target class system and specialization rules are not approved.',
      'Target-derived stats and ability mappings have not been implemented.',
      'Equipment and inventory compatibility has not been reviewed item by item.',
      'No backup, source digest, staged writer, or rollback operation is performed by this planner.'
    ]
  };
}

export function migrationTargetOptions() {
  return Object.entries(TARGET_CLASSES).map(([id, value]) => ({
    id, label: value.label, specializations: [...value.specializations]
  }));
}
