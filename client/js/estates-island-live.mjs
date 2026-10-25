// Live BURN City host integration for the public Estates Island traversal.
import { buildEstatesIslandScene } from './estates-island-scene.mjs';
import { createEstatesIslandRenderer } from './estates-island-renderer.mjs';
import { createEstatesIslandController } from './estates-island-controller.mjs';

const OFFSET_X = 650;
const CITY_GATE = Object.freeze({ x: 445, y: 0.1, z: 188 });
const ISLAND_SPAWN = Object.freeze({ x: -195, y: 0.1, z: 188 });
const finite = n => typeof n === 'number' && Number.isFinite(n);
const estatesServerBase = () => new URLSearchParams(location.search).get('citysrv') ||
  (/localhost|127\.0\.0\.1/.test(location.hostname) ? location.origin : 'https://burn-city-game.fly.dev');
let localEstateSessionId = null;
function estateBearerToken() {
  try { const token = localStorage.bcToken; return typeof token === 'string' && token ? token : null; }
  catch { return null; }
}
function estateClientSessionId() {
  try {
    let id = sessionStorage.getItem('bcEstatesIslandSession');
    if (!id) {
      id = globalThis.crypto?.randomUUID?.() || ('estate_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2) + '_' + Math.random().toString(36).slice(2));
      sessionStorage.setItem('bcEstatesIslandSession', id);
    }
    return id;
  } catch {
    if (!localEstateSessionId) localEstateSessionId = globalThis.crypto?.randomUUID?.() || ('estate_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2) + '_' + Math.random().toString(36).slice(2));
    return localEstateSessionId;
  }
}
async function readSavedReturnAnchor(navigation) {
  const token = estateBearerToken();
  if (!token || typeof navigation?.isWalkable !== 'function') return null;
  try {
    const response = await fetch(estatesServerBase() + '/api/estates/anchor', {
      headers: { authorization: 'Bearer ' + token }, cache: 'no-store'
    });
    if (!response.ok) return null;
    const payload = await response.json();
    const anchor = payload?.ok ? payload.anchor : null;
    if (!anchor || ![anchor.x, anchor.y, anchor.z, anchor.r].every(finite)) return null;
    // Never trust stored coordinates as a spawn point: the local navigation mesh must accept them.
    return navigation.isWalkable(anchor) ? anchor : null;
  } catch { return null; }
}
async function saveReturnAnchor(position, navigation) {
  const token = estateBearerToken();
  if (!token || !position || typeof navigation?.isWalkable !== 'function' || !navigation.isWalkable(position)) return false;
  try {
    const response = await fetch(estatesServerBase() + '/api/estates/anchor', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: 'Bearer ' + token },
      body: JSON.stringify({ x: position.x, y: position.y, z: position.z, r: position.r }),
      keepalive: true
    });
    return response.ok;
  } catch { return false; }
}
async function releaseEstatesInstanceLease(leaseToken) {
  if (!leaseToken) return;
  try {
    await fetch(estatesServerBase() + '/api/estates/instance/leave', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ leaseToken }), keepalive: true
    });
  } catch { /* Server idle cleanup remains the fallback for a dropped client. */ }
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
    mesh.name = name; mesh.position.set(x,y,z); mesh.userData.estatesExteriorVisible = true; root.add(mesh); return mesh;
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
  addBridgeArchitecture(THREE, root);

  // Keep a compact scenic silhouette in the city view. The detailed shared community
  // is revealed only after explicit entry; the bridge/gate remain visible outside.
  function makeExteriorPreview() {
    const preview = new THREE.Group();
    preview.name = 'estates-exterior-preview';
    preview.position.set(OFFSET_X, 0, 75);
    const mat = (color, options={}) => new THREE.MeshStandardMaterial({ color, roughness: options.roughness ?? .9, metalness: options.metalness ?? 0, transparent: options.transparent ?? false, opacity: options.opacity ?? 1, side: THREE.DoubleSide });
    const water = new THREE.Mesh(new THREE.RingGeometry(42, 68, 96), mat(0x164f70, { roughness: .28, metalness: .08 }));
    water.name = 'estates-exterior-lake-ring'; water.rotation.x = -Math.PI/2; water.position.y = -.1; preview.add(water);
    const island = new THREE.Mesh(new THREE.CircleGeometry(41, 96), mat(0x526d3b));
    island.name = 'estates-exterior-island'; island.rotation.x = -Math.PI/2; island.position.y = .02; preview.add(island);
    const add = (name, x, y, z, w, h, d, color) => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w,h,d), mat(color));
      mesh.name = name; mesh.position.set(x,y,z); preview.add(mesh); return mesh;
    };
    // Tiny, recognizable roofline silhouettes communicate a lived-in neighborhood without
    // exposing full lot/building detail until the player enters the Estates instance.
    add('estates-preview-community-hall', 0, 1.1, 2, 5.5, 2.2, 4.5, 0xd1c3a2);
    add('estates-preview-hall-roof', 0, 2.45, 2, 6, .45, 5, 0x49352a);
    add('estates-preview-lakeside-home', -14, .8, -9, 3.2, 1.6, 3, 0xb59a76);
    add('estates-preview-lakeside-roof', -14, 1.8, -9, 3.6, .35, 3.4, 0x49352a);
    add('estates-preview-east-home', 14, .75, 10, 3, 1.5, 3, 0x9e8466);
    add('estates-preview-east-roof', 14, 1.65, 10, 3.4, .3, 3.4, 0x49352a);
    for (const [i,x,z] of [[1,-25,-18],[2,25,-15],[3,-24,19],[4,25,22]]) {
      const tree = new THREE.Mesh(new THREE.ConeGeometry(2.4, 7, 7), mat(0x31563a));
      tree.name = 'estates-preview-tree-'+i; tree.position.set(x,3.5,z); preview.add(tree);
    }
    scene.add(preview);
    return { preview, dispose() {
      scene.remove(preview);
      preview.traverse?.(node => {
        node.geometry?.dispose?.();
        if (Array.isArray(node.material)) node.material.forEach(m=>m?.dispose?.()); else node.material?.dispose?.();
      });
    }};
  }
  const exterior = makeExteriorPreview();
  const setDetailedCommunityVisible = visible => {
    for (const child of root.children) child.visible = visible || Boolean(child.userData?.estatesExteriorVisible);
    exterior.preview.visible = !visible;
  };
  setDetailedCommunityVisible(false);

  let active = false, entering = false, instanceLeaseToken = null, activeInstanceId = null, activeVisitors = null, instanceHeartbeatTimer = null, returnAnchorTimer = null, presenceSocket = null, presenceSendTimer = null, presenceReconnectTimer = null, presenceStopped = true, presenceRetry = 0, lastPresenceSent = 0, nearCityGate = false, lastE = false, lastProperty = null, lastLandmarkId = null, disposed = false;
  const remotePeers = new Map();
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
      const f=moveX,s=moveZ, speed=runSpeed;
      return { delta:{
        x:(-Math.sin(yaw)*f+Math.cos(yaw)*s)*speed*dt,
        y:0,
        z:(-Math.cos(yaw)*f-Math.sin(yaw)*s)*speed*dt
      }};
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

  async function enterIsland() {
    if (disposed || active || entering) return;
    entering = true;
    hidePanel();
    try {
      const response = await fetch(estatesServerBase() + '/api/estates/instance/enter', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ clientId: estateClientSessionId(), entranceId: 'estates-island-entrance' })
      });
      let admission = null;
      try { admission = await response.json(); } catch {}
      if (!response.ok || !admission?.ok || typeof admission.leaseToken !== 'string' || typeof admission.instanceId !== 'string') {
        throw new Error(admission?.error || 'instance_admission_failed');
      }
      if (disposed) { void releaseEstatesInstanceLease(admission.leaseToken); return; }
      instanceLeaseToken = admission.leaseToken;
      activeInstanceId = admission.instanceId;
      const savedAnchor = await readSavedReturnAnchor(controllerRef.navigation);
      if (disposed) { instanceLeaseToken = null; activeInstanceId = null; await releaseEstatesInstanceLease(admission.leaseToken); return; }
      activeVisitors = Number.isSafeInteger(admission.activeVisitors) ? admission.activeVisitors : null;
      active=true; nearCityGate=false;
      startInstanceLeaseHeartbeat();
      if (returnAnchorTimer !== null) clearInterval(returnAnchorTimer);
      returnAnchorTimer = setInterval(() => {
        if (!active || disposed) return;
        void saveReturnAnchor({ x: player.pos.x - OFFSET_X, y: player.pos.y, z: player.pos.z, r: getYaw() }, controllerRef.navigation);
      }, 15_000);
      connectEstatesPresence(instanceLeaseToken);
      setDetailedCommunityVisible(true);
      if(getMode()!=='explore') setMode('explore');
      const spawn = savedAnchor || ISLAND_SPAWN;
      player.pos.set(OFFSET_X+spawn.x,spawn.y,spawn.z);
      player.fp=false;
      setYaw(savedAnchor ? savedAnchor.r : -Math.PI/2);
      player.vel?.set(0,0,0); player.onGround=true; player.climb=null; player.spawned=1;
      avatar.position.copy(player.pos);
      onStatus({state:'entered-public-island',instanceId:activeInstanceId,activeVisitors,catalogProperties:catalog.properties?.length??0,lotAnchors:manifest.lots.length});
    } catch (error) {
      showPanel('ESTATES CONNECTION FAILED','The shared island could not be reached. Your city position has not changed.',
        [{label:'Retry entry',primary:true,run:enterIsland},{label:'Not now',run:hidePanel}],
        'The entry lease is requested from the server before the community is revealed.');
      onStatus({state:'entry-failed',message:String(error?.message||error)});
    } finally {
      entering = false;
    }
  }
  function leaveIsland() {
    if(disposed||!active)return;
    void saveReturnAnchor({ x: player.pos.x - OFFSET_X, y: player.pos.y, z: player.pos.z, r: getYaw() }, controllerRef.navigation);
    active=false; hidePanel(); controllerRef.dispose();
    if (instanceHeartbeatTimer !== null) { clearInterval(instanceHeartbeatTimer); instanceHeartbeatTimer = null; }
    if (returnAnchorTimer !== null) { clearInterval(returnAnchorTimer); returnAnchorTimer = null; }
    stopPresence();
    setDetailedCommunityVisible(false);
    const leaseToken=instanceLeaseToken;
    instanceLeaseToken=null; activeInstanceId=null; activeVisitors=null;
    void releaseEstatesInstanceLease(leaseToken);
    // Rotate the per-tab session key after exit so a fast re-entry cannot race the release.
    localEstateSessionId = null;
    try { sessionStorage.removeItem('bcEstatesIslandSession'); } catch {}
    player.pos.set(CITY_GATE.x,CITY_GATE.y,CITY_GATE.z);
    setYaw(Math.PI/2);
    player.vel?.set(0,0,0); player.onGround=true; player.climb=null; player.spawned=1;
    avatar.position.copy(player.pos);
    onStatus({state:'returned-to-city'});
  }
  function removeRemotePeer(id) {
    const peer = remotePeers.get(id);
    if (!peer) return;
    root.remove(peer.mesh);
    peer.mesh.traverse?.(node => {
      node.geometry?.dispose?.();
      if (Array.isArray(node.material)) node.material.forEach(m=>m?.dispose?.()); else node.material?.dispose?.();
    });
    remotePeers.delete(id);
  }
  function setRemotePeer(id, position) {
    if (!Number.isSafeInteger(Number(id)) || !position || ![position.x,position.y,position.z,position.r].every(finite)) return;
    const peerId = Number(id);
    let peer = remotePeers.get(peerId);
    if (!peer) {
      const mesh = new THREE.Group();
      mesh.name = 'estates-remote-player-' + peerId;
      const bodyMaterial = new THREE.MeshStandardMaterial({color:0x9d5bff,roughness:.72});
      const headMaterial = new THREE.MeshStandardMaterial({color:0xffd3a2,roughness:.8});
      const body = new THREE.Mesh(new THREE.CylinderGeometry(.28,.34,.9,8),bodyMaterial);
      body.position.y=.78; body.castShadow=true;
      const head = new THREE.Mesh(new THREE.SphereGeometry(.2,10,8),headMaterial);
      head.position.y=1.42; head.castShadow=true;
      mesh.add(body,head); root.add(mesh);
      peer = {mesh,target:{x:0,y:0,z:0,r:0}};
      remotePeers.set(peerId,peer);
    }
    peer.target = {x:position.x,y:position.y,z:position.z,r:position.r};
    if (remotePeers.size > 40) removeRemotePeer(remotePeers.keys().next().value);
  }
  function clearRemotePeers() {
    for (const id of [...remotePeers.keys()]) removeRemotePeer(id);
  }
  function stopPresence() {
    presenceStopped = true;
    if (presenceSendTimer !== null) { clearInterval(presenceSendTimer); presenceSendTimer = null; }
    if (presenceReconnectTimer !== null) { clearTimeout(presenceReconnectTimer); presenceReconnectTimer = null; }
    const socket = presenceSocket; presenceSocket = null;
    if (socket && socket.readyState < 2) { socket.onclose = null; try { socket.close(1000,'left_estates'); } catch {} }
    clearRemotePeers();
  }
  function connectEstatesPresence(leaseToken) {
    stopPresence();
    presenceStopped = false;
    presenceRetry = 0;
    const connect = () => {
      if (presenceStopped || disposed || !active || instanceLeaseToken !== leaseToken) return;
      try {
        const base = new URL(estatesServerBase());
        base.protocol = base.protocol === 'https:' ? 'wss:' : 'ws:';
        base.pathname = '/';
        base.search = '';
        base.searchParams.set('mode','estates');
        base.searchParams.set('lease',leaseToken);
        const socket = new WebSocket(base.toString());
        presenceSocket = socket;
        socket.onopen = () => {
          if (presenceSocket !== socket || presenceStopped) { socket.close(); return; }
          presenceRetry = 0;
          if (presenceSendTimer !== null) clearInterval(presenceSendTimer);
          presenceSendTimer = setInterval(() => {
            if (socket.readyState !== WebSocket.OPEN || !active || presenceSocket !== socket) return;
            const now = performance.now();
            if (now - lastPresenceSent < 90) return;
            lastPresenceSent = now;
            socket.send(JSON.stringify({t:'p',x:player.pos.x-OFFSET_X,y:player.pos.y,z:player.pos.z,r:getYaw()}));
          },100);
          onStatus({state:'presence-connected',instanceId:activeInstanceId});
        };
        socket.onmessage = event => {
          let message; try { message = JSON.parse(event.data); } catch { return; }
          if (!message || typeof message !== 'object') return;
          if (message.t === 'w' && message.instanceId === activeInstanceId && Array.isArray(message.peers)) {
            clearRemotePeers();
            for (const peer of message.peers) setRemotePeer(peer.id,peer);
          } else if ((message.t === 'j' || message.t === 'p') && Number.isSafeInteger(message.id)) {
            setRemotePeer(message.id,message);
          } else if (message.t === 'l') removeRemotePeer(message.id);
          else if (message.t === 'e') onStatus({state:'presence-rejected',message:message.e});
        };
        socket.onerror = () => {};
        socket.onclose = event => {
          if (presenceSocket === socket) presenceSocket = null;
          if (presenceSendTimer !== null) { clearInterval(presenceSendTimer); presenceSendTimer = null; }
          clearRemotePeers();
          if (presenceStopped || disposed || !active || instanceLeaseToken !== leaseToken) return;
          if (event.code === 1008) { onStatus({state:'presence-rejected',message:'invalid_or_expired_lease'}); return; }
          presenceRetry += 1;
          const delay = Math.min(8000, 750 * (2 ** Math.min(4,presenceRetry-1)));
          presenceReconnectTimer = setTimeout(connect,delay);
          onStatus({state:'presence-reconnecting',delay});
        };
      } catch (error) {
        if (!presenceStopped && active && instanceLeaseToken === leaseToken) {
          presenceReconnectTimer = setTimeout(connect,2000);
          onStatus({state:'presence-error',message:String(error?.message||error)});
        }
      }
    };
    connect();
  }
  function updateRemotePeerMeshes(dt) {
    const alpha = 1 - Math.exp(-Math.max(0,Math.min(.1,dt)) * 12);
    for (const peer of remotePeers.values()) {
      peer.mesh.position.x += (peer.target.x-peer.mesh.position.x)*alpha;
      peer.mesh.position.y += (peer.target.y-peer.mesh.position.y)*alpha;
      peer.mesh.position.z += (peer.target.z-peer.mesh.position.z)*alpha;
      let delta = peer.target.r - peer.mesh.rotation.y;
      while (delta > Math.PI) delta -= Math.PI*2;
      while (delta < -Math.PI) delta += Math.PI*2;
      peer.mesh.rotation.y += delta*alpha;
    }
  }
  function startInstanceLeaseHeartbeat() {
    if (instanceHeartbeatTimer !== null) clearInterval(instanceHeartbeatTimer);
    instanceHeartbeatTimer = setInterval(async () => {
      const leaseToken = instanceLeaseToken;
      if (!leaseToken || !active || disposed) return;
      try {
        const response = await fetch(estatesServerBase() + '/api/estates/instance/heartbeat', {
          method: 'POST', headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ leaseToken })
        });
        if (response.status === 410 && active && instanceLeaseToken === leaseToken) {
          onStatus({state:'instance-lease-expired',instanceId:activeInstanceId});
          leaveIsland();
        }
      } catch { /* The server expires stale leases; the next heartbeat retries. */ }
    }, 25_000);
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
    updateRemotePeerMeshes(dt);
    // Rebuild controller after its previous instance was disposed on exit.
    if(!controllerRef.isActive) {
      controllerRef=createEstatesIslandController({
        manifest,actor:localActor,camera:localCamera,
        input:({dt,yaw,moveX,moveZ})=>({delta:{
          x:(-Math.sin(yaw)*moveX+Math.cos(yaw)*moveZ)*runSpeed*dt,
          y:0,z:(-Math.cos(yaw)*moveX-Math.sin(yaw)*moveZ)*runSpeed*dt
        }}),
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
    dispose(){
      if(disposed)return false; disposed=true; hidePanel(); controllerRef.dispose(); if (instanceHeartbeatTimer !== null) { clearInterval(instanceHeartbeatTimer); instanceHeartbeatTimer = null; } stopPresence(); void releaseEstatesInstanceLease(instanceLeaseToken); instanceLeaseToken=null; renderer.dispose(); exterior.dispose();
      for(const mat of root.userData.estatesBridgeMaterials??[])mat.dispose?.();
      onStatus({state:'disposed'}); return true;
    },
    get active(){return active;},
    get manifest(){return manifest;}
  });
  window.__estatesIslandLive=api;
  onStatus({state:'ready',catalogProperties:catalog.properties?.length??0,lotAnchors:manifest.lots.length,publicTraversal:true,privateAccess:'permission-gated',instanceLifecycle:'server-leased',instanceId:'assigned-on-entry'});
  return api;
}
