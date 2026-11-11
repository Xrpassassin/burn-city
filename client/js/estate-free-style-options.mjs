// Explicitly free visual-only finish choices for all five estate tiers.
// Never turn these into Tycoon IDs, prestige levels, payments or share weights.
export const ESTATE_ARCHITECTURES=Object.freeze({
 classic:'Classic',modern:'Modern',rustic:'Rustic'
});
export const ESTATE_PALETTES=Object.freeze({
 original:{label:'Original',colors:{}},
 coastal:{label:'Coastal',colors:{plaster:0xe9e4d4,ivory:0xf0e9d9,siding:0xa4b6b5,roof:0x526e7b,slate:0x536d79,timber:0x9b8165,stone:0xa6a8a0,frame:0x324b5b,metal:0x637c86,brass:0xc3aa80}},
 forest:{label:'Forest',colors:{plaster:0xc4cbbb,ivory:0xdee0cd,siding:0x657f6a,roof:0x394b41,slate:0x46564b,timber:0x8d6449,stone:0x818575,frame:0x263f35,metal:0x536258,brass:0xbca06e}},
 charcoal:{label:'Charcoal',colors:{plaster:0x92959a,ivory:0xbfc0b9,siding:0x69747f,roof:0x252c33,slate:0x343c45,timber:0x85654e,stone:0x777b7f,frame:0x19242d,metal:0x59636b,brass:0xb49864}}
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
