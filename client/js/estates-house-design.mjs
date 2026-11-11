import {estateSurfaceProperties} from './estates-material-fidelity.mjs';
import {estateFreeStyle,estatePaletteColor} from './estate-free-style-options.mjs';
// Static architectural parts in lot-local metres. All solid detail stays inside the
// existing footprint, so decorative improvements cannot obstruct public paths.
export const HOUSE_MATERIALS = Object.freeze({
  plaster:0xd3c7b6, stone:0xaaa291, siding:0x889390, timber:0x89694f,
  roof:0x474b4a, slate:0x535856, metal:0x6a746f, frame:0x444744, glass:0x647e80, warm:0xffc982,
  brass:0xada079, leaf:0x50694c, flower:0xb87e7c, copper:0x98775d, ivory:0xe3dbca,
  trim:0xe5dfd0, door:0x6d4d38, earth:0x594d40
});
export function estateHouseParts(item) {
  const f=item.buildingFootprint;
  if(!f) return [];
  const {width:w,depth:d,height:h}=f, tier=item.tier;
  const freeStyle=estateFreeStyle(item),architecture=freeStyle.architecture;
  const trailer=tier==='trailer', apartment=tier==='apartment', mansion=tier==='mansion', family=tier==='family';
  const level=Number.isInteger(item.prestigeLevel)&&item.prestigeLevel>=0&&item.prestigeLevel<=5?item.prestigeLevel:0;
  const parts=[];
  const add=(name,mat,x,y,z,width,height,depth,rz=0,shape='box')=>parts.push({name,mat,x,y,z,width,height,depth,rz,shape});
  // Recess the shell to leave room for frames, eaves and an entry terrace within collision bounds.
  const W=w-.6,D=d-.6, bodyH=apartment?h-.55:trailer?h-.55:h*.72;
  add('foundation','stone',0,.15,0,w,.3,d);
  add('shell',level>=5?'ivory':trailer?'siding':'plaster',0,.3+bodyH/2,0,W,bodyH,D);
  const front=D/2, top=.3+bodyH;
  const doorX=apartment?0:-W*.24, doorH=Math.min(2.2,bodyH*.78);
  add('entry-frame','trim',doorX,.3+doorH/2,front+.035,1.35,doorH+.18,.16);
  add('entry-door','door',doorX,.3+doorH/2,front+.13,1.06,doorH,.08);
  add('entry-handle','brass',doorX+.35,1.2,front+.19,.07,.32,.04);
  add('entry-canopy','roof',doorX,doorH+.55,front-.15,2,.14,.8);
  add('entry-light','warm',doorX-.86,doorH+.05,front+.12,.15,.27,.09);
  // Door casing, lintel, kick plate and individual facade joints keep the
  // silhouette from reading as one flat box at eye height.
  add('entry-threshold','stone',doorX,.32,front+.16,1.24,.08,.22);
  add('entry-lintel','trim',doorX,.3+doorH+.1,front+.17,1.32,.12,.15);
  for(const side of [-1,1]){
    add('entry-jamb-'+side,'trim',doorX+side*.62,.3+doorH/2,front+.17,.09,doorH,.13);
    add('corner-trim-front-'+side,'stone',side*(W/2-.08),top*.51,front+.065,.11,Math.max(.3,top-.34),.11);
  }
  add('fascia-front',architecture==='rustic'?'timber':'trim',0,top-.17,front+.07,W,.13,.13);
  add('base-flashing','copper',0,.4,front+.1,W,.035,.12);
  function window(name,x,y,z,width,height,side=false) {
    add(name+'-surround','trim',x,y,z,side?.12:width+.18,height+.18,side?width+.18:.12);
    add(name+'-pane','glass',x+(side?.075:0),y,z+(side?0:(z<0?-.075:.075)),side?.06:width,height,side?width:.06);
    add(name+'-mullion','frame',x+(side?.115:0),y,z+(side?0:(z<0?-.115:.115)),side?.04:.07,height,side?.07:.04);
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
    add('parapet-front-coping','trim',0,top+.62,front-.06,W,.1,.23);
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
      for(const x of [-W*.43,W*.43]) add('entry-pier','stone',x,1.55,front+.05,.4,2.5,.4,0,'cylinder');
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
  // Distinct *free* base-model accents are generated for all tiers. They stay
  // inside the existing collision shell and never assume a paid unlock.
  if(architecture==='modern'){
    // Clean contemporary fascia, asymmetric vertical screens and a front
    // accent panel, recessed enough not to clip existing public walkways.
    add('modern-fascia','metal',0,top-.09,front+.12,W*.94,.11,.12);
    for(const side of [-1,1]){
      const x=side*(W/2-.18);
      add('modern-edge-pilaster-'+side,'frame',x,top*.53,front+.11,.11,Math.max(.34,top-.38),.12);
      for(let i=0;i<3;i++){
        const shadeX=x-side*(.21+i*.17);
        add('modern-vertical-slat-'+side+'-'+i,'timber',shadeX,top*.7,front+.135,.055,Math.min(top*.34,1.4),.08);
      }
    }
    add('modern-entrance-lintel','metal',doorX,Math.min(top-.17,doorH+.54),front+.15,1.62,.18,.13);
    // A slender timber soffit warms the otherwise cool modern entrance.
    add('modern-soffit','timber',doorX,Math.min(top-.26,doorH+.36),front+.16,1.45,.055,.1);
  }else if(architecture==='rustic'){
    // Exposed timber joinery and capped stone corner piers make every tier
    // read as a warm lodge/craftsman variant, not a recolored default cube.
    for(const side of [-1,1]){
      const x=side*(W/2-.19);
      add('rustic-corner-timber-'+side,'timber',x,top*.5,front+.10,.16,Math.max(.35,top-.42),.14);
      add('rustic-stone-plinth-'+side,'stone',x,.53,front+.10,.3,.48,.17);
      add('rustic-eave-bracket-'+side,'timber',x,top-.28,front+.12,.32,.32,.13);
      // Tapered-looking diagonal timber support reads as structural joinery.
      add('rustic-knee-brace-'+side,'timber',x-side*.22,top-.53,front+.14,.065,.45,.085,side*.52);
    }
    add('rustic-heavy-lintel','timber',doorX,Math.min(top-.23,doorH+.44),front+.18,1.76,.23,.17);
    add('rustic-roof-trim','timber',0,top-.09,front+.13,W*.9,.075,.12);
    add('rustic-door-step','stone',doorX,.33,front+.135,1.1,.06,.16);
  }else{
    // Traditional masonry accents and a restrained transom add relief
    // to the default house without affecting its prestige stages.
    for(const side of [-1,1]){
      const x=side*(W/2-.15);
      for(let i=0;i<4;i++)add('classic-corner-quoins-'+side+'-'+i,'stone',x,.58+i*(Math.max(1.1,top-1.1)/4),front+.11,.24,.19,.12);
    }
    add('classic-door-transom','glass',doorX,Math.min(top-.24,doorH+.48),front+.2,.72,.14,.045);
    add('classic-eave-cornice','trim',0,top-.22,front+.145,W*.88,.12,.13);
  }
  // Planters sit against the wall, avoiding any extra obstacle in the garden.
  for(const x of [-W*.42,W*.42]) {
    // Round clay/stone pots with a soil disc avoid the box-planter silhouette.
    add('planter','stone',x,.51,front+.02,.58,.42,.42,0,'cylinder');
    add('planter-rim','trim',x,.73,front+.02,.66,.055,.46,0,'cylinder');
    add('planter-soil','earth',x,.755,front+.02,.48,.035,.34,0,'cylinder');
    add('plant','leaf',x,.9,front+.02,.52,.32,.36,0,'sphere');
    for(const dx of [-.17,.13])add('plant-frond-'+dx,'leaf',x+dx,1.04,front+.02,.13,.29,.15,dx<0?-.22:.22,'sphere');
  }
  // Cumulative cosmetic stages: no garden objects beyond the collision shell.
  if(level>=1) for(const side of [-1,1]) {
    const x=side*W*.33;
    add('garden-box','timber',x,.5,front+.06,W*.22,.32,.28);
    add('garden-leaf','leaf',x,.72,front+.06,W*.24,.2,.26,0,'sphere');
    for(const dx of [-.22,0,.22])add('garden-flower','flower',x+dx,.86,front+.09,.12,.16,.12,0,'sphere');
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
    const style=estateFreeStyle(item);
    const record={...part,item,freePalette:style.palette};
    const bucket=part.mat+'|'+part.shape+'|'+style.palette;
    if(!buckets.has(bucket)) buckets.set(bucket,[]);
    buckets.get(bucket).push(record);
  }
  for(const [bucket,parts] of buckets) {
    const [key,shape,palette]=bucket.split('|');
    const mat=new THREE.MeshStandardMaterial({
      color:estatePaletteColor(key,palette,HOUSE_MATERIALS[key]),
      roughness:key==='glass'?.22:key==='brass'?.43:key==='roof'?.69:key==='frame'?.52:key==='metal'?.5:key==='timber'||key==='door'?.75:key==='stone'?.92:.84,
      metalness:key==='brass'?.45:key==='copper'?.52:key==='frame'?.36:key==='metal'?.55:0,
      emissive:key==='warm'?HOUSE_MATERIALS.warm:0,emissiveIntensity:.45,
      ...estateSurfaceProperties(THREE,key)
    });
    const geometry=(w=1,h=1,d=1)=>{
      if(shape==='sphere'&&THREE.SphereGeometry){const g=new THREE.SphereGeometry(.5,12,8);g.scale?.(w,h,d);return g;}
      if(shape==='cylinder'&&THREE.CylinderGeometry){const g=new THREE.CylinderGeometry(.5,.5,1,12);g.scale?.(w,h,d);return g;}
      return new THREE.BoxGeometry(w,h,d);
    };
    if(THREE.InstancedMesh && THREE.Object3D) {
      const mesh=new THREE.InstancedMesh(geometry(),mat,parts.length), transform=new THREE.Object3D();
      mesh.name='estates-houses-'+key+'-'+shape+(palette==='original'?'':'-'+palette);
      parts.forEach((p,i)=>{
        transform.position.set(p.item.position.x+p.x,p.item.position.y+p.y,p.item.position.z+p.z);
        transform.rotation.set(0,0,p.rz);transform.scale.set(p.width,p.height,p.depth);transform.updateMatrix();
        mesh.setMatrixAt(i,transform.matrix);
        if(!records.has(p.item.id)) records.set(p.item.id,[]);
        if(!records.get(p.item.id).includes(mesh)) records.get(p.item.id).push(mesh);
      });
      mesh.instanceMatrix.needsUpdate=true;mesh.computeBoundingSphere();parent.add(mesh);
    } else for(const p of parts) {
      const mesh=new THREE.Mesh(geometry(p.width,p.height,p.depth),mat);
      mesh.name=p.item.id+'-'+p.name;mesh.position.set(p.item.position.x+p.x,p.item.position.y+p.y,p.item.position.z+p.z);mesh.rotation.z=p.rz;parent.add(mesh);
      if(!records.has(p.item.id)) records.set(p.item.id,[]);records.get(p.item.id).push(mesh);
    }
  }
  return records;
}
