// Multiplayer hooks: clean player-state module + optional WebSocket client.
// Enable with ?ws=wss://your-host:8787 . Without it, everything runs single-player.
export class PlayerState{
  constructor(id=Math.random().toString(36).slice(2,10),name='runner-'+id.slice(0,4)){this.id=id;this.name=name;this.pos=[0,0,0];this.rotY=0;this.anim='idle';this.district='';this.t=0}
  set(pos,rotY,anim,district){this.pos=[+pos.x.toFixed(2),+pos.y.toFixed(2),+pos.z.toFixed(2)];this.rotY=+rotY.toFixed(3);this.anim=anim;this.district=district;this.t=Date.now()}
  toJSON(){return {id:this.id,name:this.name,pos:this.pos,rotY:this.rotY,anim:this.anim,district:this.district,t:this.t}}
}
export class NetClient{
  // Protocol (JSON): {type:'hello',state} {type:'state',state} {type:'chat',id,name,text} {type:'leave',id} {type:'peers',peers:[state]}
  constructor(url,state,{onPeer=()=>{},onLeave=()=>{},onChat=()=>{},onStatus=()=>{}}={}){
    this.url=url;this.state=state;this.h={onPeer,onLeave,onChat,onStatus};this.ws=null;this.timer=null;this.connect()}
  connect(){if(!this.url)return;try{this.ws=new WebSocket(this.url)}catch(e){this.h.onStatus('error');return}
    this.ws.onopen=()=>{this.h.onStatus('online');this.send({type:'hello',state:this.state});this.timer=setInterval(()=>this.send({type:'state',state:this.state}),100)};
    this.ws.onmessage=e=>{let m;try{m=JSON.parse(e.data)}catch{return}
      if(m.type==='state'&&m.state.id!==this.state.id)this.h.onPeer(m.state);
      else if(m.type==='peers')m.peers.forEach(p=>p.id!==this.state.id&&this.h.onPeer(p));
      else if(m.type==='leave')this.h.onLeave(m.id);else if(m.type==='chat')this.h.onChat(m)};
    this.ws.onclose=()=>{clearInterval(this.timer);this.h.onStatus('offline');setTimeout(()=>this.connect(),3000)}}
  send(o){if(this.ws&&this.ws.readyState===1)this.ws.send(JSON.stringify(o))}
  chat(text){this.send({type:'chat',id:this.state.id,name:this.state.name,text:String(text).slice(0,200)})}
}
