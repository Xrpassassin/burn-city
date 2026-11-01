'use strict';
// Original Homefront C.I.N.D.E.R.S. attribute and ember-perk progression.
// The authoritative RPG XP ledger remains server/homefront-rpg.js. This
// module only interprets *earned* level, existing skill ranks, and owned perks.
// No client route may grant levels, upgrade points, perks or bonus XP.
const ATTR_BASE = 3;
const ATTR_MAX = 10;
const START_ATTRIBUTE_POINTS = 7;
const ATTRIBUTE_INTERVAL = 5;
const PERK_INTERVAL = 3;
const ATTRIBUTES = Object.freeze([
  Object.freeze({ id:'cinderheart',letter:'C',name:'Cinderheart',focus:'Toughness, stamina and enduring hardship' }),
  Object.freeze({ id:'instinct',letter:'I',name:'Instinct',focus:'Awareness, trail signs and observation' }),
  Object.freeze({ id:'nerve',letter:'N',name:'Nerve',focus:'Staying steady during danger' }),
  Object.freeze({ id:'dexterity',letter:'D',name:'Dexterity',focus:'Agility, positioning and finesse' }),
  Object.freeze({ id:'engineering',letter:'E',name:'Engineering',focus:'Machines, repair and construction' }),
  Object.freeze({ id:'resourcefulness',letter:'R',name:'Resourcefulness',focus:'Scavenging and making do with less' }),
  Object.freeze({ id:'spirit',letter:'S',name:'Spirit',focus:'Leadership, teamwork and resolve' })
]);
// An original perk catalog: small, real server-side XP and gear-discovery
// effects (no combat damage, loot duplication or shortcut to purchased gear).
// Later skill effects can be introduced through separately reviewed contracts.
const PERKS = Object.freeze([
  Object.freeze({ id:'ash_reader',name:'Ash Reader',attribute:'instinct',minimum:5,level:3,
    effect:'Discoveries award +5 XP',xpSource:'discover',xpBonus:5 }),
  Object.freeze({ id:'salvage_eye',name:'Salvage Eye',attribute:'resourcefulness',minimum:5,level:3,
    effect:'Ordinary loot searches have +5 percentage points of gear-finding chance',gearBonus:5 }),
  Object.freeze({ id:'steady_flame',name:'Steady Flame',attribute:'nerve',minimum:5,level:6,
    effect:'Defeating an infected grants +3 XP',xpSource:'kill_infected',xpBonus:3 }),
  Object.freeze({ id:'long_burn',name:'Long Burn',attribute:'cinderheart',minimum:5,level:6,
    effect:'Completing a refuge workday grants +3 XP',xpSource:'workday',xpBonus:3 }),
  Object.freeze({ id:'forgehand',name:'Forgehand',attribute:'engineering',minimum:5,level:9,
    effect:'Completing a refuge workday grants +5 XP',xpSource:'workday',xpBonus:5 }),
  Object.freeze({ id:'dust_runner',name:'Dust Runner',attribute:'dexterity',minimum:5,level:9,
    effect:'Discovering a landmark grants +4 XP',xpSource:'discover',xpBonus:4 }),
  Object.freeze({ id:'beacon_keeper',name:'Beacon Keeper',attribute:'spirit',minimum:5,level:12,
    effect:'Rescuing a survivor grants +5 XP',xpSource:'rescue',xpBonus:5 }),
  Object.freeze({ id:'ember_wall',name:'Ember Wall',attribute:'cinderheart',minimum:6,level:15,
    effect:'Repelling a siege grants +7 XP',xpSource:'siege_repelled',xpBonus:7 }),
  Object.freeze({ id:'furnace_watch',name:'Furnace Watch',attribute:'engineering',minimum:6,level:18,skill:'engineer',skillRank:2,
    effect:'Defeating a world boss grants +5 XP',xpSource:'boss',xpBonus:5 }),
  Object.freeze({ id:'last_signal',name:'Last Signal',attribute:'spirit',minimum:6,level:21,skill:'leader',skillRank:2,
    effect:'Repelling a siege grants +4 XP',xpSource:'siege_repelled',xpBonus:4 })
]);
const attributeIds = new Set(ATTRIBUTES.map(x => x.id));
const perkIds = new Set(PERKS.map(x => x.id));
const validLevel = n => Number.isSafeInteger(n) ? Math.max(1,Math.min(30,n)) : 1;
const own = (obj,k) => !!obj && typeof obj==='object' && !Array.isArray(obj) &&
  Object.prototype.hasOwnProperty.call(obj,k);
const earnedAttributePoints = level => START_ATTRIBUTE_POINTS + Math.floor(validLevel(level) / ATTRIBUTE_INTERVAL);
const earnedPerkPoints = level => Math.floor(validLevel(level) / PERK_INTERVAL);
function defaultAttributes() { return Object.fromEntries(ATTRIBUTES.map(a => [a.id,ATTR_BASE])); }
function normalizeAttributes(input, level) {
  const result=defaultAttributes();
  let budget=earnedAttributePoints(level);
  for(const attr of ATTRIBUTES) {
    const requested=own(input,attr.id) && Number.isSafeInteger(input[attr.id]) ? input[attr.id] : ATTR_BASE;
    const spend=Math.min(budget,Math.max(0,Math.min(ATTR_MAX,requested)-ATTR_BASE));
    result[attr.id]+=spend;
    budget-=spend;
  }
  return result;
}
function attributePoints(level,attributes) {
  const attrs=normalizeAttributes(attributes,level);
  const spent=Object.values(attrs).reduce((n,v)=>n+v-ATTR_BASE,0);
  return Math.max(0,earnedAttributePoints(level)-spent);
}
function perkRequirement(perk,level,attributes,skills={}) {
  if(validLevel(level)<perk.level)return 'level';
  if(!own(attributes,perk.attribute) || attributes[perk.attribute]<perk.minimum)return 'attribute';
  if(perk.skill && (!own(skills,perk.skill)||skills[perk.skill]<perk.skillRank))return 'skill';
  return null;
}
function normalizePerks(input,level,attributes,skills={}) {
  const result=Object.create(null);
  let budget=earnedPerkPoints(level);
  for(const perk of PERKS) {
    if(!budget)break;
    if(own(input,perk.id) && input[perk.id]===true &&
        !perkRequirement(perk,level,attributes,skills)){
      result[perk.id]=true;
      budget--;
    }
  }
  return result;
}
function perkPoints(level,perks) {
  let count=0;
  for(const perk of PERKS)if(own(perks,perk.id)&&perks[perk.id]===true)count++;
  return Math.max(0,earnedPerkPoints(level)-count);
}
function perksForSheet(level,attributes,skills,owned) {
  const points=perkPoints(level,owned);
  return PERKS.map(perk => {
    const blocked=perkRequirement(perk,level,attributes,skills);
    const unlocked=own(owned,perk.id) && owned[perk.id]===true;
    return {id:perk.id,label:perk.name,rank:unlocked?1:0,max:1,
      requirement:{level:perk.level,attribute:perk.attribute,minimum:perk.minimum,
        ...(perk.skill?{skill:perk.skill,rank:perk.skillRank}:{})},
      effect:perk.effect,canLearn:!unlocked&&!blocked&&points>0,
      blockedBy:unlocked?null:blocked||(!points?'points':null)};
  });
}
function bonusExperience(source,owned) {
  let total=0;
  for(const perk of PERKS)if(perk.xpSource===source && own(owned,perk.id)&&owned[perk.id]===true)
    total+=perk.xpBonus;
  return Math.min(12,total);
}
function gearFindChance(owned) {
  const perk=PERKS.find(p=>p.id==='salvage_eye');
  return 15 + (own(owned,perk.id) && owned[perk.id]===true?perk.gearBonus:0);
}
module.exports = { ATTR_BASE, ATTR_MAX, START_ATTRIBUTE_POINTS, ATTRIBUTE_INTERVAL,
  PERK_INTERVAL, ATTRIBUTES, PERKS, attributeIds, perkIds, defaultAttributes,
  normalizeAttributes, attributePoints, earnedAttributePoints, earnedPerkPoints,
  perkRequirement, normalizePerks, perkPoints, perksForSheet, bonusExperience,
  gearFindChance };
