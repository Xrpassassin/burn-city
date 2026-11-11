// Curated, original, low-saturation exterior palettes shared by all five tiers.
// One calm field color, one lighter architectural trim, one darker roof and
// a restrained door accent. Material identities stay consistent across styles.
// Never turn these choices into Tycoon IDs, receipts or financial entitlements.
export const ESTATE_ARCHITECTURES=Object.freeze({
 classic:'Classic',modern:'Modern',rustic:'Rustic'
});
export const ESTATE_ARCHITECTURE_NOTES=Object.freeze({
 classic:'Balanced stonework, subtle cornices and welcoming cream trim.',
 modern:'Quiet metal lines, natural timber screens and understated glazing.',
 rustic:'Exposed timber joinery, stone bases and sheltered eave details.'
});
export const ESTATE_PALETTES=Object.freeze({
 original:{
  label:'Warm Neutral',description:'Warm limestone, cream trim, slate roofing and walnut timber.',
  colors:{plaster:0xd3c7b6,ivory:0xe3dbca,siding:0x889390,trim:0xe5dfd0,
   roof:0x474b4a,slate:0x535856,frame:0x444744,timber:0x89694f,
   door:0x6d4d38,stone:0xaaa291,brass:0xada079,metal:0x6a746f,
   copper:0x98775d,glass:0x647e80}
 },
 coastal:{
  label:'Coastal',description:'Weathered blue-grey siding, soft sand, off-white trim and sea-glass doors.',
  colors:{plaster:0xd9d7cc,ivory:0xeae6d9,siding:0x9aaeb1,trim:0xede9dd,
   roof:0x55666b,slate:0x607076,frame:0x445b61,timber:0xa38c70,
   door:0x637b78,stone:0xa9a89a,brass:0xb5a486,metal:0x697f82,
   copper:0xa18971,glass:0x70898b}
 },
 forest:{
  label:'Forest',description:'Muted sage, warm ivory, natural oak and deep moss roofing.',
  colors:{plaster:0xc0c3ad,ivory:0xdedcc7,siding:0x7d8b78,trim:0xe1d8c4,
   roof:0x4a5244,slate:0x525f4d,frame:0x39463d,timber:0x8f6d4f,
   door:0x70533b,stone:0x979182,brass:0xb6a075,metal:0x626e62,
   copper:0x987354,glass:0x637d73}
 },
 charcoal:{
  label:'Charcoal',description:'Soft charcoal-greige, linen trim and honeyed wood accents.',
  colors:{plaster:0x979a98,ivory:0xc2c1b6,siding:0x757f80,trim:0xd7d0c2,
   roof:0x33393d,slate:0x42484d,frame:0x2c3438,timber:0x9c7a59,
   door:0x906949,stone:0x928d84,brass:0xb79c72,metal:0x596367,
   copper:0xa27c5d,glass:0x64787c}
 }
});
export const DEFAULT_FREE_STYLE=Object.freeze({architecture:'classic',palette:'original'});
export function estateFreeStyle(style={}){
 return {
  architecture:Object.hasOwn(ESTATE_ARCHITECTURES,style?.architecture)?style.architecture:DEFAULT_FREE_STYLE.architecture,
  palette:Object.hasOwn(ESTATE_PALETTES,style?.palette)?style.palette:DEFAULT_FREE_STYLE.palette
 };
}
export function estatePaletteColor(key,palette,base){
 const p=ESTATE_PALETTES[palette]||ESTATE_PALETTES.original;
 return Object.hasOwn(p.colors,key)?p.colors[key]:base;
}
export function estatePalettePreview(palette){
 const colors=(ESTATE_PALETTES[palette]||ESTATE_PALETTES.original).colors;
 return Object.freeze([colors.plaster,colors.trim,colors.roof,colors.door]);
}
