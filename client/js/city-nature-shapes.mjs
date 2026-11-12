// Original, texture-free foliage silhouettes for the live city.
// Pure triangle data keeps the two instanced nature batches easy to test.
// No collision, lighting, world layout or server-owned game state.
export function cityFoliageTriangles({flower=false}={}) {
 const positions=[],colors=[];
 const triangle=(a,b,c,rgb)=>{
  for(const p of [a,b,c]){positions.push(p[0],p[1],p[2]);colors.push(...rgb);}
 };
 const blade=(angle,height,width,lean,rgb)=>{
  const dx=Math.cos(angle),dz=Math.sin(angle),sx=-dz,sz=dx;
  const base=.045+lean*.025,mid=base+.08+lean*.10,tip=mid+.15+lean*.13;
  const left=(r,y,w)=>[dx*r+sx*w,y,dz*r+sz*w];
  const right=(r,y,w)=>[dx*r-sx*w,y,dz*r-sz*w];
  const a=left(base,0,width*.48),b=right(base,0,width*.48);
  const c=left(mid,height*.52,width*.27),d=right(mid,height*.52,width*.27);
  const e=[dx*tip,height,dz*tip];
  triangle(a,b,c,rgb);triangle(b,d,c,rgb);triangle(c,d,e,rgb);
 };
 const green=[.75,.84,.70],sage=[.69,.80,.67],dry=[.86,.82,.65];
 const count=flower?3:6;
 for(let i=0;i<count;i++){
  const angle=i*2.399963229728653;
  const height=flower?(.44+.11*(i%3)):(.72+.055*((i*3)%5));
  const width=flower?.15:.19;
  blade(angle,height,width,.35+.14*(i%4),i%5===0?dry:i%2?sage:green);
 }
 if(flower){
  // Two crossing, thin stems and five subdued petals on a small wildflower.
  const stem=[.49,.67,.40],petal=[.91,.76,.53],petalShade=[.85,.67,.47];
  triangle([-.022,.02,0],[.022,.02,0],[-.012,.89,0],stem);
  triangle([.022,.02,0],[.012,.89,0],[-.012,.89,0],stem);
  triangle([0,.02,-.022],[0,.02,.022],[0,.89,-.012],stem);
  triangle([0,.02,.022],[0,.89,.012],[0,.89,-.012],stem);
  for(let i=0;i<5;i++){
   const a=i*Math.PI*2/5,dx=Math.cos(a),dz=Math.sin(a),sx=-dz,sz=dx;
   triangle([sx*.042,.91,sz*.042],[-sx*.042,.91,-sz*.042],
    [dx*.17,1.01,dz*.17],i%2?petalShade:petal);
  }
  triangle([-.045,.925,0],[.045,.925,0],[0,1.045,0],[.95,.85,.65]);
 }
 return {positions:new Float32Array(positions),colors:new Float32Array(colors)};
}
