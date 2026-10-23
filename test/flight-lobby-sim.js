const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const Flight = require('../server/flight-lobby');

class FakeSocket extends EventEmitter {
  constructor(){super();this.readyState=1;this.sent=[]}
  send(raw){this.sent.push(JSON.parse(raw))}
  close(code=1000,reason='closed'){if(this.readyState!==1)return;this.readyState=3;this.emit('close',code,Buffer.from(reason))}
  message(data){this.emit('message',Buffer.from(JSON.stringify(data)))}
  last(event){return this.sent.filter(x=>x.e===event).at(-1)}
}
const url=(map,name)=>new URL('ws://localhost/?mode=flight&map='+map+'&name='+name);
Flight.resetForTests();
const a=new FakeSocket();Flight.attach(a,url('refinery','Alpha'));
assert.equal(a.last('flight_joined').map,'refinery');
a.message({t:'ready',ready:true});
const room=a.flightPlayer.room;
assert.ok(room.countdownAt,'first ready passenger starts the shared countdown');
const b=new FakeSocket();Flight.attach(b,url('refinery','Bravo'));
assert.equal(b.flightPlayer.room,room,'same-map players share one departure queue');
assert.equal(room.countdownAt,null,'a late passenger resets countdown until everyone is ready');
b.message({t:'ready',ready:true});
assert.ok(room.countdownAt,'countdown restarts when all passengers are ready');
assert.equal(room.lastSecond,null,'a fresh shared countdown starts after the roster changes');
Flight._tick(room,room.countdownAt);
assert.equal(a.last('flight_depart').map,'refinery');
assert.equal(b.last('flight_depart').map,'refinery');
assert.equal(room.departed,true);
Flight.resetForTests();
const c=new FakeSocket();Flight.attach(c,url('random','Charlie'));
assert.equal(c.last('flight_joined').map,'random');
Flight.resetForTests();
console.log('Shared helicopter flight lobby checks passed.');
