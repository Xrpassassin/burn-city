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
  const savedPlacementGroups = new Map();
  const savedBuildingStyle = Object.freeze({
    barricade: { color:0x80634a, roof:0x49352a, trim:0xc99a5d },
    garden: { color:0x426d3d, roof:0x31552d, trim:0x7ea85b },
    generator: { color:0x4d5d62, roof:0x30383d, trim:0x29dfff },
    storage_shed: { color:0x94704b, roof:0x49352a, trim:0xc99a5d },
    workshop: { color:0x777b7b, roof:0x343b42, trim:0x29dfff }
  });
  function clearSavedPlacementGroup(key) {
    const group=savedPlacementGroups.get(key);
    if(!group)return false;
    root.remove(group);
    group.traverse?.(node=>{
      node.geometry?.dispose?.();
      if(Array.isArray(node.material))node.material.forEach(m=>m?.dispose?.());else node.material?.dispose?.();
    });
    savedPlacementGroups.delete(key);
    return true;
  }
  function setSavedPlacements(placements) {
    if(!Array.isArray(placements))throw new TypeError('saved placements must be an array');
    for(const key of [...savedPlacementGroups.keys()])clearSavedPlacementGroup(key);
    let count=0;
    const seen=new Set();
    for(const p of placements) {
      if(!p||typeof p.propertyId!=='string'||typeof p.placementId!=='string'||
        !savedBuildingStyle[p.buildingType]||
        ![p.x,p.z,p.width,p.depth,p.height,p.rotationY].every(n=>typeof n==='number'&&Number.isFinite(n))||
        Math.abs(p.x)>120||Math.abs(p.z)>130||p.width<=0||p.width>12||p.depth<=0||p.depth>12||
        p.height<=0||p.height>5||Math.abs(p.rotationY/(Math.PI/2)-Math.round(p.rotationY/(Math.PI/2)))>1e-6)continue;
      const key=p.propertyId+'::'+p.placementId;
      if(seen.has(key))continue;
      seen.add(key);
      const style=savedBuildingStyle[p.buildingType];
      const group=new THREE.Group();
      group.name='estates-saved-placement-'+key.replace(/[^A-Za-z0-9_-]/g,'_');
      group.position.set(p.x,0.15,p.z);
      group.rotation.y=p.rotationY;
      const body=new THREE.Mesh(new THREE.BoxGeometry(p.width,p.height,p.depth),material(THREE,style.color));
      body.name=group.name+'-body';body.position.y=p.height/2;group.add(body);
      const roof=new THREE.Mesh(new THREE.BoxGeometry(p.width+.22,.18,p.depth+.22),material(THREE,style.roof));
      roof.name=group.name+'-roof';roof.position.y=p.height+.09;group.add(roof);
      const trim=new THREE.Mesh(new THREE.BoxGeometry(Math.min(.16,p.width*.12),Math.max(.18,p.height*.5),.08),material(THREE,style.trim,{metalness: (p.buildingType==='generator'||p.buildingType==='workshop') ? 0.35 : 0}));
      trim.name=group.name+'-trim';trim.position.set(0,p.height*.52,p.depth/2+.045);group.add(trim);
      group.userData={savedPlacement:true,propertyId:p.propertyId,placementId:p.placementId,buildingType:p.buildingType};
      root.add(group);savedPlacementGroups.set(key,group);count++;
    }
    return count;
  }
  let disposed=false;
  return Object.freeze({
    root,
    getObject(id){return objects.get(id)??null;},
    setSavedPlacements,
    get savedPlacementCount(){return savedPlacementGroups.size;},
    clearSavedPlacements(){for(const key of [...savedPlacementGroups.keys()])clearSavedPlacementGroup(key);return true;},
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
