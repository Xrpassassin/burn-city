import {estateNameplateLines,isPublicEstateOwner,estateOwnerTag} from './estates-owner-tag.mjs';

const LOT_W=20,LOT_D=18;
function doorOffset(lot){
 const f=lot.buildingFootprint;if(!f)return {x:0,z:2.5};
 const W=f.width-.6,D=f.depth-.6,doorX=lot.tier==='apartment'?0:-W*.24;
 return {x:doorX,z:D/2};
}
function flagSide(lot,upgradeIds){
 const {x:dx,z:front}=doorOffset(lot);
 const edgeZ=LOT_D/2-1.15;
 const hasSign=(upgradeIds||[]).includes('custom-sign');
 // custom-sign already occupies the right of the gate; put the flag on the left.
 const side=hasSign?-1:1;
 return {x:dx+side*2.35,z:Math.max(front+.85,edgeZ),hasSign,dx};
}

function makePlateTexture(THREE,lines){
 if(!THREE.CanvasTexture||typeof document==='undefined'||!document.createElement)return null;
 try{
  const c=document.createElement('canvas');c.width=512;c.height=160;
  const g=c.getContext('2d');if(!g)return null;
  g.fillStyle='#1b2428';g.fillRect(0,0,512,160);
  g.strokeStyle='#c6a663';g.lineWidth=8;g.strokeRect(8,8,496,144);
  g.fillStyle='#f0e6c8';g.textAlign='center';g.textBaseline='middle';
  const title=lines[0]||'',tag=lines[1]||lines[0]||'';
  if(lines.length>1){
   g.font='600 42px "Barlow",system-ui,sans-serif';g.fillText(title,256,58,460);
   g.font='500 36px "Barlow",system-ui,sans-serif';g.fillStyle='#d8c48a';g.fillText(tag,256,112,460);
  }else{
   g.font='600 48px "Barlow",system-ui,sans-serif';g.fillText(tag||title,256,80,460);
  }
  const tex=new THREE.CanvasTexture(c);
  if(THREE.SRGBColorSpace)tex.colorSpace=THREE.SRGBColorSpace;
  tex.needsUpdate=true;return tex;
 }catch{return null;}
}

export function createEstateOwnerMarkers({THREE,parent,lots=[]}={}){
 if(!THREE?.Group||!THREE?.Mesh||!parent?.add)throw TypeError('owner_marker_dependencies_required');
 const root=new THREE.Group();root.name='estates-owner-markers';parent.add(root);
 const lotById=new Map(lots.filter(l=>l.propertyId).map(l=>[l.propertyId,l]));
 let disposed=false,lastKey='',textures=[];
 const box=()=>new THREE.BoxGeometry(1,1,1);
 const cyl=()=>THREE.CylinderGeometry?new THREE.CylinderGeometry(.5,.5,1,8):box();
 const mats={};
 const mat=(key,color,opts={})=>{
  if(mats[key])return mats[key];
  const Ctor=opts.map&&THREE.MeshBasicMaterial?THREE.MeshBasicMaterial:THREE.MeshStandardMaterial;
  const m=new Ctor({color,...(opts.map?{map:opts.map}:{}),roughness:opts.roughness??.65,metalness:opts.metalness??0,
   ...(opts.emissive?{emissive:opts.emissive,emissiveIntensity:opts.emissiveIntensity??1}:{})});
  mats[key]=m;return m;
 };
 function clear(){
  for(const tex of textures)tex.dispose?.();textures=[];
  const geos=new Set();
  root.traverse?.(n=>{if(n.geometry)geos.add(n.geometry);});
  for(const g of geos)g.dispose?.();
  for(const child of [...root.children])root.remove(child);
 }
 function setOwners(properties=[],{upgradeIdsByLot=new Map()}={}){
  if(disposed)return false;
  const owners=(Array.isArray(properties)?properties:[]).filter(p=>typeof p?.propertyId==='string'&&isPublicEstateOwner(p.owner));
  const key=owners.map(p=>p.propertyId+':'+estateOwnerTag(p.owner)+':'+(upgradeIdsByLot.get(p.propertyId)||[]).join('+')).join('|');
  if(key===lastKey)return false;
  lastKey=key;clear();
  const wood=mat('wood',0x6a4e38,{roughness:.86});
  const metal=mat('metal',0x596970,{roughness:.4,metalness:.7});
  const brass=mat('brass',0xc6a663,{roughness:.4,metalness:.6});
  const cloth=mat('cloth',0x7a2e28,{roughness:.9});
  const warm=mat('warm',0xffc782,{roughness:.5,emissive:0xffc782,emissiveIntensity:1.15});
  for(const row of owners){
   const lot=lotById.get(row.propertyId);if(!lot?.position||!lot.buildingFootprint)continue;
   const upgrades=upgradeIdsByLot.get(row.propertyId)||[];
   const pos=flagSide(lot,upgrades);
   const ox=lot.position.x,oy=lot.position.y||0,oz=lot.position.z;
   const fx=ox+pos.x,fz=oz+pos.z;
   const pole=new THREE.Mesh(cyl(),metal);pole.name='owner-flag-pole-'+row.propertyId;
   pole.position.set(fx,oy+1.15,fz);pole.scale.set(.07,2.3,.07);root.add(pole);
   const finial=new THREE.Mesh(cyl(),brass);finial.name='owner-flag-finial-'+row.propertyId;
   finial.position.set(fx,oy+2.34,fz);finial.scale.set(.1,.12,.1);root.add(finial);
   const flag=new THREE.Mesh(box(),cloth);flag.name='owner-flag-'+row.propertyId;
   flag.position.set(fx+.38,oy+2.02,fz);flag.scale.set(.76,.42,.04);root.add(flag);
   const lines=estateNameplateLines(lot,row.owner);
   const tex=makePlateTexture(THREE,lines);
   if(tex)textures.push(tex);
   const plateMat=tex?mat('plate-'+row.propertyId,0xf0e6c8,{map:tex,roughness:.55}):brass;
   // When a custom sign is installed, hang the label on that monument (right of the gate).
   let px=fx,pz=fz+.16,py=oy+1.28;
   if(pos.hasSign){
    const signX=Math.max(-LOT_W/2+1.6,Math.min(LOT_W/2-1.6,pos.dx+3.0));
    px=ox+signX;pz=oz+(LOT_D/2-1.25-.45)+.09;py=oy+1.32;
   }
   const plate=new THREE.Mesh(box(),plateMat);plate.name='owner-nameplate-'+row.propertyId;
   plate.position.set(px,py,pz);plate.scale.set(pos.hasSign?1.55:.95,.34,.04);root.add(plate);
   const cap=new THREE.Mesh(box(),wood);cap.name='owner-nameplate-cap-'+row.propertyId;
   cap.position.set(px,py+.22,pz);cap.scale.set((pos.hasSign?1.55:.95)+.12,.05,.08);root.add(cap);
   if(!upgrades.includes('porch-lights')){
    for(const side of [-1,1]){
     const bx=ox+pos.dx+side*.95,bz=oz+doorOffset(lot).z+1.15;
     const post=new THREE.Mesh(cyl(),metal);post.name='owner-path-lamp-'+side+'-'+row.propertyId;
     post.position.set(bx,oy+.4,bz);post.scale.set(.08,.8,.08);root.add(post);
     const lamp=new THREE.Mesh(cyl(),warm);lamp.name='owner-path-glow-'+side+'-'+row.propertyId;
     lamp.position.set(bx,oy+.86,bz);lamp.scale.set(.14,.16,.14);root.add(lamp);
    }
   }
  }
  return true;
 }
 function dispose(){
  if(disposed)return false;disposed=true;clear();
  for(const m of Object.values(mats))m.dispose?.();
  root.removeFromParent?.();parent.remove?.(root);return true;
 }
 return {root,setOwners,dispose,get count(){return root.children.length;}};
}
