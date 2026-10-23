// Shared airport departure queue for unranked Zombies. The server owns readiness and countdown.
const COUNTDOWN_MS = 10000, MAX_PARTY = 8;
const rooms = new Map();
let nextRoom = 1, nextPlayer = 1;
const clean = (s, n=16) => String(s || '').replace(/[^\w .-]/g, '').trim().slice(0,n) || 'Runner';
const safeSend = (ws, data) => { if (ws.readyState === 1) { try { ws.send(JSON.stringify(data)); } catch {} } };
function publicState(room) {
  return { e:'flight_state', roomId:room.id, map:room.map, state:room.departed?'departed':'boarding',
    players:[...room.players.values()].map(p=>({id:p.id,name:p.name,ready:p.ready})),
    countdownAt:room.countdownAt || null, serverNow:Date.now(), max:MAX_PARTY };
}
function broadcast(room) { const state=publicState(room); for(const p of room.players.values()) safeSend(p.ws,state); }
function clearCountdown(room) { room.countdownAt=null; room.lastSecond=null; if(room.timer){clearInterval(room.timer);room.timer=null;} }
function allReady(room) { return room.players.size>0 && [...room.players.values()].every(p=>p.ready); }
function armCountdown(room) {
  if(room.departed)return;
  if(!allReady(room)){clearCountdown(room);broadcast(room);return;}
  if(!room.countdownAt){room.countdownAt=Date.now()+COUNTDOWN_MS;room.lastSecond=null;}
  if(!room.timer) room.timer=setInterval(()=>tick(room),200);
  broadcast(room);
}
function tick(room, now=Date.now()) {
  if(room.departed||!room.countdownAt)return;
  if(!allReady(room)){clearCountdown(room);broadcast(room);return;}
  if(now>=room.countdownAt){
    room.departed=true;clearCountdown(room);
    const event={e:'flight_depart',map:room.map,roomId:room.id,departedAt:now};
    for(const p of room.players.values())safeSend(p.ws,event);
    const cleanup=setTimeout(()=>{for(const p of room.players.values()){try{p.ws.close(1000,'flight_departed')}catch{}}rooms.delete(room.key)},2500);cleanup.unref?.();
    return;
  }
  const second=Math.ceil((room.countdownAt-now)/1000);
  if(second!==room.lastSecond){room.lastSecond=second;broadcast(room);}
}
function remove(room,p) {
  if(!room.players.delete(p.id))return;
  if(!room.players.size){clearCountdown(room);rooms.delete(room.key);return;}
  armCountdown(room);
}
function attach(ws,url) {
  const map=url.searchParams.get('map')==='refinery'?'refinery':'random';
  // Keep multiple full parties for the same map instead of overwriting the map's room entry.
  let room=[...rooms.values()].find(r=>r.map===map&&!r.departed&&r.players.size<MAX_PARTY);
  if(!room){const id='flight-'+nextRoom++;room={id,key:id,map,players:new Map(),countdownAt:null,timer:null,departed:false};rooms.set(room.key,room);}
  // A late arrival joins the same queue, but departure waits for every connected member to ready again.
  if(room.countdownAt)clearCountdown(room);
  const p={id:nextPlayer++,name:clean(url.searchParams.get('name')),ready:false,ws,room};
  room.players.set(p.id,p);p.ws=ws;
  ws.flightPlayer=p;
  safeSend(ws,{e:'flight_joined',id:p.id,roomId:room.id,map:room.map});
  broadcast(room);
  ws.on('message',raw=>{
    if(raw.length>2048)return;
    let msg;try{msg=JSON.parse(raw.toString())}catch{return}
    if(!msg||typeof msg!=='object')return;
    if(msg.t==='ready'&&typeof msg.ready==='boolean'&&!room.departed){
      p.ready=msg.ready;armCountdown(room);
    }else if(msg.t==='leave'){remove(room,p);try{ws.close(1000,'left_flight_queue')}catch{}}
  });
  ws.on('close',()=>remove(room,p));
  ws.on('error',()=>remove(room,p));
}
function resetForTests(){for(const room of rooms.values())clearCountdown(room);rooms.clear();nextRoom=1;nextPlayer=1;}
module.exports={attach,resetForTests,_rooms:rooms,_tick:tick,COUNTDOWN_MS,MAX_PARTY};
