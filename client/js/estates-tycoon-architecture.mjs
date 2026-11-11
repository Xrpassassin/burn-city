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
 // A 2.2-metre yard fixture fits beside the widest existing mansion (13 m shell).
 const sideX=clamp(W/2+(edgeX-W/2)/2,5,edgeX-1.2);
 const backZ=-edgeZ+1.35,frontZ=edgeZ-1.25;
 const p=(id,name,x,y,z,w,h,d,mat,placement='yard',shape='box')=>{
  if(![x,y,z,w,h,d].every(Number.isFinite)||w<=0||h<=0||d<=0)throw TypeError('invalid_upgrade_geometry');
  parts.push(Object.freeze({id,name:id+'-'+name,x,y,z,w,h,d,mat,placement,shape}));
 };
 const supported=(id,name,x,z,w,d,material='wood')=>{
  p(id,name+'-base',x,.13,z,w,.16,d,material);
  p(id,name+'-inset',x,.235,z,w-.2,.06,d-.2,'earth');
 };
 for(const id of KNOWN){
  if(!purchased.has(id))continue;
  switch(id){
   case 'porch-lights':{
    // Connected stepping-stone approach and sealed warm-glass wall lanterns:
    // every small home gets visible value without crossing public rights-of-way.
    for(const side of [-1,1]){
      const x=doorX+side*.86;
      p(id,'wall-base-'+side,x,1.9,front+.17,.18,.38,.12,'metal','attached');
      p(id,'wall-lantern-'+side,x,1.9,front+.26,.24,.32,.21,'warm','attached');
      p(id,'lantern-cap-'+side,x,2.1,front+.26,.3,.09,.25,'brass','attached');
      const lampZ=Math.min(front+1.6,frontZ-.6);
      p(id,'path-pedestal-'+side,side*1.4,.48,lampZ,.18,.85,.18,'metal','yard','cylinder');
      p(id,'path-light-'+side,side*1.4,.97,lampZ,.26,.16,.26,'warm','yard','cylinder');
      p(id,'path-light-cap-'+side,side*1.4,1.09,lampZ,.29,.06,.29,'slate','yard','cylinder');
    }
    const start=front+.42,end=edgeZ-.65,count=Math.max(1,Math.floor((end-start)/.84));
    for(let i=0;i<count;i++){
      const z=start+i*(end-start)/count;
      p(id,'entry-paver-'+i,doorX,.055,z,1.06,.1,.64,'stone');
    }
    break;
   }
   case 'flower-garden':{
    for(const [j,z]of [2.8,-.5].entries()){
     supported(id,'flower-bed-'+j,-sideX,z,1.3,2,lot.tier==='mansion'?'stone':lot.tier==='apartment'?'metal':'wood');
     for(const [k,dz] of [-.55,0,.55].entries()){
      p(id,'flower-stem-'+j+'-'+k,-sideX,.48,z+dz,.08,.52,.08,'green');
      p(id,'flower-bloom-'+j+'-'+k,-sideX,.79,z+dz,.29,.22,.29,k%2?'flower':'gold');
     }
    }break;
   }
   case 'custom-sign':{
    const x=-Math.min(5.1,edgeX-2.5),z=frontZ-.8;
    for(const side of [-1,1])p(id,'sign-post-'+side,x+side*.78,.9,z,.13,1.7,.15,'wood');
    p(id,'sign-plaque',x,1.62,z,1.8,.54,.15,lot.tier==='mansion'?'brass':'slate');
    p(id,'sign-cap',x,1.92,z,2.1,.12,.29,'wood');break;
   }
   case 'cozy-awning':{
    // Roof never floats: veranda posts go to the ground and the lintel spans a real entry.
    const x=doorX,canopyZ=front+.64,width=Math.min(3.35,W-.85),supportX=width/2-.12;
    for(const side of [-1,1]){
     p(id,'veranda-post-'+side,x+side*supportX,1.29,front+1.1,.16,2.48,.16,'wood','attached');
     p(id,'bracket-'+side,x+side*supportX,2.45,front+.2,.28,.2,.75,'metal','attached');
    }
    p(id,'roof-deck',x,2.59,canopyZ,width,.19,1.7,['trailer','apartment','mansion'].includes(lot.tier)?'slate':'wood','attached');
    p(id,'roof-flashing',x,2.73,front-.08,width,.12,.15,'metal','attached');
    p(id,'front-beam',x,2.42,front+1.24,width,.22,.19,'wood','attached');break;
   }
   case 'privacy-fence':{
    // Low-poly but physically believable: separated slats, horizontal rails and
    // ground-anchored posts. The former single wall slabs hid the entire yard.
    // The opening is aligned to the *actual* tier-specific front door.
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
      // Open slats and separate structural uprights make the fence read as
      // construction, not a continuous concrete privacy wall.
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
    // Visually distinct gate piers retain a clear >=3.3m walk-through gap.
    for(const [i,gx]of [gateLeft,gateRight].entries()){
      p(id,'gate-pier-'+i,gx,.08+(fenceH+.12)/2,z,.3,fenceH+.12,.3,finish);
      p(id,'gate-cap-'+i,gx,fenceH+.21,z,.37,.12,.37,'brass');
    }
    break;
   }
   case 'fire-pit':{
    const x=sideX,z=1.6;
    p(id,'paving',x,.07,z,2.35,.12,2.25,'stone');
    p(id,'hearth',x,.29,z,1.4,.38,1.3,lot.tier==='mansion'?'slate':'stone');
    p(id,'ash-grate',x,.48,z,.88,.07,.8,'metal');
    p(id,'embers',x,.52,z,.43,.06,.38,'red');
    // Small firebrick courses and cross-stacked logs give the hearth recognizable
    // scale without adding emitters or gameplay fire to a decorative purchase.
    for(const side of [-1,1]){
      p(id,'hearth-coping-x-'+side,x+side*.62,.52,z,.15,.12,1.38,'brass');
      p(id,'hearth-coping-z-'+side,x,.52,z+side*.57,1.18,.12,.12,'stone');
      p(id,'log-'+side,x+side*.16,.62,z,.12,.11,.65,'wood');
    }
    break;
   }
   case 'game-lounge':{
    p(id,'arcade-entrance-badge',Math.min(W/2-.85,doorX+2.0),2.05,front+.17,.78,.42,.13,'slate','attached');
    p(id,'arcade-low-glow',Math.min(W/2-.85,doorX+2.0),1.95,front+.26,.5,.11,.05,'warm','attached');break;
   }
   case 'garden-pond':{
    const x=-sideX,z=-4.5;
    p(id,'waterproof-basin',x,.12,z,2.45,.2,2.25,'stone');
    p(id,'stone-rim-left',x-1.17,.26,z,.15,.24,2.32,'stone');
    p(id,'stone-rim-right',x+1.17,.26,z,.15,.24,2.32,'stone');
    p(id,'stone-rim-front',x,.26,z+1.05,2.48,.24,.15,'stone');
    p(id,'stone-rim-rear',x,.26,z-1.05,2.48,.24,.15,'stone');
    p(id,'pond-water',x,.22,z,2.13,.035,1.91,'water');break;
   }
   case 'reinforced-floor':{
    const x=sideX,z=-4.2;
    p(id,'slab',x,.13,z,2.4,.2,2.45,'stone');
    for(const side of [-1,1])p(id,'concrete-edge-'+side,x+side*1.13,.25,z,.12,.22,2.45,'metal');
    break;
   }
   case 'grow-lounge':{
    p(id,'concealed-vent',W*.22,1.75,-front-.16,1.0,.38,.28,'metal','attached');
    for(const z of [-.23,0,.23])p(id,'vent-slat-'+z,W*.22,1.75+z,-front-.34,.85,.055,.08,'slate','attached');
    break;
   }
   case 'hobby-workshop':{
    p(id,'utility-door',-W*.2,1.29,-front-.13,1.28,2.4,.13,'metal','attached');
    p(id,'workshop-lintel',-W*.2,2.62,-front-.21,1.5,.12,.24,'wood','attached');
    p(id,'service-grille',W*.27,1.64,-front-.2,.9,.7,.13,'slate','attached');break;
   }
   case 'roof-garden':{
    if(flat){
     // Edge planters stay clear of the mansion's central 4.3 m helicopter disc.
     const x=Math.min(W/2-.67,5.4),z=Math.min(D/2-1,3.7);
     for(const side of [-1,1]){
      p(id,'flat-roof-box-'+side,side*x,top+.52,z,1.02,.55,1.25,'wood','roof');
      p(id,'flat-roof-foliage-'+side,side*x,top+.95,z,.77,.42,.93,'green','roof');
      p(id,'parapet-rail-'+side,side*x,top+1.06,z+1,.14,1.1,.14,'metal','roof');
     }
    }else{
     // Pitched roofs cannot support floating beds. Use a post-supported elevated
     // side terrace instead, tied to the existing building's garden concept.
     const x=-sideX,z=frontZ-2.2;
     p(id,'supported-terrace',x,.29,z,2.25,.22,2,'wood');
     for(const sx of [-1,1])for(const sz of [-1,1])
      p(id,'terrace-post-'+sx+'-'+sz,x+sx*.94,1.35,z+sz*.8,.13,2.25,.13,'wood');
     p(id,'terrace-crossbar',x,2.46,z,2.14,.13,1.77,'wood');
     p(id,'terrace-planter',x,.66,z,1.5,.42,1,'earth');
     p(id,'terrace-foliage',x,1.07,z,1.27,.36,.78,'green');
    }break;
   }
   case 'hidden-hatch':{
    const x=sideX,z=-4.2;
    p(id,'hatch',x,.31,z,1.86,.2,1.95,'metal');
    p(id,'hinge',x,.47,z-.83,1.35,.13,.16,'slate');
    p(id,'latch',x,.48,z+.74,.38,.13,.19,'brass');break;
   }
   case 'grow-lounge-deluxe':{
    p(id,'secondary-vent',-W*.25,2.2,-front-.17,.85,.34,.25,'metal','attached');
    p(id,'vent-trim',-W*.25,2.2,-front-.31,.66,.17,.07,'slate','attached');break;
   }
   case 'security-upgrade':{
    for(const side of [-1,1]){
     const x=side*(W/2-.48);
     p(id,'camera-bracket-'+side,x,top-.5,front+.21,.12,.24,.34,'metal','attached');
     p(id,'camera-body-'+side,x,top-.5,front+.44,.38,.23,.43,'slate','attached');
     p(id,'camera-lens-'+side,x,top-.5,front+.69,.15,.13,.08,'glass','attached');
    }
    for(const side of [-1,1])p(id,'door-plate-'+side,doorX+side*.61,1.37,front+.22,.1,2.33,.09,'metal','attached');
    break;
   }
   case 'underground-bunker':{
    const x=sideX,z=-4.2;
    p(id,'hatch-armored-lid',x,.44,z,1.86,.22,1.95,'slate');
    p(id,'hatch-access-light',x+.72,.67,z+.65,.24,.23,.22,'warm');
    p(id,'air-intake-riser',x,.69,z-1.4,.52,1.2,.5,'metal');
    p(id,'riser-cap',x,1.37,z-1.4,.7,.2,.62,'slate');
    break;
   }
   case 'bunker-arcade':{
    const x=sideX,z=-6.75;
    p(id,'utility-housing',x,.54,z,1.1,1.03,.77,'metal');
    p(id,'utility-grille',x,.64,z+.4,.75,.6,.08,'slate');
    p(id,'service-beacon',x,1.13,z,.18,.14,.2,'warm');
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
