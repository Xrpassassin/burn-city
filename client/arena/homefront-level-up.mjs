// HUD-only feedback after a server-confirmed Homefront RPG level change.
// Never grants ranks/XP or mutates a profile. This sits in normal page flow
// so a level-up prompt does not cover the mobile joystick or combat actions.
export function levelUpNotice(previousLevel, sheet) {
  const level = sheet?.level;
  if (!Number.isSafeInteger(previousLevel) ||
      !Number.isSafeInteger(level) ||
      previousLevel < 1 || level <= previousLevel || level > 30) return null;
  const earned = level - previousLevel;
  const skillPoints = Number.isSafeInteger(sheet.skillPoints) ? Math.max(0,sheet.skillPoints) : 0;
  const attributePoints = Number.isSafeInteger(sheet.attributePoints) ? Math.max(0,sheet.attributePoints) : 0;
  const perkPoints = Number.isSafeInteger(sheet.perkPoints) ? Math.max(0,sheet.perkPoints) : 0;
  return Object.freeze({
    level, gained:earned,
    title:'🔥 LEVEL '+level+' REACHED',
    message:earned+' level'+(earned===1?'':'s')+' gained · '+
      skillPoints+' skill · '+attributePoints+' attribute · '+
      perkPoints+' Ember perk points unspent',
    action:'Open C.I.N.D.E.R.S. upgrades'
  });
}
