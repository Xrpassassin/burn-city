// Shared type mapping for the existing Zombies model and sound directors.
export function infectedPresentation(enemy = '') {
  const name = String(enemy).toLowerCase();
  if (/crawler|crawl/.test(name)) return { ty: 5, cr: true };
  if (/brute|juggernaut|heavy|boss/.test(name)) return { ty: 3, cr: false };
  if (/runner|fast/.test(name)) return { ty: 1, cr: false };
  return { ty: 0, cr: false };
}
