// Original Zombies presentation only: contact-patch proportions for the
// licensed human infected. No AI/physics/collision or Homefront imports.
export function zombieShadowMetrics(type,{variant=1,crawling=false,dead=false}={}) {
  const id=Number.isInteger(type)?Math.max(0,Math.min(8,type)):0;
  const bodySizes=[1,.85,1.45,1.9,1,.62,.9,1.05,1.55];
  const safeVariant=Number.isFinite(variant)?Math.max(.75,Math.min(1.5,variant)):1;
  const base=bodySizes[id]*safeVariant;
  const width=(crawling?.78:.62)*base;
  const length=(crawling?1.32:.88)*base;
  return Object.freeze({width,length,visible:!dead});
}

// A tiny alpha-only radial mask for the pooled ground decal. 64^2 RGBA
// pixels; generated once per Zombies pilot, never per enemy or frame.
export function infectedShadowPixels(size=64) {
  if(!Number.isInteger(size)||size<8||size>128)throw RangeError('invalid shadow size');
  const pixels=new Uint8Array(size*size*4);
  for(let y=0;y<size;y++)for(let x=0;x<size;x++){
    const dx=(x+.5-size*.5)/(size*.5);
    const dy=(y+.5-size*.5)/(size*.5);
    const radial=Math.max(0,1-dx*dx-dy*dy);
    const alpha=Math.pow(radial,2.8);
    const i=(y*size+x)*4;
    pixels[i]=18;pixels[i+1]=20;pixels[i+2]=18;
    pixels[i+3]=Math.round(90*alpha);
  }
  return pixels;
}
