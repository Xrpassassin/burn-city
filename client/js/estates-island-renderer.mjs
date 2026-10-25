// Optional Three.js renderer adapter for buildEstatesIslandScene().
// Pass the same THREE namespace already used by the host experience; no new CDN or bundle dependency.
const PALETTE = {
  grass:0x526d3b, asphalt:0x292b2b, stone:0x9b9588, 'weathered-concrete':0x77766e,
  'steel-concrete':0x525d61, timber:0x765034, 'lake-water':0x164f70, 'rock-and-reeds':0x77765b,
  'lot-boundary':0xe5b45d, 'interaction-volume':0x34d7ff, pine:0x31563a, deciduous:0x4d7544,
  trailer:0x8e8a80, apartment:0xc2b5a1, starter:0xb59a76, family:0x9e8466, mansion:0xd1c3a2, plaza:0x8e9b9a
};
function assertThree(THREE) {
  for (const name of ['Group','Mesh','MeshStandardMaterial','BoxGeometry','CylinderGeometry','ConeGeometry','CircleGeometry','RingGeometry','EdgesGeometry','LineBasicMaterial','LineSegments']) {
    if (!THREE || typeof THREE[name] !== 'function') throw new TypeError('Three.js constructor required: '+name);
  }
}
function material(THREE,color,options={}) {
  return new THREE.MeshStandardMaterial({color,roughness:options.roughness??0.86,metalness:options.metalness??0,transparent:options.transparent??false,opacity:options.opacity??1,side:THREE.DoubleSide});
}
function place(mesh,p) { mesh.position.set(p.x,p.y,p.z); return mesh; }
function box(THREE,parent,id,p,w,h,d,color,options={}) {
  const mesh=new THREE.Mesh(new THREE.BoxGeometry(Math.max(.05,w),Math.max(.05,h),Math.max(.05,d)),material(THREE,color,options));
  mesh.name=id; place(mesh,p); parent.add(mesh); return mesh;
}
function ring(THREE,parent,id,p,inner,outer,color) {
  const mesh=new THREE.Mesh(new THREE.RingGeometry(inner,outer,96),material(THREE,color));
  mesh.name=id; place(mesh,p); mesh.rotation.x=-Math.PI/2; parent.add(mesh); return mesh;
}
function addLandmark(THREE,parent,item) {
  const {x,y,z}=item.position,d=item.dimensions,style=item.style;
  const made=[];
  if(style==='kiosk'||style==='market') {
    made.push(box(THREE,parent,item.id+'-counter',{x,y:y+.55,z},d.width,.25,d.depth,0x755238));
    const postColor=style==='kiosk'?0x354750:0x4d4030;
    for(const sx of [-1,1]) for(const sz of [-1,1]) made.push(box(THREE,parent,item.id+'-post-'+sx+'-'+sz,{x:x+sx*(d.width/2-.2),y:y+d.height/2,z:z+sz*(d.depth/2-.2)},.22,d.height,.22,postColor));
    made.push(box(THREE,parent,item.id+'-roof',{x,y:y+d.height,z},d.width+.65,.28,d.depth+.65,style==='kiosk'?0x2a7d8b:0x9b6a32));
    if(style==='kiosk') made.push(box(THREE,parent,item.id+'-sign',{x,y:y+d.height+.32,z:z-d.depth/2+.2},d.width*.72,.55,.16,0x29dfff));
    if(style==='market') for(let i=-1;i<=1;i++) made.push(box(THREE,parent,item.id+'-stall-'+i,{x:x+i*d.width*.23,y:y+1.05,z},.12,.9,d.depth*.65,0xc98a48));
  } else if(style==='plaza') {
    const slab=new THREE.Mesh(new THREE.CircleGeometry(Math.min(d.width,d.depth)/2,48),material(THREE,0x8e9b9a));
    slab.name=item.id+'-paving';place(slab,{x,y:y+.03,z});slab.rotation.x=-Math.PI/2;parent.add(slab);made.push(slab);
    made.push(box(THREE,parent,item.id+'-plaza-marker',{x,y:y+.42,z},1.4,.65,1.4,0x354750));
    for(const sx of [-1,1]) made.push(box(THREE,parent,item.id+'-bench-'+sx,{x:x+sx*4,y:y+.32,z:z+2.5},2.8,.35,.75,0x765034));
  } else if(style==='overlook') {
    made.push(box(THREE,parent,item.id+'-deck',{x,y:y+.1,z},d.width,d.height,d.depth,0x77766e));
    for(const side of [-1,1]) {
      made.push(box(THREE,parent,item.id+'-rail-'+side,{x:x+side*(d.width/2-.15),y:y+1.0,z},.18,1.5,d.depth,0x52636a));
      made.push(box(THREE,parent,item.id+'-rail-front-'+side,{x:x+side*d.width*.25,y:y+1.0,z:z+d.depth/2-.12},d.width*.5,.12,.18,0x52636a));
    }
  } else if(style==='trailhead') {
    made.push(box(THREE,parent,item.id+'-post',{x,y:y+d.height/2,z},.28,d.height,.28,0x59412b));
    made.push(box(THREE,parent,item.id+'-sign',{x,y:y+d.height*.72,z:z+.22},d.width,.65,.22,0xb58b4c));
    made.push(box(THREE,parent,item.id+'-base',{x,y:y+.12,z},1.5,.24,.9,0x77765b));
  }
  return made;
}
// Decorative, deterministic estate facades; geometry is visual only and grants no access.
function addEstateFacade(THREE,parent,item) {
  const {x,y,z}=item.position, f=item.buildingFootprint;
  if(!f) return [];
  const made=[], mansion=item.tier==='mansion', apartment=item.tier==='apartment';
  const floors=apartment?3:mansion?2:item.tier==='family'?2:1;
  const wall=PALETTE[item.tier]??0x9c927e;
  const trim=mansion?0xe2d2b2:0xe1d9c9;
  const glass=0x3b6573;
  const front=z-f.depth/2-.08;
  // Windows are mounted just outside the front face; no real interior is implied.
  for(let level=0;level<floors;level++) {
    const h=y+Math.min(f.height-1,1.5+level*(f.height-1)/floors);
    for(const side of [-1,1]) {
      const wx=x+side*f.width*.28;
      made.push(box(THREE,parent,item.id+'-window-'+level+'-'+side,{x:wx,y:h,z:front},Math.min(1.5,f.width*.2),1.15,.13,glass,{roughness:.18,metalness:.12}));
      made.push(box(THREE,parent,item.id+'-sill-'+level+'-'+side,{x:wx,y:h-.65,z:front-.06},Math.min(1.85,f.width*.24),.13,.25,trim));
    }
  }
  made.push(box(THREE,parent,item.id+'-door',{x,y:y+1.12,z:front-.04},1.35,2.2,.18,0x453326));
  made.push(box(THREE,parent,item.id+'-porch',{x,y:y+.12,z:front-1.3},Math.min(f.width*.65,5),.24,2.3,0x8d8274));
  if(mansion||item.tier==='family') {
    for(const side of [-1,1]) made.push(box(THREE,parent,item.id+'-porch-column-'+side,
      {x:x+side*Math.min(f.width*.3,2.2),y:y+1.5,z:front-2.25},.3,2.8,.3,trim));
    made.push(box(THREE,parent,item.id+'-porch-canopy',{x,y:y+2.92,z:front-1.25},Math.min(f.width*.7,5.6),.22,2.6,0x51463d));
  }
  if(mansion) {
    made.push(box(THREE,parent,item.id+'-roof-pavilion',{x,y:y+f.height+.65,z},f.width*.48,1.1,f.depth*.42,0x655444));
  }
  return made;
}
// Small decorative landscaping details; no gameplay collision or ownership effects.
function addEstateLandscaping(THREE,parent,item) {
  const f=item.buildingFootprint;
  if(!f) return [];
  const {x,y,z}=item.position, made=[];
  const front=z-f.depth/2;
  // Planting beds stay close to the facade, clear of the public road.
  for(const side of [-1,1]) {
    const bx=x+side*Math.min(f.width*.38,4.4);
    made.push(box(THREE,parent,item.id+'-planter-'+side,{x:bx,y:y+.14,z:front-.55},1.25,.28,.85,0x685447));
    const shrub=new THREE.Mesh(new THREE.ConeGeometry(.48,.9,7),material(THREE,0x426d40));
    shrub.name=item.id+'-shrub-'+side;
    place(shrub,{x:bx,y:y+.72,z:front-.55});parent.add(shrub);made.push(shrub);
  }
  // Footpath terminates at the porch and does not cross into the public road.
  made.push(box(THREE,parent,item.id+'-front-path',{x,y:y+.025,z:front-2.45},
    Math.min(1.65,f.width*.3),.08,2.2,0xa59b87));
  if(item.tier==='mansion') {
    for(const side of [-1,1]) {
      made.push(box(THREE,parent,item.id+'-garden-wall-'+side,
        {x:x+side*(f.width/2+1.0),y:y+.38,z:front-.9},.28,.75,3.5,0x988d7d));
    }
  }
  return made;
}
// Low-cost roadside fixtures. Emissive caps avoid adding real-time lights per post.
function addRoadFixtures(THREE,parent,item) {
  const {x,y,z}=item.position,d=item.dimensions;
  const horizontal=item.orientation==='x';
  const length=d.length??d.depth??8, width=d.width??5;
  const made=[], spacing=32, count=Math.max(1,Math.floor(length/spacing));
  for(let i=0;i<=count;i++) {
    const along=-length/2+6+(length-12)*i/count;
    for(const side of [-1,1]) {
      const offset=side*(width/2+2.5);
      const px=x+(horizontal?along:offset), pz=z+(horizontal?offset:along);
      const key=item.id+'-lamp-'+i+'-'+side;
      made.push(box(THREE,parent,key+'-post',{x:px,y:y+2.25,z:pz},.17,4.5,.17,0x40494e,{metalness:.45}));
      made.push(box(THREE,parent,key+'-arm',{x:px+side*.5,y:y+4.45,z:pz},1.1,.12,.15,0x40494e,{metalness:.45}));
      made.push(box(THREE,parent,key+'-lantern',{x:px+side*.95,y:y+4.31,z:pz},.48,.16,.43,0xffd7a0,{roughness:.35}));
    }
  }
  return made;
}
function addTree(THREE,parent,item) {
  const {x,y,z}=item.position, d=item.dimensions, color=PALETTE[item.material]??PALETTE.deciduous;
  const trunk=new THREE.Mesh(new THREE.CylinderGeometry(.22,.34,d.height*.38,7),material(THREE,0x59412b));
  trunk.name=item.id+'-trunk'; place(trunk,{x,y:y+d.height*.19,z}); parent.add(trunk);
  const crown=new THREE.Mesh(new THREE.ConeGeometry(Math.max(d.width,d.depth)*.72,d.height*.78,8),material(THREE,color));
  crown.name=item.id+'-crown'; place(crown,{x,y:y+d.height*.58,z}); parent.add(crown);
  return [trunk,crown];
}
export function createEstatesIslandRenderer({THREE,scene,manifest,onInteract=()=>{}}={}) {
  assertThree(THREE);
  if (!scene || typeof scene.add!=='function' || typeof scene.remove!=='function') throw new TypeError('Three.js scene with add/remove is required');
  if (typeof onInteract!=='function') throw new TypeError('onInteract must be a function');
  const root=new THREE.Group(); root.name='burn-city-estates-island';
  const objects=new Map();
  const add=(id,obj)=>{objects.set(id,obj);root.add(obj);return obj;};
  const source=manifest;
  if (!source || !Array.isArray(source.objects)) throw new TypeError('island scene manifest is required');
  for (const item of source.objects) {
    const p=item.position, d=item.dimensions;
    let made=[];
    switch(item.kind) {
      case 'terrain': {
        const geo=new THREE.CircleGeometry(Math.min(d.width,d.depth)/2,96);
        const mesh=new THREE.Mesh(geo,material(THREE,PALETTE.grass));
        mesh.name=item.id; place(mesh,p); mesh.rotation.x=-Math.PI/2; mesh.scale.set(d.width/Math.min(d.width,d.depth),d.depth/Math.min(d.width,d.depth),1); root.add(mesh); made=[mesh]; break;
      }
      case 'water': {
        const m=new THREE.Mesh(new THREE.RingGeometry(d.width*.32,d.width*.5,128),material(THREE,PALETTE['lake-water'],{roughness:.28,metalness:.08}));
        m.name=item.id; place(m,p); m.rotation.x=-Math.PI/2; m.scale.set(1,d.depth/d.width,1); root.add(m); made=[m]; break;
      }
      case 'shoreline': {
        const m=ring(THREE,root,item.id,p,d.innerRadius,d.outerRadius,PALETTE['rock-and-reeds']); made=[m]; break;
      }
      case 'road':
      case 'footpath':
      case 'bridge':
      case 'dock': {
        // Explicit orientation wins. Legacy bridge/dock descriptors without one keep the X-axis default.
        const horizontal=item.orientation ? item.orientation==='x' : item.kind==='bridge' || item.kind==='dock';
        // Convention: width is across the route; length is along it.
        // X-oriented routes put length on X, Z-oriented routes put length on Z.
        const width=d.width??5, length=d.length??d.depth??8, height=d.height??.2;
        made=[box(THREE,root,item.id,p,horizontal?length:width,height,horizontal?width:length,PALETTE[item.material]??0x777777)];
        if(item.kind==='road' && length>=40) made.push(...addRoadFixtures(THREE,root,item));
        if(item.kind==='bridge') {
          for (const side of [-1,1]) made.push(box(THREE,root,item.id+'-rail-'+side,{x:p.x+(horizontal?0:side*(width/2-.25)),y:p.y+height/2+.45,z:p.z+(horizontal?side*(width/2-.25):0)},horizontal?length:.35,.8,horizontal?.35:length,0x4c4d4d));
        }
        break;
      }
      case 'property-lot': {
        const w=d.width,dep=d.depth;
        const boundary=new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(w,.12,dep)),new THREE.LineBasicMaterial({color:PALETTE['lot-boundary']}));
        boundary.name=item.id+'-boundary'; place(boundary,{x:p.x,y:p.y+.08,z:p.z}); root.add(boundary); made.push(boundary);
        if(item.buildingFootprint) {
          const f=item.buildingFootprint, color=PALETTE[item.tier]??0x9c927e;
          made.push(box(THREE,root,item.id+'-building-blockout',{x:p.x,y:p.y+f.height/2,z:p.z},f.width,f.height,f.depth,color));
          const roof=box(THREE,root,item.id+'-roof-blockout',{x:p.x,y:p.y+f.height+.12,z:p.z},f.width+.35,.24,f.depth+.35,0x49352a);
          made.push(roof);
          made.push(...addEstateFacade(THREE,root,item));
          made.push(...addEstateLandscaping(THREE,root,item));
        }
        break;
      }
      case 'tree': made=addTree(THREE,root,item); break;
      case 'landmark': made=addLandmark(THREE,root,item); break;
      case 'entrance-trigger': {
        const mesh=new THREE.Mesh(new THREE.CylinderGeometry(d.radius,d.radius,d.height,24,1,true),material(THREE,PALETTE['interaction-volume'],{transparent:true,opacity:.12}));
        mesh.name=item.id; place(mesh,{x:p.x,y:p.y+d.height/2,z:p.z}); root.add(mesh); made=[mesh];
        mesh.userData={destinationId:item.destinationId,requiresExplicitConfirmation:true,interact:()=>onInteract(item)}; break;
      }
      default:
        made=[box(THREE,root,item.id,p,d.width??2,d.height??1,d.depth??2,PALETTE[item.material]??0x888888)];
    }
    objects.set(item.id,made);
  }
  scene.add(root);
  let disposed=false;
  return Object.freeze({
    root,
    getObject(id){return objects.get(id)??null;},
    get objectCount(){return objects.size;},
    dispose(){
      if(disposed)return false;
      disposed=true; scene.remove(root);
      root.traverse?.(node=>{
        node.geometry?.dispose?.();
        if(Array.isArray(node.material)) node.material.forEach(m=>m?.dispose?.()); else node.material?.dispose?.();
      });
      objects.clear(); return true;
    }
  });
}
