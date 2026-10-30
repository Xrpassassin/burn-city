// Pure responsive layout policy for Estates panels. No DOM dependencies.
// The host uses these rectangles to keep controls clear of movement and wallet UI.
const finite = n => typeof n === 'number' && Number.isFinite(n);
const rect = (x,y,width,height) => Object.freeze({x,y,width,height});
export function overlapsRect(a,b,padding=0) {
  return a.x < b.x+b.width+padding && a.x+a.width+padding > b.x &&
    a.y < b.y+b.height+padding && a.y+a.height+padding > b.y;
}
export function planEstatesPanel({width,height,blocked=[],safeInset=12,preferredWidth=360}={}) {
  if (![width,height,safeInset,preferredWidth].every(finite) || width<=0 || height<=0 || safeInset<0 || preferredWidth<=0 || !Array.isArray(blocked))
    throw new TypeError('invalid viewport');
  if (blocked.some(r=>!r||![r.x,r.y,r.width,r.height].every(finite)||r.width<0||r.height<0))
    throw new TypeError('invalid blocked rectangle');
  const usableW=width-2*safeInset, usableH=height-2*safeInset;
  if (usableW<=0||usableH<=0) return Object.freeze({mode:'closed',reason:'viewport-too-small',panel:null});
  const mobile=width<700;
  const panelW=Math.min(preferredWidth,usableW);
  const panelH=Math.min(mobile?Math.min(380,usableH*.58):Math.min(620,usableH),usableH);
  const candidates=mobile?[
    rect(safeInset,height-safeInset-panelH,usableW,panelH),
    rect(safeInset,safeInset,usableW,panelH)
  ]:[
    rect(width-safeInset-panelW,safeInset,panelW,panelH),
    rect(safeInset,safeInset,panelW,panelH)
  ];
  const free=candidates.find(candidate=>blocked.every(b=>!overlapsRect(candidate,b,8)));
  return Object.freeze(free?{mode:mobile?'bottom-sheet':'side-panel',panel:free,reason:null}:
    {mode:'collapsed',panel:null,reason:'controls-occlude-panel'});
}
export function propertyDirectoryEntry(lot,ownedPropertyIds=[]) {
  if(!lot||typeof lot.id!=='string'||!Array.isArray(ownedPropertyIds)) throw new TypeError('invalid property');
  return Object.freeze({lotId:lot.id,propertyId:lot.propertyId??null,address:lot.address??'Unassigned lot',
    tier:lot.tier??null,owned:Boolean(lot.propertyId&&ownedPropertyIds.includes(lot.propertyId)),
    assigned:Boolean(lot.propertyId)});
}
