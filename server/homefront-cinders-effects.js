'use strict';
// Gameplay-only, bounded C.I.N.D.E.R.S. effects. Read attributes exclusively from
// Rpg.get() / Rpg.normalizeProfile() on the server. This module must never accept
// an attribute level or effect from an authenticated player's request payload.
// Every scale defaults to the existing Homefront baseline at scores of 3.
const Cinders = require('./homefront-cinders');
const own = (o,k) => !!o && typeof o==='object' && !Array.isArray(o) &&
  Object.prototype.hasOwnProperty.call(o,k);
const BASE = Object.freeze({
  needScale:1, staminaScale:1, lootNoiseScale:1, aimStabilityBonus:0,
  repairHpBonus:0, foodRestoreBonus:0, restRestoreBonus:0
});
function fromAttributes(attributes) {
  const rank = id => {
    const value=own(attributes,id) && Number.isSafeInteger(attributes[id])
      ? attributes[id] : Cinders.ATTR_BASE;
    return Math.max(0,Math.min(Cinders.ATTR_MAX,value)-Cinders.ATTR_BASE);
  };
  const c=rank('cinderheart'),i=rank('instinct'),n=rank('nerve'),
    d=rank('dexterity'),e=rank('engineering'),
    r=rank('resourcefulness'),s=rank('spirit');
  return Object.freeze({
    needScale: Math.max(0.93,1-c*0.01),
    staminaScale: Math.max(0.895,1-c*0.005-d*0.01),
    lootNoiseScale: Math.max(0.895,1-i*0.015),
    aimStabilityBonus: Math.min(0.063,n*0.009),
    repairHpBonus: Math.min(10,Math.floor(e*1.5)),
    foodRestoreBonus: Math.min(9,r*1.25),
    restRestoreBonus: Math.min(11,s*1.5)
  });
}
function normalizeEffects(raw) {
  // Saved world state is server-owned, but validate it when loading older
  // saves or rolling back to a release without C.I.N.D.E.R.S. support.
  const clamp=(key,min,max)=>own(raw,key) && typeof raw[key]==='number' &&
    Number.isFinite(raw[key]) ? Math.max(min,Math.min(max,raw[key])):BASE[key];
  return Object.freeze({
    needScale:clamp('needScale',0.93,1),
    staminaScale:clamp('staminaScale',0.895,1),
    lootNoiseScale:clamp('lootNoiseScale',0.895,1),
    aimStabilityBonus:clamp('aimStabilityBonus',0,0.063),
    repairHpBonus:clamp('repairHpBonus',0,10),
    foodRestoreBonus:clamp('foodRestoreBonus',0,9),
    restRestoreBonus:clamp('restRestoreBonus',0,11)
  });
}
function summary(effects) {
  const e=normalizeEffects(effects);
  return Object.freeze({
    needsReductionPct:Math.round((1-e.needScale)*1000)/10,
    staminaSavingsPct:Math.round((1-e.staminaScale)*1000)/10,
    searchNoiseReductionPct:Math.round((1-e.lootNoiseScale)*1000)/10,
    aimStabilityBonusPct:Math.round(e.aimStabilityBonus*1000)/10,
    repairBonusHp:Math.floor(e.repairHpBonus),
    foodRestoreBonus:e.foodRestoreBonus,
    restRestoreBonus:e.restRestoreBonus
  });
}
module.exports={BASE,fromAttributes,normalizeEffects,summary};
