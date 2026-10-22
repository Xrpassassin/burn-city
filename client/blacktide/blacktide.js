import * as THREE from 'three';
import { sampleOceanHeight, updateOceanGeometry } from './ocean.js';
import * as Trade from './trade.js';
import * as Boats from './boats.js';
import * as Combat from './combat.js';
import * as CannonAI from './cannon-ai.js';

const $ = id => document.getElementById(id);
const game = $('game');
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x071827);
scene.fog = new THREE.FogExp2(0x071827, 0.00145);
const camera = new THREE.PerspectiveCamera(58, innerWidth / innerHeight, 0.1, 2400);
camera.position.set(0, 20, 34);
const renderer = new THREE.WebGLRenderer({antialias: !matchMedia('(pointer:coarse)').matches, powerPreference:'high-performance'});
renderer.setPixelRatio(Math.min(devicePixelRatio || 1, matchMedia('(pointer:coarse)').matches ? 1.35 : 1.8));
renderer.setSize(innerWidth, innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15;
renderer.domElement.setAttribute('aria-label','3D Blacktide ocean scene');
game.prepend(renderer.domElement);

scene.add(new THREE.HemisphereLight(0x8dbbd7, 0x101d25, 1.2));
const moon = new THREE.DirectionalLight(0x9cc8ed, 2.1);
moon.position.set(-120, 180, 90);
scene.add(moon);
const ember = new THREE.PointLight(0xff6233, 120, 240);
ember.position.set(-8, 13, -28);
scene.add(ember);

const COARSE = matchMedia('(pointer:coarse)').matches;
const waterGeo = new THREE.PlaneGeometry(1800, 1800, COARSE ? 64 : 100, COARSE ? 64 : 100); // phones: ~40% of the per-frame wave/normal CPU work
waterGeo.rotateX(-Math.PI / 2);
const basePositions = waterGeo.attributes.position.array.slice();
const waterMat = new THREE.MeshStandardMaterial({color:0x103e55, roughness:.32, metalness:.26, flatShading:false});
const ocean = new THREE.Mesh(waterGeo, waterMat);
ocean.position.y = -0.9;
scene.add(ocean);

const horizon = new THREE.Mesh(new THREE.SphereGeometry(1100, 32, 20), new THREE.MeshBasicMaterial({color:0x0a1d2a, side:THREE.BackSide}));
horizon.position.y = -30;
scene.add(horizon);

const rand = (seed => () => (seed = (seed * 16807) % 2147483647) / 2147483647)(8317);
function makeIsland(x,z,scale=1){
  const group = new THREE.Group();
  const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(8*scale,1),new THREE.MeshStandardMaterial({color:0x303b38,roughness:1,flatShading:true}));
  rock.scale.set(1.25,.65,1.05); rock.position.y=1.5*scale; group.add(rock);
  const sand = new THREE.Mesh(new THREE.CylinderGeometry(5.8*scale,7.4*scale,1.2*scale,9),new THREE.MeshStandardMaterial({color:0x8c7755,roughness:1}));
  sand.position.y=.25*scale; group.add(sand);
  for(let i=0;i<5;i++){
    const tree = new THREE.Group();
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(.12*scale,.22*scale,2.4*scale,5),new THREE.MeshStandardMaterial({color:0x4c3426}));
    trunk.position.y=1.3*scale; tree.add(trunk);
    const crown = new THREE.Mesh(new THREE.ConeGeometry(1.05*scale,3.4*scale,5),new THREE.MeshStandardMaterial({color:i%2?0x28483c:0x365642,flatShading:true}));
    crown.position.y=3.4*scale; tree.add(crown);
    const a=rand()*Math.PI*2,r=rand()*4*scale;tree.position.set(Math.cos(a)*r,0,Math.sin(a)*r);group.add(tree);
  }
  group.position.set(x,0,z);scene.add(group);return group;
}
makeIsland(-56,-84,1.6); makeIsland(68,-142,2.1); makeIsland(120,40,1.2); makeIsland(-135,115,1.8); makeIsland(18,-260,2.5);

function mat(color,roughness=.75,metalness=0){return new THREE.MeshStandardMaterial({color,roughness,metalness,flatShading:true})}
const ship = new THREE.Group();
const hull = new THREE.Mesh(new THREE.CapsuleGeometry(1.7,5.5,4,8),mat(0x42291e));
hull.rotation.x=Math.PI/2; hull.scale.set(1,.75,1); hull.position.y=.15; ship.add(hull);
const deck = new THREE.Mesh(new THREE.BoxGeometry(3.1,.42,5.4),mat(0x775038));
deck.position.y=.78; ship.add(deck);
const mast = new THREE.Mesh(new THREE.CylinderGeometry(.16,.22,8,7),mat(0x4b3020));
mast.position.set(0,4.6,-.2); ship.add(mast);
const sail = new THREE.Mesh(new THREE.PlaneGeometry(4.6,4.4),new THREE.MeshStandardMaterial({color:0xc9c1a7,side:THREE.DoubleSide,roughness:1}));
sail.position.set(0,5.5,-.35); ship.add(sail);
const sail2 = new THREE.Mesh(new THREE.PlaneGeometry(2.8,2.2),new THREE.MeshStandardMaterial({color:0x292e34,side:THREE.DoubleSide,roughness:1}));
sail2.position.set(0,7.1,-.3); ship.add(sail2);
const bow = new THREE.Mesh(new THREE.ConeGeometry(.75,2.2,5),mat(0x4b2f21));
bow.rotation.x=Math.PI/2;bow.position.set(0,.25,-4);ship.add(bow);
for(const side of [-1,1]) for(let i=0;i<3;i++){
  const cannon=new THREE.Mesh(new THREE.CylinderGeometry(.13,.16,.65,7),mat(0x171a1c,.4,.7));
  cannon.rotation.z=Math.PI/2;cannon.position.set(side*1.55,.75,1.5-i*1.7);ship.add(cannon);
}
ship.position.set(0,0,0);scene.add(ship);

// Three procedural NPC vessels provide visible traffic before combat is enabled.
const fleet = Boats.createFleet(THREE, scene);

const stars = new THREE.BufferGeometry();
const starPositions = new Float32Array(700*3);
for(let i=0;i<700;i++){starPositions[i*3]=(rand()-.5)*1200;starPositions[i*3+1]=60+rand()*260;starPositions[i*3+2]=(rand()-.5)*1200}
stars.setAttribute('position',new THREE.BufferAttribute(starPositions,3));
scene.add(new THREE.Points(stars,new THREE.PointsMaterial({color:0xc2d8ed,size:1.1,transparent:true,opacity:.7})));

const keys = new Set();
const controls = {left:false,right:false,forward:false,back:false,fire:false};
let started=false, speed=0, heading=0, hullHealth=100, lastShot=0, elapsed=0;
const projectiles=[];
const enemyProjectiles=[];
addEventListener('keydown',e=>{if(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight',' ','Space'].includes(e.key))e.preventDefault();keys.add(e.key.toLowerCase());if(e.code==='Space')fireBroadside()});
addEventListener('keyup',e=>keys.delete(e.key.toLowerCase()));
addEventListener('blur',()=>keys.clear());
$('begin').addEventListener('click',()=>{started=true;$('intro').classList.add('started');$('message').textContent='The Ashen Wake is yours. Steer clear of the reefs and explore the islands.'});
document.querySelectorAll('[data-control]').forEach(button=>{
  const name=button.dataset.control;
  const on=e=>{e.preventDefault();controls[name]=true;if(name==='fire')fireBroadside()};
  const off=e=>{e.preventDefault();controls[name]=false};
  button.addEventListener('pointerdown',on);button.addEventListener('pointerup',off);button.addEventListener('pointercancel',off);button.addEventListener('pointerleave',off);
});

function fireBroadside(){
  if(!started||hullHealth<=0||performance.now()-lastShot<650)return;
  lastShot=performance.now();
  const direction=new THREE.Vector3(Math.sin(heading),0,-Math.cos(heading));
  for(const side of [-1,1]){
    const p=new THREE.Mesh(new THREE.SphereGeometry(.19,8,6),new THREE.MeshBasicMaterial({color:0xffa15c}));
    const lateral=new THREE.Vector3(Math.cos(heading)*side*2,0,Math.sin(heading)*side*2);
    p.position.copy(ship.position).add(lateral);p.position.y=1;
    p.userData.velocity=direction.clone().multiplyScalar(70).add(lateral.clone().multiplyScalar(5));
    p.userData.life=2.2;scene.add(p);projectiles.push(p);
  }
  $('message').textContent='Broadside away! The guns will need a moment to reload.';
}

const clock=new THREE.Clock();
function tick(){
  requestAnimationFrame(tick);
  const dt=Math.min(clock.getDelta(),.1); // Clamp large frame gaps to keep controls stable on slower devices.
  elapsed+=dt;
  updateOceanGeometry(waterGeo,basePositions,elapsed);
  Boats.updateFleet(fleet,dt,elapsed,sampleOceanHeight,started,started?ship.position:null);
  if (started) {
    const cannonShots = CannonAI.updateNpcCannons(fleet, ship.position, dt);
    for (const boat of fleet) {
      if (!boat.alive || boat.kind !== 'patrol') continue;
      const winding = (boat.cannonWindup || 0) > 0;
      if (winding && !boat.warningLamp) {
        boat.warningLamp = new THREE.Mesh(
          new THREE.SphereGeometry(0.32, 8, 6),
          new THREE.MeshBasicMaterial({ color: 0xff2118 })
        );
        boat.warningLamp.position.set(0, 6.45, 0);
        boat.group.add(boat.warningLamp);
      }
      if (boat.warningLamp) boat.warningLamp.visible = winding;
      if (winding && boat.cannonWindup > 0.7 && !boat._reportedWindup) {
        boat._reportedWindup = true;
        $('message').textContent = 'Enemy patrol is lining up a broadside — turn hard to evade!';
      }
      if (!winding) boat._reportedWindup = false;
    }
    for (const shot of cannonShots) {
      const ball = new THREE.Mesh(
        new THREE.SphereGeometry(0.28, 8, 6),
        new THREE.MeshBasicMaterial({ color: 0xff493b })
      );
      ball.position.set(shot.x, 1.25, shot.z);
      ball.userData = { vx: shot.vx, vz: shot.vz, life: shot.life, damage: shot.damage, sourceId: shot.sourceId };
      scene.add(ball);
      enemyProjectiles.push(ball);
    }
  }
  if(started){
    const atPort=Trade.tick(ship.position);   // docked: helm locked while the port panel is open
    if(atPort)speed=0;
    const forward=!atPort&&hullHealth>0&&(keys.has('w')||keys.has('arrowup')||controls.forward);
    const back=!atPort&&hullHealth>0&&(keys.has('s')||keys.has('arrowdown')||controls.back);
    const left=!atPort&&hullHealth>0&&(keys.has('a')||keys.has('arrowleft')||controls.left);
    const right=!atPort&&hullHealth>0&&(keys.has('d')||keys.has('arrowright')||controls.right);
    if(forward)speed=Math.min(20,speed+dt*4.6);
    else if(back)speed=Math.max(-4,speed-dt*6);
    else speed*=Math.pow(.985,dt*60);
    if(left)heading+=dt*(.65+Math.abs(speed)*.035);
    if(right)heading-=dt*(.65+Math.abs(speed)*.035);
    ship.rotation.y=heading;
    ship.position.x+=Math.sin(heading)*speed*dt;
    ship.position.z-=Math.cos(heading)*speed*dt;
    ship.position.y=sampleOceanHeight(ship.position.x,ship.position.z,elapsed)+.08;
    sail.rotation.y=Math.sin(elapsed*.7)*.035;
    const forwardVec=new THREE.Vector3(Math.sin(heading),0,-Math.cos(heading));
    const camTarget=ship.position.clone().add(new THREE.Vector3(0,5,0)).add(forwardVec.clone().multiplyScalar(-20));
    camera.position.lerp(camTarget,1-Math.pow(.001,dt));
    camera.lookAt(ship.position.clone().add(forwardVec.clone().multiplyScalar(7)).add(new THREE.Vector3(0,3,0)));
    $('speed').textContent=Math.round(Math.abs(speed)*2.1)+' knots';
    $('heading').textContent=String((Math.round((heading*180/Math.PI%360+360)%360))).padStart(3,'0')+'°';
    if(Math.abs(ship.position.x)>870||Math.abs(ship.position.z)>870){ship.position.x=THREE.MathUtils.clamp(ship.position.x,-870,870);ship.position.z=THREE.MathUtils.clamp(ship.position.z,-870,870);speed*=.4;$('message').textContent='The charts end here. Turn back toward known waters.'}
    for(const p of projectiles){
      p.position.addScaledVector(p.userData.velocity,dt);
      p.userData.life-=dt;
      const target=Combat.findProjectileTarget(p,fleet);
      if(target){
        const result=Combat.applyCannonDamage(target);
        p.userData.life=0;
        if(result.sunk){
          Boats.removeVessel(scene,target);
          $('message').textContent='Enemy vessel sunk. (Prototype: no loot or server reward yet.)';
        }else{
          $('message').textContent='Cannon hit on '+target.kind+' vessel — hull '+result.remaining+'/'+target.maxHealth+'.';
        }
      }
      if(p.userData.life<=0){scene.remove(p);p.geometry.dispose();p.material.dispose()}
    }
    for(let i=projectiles.length-1;i>=0;i--)if(projectiles[i].userData.life<=0)projectiles.splice(i,1);
    for (let i = enemyProjectiles.length - 1; i >= 0; i--) {
      const p = enemyProjectiles[i];
      p.position.x += p.userData.vx * dt;
      p.position.z += p.userData.vz * dt;
      p.userData.life -= dt;
      const hit = CannonAI.projectileHitsPlayer(p.position, ship);
      if (hit) {
        hullHealth = Math.max(0, hullHealth - p.userData.damage);
        $('hull').textContent = hullHealth + '%';
        $('message').textContent = hullHealth > 0
          ? 'Enemy broadside hit! Hull integrity ' + hullHealth + '%. Keep moving to evade the next volley.'
          : 'Your hull is broken. The Ashen Wake is disabled — this prototype has no repair or respawn loop yet.';
        if (hullHealth === 0) speed = 0;
        p.userData.life = 0;
      }
      if (p.userData.life <= 0) {
        scene.remove(p);
        p.geometry.dispose();
        p.material.dispose();
        enemyProjectiles.splice(i, 1);
      }
    }
  }else{
    camera.position.x=Math.sin(elapsed*.07)*3;
    camera.position.y=20+Math.sin(elapsed*.2)*.8;
    camera.position.z=34;
    camera.lookAt(0,2,-15);
    ship.rotation.y=Math.sin(elapsed*.15)*.06;
    ship.position.y=Math.sin(elapsed*1.3)*.12;
  }
  renderer.render(scene,camera);
}
// Portrait phones: keep the horizontal FOV >= 66 deg (a fixed 58 deg vertical FOV gave ~28 deg across = ship fills the screen).
function fitView(){const a=innerWidth/innerHeight;camera.aspect=a;const minH=66*Math.PI/180;camera.fov=Math.max(58,2*Math.atan(Math.tan(minH/2)/a)*180/Math.PI);camera.updateProjectionMatrix()}
fitView();
addEventListener('orientationchange',()=>setTimeout(fitView,250));
addEventListener('resize',()=>{fitView();renderer.setSize(innerWidth,innerHeight);renderer.setPixelRatio(Math.min(devicePixelRatio||1,matchMedia('(pointer:coarse)').matches?1.35:1.8))});
// Test hook (?bttest or ?debug=1 only): read-only ship/camera/renderer state for smoke tests.
if(/[?&](bttest|debug=1)/.test(location.search))window.__bt={
  state:()=>({started,speed,heading,x:ship.position.x,z:ship.position.z,cam:camera.position.toArray(),proj:projectiles.length,shots:lastShot,boats:fleet.filter(b=>b.alive).map(b=>({id:b.id,kind:b.kind,x:b.group.position.x,z:b.group.position.z,health:b.health}))}),
  trade:Trade.test,
  tp:(x,z,h)=>{ship.position.x=x;ship.position.z=z;if(h!=null)heading=h;speed=0},
  info:()=>({calls:renderer.info.render.calls,tris:renderer.info.render.triangles,geos:renderer.info.memory.geometries,dpr:renderer.getPixelRatio()})
};
Trade.init(scene);
tick();