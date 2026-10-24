// Optional Three.js renderer adapter for buildEstatesIslandScene().
// Pass the same THREE namespace already used by the host experience; no new CDN or bundle dependency.
const PALETTE = {
  grass:0x526d3b, asphalt:0x292b2b, stone:0x9b9588, 'weathered-concrete':0x77766e,
  'steel-concrete':0x525d61, timber:0x765034, 'lake-water':0x164f70, 'rock-and-reeds':0x77765b,
  'lot-boundary':0xe5b45d, 'interaction-volume':0x34d7ff, pine:0x31563a, deciduous:0x4d7544,
  trailer:0x8e8a80, apartment:0xc2b5a1, starter:0xb59a76, family:0x9e8466, mansion:0xd1c3a2
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
        mesh.name=item.id; place(mesh,p); mesh.rotation.x=-Math.PI/2; mesh.scale.set(d.width/Math.min(d.width,d.depth),1,d.depth/Math.min(d.width,d.depth)); root.add(mesh); made=[mesh]; break;
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
        const horizontal=item.orientation==='x' || item.kind==='bridge' || item.kind==='dock';
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
