// Preserve the player's in-run Zombies progression during the Map 1 -> Map 2 helicopter handoff.
// Combat/life state is deliberately reset by the new map; economy, loadout, perks, forged tiers, and chosen boons carry over.
function capture(players) {
  return new Map([...players.values()].map(p => [p.id, {
    pts: p.pts | 0, ptsAcc: Number(p.ptsAcc) || 0, guns: [...(p.guns || ['flamer'])], slot: p.slot | 0,
    perks: p.perks | 0, up: [...(p.up || [])], up2: [...(p.up2 || [])], bon: { ...(p.bon || {}) }
  }]));
}
function restore(players, saved) {
  for (const p of players.values()) {
    const s = saved.get(p.id); if (!s) continue;
    p.pts = s.pts; p.ptsAcc = s.ptsAcc; p.guns = [...s.guns]; p.slot = Math.max(0, Math.min(s.slot, p.guns.length - 1));
    p.perks = s.perks; p.up = [...s.up]; p.up2 = [...s.up2]; p.bon = { ...s.bon };
    p.hp = (p.perks & 1 ? 250 : 100) + 20 * (p.bon.hp || 0); p.fuel = 100; p.cd = 0; p.down = 0; p.usedSelf = false; p.draft = null;
  }
}
module.exports = { capture, restore };
