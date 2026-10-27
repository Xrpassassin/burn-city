// Live BURN City host integration for the public Estates Island traversal.
import { buildEstatesIslandScene } from './estates-island-scene.mjs';
import { createEstatesIslandRenderer } from './estates-island-renderer.mjs';
import { createEstatesIslandController } from './estates-island-controller.mjs';

const OFFSET_X = 650;
const CITY_GATE = Object.freeze({ x: 445, y: 0.1, z: 188 });
const ISLAND_SPAWN = Object.freeze({ x: -195, y: 0.1, z: 188 });
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
    #bcEstatesLivePrompt{position:fixed;left:50%;bottom:calc(90px + env(safe-area-inset-bottom));transform:translateX(-50%);z-index:1200;width:min(92vw,430px);padding:15px;border:1px solid #ffbd68aa;border-radius:14px;background:linear-gradient(145deg,#111a26f5,#080d15f5);box-shadow:0 12px 40px #0009;color:#f5e8d6;font:14px/1.45 system-ui,sans-serif;display:none}
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
  THREE, scene, player, avatar, camera, getYaw, setYaw, getMode, setMode,
  isInteractPressed = () => false,
  onStatus = () => {}
} = {}) {
  if (!THREE || !scene || !player?.pos || !avatar || !camera || typeof getYaw !== 'function' ||
      typeof getMode !== 'function' || typeof setMode !== 'function' || typeof setYaw !== 'function') {
    throw new TypeError('Live Estates Island host dependencies are incomplete');
  }
  const response = await fetch('./data/estate-catalog.json', { cache: 'no-cache' });
  if (!response.ok) throw new Error('Estate catalog could not be loaded ('+response.status+')');
  const catalog = await response.json();
  const manifest = buildEstatesIslandScene({ catalog, seed: 20261024 });
  const renderer = createEstatesIslandRenderer({ THREE, scene, manifest });
  const root = renderer.root;
  root.position.x = OFFSET_X;
  root.visible = false; // Do not expose the full island inside the city proxy.
  addBridgeArchitecture(THREE, root);

  let active = false, nearCityGate = false, lastE = false, lastProperty = null, lastLandmarkId = null, disposed = false;
  const panel = makePanel();
  const showPanel = (heading, message, actions, muted='') => {
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
    panel.appendChild(row); panel.style.display='block';
  };
  const hidePanel = () => { panel.style.display='none'; panel.replaceChildren(); };
  const showLotInspection = property => {
    const catalogued=Boolean(property.propertyId);
    showPanel('LOT INSPECTION · '+property.lotId,
      'Address: '+property.address+' · Tier: '+property.tier+' · Catalog mapping: '+(catalogued?'mapped':'unmapped'),
      [{label:'Close',primary:true,run:hidePanel}],
      'Read-only inspection. A catalog mapping is not proof of ownership; private access and building require server-verified permissions.');
  };
  const showLotPrompt = property => {
    const catalogued=Boolean(property.propertyId);
    if(property.confirmedInteraction){showLotInspection(property);return;}
    showPanel('ESTATES · '+property.address,
      catalogued?'This lot maps to a property record in the current catalog. That record does not prove ownership; private access and build controls require server-verified permissions.':'This lot has no property record mapped in the current catalog. No ownership is inferred.',
      [{label:'Inspect lot',primary:true,run:()=>showLotInspection(property)},
       {label:'Close',run:hidePanel}],
      'Walk up to a lot to inspect it. Private property access requires server-verified permissions.');
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
    if(propertyNearby) { lastLandmarkId=null; return; }
    const x=player.pos.x-OFFSET_X,z=player.pos.z;
    let nearest=null,nearestDistance=Infinity;
    for(const landmark of manifest.landmarks??[]) {
      const distance=Math.hypot(x-landmark.position.x,z-landmark.position.z);
      if(distance<=landmark.interactionRadius&&distance<nearestDistance) {nearest=landmark;nearestDistance=distance;}
    }
    if(!nearest) {
      if(lastLandmarkId!==null) {lastLandmarkId=null;hidePanel();}
      return;
    }
    if(edge) {lastLandmarkId=nearest.id;showLandmarkDetails(nearest);return;}
    if(lastLandmarkId!==nearest.id) {lastLandmarkId=nearest.id;showLandmarkPrompt(nearest);}
  };
  const cityDistance = () => Math.hypot(player.pos.x-CITY_GATE.x,player.pos.z-CITY_GATE.z);
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
    onPropertyPromptClear:()=>{lastProperty=null;lastLandmarkId=null;hidePanel();},
    onExitPrompt:event=>{
      if(!active)return;
      if(event.confirmedInteraction){leaveIsland();return;}
      if(event.visible) showPanel('RETURN TO BURN CITY','You are at the city-side bridge gate. Return to the public city without losing your location.',
        [{label:'Return to city',primary:true,run:leaveIsland},{label:'Stay on island',run:hidePanel}],
        'Press E while this prompt is visible, or use the button.');
      else hidePanel();
    }
  });

  let returnPosition = null;
  function enterIsland() {
    if (disposed || active) return;
    returnPosition = {x:player.pos.x,y:player.pos.y,z:player.pos.z};
    active=true; root.visible=true; nearCityGate=false; hidePanel();
    if(getMode()!=='explore') setMode('explore');
    player.pos.set(OFFSET_X+ISLAND_SPAWN.x,ISLAND_SPAWN.y,ISLAND_SPAWN.z);
    player.fp=false;
    setYaw(-Math.PI/2);
    player.vel?.set(0,0,0); player.onGround=true; player.climb=null; player.spawned=1;
    avatar.position.copy(player.pos);
    onStatus({state:'entered-public-island',catalogProperties:catalog.properties?.length??0,lotAnchors:manifest.lots.length});
  }
  function leaveIsland() {
    if(disposed||!active)return;
    active=false; root.visible=false; hidePanel(); controllerRef.dispose();
    const destination=returnPosition??CITY_GATE;
    player.pos.set(destination.x,destination.y,destination.z);
    returnPosition=null;
    setYaw(Math.PI/2);
    player.vel?.set(0,0,0); player.onGround=true; player.climb=null; player.spawned=1;
    avatar.position.copy(player.pos);
    onStatus({state:'returned-to-city'});
  }
  // A fresh controller is required after returning because dispose is intentionally final.
  let controllerRef=controller;
  function tick(dt, moveForward, moveSide, running) {
    if(disposed || getMode()!=='explore') return false;
    const pressed=Boolean(isInteractPressed()), edge=pressed&&!lastE; lastE=pressed;
    if(!active) {
      const near=cityDistance()<=10;
      if(near&&!nearCityGate) {
        nearCityGate=true;
        showPanel('ESTATES ISLAND','A public island neighborhood lies across this bridge. Enter only when you are ready.',
          [{label:'Enter Estates Island',primary:true,run:enterIsland},{label:'Not now',run:hidePanel}],
          'Explicit entry · public paths · private lots remain permission-controlled.');
      } else if(!near&&nearCityGate) { nearCityGate=false; hidePanel(); }
      if(edge&&near) { enterIsland(); return true; }
      return false;
    }
    // Rebuild controller after its previous instance was disposed on exit.
    if(!controllerRef.isActive) {
      controllerRef=createEstatesIslandController({
        manifest,actor:localActor,camera:localCamera,
        input:({dt,yaw,moveX,moveZ})=>({delta:islandMoveDelta({dt,yaw,moveX,moveZ},runSpeed)}),
        cameraLookAt:target=>camera.lookAt(target.x+OFFSET_X,target.y,target.z),
        cameraDistance:7,cameraHeight:2.6,lookHeight:1.25,
        onPropertyPrompt:property=>{lastProperty=property;lastLandmarkId=null;showLotPrompt(property);},
        onPropertyPromptClear:()=>{lastProperty=null;lastLandmarkId=null;hidePanel();},
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
    const result=controllerRef.update({dt,yaw:getYaw(),moveX:moveForward,moveZ:moveSide,interactPressed:edge,exitPressed:edge});
    avatar.position.copy(player.pos);
    const movedX=player.pos.x-beforeX,movedZ=player.pos.z-beforeZ;
    avatar.rotation.y=Math.hypot(movedX,movedZ)>.001?Math.atan2(-movedX,-movedZ):getYaw();
    updateLandmarkInteraction(edge,Boolean(result.property));
    if(result.property && edge) {
      // The controller callback supplies the explicit inspection action; no property entry is implied.
    }
    return true;
  }
  // Public island is rendered at the city offset, with a continuous bridge; the city-side interaction is explicit.
  const api = Object.freeze({
    tick,
    enterFromCity(){if(disposed||active)return false;enterIsland();return true;},
    dispose(){
      if(disposed)return false; disposed=true; hidePanel(); controllerRef.dispose(); renderer.dispose();
      for(const mat of root.userData.estatesBridgeMaterials??[])mat.dispose?.();
      onStatus({state:'disposed'}); return true;
    },
    get active(){return active;},
    get manifest(){return manifest;}
  });
  window.__estatesIslandLive=api;
  // Read-only browser diagnostic to distinguish missing deploys from failed scene activation.
  window.__estatesIslandDiagnostics=Object.freeze({build:'estates-entry-20261026-pr300',scene:'burn-city-estates-island',lake:'continuous-ring',get loaded(){return !disposed},get active(){return active},get visible(){return root.visible}});
  onStatus({state:'ready',catalogProperties:catalog.properties?.length??0,lotAnchors:manifest.lots.length,publicTraversal:true,privateAccess:'permission-gated'});
  return api;
}
