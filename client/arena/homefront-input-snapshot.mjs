// Homefront continuous-input responses arrive up to eight times per second.
// Keep scene geometry stable when only authoritative positions or survival change.
const playerId = value => String(value?.id ?? value?.userId ?? value?.accountId ?? value?.label ?? '');
const stableIds = (items, key = playerId) => (Array.isArray(items) ? items : [])
  .map(key).sort().join('|');

export function requiresHomefrontSceneRebuild(previous, next) {
  if (!previous || !next) return true;
  if (!!previous.self !== !!next.self) return true;
  if (stableIds(previous.players) !== stableIds(next.players)) return true;
  if (stableIds(previous.encounters, e => String(e?.id ?? '')) !==
      stableIds(next.encounters, e => String(e?.id ?? ''))) return true;
  // Changes to HP, current equipped weapon, party/hostility, or searchable
  // containers can alter physical scene meshes or clickable target markers.
  const oldPlayers = new Map((previous.players || []).map(p => [playerId(p), p]));
  for (const p of next.players || []) {
    const old = oldPlayers.get(playerId(p));
    if (!old || !!old.party !== !!p.party || old.label !== p.label) return true;
  }
  const oldEnemies = new Map((previous.encounters || []).map(e => [String(e.id), e]));
  for (const e of next.encounters || []) {
    const old = oldEnemies.get(String(e.id));
    if (!old || old.hp !== e.hp || old.maxHp !== e.maxHp || old.defeated !== e.defeated ||
        old.enemy !== e.enemy) return true;
  }
  const oldLoot = new Map((previous.world?.lootNodes || []).map(e => [String(e.id), e]));
  const nextLoot = next.world?.lootNodes || [];
  if (oldLoot.size !== nextLoot.length) return true;
  for (const node of nextLoot) {
    const old = oldLoot.get(String(node.id));
    if (!old || old.available !== node.available || old.label !== node.label) return true;
  }
  if ((previous.interior?.landmarkId || null) !== (next.interior?.landmarkId || null)) return true;
  if ((previous.selfWeaponMagazine?.weaponId || '') !== (next.selfWeaponMagazine?.weaponId || '')) return true;
  return false;
}

export function mergeHomefrontInputSnapshot(previous, incoming) {
  if (!incoming?.self || !previous) return previous;
  // The world GET contains a negotiated inputProtocol capability; ordinary
  // movement responses do not. Preserve it across updates.
  return { ...previous, ...incoming, inputProtocol: previous.inputProtocol };
}

export function playerPositionUpdates(snapshot) {
  if (!snapshot) return [];
  return (snapshot.players || [])
    .filter(p => Number.isFinite(p?.x) && Number.isFinite(p?.z))
    .map(p => ({ id: playerId(p), x: p.x, z: p.z, isLocalPlayer: p.label === 'You' }));
}

/**
 * Visual-only action proximity. Server endpoints independently validate loot,
 * combat, and environment range using authoritative player coordinates.
 */
export function homefrontInputProximity(snapshot, {
  selectedLootId = null, selectedCombatTargetId = null, selectedEnvironmentId = null
} = {}) {
  const self = snapshot?.self;
  const distance = point => self && Number.isFinite(self.x) && Number.isFinite(self.z) &&
    Number.isFinite(point?.x) && Number.isFinite(point?.z)
    ? Math.hypot(self.x - point.x, self.z - point.z) : Infinity;
  const loot = (snapshot?.world?.lootNodes || []).find(node => node.id === selectedLootId) || null;
  const encounter = snapshot?.selfEncounter || snapshot?.encounter || null;
  const environment = (snapshot?.world?.environmentStructures || [])
    .find(item => item.id === selectedEnvironmentId) || null;
  const enemyDistance = distance(encounter);
  const enemyInReach = !!encounter && !encounter.defeated && encounter.hp > 0 &&
    enemyDistance <= (Number.isFinite(encounter.range) ? encounter.range : 0);
  const targetMatches = !!encounter && encounter.id === selectedCombatTargetId;
  const environmentActive = !!environment && environment.collisionEnabled !== false &&
    environment.health > 0 && environment.stage !== 'destroyed';
  return {
    loot, nearLoot: !!loot && distance(loot) <= 9,
    canLoot: !!loot?.available && distance(loot) <= 9,
    encounter, enemyDistance, enemyInReach, targetMatches,
    canAttack: enemyInReach, canAutoFire: enemyInReach && targetMatches,
    environment, canDamageEnvironment: environmentActive && distance(environment) <= 8
  };
}
