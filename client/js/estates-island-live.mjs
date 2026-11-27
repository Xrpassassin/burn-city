// Live BURN City host integration for the public Estates Island traversal.
import { mountEstatePrestige } from './estate-prestige-ui.mjs';
import { trustedServer } from './trusted-server.mjs';   // ?citysrv= only via the shared allowlist (sends the bearer token)
import {mountEstateHomeEditor} from './estates-home-editor-ui.mjs';
import { mountEstateFreeStyle } from './estate-free-style-ui.mjs';
import { mountEstateTycoon } from './estate-tycoon-ui.mjs';
import { createEstatesSecretInteriorRenderer } from './estates-secret-interior-renderer.mjs';
import { createEstateFirstPerson } from './estate-first-person.mjs';
import { homeDoorSpots, createHomeDoorPrompt } from './estates-home-door.mjs';
import { createEstateHelicopterWorld } from './estates-helicopter-world.mjs';
import { mountEstateHangarLogbook } from './estates-hangar-ui.mjs';
import { estateUpgradeExteriorParts } from './estates-tycoon-architecture.mjs';

import { mountEstateOwnership } from './estate-ownership-ui.mjs';
import { mountEstatePurchase } from './estate-purchase-ui.mjs';
import { buildEstatesIslandScene } from './estates-island-scene.mjs';
import { createEstatesIslandRenderer } from './estates-island-renderer.mjs';
import { createEstatesIslandController } from './estates-island-controller.mjs';
import { estateWalkingGuidance } from './estates-walking-guidance.mjs';
import { estateRoadWaypoints, estateNextWaypoint } from './estates-road-waypoints.mjs';
import { planEstatesPanel } from './estates-panel-layout.mjs';
import { createEstatesWorldPrompt } from './estates-world-prompt.mjs';
import { createEstatesInteriorHud } from './estates-interior-hud.mjs';
import { searchEstateLots } from './estates-directory.mjs';

const OFFSET_X = 650;
const CITY_GATE = Object.freeze({ x: 445, y: 0.1, z: 188 });
// Enter at the island-side end of the east-west approach bridge, facing toward the estate gate.
// x=-10 sits on the bridge deck (-210..0), before the connector at x=0 / z=159..188.
export const ISLAND_SPAWN = Object.freeze({ x: -10, y: 0.1, z: 188 });
const finite = n => typeof n === 'number' && Number.isFinite(n);
// Keep keyboard and mobile diagonal speed equal to straight-line movement.
// Bound a single frame's movement so a background-tab resume cannot jump through terrain.
export function islandMoveDelta({dt,yaw,moveX,moveZ},speed){
  if (![dt,yaw,moveX,moveZ,speed].every(finite) || speed<0) return {x:0,y:0,z:0};
  if (Math.abs(moveX)>1 || Math.abs(moveZ)>1) return {x:0,y:0,z:0};
  const length=Math.hypot(moveX,moveZ);
  if (!Number.isFinite(length)) return {x:0,y:0,z:0};
  const scale=length>1?1/length:1;
  const f=moveX*scale, side=moveZ*scale, step=speed*Math.min(Math.max(dt,0),0.1);
  return {x:(-Math.sin(yaw)*f+Math.cos(yaw)*side)*step,y:0,z:(-Math.cos(yaw)*f-Math.sin(yaw)*side)*step};
}

function makePanel() {
  let panel = document.getElementById('bcEstatesLivePrompt');
  if (panel) return panel;
  const style = document.createElement('style');
  style.textContent = `
    body.bc-estates-active #tour,body.bc-estates-active #btns [data-m],body.bc-estates-active #bcMoveGamesOpen,body.bc-estates-active #bcMoveGamesWrap,body.bc-estates-active #bcMoveGamesPanel,body.bc-estates-active #vExit,body.bc-estates-active #vMenu,body.bc-estates-active #vHint{display:none!important}
    body.bc-estates-interior #bcEstatesDirectoryButton,body.bc-estates-interior #bcEstatesWalkingGuidance,body.bc-estates-interior #bcEstatesExit,body.bc-estates-interior #bcEstatePropertyHint{display:none!important}
    #bcEstatesLivePrompt{position:fixed;left:50%;bottom:calc(90px + env(safe-area-inset-bottom));transform:translateX(-50%);z-index:1200;width:min(92vw,430px);max-height:calc(100dvh - 210px);overflow:auto;box-sizing:border-box;padding:15px;border:1px solid #ffbd68aa;border-radius:14px;background:linear-gradient(145deg,#111a26f5,#080d15f5);box-shadow:0 12px 40px #0009;color:#f5e8d6;font:14px/1.45 system-ui,sans-serif;display:none}
    #bcEstatesLivePrompt h3{margin:0 0 7px;font-size:16px;color:#ffd49a;letter-spacing:.04em}
    #bcEstatesLivePrompt p{margin:0 0 12px;color:#d3dbe6}
    #bcEstatesLivePrompt .actions{display:flex;gap:8px;flex-wrap:wrap}
    #bcEstatesLivePrompt button{min-height:42px;padding:8px 13px;border:1px solid #ffb45b99;border-radius:9px;background:#392516;color:#fff1df;font:700 13px system-ui;cursor:pointer}
    #bcEstatesLivePrompt button.primary{background:#ffb45b;color:#241508;border-color:#ffe0b4}
    #bcEstatesLivePrompt .muted{opacity:.75;font-size:12px}
  `;
  document.head.appendChild(style);
  panel = document.createElement('section');
  panel.id = 'bcEstatesLivePrompt';
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-live', 'polite');
  document.body.appendChild(panel);
  return panel;
}

function addBridgeArchitecture(THREE, root) {
  const stone = new THREE.MeshStandardMaterial({ color: 0x343b42, roughness: .82 });
  const rail = new THREE.MeshStandardMaterial({ color: 0x7b8b91, metalness: .65, roughness: .38 });
  const glow = new THREE.MeshStandardMaterial({ color: 0x29dfff, emissive: 0x087eaa, emissiveIntensity: 1.6, metalness: .25, roughness: .3 });
  const addBox = (name, x, y, z, w, h, d, mat) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w,h,d), mat);
    mesh.name = name; mesh.position.set(x,y,z); root.add(mesh); return mesh;
  };
  // A real traversable-looking span connects the city-side gate to the island's north bridge.
  addBox('estates-city-bridge-deck', -105, .12, 188, 210, .34, 10, stone);
  addBox('estates-island-connector-deck', 0, .16, 173.5, 10, .34, 29, stone);
  for (const side of [-1,1]) addBox('estates-island-connector-rail-'+side, side*4.7, .72, 173.5, .28, .9, 29, rail);
  for (const side of [-1,1]) {
    addBox('estates-city-bridge-rail-'+side, -105, .72, 188+side*4.7, 210, .9, .28, rail);
    for (let x=-200; x<=-10; x+=20) {
      addBox('estates-city-bridge-light-'+side+'-'+x, x, 1.22, 188+side*4.7, .32, .12, .32, glow);
    }
  }
  // Gate frame and sign sit at the city end of the bridge.
  addBox('estates-gate-left-post', -205, 3.2, 182.8, .8, 6.4, .8, rail);
  addBox('estates-gate-right-post', -205, 3.2, 193.2, .8, 6.4, .8, rail);
  addBox('estates-gate-header', -205, 6.25, 188, .9, .8, 11.2, glow);
  addBox('estates-gate-sign', -205, 7.3, 188, .45, .8, 7.2, stone);
  root.userData.estatesBridgeMaterials = [stone,rail,glow];
}

export async function installEstatesIslandLive({
  THREE, scene, player, avatar, camera, getYaw, setYaw, getMode, setMode, buildWalker, poseWalker,
  getPitch = () => 0, setPitch = () => {}, domElement = null,
  isInteractPressed = () => false,
  cityGate = CITY_GATE,
  onStatus = () => {}
} = {}) {
  if (!THREE || !scene || !player?.pos || !avatar || !camera || typeof getYaw !== 'function' ||
      typeof getMode !== 'function' || typeof setMode !== 'function' || typeof setYaw !== 'function' ||
      typeof buildWalker !== 'function' || typeof poseWalker !== 'function') {
    throw new TypeError('Live Estates Island host dependencies are incomplete');
  }
  if (![cityGate?.x,cityGate?.z].every(finite)) throw new TypeError('Estates city entrance must have finite coordinates');
  const gate = {x:cityGate.x,y:finite(cityGate.y)?cityGate.y:CITY_GATE.y,z:cityGate.z};
  const response = await fetch('./data/estate-catalog.json', { cache: 'no-cache' });
  if (!response.ok) throw new Error('Estate catalog could not be loaded ('+response.status+')');
  const catalog = await response.json();
  const manifest = buildEstatesIslandScene({ catalog, seed: 20261024 });
  const hatchAnchors=new Map(manifest.lots.filter(l=>l.propertyId&&l.buildingFootprint).map(l=>[
    l.propertyId,estateUpgradeExteriorParts(l,['hidden-hatch']).find(part=>part.name==='hidden-hatch-hatch')
  ]));
  // Resolve property deep links against the same manifest that builds the 3D lots.
  // Never trust query-supplied coordinates or property metadata.
  const requestedPropertyId = new URLSearchParams(location.search).get('estateProperty');
  const requestedLot = requestedPropertyId ? manifest.lots.find(l => l.propertyId === requestedPropertyId) : null;
  let targetLot=requestedLot;

  const renderer = createEstatesIslandRenderer({ THREE, scene, manifest });
  const root = renderer.root;
  const secretInterior=createEstatesSecretInteriorRenderer({THREE,scene});
  // Walk-in interiors are first person (t448u): eye-height camera, body hidden via player.fp,
  // centre reticle aims at doors / stairs / the design tablet. The previous view is restored on exit.
  const firstPerson=createEstateFirstPerson({THREE,camera,avatar,domElement,getYaw,setYaw:y=>setYaw(y),getPitch,setPitch});
  let fpPrevious=false,fpPrevPitch=0;
  // Walk-in homes: front doors on every catalogued lot (Ember Bar style E/tap prompt).
  const doorSpots=homeDoorSpots(manifest.lots),doorPrompt=createHomeDoorPrompt();
  const worldPrompt=createEstatesWorldPrompt();
  const interiorHud=createEstatesInteriorHud();
  const projectDoor=(x,y,z)=>{const v=new THREE.Vector3(x,y,z).project(camera);return v;};
  function doorWorld(property){
    const lot=manifest.lots.find(l=>l.id===property?.lotId||l.propertyId===property?.propertyId);
    const spot=doorSpots.find(s=>s.propertyId===(property?.propertyId||lot?.propertyId));
    if(spot)return {x:OFFSET_X+spot.x,y:1.45,z:spot.z};
    if(!lot?.buildingFootprint)return null;
    const f=lot.buildingFootprint,W=f.width-.6,D=f.depth-.6,doorX=lot.tier==='apartment'?0:-W*.24;
    return {x:OFFSET_X+lot.position.x+doorX,y:1.45,z:lot.position.z+D/2+.75};
  }
  function tickWorldPrompt(){
    if(secretSession||!active){if(worldPrompt.visible)worldPrompt.tick({project:()=>({x:2,y:2,z:2})});return;}
    if(camera&&window.innerHeight){
      const aspect=window.innerWidth/Math.max(1,window.innerHeight);
      if(Math.abs((camera.aspect||0)-aspect)>.001){camera.aspect=aspect;camera.updateProjectionMatrix();}
      camera.updateMatrixWorld?.(true);
    }
    worldPrompt.tick({project:projectDoor,width:window.innerWidth,height:window.innerHeight,player:player.pos,camera});
  }
  function tickHouseNight(){
    const tod=document.getElementById('tod');
    const day=tod?Number(tod.value):0;
    renderer.setNight?.(Number.isFinite(day)?day<.42:true);
  }

  let ownershipKnown=false,ownedPropertyIds=new Set();
  const fade=document.createElement('div');
  fade.style.cssText='position:fixed;inset:0;background:#0b0907;opacity:0;pointer-events:none;transition:opacity .45s ease;z-index:1090';
  document.body.appendChild(fade);
  const fadeHold=()=>{fade.style.transition='none';fade.style.opacity='1';};
  const fadeIn=()=>{fadeHold();requestAnimationFrame(()=>requestAnimationFrame(()=>{fade.style.transition='opacity .6s ease';fade.style.opacity='0';}));};
  const helicopters=createEstateHelicopterWorld({THREE,parent:root,lots:manifest.lots});
  renderer.upgradeModels?.then(m=>{if(!disposed)helicopters.setModels?.(m);});
  root.position.x = OFFSET_X;
  root.visible = false; // Do not expose the full island inside the city proxy.
  addBridgeArchitecture(THREE, root);
  // Low-cost property locator: one emissive marker and a pulsing ring, attached
  // to the authoritative lot position in island-local coordinates.
  let selectedLotBeacon=null;
  {
    const beacon=new THREE.Group();
    beacon.name='estates-selected-property-beacon';
    beacon.position.set(targetLot?.position.x??0,0.4,targetLot?.position.z??0);
    const material=new THREE.MeshBasicMaterial({color:0xffc266,transparent:true,opacity:.9,depthWrite:false});
    const ringMaterial=new THREE.MeshBasicMaterial({color:0xffdf9a,transparent:true,opacity:.6,depthWrite:false,side:THREE.DoubleSide});
    const stem=new THREE.Mesh(new THREE.CylinderGeometry(.14,.14,9,8),material);
    stem.position.y=4.5;beacon.add(stem);
    const cap=new THREE.Mesh(new THREE.OctahedronGeometry(1.15,0),material);
    cap.position.y=9.7;beacon.add(cap);
    const ring=new THREE.Mesh(new THREE.RingGeometry(2.1,2.45,32),ringMaterial);
    ring.rotation.x=-Math.PI/2;ring.position.y=.15;beacon.add(ring);
    beacon.visible=false;
    root.add(beacon);
    selectedLotBeacon={group:beacon,ring,materials:[material,ringMaterial],geometries:[stem.geometry,cap.geometry,ring.geometry]};
  }

  // A distant, inexpensive city silhouette gives the separate island a horizon.
  const skyline=new THREE.Group();skyline.name='estates-city-horizon';root.add(skyline);
  const towerMaterial=new THREE.MeshStandardMaterial({color:0x334a58,roughness:.8});
  const lightMaterial=new THREE.MeshBasicMaterial({color:0xffa344});
  for(let i=0;i<15;i++){
    const h=18+(i*37%47),z=-175+i*25;
    const tower=new THREE.Mesh(new THREE.BoxGeometry(14+(i%3)*3,h,15),towerMaterial);tower.position.set(-335,h/2,z);skyline.add(tower);
    if(i%3===0){const crown=new THREE.Mesh(new THREE.BoxGeometry(9,.7,10),lightMaterial);crown.position.set(-335,h+.4,z);skyline.add(crown);}
  }
  const cityTower=new THREE.Mesh(new THREE.BoxGeometry(24,90,24),towerMaterial);cityTower.position.set(-330,45,0);skyline.add(cityTower);
  const cityBeacon=new THREE.Mesh(new THREE.BoxGeometry(20,2,20),lightMaterial);cityBeacon.position.set(-330,91,0);skyline.add(cityBeacon);

  let active = false, nearCityGate = false, lastE = false, lastProperty = null, lastLandmarkId = null, disposed = false;
  const panel = makePanel();
  const exitButton=document.createElement('button');exitButton.id='bcEstatesExit';exitButton.type='button';exitButton.textContent='↩ Return to BURN City';
  exitButton.setAttribute('aria-label','Return to BURN City');
  exitButton.style.cssText='display:none;position:fixed;left:50%;top:calc(116px + env(safe-area-inset-top));transform:translateX(-50%);z-index:90;min-height:44px;padding:8px 14px;border:1px solid #ffb45b;border-radius:9px;background:#17151af0;color:#ffe4bd;font:700 13px system-ui;cursor:pointer';
  document.body.appendChild(exitButton);exitButton.addEventListener('click',()=>flightSession?endHelicopterFlight(true):secretSession?leaveSecretInterior():leaveIsland());
  let directoryOpen=false;
  const positionPanel = () => {
    if(homeEditorActive&&window.innerWidth<=700){
      // Full-width, scrollable mobile design tray. Walking/gamepad controls
      // are paused while editing; the larger tap targets must not be squeezed
      // into the compact property inspection popup.
      panel.style.left='8px';panel.style.top='calc(8px + env(safe-area-inset-top))';
      panel.style.bottom='auto';panel.style.transform='none';
      panel.style.width='calc(100vw - 16px)';
      panel.style.maxHeight='calc(100dvh - 24px - env(safe-area-inset-top) - env(safe-area-inset-bottom))';
      panel.style.overflowY='auto';panel.style.zIndex='1250';panel.style.display='block';
      return;
    }
    const reserved=[];
    // Reserve visible movement, interaction, and wallet controls where detectable.
    for(const selector of ['#bcEstatesExit','#bcEstatesWalkingGuidance','#bcEstatePropertyHint',
      '#bcEstatesDirectoryButton','#joy','#tbtns','#gearBar','#joystick','#mobileJoystick','.nipple','.nipple-container',
      '[data-mobile-controls]','[data-wallet-modal]','[role="dialog"][aria-modal="true"]']) {
      for(const element of document.querySelectorAll(selector)){
        if(element===panel||panel.contains(element)||element.style.display==='none')continue;
        const bounds=element.getBoundingClientRect();
        if(bounds.width>0&&bounds.height>0)reserved.push({x:bounds.x,y:bounds.y,width:bounds.width,height:bounds.height});
      }
    }
    if(exitButton.style.display!=='none') {
      const bounds=exitButton.getBoundingClientRect();
      reserved.push({x:bounds.x,y:bounds.y,width:bounds.width,height:bounds.height});
    }
    const placement=planEstatesPanel({width:window.innerWidth,height:window.innerHeight,blocked:reserved});
    if(placement.panel) {
      panel.style.left=placement.panel.x+'px';
      panel.style.top=placement.panel.y+'px';
      panel.style.bottom='auto';
      panel.style.transform='none';
      panel.style.width=placement.panel.width+'px';
      panel.style.maxHeight=placement.panel.height+'px';
      panel.style.display='block';
    } else panel.style.display='none';
  };
  let homeEditorActive=false;
  const showPanel = (heading, message, actions, muted='') => {
    renderer.clearUpgradePreview();
    restoreAppearance();
    panel.replaceChildren();
    const h = document.createElement('h3'); h.textContent = heading; panel.appendChild(h);
    const p = document.createElement('p'); p.textContent = message; panel.appendChild(p);
    if (muted) { const small=document.createElement('p'); small.className='muted'; small.textContent=muted; panel.appendChild(small); }
    const row = document.createElement('div'); row.className='actions';
    for (const action of actions) {
      const b=document.createElement('button'); b.textContent=action.label;
      if(action.primary)b.className='primary';
      b.addEventListener('click',action.run); row.appendChild(b);
    }
    panel.appendChild(row);
    positionPanel();
  };
  let directoryCleanup=null;
  const hidePanel = () => {
    if(homeEditorActive){
      homeEditorActive=false;
      if(secretSession?.roomId==='home'&&secretSession.homeState)secretInterior.setRoom('home',homeRoomOptions(secretSession));
    }
    renderer.clearUpgradePreview();directoryCleanup?.();directoryCleanup=null;directoryOpen=false;
    panel.style.zIndex='';panel.style.overflowY='';
    restoreAppearance(); panel.style.display='none'; panel.replaceChildren();
  };
  // A single shared panel hosts the directory and inspection; no stacked overlays.
  const directoryButton=document.createElement('button');
  directoryButton.type='button';
  directoryButton.id='bcEstatesDirectoryButton';
  directoryButton.textContent='⌂ Browse Estates';
  directoryButton.style.cssText='display:none;position:fixed;right:12px;top:calc(72px + env(safe-area-inset-top));z-index:95;min-height:44px;padding:9px 14px;border:1px solid #ffb45b;border-radius:10px;background:#17151af0;color:#ffe4bd;font:700 13px system-ui;cursor:pointer';
  document.body.appendChild(directoryButton);
  function openDirectory(query='',filter='mapped') {
    if(!active)return;directoryCleanup?.();directoryCleanup=null;
    directoryOpen=true;
    showPanel('ESTATES DIRECTORY','Search properties and select a lot to navigate there. Inspect homes and purchase options when nearby.',
      [{label:'Close directory',run:()=>{directoryOpen=false;hidePanel();}}]);
    const search=document.createElement('input');
    search.type='search';search.placeholder='Search address, district, or tier';
    search.value=query;search.setAttribute('aria-label','Search Estates');
    search.style.cssText='width:100%;box-sizing:border-box;min-height:44px;margin:8px 0;padding:8px;border-radius:8px;border:1px solid #ffb45b;background:#121b27;color:white';
    const select=document.createElement('select');
    select.setAttribute('aria-label','Filter properties');
    select.style.cssText=search.style.cssText;
    for(const [value,label] of [['mapped','Catalog homes'],['mine','My properties'],['all','All lots'],['unassigned','Unassigned lots']]){
      const option=document.createElement('option');option.value=value;option.textContent=label;select.appendChild(option);
    }
    select.value=filter;
    const results=document.createElement('div');results.style.cssText='display:grid;gap:8px;max-height:40dvh;overflow:auto';
    const status=document.createElement('p');status.setAttribute('role','status');status.setAttribute('aria-live','polite');
    const getToken=()=>{try{return localStorage.getItem('bcToken')||'';}catch{return '';}};
    let renderId=0,session=getToken(),mineCache=null,loading=null,closed=false;
    async function ownedIds(auth){
      if(mineCache?.auth===auth)return mineCache.ids;
      if(loading?.auth===auth)return loading.promise;
      const promise=(async()=>{const r=await fetch(apiBase+'/api/estates',{headers:{authorization:'Bearer '+auth},cache:'no-store',credentials:'omit',signal:AbortSignal.timeout(8000)});
        if(!r.ok)throw Error(r.status===401?'Sign in again with Xaman in BURN City.':'Could not load your properties. Select this filter again to retry.');
        const s=await r.json();if(!Array.isArray(s.owned))throw Error('Could not verify your properties.');
        const ids=s.owned.map(p=>p.propertyId).filter(id=>typeof id==='string');if(!closed&&getToken()===auth)mineCache={auth,ids};return ids;
      })();
      loading={auth,promise};try{return await promise;}finally{if(loading?.promise===promise)loading=null;}
    }
    const render=async()=>{
      const sequence=++renderId;results.replaceChildren();status.textContent='';let ids=[];
      if(select.value==='mine'){
        const auth=getToken();if(!auth){status.textContent='Sign in with Xaman in BURN City to view My properties.';return;}
        status.textContent='Loading your verified properties…';
        try{ids=await ownedIds(auth);}catch(e){if(!closed&&sequence===renderId&&getToken()===auth)status.textContent=e.message==='Sign in again with Xaman in BURN City.'?e.message:'Could not load your properties. Select this filter again to retry.';return;}
        if(closed||sequence!==renderId||!directoryOpen||!panel.contains(results))return;
        if(getToken()!==auth){mineCache=null;void render();return;}
        status.textContent=ids.length?'Select a home to teleport to its public entrance.':'No verified properties in this wallet yet.';
      }
      const matches=searchEstateLots(manifest.lots,search.value,select.value,ids);
      for(const lot of matches){
        const button=document.createElement('button');button.type='button';
        button.style.cssText='text-align:left;min-height:44px;width:100%;padding:10px;border:1px solid #ffb45b77;border-radius:9px;background:#28303c;color:#fff1df;cursor:pointer';
        button.textContent=lot.address+' · '+lot.district+' · '+lot.tier;
        button.addEventListener('click',()=>{
          if(select.value==='mine'){void teleportToProperty(lot.propertyId);return;}
          directoryOpen=false;
          const destination=manifest.lots.find(item=>item.id===lot.id);
          if(!destination)return;
          targetLot=destination;
          selectedLotBeacon.group.position.set(destination.position.x,.4,destination.position.z);
          selectedLotBeacon.group.visible=active;
          hidePanel();
          onStatus({state:'estate-navigation-target',lotId:destination.id,propertyId:destination.propertyId??null});
        });
        results.appendChild(button);
      }
      if(!matches.length){const empty=document.createElement('p');empty.textContent='No matching lots.';results.appendChild(empty);}
    };
    const walletChanged=()=>{const next=getToken();if(next!==session){session=next;mineCache=null;void render();}};
    const storageChanged=e=>{if(e.key==='bcToken'||e.key===null)walletChanged();};
    const tokenTimer=setInterval(walletChanged,500);
    window.addEventListener('storage',storageChanged);window.addEventListener('focus',walletChanged);
    directoryCleanup=()=>{closed=true;renderId++;mineCache=null;clearInterval(tokenTimer);window.removeEventListener('storage',storageChanged);window.removeEventListener('focus',walletChanged);};
    search.addEventListener('input',()=>void render());select.addEventListener('change',()=>void render());
    panel.insertBefore(search,panel.querySelector('.actions'));
    panel.insertBefore(select,panel.querySelector('.actions'));
    panel.insertBefore(status,panel.querySelector('.actions'));
    panel.insertBefore(results,panel.querySelector('.actions'));
    void render();
  }
  directoryButton.addEventListener('click',()=>directoryOpen?(directoryOpen=false,hidePanel()):openDirectory());
  const showLotInspection = property => {
    const catalogued=Boolean(property.propertyId);
    const home=catalog.properties.find(p=>p.id===property.propertyId),tier=catalog.tiers.find(t=>t.id===home?.tier);
    showPanel(property.address,
      tier?tier.label+' · '+tier.price+' XRP · '+tier.shareUnits+' reward share units. Explore the finishes and see how this home can grow.':'This plot is reserved for a future home.',
      [{label:'Navigate to property',primary:true,run:()=>{const lot=manifest.lots.find(l=>l.id===property.lotId);if(lot){targetLot=lot;if(selectedLotBeacon){selectedLotBeacon.group.position.set(lot.position.x,.4,lot.position.z);selectedLotBeacon.group.visible=active;}if(guidanceHud)guidanceHud.style.display='block';hidePanel();}}},
       showHomeAllowed(property.propertyId)?{label:'Tour this show home',primary:true,run:()=>void enterSecretRoom(property.propertyId,'home',{tour:true})}:
        {label:'Enter home · owner or invited guest',primary:true,run:()=>void enterSecretRoom(property.propertyId,'home')},
       {label:'Explore other private rooms',run:()=>void openSecretRoomMenu(property.propertyId)},
       {label:'Board estate helicopter',run:()=>void boardEstateHelicopter(property.propertyId)},
       {label:'Hangar logbook & customization',run:()=>showEstateHangar(property.propertyId)},
       {label:'Close',run:hidePanel}],
      'Public paths and shoreline are open to everyone. Private homes are for their owners and invited guests. Sign in with Xaman to check purchase availability. Borders: yellow = unowned; blue = purchased.');
    if(catalogued){
      const ownershipOptions={api:apiBase,onOwnership:properties=>renderer.setOwnership(properties)};
      let ownershipDetails=mountEstateOwnership(panel,property.propertyId,ownershipOptions);
      let finishes;
      mountEstatePurchase(panel,property.propertyId,{api:apiBase,onAuthenticated:()=>{void refreshOwnership(true);ownershipDetails.dispose();ownershipDetails.section.remove();ownershipDetails=mountEstateOwnership(panel,property.propertyId,ownershipOptions);},onSettled:()=>{void refreshAppearance(true);void refreshFreeStyles(true);void refreshOwnership(true);void finishes?.refresh();ownershipDetails.dispose();ownershipDetails.section.remove();ownershipDetails=mountEstateOwnership(panel,property.propertyId,ownershipOptions);}});
      mountEstateFreeStyle(panel,property.propertyId,{api:apiBase,
        initialStyle:verifiedFreeStyles.find(x=>x.propertyId===property.propertyId),
        onPreview:style=>previewFreeStyle(property.propertyId,style),
        onSaved:(propertyId,style)=>{verifiedFreeStyles=[...verifiedFreeStyles.filter(p=>p.propertyId!==propertyId),{propertyId,...style}];applyAppearance();void refreshFreeStyles(true);}
      });
      finishes=mountEstatePrestige(panel,property.propertyId,{api:apiBase,onPreview:level=>previewAppearance(property.propertyId,level),onConfirmed:()=>refreshAppearance(true)});
      mountEstateTycoon(panel,property.propertyId,{api:apiBase,
        onConfirmed:()=>{renderer.clearUpgradePreview();void refreshTycoon(true);},
        onPreview:itemId=>renderer.previewUpgrade(property.propertyId,itemId)});
    }
  };
  const showLotPrompt = property => {
    if(directoryOpen)return;
    if(property.confirmedInteraction){showLotInspection(property);return;}
    const world=doorWorld(property);if(!world)return;
    const tour=showHomeAllowed(property.propertyId);
    worldPrompt.set({
      ...world,title:property.address||'',kicker:showHomeAllowed(property.propertyId)?'For Sale':'',nearDistance:4,farDistance:11,
      actions:[
        {label:'Enter',icon:'⌂',primary:true,run:()=>void (tour?enterSecretRoom(property.propertyId,'home',{tour:true}):enterSecretRoom(property.propertyId,'home'))},
        {label:'Edit',icon:'✎',run:()=>showLotInspection(property)}
      ]
    });
    tickWorldPrompt();
  };
  const showLandmarkDetails = landmark => {
    showPanel(landmark.title,landmark.message,
      [{label:'Back to exploring',primary:true,run:hidePanel}],
      'Public landmark · informational interaction only · no ownership or transaction is implied.');
  };
  const showLandmarkPrompt = landmark => {
    showPanel(landmark.title,landmark.message,
      [{label:'Explore landmark',primary:true,run:()=>showLandmarkDetails(landmark)},
       {label:'Close',run:hidePanel}],
      'Press E to read this landmark, or use the button.');
  };
  const updateLandmarkInteraction = (edge,propertyNearby=false) => {
    if(directoryOpen)return;
    if(propertyNearby) { lastLandmarkId=null; return; }
    const x=player.pos.x-OFFSET_X,z=player.pos.z;
    let nearest=null,nearestDistance=Infinity;
    for(const landmark of manifest.landmarks??[]) {
      const distance=Math.hypot(x-landmark.position.x,z-landmark.position.z);
      if(distance<=landmark.interactionRadius&&distance<nearestDistance) {nearest=landmark;nearestDistance=distance;}
    }
    if(!nearest) {
      if(lastLandmarkId!==null) {lastLandmarkId=null;if(!directoryOpen)hidePanel();}
      return;
    }
    if(edge) {lastLandmarkId=nearest.id;showLandmarkDetails(nearest);return;}
    if(lastLandmarkId!==nearest.id) {lastLandmarkId=nearest.id;showLandmarkPrompt(nearest);}
  };
  const cityDistance = () => Math.hypot(player.pos.x-gate.x,player.pos.z-gate.z);
  const localActor = {
    get position() {
      return { x:player.pos.x-OFFSET_X, y:player.pos.y, z:player.pos.z,
        set(x,y,z){player.pos.set(x+OFFSET_X,y,z);} };
    }
  };
  const localCamera = {
    get position() {
      return { x:camera.position.x-OFFSET_X, y:camera.position.y, z:camera.position.z,
        set(x,y,z){camera.position.set(x+OFFSET_X,y,z);} };
    },
    lookAt(x,y,z){camera.lookAt(x+OFFSET_X,y,z);}
  };
  let runSpeed = 4.5;
  const controller = createEstatesIslandController({
    manifest, actor:localActor, camera:localCamera,
    input:({dt,yaw,moveX,moveZ}) => {
      return {delta:islandMoveDelta({dt,yaw,moveX,moveZ},runSpeed)};
    },
    cameraLookAt:target=>camera.lookAt(target.x+OFFSET_X,target.y,target.z),
    cameraDistance:7,cameraHeight:2.6,lookHeight:1.25,
    onPropertyPrompt:property=>{lastProperty=property;lastLandmarkId=null;showLotPrompt(property);},
    onPropertyPromptClear:()=>{lastProperty=null;lastLandmarkId=null;worldPrompt.hide();if(!directoryOpen)hidePanel();},
    onExitPrompt:event=>{
      if(!active)return;
      if(event.confirmedInteraction){leaveIsland();return;}
      if(event.visible) showPanel('RETURN TO BURN CITY','You are at the city-side bridge gate. Return to the public city without losing your location.',
        [{label:'Return to city',primary:true,run:leaveIsland},{label:'Stay on island',run:hidePanel}],
        'Press E while this prompt is visible, or use the button.');
      else hidePanel();
    }
  });

  let returnPosition = null, returnCamera = null, entering = false, leaseToken = null, heartbeatTimer = null;
  let presenceSocket=null, presenceTimer=null, reconnectTimer=null, presenceStopped=true,islandInstanceId=null;
  const remotePeers=new Map();
  const hiddenCityObjects=new Map();
  function hideCityScene(){
    for(const object of scene.children){
      if(object===root||object===secretInterior.root||object===avatar||object===camera||object.isLight||object.isCamera||object.userData?.estatesKeep)continue;
      if(!hiddenCityObjects.has(object))hiddenCityObjects.set(object,object.visible);
      object.visible=false;
    }
  }
  function restoreCityScene(){for(const [object,visible] of hiddenCityObjects)if(object.parent===scene)object.visible=visible;hiddenCityObjects.clear();}
  const apiBase = trustedServer(new URLSearchParams(location.search).get('citysrv'),
    /localhost|127\.0\.0\.1|fly\.dev$/.test(location.hostname) ? location.origin : 'https://burn-city-game.fly.dev');
  let verifiedAppearances=[],previewProperty=null,previewLevel=null,lastAppearanceFetch=0,appearanceFetching=false;
  let verifiedFreeStyles=[],stylePreviewProperty=null,stylePreview=null,lastFreeStyleFetch=0,freeStyleFetching=false;
  let lastOwnershipFetch=0,ownershipFetching=false,ownershipRefreshQueued=false;
  let lastTycoonFetch=0,tycoonFetching=false,verifiedTycoonProperties=[];
  async function refreshTycoon(force=false){
    if(disposed||tycoonFetching||(!force&&Date.now()-lastTycoonFetch<30000))return;
    tycoonFetching=true;lastTycoonFetch=Date.now();
    try{const r=await fetch(apiBase+'/api/estates/tycoon/world',{cache:'no-store',signal:AbortSignal.timeout(8000)});
      if(!r.ok)return;const s=await r.json();
      if(!disposed&&Array.isArray(s.properties)){verifiedTycoonProperties=s.properties;renderer.setUpgrades(s.properties);if(!flightSession){helicopters.setVerified(s.properties);for(const style of s.helicopterStyles||[])helicopters.setStyle(style.propertyId,style);}}
    }catch{}finally{tycoonFetching=false;}
  }
  async function refreshOwnership(force=false){
    if(disposed)return;if(ownershipFetching){if(force)ownershipRefreshQueued=true;return;}if(!force&&Date.now()-lastOwnershipFetch<30000)return;
    ownershipFetching=true;lastOwnershipFetch=Date.now();
    try{const r=await fetch(apiBase+'/api/estates/ownership',{cache:'no-store',signal:AbortSignal.timeout(8000)});if(!r.ok)return;const s=await r.json();if(!disposed&&Array.isArray(s.properties)){renderer.setOwnership(s.properties);ownershipKnown=true;ownedPropertyIds=new Set(s.properties.filter(p=>typeof p?.propertyId==='string'&&/^r[1-9A-HJ-NP-Za-km-z]{24,34}$/.test(p.owner||'')).map(p=>p.propertyId));}}catch{}finally{ownershipFetching=false;if(ownershipRefreshQueued&&!disposed){ownershipRefreshQueued=false;void refreshOwnership(true);}}
  }
  function islandControls(inside){
    document.body.classList.toggle('bc-estates-active',inside);
    if(inside){
      document.querySelector('#bcMoveGamesPanel')?.classList.remove('on');
      document.querySelector('#bcMoveGamesOpen')?.setAttribute('aria-expanded','false');
      document.querySelector('#vMenu')?.classList.remove('on');
      document.querySelector('#vHint')?.classList.remove('on');
    }
  }
  // Compose two independent cosmetic systems: paid prestige levels and free
  // property styles. Local previews never change server-verified ownership.
  function applyAppearance(){
    const byId=new Map();
    for(const p of verifiedAppearances)if(typeof p?.propertyId==='string')byId.set(p.propertyId,{...p});
    for(const p of verifiedFreeStyles)if(typeof p?.propertyId==='string')byId.set(p.propertyId,{...(byId.get(p.propertyId)||{}),...p});
    if(previewProperty!==null)byId.set(previewProperty,{...(byId.get(previewProperty)||{}),propertyId:previewProperty,level:previewLevel});
    if(stylePreviewProperty!==null&&stylePreview)byId.set(stylePreviewProperty,{...(byId.get(stylePreviewProperty)||{}),propertyId:stylePreviewProperty,...stylePreview});
    renderer.setAppearance([...byId.values()]);
  }
  function restoreAppearance(){previewProperty=null;previewLevel=null;stylePreviewProperty=null;stylePreview=null;applyAppearance();}
  function previewAppearance(propertyId,level){
    previewProperty=level===null?null:propertyId;previewLevel=level;
    applyAppearance();
  }
  function previewFreeStyle(propertyId,style){
    stylePreviewProperty=style?propertyId:null;stylePreview=style;
    applyAppearance();
  }
  async function refreshFreeStyles(force=false){
    if(disposed||freeStyleFetching||(!force&&Date.now()-lastFreeStyleFetch<30000))return;
    freeStyleFetching=true;lastFreeStyleFetch=Date.now();
    try{
      const response=await fetch(apiBase+'/api/estates/free-styles',{cache:'no-store',signal:AbortSignal.timeout(8000)});
      if(!response.ok)return;const data=await response.json();
      if(disposed||!Array.isArray(data.properties))return;
      verifiedFreeStyles=data.properties;applyAppearance();
    }catch{}finally{freeStyleFetching=false;}
  }
  async function refreshAppearance(force=false){
    if(disposed||appearanceFetching||(!force&&Date.now()-lastAppearanceFetch<30000))return;
    appearanceFetching=true;lastAppearanceFetch=Date.now();
    try{
      const response=await fetch(apiBase+'/api/estates/appearance',{cache:'no-store',signal:AbortSignal.timeout(8000)});
      if(!response.ok)return;const result=await response.json();
      if(disposed||!Array.isArray(result.properties))return;
      verifiedAppearances=result.properties;
      applyAppearance();
    }catch{}finally{appearanceFetching=false;}
  }

  function showEstateHangar(propertyId){
    if(!active||disposed||secretSession||flightSession)return;
    showPanel('PRIVATE ESTATE HANGAR','Review recorded flights, choose an aircraft appearance, and see your sightseeing milestones.',
      [{label:'Return to property',run:hidePanel}],
      'Private owner logbook · local/client-reported flight visits · no rewards.');
    mountEstateHangarLogbook(panel,propertyId,{api:apiBase,onStyle:(id,style)=>helicopters.setStyle(id,style)});
    positionPanel();
  }
  async function hangarRequest(action,propertyId,data){
    const token=currentWalletToken();
    if(!token)throw Error('Connect your owning wallet to record this flight.');
    const response=await fetch(apiBase+'/api/estates/tycoon/hangar'+action,{
      method:data?'POST':'GET',cache:'no-store',headers:{authorization:'Bearer '+token,'content-type':'application/json'},
      ...(data?{body:JSON.stringify({propertyId,...data})}:{}),signal:AbortSignal.timeout(9000)});
    const result=await response.json();
    if(!response.ok||result.ok!==true)throw Error(result.error||'hangar_unavailable');
    return result;
  }
  // Local third-person helicopter flight. An ownership-verified purchase enables a
  // helipad, but client aviation coordinates are never transmitted to public presence.
  let flightSession=null,flightPending=false,flightRecheckBusy=false,lastHelipadId=null;
  const pilotHeld={up:false,down:false},flightHud=document.createElement('aside');
  flightHud.id='bcEstatesHelicopterFlight';
  flightHud.style.cssText='display:none;position:fixed;right:10px;bottom:calc(145px + env(safe-area-inset-bottom));z-index:1200;max-width:min(290px,90vw);padding:10px 12px;border-radius:12px;border:1px solid #5ed9ff99;background:#101925f0;color:#f4e8d6;font:12px/1.5 system-ui';
  const flightStatus=document.createElement('div');
  flightStatus.setAttribute('role','status');flightStatus.style.cssText='white-space:pre-line;margin-bottom:8px;font-weight:700';
  const flightRow=document.createElement('div');flightRow.style.cssText='display:flex;gap:7px;flex-wrap:wrap';
  function flightButton(label,holdKey){
    const b=document.createElement('button');b.type='button';b.textContent=label;
    b.style.cssText='touch-action:none;user-select:none;padding:8px 11px;min-height:46px;border:1px solid #77b4c9;border-radius:7px;background:#183d50;color:white;font-weight:700';
    if(holdKey){
      const down=e=>{e.preventDefault();pilotHeld[holdKey]=true;b.setPointerCapture?.(e.pointerId);};
      const up=e=>{e.preventDefault();pilotHeld[holdKey]=false;};
      b.addEventListener('pointerdown',down);b.addEventListener('pointerup',up);
      b.addEventListener('pointercancel',up);b.addEventListener('lostpointercapture',()=>{pilotHeld[holdKey]=false;});
      b.addEventListener('blur',()=>{pilotHeld[holdKey]=false;});
    }
    flightRow.appendChild(b);return b;
  }
  flightButton('▲ Ascend','up');flightButton('▼ Descend','down');
  const landFlightButton=flightButton('Land at pad');
  landFlightButton.addEventListener('click',()=>{if(flightSession?.last?.canLand)endHelicopterFlight(false);});
  const abortFlightButton=flightButton('Return home');
  abortFlightButton.addEventListener('click',()=>endHelicopterFlight(true));
  flightHud.append(flightStatus,flightRow);document.body.appendChild(flightHud);
  function pilotKeyDown(event){
    if(!flightSession||event.target?.matches?.('input,textarea,select'))return;
    if(event.code==='Space'||event.code==='KeyR'){pilotHeld.up=true;event.preventDefault();}
    if(event.code==='ShiftLeft'||event.code==='ShiftRight'||event.code==='KeyF'){pilotHeld.down=true;event.preventDefault();}
  }
  function pilotKeyUp(event){
    if(event.code==='Space'||event.code==='KeyR')pilotHeld.up=false;
    if(event.code==='ShiftLeft'||event.code==='ShiftRight'||event.code==='KeyF')pilotHeld.down=false;
  }
  function releasePilotInput(){pilotHeld.up=false;pilotHeld.down=false;}
  const onPilotVisibility=()=>{if(document.hidden)releasePilotInput();};
  window.addEventListener('keydown',pilotKeyDown);window.addEventListener('keyup',pilotKeyUp);
  window.addEventListener('blur',releasePilotInput);
  document.addEventListener('visibilitychange',onPilotVisibility);
  function nearestVerifiedHelipad(){
    const x=player.pos.x-OFFSET_X,z=player.pos.z;
    for(const s of verifiedTycoonProperties){
      if(!s?.unlockedItemIds?.includes('estate-helicopter')||!helicopters.hasHelicopter(s.propertyId))continue;
      const lot=manifest.lots.find(l=>l.propertyId===s.propertyId);
      if(!lot)continue;
      // Roof helipads are inaccessible on foot: board from the public property approach.
      const p=controllerRef.navigation.propertyApproach(s.propertyId);
      if(p&&Math.hypot(x-p.x,z-p.z)<=6.2)return s.propertyId;
    }
    return null;
  }
  async function pilotAuthorization(propertyId){
    const token=currentWalletToken();
    if(!token)throw Error('Connect the owning Xaman wallet to fly.');
    const response=await fetch(apiBase+'/api/estates/tycoon/helicopter-access?'+new URLSearchParams({propertyId}),{
      headers:{authorization:'Bearer '+token},cache:'no-store',signal:AbortSignal.timeout(9000)});
    const data=await response.json();
    if(!response.ok||data.ok!==true||!data.pilotAuthorized||data.propertyId!==propertyId)
      throw Error(({helicopter_not_unlocked:'The helicopter must be purchased and verified first.',
        property_owner_required:'Only the current estate owner can pilot.',
        helicopter_tier_restricted:'A Family Home or Luxury Mansion is required.'})[data.error]||'Private helicopter access denied.');
    return token;
  }
  async function boardEstateHelicopter(propertyId){
    if(disposed||!active||secretSession||flightSession||flightPending)return false;
    const lot=manifest.lots.find(l=>l.propertyId===propertyId);
    if(!lot||!['family','mansion'].includes(lot.tier))return false;
    if(!helicopters.hasHelicopter(propertyId)){
      showPanel('ESTATE AVIATION','This property has no verified helicopter. A 60 XRP helicopter and helipad upgrade is available for Family Homes and Mansions.',[{label:'Close',run:hidePanel}]);return false;
    }
    const withinBoardingDistance=()=>Math.hypot(player.pos.x-OFFSET_X-lot.position.x,player.pos.z-lot.position.z)<=19;
    if(!withinBoardingDistance()){
      showPanel('HELIPAD TOO FAR','Approach this property before boarding its aircraft.',[{label:'Close',run:hidePanel}]);return false;
    }
    flightPending=true;
    try{
      const token=await pilotAuthorization(propertyId);
      if(disposed||!active||secretSession||flightSession||!helicopters.hasHelicopter(propertyId))return false;
      if(currentWalletToken()!==token)throw Error('The wallet changed during authorization. Please try again.');
      if(!withinBoardingDistance())throw Error('You moved away from the estate while boarding. Return to its entrance.');
      let journalId=null,logbookStatus='unsaved',callsign='BURN AIR';
      // Appearance loading and journal creation fail independently: a cosmetic read
      // outage must never strand a valid server-created flight session.
      const [profileAttempt,sessionAttempt]=await Promise.allSettled([
        hangarRequest('?propertyId='+encodeURIComponent(propertyId),propertyId),
        hangarRequest('/flight/start',propertyId,{})
      ]);
      if(disposed||!active||secretSession||flightSession)return false;
      if(currentWalletToken()!==token)throw Error('The wallet changed during boarding. Please reconnect.');
      if(!withinBoardingDistance())throw Error('The aircraft is too far away. Return to the estate entrance.');
      if(profileAttempt.status==='fulfilled'){
        helicopters.setStyle(propertyId,profileAttempt.value.style);
        callsign=profileAttempt.value.style.callsign;
      }
      if(sessionAttempt.status==='fulfilled'){
        journalId=sessionAttempt.value.sessionId;
        logbookStatus='recording';
      }
      // Boarding a helicopter suspends skating and its physics controller;
      // the airframe becomes the sole authority for player movement.
      if(window.__skate?.active)window.__skate.toggle(false);
      const model=helicopters.board(propertyId);
      if(!model)return false;
      const avatarWasVisible=avatar.visible,former={x:player.pos.x,y:player.pos.y,z:player.pos.z};
      flightSession={propertyId,model,token,avatarWasVisible,former,verifiedAt:Date.now(),last:null,unlockedAt:Date.now(),journalId,logbookStatus,callsign};
      stopPresence();avatar.visible=false;
      player.vel?.set(0,0,0);player.fp=false;player.onGround=true;player.climb=null;
      const p=model.position;
      player.pos.set(OFFSET_X+p.x,p.altitude+1.5,p.z);flightHud.style.display='block';
      exitButton.textContent='↩ Return to Helipad';exitButton.setAttribute('aria-label','Return to helipad');
      if(guidanceHud)guidanceHud.style.display='none';
      hidePanel();
      onStatus({state:'estate-helicopter-boarded',propertyId,pilotScope:'island-local'});
      return true;
    }catch(error){
      if(!disposed&&active)showPanel('ESTATE HELICOPTER ACCESS',String(error?.message||error),
        [{label:'Close',run:hidePanel}]);return false;
    }finally{flightPending=false;}
  }
  function endHelicopterFlight(emergency=false,resumePresence=true){
    if(!flightSession)return false;
    const current=flightSession;
    if(!emergency&&!current.model.land())return false;
    flightSession=null;flightRecheckBusy=false;
    if(current.journalId){
      const last=current.last||{elapsed:0,routeVisited:[]};
      // Server cross-checks elapsed wall time, route whitelist, session owner and current estate ownership.
      void hangarRequest('/flight/finish',current.propertyId,{
        sessionId:current.journalId,durationSeconds:Math.min(5400,Math.max(0,Math.floor(last.elapsed))),
        routeVisited:last.routeVisited,landed:!emergency
      }).then(()=>onStatus({state:'estate-flight-recorded',propertyId:current.propertyId,verification:'client_reported'}))
        .catch(()=>onStatus({state:'estate-flight-log-unsaved',propertyId:current.propertyId}));
    }
    pilotHeld.up=false;pilotHeld.down=false;
    helicopters.park();
    avatar.visible=current.avatarWasVisible;
    const approach=controllerRef.navigation.propertyApproach(current.propertyId);
    // Return the pilot to public walkable ground, never into the solid building below the roof pad.
    const home=approach||{x:current.former.x-OFFSET_X,z:current.former.z};
    player.pos.set(OFFSET_X+home.x,ISLAND_SPAWN.y,home.z);
    player.vel?.set(0,0,0);player.onGround=true;player.climb=null;
    avatar.position.copy(player.pos);
    flightHud.style.display='none';exitButton.textContent='↩ Return to BURN City';
    exitButton.setAttribute('aria-label','Return to BURN City');
    if(resumePresence&&active&&leaseToken&&islandInstanceId)connectPresence(leaseToken,islandInstanceId);
    hidePanel();
    onStatus({state:'estate-helicopter-parked',propertyId:current.propertyId,emergency});
    return true;
  }
  function tickHelicopterFlight(dt,moveForward,moveSide,edge){
    if(!flightSession)return true;
    hideCityScene();
    if(currentWalletToken()!==flightSession.token){endHelicopterFlight(true);return true;}
    const s=flightSession;
    if(!flightRecheckBusy&&Date.now()-s.verifiedAt>=30000){
      s.verifiedAt=Date.now();flightRecheckBusy=true;
      void pilotAuthorization(s.propertyId).then(token=>{
        if(flightSession===s&&token!==s.token)endHelicopterFlight(true);
      }).catch(()=>{if(flightSession===s)endHelicopterFlight(true);})
        .finally(()=>{flightRecheckBusy=false;});
    }
    const yaw=getYaw();
    const result=s.model.tick({dt,yaw,forward:moveForward,strafe:moveSide,
      ascend:pilotHeld.up?1:0,descend:pilotHeld.down?1:0});
    s.last=result;
    helicopters.tick({propertyId:s.propertyId,position:result.position,rotor:result.rotor,heading:yaw,
      bank:Math.max(-.12,Math.min(.12,moveSide*.09)),dt});
    player.pos.set(OFFSET_X+result.position.x,result.position.altitude+1.5,result.position.z);
    avatar.position.copy(player.pos);
    const desired={x:player.pos.x+Math.sin(yaw)*11,y:player.pos.y+5,z:player.pos.z+Math.cos(yaw)*11};
    const blend=1-Math.exp(-9*Math.max(0,Math.min(dt,.1)));
    camera.position.set(camera.position.x+(desired.x-camera.position.x)*blend,
      camera.position.y+(desired.y-camera.position.y)*blend,camera.position.z+(desired.z-camera.position.z)*blend);
    camera.lookAt(player.pos.x,player.pos.y+1,player.pos.z);
    const mins=Math.floor(result.elapsed/60),secs=Math.floor(result.elapsed%60);
    flightStatus.textContent='ESTATES PRIVATE AVIATION · '+s.callsign+'\nAltitude '+Math.round(result.position.altitude)+' m · '+Math.round(result.speed)+' m/s'+
      '\nFlight '+mins+':'+String(secs).padStart(2,'0')+' · Lookouts '+result.routeVisited.length+'/3'+
      (result.landmark?'\nReached '+result.landmark:'')+
      '\nWASD/movement to steer · SPACE/R ascend · SHIFT/F descend'+
      '\nLogbook: '+(s.logbookStatus==='recording'?'recording (client-reported)':'not recording');
    landFlightButton.disabled=!result.canLand;landFlightButton.style.opacity=result.canLand?'1':'.5';
    if(edge&&result.canLand)endHelicopterFlight(false);
    return true;
  }

  // Secret interiors are client-side 3D scenes with server-verified entitlement.
  // Public island presence is suspended inside; there is no private-room networking yet.
  let secretSession=null,secretPending=false,secretPrompt=null,secretExitArmed=false,secretRecheckAt=0,secretRecheckBusy=false,lastHatchId=null;
  const currentWalletToken=()=>{try{return localStorage.getItem('bcToken')||'';}catch{return '';}};
  async function privateRoomRequest(action,propertyId,roomId=''){
    const token=currentWalletToken();
    if(!token)throw Error('Sign in with Xaman before entering a private room.');
    const query=new URLSearchParams({propertyId});if(roomId)query.set('roomId',roomId);
    const response=await fetch(apiBase+'/api/estates/tycoon/'+action+'?'+query,{
      cache:'no-store',headers:{authorization:'Bearer '+token},signal:AbortSignal.timeout(9000)
    });
    const data=await response.json();
    if(!response.ok||data.ok!==true){
      const message=({sign_in_with_xaman:'Connect the owning or invited wallet.',no_access:'Only the owner or invited guests may enter.',room_not_unlocked:'This room has not been purchased yet.',property_unowned:'This property has no private-room owner.'})[data.error]||'Private room access denied or temporarily unavailable.';
      throw Error(message);
    }
    return {data,token};
  }
  async function homeRequest(propertyId,payload=null){
    const token=currentWalletToken();if(!token)throw Error('Connect the owning or invited Xaman wallet.');
    const response=await fetch(apiBase+'/api/estates/home/state'+(payload?'':'?propertyId='+encodeURIComponent(propertyId)),{
      method:payload?'POST':'GET',cache:'no-store',
      headers:{authorization:'Bearer '+token,'content-type':'application/json'},
      ...(payload?{body:JSON.stringify({propertyId,...payload})}:{}),signal:AbortSignal.timeout(9000)
    });
    const result=await response.json();
    if(token!==currentWalletToken())throw Error('Wallet changed during interior access.');
    if(!response.ok||result.ok!==true)throw Error(result.error||'home_interior_unavailable');
    return result;
  }
  // Verified Tycoon unlocks (public /tycoon/world) decide which interior upgrades show inside.
  function homeRoomOptions(session,state=session?.homeState,extra={}){
    const unlocked=verifiedTycoonProperties.find(p=>p?.propertyId===session?.propertyId)?.unlockedItemIds;
    return {...(state||{}),upgrades:session?.tour?[]:Array.isArray(unlocked)?unlocked:[],tour:!!session?.tour,floor:session?.floor||0,...extra};
  }
  const showHomeAllowed=propertyId=>ownershipKnown&&!ownedPropertyIds.has(propertyId);
  function changeHomeFloor(floor){
    if(!secretSession||secretSession.roomId!=='home')return false;
    secretSession.floor=floor;
    fadeHold();
    const layout=secretInterior.setRoom('home',homeRoomOptions(secretSession,secretSession.homeState,{floor}));
    const at=floor>0?layout.spawn:(layout.arrival||layout.spawn),origin=secretInterior.origin;
    player.pos.set(origin.x+at.x,origin.y+layout.walkHeight,origin.z+at.z);player.vel?.set(0,0,0);
    setYaw(at.yaw||0);avatar.position.copy(player.pos);avatar.rotation.y=at.yaw||0;fadeIn();
    secretPrompt=null;secretExitArmed=false;hidePanel();return true;
  }
  async function openHomeEditor(propertyId){
    if(disposed||!active||!secretSession||secretSession.roomId!=='home'||secretSession.propertyId!==propertyId)return;
    const session=secretSession;
    if(session.tour){showPanel('SHOW HOME TOUR','This home is for sale, so there is nothing to rearrange yet. Owners get a free furnishing editor.',[{label:'Keep exploring',run:hidePanel}]);return;}
    if(session.floor)changeHomeFloor(0);  // furniture lives on the ground floor
    try{
      const state=await homeRequest(propertyId);
      if(secretSession!==session)return;
      showPanel('YOUR HOME DESIGN STUDIO','Arrange furnishings in a free floor-plan builder. Premium room themes only unlock after a verified Tycoon purchase.',
        [{label:'Keep exploring',run:hidePanel}],
        'Free furniture · 0 XRP. Existing Arcade, Workshop and Bunker upgrades unlock three premium themes.');
      homeEditorActive=true;if(document.pointerLockElement)document.exitPointerLock?.(); // the editor needs the cursor
      mountEstateHomeEditor(panel,state,{api:apiBase,
        onPreview:preview=>{
          if(secretSession!==session||!homeEditorActive)return;
          secretInterior.setRoom('home',homeRoomOptions(session,preview||session.homeState));
        },
        onSaved:newState=>{
          if(secretSession!==session)return;
          session.homeState=newState;
          secretInterior.setRoom('home',homeRoomOptions(session,newState));
        },
        onExit:hidePanel
      });
      positionPanel();
    }catch(e){
      if(secretSession===session)showPanel('HOME EDITOR UNAVAILABLE',e.message,[{label:'Back',run:hidePanel}]);
    }
  }
  async function openSecretRoomMenu(propertyId){
    if(disposed||!active||secretPending||typeof propertyId!=='string')return;
    secretPending=true;
    try{
      const {data}=await privateRoomRequest('interior-options',propertyId);
      if(disposed||!active||secretSession&&secretSession.propertyId!==propertyId)return;
      const rooms=(data.rooms||[]).map(room=>({
        id:room.id,title:room.title+(room.free?' · FREE':''),primary:room.id==='home'
      }));
      if(interiorHud.visible&&interiorHud.showRoomPicker?.(rooms,{onPick:room=>void enterSecretRoom(propertyId,room.id)})){
        if(!rooms.length)interiorHud.announce('Every purchased home includes its own private interior.');
        return;
      }
      const actions=rooms.map(room=>({
        label:'Enter '+room.title,primary:room.primary,
        run:()=>void enterSecretRoom(propertyId,room.id)
      }));
      actions.push({label:secretSession?'Stay in this room':'Return to property',run:hidePanel});
      showPanel('PRIVATE ESTATE INTERIORS',(rooms.length?
        'Verified '+data.role+' access · choose an unlocked room. E/USE interacts with doors and equipment.':
        'Every purchased home includes its own private interior. Paid room upgrades are optional.'),actions,
        'Room access is checked against paid upgrades and the server-owned guest list. No bonus payouts are created by entering.');
    }catch(e){
      if(!disposed&&active)showPanel('PRIVATE ROOM ACCESS',e.message,[{label:'Close',run:hidePanel}]);
    }finally{secretPending=false;}
  }
  async function enterSecretRoom(propertyId,roomId,{door=null,tour=false}={}){
    if(disposed||!active||secretPending||secretSession&&secretSession.propertyId!==propertyId)return false;
    secretPending=true;
    try{
      let data,token,homeState=null;
      if(tour){
        // Unowned homes are open show homes (server access policy: unowned = tour).
        // Built locally from the public catalog: no wallet, no saved furniture, no upgrades.
        const lot=manifest.lots.find(l=>l.propertyId===propertyId);
        if(roomId!=='home'||!lot||!showHomeAllowed(propertyId))return false;
        data={allowed:true,roomId,propertyId,role:'tour'};token=currentWalletToken();
        homeState={tier:lot.tier,layoutId:'cozy',furniture:[]};
      }else{
        ({data,token}=await privateRoomRequest('interior-access',propertyId,roomId));
        if(disposed||!active||!data.allowed||data.roomId!==roomId||data.propertyId!==propertyId)return false;
        homeState=roomId==='home'?await homeRequest(propertyId):null;
      }
      const switching=!!secretSession;
      fadeHold();
      if(!switching){
        const returnAt=door?{x:OFFSET_X+door.outside.x,y:player.pos.y,z:door.outside.z,yaw:0,door}:{x:player.pos.x,y:player.pos.y,z:player.pos.z,yaw:getYaw()};
        secretSession={propertyId,roomId,token,returnAt,homeState,tour,floor:0};
        fpPrevious=!!player.fp;fpPrevPitch=getPitch();
        stopPresence();root.visible=false;directoryButton.style.display='none';
        if(guidanceHud)guidanceHud.style.display='none';
        if(window.__skate?.active)window.__skate.toggle(false);
      }else secretSession={...secretSession,roomId,token,homeState,floor:0};
      const layout=secretInterior.setRoom(roomId,roomId==='home'?homeRoomOptions(secretSession,homeState,{reveal:true}):{upgrades:secretSession.tour?[]:(verifiedTycoonProperties.find(p=>p?.propertyId===propertyId)?.unlockedItemIds||[]),tour:!!secretSession.tour});
      fadeIn();
      const origin=secretInterior.origin;
      player.pos.set(origin.x+layout.spawn.x,origin.y+layout.walkHeight,origin.z+layout.spawn.z);
      player.vel?.set(0,0,0);player.fp=true;player.onGround=true;player.climb=null;player.spawned=1;
      setYaw(0);avatar.position.copy(player.pos);avatar.rotation.y=0;
      firstPerson.enter();
      camera.position.set(origin.x,origin.y+2.65,origin.z+6.05);
      camera.lookAt(origin.x,origin.y+1.4,origin.z+layout.spawn.z);
      exitButton.textContent=roomId==='home'?'↩ Exit Home':'↩ Exit Secret Room';exitButton.setAttribute('aria-label',roomId==='home'?'Exit Home':'Exit Secret Room');
      secretPrompt=null;secretExitArmed=false;secretRecheckAt=Date.now();
      hidePanel();worldPrompt.hide();
      interiorHud.show({
        exit:()=>leaveSecretInterior(),
        rooms:tour?()=>interiorHud.announce('Private rooms open for owners and invited guests'):()=>{if(interiorHud.pickerOpen)interiorHud.hidePicker();else void openSecretRoomMenu(propertyId);},
        label:'Exit'
      });
      if(roomId==='home'&&tour)interiorHud.announce('Show home · tour only · use Exit or the front door');
      else if(roomId==='home')interiorHud.announce('Walk the rooms · Exit or the front door to leave');
      else interiorHud.announce('Private room · Exit to return outside');
      onStatus({state:'entered-secret-room',propertyId,roomId,role:data.role,privateRoomNetworked:false});
      return true;
    }catch(e){
      if(!disposed&&active)showPanel('SECRET ROOM UNAVAILABLE',e.message,[{label:'Back',run:()=>void openSecretRoomMenu(propertyId)}]);
      return false;
    }finally{secretPending=false;}
  }
  function leaveSecretInterior(resumePresence=true){
    if(!secretSession)return false;
    const previous=secretSession;secretSession=null;
    fadeHold();
    secretInterior.hide();secretPrompt=null;secretRecheckAt=0;
    if(previous.returnAt?.door)doorPrompt.exitedThrough(previous.returnAt.door);
    fadeIn();
    root.visible=true;
    if(selectedLotBeacon)selectedLotBeacon.group.visible=Boolean(targetLot);
    interiorHud.hide();directoryButton.style.display='block';exitButton.textContent='↩ Return to BURN City';exitButton.setAttribute('aria-label','Return to BURN City');
    const p=previous.returnAt;
    player.pos.set(p.x,p.y,p.z);
    firstPerson.exit();
    player.vel?.set(0,0,0);player.fp=fpPrevious;player.onGround=true;player.climb=null;player.spawned=1;
    setYaw(p.yaw);setPitch(fpPrevPitch);avatar.position.copy(player.pos);avatar.rotation.y=p.yaw;
    camera.position.set(p.x+Math.sin(p.yaw)*7,p.y+2.6,p.z+Math.cos(p.yaw)*7);
    camera.lookAt(p.x,p.y+1.25,p.z);
    hidePanel();
    if(resumePresence&&active&&leaseToken&&islandInstanceId)connectPresence(leaseToken,islandInstanceId);
    onStatus({state:'exited-secret-room',propertyId:previous.propertyId,roomId:previous.roomId});
    return true;
  }
  function showSecretInteraction(interaction){
    if(!interaction){if(secretPrompt)hidePanel();secretPrompt=null;interiorHud.setContext({});return;}
    secretPrompt=interaction.id;
    const propertyId=secretSession?.propertyId;
    if(interaction.id==='stairs-up'||interaction.id==='stairs-down'){const up=interaction.id==='stairs-up';
      interiorHud.setContext({stairs:()=>changeHomeFloor(up?1:0),stairsLabel:up?'Upstairs':'Downstairs'});
      interiorHud.announce(up?'Stairs · go up':'Stairs · go down',1800);}
    else if(interaction.id==='exit'){
      interiorHud.setContext({});
      interiorHud.announce(secretSession?.roomId==='home'?'Front door · Exit or press E':'Exit · press E',1800);}
    else if(secretSession?.tour&&(interaction.id==='portal'||interaction.id==='terminal')){
      interiorHud.setContext({});interiorHud.announce('Show home · editor and private rooms unlock after purchase',2400);}
    else if(interaction.id==='portal'){
      interiorHud.setContext({extra:()=>void openSecretRoomMenu(propertyId),extraLabel:'Rooms'});
      interiorHud.announce('Other rooms',1600);}
    else if(interaction.id==='power')showPanel('BACKUP POWER','Change the room lighting to emergency mode or restore full power.',
      [{label:secretInterior.powerOn?'Switch to emergency lighting':'Restore full lighting',primary:true,
        run:()=>{secretInterior.setPower(!secretInterior.powerOn);showSecretInteraction(interaction);}},{label:'Close',run:hidePanel}],
      'This is a local environmental interaction. No utility fees or account transfers.');
    else if(secretSession?.roomId==='home')showPanel('HOME DESIGN DESK','Customize furniture and choose a floor plan for this property.',
      [{label:'Open furnishing editor',primary:true,run:()=>void openHomeEditor(propertyId)},
       {label:'Continue exploring',run:hidePanel}],
      'Free plans and furniture never charge XRP. Premium plans use already verified Tycoon unlocks.');
    else showPanel('ESTATE CONSOLE','A decorative operations terminal and property control desk. Functional crafting, storage and rewards are not enabled yet.',
      [{label:'Continue exploring',run:hidePanel}],
      'The terminal does not claim or transfer any funds.');
  }
  let lastDoorPanel=false;
  function enterHomeDoor(spot){
    lastDoorPanel=false;
    return enterSecretRoom(spot.propertyId,'home',{door:spot,tour:showHomeAllowed(spot.propertyId)});
  }
  function showHomeDoor(spot){
    const tour=showHomeAllowed(spot.propertyId);lastDoorPanel=true;
    worldPrompt.set({
      x:OFFSET_X+spot.x,y:1.45,z:spot.z,title:spot.address||'',nearDistance:1.6,farDistance:4.5,
      actions:[
        {label:'Enter',icon:'⌂',primary:true,run:()=>void enterHomeDoor(spot)},
        {label:'Edit',icon:'✎',run:()=>showLotInspection({lotId:manifest.lots.find(l=>l.propertyId===spot.propertyId)?.id,propertyId:spot.propertyId,address:spot.address,tier:spot.tier})}
      ]
    });
    tickWorldPrompt();
  }
  function nearestVerifiedHatch(){
    const x=player.pos.x-OFFSET_X,z=player.pos.z;
    for(const state of verifiedTycoonProperties){
      if(!Array.isArray(state?.unlockedItemIds)||!state.unlockedItemIds.some(id=>id==='hidden-hatch'||id==='underground-bunker'))continue;
      const lot=manifest.lots.find(l=>l.propertyId===state.propertyId);
      const hatch=hatchAnchors.get(state.propertyId);
      if(lot&&hatch&&Math.hypot(x-lot.position.x-hatch.x,z-lot.position.z-hatch.z)<2.1)return state.propertyId;
    }
    return null;
  }
  function tickSecretInterior(dt,moveForward,moveSide,running,desiredDelta,edge){
    if(!secretSession)return true;
    hideCityScene();
    if(!secretSession.tour)if(currentWalletToken()!==secretSession.token){leaveSecretInterior();return true;}
    // While furnishing, pointer and movement input belong to the design grid,
    // not outdoor walking or nearby interactive prompts.
    if(homeEditorActive)return true;
    if(!secretSession.tour&&!secretRecheckBusy&&Date.now()-secretRecheckAt>30000){
      secretRecheckBusy=true;secretRecheckAt=Date.now();
      const previous=secretSession;
      void privateRoomRequest('interior-access',previous.propertyId,previous.roomId)
        .then(({token})=>{if(secretSession===previous&&token!==previous.token)leaveSecretInterior();})
        .catch(()=>{if(secretSession===previous){leaveSecretInterior();showPanel('PRIVATE ACCESS ENDED','Your room access could not be revalidated.',
          [{label:'Close',run:hidePanel}]);}})
        .finally(()=>{secretRecheckBusy=false;});
    }
    const origin=secretInterior.origin,room=secretInterior.layout;
    if(!room){leaveSecretInterior();return true;}
    const before={x:player.pos.x-origin.x,z:player.pos.z-origin.z};
    const delta=desiredDelta??islandMoveDelta({dt,yaw:getYaw(),moveX:moveForward,moveZ:moveSide},running?7.2:4.5);
    const moved=secretInterior.move(before,{x:delta.x,z:delta.z});
    player.pos.set(origin.x+moved.x,origin.y+room.walkHeight,origin.z+moved.z);
    avatar.position.copy(player.pos);
    avatar.rotation.y=Math.hypot(moved.x-before.x,moved.z-before.z)>.001?
      Math.atan2(-(moved.x-before.x),-(moved.z-before.z)):getYaw();
    // First person by default inside (V still toggles back to the over-the-shoulder view).
    let aimed=null;
    if(player.fp){
      if(!firstPerson.active)firstPerson.enter();
      secretInterior.tickReveal(dt);
      aimed=firstPerson.tick({layout:room,origin,local:moved,dt,moved:Math.hypot(moved.x-before.x,moved.z-before.z)}).aim;
    }else{
      if(firstPerson.active)firstPerson.exit();
      secretInterior.tickCamera({camera,localPosition:moved,yaw:getYaw(),dt});
    }
    // Arrival is just inside the front door: like the Ember Bar, the exit only
    // arms once the player has stepped away from it, so entering never pops
    // the leave prompt over the arrival view. The centre reticle wins over proximity once the
    // player has stepped in (so nothing it happens to point at pops up over the arrival view).
    let trigger=(secretExitArmed&&aimed)||secretInterior.interaction(moved);
    if(trigger?.id!=='exit')secretExitArmed=true;else if(!secretExitArmed)trigger=null;
    if(trigger?.id!==secretPrompt)showSecretInteraction(trigger);
    if(edge&&trigger){
      if(trigger.id==='exit')leaveSecretInterior();
      else if(trigger.id==='stairs-up'||trigger.id==='stairs-down')changeHomeFloor(trigger.id==='stairs-up'?1:0);
      else if(trigger.id==='portal'&&!secretSession.tour)void openSecretRoomMenu(secretSession.propertyId);
      else if(trigger.id==='power'){secretInterior.setPower(!secretInterior.powerOn);showSecretInteraction(trigger);}
      else showSecretInteraction(trigger);
    }
    return true;
  }

  async function leaseRequest(action, payload, keepalive=false) {
    const response=await fetch(apiBase+'/api/estates/instance/'+action, {
      method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(payload),keepalive,
      signal:AbortSignal.timeout(8000)
    });
    const result=await response.json();
    if(!response.ok || !result.ok) throw new Error(result.error || 'instance_unavailable');
    return result;
  }
  function clearPeers(){for(const peer of remotePeers.values()){peer.mesh.userData.defaultAvatar?.dispose();root.remove(peer.mesh);}remotePeers.clear();}
  function stopPresence(){
    presenceStopped=true;
    if(presenceTimer!==null)clearInterval(presenceTimer);presenceTimer=null;
    if(reconnectTimer!==null)clearTimeout(reconnectTimer);reconnectTimer=null;
    const socket=presenceSocket;presenceSocket=null;
    if(socket&&socket.readyState<2){socket.onclose=null;socket.close();}
    clearPeers();
  }
  function updatePeer(id,p){
    if(!Number.isSafeInteger(id)||!p||![p.x,p.y,p.z,p.r].every(finite))return;
    let peer=remotePeers.get(id);
    if(!peer){const mesh=buildWalker({lite:!!window.__city?.MOBILE});root.add(mesh);peer={mesh,x:p.x,y:p.y,z:p.z,r:p.r,phase:0};mesh.position.set(p.x,p.y,p.z);remotePeers.set(id,peer);}
    Object.assign(peer,{x:p.x,y:p.y,z:p.z,r:p.r});
  }
  function connectPresence(token,instanceId){
    stopPresence();presenceStopped=false;
    const connect=()=>{
      if(presenceStopped||disposed||!active||leaseToken!==token)return;
      const url=new URL(apiBase);url.protocol=url.protocol==='https:'?'wss:':'ws:';url.pathname='/';url.search='';
      url.searchParams.set('mode','estates');url.searchParams.set('lease',token);
      let socket;try{socket=new WebSocket(url.toString());}catch{reconnectTimer=setTimeout(connect,2000);return;}
      presenceSocket=socket;
      socket.onopen=()=>{if(presenceSocket!==socket||presenceStopped){socket.close();return;}
        presenceTimer=setInterval(()=>{if(socket.readyState===WebSocket.OPEN&&active)socket.send(JSON.stringify({t:'p',x:player.pos.x-OFFSET_X,y:player.pos.y,z:player.pos.z,r:avatar.rotation.y}));},125);
      };
      socket.onmessage=event=>{let msg;try{msg=JSON.parse(event.data);}catch{return;}
        if(msg.t==='w'&&msg.instanceId===instanceId&&Array.isArray(msg.peers)){clearPeers();for(const peer of msg.peers)updatePeer(peer.id,peer);}
        else if(msg.t==='j'||msg.t==='p')updatePeer(msg.id,msg);
        else if(msg.t==='l'){const peer=remotePeers.get(msg.id);if(peer){peer.mesh.userData.defaultAvatar?.dispose();root.remove(peer.mesh);remotePeers.delete(msg.id);}}
      };
      socket.onclose=event=>{if(presenceSocket!==socket)return;presenceSocket=null;if(presenceTimer!==null)clearInterval(presenceTimer);presenceTimer=null;clearPeers();
        if(!presenceStopped&&active&&leaseToken===token&&event.code!==1008)reconnectTimer=setTimeout(connect,2000);
      };
      socket.onerror=()=>{};
    };connect();
  }
  function animatePeers(dt){for(const peer of remotePeers.values()){
    const alpha=1-Math.exp(-Math.min(.1,Math.max(0,dt))*12),p=peer.mesh.position;
    const dx=peer.x-p.x,dz=peer.z-p.z,moving=Math.hypot(dx,dz)>.04;
    const step=Math.hypot(dx*alpha,dz*alpha);p.x+=dx*alpha;p.y+=(peer.y-p.y)*alpha;p.z+=dz*alpha;peer.mesh.rotation.y=peer.r;
    // Smoothed ground speed keeps the Gas Mask Guy's steps in time with how fast the peer moves.
    if(dt>0)peer.speed=(peer.speed||0)+(Math.min(40,step/dt)-(peer.speed||0))*Math.min(1,dt*10);
    if(moving)peer.phase+=dt*9;poseWalker(peer.mesh,peer.phase,moving?.8:0,performance.now()/1000,(peer.speed||0)>7.5,peer.speed||0);
  }}
  function releaseLease() {
    stopPresence();
    if(heartbeatTimer!==null){clearInterval(heartbeatTimer);heartbeatTimer=null;}
    const token=leaseToken;leaseToken=null;
    if(token) void leaseRequest('leave',{leaseToken:token},true).catch(()=>{});
  }
  async function enterIsland(destinationPropertyId=null) {
    if (disposed || active || entering) return false;
    void refreshAppearance(true);void refreshOwnership(true);void refreshTycoon(true);
    entering=true; hidePanel();
    let admission;
    try {
      const bytes=crypto.getRandomValues(new Uint8Array(16));
      const clientId=Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');
      admission=await leaseRequest('enter',{clientId});
      if(typeof admission.leaseToken!=='string'||typeof admission.instanceId!=='string') throw new Error('invalid_admission');
      if(disposed){void leaseRequest('leave',{leaseToken:admission.leaseToken},true).catch(()=>{});return;}
    } catch(error) {
      if(!disposed) showPanel('ESTATES CONNECTION FAILED','The island could not be reached. You are still in BURN City.',
        [{label:'Retry entry',primary:true,run:typeof destinationPropertyId==='string'?()=>teleportToProperty(destinationPropertyId):enterIsland},{label:'Not now',run:hidePanel}]);
      onStatus({state:'entry-failed',message:String(error?.message||error)});
      return false;
    } finally { entering=false; }
    fadeHold();
    leaseToken=admission.leaseToken;islandInstanceId=admission.instanceId;
    heartbeatTimer=setInterval(()=>{
      const token=leaseToken;if(!token||!active)return;
      void leaseRequest('heartbeat',{leaseToken:token}).catch(error=>{
        if(leaseToken===token&&error.message==='lease_expired') {leaveIsland();onStatus({state:'entry-failed',message:'Island session expired'});}
      });
    },30000);
    returnPosition = {x:player.pos.x,y:player.pos.y,z:player.pos.z};
    returnCamera = {position:camera.position.clone(),quaternion:camera.quaternion.clone()};
    active=true; root.visible=true; islandControls(true); nearCityGate=false; hidePanel(); directoryButton.style.display='block';
    if(root.userData.propertyDeepLinkHint)root.userData.propertyDeepLinkHint.style.display='none';
    exitButton.style.display='block';
    hideCityScene();
    window.__estatesCityPresencePaused=true;window.__cityNet?.setPaused(true);
    if(getMode()!=='explore') setMode('explore');
    player.pos.set(OFFSET_X+ISLAND_SPAWN.x,ISLAND_SPAWN.y,ISLAND_SPAWN.z);
    player.fp=false;
    setYaw(-Math.PI/2);
    player.vel?.set(0,0,0); player.onGround=true; player.climb=null; player.spawned=1;
    if(window.__skate?.active)window.__skate.state.pos.copy(player.pos);
    avatar.position.copy(player.pos);
    connectPresence(leaseToken,admission.instanceId);
    if(selectedLotBeacon)selectedLotBeacon.group.visible=Boolean(targetLot);
    onStatus({state:'entered-public-island',instanceId:admission.instanceId,catalogProperties:catalog.properties?.length??0,lotAnchors:manifest.lots.length});
    if(!destinationPropertyId)fadeIn();
    return true;
  }
  async function teleportToProperty(propertyId) {
    const lot=manifest.lots.find(l=>l.propertyId===propertyId);
    if(disposed||typeof propertyId!=='string'||!lot)return false;
    const arrival=controllerRef.navigation.propertyApproach(propertyId);
    if(!arrival)return false;
    if(!active&&!await enterIsland(propertyId))return false;
    if(disposed||!active)return false;
    targetLot=lot;hidePanel();lastProperty=null;lastLandmarkId=null;
    if(window.__skate?.active)window.__skate.toggle(false);
    player.pos.set(OFFSET_X+arrival.x,ISLAND_SPAWN.y,arrival.z);
    player.vel?.set(0,0,0);player.fp=false;player.onGround=true;player.climb=null;player.spawned=1;
    const yaw=Math.atan2(arrival.x-lot.position.x,arrival.z-lot.position.z);
    setYaw(yaw);avatar.position.copy(player.pos);avatar.rotation.y=yaw;
    camera.position.set(player.pos.x+Math.sin(yaw)*7,player.pos.y+2.6,player.pos.z+Math.cos(yaw)*7);
    camera.lookAt(player.pos.x,player.pos.y+1.25,player.pos.z);
    selectedLotBeacon.group.position.set(lot.position.x,.4,lot.position.z);selectedLotBeacon.group.visible=true;
    lastGuidanceUpdate=0;
    showLotPrompt({lotId:lot.id,propertyId:lot.propertyId,address:lot.address,tier:lot.tier});
    onStatus({state:'teleported-to-property',propertyId:lot.propertyId,lotId:lot.id});
    fadeIn();
    return true;
  }
  // Reposition the visitor for a clear 3/4 or side-yard view of a lot. Uses the
  // same island yaw/player hooks as teleport; does not change ownership state.
  function frameProperty(propertyId,{side=false}={}){
    const lot=manifest.lots.find(l=>l.propertyId===propertyId);
    if(disposed||!active||!lot?.position||!lot.buildingFootprint)return false;
    const ox=OFFSET_X+lot.position.x,oz=lot.position.z,oy=ISLAND_SPAWN.y;
    const fp=lot.buildingFootprint;
    // Stay on the front setback / near the approach so the follow camera cannot
    // fall off the island, and offset so the avatar does not hide the facade.
    const px=ox+(side?Math.min(8.2,fp.width/2+5.5):3.1);
    const pz=oz+(side?fp.depth/2+2.2:fp.depth/2+5.4);
    const yaw=Math.atan2(px-ox,pz-oz);
    player.pos.set(px,oy,pz);player.vel?.set(0,0,0);player.fp=false;player.onGround=true;
    setYaw(yaw);avatar.position.copy(player.pos);avatar.rotation.y=yaw;
    return true;
  }
  function leaveIsland() {
    if(disposed||!active)return;
    if(secretSession)leaveSecretInterior(false);
    if(flightSession)endHelicopterFlight(true,false);
    fadeHold();
    active=false; root.visible=false; hidePanel(); controllerRef.dispose();islandControls(false);worldPrompt.hide();interiorHud.hide();
    if(guidanceHud)guidanceHud.style.display='none';
    if(selectedLotBeacon)selectedLotBeacon.group.visible=false;
    exitButton.style.display='none'; directoryButton.style.display='none'; directoryOpen=false;
    if(root.userData.propertyDeepLinkHint)root.userData.propertyDeepLinkHint.style.display='block';
    releaseLease();islandInstanceId=null;
    restoreCityScene();
    const destination=returnPosition??gate;
    if(window.__skate?.active)window.__skate.toggle(false);
    player.pos.set(destination.x,destination.y,destination.z);
    if(returnCamera){camera.position.copy(returnCamera.position);camera.quaternion.copy(returnCamera.quaternion);returnCamera=null;}
    returnPosition=null;
    setYaw(Math.PI/2);
    player.vel?.set(0,0,0); player.onGround=true; player.climb=null; player.spawned=1;
    avatar.position.copy(player.pos);
    window.__estatesCityPresencePaused=false;window.__cityNet?.setPaused(false);
    onStatus({state:'returned-to-city'});
    fadeIn();
  }
  // A fresh controller is required after returning because dispose is intentionally final.
  let controllerRef=controller;
  function tick(dt, moveForward, moveSide, running, desiredDelta=null) {
    if(disposed || getMode()!=='explore') return false;
    const pressed=Boolean(isInteractPressed()), edge=pressed&&!lastE; lastE=pressed;
    if(!active) {
      const near=cityDistance()<=10;
      if(near&&!nearCityGate) {
        nearCityGate=true;
        showPanel('ESTATES ISLAND','Enter the public island neighborhood from the Estates entrance.',
          [{label:'Enter Estates Island',primary:true,run:enterIsland},{label:'Not now',run:hidePanel}],
          'Explicit entry · public paths · private lots remain permission-controlled.');
      } else if(!near&&nearCityGate) { nearCityGate=false; hidePanel(); }
      if(edge&&near) { enterIsland(); return true; }
      return false;
    }
    renderer.tickUpgrades?.(dt);
    tickHouseNight();
    if(secretSession)return tickSecretInterior(dt,moveForward,moveSide,running,desiredDelta,edge);
    if(flightSession)return tickHelicopterFlight(dt,moveForward,moveSide,edge);
    hideCityScene();animatePeers(dt);void refreshAppearance();void refreshFreeStyles();void refreshOwnership();void refreshTycoon();
    if(guidanceHud&&Date.now()-lastGuidanceUpdate>250){
      lastGuidanceUpdate=Date.now();
      if(panel.childElementCount)positionPanel();
      const pos={x:player.pos.x-OFFSET_X,z:player.pos.z};
      if(!targetLot){guidanceHud.style.display='none';} else {
      const approach=targetLot.propertyId?controllerRef.navigation.propertyApproach(targetLot.propertyId):null;
      const destination=approach??targetLot.position;
      const waypoints=estateRoadWaypoints(pos,destination);
      const nextWaypoint=estateNextWaypoint(pos,waypoints);
      const nav=estateWalkingGuidance(pos,nextWaypoint??destination);
      const compass=['N','NE','E','SE','S','SW','W','NW'][Math.round(((nav.bearingRadians+Math.PI*2)%(Math.PI*2))/(Math.PI/4))%8];
      const directDistance=Math.hypot(pos.x-destination.x,pos.z-destination.z);
      guidanceHud.textContent=directDistance<=5?'Arrived at '+targetLot.address:'Lot '+targetLot.address+' · '+Math.round(directDistance)+'m direct · '+compass+' (approx. road guide)';
      guidanceHud.style.display='block';
      }
    }
    if(selectedLotBeacon){
      const pulse=1+0.12*Math.sin(Date.now()*0.003);
      selectedLotBeacon.ring.scale.setScalar(pulse);
    }
    // Rebuild controller after its previous instance was disposed on exit.
    if(!controllerRef.isActive) {
      controllerRef=createEstatesIslandController({
        manifest,actor:localActor,camera:localCamera,
        input:({dt,yaw,moveX,moveZ})=>({delta:islandMoveDelta({dt,yaw,moveX,moveZ},runSpeed)}),
        cameraLookAt:target=>camera.lookAt(target.x+OFFSET_X,target.y,target.z),
        cameraDistance:7,cameraHeight:2.6,lookHeight:1.25,
        onPropertyPrompt:property=>{lastProperty=property;lastLandmarkId=null;showLotPrompt(property);},
        onPropertyPromptClear:()=>{lastProperty=null;lastLandmarkId=null;worldPrompt.hide();if(!directoryOpen)hidePanel();},
        onExitPrompt:event=>{
          if(!active)return;
          if(event.confirmedInteraction){leaveIsland();return;}
          if(event.visible)showPanel('RETURN TO BURN CITY','Return through the bridge gate?',
            [{label:'Return to city',primary:true,run:leaveIsland},{label:'Stay',run:hidePanel}]);
          else hidePanel();
        }
      });
    }
    runSpeed=running?7.2:4.5;
    const beforeX=player.pos.x,beforeZ=player.pos.z;
    const hatch=nearestVerifiedHatch(),helipad=nearestVerifiedHelipad();
    const door=hatch?{spot:null,changed:false}:doorPrompt.update({x:player.pos.x-OFFSET_X,z:player.pos.z},doorSpots);
    if(door.changed&&door.spot&&!directoryOpen)showHomeDoor(door.spot);
    else if(door.changed&&!door.spot&&lastDoorPanel){lastDoorPanel=false;worldPrompt.hide();if(!directoryOpen)hidePanel();}
    if(door.spot&&edge){void enterHomeDoor(door.spot);return true;}
    const result=controllerRef.update({dt,yaw:getYaw(),moveX:moveForward,moveZ:moveSide,interactPressed:edge&&!hatch,exitPressed:edge&&!hatch,desiredDelta});
    if(desiredDelta&&window.__skate?.active){
      const board=window.__skate;board.state.pos.copy(player.pos);
      if(result.blockedX)board.state.vel.x=0;if(result.blockedZ)board.state.vel.z=0;
      if(board.board){board.board.position.x=player.pos.x;board.board.position.z=player.pos.z;}
    }
    avatar.position.copy(player.pos);
    const movedX=player.pos.x-beforeX,movedZ=player.pos.z-beforeZ;
    avatar.rotation.y=Math.hypot(movedX,movedZ)>.001?Math.atan2(-movedX,-movedZ):getYaw();
    updateLandmarkInteraction(edge,Boolean(result.property));
    if(hatch!==lastHatchId){
      lastHatchId=hatch;
      if(hatch&&!edge)showPanel('CONCEALED ESTATE ENTRANCE','A hidden hatch is built into this lot. Press E/USE or choose Explore to check your access.',
        [{label:'Explore secret rooms',primary:true,run:()=>void openSecretRoomMenu(hatch)},{label:'Not now',run:hidePanel}],
        'Only unlocked rooms are enterable, and the owning or invited wallet must authorize the visit.');
    }
    if(hatch&&edge)void openSecretRoomMenu(hatch);
    else if(helipad&&edge)void boardEstateHelicopter(helipad);
    if(helipad&&!hatch&&helipad!==lastHelipadId)showPanel('PRIVATE ESTATE HELIPAD','This property has a verified private helicopter. Press E/USE or board with your authorized wallet.',
      [{label:'Board helicopter',primary:true,run:()=>void boardEstateHelicopter(helipad)},{label:'Close',run:hidePanel}],
      'Family and Mansion estates only · local island flight · no financial rewards.');
    lastHelipadId=helipad;
    if(result.property && edge) {
      // The controller callback supplies the explicit inspection action; no property entry is implied.
    }
    tickWorldPrompt();
    return true;
  }
  // Public island is rendered at the city offset, with a continuous bridge; the city-side interaction is explicit.
  if (requestedLot) {
    const hint=document.createElement('aside');
    hint.id='bcEstatePropertyHint';
    hint.style.cssText='position:fixed;right:12px;top:72px;z-index:1100;max-width:min(330px,85vw);padding:12px;border:1px solid #ffbd68aa;border-radius:12px;background:#101925ed;color:#f4e8d6;font:13px/1.45 system-ui';
    const heading=document.createElement('strong');heading.textContent='Estates property location';
    const body=document.createElement('p');
    body.textContent=requestedLot.address+' · '+requestedLot.district+'. Travel directly to the public approach outside this home.';
    const travel=document.createElement('button');travel.textContent='Teleport to property';travel.addEventListener('click',()=>void teleportToProperty(requestedLot.propertyId));
    const close=document.createElement('button');close.textContent='Dismiss';close.addEventListener('click',()=>hint.remove());
    hint.append(heading,body,travel,close);document.body.append(hint);
    // Arrival is outside the home; admission and private access remain enforced.
    root.userData.propertyDeepLinkHint=hint;
  }

  let guidanceHud=null, lastGuidanceUpdate=0;
  {
    guidanceHud=document.createElement('div');
    guidanceHud.id='bcEstatesWalkingGuidance';
    guidanceHud.setAttribute('role','status');
    guidanceHud.style.cssText='position:fixed;left:50%;top:12px;transform:translateX(-50%);z-index:1090;max-width:90vw;padding:9px 15px;border:1px solid #ffbd68aa;border-radius:20px;background:#101925ed;color:#ffe0ad;font:600 13px system-ui;text-align:center;pointer-events:none;display:none';
    document.body.append(guidanceHud);
  }
  const api = Object.freeze({
    tick,
    teleportToProperty,
    frameProperty,
    returnToCity(){if(disposed||!active)return false;leaveIsland();return true;},
    enterFromCity(){if(disposed||active||entering)return false;void enterIsland();return true;},
    dispose(){
      if(disposed)return false;
      if(secretSession)leaveSecretInterior(false);
      if(flightSession)endHelicopterFlight(true,false);
      disposed=true; firstPerson.exit(); islandControls(false);releaseLease(); restoreCityScene(); window.__estatesCityPresencePaused=false;window.__cityNet?.setPaused(false); hidePanel(); worldPrompt.dispose(); interiorHud.dispose(); exitButton.remove(); directoryButton.remove(); controllerRef.dispose(); renderer.dispose();secretInterior.dispose();fade.remove();helicopters.dispose();flightHud.remove();window.removeEventListener('keydown',pilotKeyDown);window.removeEventListener('keyup',pilotKeyUp);window.removeEventListener('blur',releasePilotInput);document.removeEventListener('visibilitychange',onPilotVisibility);
      for(const mat of root.userData.estatesBridgeMaterials??[])mat.dispose?.();
      root.userData.propertyDeepLinkHint?.remove(); guidanceHud?.remove();
      if(selectedLotBeacon){selectedLotBeacon.group.removeFromParent();for(const g of selectedLotBeacon.geometries)g.dispose();for(const m of selectedLotBeacon.materials)m.dispose();}
      onStatus({state:'disposed'}); return true;
    },
    get active(){return active;},
    get flightActive(){return active&&!!flightSession;},
    get interiorActive(){return active&&!!secretSession;},
    get manifest(){return manifest;}
  });
  window.__estatesIslandLive=api;
  // Read-only browser diagnostic to distinguish missing deploys from failed scene activation.
  window.__estatesIslandDiagnostics=Object.freeze({build:'estates-entry-20261026-pr300',scene:'burn-city-estates-island',lake:'continuous-ring',get loaded(){return !disposed},get active(){return active},get visible(){return root.visible}});
  onStatus({state:'ready',catalogProperties:catalog.properties?.length??0,lotAnchors:manifest.lots.length,publicTraversal:true,privateAccess:'permission-gated'});
  void refreshOwnership(true);
  if(requestedLot)await teleportToProperty(requestedLot.propertyId);
  return api;
}
