'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {createRoomService}=require('./room-service');
class FakeRoom{
 constructor(id,mode){this.id=id;this.mode=mode;this.players=new Map();this.next=1}
 get full(){return this.players.size>=2}
 add(player){const id=this.next++;this.players.set(id,player);return id}
}
test('reuses rooms, respects capacity and removes empty rooms',()=>{
 const svc=createRoomService({Room:FakeRoom,roomSize:2});
 const a=svc.join('zombie',{name:'a'});
 const b=svc.join('zombie',{name:'b'});
 const c=svc.join('zombie',{name:'c'});
 assert.equal(a.room,b.room);assert.notEqual(a.room,c.room);
 assert.deepEqual(svc.snapshot(),[{mode:'zombie',rooms:2,players:3}]);
 svc.remove(a.room,a.id);svc.remove(b.room,b.id);
 assert.deepEqual(svc.snapshot(),[{mode:'zombie',rooms:1,players:1}]);
});
test('rejects unsupported modes and malformed player data',()=>{
 const svc=createRoomService({Room:FakeRoom});
 assert.throws(()=>svc.join('xrpl-payment',{}));
 assert.throws(()=>svc.join('zombie',null));
});
