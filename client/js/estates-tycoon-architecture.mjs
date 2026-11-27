// Pure exterior architectural upgrade layout: metres relative to the existing lot.
// The purchases remain server-owned. Never generate unlocks from local wallet state.
// These simple, deliberately measured parts keep public paths and neighboring lots clear.
const KNOWN=Object.freeze(['porch-lights','flower-garden','custom-sign','cozy-awning','privacy-fence',
 'fire-pit','game-lounge','garden-pond','reinforced-floor','grow-lounge','hobby-workshop',
 'roof-garden','hidden-hatch','grow-lounge-deluxe','security-upgrade','underground-bunker','bunker-arcade']);
export const ESTATE_EXTERIOR_ITEM_IDS=KNOWN;
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
export function estateUpgradeExteriorParts(lot,unlockedIds=[]){
 const f=lot?.buildingFootprint,plot=lot?.dimensions??{width:20,depth:18};
 if(!f||![f.width,f.depth,f.height,plot.width,plot.depth].every(Number.isFinite)||
  f.width<=0||f.depth<=0||f.height<=0||plot.width<16||plot.depth<15||
  f.width>=plot.width-2||f.depth>=plot.depth-2)throw TypeError('invalid_estate_architecture_footprint');
 if(!Array.isArray(unlockedIds))throw TypeError('upgrade_ids_required');
 const purchased=new Set(unlockedIds.filter(id=>KNOWN.includes(id)));
 const parts=[],W=f.width,D=f.depth,H=f.height,front=D/2,edgeX=plot.width/2,edgeZ=plot.depth/2;
 const doorX=lot.tier==='apartment'?0:-(W-.6)*.24;
 const roofBody=lot.tier==='apartment'?H-.55:lot.tier==='trailer'?H-.55:H*.72;
 const top=.3+roofBody,flat=lot.tier==='apartment'||lot.tier==='mansion';
 // The rendered shell is recessed .3 m inside the foundation footprint (see
 // estates-house-design.mjs). Wall-mounted parts sit flush on these planes
 // instead of hovering ~0.4 m in front of the facade.
 const wallF=D/2-.3,wallX=W/2-.3,shellW=W-.6,shellD=D-.6;
 const floors=lot.tier==='apartment'?3:['family','mansion'].includes(lot.tier)?2:1;
 const storey=roofBody/floors,doorH=Math.min(2.2,roofBody*.78);
 // Clear wall strip between the entry frame (±.675) and the nearest window
 // surround, and between the two rear windows.
 const rearGap=shellW*.17-.09;
 // A 2.2-metre yard fixture fits beside the widest existing mansion (13 m shell).
 const sideX=clamp(W/2+(edgeX-W/2)/2,5,edgeX-1.2);
 const frontZ=edgeZ-1.25;
 const p=(id,name,x,y,z,w,h,d,mat,placement='yard',shape='box')=>{
  if(![x,y,z,w,h,d].every(Number.isFinite)||w<=0||h<=0||d<=0)throw TypeError('invalid_upgrade_geometry');
  parts.push(Object.freeze({id,name:id+'-'+name,x,y,z,w,h,d,mat,placement,shape}));
 };
 const supported=(id,name,x,z,w,d,material='wood')=>{
  p(id,name+'-base',x,.13,z,w,.16,d,material);
  p(id,name+'-inset',x,.235,z,w-.2,.06,d-.2,'earth');
 };
 // Soft additive halo around a light source: reads as a glowing bulb at dusk,
 // stays subtle in daylight, and costs one shared instanced draw.
 const halo=(id,name,x,y,z,r,placement='yard')=>p(id,name,x,y,z,r,r,r,'glow',placement,'sphere');
 const lampZ=clamp(wallF+2.05,wallF+1.75,frontZ-.55);
 const slabTop=.23;
 for(const id of KNOWN){
  if(!purchased.has(id))continue;
  switch(id){
   case 'porch-lights':{
    // Flush wall sconces either side of the entry frame plus two path bollards
    // that flank (never sit on) the stepping-stone approach.
    const sy=Math.min(1.62,top-.55);
    for(const side of [-1,1]){
      const x=doorX+side*.79;
      p(id,'wall-base-'+side,x,sy,wallF+.03,.14,.36,.06,'metal','attached');
      p(id,'wall-lantern-'+side,x,sy,wallF+.14,.17,.26,.16,'warm','attached');
      p(id,'lantern-cap-'+side,x,sy+.16,wallF+.14,.2,.06,.2,'brass','attached');
      halo(id,'wall-halo-'+side,x,sy,wallF+.16,.42,'attached');
      const bx=doorX+side*1.0;
      p(id,'path-pedestal-'+side,bx,.4,lampZ,.16,.7,.16,'metal','yard','cylinder');
      p(id,'path-light-'+side,bx,.82,lampZ,.22,.16,.22,'warm','yard','cylinder');
      p(id,'path-light-cap-'+side,bx,.93,lampZ,.27,.06,.27,'slate','yard','cylinder');
      halo(id,'path-halo-'+side,bx,.82,lampZ,.5);
    }
    const start=wallF+.6,end=edgeZ-.65,count=Math.max(2,Math.floor((end-start)/.84));
    for(let i=0;i<count;i++){
      const z=start+(i+.5)*(end-start)/count;
      p(id,'entry-paver-'+i,doorX,.055,z,1.06,.1,.6,'stone');
    }
    break;
   }
   case 'flower-garden':{
    // Raised beds read as lush planting: a low foliage mound with a staggered,
    // three-colour row of blooms rather than three lollipops on sticks.
    const blooms=['flower','gold','violet','flower','gold'];
    for(const [j,z]of [2.8,-.5].entries()){
     supported(id,'flower-bed-'+j,-sideX,z,1.3,2,lot.tier==='mansion'?'stone':lot.tier==='apartment'?'metal':'wood');
     p(id,'flower-foliage-'+j,-sideX,.36,z,1.02,.3,1.72,'green','yard','sphere');
     blooms.forEach((mat,k)=>{
      const dz=-.68+k*.34,dx=(k%2?.22:-.22);
      p(id,'flower-stem-'+j+'-'+k,-sideX+dx,.5,z+dz,.05,.24,.05,'green');
      p(id,'flower-bloom-'+j+'-'+k,-sideX+dx,.66,z+dz,.24,.17,.24,j?blooms[(k+1)%5]:mat,'yard','sphere');
     });
    }break;
   }
   case 'custom-sign':{
    // Street-facing monument beside the gate, clear of the path, the porch
    // bollards and the pitched-roof terrace on the left of the lot.
    const x=clamp(doorX+3.0,-edgeX+1.6,edgeX-1.6),z=frontZ-.45;
    for(const side of [-1,1])p(id,'sign-post-'+side,x+side*.78,.85,z,.13,1.6,.15,'wood');
    p(id,'sign-plaque',x,1.32,z,1.8,.62,.13,lot.tier==='mansion'?'brass':'slate');
    p(id,'sign-emblem',x,1.32,z+.075,.34,.34,.03,'ember');
    p(id,'sign-cap',x,1.71,z,2.1,.1,.27,'wood');
    p(id,'sign-planter',x,.13,z,1.5,.26,.42,'stone');
    p(id,'sign-shrub',x,.36,z,1.25,.26,.34,'green','yard','sphere');
    break;
   }
   case 'cozy-awning':{
    // Roof never floats: veranda posts go to the ground and the deck is tied
    // into the facade above the door canopy and below the eaves.
    // The deck starts just proud of the fascia/corner trims, above the built-in
    // door canopy and below upper-floor sills; the trailer hangs it off the eave.
    const x=doorX,depth=1.45,start=wallF+.22;
    const width=Math.min(lot.tier==='apartment'?2.4:lot.tier==='trailer'?2.3:lot.tier==='mansion'?2.9:3.35,2*(wallX-Math.abs(doorX))),supportX=width/2-.12;
    const deckY=lot.tier==='trailer'?top-.12:doorH+.72;
    // The mansion facade already carries a door canopy, floor band and
    // trims, so its veranda drops the brackets and flashing to read cleanly.
    const lean=lot.tier==='mansion';
    for(const side of [-1,1]){
     p(id,'veranda-post-'+side,x+side*supportX,(deckY-.1)/2,start+depth-.15,.15,deckY-.1,.15,'wood','attached');
     if(lot.tier!=='trailer'&&!lean)p(id,'bracket-'+side,x+side*supportX,deckY-.15,start+.3,.12,.14,.6,'metal','attached');
    }
    p(id,'roof-deck',x,deckY,start+depth/2,width,lean?.12:.16,depth,['trailer','apartment','mansion'].includes(lot.tier)?'slate':'wood','attached');
    if(!lean)p(id,'roof-flashing',x,deckY+.1,start+.05,width,.06,.1,'metal','attached');
    p(id,'front-beam',x,deckY-.15,start+depth-.15,width,.16,.16,'wood','attached');break;
   }
   case 'privacy-fence':{
    // Low-poly but physically believable: separated slats, horizontal rails and
    // ground-anchored posts. The opening is aligned to the actual front door.
    const x=edgeX-.24,z=edgeZ-.3;
    const fenceH=lot.tier==='mansion'?1.82:lot.tier==='family'?1.6:1.3;
    const finish=lot.tier==='mansion'?'stone':lot.tier==='apartment'?'metal':'wood';
    const infill=lot.tier==='mansion'?'metal':finish;
    const fenceRun=(axis,fixed,start,end,key)=>{
      const len=end-start,middle=(start+end)/2,vertical=axis==='z';
      const dim=(length,thickness)=>vertical?[thickness,length]:[length,thickness];
      for(const [row,height]of [['upper',fenceH-.18],['lower',.42]]){
        const [w,d]=dim(len,.105);
        p(id,key+'-rail-'+row,vertical?fixed:middle,height,vertical?middle:fixed,w,.095,d,infill);
      }
      const slats=Math.max(1,Math.floor(len/.49));
      for(let i=1;i<slats;i++){
        const at=start+len*i/slats,[w,d]=dim(.115,.115);
        p(id,key+'-slat-'+i,vertical?fixed:at,.055+fenceH*.47,vertical?at:fixed,w,fenceH*.94,d,infill);
      }
      const posts=Math.max(1,Math.ceil(len/2.45));
      for(let i=0;i<=posts;i++){
        const at=start+len*i/posts,[w,d]=dim(.2,.2);
        p(id,key+'-post-'+i,vertical?fixed:at,.05+fenceH/2,vertical?at:fixed,w,fenceH,d,finish);
        p(id,key+'-post-cap-'+i,vertical?fixed:at,.07+fenceH,vertical?at:fixed,w+.06,.1,d+.06,finish);
      }
    };
    for(const side of [-1,1])fenceRun('z',side*x,-z,z,'side-'+side);
    fenceRun('x',-z,-x,x,'rear');
    const gateLeft=clamp(doorX-1.65,-x+1,x-1);
    const gateRight=clamp(doorX+1.65,-x+1,x-1);
    fenceRun('x',z,-x,gateLeft,'front-left');
    fenceRun('x',z,gateRight,x,'front-right');
    for(const [i,gx]of [gateLeft,gateRight].entries()){
      p(id,'gate-pier-'+i,gx,.08+(fenceH+.12)/2,z,.3,fenceH+.12,.3,finish);
      p(id,'gate-cap-'+i,gx,fenceH+.21,z,.37,.12,.37,'brass');
      halo(id,'gate-halo-'+i,gx,fenceH+.36,z,.34);
      p(id,'gate-lamp-'+i,gx,fenceH+.36,z,.16,.18,.16,'warm','yard','cylinder');
    }
    break;
   }
   case 'fire-pit':{
    const x=sideX,z=1.6;
    p(id,'paving',x,.07,z,2.35,.12,2.25,'stone');
    p(id,'hearth',x,.29,z,1.1,.32,1.1,lot.tier==='mansion'?'slate':'stone','yard','cylinder');
    p(id,'ash-grate',x,.47,z,.78,.05,.78,'metal','yard','cylinder');
    p(id,'embers',x,.5,z,.5,.05,.5,'ember','yard','cylinder');
    p(id,'flame',x,.74,z,.34,.46,.34,'flame','yard','cone');
    p(id,'flame-core',x,.66,z,.2,.26,.2,'warm','yard','cone');
    halo(id,'fire-halo',x,.72,z,.6);
    for(const side of [-1,1]){
      p(id,'log-'+side,x+side*.12,.56,z,.11,.1,.6,'wood');
      // Low log benches on the paving edge make it read as a gathering spot.
      p(id,'bench-'+side,x,.25,z+side*.9,1.2,.16,.3,'wood');
      for(const leg of [-1,1])p(id,'bench-leg-'+side+'-'+leg,x+leg*.45,.15,z+side*.9,.12,.18,.24,'wood');
    }
    break;
   }
   case 'game-lounge':{
    // A small neon marquee on the facade, in the clear strip beside the door.
    const winL=(shellW*.28)-(shellW*.27)/2-.09;
    const x=lot.tier==='apartment'?-1.55:(doorX+.675+winL)/2;
    const y=Math.min(2.05,top-.45);
    p(id,'arcade-entrance-badge',x,y,wallF+.04,.72,.38,.08,'slate','attached');
    p(id,'arcade-low-glow',x,y-.06,wallF+.09,.54,.07,.03,'neon','attached');
    p(id,'arcade-neon-top',x,y+.07,wallF+.09,.54,.05,.03,'neonCyan','attached');
    break;
   }
   case 'garden-pond':{
    const x=-sideX,z=-4.5;
    p(id,'waterproof-basin',x,.12,z,2.45,.2,2.25,'stone');
    p(id,'stone-rim-left',x-1.17,.3,z,.15,.16,2.32,'stone');
    p(id,'stone-rim-right',x+1.17,.3,z,.15,.16,2.32,'stone');
    p(id,'stone-rim-front',x,.3,z+1.05,2.48,.16,.15,'stone');
    p(id,'stone-rim-rear',x,.3,z-1.05,2.48,.16,.15,'stone');
    // Water sits clearly above the basin top (no z-fighting) and below the rim.
    p(id,'pond-water',x,.3,z,2.13,.02,1.91,'water','yard','cylinder');
    for(const [k,[dx,dz,r]] of [[-.45,.3,.36],[.38,-.35,.3],[.5,.42,.22]].entries())
     p(id,'lily-pad-'+k,x+dx,.32,z+dz,r,.012,r,'green','yard','cylinder');
    p(id,'lily-flower',x-.42,.36,z+.28,.12,.08,.12,'flower','yard','sphere');
    for(const [k,[dx,dz]] of [[-1.05,-.85],[1.02,.9]].entries())
     p(id,'boulder-'+k,x+dx,.45,z+dz,.34,.26,.3,'stone','yard','sphere');
    break;
   }
   case 'reinforced-floor':{
    const x=sideX,z=-4.2;
    p(id,'slab',x,.13,z,2.4,.2,2.45,'stone');
    for(const side of [-1,1])p(id,'concrete-edge-'+side,x+side*1.13,.25,z,.12,.22,2.45,'metal');
    // Rim hardware stays on the slab edge so a hatch can still sit on the centre.
    for(const sx of [-1,1])for(const sz of [-1,1]){
     p(id,'corner-plate-'+sx+'-'+sz,x+sx*1.12,.27,z+sz*1.14,.16,.08,.16,'metal');
     p(id,'corner-bolt-'+sx+'-'+sz,x+sx*1.12,.33,z+sz*1.14,.07,.06,.07,'brass','yard','cylinder');
    }
    for(const side of [-1,1])p(id,'hazard-lip-'+side,x+side*1.15,.245,z,.08,.05,1.85,'ember');
    p(id,'access-plaque',x,.26,z+1.14,.62,.05,.16,'slate');
    p(id,'access-lamp',x,.4,z+1.14,.11,.12,.11,'warm','yard','cylinder');
    halo(id,'slab-halo',x,.4,z+1.14,.3);
    break;
   }
   case 'grow-lounge':{
    // Discreet louvred intake low on the windowless left wall, rear half,
    // plus a patio pot of the credited sativa plant just off that wall.
    const z=-shellD*.25,px=-wallX-.58,pz=z+.55;
    p(id,'concealed-vent',-wallX-.07,.8,z,.14,.42,1.0,'metal','attached');
    for(const [k,dy] of [-.12,0,.12].entries())p(id,'vent-slat-'+k,-wallX-.15,.8+dy,z,.04,.05,.86,'slate','attached');
    p(id,'vent-plaque',-wallX-.12,.48,z-.62,.06,.16,.28,'slate','attached');
    p(id,'patio-plant',px,.425,pz,.44,.85,.42,'green');
    break;
   }
   case 'hobby-workshop':{
    // Rear service door centred between the two rear windows, under the floor band.
    const h=Math.min(2.05,storey-.32),w=Math.min(1.1,rearGap*2-.2);
    p(id,'utility-door',0,.3+h/2,-wallF-.04,w,h,.08,'metal','attached');
    p(id,'workshop-lintel',0,.3+h+.07,-wallF-.06,w+.24,.12,.12,'wood','attached');
    p(id,'door-step',0,.06,-wallF-.35,w+.3,.12,.5,'stone','attached');
    const lx=Math.min(w/2+.22,rearGap-.1);
    p(id,'service-grille',lx,.3+h-.25,-wallF-.05,.14,.2,.1,'warm','attached');
    halo(id,'work-light-halo',lx,.3+h-.25,-wallF-.1,.36,'attached');
    break;
   }
   case 'roof-garden':{
    if(flat){
     // Edge planters stay clear of the mansion's central 4.3 m helicopter disc.
     const x=Math.min(wallX-.65,5.4),z=Math.min(wallF-.95,3.7);
     for(const side of [-1,1]){
      p(id,'flat-roof-box-'+side,side*x,top+.555,z,1.02,.55,1.25,'wood','roof');
      p(id,'flat-roof-foliage-'+side,side*x,top+.94,z,.9,.38,1.1,'green','roof','sphere');
      p(id,'flat-roof-bloom-'+side,side*x+.18*side,top+1.08,z+.3,.26,.2,.26,side>0?'flower':'gold','roof','sphere');
     }
    }else{
     // Pitched roofs cannot support floating beds: a post-supported pergola
     // terrace beside the house, tied to the garden concept.
     const x=-sideX,z=frontZ-2.2;
     p(id,'supported-terrace',x,.29,z,2.25,.22,2,'wood');
     for(const sx of [-1,1])for(const sz of [-1,1])
      p(id,'terrace-post-'+sx+'-'+sz,x+sx*.94,1.35,z+sz*.8,.13,2.25,.13,'wood');
     for(const k of [-1,0,1])p(id,'terrace-rafter-'+(k+1),x,2.46,z+k*.62,2.14,.1,.12,'wood');
     p(id,'terrace-planter',x,.61,z,1.5,.42,1,'earth');
     p(id,'terrace-foliage',x,1.0,z,1.3,.4,.85,'green','yard','sphere');
     p(id,'terrace-vine',x,2.56,z,1.7,.14,1.3,'green','yard','sphere');
    }break;
   }
   case 'hidden-hatch':{
    // Sits on the reinforced slab; when the armoured bunker lid is installed the
    // hatch becomes its steel collar and the loose hardware is retired.
    const x=sideX,z=-4.2,base=purchased.has('reinforced-floor')?slabTop:0;
    p(id,'hatch',x,base+.1,z,1.86,.2,1.95,'metal');
    if(!purchased.has('underground-bunker')){
     p(id,'hinge',x,base+.25,z-.83,1.35,.1,.16,'slate');
     p(id,'latch',x,base+.25,z+.74,.38,.1,.19,'brass');
    }break;
   }
   case 'grow-lounge-deluxe':{
    // Upper exhaust on the same wall, joined to the lower intake by a duct,
    // plus a second patio plant and a violet grow-light wash.
    const z=-shellD*.25,y=Math.min(2.0,top-.5),px=-wallX-.58,pz=z-.55;
    p(id,'secondary-vent',-wallX-.07,y,z,.14,.36,.85,'metal','attached');
    p(id,'vent-trim',-wallX-.15,y,z,.04,.2,.7,'slate','attached');
    p(id,'duct',-wallX-.06,(y+.8)/2,z,.12,Math.max(.1,y-.8-.35),.12,'metal','attached');
    p(id,'patio-plant',px,.425,pz,.44,.85,.42,'green');
    p(id,'grow-bar',px,1.14,pz,.38,.05,.38,'neon');
    halo(id,'patio-grow-halo',px,1.16,pz,.55);
    break;
   }
   case 'security-upgrade':{
    // Cameras mount on the side walls just behind the front corners, under the
    // eaves: clear of corner timbers, eave brackets, gutters and front windows.
    const cy=top-.35,cz=wallF-.5;
    for(const side of [-1,1]){
     p(id,'camera-bracket-'+side,side*(wallX+.06),cy,cz,.12,.1,.1,'metal','attached');
     p(id,'camera-body-'+side,side*(wallX+.25),cy-.04,cz+.08,.24,.18,.36,'slate','attached');
     p(id,'camera-lens-'+side,side*(wallX+.25),cy-.04,cz+.28,.12,.1,.04,'glass','attached');
     p(id,'camera-led-'+side,side*(wallX+.25)+.07,cy+.02,cz+.275,.03,.03,.02,'alert','attached');
    }
    // Keypad and a steel kick plate replace jamb plates that z-fought the frame.
    p(id,'door-plate--1',doorX-.84,1.2,wallF+.03,.14,.22,.05,'slate','attached');
    p(id,'door-plate-1',doorX,.54,wallF+.19,.9,.3,.03,'metal','attached');
    p(id,'keypad-light',doorX-.84,1.27,wallF+.06,.06,.03,.02,'neonCyan','attached');
    break;
   }
   case 'underground-bunker':{
    const x=sideX,z=-4.2,base=(purchased.has('reinforced-floor')?slabTop:0)+(purchased.has('hidden-hatch')?.2:0);
    p(id,'hatch-armored-lid',x,base+.11,z,1.6,.22,1.7,'slate');
    p(id,'lid-wheel',x,base+.25,z,.5,.06,.5,'metal','yard','cylinder');
    p(id,'lid-spoke',x,base+.29,z,.08,.04,.62,'brass');
    p(id,'hatch-access-light',x+.72,.42,z+1.05,.16,.18,.16,'warm','yard','cylinder');
    halo(id,'access-halo',x+.72,.42,z+1.05,.36);
    p(id,'warning-ring',x,base+.24,z,1.95,.03,2.05,'ember');
    p(id,'air-intake-riser',x,.7,z-1.55,.36,1.2,.36,'metal','yard','cylinder');
    p(id,'riser-cap',x,1.36,z-1.55,.66,.16,.66,'slate','yard','cylinder');
    break;
   }
   case 'bunker-arcade':{
    const x=sideX,z=-6.75;
    p(id,'utility-housing',x,.54,z,1.1,1.03,.77,'metal');
    p(id,'utility-grille',x,.6,z+.4,.75,.55,.04,'slate');
    p(id,'housing-roof',x,1.09,z,1.22,.07,.89,'slate');
    p(id,'service-beacon',x,1.2,z,.16,.14,.16,'neonCyan','yard','cylinder');
    halo(id,'beacon-halo',x,1.2,z,.34);
    break;
   }
  }
 }
 // Core invariant: every geometric primitive remains entirely inside this lot.
 for(const item of parts){
  if(Math.abs(item.x)+item.w/2>edgeX+.001||Math.abs(item.z)+item.d/2>edgeZ+.001)
   throw Error('upgrade_geometry_outside_lot:'+item.name);
 }
 return Object.freeze(parts);
}
// Optional authored-model slots. Each slot names the CC BY model part that may
// replace a group of primitives (listed in `replaces`) and the box it must fit
// inside; the box is derived from the primitives above, so the tier placement
// and anti-clipping guarantees carry over. Renderers fall back to primitives
// when a model is unavailable. Pure data: no unlock authority.
export function estateUpgradeModelSlots(lot,unlockedIds=[]){
 const parts=estateUpgradeExteriorParts(lot,unlockedIds),by=new Map(parts.map(p=>[p.name,p]));
 const slots=[],f=lot.buildingFootprint,plot=lot?.dimensions??{width:20,depth:18};
 const sideX=clamp(f.width/2+(plot.width/2-f.width/2)/2,5,plot.width/2-1.2);
 const has=id=>parts.some(p=>p.id===id);
 const slot=s=>slots.push(Object.freeze({ry:0,stretch:false,replaces:[],...s}));
 if(has('fire-pit')){
  const h=by.get('fire-pit-hearth');
  slot({id:'fire-pit',model:'fire-pit',part:'body',x:h.x,y:.13,z:h.z,w:1.45,h:.8,d:1.4,
   replaces:['hearth','ash-grate','embers','flame','flame-core','log--1','log-1'].map(n=>'fire-pit-'+n)});
 }
 if(has('security-upgrade'))for(const side of [-1,1]){
  const b=by.get('security-upgrade-camera-body-'+side);
  slot({id:'security-upgrade',model:'camera',part:'body',x:b.x,y:b.y-.17,z:b.z+.04,w:.22,h:.34,d:.44,
   replaces:['camera-body-','camera-lens-','camera-led-'].map(n=>'security-upgrade-'+n+side)});
 }
 if(has('flower-garden'))
  slot({id:'flower-garden',model:'gnome',part:'body',x:-sideX,y:0,z:1.15,w:.26,h:.46,d:.22,ry:.5});
 if(has('garden-pond'))for(const k of [0,1]){
  const b=by.get('garden-pond-boulder-'+k);
  slot({id:'garden-pond',model:'rocks',part:k?'rock-b':'rock-a',x:b.x,y:b.y-b.h/2,z:b.z,w:b.w*1.15,h:b.h*1.3,d:b.d*1.15,
   stretch:true,ry:k?2.1:.6,replaces:['garden-pond-boulder-'+k]});
 }
 if(has('porch-lights'))for(const side of [-1,1]){
  // Wall sconce model replaces the backing plate, lantern box and cap.
  const b=by.get('porch-lights-wall-lantern-'+side),wallF=b.z-.14;
  slot({id:'porch-lights',model:'wall-lantern',part:'body',x:b.x,y:b.y-.17,z:wallF+.12,w:.2,h:.36,d:.22,
   replaces:['wall-base-','wall-lantern-','lantern-cap-'].map(n=>'porch-lights-'+n+side)});
 }
 if(has('flower-garden'))for(const j of [0,1]){
  // Two flowering shrubs per raised bed, rooted in the low foliage mound,
  // replace the stick-and-ball blooms.
  const f=by.get('flower-garden-flower-foliage-'+j);
  for(const k of [-1,1])slot({id:'flower-garden',model:'flower-bush',part:'bloom',x:f.x,y:.3,z:f.z+k*.43,w:1,h:.62,d:.84,ry:k>0?.4+j:2.6-j,
   replaces:k<0?[]:[0,1,2,3,4].flatMap(n=>['flower-stem-'+j+'-'+n,'flower-bloom-'+j+'-'+n]).map(n=>'flower-garden-'+n)});
 }
 if(has('roof-garden')){
  // Flowering shrubs fill the planter boxes (roof) or terrace planter.
  const roofBush=(fol,extra,y,w,h,d,ry)=>{const f=by.get('roof-garden-'+fol);if(!f)return;
   slot({id:'roof-garden',model:'flower-bush',part:'bloom',x:f.x,y,z:f.z,w,h,d,ry,replaces:[fol,...extra].map(n=>'roof-garden-'+n)});};
  for(const side of [-1,1]){const b=by.get('roof-garden-flat-roof-box-'+side);
   if(b)roofBush('flat-roof-foliage-'+side,['flat-roof-bloom-'+side],b.y+b.h/2,.95,.65,1.15,side>0?1.2:0);}
  const t=by.get('roof-garden-terrace-planter');
  if(t)roofBush('terrace-foliage',[],t.y+t.h/2,1.4,.75,1,.3);
 }
 if(has('hobby-workshop')){
  // Workbench on the rear wall beside the service door (opposite the work light).
  const d=by.get('hobby-workshop-utility-door'),wallF=-(d.z+.04);
  slot({id:'hobby-workshop',model:'workbench',part:'body',x:-(d.w/2+1.05),y:0,z:-wallF-.36,w:1.3,h:.78,d:.6,stretch:true});
 }
 if(has('bunker-arcade')){
  const u=by.get('bunker-arcade-utility-housing');
  slot({id:'bunker-arcade',model:'arcade',part:'body',x:u.x,y:0,z:u.z,w:.9,h:1.75,d:.86,
   replaces:['utility-housing','utility-grille','housing-roof','service-beacon'].map(n=>'bunker-arcade-'+n)});
 }
 if(has('grow-lounge')){
  const g=by.get('grow-lounge-patio-plant');
  if(g)slot({id:'grow-lounge',model:'cannabis',part:'body',x:g.x,y:0,z:g.z,w:g.w,h:g.h,d:g.d,replaces:['grow-lounge-patio-plant']});
 }
 if(has('grow-lounge-deluxe')){
  const g=by.get('grow-lounge-deluxe-patio-plant');
  if(g)slot({id:'grow-lounge-deluxe',model:'cannabis',part:'body',x:g.x,y:0,z:g.z,w:g.w,h:g.h,d:g.d,ry:1.2,replaces:['grow-lounge-deluxe-patio-plant']});
 }
 if(has('custom-sign')){
  const s=by.get('custom-sign-sign-shrub');
  if(s)slot({id:'custom-sign',model:'flower-bush',part:'bloom',x:s.x,y:0,z:s.z,w:1.2,h:.62,d:.8,replaces:['custom-sign-sign-shrub']});
 }
 for(const s of slots){
  if(Math.abs(s.x)+s.w/2>plot.width/2+.001||Math.abs(s.z)+s.d/2>plot.depth/2+.001)throw Error('upgrade_model_slot_outside_lot:'+s.model);
 }
 return Object.freeze(slots);
}
