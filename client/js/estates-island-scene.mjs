import { SLOT_LAYOUT, LOT_WIDTH, LOT_DEPTH, FOOTPRINTS } from './estates-lot-geometry.mjs';
// Renderer-agnostic 3D scene manifest for the shared Estates island.
// A renderer converts descriptors to engine-specific meshes, colliders, and materials.
const DISTRICTS = [
  { id:'north-shore', label:'North Shore', x:0, z:-92 },
  { id:'east-village', label:'East Village', x:78, z:-25 },
  { id:'west-village', label:'West Village', x:-78, z:-25 },
  { id:'south-neighborhood', label:'South Neighborhood', x:0, z:72 },
  { id:'lakefront', label:'Lakefront', x:0, z:-2 },
  { id:'woodland-edge', label:'Woodland Edge', x:-6, z:108 }
];
const LOT_SIZE = Object.freeze({ width:LOT_WIDTH, depth:LOT_DEPTH });
const finite = n => typeof n === 'number' && Number.isFinite(n);
function point(x,y,z) { return Object.freeze({x,y,z}); }
function descriptor(id,kind,position,dimensions,material,extra={}) { return Object.freeze({id,kind,position,dimensions,material,...extra}); }

export function buildEstatesIslandScene({catalog,seed=20261024}={}) {
  if (!catalog || !Array.isArray(catalog.properties) || !Array.isArray(catalog.tiers)) throw new TypeError('Estate catalog with properties and tiers is required');
  if (catalog.properties.length > SLOT_LAYOUT.length) throw new RangeError('Estate catalog exceeds available island lot anchors; expand the island before adding more properties');
  if (!Number.isSafeInteger(seed)) throw new TypeError('seed must be a safe integer');
  const tierById = new Map(catalog.tiers.map(t=>[t.id,t]));
  const propertyIds=catalog.properties.map(p=>p.id);
  if (propertyIds.some(id=>typeof id!=='string'||!id.trim()) || new Set(propertyIds).size!==propertyIds.length) throw new TypeError('Estate property IDs must be non-empty and unique');
  const lots = SLOT_LAYOUT.map(([x,z],i)=>{
    const property=catalog.properties[i]??null;
    const tier=property?tierById.get(property.tier):null;
    if(property&&!tier) throw new TypeError('Estate property references unknown tier: '+property.tier);
    const district=i<4?'north-shore':i<10?'east-village':i<16?'west-village':i<19?'south-neighborhood':'lakefront';
    const footprint=tier ? FOOTPRINTS[tier.id] : null;
    return descriptor('estate-lot-'+String(i+1).padStart(2,'0'),'property-lot',point(x,0.15,z),{...LOT_SIZE,height:0.3},'lot-boundary',{
      propertyId:property?.id??null,address:property?.address??'Unassigned lot '+String(i+1).padStart(2,'0'),
      tier:tier?.id??'unassigned',buildingFootprint:footprint,district
    });
  });
  const mappedIds=lots.filter(l=>l.propertyId).map(l=>l.propertyId);
  if(mappedIds.length!==catalog.properties.length || propertyIds.some(id=>mappedIds.filter(mapped=>mapped===id).length!==1)) throw new Error('Every catalog property must map to exactly one island lot');
  const roads=[
    descriptor('road-main-north-south','road',point(0,0.08,0),{width:8,length:180,height:0.16},'asphalt',{orientation:'z'}),
    descriptor('road-main-east-west','road',point(0,0.09,8),{width:7,length:150,height:0.18},'asphalt',{orientation:'x'}),
    descriptor('road-east-loop','road',point(56,0.08,8),{width:6,length:94,height:0.16},'asphalt',{orientation:'z'}),
    descriptor('road-west-loop','road',point(-56,0.08,8),{width:6,length:94,height:0.16},'asphalt',{orientation:'z'}),
    descriptor('path-shore-north','footpath',point(0,0.12,-123),{width:3,length:112,height:0.12},'stone',{orientation:'x'}),
    descriptor('path-shore-south','footpath',point(0,0.12,111),{width:3,length:100,height:0.12},'stone',{orientation:'x'})
  ];
  const access=[
    descriptor('primary-bridge','bridge',point(0,0.4,159),{width:12,length:52,height:0.8},'weathered-concrete',{orientation:'z',connects:['city-side-entrance','island-gate'],walkable:true,vehicleAccess:true}),
    descriptor('service-bridge','bridge',point(-91,0.35,113),{width:7,length:40,height:0.7},'steel-concrete',{orientation:'z',connects:['service-road','woodland-edge'],walkable:true,vehicleAccess:false}),
    descriptor('public-dock','dock',point(75,0.2,112),{width:18,length:8,height:0.4},'timber',{walkable:true,boatsEnabled:false}),
    descriptor('island-gate','entrance-trigger',point(0,0,132),{radius:5,height:4},'interaction-volume',{prompt:'Enter Estates Island',requiresExplicitConfirmation:true,destinationId:'estates-island',returnAnchor:'estates-island-entrance'})
  ];
  const terrain=[
    descriptor('island-ground','terrain',point(0,-0.6,0),{width:280,depth:300,height:1.2},'grass',{shape:'rounded-island',walkable:true,collision:true}),
    descriptor('lake-water','water',point(0,-1.1,0),{width:460,depth:470,height:0.1},'lake-water',{continuousRing:true,shorelineInnerRadius:148,shorelineOuterRadius:234,collision:true,swimmingEnabled:false}),
    descriptor('shoreline-rocks','shoreline',point(0,0,0),{innerRadius:139,outerRadius:153,segments:96,height:1.2},'rock-and-reeds',{continuous:true,walkable:true})
  ];
  const vegetation=[];
  let state=seed>>>0;
  const random=()=>{state=(Math.imul(state,1664525)+1013904223)>>>0;return state/4294967296;};
  for(let i=0;i<42;i++){
    const angle=random()*Math.PI*2, radius=112+random()*13;
    vegetation.push(descriptor('woodland-tree-'+String(i+1).padStart(2,'0'),'tree',point(Math.cos(angle)*radius,0,Math.sin(angle)*radius),
      {width:1.5+random()*1.2,depth:1.5+random()*1.2,height:4+random()*5},random()>0.5?'pine':'deciduous',{collider:true}));
  }
  const landmarks=[
    descriptor('welcome-kiosk','landmark',point(0,0.15,101),{width:4.2,depth:2.8,height:2.8},'timber',{
      style:'kiosk',title:'Estates Welcome Kiosk',interactionRadius:8,
      message:'Welcome to Estates Island. Follow the public roads to the community plaza, market, lake overlook, and woodland trail. Property records are informational until ownership is verified.'
    }),
    descriptor('community-plaza','landmark',point(0,0.12,24),{width:15,depth:13,height:0.18},'stone',{
      style:'plaza',title:'Community Plaza',interactionRadius:9,
      message:'This is the public gathering point for Estates Island. The plaza is a social landmark; no purchase, wallet connection, or property ownership is required to visit.'
    }),
    descriptor('public-market','landmark',point(77,0.15,25),{width:7,depth:4.5,height:3.1},'timber',{
      style:'market',title:'Public Market',interactionRadius:8,
      message:'The public market is reserved as a future social and trading hub. Live listings, payments, and trades are not enabled by this landmark blockout.'
    }),
    descriptor('lake-overlook','landmark',point(75,0.18,94),{width:9,depth:6,height:0.25},'weathered-concrete',{
      style:'overlook',title:'Lake Overlook',interactionRadius:8,
      message:'Take in the lake from this public viewing deck. The water is currently non-swimmable and boats are disabled in this build.'
    }),
    descriptor('woodland-trailhead','landmark',point(-79,0.15,97),{width:2.8,depth:1.2,height:2.4},'timber',{
      style:'trailhead',title:'Woodland Trailhead',interactionRadius:8,
      message:'This trailhead marks the public woodland edge. Trees are decorative blockouts for now; gathering, crafting, and wildlife systems are not yet connected here.'
    })
  ];
  const objects=[...terrain,...roads,...access,...lots,...vegetation,...landmarks];
  const ids=objects.map(o=>o.id);
  if(new Set(ids).size!==ids.length) throw new Error('scene object IDs must be unique');
  if(lots.some(l=>Math.abs(l.position.x)>105||Math.abs(l.position.z)>112)) throw new Error('lot outside buildable island bounds');
  return Object.freeze({
    id:'estates-island',version:1,seed,coordinateSystem:'right-handed-y-up-metres',status:'renderer-adapter-required',
    topology:{islandSurroundedByContinuousLake:true,lakeRing:true,walkableShoreline:true,waterCollision:true,swimmingEnabled:false,boatsEnabled:false},
    districts:DISTRICTS,spawn:point(0,0.1,123),returnAnchor:'estates-island-entrance',
    bounds:{minX:-145,maxX:145,minZ:-155,maxZ:155},
    terrain:Object.freeze(terrain),access:Object.freeze(access),roads:Object.freeze(roads),lots:Object.freeze(lots),vegetation:Object.freeze(vegetation),landmarks:Object.freeze(landmarks),objects:Object.freeze(objects)
  });
}

export function updateEstatesEntranceProximity({adapter,playerPosition,entrancePosition={x:0,y:0,z:132},radius=7,wasPromptVisible=false}={}) {
  if(!adapter||typeof adapter.showPrompt!=='function'||typeof adapter.cancelPrompt!=='function') throw new TypeError('entry adapter is required');
  for(const [label,p] of [['playerPosition',playerPosition],['entrancePosition',entrancePosition]]) {
    if(!p||!finite(p.x)||!finite(p.y)||!finite(p.z)) throw new TypeError(label+' must contain finite x/y/z');
  }
  if(!finite(radius)||radius<=0) throw new TypeError('radius must be positive');
  const dx=playerPosition.x-entrancePosition.x,dy=playerPosition.y-entrancePosition.y,dz=playerPosition.z-entrancePosition.z;
  const near=dx*dx+dy*dy+dz*dz<=radius*radius;
  if(near&&!wasPromptVisible) adapter.showPrompt({returnTo:'estates-island-entrance'});
  if(!near&&wasPromptVisible) adapter.cancelPrompt();
  return Object.freeze({near,promptVisible:near,requiresConfirmation:true});
}
