// Translate normalized NFT traits into explicit visual component recipes.
// Recipes are descriptive, deterministic, and never affect ownership or gameplay stats.
const text = value => String(value ?? '').trim().toLowerCase();
const first = (traits, slot) => text(traits.find(([type]) => type === slot)?.[1]);
const has = (value, pattern) => pattern.test(value);
function headwearStyle(value) {
  if (has(value, /mohawk|hawk/)) return 'none';
  if (has(value, /halo|aureole/)) return 'halo';
  if (has(value, /crown|circlet|tiara|diadem/)) return 'crown';
  if (has(value, /hood|cowl/)) return 'hood';
  if (has(value, /helmet|visor|headgear/)) return 'helmet';
  if (has(value, /beanie|knit cap/)) return 'beanie';
  if (has(value, /hat|cap|fedora|cowboy|fitted/)) return 'hat';
  if (has(value, /headband|bandana/)) return 'band';
  return value && !/none|no headwear|bald|bare/.test(value) ? 'custom' : 'none';
}
function accessoryStyle(value) {
  if (has(value, /chain|necklace|medallion|grill|bling|jewel/)) return 'chain';
  if (has(value, /relic|sigil|totem|artifact/)) return 'relic';
  if (has(value, /earring|ear cuff/)) return 'earring';
  if (has(value, /backpack|pack/)) return 'pack';
  return value && !/none|no accessory|empty/.test(value) ? 'custom' : 'none';
}
function weaponStyle(value) {
  if (has(value, /tnt|dynamite|bomb|grenade|explosive/)) return 'explosive';
  if (has(value, /rifle|shotgun|smg|pistol|gun|firearm|blaster/)) return 'firearm';
  if (has(value, /sword|blade|katana|knife|dagger/)) return 'blade';
  if (has(value, /staff|wand|spear|axe|hammer/)) return 'melee';
  return value && !/none|empty|no weapon|nothing|unarmed/.test(value) ? 'custom' : 'none';
}
function flameStyle(value) {
  if (has(value, /blue|ice|frost|cyan/)) return { style: 'blue', color: '#4bc9ef' };
  if (has(value, /green|toxic|venom/)) return { style: 'green', color: '#63d471' };
  if (has(value, /purple|void|arcane/)) return { style: 'violet', color: '#a77bff' };
  if (has(value, /white|holy|silver/)) return { style: 'white', color: '#e7f5ff' };
  if (has(value, /black|shadow|dark/)) return { style: 'shadow', color: '#5b4b79' };
  return { style: value && !/none|no flame|off/.test(value) ? 'ember' : 'default', color: '#ff7a1a' };
}
function tailStyle(value, key) {
  if (has(value, /ring|banded|striped|raccoon/)) return 'ringed';
  if (key === 'racc' && value && !/none|no tail/.test(value)) return 'ringed';
  if (has(value, /black|dark/)) return 'dark-tip';
  if (has(value, /white|silver|pale/)) return 'light-tip';
  return value && !/none|no tail/.test(value) ? 'custom' : 'ringed';
}
function wingStyle(value) {
  if (has(value, /mechanical|metal|cyber/)) return 'mechanical';
  if (has(value, /bat|demon/)) return 'bat';
  if (has(value, /angel|feather|white/)) return 'feather';
  if (has(value, /dragon|scale/)) return 'scaled';
  return value && !/none|no wing/.test(value) ? 'custom' : 'none';
}
function outfitStyle(value, key) {
  if (key === 'fk' && value && !/none|no outfit|default/.test(value)) return 'robes';
  if (has(value, /robe|keeper|wizard|monk/)) return 'robes';
  if (has(value, /armor|armour|plate|tactical|combat/)) return 'armor';
  if (has(value, /suit|formal|business/)) return 'tailored';
  if (has(value, /streetwear|hoodie|urban|casual/)) return 'streetwear';
  return value && !/none|default/.test(value) ? 'custom' : 'default';
}
function hairStyle(value) {
  if (has(value, /bald|shaved|no hair/)) return 'bald';
  if (has(value, /mohawk|hawk/)) return 'mohawk';
  if (has(value, /dread/)) return 'dreadlocks';
  if (has(value, /braid|cornrow/)) return 'braids';
  if (has(value, /afro|curly|coily/)) return 'afro';
  if (has(value, /spiky|spikes/)) return 'spiky';
  if (has(value, /long|ponytail/)) return 'long';
  if (has(value, /bun|topknot/)) return 'bun';
  if (has(value, /short|crop|fade/)) return 'short';
  return value ? 'custom' : 'default';
}
function patternStyle(value) {
  if (has(value, /camo|camouflage/)) return 'camouflage';
  if (has(value, /stripe|striped|banded/)) return 'stripes';
  if (has(value, /spot|spotted|freckle/)) return 'spots';
  if (has(value, /check|plaid|grid/)) return 'checkered';
  return value && !/none|solid|plain|default/.test(value) ? 'custom' : 'none';
}
function bodyEffect(value) {
  if (has(value, /flame on|on fire|burning|inferno/)) return 'flame-on';
  if (has(value, /heating up|heated|warm/)) return 'heating-up';
  if (has(value, /about to burn|smolder|ember/)) return 'about-to-burn';
  return value && !/none|normal|off|default/.test(value) ? 'custom' : 'none';
}
function eyeStyle(value) {
  if (has(value, /glow|flame|burn|laser|neon/)) return 'glowing';
  if (has(value, /robot|cyber|mechanical/)) return 'cyber';
  return value ? 'natural' : 'default';
}
export function resolveNftAvatarComponents(profile = {}) {
  const traits = Array.isArray(profile.renderTraits) ? profile.renderTraits : [];
  const key = String(profile.collectionKey || 'generic');
  const headwear = first(traits, 'headwear');
  const accessory = first(traits, 'accessory');
  const weapon = first(traits, 'weapon');
  const flame = first(traits, 'flame');
  const tail = first(traits, 'tail');
  const wing = first(traits, 'wing');
  const outfit = first(traits, 'outfit') || first(traits, 'armor');
  const eyes = first(traits, 'eye color');
  const eyeAppearance = first(traits, 'eye appearance');
  const body = first(traits, 'body effect');
  const mask = first(traits, 'mask');
  const expression = first(traits, 'expression');
  const hair = first(traits, 'hair style') || (has(headwear, /mohawk|hawk/) ? headwear : '');
  const markings = first(traits, 'markings');
  const pattern = first(traits, 'body pattern');
  const horns = first(traits, 'horns');
  const facialHair = first(traits, 'facial hair');
  return {
    collectionKey: key,
    headwearStyle: headwearStyle(headwear),
    accessoryStyle: accessoryStyle(accessory),
    weaponStyle: weaponStyle(weapon),
    flame: flameStyle(flame || (key === 'fk' ? 'ember' : '')),
    bodyEffect: bodyEffect(body),
    eyeAppearance,
    tailStyle: tailStyle(tail, key),
    wingStyle: wingStyle(wing),
    outfitStyle: outfitStyle(outfit, key),
    eyeStyle: eyeStyle(eyes),
    hairStyle: hairStyle(hair),
    patternStyle: patternStyle(pattern || outfit),
    hasMarkings: !!markings && !/none|no markings|clear/.test(markings),
    markings,
    hasHorns: !!horns && !/none|no horns|no antlers/.test(horns),
    horns,
    facialHair,
    hasMask: !!mask && !/none|no mask/.test(mask),
    expression: has(expression, /snarl|scream|fang|angry|open mouth/) ? 'aggressive'
      : has(expression, /smile|grin|happy/) ? 'friendly'
      : expression ? 'custom' : 'neutral',
    rawTraitCount: Array.isArray(profile.rawTraits) ? profile.rawTraits.length : 0
  };
}
