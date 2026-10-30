// Static architectural parts in lot-local metres. All solid detail stays inside the
// existing footprint, so decorative improvements cannot obstruct public paths.
export const HOUSE_MATERIALS = Object.freeze({
  plaster:0xd8cbb5, stone:0x817d73, siding:0x71878a, timber:0x855a3c,
  roof:0x303b49, frame:0x283d49, glass:0x537f8b, warm:0xffc982,
  brass:0xb89457, leaf:0x48664c
});
export function estateHouseParts(item) {
  const f=item.buildingFootprint;
  if(!f) return [];
  const {width:w,depth:d,height:h}=f, tier=item.tier;
  const trailer=tier==='trailer', apartment=tier==='apartment', mansion=tier==='mansion', family=tier==='family';
  const parts=[];
  const add=(name,mat,x,y,z,width,height,depth,rz=0)=>parts.push({name,mat,x,y,z,width,height,depth,rz});
  // Recess the shell to leave room for frames, eaves and an entry terrace within collision bounds.
  const W=w-.6,D=d-.6, bodyH=apartment?h-.55:trailer?h-.55:h*.72;
  add('foundation','stone',0,.15,0,w,.3,d);
  add('shell',trailer?'siding':'plaster',0,.3+bodyH/2,0,W,bodyH,D);
  const front=D/2, top=.3+bodyH;
  const doorX=apartment?0:-W*.24, doorH=Math.min(2.2,bodyH*.78);
  add('entry-frame','stone',doorX,.3+doorH/2,front+.035,1.35,doorH+.18,.16);
  add('entry-door','timber',doorX,.3+doorH/2,front+.13,1.06,doorH,.08);
  add('entry-handle','brass',doorX+.35,1.2,front+.19,.07,.32,.04);
  add('entry-canopy','roof',doorX,doorH+.55,front-.15,2,.14,.8);
  add('entry-light','warm',doorX-.86,doorH+.05,front+.12,.15,.27,.09);
  function window(name,x,y,z,width,height,side=false) {
    add(name+'-surround','frame',x,y,z,side?.12:width+.18,height+.18,side?width+.18:.12);
    add(name+'-pane','glass',x+(side?.075:0),y,z+(side?0:(z<0?-.075:.075)),side?.06:width,height,side?width:.06);
    add(name+'-mullion','stone',x+(side?.115:0),y,z+(side?0:(z<0?-.115:.115)),side?.04:.07,height,side?.07:.04);
    add(name+'-sill','stone',x, y-height/2-.12,z,side?.25:width+.32,.12,side?width+.32:.25);
  }
  const floors=apartment?3:family||mansion?2:1;
  for(let floor=0;floor<floors;floor++) {
    const wy=.3+(floor+.57)*bodyH/floors, wh=Math.min(1.5,bodyH/floors*.43);
    for(const side of [-1,1]) {
      const wx=side*W*.28;
      // Keep the ground-floor entrance legible rather than glazing across its door.
      if(floor>0||side===1) window('front-'+floor+'-'+side,wx,wy,front+.025,W*(apartment?.25:.27),wh);
      window('rear-'+floor+'-'+side,wx,wy,-front-.14,W*.22,wh);
    }
    window('side-'+floor,W/2+.025,wy,0,D*.32,wh,true);
    if(floor>0) add('floor-band-'+floor,'stone',0,.3+floor*bodyH/floors,0,W+.14,.13,D+.14);
  }
  if(trailer) {
    add('low-roof','roof',0,top+.12,0,w,.24,d);
    for(const y of [.75,1.2,1.65,2.1]) if(y<top) add('siding-seam-'+y,'stone',0,y,front+.04,W,.035,.045);
    add('skirt','stone',0,.43,front+.04,W,.22,.08);
  } else if(apartment||mansion) {
    add('flat-roof','roof',0,top+.12,0,w,.24,d);
    for(const side of [-1,1]) add('parapet-'+side,'plaster',side*(W/2),top+.38,0,.18,.5,D);
    add('parapet-rear','plaster',0,top+.38,-front,W,.5,.18);
    if(apartment) {
      // Juliet balconies stay within the shell's original footprint.
      for(let floor=1;floor<3;floor++) for(const side of [-1,1]) {
        const x=side*W*.28,y=.3+floor*bodyH/3;
        add('balcony-slab','stone',x,y,front+.08,W*.32,.14,.32);
        add('balcony-rail','frame',x,y+.85,front+.2,W*.32,.07,.06);
        for(const s of [-1,0,1]) add('balcony-upright','frame',x+s*W*.13,y+.43,front+.2,.045,.82,.045);
      }
    } else {
      add('upper-pavilion','stone',W*.2,top+.56,-D*.14,W*.44,.8,D*.52);
      add('pavilion-glass','glass',W*.2,top+.58,D*.12,W*.36,.48,.08);
      for(const x of [-W*.43,W*.43]) add('entry-pier','stone',x,1.55,front+.05,.4,2.5,.4);
      add('arrival-lintel','timber',0,2.85,front-.06,W,.2,.5);
    }
  } else {
    const rise=h-top-.18, half=W/2, slope=Math.atan2(rise,half), length=Math.hypot(half,rise);
    for(const side of [-1,1]) add('pitched-roof-'+side,'roof',side*half/2,top+rise/2,0,length,.22,d,side*-slope);
    add('ridge','roof',0,top+rise,0,.22,.22,d);
    // Gable slats close the end without a solid block projecting through the pitched roof.
    for(let i=0;i<5;i++) { const y=rise*(i+.5)/5, span=W*(1-y/rise); for(const side of [-1,1]) add('gable-'+i+'-'+side,'timber',0,top+y,side*front,span,rise/5+.015,.1); }
    add('chimney','stone',-W*.28,top+rise*.8,-D*.2,.55,1.1,.65);
  }
  // Planters sit against the wall, avoiding any extra obstacle in the garden.
  for(const x of [-W*.42,W*.42]) {
    add('planter','stone',x,.51,front+.02,.62,.42,.42);
    add('plant','leaf',x,.8,front+.02,.52,.3,.36);
  }
  return parts;
}

// One instanced draw per material for the entire neighbourhood, no per-frame work.
export function renderEstateHouses(THREE,parent,items) {
  const records=new Map(),buckets=new Map();
  for(const item of items) for(const part of estateHouseParts(item)) {
    const record={...part,item};
    if(!buckets.has(part.mat)) buckets.set(part.mat,[]);
    buckets.get(part.mat).push(record);
  }
  for(const [key,parts] of buckets) {
    const mat=new THREE.MeshStandardMaterial({color:HOUSE_MATERIALS[key],roughness:key==='glass'?.28:.85,metalness:key==='brass'?.45:0,emissive:key==='warm'?HOUSE_MATERIALS.warm:0,emissiveIntensity:.45});
    if(THREE.InstancedMesh && THREE.Object3D) {
      const mesh=new THREE.InstancedMesh(new THREE.BoxGeometry(1,1,1),mat,parts.length), transform=new THREE.Object3D();
      mesh.name='estates-houses-'+key;
      parts.forEach((p,i)=>{
        transform.position.set(p.item.position.x+p.x,p.item.position.y+p.y,p.item.position.z+p.z);
        transform.rotation.set(0,0,p.rz);transform.scale.set(p.width,p.height,p.depth);transform.updateMatrix();
        mesh.setMatrixAt(i,transform.matrix);
        if(!records.has(p.item.id)) records.set(p.item.id,[]);
        if(!records.get(p.item.id).includes(mesh)) records.get(p.item.id).push(mesh);
      });
      mesh.instanceMatrix.needsUpdate=true;mesh.computeBoundingSphere();parent.add(mesh);
    } else for(const p of parts) {
      const mesh=new THREE.Mesh(new THREE.BoxGeometry(p.width,p.height,p.depth),mat);
      mesh.name=p.item.id+'-'+p.name;mesh.position.set(p.item.position.x+p.x,p.item.position.y+p.y,p.item.position.z+p.z);mesh.rotation.z=p.rz;parent.add(mesh);
      if(!records.has(p.item.id)) records.set(p.item.id,[]);records.get(p.item.id).push(mesh);
    }
  }
  return records;
}
