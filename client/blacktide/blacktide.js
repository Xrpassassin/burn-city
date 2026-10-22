import * as THREE from 'three';

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

const waterGeo = new THREE.PlaneGeometry(1800, 1800, 100, 100);
waterGeo.rotateX(-Math.PI / 2);
const baseY = waterGeo.attributes.position.array.slice();
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

const stars = new THREE.BufferGeometry();
const starPositions = new Float32Array(700*3);
for(let i=0;i<700;i++){starPositions[i*3]=(rand()-.5)*1200;starPositions[i*3+1]=60+rand()*260;starPositions[i*3+2]=(rand()-.5)*1200}
stars.setAttribute('position',new THREE.BufferAttribute(starPositions,3));
scene.add(new THREE.Points(stars,new THREE.PointsMaterial({color:0xc2d8ed,size:1.1,transparent:true,opacity:.7})));

const keys = new Set();
const controls = {left:false,right:false,forward:false,back:false,fire:false};
let started=false, speed=0, heading=0, hullHealth=100, lastShot=0, elapsed=0;
const projectiles=[];
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
  if(!started||performance.now()-lastShot<650)return;
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
  const dt=Math.min(clock.getDelta(),.04);elapsed+=dt;
  const pos=waterGeo.attributes.position;
  for(let i=0;i<pos.count;i++){
    const x=baseY[i*3],z=baseY[i*3+2];
    pos.array[i*3+1]=Math.sin(x*.022+elapsed*1.3)*.24+Math.cos(z*.028-elapsed*1.1)*.18+Math.sin((x+z)*.012+elapsed*.7)*.12;
  }
  pos.needsUpdate=true;waterGeo.computeVertexNormals();
  if(started){
    const forward=keys.has('w')||keys.has('arrowup')||controls.forward;
    const back=keys.has('s')||keys.has('arrowdown')||controls.back;
    const left=keys.has('a')||keys.has('arrowleft')||controls.left;
    const right=keys.has('d')||keys.has('arrowright')||controls.right;
    if(forward)speed=Math.min(20,speed+dt*4.6);
    else if(back)speed=Math.max(-4,speed-dt*6);
    else speed*=Math.pow(.985,dt*60);
    if(left)heading+=dt*(.65+Math.abs(speed)*.035);
    if(right)heading-=dt*(.65+Math.abs(speed)*.035);
    ship.rotation.y=heading;
    ship.position.x+=Math.sin(heading)*speed*dt;
    ship.position.z-=Math.cos(heading)*speed*dt;
    ship.position.y=Math.sin(elapsed*2.1)*.13;
    sail.rotation.y=Math.sin(elapsed*.7)*.035;
    const forwardVec=new THREE.Vector3(Math.sin(heading),0,-Math.cos(heading));
    const camTarget=ship.position.clone().add(new THREE.Vector3(0,5,0)).add(forwardVec.clone().multiplyScalar(-20));
    camera.position.lerp(camTarget,1-Math.pow(.001,dt));
    camera.lookAt(ship.position.clone().add(forwardVec.clone().multiplyScalar(7)).add(new THREE.Vector3(0,3,0)));
    $('speed').textContent=Math.round(Math.abs(speed)*2.1)+' knots';
    $('heading').textContent=String((Math.round((heading*180/Math.PI%360+360)%360))).padStart(3,'0')+'°';
    if(Math.abs(ship.position.x)>870||Math.abs(ship.position.z)>870){ship.position.x=THREE.MathUtils.clamp(ship.position.x,-870,870);ship.position.z=THREE.MathUtils.clamp(ship.position.z,-870,870);speed*=.4;$('message').textContent='The charts end here. Turn back toward known waters.'}
    for(const p of projectiles){p.position.addScaledVector(p.userData.velocity,dt);p.userData.life-=dt;if(p.userData.life<=0){scene.remove(p);p.geometry.dispose();p.material.dispose()}}
    for(let i=projectiles.length-1;i>=0;i--)if(projectiles[i].userData.life<=0)projectiles.splice(i,1);
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
addEventListener('resize',()=>{camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight);renderer.setPixelRatio(Math.min(devicePixelRatio||1,matchMedia('(pointer:coarse)').matches?1.35:1.8))});
tick();