import {estateSurfaceProperties} from './estates-material-fidelity.mjs';
// Static architectural parts in lot-local metres. All solid detail stays inside the
// existing footprint, so decorative improvements cannot obstruct public paths.
export const HOUSE_MATERIALS = Object.freeze({
  plaster:0xd8cbb5, stone:0x817d73, siding:0x71878a, timber:0x855a3c,
  roof:0x303b49, frame:0x283d49, glass:0x537f8b, warm:0xffc982,
  brass:0xb89457, leaf:0x48664c, flower:0xd37a73, copper:0xb0754a, ivory:0xe9dfcc
});
export function estateHouseParts(item) {
  const f=item.buildingFootprint;
  if(!f) return [];
  const {width:w,depth:d,height:h}=f, tier=item.tier;
  const trailer=tier==='trailer', apartment=tier==='apartment', mansion=tier==='mansion', family=tier==='family';
  const level=Number.isInteger(item.prestigeLevel)&&item.prestigeLevel>=0&&item.prestigeLevel<=5?item.prestigeLevel:0;
  const parts=[];
  const add=(name,mat,x,y,z,width,height,depth,rz=0)=>parts.push({name,mat,x,y,z,width,height,depth,rz});
  // Recess the shell to leave room for frames, eaves and an entry terrace within collision bounds.
  const W=w-.6,D=d-.6, bodyH=apartment?h-.55:trailer?h-.55:h*.72;
  add('foundation','stone',0,.15,0,w,.3,d);
  add('shell',level>=5?'ivory':trailer?'siding':'plaster',0,.3+bodyH/2,0,W,bodyH,D);
  const front=D/2, top=.3+bodyH;
  const doorX=apartment?0:-W*.24, doorH=Math.min(2.2,bodyH*.78);
  add('entry-frame','stone',doorX,.3+doorH/2,front+.035,1.35,doorH+.18,.16);
  add('entry-door','timber',doorX,.3+doorH/2,front+.13,1.06,doorH,.08);
  add('entry-handle','brass',doorX+.35,1.2,front+.19,.07,.32,.04);
  add('entry-canopy','roof',doorX,doorH+.55,front-.15,2,.14,.8);
  add('entry-light','warm',doorX-.86,doorH+.05,front+.12,.15,.27,.09);
  // Door casing, lintel, kick plate and individual facade joints keep the
  // silhouette from reading as one flat box at eye height.
  add('entry-threshold','stone',doorX,.32,front+.19,1.24,.08,.23);
  add('entry-lintel','timber',doorX,.3+doorH+.1,front+.17,1.32,.12,.15);
  for(const side of [-1,1]){
    add('entry-jamb-'+side,'stone',doorX+side*.62,.3+doorH/2,front+.17,.09,doorH,.13);
    add('corner-trim-front-'+side,'stone',side*(W/2-.08),top*.51,front+.065,.11,Math.max(.3,top-.34),.11);
  }
  add('fascia-front','timber',0,top-.17,front+.07,W,.13,.13);
  add('base-flashing','copper',0,.4,front+.1,W,.035,.12);
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
    // Shallow pitched standing-seam roof, not a featureless black cube.
    const rise=.22,half=(w-.08)/2,angle=Math.atan2(rise,half),span=Math.hypot(half,rise);
    for(const side of [-1,1]){
      add('low-roof-panel-'+side,'roof',side*half/2,top+rise/2,0,span,.16,d-.12,-side*angle);
      for(let k=1;k<=4;k++){
        const t=k/5;
        add('low-roof-standing-seam-'+side+'-'+k,'frame',side*(t*half),top+rise*(1-t)+.09,0,.043,.045,d-.28);
      }
      add('gutter-'+side,'metal',side*(w/2-.09),top-.07,0,.12,.12,d-.14);
    }
    add('low-roof-ridge','slate',0,top+rise+.06,0,.18,.09,d-.13);
    for(const y of [.75,1.2,1.65,2.1]) if(y<top) add('siding-seam-'+y,'stone',0,y,front+.04,W,.035,.045);
    add('skirt','stone',0,.43,front+.04,W,.22,.08);
    for(const side of [-1,1]){
      add('skirting-vent-'+side,'frame',side*W*.34,.49,front+.1,.53,.13,.065);
      add('roof-end-trim-'+side,'timber',side*(W/2-.12),top-.05,front+.08,.09,.16,.08);
    }
  } else if(apartment||mansion) {
    add('flat-roof','roof',0,top+.12,0,w,.24,d);
    // Roof flashing + waterproof seams break up large, untextured planes.
    for(const x of [-W*.37,-W*.12,W*.13,W*.38]){
      add('roof-membrane-joint-'+x.toFixed(2),'slate',x,top+.255,0,.045,.035,d-.34);
    }
    add('parapet-front-coping','stone',0,top+.62,front-.06,W,.1,.23);
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
      add('pavilion-cap','slate',W*.2,top+1.015,-D*.14,W*.47,.11,D*.55);
      add('arrival-stonework','stone',0,top*.63,front+.085,W*.83,.055,.07);
      add('pavilion-glass','glass',W*.2,top+.58,D*.12,W*.36,.48,.08);
      for(const x of [-W*.43,W*.43]) add('entry-pier','stone',x,1.55,front+.05,.4,2.5,.4);
      add('arrival-lintel','timber',0,2.85,front-.06,W,.2,.5);
    }
  } else {
    const rise=h-top-.18, half=W/2, slope=Math.atan2(rise,half), length=Math.hypot(half,rise);
    for(const side of [-1,1]) add('pitched-roof-'+side,'roof',side*half/2,top+rise/2,0,length,.22,d,side*-slope);
    add('ridge','roof',0,top+rise,0,.22,.22,d);
    // Standing seams are aligned to the actual pitched roof, not loose in
    // the air. Use thin strips parallel to the fall, bounded by the eave.
    for(const side of [-1,1])for(let i=1;i<=5;i++){
      const t=i/6;
      add('pitched-roof-seam-'+side+'-'+i,'slate',side*half*t,top+rise*(1-t)+.12,0,.046,.045,d-.25);
    }
    // Gable slats close the end without a solid block projecting through the pitched roof.
    for(let i=0;i<5;i++) { const y=rise*(i+.5)/5, span=W*(1-y/rise); for(const side of [-1,1]) add('gable-'+i+'-'+side,'timber',0,top+y,side*front,span,rise/5+.015,.1); }
    add('chimney','stone',-W*.28,top+rise*.8,-D*.2,.55,1.1,.65);
  }
  // Planters sit against the wall, avoiding any extra obstacle in the garden.
  for(const x of [-W*.42,W*.42]) {
    add('planter','stone',x,.51,front+.02,.62,.42,.42);
    add('planter-rim','timber',x,.73,front+.02,.66,.06,.46);
    add('plant','leaf',x,.8,front+.02,.52,.3,.36);
    for(const dx of [-.17,.13])add('plant-frond-'+dx,'leaf',x+dx,.96,front+.02,.13,.29,.15,dx<0?-.22:.22);
  }
  // Cumulative cosmetic stages: no garden objects beyond the collision shell.
  if(level>=1) for(const side of [-1,1]) {
    const x=side*W*.33;
    add('garden-box','timber',x,.5,front+.06,W*.22,.32,.28);
    add('garden-leaf','leaf',x,.72,front+.06,W*.24,.2,.26);
    for(const dx of [-.22,0,.22])add('garden-flower','flower',x+dx,.86,front+.09,.12,.16,.12);
  }
  if(level>=2) {
    add('crafted-base-band','stone',0,.48,front+.09,W,.16,.16);
    for(const side of [-1,1]) {
      add('crafted-corner','stone',side*(W/2-.12),top/2,front+.05,.23,top-.25,.22);
      // Shutters frame the right ground-floor window without covering its pane.
      add('crafted-shutter','timber',W*.28+side*(W*.135+.2),.3+.57*bodyH/floors,front+.14,.18,Math.min(1.6,bodyH/floors*.48),.12);
    }
  }
  if(level>=3) {
    add('copper-eave','copper',0,top,front+.06,W,.12,.16);
    for(const side of [-1,1]) {
      const x=side*(W*.38);
      add('signature-lantern-case','frame',x,1.65,front+.08,.23,.56,.18);
      add('signature-lantern-glow','warm',x,1.65,front+.19,.15,.39,.05);
      add('signature-lantern-cap','copper',x,1.98,front+.1,.3,.1,.24);
    }
  }
  if(level>=4) {
    const canopyY=Math.min(top-.25,doorH+.65),span=Math.min(W*.62,4,2*(W/2-Math.abs(doorX)-.3));
    for(const side of [-1,1]) {
      add('grand-column','stone',doorX+side*span/2,canopyY/2,front-.03,.18,canopyY,.35);
      add('grand-capital','brass',doorX+side*span/2,canopyY-.08,front-.03,.25,.14,.4);
    }
    for(let i=0;i<5;i++) add('grand-pergola','timber',doorX-span/2+i*span/4,canopyY+.06,front-.08,.12,.14,.65);
    add('grand-pergola-beam','timber',doorX,canopyY-.07,front+.18,span+.28,.18,.12);
  }
  if(level>=5) {
    add('landmark-inlay','brass',0,top*.83,front+.12,W*.84,.08,.06);
    const crestY=apartment||mansion?top+.62:top+(h-top)*.65;
    add('landmark-crest','brass',0,crestY,0,.42,.42,.42,Math.PI/4);
    for(const side of [-1,1]) add('landmark-corner-inlay','copper',side*(W/2-.12),top/2,front+.18,.055,top-.35,.04);
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
    const mat=new THREE.MeshStandardMaterial({
      color:HOUSE_MATERIALS[key],
      roughness:key==='glass'?.17:key==='brass'?.36:key==='roof'?.62:key==='frame'?.44:key==='stone'?.92:.82,
      metalness:key==='brass'?.48:key==='copper'?.61:key==='frame'?.45:0,
      emissive:key==='warm'?HOUSE_MATERIALS.warm:0,emissiveIntensity:.45,
      ...estateSurfaceProperties(THREE,key)
    });
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
