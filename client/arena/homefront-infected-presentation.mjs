// Shared type mapping for the existing Zombies model and sound directors.
export function infectedPresentation(enemy = '') {
  const name = String(enemy).toLowerCase();
  if (/crawler|crawl/.test(name)) return { ty: 5, cr: true };
  if (/brute|juggernaut|heavy|boss/.test(name)) return { ty: 3, cr: false };
  if (/runner|fast/.test(name)) return { ty: 1, cr: false };
  return { ty: 0, cr: false };
}

// Older snapshots may contain only the encounter anchor.
export function visibleInfected(encounters = []) {
  return encounters.flatMap(encounter => {
    if (encounter.defeated || encounter.hp <= 0) return [];
    if (!Array.isArray(encounter.members) || !encounter.members.length) return [encounter];
    return encounter.members
      .filter(member => !member.defeated && member.hp > 0 && Number.isFinite(member.x) && Number.isFinite(member.z))
      .map(member => ({
        ...member, enemy: encounter.enemy, range: encounter.range,
        parentEncounterId: encounter.id
      }));
  });
}
