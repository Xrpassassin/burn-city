'use strict';
// Chain-neutral authoritative room service. Deliberately does not import
// payments, NFTs, stores, estate ledgers, or chain SDKs.
function createRoomService({Room,roomSize=16,allowedModes=['zombie','tron']}={}){
  if(typeof Room!=='function')throw new TypeError('Room constructor required');
  const modes=new Set(allowedModes);
  const rooms=new Map();
  let nextId=1;
  function join(mode,player){
    if(!modes.has(mode))throw new Error('Unsupported room mode');
    if(!player||typeof player!=='object')throw new TypeError('Player required');
    const list=rooms.get(mode)||[];
    let room=list.find(r=>!r.full&&r.players.size<roomSize);
    if(!room){room=new Room(nextId++,mode);list.push(room);rooms.set(mode,list)}
    const id=room.add(player);
    return {room,id};
  }
  function remove(room,id){
    if(!room||typeof room.players?.delete!=='function')throw new TypeError('Invalid room');
    room.players.delete(id);
    if(room.players.size===0){
      const list=rooms.get(room.mode);
      if(list){const index=list.indexOf(room);if(index>=0)list.splice(index,1)}
    }
  }
  function snapshot(){return [...rooms.entries()].map(([mode,list])=>({
    mode,rooms:list.length,players:list.reduce((n,r)=>n+r.players.size,0)
  }))}
  return Object.freeze({join,remove,snapshot});
}
module.exports={createRoomService};
