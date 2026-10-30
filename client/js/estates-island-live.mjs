// Live BURN City host integration for the public Estates Island traversal.
import { mountEstatePrestige } from './estate-prestige-ui.mjs';
import { mountEstatePurchase } from './estate-purchase-ui.mjs';
import { buildEstatesIslandScene } from './estates-island-scene.mjs';
import { createEstatesIslandRenderer } from './estates-island-renderer.mjs';
import { createEstatesIslandController } from './estates-island-controller.mjs';
import { estateWalkingGuidance } from './estates-walking-guidance.mjs';
import { planEstatesPanel } from './estates-panel-layout.mjs';
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
  // Resolve property deep links against the same manifest that builds the 3D lots.
  // Never trust query-supplied coordinates or property metadata.
  const requestedPropertyId = new URLSearchParams(location.search).get('estateProperty');
  const requestedLot = requestedPropertyId ? manifest.lots.find(l => l.propertyId === requestedPropertyId) : null;
  let targetLot=requestedLot;

  const renderer = createEstatesIslandRenderer({ THREE, scene, manifest });
  const root = renderer.root;
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
  document.body.appendChild(exitButton);exitButton.addEventListener('click',()=>leaveIsland());
  let directoryOpen=false;
  const positionPanel = () => {
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
  const showPanel = (heading, message, actions, muted='') => {
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
  const hidePanel = () => { directoryOpen=false; restoreAppearance(); panel.style.display='none'; panel.replaceChildren(); };
  // A single shared panel hosts the directory and inspection; no stacked overlays.
  const directoryButton=document.createElement('button');
  directoryButton.type='button';
  directoryButton.id='bcEstatesDirectoryButton';
  directoryButton.textContent='⌂ Browse Estates';
  directoryButton.style.cssText='display:none;position:fixed;right:12px;top:calc(72px + env(safe-area-inset-top));z-index:95;min-height:44px;padding:9px 14px;border:1px solid #ffb45b;border-radius:10px;background:#17151af0;color:#ffe4bd;font:700 13px system-ui;cursor:pointer';
  document.body.appendChild(directoryButton);
  function openDirectory(query='',filter='mapped') {
    if(!active)return;
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
    for(const [value,label] of [['mapped','Catalog homes'],['all','All lots'],['unassigned','Unassigned lots']]){
      const option=document.createElement('option');option.value=value;option.textContent=label;select.appendChild(option);
    }
    select.value=filter;
    const results=document.createElement('div');results.style.cssText='display:grid;gap:8px;max-height:40dvh;overflow:auto';
    const render=()=>{
      results.replaceChildren();
      const matches=searchEstateLots(manifest.lots,search.value,select.value);
      for(const lot of matches){
        const button=document.createElement('button');button.type='button';
        button.style.cssText='text-align:left;min-height:44px;width:100%;padding:10px;border:1px solid #ffb45b77;border-radius:9px;background:#28303c;color:#fff1df;cursor:pointer';
        button.textContent=lot.address+' · '+lot.district+' · '+lot.tier;
        button.addEventListener('click',()=>{
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
    search.addEventListener('input',render);select.addEventListener('change',render);
    panel.insertBefore(search,panel.querySelector('.actions'));
    panel.insertBefore(select,panel.querySelector('.actions'));
    panel.insertBefore(results,panel.querySelector('.actions'));
    render();
  }
  directoryButton.addEventListener('click',()=>directoryOpen?(directoryOpen=false,hidePanel()):openDirectory());
  const showLotInspection = property => {
    const catalogued=Boolean(property.propertyId);
    const home=catalog.properties.find(p=>p.id===property.propertyId),tier=catalog.tiers.find(t=>t.id===home?.tier);
    showPanel(property.address,
      tier?tier.label+' · '+tier.price+' XRP · '+tier.shareUnits+' reward share units. Explore the finishes and see how this home can grow.':'This plot is reserved for a future home.',
      [{label:'Navigate to property',primary:true,run:()=>{const lot=manifest.lots.find(l=>l.id===property.lotId);if(lot){targetLot=lot;if(selectedLotBeacon){selectedLotBeacon.group.position.set(lot.position.x,.4,lot.position.z);selectedLotBeacon.group.visible=active;}if(guidanceHud)guidanceHud.style.display='block';hidePanel();}}},{label:'Close',run:hidePanel}],
      'Public paths and shoreline are open to everyone. Private homes are for their owners and invited guests.');
    if(catalogued){
      let finishes;
      mountEstatePurchase(panel,property.propertyId,{api:apiBase,onSettled:()=>{void refreshAppearance(true);void finishes?.refresh();}});
      finishes=mountEstatePrestige(panel,property.propertyId,{api:apiBase,onPreview:level=>previewAppearance(property.propertyId,level),onConfirmed:()=>refreshAppearance(true)});
    }
  };
  const showLotPrompt = property => {
    if(directoryOpen)return;
    const catalogued=Boolean(property.propertyId);
    if(property.confirmedInteraction){showLotInspection(property);return;}
    showPanel('ESTATES · '+property.address,
      catalogued?'Discover this home, preview its future finishes, and check purchase availability.':'This plot is reserved for a future home.',
      [{label:'View home & upgrades',primary:true,run:()=>showLotInspection(property)},
       {label:'Close',run:hidePanel}],
      'Sign in with Xaman to buy a home or manage one you own.');
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
    onPropertyPromptClear:()=>{lastProperty=null;lastLandmarkId=null;if(!directoryOpen)hidePanel();},
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
  let presenceSocket=null, presenceTimer=null, reconnectTimer=null, presenceStopped=true;
  const remotePeers=new Map();
  const hiddenCityObjects=new Map();
  function hideCityScene(){
    for(const object of scene.children){
      if(object===root||object===avatar||object===camera||object.isLight||object.isCamera||object.userData?.estatesKeep)continue;
      if(!hiddenCityObjects.has(object))hiddenCityObjects.set(object,object.visible);
      object.visible=false;
    }
  }
  function restoreCityScene(){for(const [object,visible] of hiddenCityObjects)if(object.parent===scene)object.visible=visible;hiddenCityObjects.clear();}
  const apiBase = new URLSearchParams(location.search).get('citysrv') ||
    (/localhost|127\.0\.0\.1|fly\.dev$/.test(location.hostname) ? location.origin : 'https://burn-city-game.fly.dev');
  let verifiedAppearances=[],previewProperty=null,previewLevel=null,lastAppearanceFetch=0,appearanceFetching=false;
  function restoreAppearance(){previewProperty=null;previewLevel=null;renderer.setAppearance(verifiedAppearances);}
  function previewAppearance(propertyId,level){
    if(level===null){restoreAppearance();return;}
    previewProperty=propertyId;previewLevel=level;
    renderer.setAppearance([...verifiedAppearances.filter(p=>p.propertyId!==propertyId),{propertyId,level}]);
  }
  async function refreshAppearance(force=false){
    if(disposed||appearanceFetching||(!force&&Date.now()-lastAppearanceFetch<30000))return;
    appearanceFetching=true;lastAppearanceFetch=Date.now();
    try{
      const response=await fetch(apiBase+'/api/estates/appearance',{cache:'no-store',signal:AbortSignal.timeout(8000)});
      if(!response.ok)return;const result=await response.json();
      if(disposed||!Array.isArray(result.properties))return;
      verifiedAppearances=result.properties;
      if(previewProperty!==null)previewAppearance(previewProperty,previewLevel);else renderer.setAppearance(verifiedAppearances);
    }catch{}finally{appearanceFetching=false;}
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
  function clearPeers(){for(const peer of remotePeers.values())root.remove(peer.mesh);remotePeers.clear();}
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
        else if(msg.t==='l'){const peer=remotePeers.get(msg.id);if(peer){root.remove(peer.mesh);remotePeers.delete(msg.id);}}
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
    p.x+=dx*alpha;p.y+=(peer.y-p.y)*alpha;p.z+=dz*alpha;peer.mesh.rotation.y=peer.r;
    if(moving)peer.phase+=dt*9;poseWalker(peer.mesh,peer.phase,moving?.8:0,performance.now()/1000);
  }}
  function releaseLease() {
    stopPresence();
    if(heartbeatTimer!==null){clearInterval(heartbeatTimer);heartbeatTimer=null;}
    const token=leaseToken;leaseToken=null;
    if(token) void leaseRequest('leave',{leaseToken:token},true).catch(()=>{});
  }
  async function enterIsland(destinationPropertyId=null) {
    if (disposed || active || entering) return false;
    void refreshAppearance(true);
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
    leaseToken=admission.leaseToken;
    heartbeatTimer=setInterval(()=>{
      const token=leaseToken;if(!token||!active)return;
      void leaseRequest('heartbeat',{leaseToken:token}).catch(error=>{
        if(leaseToken===token&&error.message==='lease_expired') {leaveIsland();onStatus({state:'entry-failed',message:'Island session expired'});}
      });
    },30000);
    returnPosition = {x:player.pos.x,y:player.pos.y,z:player.pos.z};
    returnCamera = {position:camera.position.clone(),quaternion:camera.quaternion.clone()};
    active=true; root.visible=true; nearCityGate=false; hidePanel(); directoryButton.style.display='block';
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
    return true;
  }
  function leaveIsland() {
    if(disposed||!active)return;
    active=false; root.visible=false; hidePanel(); controllerRef.dispose();
    if(guidanceHud)guidanceHud.style.display='none';
    if(selectedLotBeacon)selectedLotBeacon.group.visible=false;
    exitButton.style.display='none'; directoryButton.style.display='none'; directoryOpen=false;
    if(root.userData.propertyDeepLinkHint)root.userData.propertyDeepLinkHint.style.display='block';
    releaseLease();
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
    hideCityScene();animatePeers(dt);void refreshAppearance();
    if(guidanceHud&&Date.now()-lastGuidanceUpdate>250){
      lastGuidanceUpdate=Date.now();
      if(panel.childElementCount)positionPanel();
      const pos={x:player.pos.x-OFFSET_X,z:player.pos.z};
      if(!targetLot){guidanceHud.style.display='none';} else {
      const approach=targetLot.propertyId?controllerRef.navigation.propertyApproach(targetLot.propertyId):null;
      const nav=estateWalkingGuidance(pos,approach??targetLot.position);
      const compass=['N','NE','E','SE','S','SW','W','NW'][Math.round(((nav.bearingRadians+Math.PI*2)%(Math.PI*2))/(Math.PI/4))%8];
      guidanceHud.textContent=nav.arrived?'Arrived at '+targetLot.address:'Lot '+targetLot.address+' · '+Math.round(nav.distance)+'m · '+compass;
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
        onPropertyPromptClear:()=>{lastProperty=null;lastLandmarkId=null;if(!directoryOpen)hidePanel();},
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
    const result=controllerRef.update({dt,yaw:getYaw(),moveX:moveForward,moveZ:moveSide,interactPressed:edge,exitPressed:edge,desiredDelta});
    if(desiredDelta&&window.__skate?.active){
      const board=window.__skate;board.state.pos.copy(player.pos);
      if(result.blockedX)board.state.vel.x=0;if(result.blockedZ)board.state.vel.z=0;
      if(board.board){board.board.position.x=player.pos.x;board.board.position.z=player.pos.z;}
    }
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
    enterFromCity(){if(disposed||active||entering)return false;void enterIsland();return true;},
    dispose(){
      if(disposed)return false; disposed=true; releaseLease(); restoreCityScene(); window.__estatesCityPresencePaused=false;window.__cityNet?.setPaused(false); hidePanel(); exitButton.remove(); directoryButton.remove(); controllerRef.dispose(); renderer.dispose();
      for(const mat of root.userData.estatesBridgeMaterials??[])mat.dispose?.();
      root.userData.propertyDeepLinkHint?.remove(); guidanceHud?.remove();
      if(selectedLotBeacon){selectedLotBeacon.group.removeFromParent();for(const g of selectedLotBeacon.geometries)g.dispose();for(const m of selectedLotBeacon.materials)m.dispose();}
      onStatus({state:'disposed'}); return true;
    },
    get active(){return active;},
    get manifest(){return manifest;}
  });
  window.__estatesIslandLive=api;
  // Read-only browser diagnostic to distinguish missing deploys from failed scene activation.
  window.__estatesIslandDiagnostics=Object.freeze({build:'estates-entry-20261026-pr300',scene:'burn-city-estates-island',lake:'continuous-ring',get loaded(){return !disposed},get active(){return active},get visible(){return root.visible}});
  onStatus({state:'ready',catalogProperties:catalog.properties?.length??0,lotAnchors:manifest.lots.length,publicTraversal:true,privateAccess:'permission-gated'});
  if(requestedLot)await teleportToProperty(requestedLot.propertyId);
  return api;
}
