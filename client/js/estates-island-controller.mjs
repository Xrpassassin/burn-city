// Host bridge for the existing BURN City third-person controller and camera.
// The host owns input, avatar, renderer, UI, and authenticated entry/exit callbacks.
// This adapter resolves horizontal movement against the island navigation manifest,
// follows the player with a third-person camera, and emits property-interaction events.
import { createEstatesIslandNavigation } from './estates-island-navigation.mjs';

const finite = n => typeof n === 'number' && Number.isFinite(n);
function point(p,label) {
  if(!p||!finite(p.x)||!finite(p.y)||!finite(p.z)) throw new TypeError(label+' must have finite x/y/z');
}
function setVector(target,p) {
  if(target?.set) target.set(p.x,p.y,p.z);
  else if(target) { target.x=p.x;target.y=p.y;target.z=p.z; }
}
function lerp(a,b,t){return a+(b-a)*t;}

export function createEstatesIslandController({
  manifest,
  actor,
  camera,
  input,
  onPropertyPrompt=()=>{},
  onPropertyPromptClear=()=>{},
  onExitPrompt=()=>{},
  cameraLookAt,
  cameraDistance=7,
  cameraHeight=2.6,
  lookHeight=1.25,
  cameraSmoothing=12,
  interactionRadius=8
}={}) {
  if(!actor||!actor.position) throw new TypeError('actor with a position is required');
  if(!camera||!camera.position) throw new TypeError('camera with a position is required');
  if(typeof input!=='function') throw new TypeError('input callback is required');
  for(const [k,fn] of Object.entries({onPropertyPrompt,onPropertyPromptClear,onExitPrompt})) if(typeof fn!=='function') throw new TypeError(k+' must be a function');
  if(!finite(cameraDistance)||cameraDistance<2) throw new TypeError('cameraDistance must be at least 2');
  if(!finite(cameraHeight)||cameraHeight<0||!finite(lookHeight)||lookHeight<0) throw new TypeError('camera heights must be non-negative');
  if(!finite(cameraSmoothing)||cameraSmoothing<=0) throw new TypeError('cameraSmoothing must be positive');

  const navigation=createEstatesIslandNavigation({manifest});
  let active=true,lastPropertyKey=null,lastGate=false,elapsed=0;
  const cameraTarget={x:0,y:0,z:0};
  function actorPosition(){return {x:actor.position.x,y:actor.position.y,z:actor.position.z};}
  function syncCamera(dt,yaw) {
    if(!finite(yaw)) return;
    const p=actorPosition();
    const desired={x:p.x+Math.sin(yaw)*cameraDistance,y:p.y+cameraHeight,z:p.z+Math.cos(yaw)*cameraDistance};
    const blend=1-Math.exp(-cameraSmoothing*Math.max(0,Math.min(.1,dt)));
    const c=camera.position;
    setVector(c,{x:lerp(c.x,desired.x,blend),y:lerp(c.y,desired.y,blend),z:lerp(c.z,desired.z,blend)});
    cameraTarget.x=p.x;cameraTarget.y=p.y+lookHeight;cameraTarget.z=p.z;
    if(typeof cameraLookAt==='function') cameraLookAt(cameraTarget);
    else if(typeof camera.lookAt==='function') camera.lookAt(cameraTarget.x,cameraTarget.y,cameraTarget.z);
  }
  function update({dt=0,yaw=0,moveX=0,moveZ=0,interactPressed=false,exitPressed=false}={}) {
    if(!active) return Object.freeze({active:false});
    if(!finite(dt)||dt<0||!finite(moveX)||!finite(moveZ)||!finite(yaw)) throw new TypeError('dt, yaw, and movement must be finite');
    point(actorPosition(),'actor position');
    const command=input({dt,yaw,moveX,moveZ,elapsed});
    // Input is an adapter contract: the host can supply world-space desired delta in metres.
    const dx=command?.delta?.x??moveX*dt,dz=command?.delta?.z??moveZ*dt;
    if(!finite(dx)||!finite(dz)) throw new TypeError('input delta must be finite');
    const moved=navigation.move(actorPosition(),{x:dx,y:0,z:dz});
    setVector(actor.position,moved.position);
    syncCamera(dt,yaw);
    elapsed+=dt;

    const property=navigation.nearbyProperty(moved.position,interactionRadius);
    const propertyKey=property?property.lotId+':'+(property.propertyId??'unassigned') : null;
    if(propertyKey!==lastPropertyKey) {
      if(property) onPropertyPrompt(property);
      else if(lastPropertyKey!==null) onPropertyPromptClear();
      lastPropertyKey=propertyKey;
    }
    if(interactPressed&&property) onPropertyPrompt({...property,confirmedInteraction:true});
    const nearGate=Math.hypot(moved.position.x+205,moved.position.z-188)<=7;
    if(nearGate!==lastGate) onExitPrompt({visible:nearGate,requiresConfirmation:true,action:'return-to-city'});
    if(exitPressed&&nearGate) onExitPrompt({visible:true,requiresConfirmation:true,action:'return-to-city',confirmedInteraction:true});
    lastGate=nearGate;
    return Object.freeze({active:true,position:moved.position,blockedX:moved.blockedX,blockedZ:moved.blockedZ,property,nearGate});
  }
  return Object.freeze({
    update,
    inspect(position=actorPosition()){return navigation.nearbyProperty(position,interactionRadius);},
    dispose(){if(!active)return false;active=false;onPropertyPromptClear();onExitPrompt({visible:false});return true;},
    get isActive(){return active;},
    get navigation(){return navigation;}
  });
}
