import assert from 'node:assert/strict';
import { createRoverControls } from './homefront-rover-controls.mjs';

class FakeElement {
  constructor(){this.style={};this.hidden=false;this.children=[];this.handlers=new Map();}
  setAttribute(){}
  addEventListener(name,cb){if(!this.handlers.has(name))this.handlers.set(name,[]);this.handlers.get(name).push(cb);}
  appendChild(el){this.children.push(el);return el;}
  remove(){}
}
const oldWindow=globalThis.window;
const oldDocument=globalThis.document;
const oldSetInterval=globalThis.setInterval;
const oldClearInterval=globalThis.clearInterval;
const listeners=new Map(),clocks=new Map();
let nextTimer=1;
try {
  globalThis.window={addEventListener(name,cb){
    if(!listeners.has(name))listeners.set(name,[]);
    listeners.get(name).push(cb);
  },removeEventListener(name,cb){listeners.set(name,(listeners.get(name)||[]).filter(fn=>fn!==cb));}};
  const docListeners=new Map();
  globalThis.document={hidden:false,createElement:()=>new FakeElement(),
    addEventListener:(name,cb)=>docListeners.set(name,cb),
    removeEventListener:(name,cb)=>{if(docListeners.get(name)===cb)docListeners.delete(name);}
  };
  globalThis.setInterval=fn=>{const id=nextTimer++;clocks.set(id,fn);return id;};
  globalThis.clearInterval=id=>clocks.delete(id);
  const key=(name,code,repeat=false)=>{
    for(const cb of listeners.get(name)||[])cb({code,repeat,preventDefault(){},target:null});
  };
  const input=async id=>{assert.ok(clocks.has(id),'the driver control clock remains installed');await clocks.get(id)();};
  const snap={vehicleEnabled:true,selfVehicle:{id:'rover:a',sequence:-1},self:{x:0,z:0}};
  let resyncs=0;
  const commands=[],errors=[];
  const controls=createRoverControls({
    host:new FakeElement(),getSnapshot:()=>snap,
    send:async(_action,body)=>{
      commands.push({...body});
      if(commands.length===1)throw Error('invalid_vehicle_input');
      return {vehicle:{id:'rover:a',sequence:body.sequence},self:{x:0,z:2}};
    },
    onSnapshot:result=>{snap.selfVehicle.sequence=result.vehicle.sequence;},
    onResync:async()=>{resyncs++;snap.selfVehicle.sequence=4;return snap;},
    onError:msg=>errors.push(msg)
  });
  assert.equal(clocks.size,1);
  let id=[...clocks.keys()][0];
  key('keydown','KeyW');
  await input(id);
  assert.equal(commands[0].sequence,0);
  assert.equal(resyncs,1,'a rejected sequence triggers one authenticated snapshot refresh');
  assert.equal(snap.selfVehicle.sequence,4);
  key('keydown','ArrowUp');
  await input(id);
  assert.equal(commands[1].sequence,5,'the next real input uses the authoritative sequence, not stale 0');
  assert.equal(snap.selfVehicle.sequence,5);
  assert.ok(errors.some(msg=>msg.includes('connection restored')));
  controls.stop();assert.equal(clocks.size,0);

  const snap2={vehicleEnabled:true,selfVehicle:{id:'rover:b',sequence:2}};
  let lost=0,sends=0;
  const second=createRoverControls({
    host:new FakeElement(),getSnapshot:()=>snap2,
    send:async()=>{sends++;throw Error('not_driving_vehicle');},
    onSnapshot:()=>{},
    onResync:async()=>{lost++;snap2.selfVehicle=null;return snap2;}
  });
  id=[...clocks.keys()][0];
  key('keydown','KeyW');
  await input(id);
  assert.equal(lost,1,'lost ownership rechecks server instead of retrying forged driver inputs');
  await input(id);
  assert.equal(sends,1,'controls are disabled after the authoritative driver disappears');
  second.stop();assert.equal(clocks.size,0);

  const snap3={vehicleEnabled:true,selfVehicle:{id:'rover:c',sequence:0}};
  let resynced=0,sends3=0;
  const third=createRoverControls({
    host:new FakeElement(),getSnapshot:()=>snap3,
    send:async(_action,body)=>{
      sends3++;
      if(sends3===1)throw Error('network_timeout');
      return {vehicle:{id:'rover:c',sequence:body.sequence}};
    },
    onSnapshot:res=>{snap3.selfVehicle.sequence=res.vehicle.sequence;},
    onResync:async()=>{resynced++;return snap3;}
  });
  id=[...clocks.keys()][0];
  key('keydown','KeyW');
  await input(id);
  await input(id);
  assert.equal(resynced,0,'single transient network error does not waste a resync');
  assert.equal(snap3.selfVehicle.sequence,1,'retries use the same sequence if the first command never committed');
  third.stop();
  let playing=true, lifecycleSends=0,finishDrive;
  const snap4={vehicleEnabled:true,selfVehicle:{id:'rover:d',sequence:-1}};
  const fourth=createRoverControls({host:new FakeElement(),getSnapshot:()=>snap4,
    visible:()=>playing,
    send:async(_action,body)=>{lifecycleSends++;return {vehicle:{id:'rover:d',sequence:body.sequence}};},
    onSnapshot:res=>{snap4.selfVehicle.sequence=res.vehicle.sequence;}
  });
  id=[...clocks.keys()][0];
  key('keydown','KeyW');await input(id);
  assert.equal(lifecycleSends,1);
  playing=false;fourth.sync();playing=true;await input(id);
  assert.equal(lifecycleSends,1,'reopening the scene cannot replay a held drive input');
  key('keydown','KeyW',true);await input(id);
  assert.equal(lifecycleSends,1,'OS key repeats after reopening cannot rearm a released control');
  key('keydown','KeyW');document.hidden=true;docListeners.get('visibilitychange')();
  document.hidden=false;await input(id);
  assert.equal(lifecycleSends,1,'backgrounding the phone releases all steering');
  key('keydown','KeyW');await input(id);
  assert.equal(lifecycleSends,2,'a new intentional press resumes driving');
  fourth.stop();
  assert.ok([...listeners.values()].every(list=>list.length===0),'stop removes global listeners');
  assert.equal(docListeners.size,0,'stop removes visibility listener');
  let staleSnapshots=0;
  const fifth=createRoverControls({host:new FakeElement(),getSnapshot:()=>snap4,
    send:()=>new Promise(resolve=>{finishDrive=resolve;}),onSnapshot:()=>staleSnapshots++});
  id=[...clocks.keys()][0];key('keydown','KeyW');
  const pending=input(id);fifth.stop();
  finishDrive({vehicle:{id:'rover:d',sequence:10}});await pending;
  assert.equal(staleSnapshots,0,'late acknowledgements cannot update an abandoned scene');
  console.log('Homefront rover controls: authoritative sequence recovery, lost-driver disarm, and single-error retry passed');
}finally{
  globalThis.window=oldWindow;
  globalThis.document=oldDocument;
  globalThis.setInterval=oldSetInterval;
  globalThis.clearInterval=oldClearInterval;
}
