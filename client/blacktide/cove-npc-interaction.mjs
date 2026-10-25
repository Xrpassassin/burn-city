export const MARA_INTERACTION_RANGE = 3.5;
export function canTalkToMara(ashore, player, npc) {
  return !!ashore && !!player && !!npc && Number.isFinite(player.x) && Number.isFinite(player.z) && Math.hypot(player.x-npc.x,player.z-npc.z) <= MARA_INTERACTION_RANGE;
}
