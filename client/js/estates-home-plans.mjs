// Authored walk-in floor plans for every Estates home tier (pure data + geometry,
// no three.js). Interiors match the exterior shell in estates-house-design.mjs:
// same footprint, the front door at the same x, windows at the same wall positions,
// and two storeys for Family and Mansion homes (stairs switch floors).
// Furniture marked `model` is replaced by a lazily loaded CC BY Sketchfab model
// (estates-interior-models.mjs); the box primitive is the instant fallback.
export const INTERIOR_MODEL_SIZE=Object.freeze({
 sofa:[1.9,.55,.66],armchair:[.94,.85,.79],bed:[1.07,.82,2.05],bookshelf:[1.4,1.85,.68],
 kitchen:[1.7,1.05,.59],fridge:[.76,1.8,.86],monstera:[1,.61,.88],snake:[.3,.95,.3],
 tvstand:[1.5,.67,.64],dining:[1.75,.92,1.07],chandelier:[.9,.59,.9]
});
const FALLBACK_MAT={sofa:'home-fabric',armchair:'home-fabric',bed:'home-cream',bookshelf:'home-wood',kitchen:'home-dark-wood',
 fridge:'home-white',monstera:'home-plant',snake:'home-plant',tvstand:'home-dark-wood',dining:'home-wood',chandelier:'home-brass'};
export const HOME_FOOTPRINT=Object.freeze({trailer:[6,5],apartment:[7,8],starter:[8,7],family:[10,9],mansion:[13,11]});
export const HOME_FLOORS=Object.freeze({trailer:1,apartment:1,starter:1,family:2,mansion:2});
const EXTERIOR_HEIGHT={trailer:3,apartment:10,starter:5,family:6,mansion:8};
const FLOOR_MAT={trailer:'home-floor-vinyl',apartment:'home-floor',starter:'home-floor',family:'home-floor-oak',mansion:'home-floor-marble'};
const WALL_MAT={trailer:'home-wall-panel',apartment:'home-wall',starter:'home-wall',family:'home-wall-sage',mansion:'home-wall-ivory'};
const T=.12,DOOR_H=2.15,rad=d=>d*Math.PI/180;
// Same formulas as estates-house-design.mjs (exterior shell = footprint - .6).
export function exteriorOpenings(tier){
 const [w,d]=HOME_FOOTPRINT[tier]||HOME_FOOTPRINT.trailer,W=w-.6,D=d-.6,h=EXTERIOR_HEIGHT[tier]||3;
 const apartment=tier==='apartment',trailer=tier==='trailer';
 const bodyH=apartment||trailer?h-.55:h*.72,floors=apartment?3:tier==='family'||tier==='mansion'?2:1;
 const perFloor=bodyH/floors,windows=[];
 // Interior shows the storeys you can walk: the apartment unit is its ground floor.
 for(let floor=0;floor<(apartment?1:floors);floor++){
  const y=(floor+.57)*perFloor-floor*perFloor,height=Math.min(1.5,perFloor*.43);
  for(const side of [-1,1]){
   if(floor>0||side===1)windows.push({floor,wall:'front',x:side*W*.28,y,height,width:W*(apartment?.25:.27)});
   windows.push({floor,wall:'rear',x:side*W*.28,y,height,width:W*.22});
  }
  windows.push({floor,wall:'east',z:0,y,height,width:D*.32});
 }
 return {doorX:apartment?0:-W*.24,windows,floors:HOME_FLOORS[tier]||1};
}
function wallRun(add,id,axis,at,from,to,openings,height,mat){
 // axis 'x': wall runs along x at z=at; axis 'z': along z at x=at. Openings are [a,b] gaps.
 const gaps=[...openings].sort((a,b)=>a[0]-b[0]);let cursor=from,i=0;
 const seg=(a,b,solid=true,y=height/2,h=height)=>{
  if(b-a<.02)return;
  const c=(a+b)/2,len=b-a;
  if(axis==='x')add(id+'-'+(i++),c,y,at,len,h,T,mat,solid);else add(id+'-'+(i++),at,y,c,T,h,len,mat,solid);
 };
 for(const [a,b] of gaps){seg(cursor,a);seg(a,b,false,(DOOR_H+height)/2,height-DOOR_H);
  // painted door casing reads as a real doorway
  if(axis==='x'){add(id+'-casing-'+i,(a+b)/2,DOOR_H+.04,at,b-a+.16,.08,T+.04,'home-trim');}
  else add(id+'-casing-'+i,at,DOOR_H+.04,(a+b)/2,T+.04,.08,b-a+.16,'home-trim');
  cursor=b;}
 seg(cursor,to);
}
// Per-tier authored data. Coordinates: x east, z toward the front door (+z), metres.
// rot: furniture front direction in degrees (0 faces +z, 90 faces +x).
function planData(tier,hx,hz,doorX){
 if(tier==='trailer')return {height:2.65,floors:[{
  rooms:[{name:'Living & kitchen',x0:-hx,x1:.9,z0:-hz,z1:hz},{name:'Bedroom',x0:.9,x1:hx,z0:-hz,z1:hz}],
  walls:[['z',.9,-hz,hz,[[1.0,1.85]]]],
  furniture:[['kitchen',-1.65,-hz+.31,0],['fridge',-.35,-hz+.45,0],['sofa',-2.25,.15,90],['tvstand',.5,.1,-90],
   ['bed',1.85,-1.06,0,{sx:1.3}]],
  boxes:[['coffee-table',-1.25,.21,.15,.5,.42,.9,'home-wood',true],['dresser',2.25,.5,1.6,.6,1,.9,'home-dark-wood',true],
   ['upper-cabinets',-1.65,1.95,-hz+.17,1.7,.6,.32,'home-dark-wood'],['tv-screen',.79,1.15,.1,.05,.58,1.0,'home-screen'],
   ['bed-lamp',2.55,1.45,-.4,.08,.22,.16,'home-warm'],['rug',-1.3,.012,.15,1.6,.02,1.5,'home-rug']],
  plants:[['snake',-2.3,1.75]],
  art:[[-2.53,1.55,.15,'+x',.9,.55],[1.85,1.75,-hz+.03,'+z',.7,.5]],
  lights:[[-1.1,2.35,-.2],[1.75,2.35,-.4]],
  slots:{feature:[-2.2,1.72,90],workshop:[.35,hz-.06,'front-wall'],garden:[2.25,1.55,1.6,'shelf-z'],secure:[-.35,1.55],hatch:[-1.25,-.92],
   terminal:[-.15,.1],accent:[.55,-1.05]},
  keepClear:[[doorX,hz-.6,.62,.6]]}]};
 if(tier==='apartment')return {height:3.1,floors:[{
  rooms:[{name:'Living & kitchen',x0:-hx,x1:hx,z0:-.4,z1:hz},{name:'Bedroom',x0:-hx,x1:.4,z0:-hz,z1:-.4},{name:'Bathroom',x0:.4,x1:hx,z0:-hz,z1:-.4}],
  walls:[['x',-.4,-hx,hx,[[-.55,.25],[1.2,2.0]]],['z',.4,-hz,-.4,[]]],
  furniture:[['kitchen',hx-.31,1.0,-90],['fridge',hx-.45,2.62,-90],['sofa',-1.6,hz-.37,180],['tvstand',-1.6,-.02,0],
   ['bed',-1.7,-2.55,0,{sx:1.35}],['armchair',-2.55,1.95,90]],
  boxes:[['bistro-table',1.3,.38,1.55,.8,.76,.8,'home-wood',true],['coffee-table',-1.6,.21,1.75,1.0,.42,.5,'home-wood',true],
   ['dresser',-2.84,.5,-1.0,.45,1,1.0,'home-dark-wood',true],['nightstand',-.6,.28,-3.3,.4,.56,.4,'home-wood',true],
   ['tub',1.8,.28,-3.17,1.6,.56,.75,'home-white',true],['toilet',2.8,.22,-1.4,.42,.44,.6,'home-white',true],
   ['vanity',.7,.43,-2.0,.45,.86,.9,'home-dark-wood',true],['mirror',.47,1.55,-2.0,.03,.7,.75,'home-glass'],
   ['bath-floor',1.75,.006,-2.0,2.66,.012,3.16,'home-tile'],['tv-screen',-1.6,1.1,-.31,1.05,.6,.05,'home-screen'],
   ['upper-cabinets',hx-.17,1.95,1.0,.32,.6,1.7,'home-dark-wood'],['rug',-1.6,.012,1.6,2.2,.02,1.6,'home-rug']],
  plants:[['monstera',-2.55,.85],['snake',-.1,-3.0]],
  art:[[-hx+.03,1.7,2.2,'+x',.9,.6],[-1.7,1.9,-hz+.03,'+z',1.0,.6]],
  lights:[[-1.3,2.8,1.4],[1.8,2.8,1.6],[-1.4,2.8,-2.0],[1.7,2.8,-2.0]],
  slots:{feature:[-2.72,.85,90],workshop:[-hx+.06,2.0,'west-wall'],garden:[1.79,1.0,hz-.12,'sill'],secure:[.95,1.55],hatch:[-.15,1.15],
   terminal:[-1.6,.75],accent:[1.9,3.3]},
  keepClear:[[doorX,hz-.6,.62,.6],[-.15,-.4,.45,.5],[1.6,-.4,.45,.5]]}]};
 if(tier==='starter')return {height:3.1,floors:[{
  rooms:[{name:'Living room',x0:-hx,x1:1,z0:.2,z1:hz},{name:'Kitchen & dining',x0:-hx,x1:1,z0:-hz,z1:.2},
   {name:'Bedroom',x0:1,x1:hx,z0:-.6,z1:hz},{name:'Bathroom',x0:1,x1:hx,z0:-hz,z1:-.6}],
  walls:[['z',1,-hz,hz,[[-2.2,-1.3],[2.1,2.95]]],['x',-.6,1,hx,[]]],
  furniture:[['kitchen',-2.6,-hz+.31,0],['fridge',-1.25,-hz+.45,0],['dining',-1.6,-1.0,0],['sofa',-3.25,1.3,90],
   ['tvstand',.62,.72,-90],['armchair',-.5,2.72,180],['bed',2.35,.5,0,{sx:1.35}]],
  boxes:[['coffee-table',-2.3,.21,1.2,.5,.42,.9,'home-wood',true],['dresser',3.25,.5,2.5,.6,1,1.0,'home-dark-wood',true],
   ['nightstand',1.35,.28,-.35,.4,.56,.4,'home-wood',true],['tub',2.5,.28,-2.7,1.6,.56,.75,'home-white',true],
   ['toilet',3.3,.22,-1.25,.42,.44,.6,'home-white',true],['vanity',2.4,.43,-.92,.9,.86,.45,'home-dark-wood',true],
   ['mirror',2.4,1.6,-.68,.75,.7,.03,'home-glass'],['bath-floor',2.3,.006,-1.85,2.56,.012,2.46,'home-tile'],
   ['upper-cabinets',-2.6,2.0,-hz+.17,1.7,.6,.32,'home-dark-wood'],['tv-screen',.91,1.15,.72,.05,.62,1.1,'home-screen'],
   ['pendant',-1.6,2.55,-1.0,.36,.18,.36,'home-warm'],['rug',-2.0,.012,1.3,2.0,.02,2.2,'home-rug']],
  plants:[['monstera',-3.1,-.3],['snake',3.3,1.75]],
  art:[[-hx+.03,1.75,1.3,'+x',1.1,.7],[2.35,1.9,-.53,'+z',1.0,.55],[-hx+.03,1.75,-1.0,'+x',.7,.5]],
  lights:[[-1.8,2.8,1.4],[-1.8,2.8,-1.8],[2.3,2.8,1.3],[2.3,2.8,-1.8]],
  slots:{feature:[-.5,2.75,180],workshop:[-3.28,-1.75,'bench-z'],garden:[3.25,1.6,2.5,'shelf-z'],secure:[-.9,1.6],hatch:[-.15,-.25],
   terminal:[-.35,.72],accent:[-3.2,2.85]},
  keepClear:[[doorX,hz-.6,.62,.6],[1,-1.75,.5,.5],[1,2.52,.5,.5]]}]};
 if(tier==='family'){const sx0=-hx,sx1=-3.5,base=1.9,top=-2.6;return {height:3.1,stairs:{x0:sx0,x1:sx1,zBase:base,zTop:top},floors:[{
  rooms:[{name:'Entry foyer',x0:-3.45,x1:.6,z0:-1.6,z1:hz},{name:'Study',x0:-3.45,x1:.6,z0:-hz,z1:-1.6},
   {name:'Living room',x0:.6,x1:hx,z0:-.5,z1:hz},{name:'Kitchen & dining',x0:.6,x1:hx,z0:-hz,z1:-.5}],
  walls:[['z',.6,-hz,hz,[[.3,2.9]]],['x',-1.6,-3.45,.6,[[-1.8,-.8]]],['z',-3.45,-hz,base,[]]],
  furniture:[['kitchen',2.6,-hz+.31,0],['fridge',4.1,-hz+.45,0],['dining',2.6,-1.9,0],['sofa',2.0,1.7,90],
   ['tvstand',hx-.33,1.7,-90],['armchair',2.8,3.55,180],['bookshelf',-3.05,-2.85,90]],
  boxes:[['coffee-table',3.15,.21,1.7,.6,.42,1.1,'home-wood',true],['desk',-.6,.38,-hz+.35,1.3,.76,.6,'home-wood',true],
   ['desk-lamp',-.15,.86,-hz+.3,.12,.2,.12,'home-warm'],['console',-.6,.42,hz-.2,1.0,.84,.35,'home-dark-wood',true],
   ['tv-screen',hx-.03,1.2,1.7,.05,.66,1.2,'home-screen'],['upper-cabinets',2.6,2.0,-hz+.17,1.7,.6,.32,'home-dark-wood'],
   ['pendant',2.6,2.55,-1.9,.38,.2,.38,'home-warm'],['foyer-pendant',-1.5,2.5,2.4,.42,.24,.42,'home-warm'],
   ['rug',3.0,.012,1.7,2.2,.02,2.2,'home-rug'],['runner',-2.256,.012,2.0,1.1,.02,3.4,'home-rug']],
  plants:[['monstera',4.1,3.6],['snake',-.0,3.8],['snake',-3.1,-1.95]],
  art:[[-3.38,1.7,.3,'+x',1.2,.8],[-2.6,1.7,-1.53,'+z',.8,.6],[.67,1.7,-2.4,'+x',1.0,.65]],
  lights:[[2.6,2.8,1.8],[2.6,2.8,-2.4],[-1.5,2.8,2.0],[-1.4,2.8,-2.9]],
  slots:{feature:[1.2,3.7,180],workshop:[.2,-2.7,'bench-z'],garden:[.41,1.6,3.5,'shelf-wall-w'],secure:[-3.2,1.6],hatch:[-.4,.4],
   terminal:[-.6,3.35],accent:[4.15,-.9]},
  keepClear:[[doorX,hz-.6,.62,.6],[.6,1.6,.5,1.3],[-1.3,-1.6,.5,.5],[(sx0+sx1)/2,base+.45,.55,.45]],
  arrival:{x:(sx0+sx1)/2,z:base+1.3,yaw:0}},
 {rooms:[{name:'Upstairs hall',x0:-hx,x1:.6,z0:-hz,z1:2.0},{name:'Bathroom',x0:-3.45,x1:.6,z0:2.0,z1:hz},
   {name:'Main bedroom',x0:.6,x1:hx,z0:-.3,z1:hz},{name:'Second bedroom',x0:.6,x1:hx,z0:-hz,z1:-.3}],
  walls:[['z',.6,-hz,hz,[[.4,1.3],[-1.6,-.7]]],['x',-.3,.6,hx,[]],['x',2.0,-3.45,.6,[[-1.5,-.6]]],['z',-3.45,2.0,hz,[]]],
  furniture:[['bed',2.8,.8,0,{sx:1.45}],['armchair',1.4,3.45,135],['bed',1.8,-3.0,90],['bookshelf',hx-.34,-1.6,-90],
   ['sofa',-1.6,-hz+.37,0],['bookshelf',.2,-3.15,-90]],
  boxes:[['rail-side',sx1+.03,.5,(base+top)/2+.6,.06,1.0,base-top-1.2,'home-dark-wood',true],
   ['rail-front',(sx0+sx1)/2,.5,base,sx1-sx0,1.0,.06,'home-dark-wood',true],
   ['nightstand-a',1.8,.28,0,.4,.56,.4,'home-wood',true],['nightstand-b',3.8,.28,0,.4,.56,.4,'home-wood',true],
   ['dresser',hx-.27,.5,3.2,.5,1,1.2,'home-dark-wood',true],['desk',3.9,.38,-hz+.35,1.1,.76,.6,'home-wood',true],
   ['tub',-2.0,.28,hz-.4,1.6,.56,.75,'home-white',true],['toilet',.2,.22,3.0,.42,.44,.6,'home-white',true],
   ['vanity',-3.15,.43,2.9,.45,.86,.9,'home-dark-wood',true],['bath-floor',-1.42,.006,3.05,4.0,.012,2.1,'home-tile'],
   ['rug',2.8,.012,2.4,2.4,.02,1.6,'home-rug'],['coffee-table',-1.6,.21,-2.6,1.0,.42,.5,'home-wood',true]],
  plants:[['monstera',-2.6,1.4],['snake',4.2,-.7]],
  art:[[2.8,1.85,-.23,'+z',1.2,.6],[-1.6,1.7,-hz+.03,'+z',1.1,.6]],
  lights:[[2.6,2.8,1.9],[2.6,2.8,-2.2],[-1.6,2.8,-1.2],[-1.4,2.8,3.0]],
  slots:{garden:[-2.55,1.65,0,'planters'],secure:null,hatch:null,terminal:null,feature:null,workshop:null,accent:null},
  keepClear:[[.6,.85,.5,.5],[.6,-1.15,.5,.5],[-1.05,2.0,.5,.5],[(sx0+sx1)/2,top-.4,.55,.4]],
  arrival:{x:sx1+.5,z:top-.5,yaw:0}}]};}
 // Mansion
 const sx0=-hx,sx1=-4.75,base=1.4,top=-3.6;
 return {height:3.4,stairs:{x0:sx0,x1:sx1,zBase:base,zTop:top,grand:true},floors:[{
  rooms:[{name:'Grand foyer',x0:-hx,x1:-1.2,z0:1.0,z1:hz},{name:'Library',x0:-4.75,x1:-1.2,z0:-hz,z1:1.0},
   {name:'Living room',x0:-1.2,x1:hx,z0:.2,z1:hz},{name:'Dining room',x0:-1.2,x1:2.4,z0:-hz,z1:.2},{name:'Kitchen',x0:2.4,x1:hx,z0:-hz,z1:.2}],
  walls:[['z',-1.2,-hz,hz,[[1.6,3.6],[-3.4,-2.4]]],['x',.2,-1.2,hx,[[.0,1.6]]],['z',2.4,-hz,.2,[[-2.6,-1.4]]],['x',1.0,-4.75,-1.2,[[-3.4,-2.4]]]],
  furniture:[['kitchen',4.0,-hz+.31,0],['fridge',5.6,-hz+.45,0],['dining',.6,-2.4,90],['sofa',2.4,2.8,90],['sofa',4.2,hz-.37,180],
   ['tvstand',hx-.33,2.8,-90],['armchair',4.1,1.05,0],['bookshelf',-3.95,-hz+.35,0],['bookshelf',-2.25,-hz+.35,0],
   ['armchair',-4.2,-1.0,90],['chandelier',-3.0,3.0,0,{y:2.55,solid:false}],['chandelier',.6,-2.4,0,{y:2.55,solid:false}],
   ['tvstand',.6,-hz+.33,0]],
  boxes:[['coffee-table',3.9,.21,2.8,.7,.42,1.2,'home-wood',true],['island',4.2,.46,-2.3,2.0,.92,.9,'home-dark-wood',true],
   ['island-top',4.2,.94,-2.3,2.1,.05,1.0,'home-stone'],['desk',-2.5,.38,-1.6,1.4,.76,.7,'home-wood',true],
   ['desk-lamp',-2.0,.86,-1.7,.12,.2,.12,'home-warm'],['fireplace',-1.0,.65,4.25,.24,1.3,1.4,'home-stone',true],
   ['fire-glow',-.87,.45,4.25,.02,.42,.8,'home-fire'],['console',-4.4,.42,4.85,1.0,.84,.35,'home-dark-wood',true],
   ['tv-screen',hx-.03,1.25,2.8,.05,.75,1.35,'home-screen'],['upper-cabinets',4.0,2.1,-hz+.17,1.7,.6,.32,'home-dark-wood'],
   ['rug',3.6,.012,2.8,3.0,.02,2.6,'home-rug'],['runner',-2.976,.012,3.0,1.3,.02,3.8,'home-rug'],['dining-rug',.6,.012,-2.4,2.0,.02,3.0,'home-rug']],
  plants:[['monstera',-1.75,4.55],['monstera',5.6,4.6],['snake',-1.43,-4.8],['snake',5.75,.6]],
  art:[[-1.13,1.9,.9,'+x',1.0,.7],[-1.27,1.9,4.4,'-x',1.0,.7],[-1.13,1.8,-1.4,'+x',1.1,.7],[-.6,1.9,.13,'-z',.9,.6]],
  lights:[[3.2,3.0,2.6],[.6,3.0,-2.4],[4.2,3.0,-2.6],[-3.0,3.0,2.8]],
  slots:{feature:[-.4,4.4,180],workshop:[-4.45,-2.7,'bench-z'],garden:[-1.39,1.6,-.5,'shelf-wall-w'],secure:[-4.3,1.6],hatch:[-3.0,1.75],
   terminal:[-2.5,-.95],accent:[1.6,4.6]},
  keepClear:[[doorX,hz-.6,.62,.6],[-1.2,2.6,.5,1.0],[-1.2,-2.9,.5,.5],[.8,.2,.8,.5],[2.4,-2.0,.5,.6],[-2.9,1.0,.5,.5],[(sx0+sx1)/2,base+.45,.6,.45]],
  arrival:{x:(sx0+sx1)/2,z:base+1.3,yaw:0}},
 {rooms:[{name:'Gallery & lounge',x0:-hx,x1:-1.2,z0:-hz,z1:hz},{name:'Main suite',x0:-1.2,x1:hx,z0:1.0,z1:hz},
   {name:'Guest bedroom',x0:-1.2,x1:2.6,z0:-hz,z1:1.0},{name:'Spa bathroom',x0:2.6,x1:hx,z0:-hz,z1:1.0}],
  walls:[['z',-1.2,-hz,hz,[[2.0,3.0],[-2.4,-1.4]]],['x',1.0,-1.2,hx,[[4.4,5.4]]],['z',2.6,-hz,1.0,[]]],
  furniture:[['bed',2.4,2.15,0,{sx:1.6}],['armchair',5.4,4.3,-135],['armchair',.0,4.4,135],['bed',.7,-3.9,0,{sx:1.3}],
   ['sofa',-3.0,-.4,180],['bookshelf',-3.0,-hz+.35,0],['armchair',-3.9,-2.3,90],['tvstand',5.75,2.6,-90],['armchair',-2.2,3.3,180],['armchair',-3.6,3.3,180]],
  boxes:[['rail-side',sx1+.03,.5,(base+top)/2+.6,.06,1.0,base-top-1.2,'home-dark-wood',true],
   ['rail-front',(sx0+sx1)/2,.5,base,sx1-sx0,1.0,.06,'home-dark-wood',true],
   ['nightstand-a',1.2,.28,1.4,.45,.56,.45,'home-wood',true],['nightstand-b',3.6,.28,1.4,.45,.56,.45,'home-wood',true],
   ['tub',4.35,.3,-hz+.45,1.8,.6,.85,'home-white',true],['shower',5.65,1.1,-1.0,.8,2.2,1.0,'home-glass',true],
   ['vanity',3.0,.43,-1.6,.5,.86,1.4,'home-dark-wood',true],['bath-floor',4.35,.006,-2.05,3.46,.012,6.06,'home-tile'],
   ['coffee-table',-3.0,.21,-1.5,1.1,.42,.6,'home-wood',true],['rug',2.4,.012,3.9,3.0,.02,1.6,'home-rug'],
   ['dresser',2.25,.5,-1.0,.5,1,1.2,'home-dark-wood',true],['tv-screen',6.07,1.2,2.6,.05,.66,1.2,'home-screen'],['gallery-rug',-3.0,.012,-1.2,2.6,.02,2.4,'home-rug'],['lounge-rug',-2.9,.012,3.6,2.4,.02,1.6,'home-rug']],
  plants:[['monstera',-1.75,4.6],['snake',5.7,1.35],['snake',2.2,-4.75]],
  art:[[2.4,1.9,1.07,'+z',1.4,.7],[-1.27,1.8,.2,'-x',1.2,.8],[-1.27,1.8,-3.6,'-x',1.0,.7],[.7,1.8,.93,'-z',1.0,.6]],
  lights:[[2.4,3.0,3.0],[.7,3.0,-2.2],[4.3,3.0,-2.0],[-3.0,3.0,1.5]],
  slots:{garden:[-3.2,hz-.4,0,'planters'],secure:null,hatch:null,terminal:null,feature:null,workshop:null,accent:null},
  keepClear:[[-1.2,2.5,.5,.5],[-1.2,-1.9,.5,.5],[4.9,1.0,.5,.5],[(sx0+sx1)/2,top-.4,.6,.4]],
  arrival:{x:sx1+.5,z:top-.5,yaw:0}}]};
}
const rotHalf=(w,d,ry)=>({hx:(Math.abs(Math.cos(ry))*w+Math.abs(Math.sin(ry))*d)/2,hz:(Math.abs(Math.sin(ry))*w+Math.abs(Math.cos(ry))*d)/2});
function upgradeParts(add,slot,kind,deluxe){
 if(!slot)return;
 const [x,y,z,mode]=slot;
 if(kind==='feature'){
  // Arcade cabinet with lit marquee, screen and neon floor strip (game-lounge).
  const ry=rad(slot[2]),f=(dx,dz)=>[x+dx*Math.cos(ry)+dz*Math.sin(ry),y+(-dx*Math.sin(ry)+dz*Math.cos(ry))];
  add('upgrade-arcade-cabinet',x,.85,y,.7,1.7,.7,'home-arcade',true,'box',ry);
  const [mx,mz]=f(0,.36);add('upgrade-arcade-screen',mx,1.18,mz,.52,.42,.04,'home-screen',false,'box',ry);
  add('upgrade-arcade-marquee',mx,1.6,mz,.6,.16,.05,'home-neon',false,'box',ry);
  const [sx,sz]=f(0,.62);add('upgrade-arcade-neon-floor',sx,.01,sz,.8,.02,.08,'home-neon',false,'box',ry);
 }else if(kind==='workshop'){
  // Hobby workshop: a wall tool board (small homes) or a full workbench.
  const [wx,wz,wm]=slot;
  if(wm==='front-wall'||wm==='west-wall'){
   const west=wm==='west-wall';
   add('upgrade-workshop-pegboard',wx,1.5,wz,west?.04:.8,.6,west?.8:.04,'home-pegboard');
   for(let i=0;i<3;i++)add('upgrade-workshop-tool-'+i,west?wx+.04:wx-.25+i*.25,1.45+(i%2)*.1,west?wz-.25+i*.25:wz-.04,.06,.24,.06,'home-metal');
   add('upgrade-workshop-light',wx,1.88,wz,west?.06:.7,.04,west?.7:.06,'home-warm');
  }else{
   const along=wm==='bench-z',bw=along?.6:1.2,bd=along?1.2:.6;
   add('upgrade-workshop-bench',wx,.45,wz,bw,.9,bd,'home-wood',true);
   add('upgrade-workshop-vise',wx,.97,wz-(along?.3:0),.18,.14,.18,'home-metal');
   add('upgrade-workshop-toolbox',wx+(along?0:.35),1.0,wz+(along?.3:0),.3,.16,.18,'home-red');
   add('upgrade-workshop-lamp',wx,1.25,wz,.08,.5,.08,'home-warm');
  }
 }else if(kind==='garden'){
  // Indoor garden shelf with violet grow light (grow-lounge / deluxe).
  if(mode==='planters'){
   for(let i=0;i<3;i++){add('upgrade-garden-planter-'+i,x+(i-1)*.7,.25,y,.6,.5,.4,'home-wood',true);
    add('upgrade-garden-leaves-'+i,x+(i-1)*.7,.72,y,.5,.5,.34,'home-plant',false,'sphere');}
   add('upgrade-garden-glow',x,1.6,y,2.2,.04,.08,deluxe?'home-grow':'home-warm');return;
  }
  const alongZ=mode==='shelf-z'||mode==='shelf-wall-w',n=deluxe?2:1;
  for(let s=0;s<n;s++){
   const sy=y+s*.42;
   add('upgrade-garden-shelf-'+s,x,sy,z,alongZ?.26:.9,.04,alongZ?.9:.26,'home-wood');
   for(let i=0;i<3;i++)add('upgrade-garden-plant-'+s+'-'+i,x+(alongZ?0:(i-1)*.28),sy+.14,z+(alongZ?(i-1)*.28:0),.18,.24,.18,'home-plant',false,'sphere');
   add('upgrade-garden-grow-'+s,x,sy+.36,z,alongZ?.08:.8,.03,alongZ?.8:.08,'home-grow');
  }
 }else if(kind==='secure'){
  add('upgrade-security-monitor',x,y,z,.62,.4,.04,'home-screen');
  for(let i=0;i<4;i++)add('upgrade-security-feed-'+i,x-.15+(i%2)*.3,y-.09+Math.floor(i/2)*.18,z-.025,.26,.15,.01,'home-feed');
  add('upgrade-security-keypad',x+.45,y-.3,z,.1,.16,.04,'home-neon');
 }else if(kind==='hatch'){
  add('upgrade-hatch-frame',x,.012,y,1.1,.02,1.1,'home-metal');
  add('upgrade-hatch-door',x,.024,y,.9,.02,.9,'home-steel');
  for(const s of [-1,1])add('upgrade-hatch-stripe-'+s,x+s*.5,.03,y,.06,.01,1.0,'home-hazard');
  if(deluxe)add('upgrade-vault-glow',x,.035,y,.5,.01,.5,'home-neon');
 }
}
// Returns fixed (non-owner) parts for one floor, collision obstacles and metadata.
export function createHomePlan({tier='trailer',floor=0,upgrades=[],layoutId='cozy'}={}){
 if(!HOME_FOOTPRINT[tier])tier='trailer';
 const [w,d]=HOME_FOOTPRINT[tier],hx=(w-.8)/2,hz=(d-.8)/2,{doorX,windows,floors}=exteriorOpenings(tier);
 floor=Math.max(0,Math.min(floors-1,Number.isInteger(floor)?floor:0));
 const data=planData(tier,hx,hz,doorX),F=data.floors[floor],H=data.height,installed=new Set(Array.isArray(upgrades)?upgrades:[]);
 const items=[],add=(id,x,y,z,w,h,d,mat,solid=false,shape='box',ry=0,extra)=>items.push({id,x,y,z,w,h,d,mat,solid,shape,...(ry?{ry}:{}),...(extra||{})});
 const W=2*hx,D=2*hz,floorMat=FLOOR_MAT[tier],wallMat=WALL_MAT[tier];
 // Shell: floor, ceiling, perimeter walls (bounds clipping is the outer collision).
 add('home-floor',0,-.2,0,W,.32,D,floorMat);
 add('home-ceiling',0,H+.12,0,W,.24,D,'home-ceiling');
 for(const side of [-1,1]){
  add('home-wall-x-'+side,side*hx,H/2,0,.15,H,D,wallMat);
  add('home-wall-z-'+side,0,H/2,side*hz,W,H,.15,wallMat);
  add('home-baseboard-x-'+side,side*(hx-.1),.08,0,.05,.16,D-.2,'home-trim');
  add('home-baseboard-z-'+side,0,.08,side*(hz-.1),W-.2,.16,.05,'home-trim');
  add('home-cornice-x-'+side,side*(hx-.1),H-.06,0,.07,.1,D-.2,'home-trim');
  add('home-cornice-z-'+side,0,H-.06,side*(hz-.1),W-.2,.1,.07,'home-trim');
 }
 // Windows at the exterior's positions: glowing daylight glass, mullion, deep sill.
 for(const win of windows.filter(v=>v.floor===floor)){
  const wy=Math.max(win.height/2+.75,Math.min(H-win.height/2-.25,win.y)),ww=Math.min(win.width,1.6);
  if(win.wall==='east'){
   add('window-glass-east-'+floor,hx-.085,wy,win.z,.03,win.height,ww,'home-window');
   add('window-frame-east-'+floor,hx-.1,wy,win.z,.04,win.height+.12,ww+.12,'home-trim');
   add('window-mullion-east-'+floor,hx-.11,wy,win.z,.03,win.height,.05,'home-trim');
   add('window-sill-east-'+floor,hx-.17,wy-win.height/2-.06,win.z,.18,.05,ww+.2,'home-wood');
  }else{
   const s=win.wall==='front'?1:-1,key=win.wall+'-'+(win.x>0?'e':'w')+'-'+floor;
   add('window-glass-'+key,win.x,wy,s*(hz-.085),ww,win.height,.03,'home-window');
   add('window-frame-'+key,win.x,wy,s*(hz-.1),ww+.12,win.height+.12,.04,'home-trim');
   add('window-mullion-'+key,win.x,wy,s*(hz-.11),.05,win.height,.03,'home-trim');
   add('window-sill-'+key,win.x,wy-win.height/2-.06,s*(hz-.17),ww+.2,.05,.18,'home-wood');
  }
 }
 if(floor===0){
  // Front door exactly where the exterior door is.
  add('home-exit-frame',doorX,1.12,hz-.08,1.28,2.24,.2,'home-trim');
  add('home-exit-panel',doorX,1.06,hz-.19,1.06,2.12,.08,'home-door');
  add('home-exit-handle',doorX+.38,1.05,hz-.25,.07,.2,.06,'home-brass');
  add('home-exit-mat',doorX,.012,hz-.55,1.0,.02,.6,'home-mat');
  add('home-exit-glow',doorX,2.3,hz-.12,.3,.08,.1,'home-warm');
 }
 for(const [axis,at,from,to,openings] of F.walls)wallRun(add,'partition-'+axis+'-'+at,axis,at,from,to,openings,H,wallMat);
 // Staircase (Family / Mansion): visible treads and stringers, one solid obstacle.
 const st=data.stairs;
 if(st){
  const len=st.zBase-st.zTop,steps=Math.round(len/.3),width=st.x1-st.x0,cx=(st.x0+st.x1)/2;
  if(floor===0){
   for(let i=0;i<steps;i++){
    const rise=(i+1)*H/steps,zc=st.zBase-(i+.5)*len/steps;
    add('stair-tread-'+i,cx,rise-.03,zc,width-.08,.06,len/steps+.02,st.grand?'home-floor-marble':'home-floor-oak');
    add('stair-riser-'+i,cx,rise-H/steps/2,zc+len/steps/2-.01,width-.08,H/steps,.03,'home-trim');
   }
   add('stair-stringer',st.x1-.04,H/2,(st.zBase+st.zTop)/2,.08,H,len,'home-dark-wood');
   add('stair-balustrade',st.x1-.04,1.0,(st.zBase+st.zTop)/2,.05,.06,len,'home-brass');
   add('stair-newel',st.x1-.04,.55,st.zBase-.05,.14,1.1,.14,'home-dark-wood');
   if(st.grand)add('stair-runner',cx,.02,st.zBase+.3,width-.3,.02,.5,'home-rug');
   items.push({id:'stair-volume',x:cx,y:H/2,z:(st.zBase+st.zTop)/2,w:width,h:.01,d:len,mat:'home-trim',solid:true,shape:'box',invisible:true});
  }else{
   add('stair-well-edge',st.x1-.02,.04,(st.zBase+st.zTop)/2,.06,.08,len,'home-trim');
   add('stair-well-void',cx,.005,(st.zBase+st.zTop)/2,width-.06,.01,len,'home-shadow');
   items.push({id:'stair-well-volume',x:cx,y:.5,z:(st.zBase+st.zTop)/2,w:width,h:.01,d:len,mat:'home-trim',solid:true,shape:'box',invisible:true});
  }
 }
 // Installed Tycoon upgrades that live indoors are placed first; plan furniture
 // that would collide with one (e.g. the corner plant where the arcade goes) steps aside.
 const S=F.slots,up=[],upAdd=(id,x,y,z,w,h,d,mat,solid=false,shape='box',ry=0)=>up.push({id,x,y,z,w,h,d,mat,solid,shape,...(ry?{ry}:{})});
 if((installed.has('game-lounge')||layoutId==='arcade-suite')&&S.feature)upgradeParts(upAdd,S.feature,'feature');
 if((installed.has('hobby-workshop')||layoutId==='maker-suite')&&S.workshop)upgradeParts(upAdd,S.workshop,'workshop');
 const deluxe=installed.has('grow-lounge-deluxe');
 if(installed.has('grow-lounge')||deluxe||(floor>0&&installed.has('roof-garden')))upgradeParts(upAdd,S.garden,'garden',deluxe);
 if(S.secure&&(installed.has('security-upgrade')||layoutId==='bunker-suite'))upgradeParts(upAdd,[S.secure[0],S.secure[1],hz-.09],'secure');
 const hatch=!!S.hatch&&(installed.has('hidden-hatch')||installed.has('underground-bunker'));
 if(hatch)upgradeParts(upAdd,S.hatch,'hatch',installed.has('bunker-arcade'));
 const upSolid=up.filter(p=>p.solid).map(p=>({x:p.x,z:p.z,...rotHalf(p.w,p.d,p.ry||0)}));
 const clashes=(x,z,w,d,ry)=>{const r=rotHalf(w,d,ry);return upSolid.some(o=>Math.abs(o.x-x)<o.hx+r.hx-.02&&Math.abs(o.z-z)<o.hz+r.hz-.02);};
 for(const [id,x,z,rot,opt={}] of F.furniture){
  const [mw,mh,md]=INTERIOR_MODEL_SIZE[id],sx=opt.sx||1,ry=rad(rot),y=opt.y||0;
  if(opt.solid!==false&&clashes(x,z,mw*sx,md,ry))continue;
  add('model-'+id+'-'+items.length,x,y+mh/2,z,mw*sx,mh,md,FALLBACK_MAT[id],opt.solid!==false,'box',ry,{model:{id,sx,y}});
 }
 for(const [id,x,z] of F.plants){
  const [mw,mh,md]=INTERIOR_MODEL_SIZE[id];
  if(clashes(x,z,mw*.7,md*.7,0))continue;
  add('model-'+id+'-'+items.length,x,mh/2,z,mw*.7,mh,md*.7,FALLBACK_MAT[id],true,'box',0,{model:{id,sx:1,y:0}});
 }
 for(const [id,x,y,z,w,h,d2,mat,solid] of F.boxes){
  if(solid&&clashes(x,z,w,d2,0))continue;
  const top=y+h/2,key='fixture-'+id;
  if(/table|desk/.test(id)&&solid){
   // Tables: slab top on four legs (collision keeps the full footprint).
   add(key,x,top-.03,z,w,.06,d2,mat,true);
   for(const sx of [-1,1])for(const sz of [-1,1])add(key+'-leg-'+sx+sz,x+sx*(w/2-.06),(top-.06)/2,z+sz*(d2/2-.06),.05,top-.06,.05,'home-dark-wood');
  }else if(/dresser|nightstand|console|vanity/.test(id)&&solid){
   add(key,x,y,z,w*.96,h,d2*.96,mat,true);add(key+'-top',x,top+.015,z,w,.03,d2,'home-stone');
   const front=w<d2?{ax:'x',s:Math.sign(-x)||1}:{ax:'z',s:Math.sign(-z)||1};
   for(let i=1;i<=(h>.7?3:2);i++){const yy=y-h/2+i*h/((h>.7?3:2)+1);
    if(front.ax==='z')add(key+'-drawer-'+i,x,yy,z+front.s*(d2*.48+.005),w*.8,.02,.01,'home-brass');
    else add(key+'-drawer-'+i,x+front.s*(w*.48+.005),yy,z,.01,.02,d2*.8,'home-brass');}
  }else if(id==='tv-screen'){
   add(key+'-bezel',x,y,z,w+(w<d2?0:.06),h+.06,d2+(w<d2?.06:0),'home-shadow');
   add(key,x+(w<d2?-Math.sign(x)*.012:0),y,z+(w<d2?0:-Math.sign(z)*.012),w,h,d2,mat);
  }else if(id==='upper-cabinets'){
   add(key,x,y,z,w,h,d2,mat);
   add(key+'-underlight',x,y-h/2-.01,z,w<d2?w*.6:w*.92,.015,w<d2?d2*.92:d2*.6,'home-warm');
   const n=3;for(let i=1;i<n;i++)add(key+'-seam-'+i,w<d2?x+Math.sign(-x)*(w/2+.002):x-w/2+i*w/n,y,w<d2?z-d2/2+i*d2/n:z+Math.sign(-z)*(d2/2+.002),w<d2?.004:.012,h*.92,w<d2?.012:.004,'home-shadow');
  }else add(key,x,y,z,w,h,d2,mat,!!solid);
 }
 for(const [i,[x,y,z,wall,aw=.8,ah=.6]] of (F.art||[]).entries()){
  // Framed canvases break up long plain walls.
  const along=wall[1]==='z',sg=wall[0]==='-'?-1:1;  // wall = direction the canvas faces
  add('art-frame-'+i,x,y,z,along?aw+.08:.04,ah+.08,along?.04:aw+.08,'home-dark-wood');
  add('art-canvas-'+i,x+(along?0:sg*.025),y,z+(along?sg*.025:0),along?aw:.01,ah,along?.01:aw,['home-art-a','home-art-b','home-art-c'][i%3]);
 }
 // Warm ceiling fixtures at each light (emissive, so they read even at low light budgets).
 for(const [i,[x,y,z]] of F.lights.entries()){add('ceiling-light-'+i,x,H-.06,z,.42,.06,.42,'home-warm',false,'cylinder');add('ceiling-rose-'+i,x,H-.02,z,.56,.03,.56,'home-trim',false,'cylinder');}
 items.push(...up);
 if(S.accent){
  const [ax,az]=S.accent;
  if(layoutId==='open'){add('preset-bar-cart',ax,.42,az,.5,.84,.5,'home-wood',true);add('preset-bar-glow',ax,.9,az,.36,.05,.36,'home-warm');}
  else if(layoutId==='split'){add('preset-screen',ax,.85,az,.1,1.7,.9,'home-fabric',true);}
  else {add('preset-floor-lamp',ax,.02,az,.34,.04,.34,'home-brass',true,'cylinder');add('preset-floor-lamp-pole',ax,.78,az,.035,1.5,.035,'home-brass',false,'cylinder');
   add('preset-floor-lamp-shade',ax,1.56,az,.4,.3,.4,'home-warm',false,'cylinder');}
 }
 for(const it of items){
  const id=it.id||'';if(it.kit||it.model)continue;
  if(/rug|runner/.test(id))it.kit={id:/round/.test(id)?'rug-round':'rug-rect'};
  else if(/bed-lamp|desk-lamp/.test(id))it.kit={id:'lamp-table'};
  else if(/pendant|ceiling-light/.test(id))it.kit={id:/pendant/.test(id)?'lamp-ceiling':'lamp-ceiling'};
  else if(/coffee-table/.test(id))it.kit={id:/square/.test(id)?'table-coffee-square':'table-coffee'};
  else if(/nightstand/.test(id))it.kit={id:'side-table'};
  else if(/tv-screen$/.test(id)&&!/-bezel/.test(id))it.kit={id:'tv-modern'};
 }
 const obstacles=items.filter(p=>p.solid).map(p=>{const r=rotHalf(p.w,p.d,p.ry||0);return {id:p.id,x:p.x,z:p.z,halfX:r.hx,halfZ:r.hz};});
 const interactions=[];
 if(floor===0){
  interactions.push({id:'exit',x:doorX,z:hz-.8,radius:.8,title:'Front door · step outside'});
  const tm=S.terminal;interactions.push({id:'terminal',x:tm[0],z:tm[1],radius:.6,title:'Home design tablet'});
  const hs=S.hatch;interactions.push({id:'portal',x:hs[0],z:hs[1],radius:.6,title:hatch?'Bunker hatch · private rooms':'Other private rooms'});
 }
 if(st){
  if(floor===0)interactions.push({id:'stairs-up',x:(st.x0+st.x1)/2,z:st.zBase+.55,radius:.6,title:'Stairs · go upstairs'});
  else interactions.push({id:'stairs-down',x:(st.x0+st.x1)/2,z:st.zTop-.45,radius:.55,title:'Stairs · go downstairs'});
 }
 const lights=F.lights.map(([x,y,z])=>({x,y:Math.min(y,H-.25),z,color:0xffd6a6,intensity:tier==='mansion'?3.0:2.5,distance:tier==='trailer'?7:9}));
 return {tier,floor,floors,height:H,doorX,items,obstacles,interactions,lights,rooms:F.rooms.map(r=>({...r})),
  keepClear:(F.keepClear||[]).map(([x,z,ex,ez])=>({x,z,halfX:ex,halfZ:ez})),
  spawn:floor===0?{x:doorX,z:hz-1.05,yaw:0}:{x:F.arrival.x,z:F.arrival.z,yaw:F.arrival.yaw},
  arrival:F.arrival||null,bounds:{x:hx,z:hz},windows:windows.filter(v=>v.floor===floor)};
}
