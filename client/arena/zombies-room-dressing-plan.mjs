// Deterministic visual-only environmental cues for the ORIGINAL Zombies map
// generator. The server owns every wall, door, zombie route and interaction:
// this module reads (never edits) its room grid. Its source is our own code
// using THREE.InstancedMesh, not a copied generator or downloaded game asset.
export const ZOMBIES_ROOM_PALETTE=Object.freeze({
 spawn: {shell:0x45433a,metal:0x62564a,light:0xb87543},
 corridor: {shell:0x353b40,metal:0x606167,light:0xa9774d},
 control: {shell:0x3b4851,metal:0x6c747b,light:0x7da9ad},
 warehouse: {shell:0x534c41,metal:0x80745e,light:0xba9355},
 lab: {shell:0x454c4c,metal:0x748387,light:0x74a58d},
 furnace: {shell:0x53392f,metal:0x82705b,light:0xc56b35},
 courtyard: {shell:0x48504a,metal:0x738075,light:0x929d80},
 cold: {shell:0x424c53,metal:0x6d7a81,light:0x85b5c0},
 archive: {shell:0x484038,metal:0x837466,light:0xa58d65},
 slag: {shell:0x50403a,metal:0x756d5e,light:0xb66b48},
 pump: {shell:0x3c4b4a,metal:0x687673,light:0x77afa7},
 generator: {shell:0x484844,metal:0x757970,light:0xd2ad61},
 chapel: {shell:0x393139,metal:0x6e5963,light:0xb06c70},
 loading: {shell:0x4d4842,metal:0x857a68,light:0xc1a172},
 industrial: {shell:0x44413d,metal:0x776d63,light:0x9a8059}
});
export function zombieRoomTheme(name='',index=0){
 const s=String(name).toLowerCase();
 if(index===0||/spawn bay/.test(s))return 'spawn';
 if(/corridor|service tunnel|steam gallery|conveyor hall/.test(s))return 'corridor';
 for(const [kind,re] of [
  ['control',/control|command|operations/],['warehouse',/warehouse|stock/],
  ['lab',/\blab\b|research|medical|surgical/],['furnace',/furnace|forge|kiln/],
  ['courtyard',/courtyard|yard/],['cold',/cold|freezer|refrigerat/],
  ['archive',/archive|record/],['slag',/slag|smelt/],
  ['pump',/pump|water|hydro/],['generator',/generator|reactor|transformer/],
  ['chapel',/chapel|cinder|shrine/],['loading',/loading|dock|depot/]
 ])if(re.test(s))return kind;
 return 'industrial';
}
// Concentrated, authored-looking burns rather than the legacy grid of
// identical flame billboards on every wall. Pure, deterministic, seed-stable.
export function zombieWallFireDecision(layout,zone,c,r,dc,dr){
 const kind=zombieRoomTheme(layout?.zones?.[zone]?.n??'',zone);
 const chance=layout?.kind==='cosmodrome'?65:
  kind==='furnace'||kind==='slag'?400:
  kind==='chapel'?140:
  kind==='cold'||kind==='lab'||kind==='archive'?40:
  kind==='control'||kind==='generator'?80:
  kind==='spawn'?105:130;
 const seed=Number.isFinite(layout?.seed)?layout.seed|0:0;
 let h=(Math.imul(c+97,73856093)^Math.imul(r+53,19349663)^
       Math.imul(dc+3,83492791)^Math.imul(dr+3,15485863)^
       Math.imul(zone+1,3234846615)^seed)>>>0;
 h=Math.imul(h^(h>>>16),0x7feb352d)>>>0;
 h=Math.imul(h^(h>>>15),0x846ca68b)>>>0;
 return ((h^(h>>>16))>>>0)%1000<chance;
}

function seedHash(value){
 let h=2166136261;
 for(const char of String(value)){h^=char.charCodeAt(0);h=Math.imul(h,16777619);}
 return h>>>0;
}
const around=[[0,-1],[-1,0],[0,1],[1,0]];
export function planZombiesRoomDressing(layout,{low=false}={}){
 const {grid:G,gw=G?.[0]?.length??0,gh=G?.length??0,cell=2,zones=[]}=layout||{};
 if(!Array.isArray(G)||!G.length||!Array.isArray(zones)||!zones.length||
  !Number.isFinite(cell)||cell<=0||gw<5||gh<5)return [];
 const seed=layout.seed??layout.name??'refinery';
 const occupied=new Set(),critical=new Set();
 for(const [c0,c1,r0,r1] of layout.obst||[]){
  for(let r=Math.max(0,r0);r<=Math.min(gh-1,r1);r++)
   for(let c=Math.max(0,c0);c<=Math.min(gw-1,c1);c++)occupied.add(r*gw+c);
 }
 const mark=(c,r,radius=1)=>{
  if(!Number.isFinite(c)||!Number.isFinite(r))return;
  for(let dr=-radius;dr<=radius;dr++)for(let dc=-radius;dc<=radius;dc++){
   if(r+dr>=0&&r+dr<gh&&c+dc>=0&&c+dc<gw)
    critical.add((r+dr)*gw+c+dc);
  }
 };
 for(let r=0;r<gh;r++)for(let c=0;c<gw;c++)
  if(G[r]?.[c]>=100)mark(c,r,2);
 // Window break-in points, buy stations, forge and power switch stay unobscured.
 for(const v of layout.windef||[])mark(v[0],v[1],1);
 for(const v of layout.windows||[])mark(v.c??Math.floor((v.x||0)/cell+gw/2),
  v.r??Math.floor((v.z||0)/cell+gh/2),1);
 const worldToCell=(x,z)=>[Math.floor(x/cell+gw/2),Math.floor(z/cell+gh/2)];
 for(const a of [...(layout.wallbuys||[]),...(Array.isArray(layout.perks)?layout.perks:Object.values(layout.perks||{})),
  ...(layout.forge?[layout.forge]:[]),...(layout.power?[layout.power]:[])]){
  if(!Number.isFinite(a?.x)||!Number.isFinite(a?.z))continue;
  mark(...worldToCell(a.x,a.z),2);
 }
 for(const item of layout.box||[]){
  if(Array.isArray(item)&&Number.isFinite(item[0])&&Number.isFinite(item[1]))
   mark(...worldToCell(item[0],item[1]),2);
 }
 const used=[],sites=[];
 const kind=String(layout.kind||'proc');
 for(let i=0;i<zones.length;i++){
  const zone=zones[i];
  if(!zone||zone.lv)continue; // The rooftop helipad stays clear.
  const theme=zombieRoomTheme(zone.n??zone.name??'',i);
  const cells=[],candidates=[];
  const [c0,c1,r0,r1]=zone.r||[1,gw-2,1,gh-2];
  for(let r=Math.max(1,r0);r<=Math.min(gh-2,r1);r++)
   for(let c=Math.max(1,c0);c<=Math.min(gw-2,c1);c++){
    if(G[r]?.[c]!==i||occupied.has(r*gw+c))continue;
    cells.push([c,r]);
    if(critical.has(r*gw+c))continue;
    for(const [dc,dr] of around){
     if(G[r+dr]?.[c+dc]!==-1||occupied.has((r+dr)*gw+c+dc))continue;
     const hash=seedHash(seed+':'+i+':'+c+':'+r+':'+dc+':'+dr);
     candidates.push({c,r,dc,dr,hash});
    }
   }
  if(!candidates.length)continue;
  const max=low?2:4;
  const wanted=Math.min(max,Math.max(1,Math.floor(cells.length/(low?92:48))+1));
  candidates.sort((a,b)=>a.hash-b.hash||a.r-b.r||a.c-b.c);
  let placed=0;
  for(const v of candidates){
   if(placed>=wanted)break;
   const x=(v.c-gw/2)*cell+1+v.dc*cell*0.50,
         z=(v.r-gh/2)*cell+1+v.dr*cell*0.50;
   if(used.some(p=>Math.hypot(p.x-x,p.z-z)<3.7))continue;
   const yaw=v.dr<0?0:v.dr>0?Math.PI:v.dc<0?Math.PI/2:-Math.PI/2;
   const site={x,z,yaw,theme,zone:i,c:v.c,r:v.r,dc:v.dc,dr:v.dr,
    variant:v.hash%4,hash:v.hash};
   sites.push(site);used.push(site);placed++;
  }
 }
 return sites;
}
