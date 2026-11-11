import {readFileSync} from 'node:fs';
const files=['zombie-aiden.glb','zombie-hazmat.glb','zombie-thin.glb'];
for(const file of files){
 const b=readFileSync(new URL('../client/arena/assets/zombies/'+file,import.meta.url)),sz=b.readUInt32LE(12),g=JSON.parse(b.toString('utf8',20,20+sz));
 const binOff=20+sz+8;
 function values(index){
  const a=g.accessors[index],v=g.bufferViews[a.bufferView],count=a.count*(a.type==='VEC3'?3:a.type==='VEC4'?4:1),base=binOff+(v.byteOffset||0)+(a.byteOffset||0),stride=v.byteStride||4*(a.type==='VEC3'?3:a.type==='VEC4'?4:1),len=a.type==='VEC3'?3:a.type==='VEC4'?4:1;
  if(a.componentType!==5126)return {error:'nonfloat '+a.componentType};
  const first=[],min=Array(len).fill(Infinity),max=Array(len).fill(-Infinity);
  for(let i=0;i<a.count;i++)for(let j=0;j<len;j++){
   const n=b.readFloatLE(base+i*stride+j*4);if(i===0)first[j]=+n.toFixed(3);
   min[j]=Math.min(min[j],n);max[j]=Math.max(max[j],n);
  }
  return {first,min:min.map(x=>+x.toFixed(2)),max:max.map(x=>+x.toFixed(2))};
 }
 const channels=[];
 for(const animation of g.animations||[])for(const channel of animation.channels||[]){
  if(channel.target.path!=='translation')continue;
  const sampler=animation.samplers[channel.sampler],node=g.nodes[channel.target.node];
  const out=values(sampler.output);
  channels.push({clip:animation.name,node:node?.name,base:node?.translation?.map(x=>+x.toFixed(2)),...out});
 }
 channels.sort((a,b)=>{
 const span=x=>Math.max(...(x.max||[]).map((n,i)=>Math.abs(n-(x.min?.[i]||0))),0);
 return span(b)-span(a);
 });
 textForDiagnostic();
 function textForDiagnostic(){
  console.log('ZOMBIE_ANIM_UNITS '+file+' '+JSON.stringify({nodes:g.nodes?.length,skins:g.skins?.length,clips:g.animations?.map(x=>x.name),channels:channels.slice(0,18)}));
 }
}
