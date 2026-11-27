// Visual-only furniture quality from the public, already-unlocked upgrade list.
// Tours and unsold show-homes stay on the basic set. No prices or payment state.
export const ESTATE_FURNITURE_QUALITY=Object.freeze({basic:0,furnished:1,premium:2});
export function estateFurnitureQuality({upgrades=[],tour=false}={}){
 if(tour)return 0;
 const n=new Set((Array.isArray(upgrades)?upgrades:[]).filter(id=>typeof id==='string'&&id)).size;
 if(n>=5)return 2;
 if(n>=2)return 1;
 return 0;
}
export function estateFurnitureQualityName(q){
 return q>=2?'premium':q>=1?'furnished':'basic';
}

function rotHalf(w,d,ry){const c=Math.abs(Math.cos(ry||0)),s=Math.abs(Math.sin(ry||0));return {hx:(c*w+s*d)/2,hz:(s*w+c*d)/2};}
function roomKinds(name=''){
 const n=String(name).toLowerCase(),kinds=[];
 if(/bed|suite|guest/.test(n))kinds.push('bedroom');
 if(/bath|spa/.test(n))kinds.push('bath');
 if(/study|library|office/.test(n))kinds.push('office');
 if(/kitchen|dining/.test(n))kinds.push('kitchen');
 if(/living|lounge|gallery|foyer|entry|hall/.test(n)||!kinds.length)kinds.push('living');
 return kinds;
}
function inRoom(room,x,z,hx,hz,pad=.08){
 return x-hx>=room.x0+pad&&x+hx<=room.x1-pad&&z-hz>=room.z0+pad&&z+hz<=room.z1-pad;
}

// Author additional furnishings into an existing home floor. Only shipped CC BY
// models (sofa, armchair, bed, bookshelf, plants, chandelier, …) are referenced,
// plus in-engine glass/brass display cases — no extra blocky hero meshes.
export function dressHomeQuality(add,ctx={}){
 const {quality=0,rooms=[],H=3,hx=3,hz=3,keepClear=[],items=[],occupied,low=false,doorX=0}=ctx;
 if(typeof occupied!=='function'||!rooms.length)return;
 const solids=()=>items.filter(p=>p.solid);
 const blocked=(x,z,w,d,ry=0)=>{
  if(occupied(x,z,w,d,ry))return true;
  const r=rotHalf(w,d,ry);
  if(Math.abs(x)+r.hx>hx-.06||Math.abs(z)+r.hz>hz-.06)return true;
  if(keepClear.some(([kx,kz,ex,ez])=>Math.abs(x-kx)<r.hx+ex&&Math.abs(z-kz)<r.hz+ez))return true;
  // Keep the front-door approach clear on every floor plan.
  if(Math.abs(x-doorX)<r.hx+.45&&z>hz-.95-r.hz)return true;
  return solids().some(p=>{
   const o=rotHalf(p.w,p.d,p.ry||0);
   return Math.abs(p.x-x)<o.hx+r.hx-.02&&Math.abs(p.z-z)<o.hz+r.hz-.02;
  });
 };
 const has=(pred)=>items.some(pred);
 const placeModel=(id,x,z,rot=0,opt={})=>{
  const size=ctx.sizes?.[id];if(!size)return false;
  const [mw,mh,md]=size,sx=opt.sx||1,ry=(rot||0)*Math.PI/180,y=opt.y||0;
  const w=mw*sx,d=md;
  if(blocked(x,z,w,d,ry))return false;
  add('quality-'+id+'-'+items.length,x,y+mh/2,z,w,mh,d,opt.mat||'home-wood',opt.solid!==false,'box',ry,{model:{id,sx,y},...(opt.detail?{detail:true}:{})});
  return true;
 };
 const tryModel=(id,room,spots,rot,opt)=>{
  for(const [x,z,r=rot] of spots){
   if(!inRoom(room,x,z,.2,.2))continue;
   if(placeModel(id,x,z,r,opt))return true;
  }
  return false;
 };
 const wallSpots=(room,depth=.55,step=.7)=>{
  // Only decorate shell walls — never park solids on interior partitions
  // (those edges are how you walk between rooms).
  const spots=[],frontLimit=room.z1-1.15;
  const onSouth=Math.abs(room.z0+hz)<.2,onNorth=Math.abs(room.z1-hz)<.2;
  const onWest=Math.abs(room.x0+hx)<.2,onEast=Math.abs(room.x1-hx)<.2;
  for(let x=room.x0+1.15;x<=room.x1-1.15;x+=step){
   if(onSouth)spots.push([x,room.z0+depth,0]);
   if(onNorth&&room.z1-depth<=frontLimit)spots.push([x,room.z1-depth,180]);
  }
  for(let z=room.z0+1.15;z<=Math.min(room.z1-1.15,frontLimit);z+=step){
   if(onWest)spots.push([room.x0+depth,z,90]);
   if(onEast)spots.push([room.x1-depth,z,-90]);
  }
  return spots;
 };
 const addArt=(room,i,x,y,z,wall,aw,ah)=>{
  const along=wall[1]==='z',sg=wall[0]==='-'?-1:1;
  const fw=along?aw+.08:.04,fd=along?.04:aw+.08;
  if(blocked(x,z,fw,.02,0))return false;
  if(!inRoom(room,x,z,fw/2,fd/2,.02))return false;
  add('quality-art-frame-'+i,x,y,z,fw,ah+.08,fd,quality>=2?'home-brass':'home-dark-wood');
  add('quality-art-canvas-'+i,x+(along?0:sg*.025),y,z+(along?sg*.025:0),along?aw:.01,ah,along?.01:aw,['home-art-a','home-art-b','home-art-c'][i%3],false);
  return true;
 };
 const addRug=(id,x,z,w,d,room)=>{
  if(!inRoom(room,x,z,w/2,d/2,.04))return false;
  add(id,x,.012,z,w,.02,d,'home-rug');
  return true;
 };
 const addCase=(room,x,z,ry)=>{
  const w=.72,h=1.42,d=.38,rad=ry*Math.PI/180;
  if(blocked(x,z,w,d,rad)||!inRoom(room,x,z,.4,.22))return false;
  add('quality-case-body-'+items.length,x,h/2,z,w,h,d,'home-dark-wood',true,'box',rad);
  add('quality-case-glass-'+items.length,x,h/2+.04,z,.6,h-.2,.06,'home-glass',false,'box',rad);
  add('quality-case-trim-'+items.length,x,h+.02,z,w+.04,.04,d+.04,'home-brass',false,'box',rad);
  add('quality-case-glow-'+items.length,x,h-.12,z,.5,.02,.2,'home-warm',false,'box',rad);
  return true;
 };

 let artN=items.filter(i=>/^art-canvas-/.test(i.id)).length;
 for(const room of rooms){
  const kinds=roomKinds(room.name),cx=(room.x0+room.x1)/2,cz=(room.z0+room.z1)/2;
  const wide=room.x1-room.x0,deep=room.z1-room.z0;
  const spots=wallSpots(room);
  for(const kind of kinds){

  if(kind==='bedroom'){
   if(!has(i=>/rug|runner/.test(i.id)&&inRoom(room,i.x,i.z,i.w/2||.4,i.d/2||.4,0)))
    addRug('quality-rug-bed-'+items.length,cx,cz,Math.min(1.8,wide-0.9),Math.min(1.3,deep-0.9),room);
   if(quality>=1&&!low){
    tryModel('snake',room,spots,0,{detail:true,solid:true,mat:'home-plant'});
    const wall=deep>=wide?'+x':'+z';
    const ax=wall==='+x'?room.x0+.05:cx,az=wall==='+x'?cz:room.z0+.05;
    addArt(room,artN++,ax,1.7,az,wall,Math.min(1.0,wide*.4),.55);
   }
   if(quality>=2&&!low&&wide>=3.2)tryModel('armchair',room,spots,180,{detail:true,mat:'home-fabric'});
  }

  if(kind==='living'){
   if(!has(i=>/rug|runner/.test(i.id)&&inRoom(room,i.x,i.z,i.w/2||.5,i.d/2||.5,0)))
    addRug('quality-rug-live-'+items.length,cx,cz,Math.min(2.4,wide-0.8),Math.min(1.8,deep-0.8),room);
   if(quality>=1){
    const seated=items.filter(i=>inRoom(room,i.x,i.z,.2,.2,0)&&(/armchair|sofa/.test(i.model?.id||'')||/armchair|sofa/.test(i.id||''))).length;
    if(seated<2)tryModel('armchair',room,spots,0,{mat:'home-fabric'});
    if(!low)tryModel(seated?'snake':'monstera',room,spots,0,{detail:true,mat:'home-plant'});
    const wall=Math.abs(room.x0)>Math.abs(room.x1)?'+x':'+z';
    addArt(room,artN++,wall==='+x'?room.x0+.05:cx,1.75,wall==='+x'?cz:room.z0+.05,wall,Math.min(1.15,wide*.45),.65);
   }
   if(quality>=2){
    if(H>=3&&!has(i=>i.model?.id==='chandelier'&&inRoom(room,i.x,i.z,.4,.4,0))){
     add('quality-chandelier-'+items.length,cx,H-.45,cz,.9,.59,.9,'home-brass',false,'box',0,{model:{id:'chandelier',sx:.9,y:H-.7}});
    }
    const caseSpot=spots.find(([x,z])=>!blocked(x,z,.72,.38,0));
    if(caseSpot)addCase(room,caseSpot[0],caseSpot[1],0);
   }
  }

  if(kind==='kitchen'){
   if(quality>=1&&!/living/.test(room.name.toLowerCase())&&!has(i=>i.model?.id==='dining')&&wide>3.4&&deep>2.8)
    tryModel('dining',room,[[cx,cz,0],[cx,cz-0.3,0],[cx+0.3,cz,90]],0,{mat:'home-wood'});
   if(quality>=1&&!low)tryModel('snake',room,spots,0,{detail:true,mat:'home-plant'});
   if(quality>=2&&H>=3&&!has(i=>i.model?.id==='chandelier'&&inRoom(room,i.x,i.z,.3,.3,0)))
    add('quality-chandelier-'+items.length,cx,H-.42,cz,.9,.59,.9,'home-brass',false,'box',0,{model:{id:'chandelier',sx:.85,y:H-.68}});
  }

  if(kind==='office'){
   if(!has(i=>i.model?.id==='bookshelf'&&inRoom(room,i.x,i.z,.3,.3,0)))
    tryModel('bookshelf',room,spots,0,{mat:'home-wood'});
   if(quality>=1&&!low)tryModel('armchair',room,spots,180,{detail:true,mat:'home-fabric'});
   if(quality>=2)addCase(room,room.x1-.4,cz,-90);
  }

  if(kind==='bath'&&quality>=1){
   add('quality-vanity-glow-'+items.length,cx,2.05,room.z0+.2,.7,.04,.12,'home-warm',false);
  }
  }
 }

 if(quality>=2){
  // Brass kick plate on the front door — no collision change.
  const door=items.find(i=>i.id==='home-exit-panel');
  if(door)add('quality-door-plate',door.x,.42,door.z+(door.z>0?-.03:.03),door.w*.72,.22,.02,'home-brass',false);
 }
}

export function dressSecretRoom(items,roomId,quality=0,{low=false}={}){
 if(quality<1)return;
 const put=(id,x,y,z,w,h,d,mat,solid=false,extra)=>items.push({id,x,y,z,w,h,d,mat,solid,...(extra||{})});
 const blocked=(x,z,w,d)=>items.some(p=>{
  if(!p.solid)return false;
  return Math.abs(p.x-x)<p.w/2+w/2-.02&&Math.abs(p.z-z)<p.d/2+d/2-.02;
 });
 // Keep spawn (0,4.1) and the three interaction points clear.
 const keep=[[0,4.1,1.0],[0,5.75,1.6],[6.3,0,1.25],[-5.2,-4.3,1.5],[3.5,-4.15,1.25]];
 const clear=(x,z,w,d)=>!blocked(x,z,w,d)&&keep.every(([kx,kz,r])=>Math.hypot(x-kx,z-kz)>r+Math.max(w,d)/2);
 const plant=(id,x,z)=>{
  if(low||!clear(x,z,.5,.5))return;
  put(id,x,.3,z,.3,.95,.3,'home-plant',true,{model:{id:'snake',sx:1,y:0}});
 };
 if(roomId==='lounge'||roomId==='deluxe-lounge'){
  if(quality>=1&&clear(-1.2,1.6,.94,.79))put('quality-lounge-chair',-1.2,.43,1.6,.94,.85,.79,'fabric',true,{model:{id:'armchair',sx:1,y:0},ry:Math.PI});
  if(quality>=2&&!low)plant('quality-lounge-plant',5.0,3.6);
  if(quality>=2)put('quality-lounge-chandelier',0,3.95,-1.8,.9,.59,.9,'gold',false,{model:{id:'chandelier',sx:1,y:3.7}});
 }
 if(roomId==='arcade'||roomId==='vault'){
  if(quality>=1&&clear(4.6,2.2,.5,.5)&&!low)plant('quality-arcade-plant',4.6,2.2);
  if(quality>=2)put('quality-arcade-case',5.4,1.1,4.4,.7,1.4,.4,'gold',true);
 }
 if(roomId==='workshop'){
  if(quality>=1&&clear(3.2,2.4,.64,.63))put('quality-workshop-chair',3.2,.54,2.4,.64,.85,.63,'fabric',true,{model:{id:'armchair',sx:.9,y:0}});
  if(quality>=2&&!low)plant('quality-workshop-plant',-6.2,4.4);
 }
 if(roomId==='bunker'){
  if(quality>=1)put('quality-bunker-rug',0,.03,1.4,2.6,.04,1.8,'rug',false);
  if(quality>=2&&clear(-2.2,2.4,.94,.79))put('quality-bunker-chair',-2.2,.43,2.4,.94,.85,.79,'fabric',true,{model:{id:'armchair',sx:1,y:0},ry:Math.PI/2});
 }
}
