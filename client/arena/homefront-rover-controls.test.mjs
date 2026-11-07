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
  }};
  globalThis.document={hidden:false,createElement:()=>new FakeElement()};
  globalThis.setInterval=fn=>{const id=nextTimer++;clocks.set(id,fn);return id;};
  globalThis.clearInterval=id=>clocks.delete(id);
  const key=(name,code)=>{
    for(const cb of listeners.get(name)||[])cb({code,repeat:false,preventDefault(){},target:null});
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
  console.log('Homefront rover controls: authoritative sequence recovery, lost-driver disarm, and single-error retry passed');
}finally{
  globalThis.window=oldWindow;
  globalThis.document=oldDocument;
  globalThis.setInterval=oldSetInterval;
  globalThis.clearInterval=oldClearInterval;
}
