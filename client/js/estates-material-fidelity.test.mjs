import assert from 'node:assert/strict';
import {estateSurfaceTexture,estateSurfaceProperties,disposeEstateSurfaceMaterial} from './estates-material-fidelity.mjs';
class MockTexture {
 constructor(bytes,width,height){this.image={data:bytes,width,height};this.repeat={set:(x,y)=>{this.repeats=[x,y];}};}
 dispose(){this.disposed=(this.disposed||0)+1;}
}
const THREE={DataTexture:MockTexture,RGBAFormat:1023,RepeatWrapping:1000,SRGBColorSpace:'srgb',LinearFilter:1006,LinearMipmapLinearFilter:1008};
const a=estateSurfaceTexture(THREE,'timber'),b=estateSurfaceTexture(THREE,'timber'),stone=estateSurfaceTexture(THREE,'stone');
assert(a&&a.name==='estates-procedural-timber');
assert.equal(a.image.width,64);assert.equal(a.image.height,64);
assert.deepEqual(a.repeats,[2,2]);
assert.equal(a.colorSpace,'srgb');
assert.deepEqual(a.image.data,b.image.data,'surface detail is deterministic across scene rebuilds');
assert.notDeepEqual(a.image.data,stone.image.data,'distinct surfaces require different roughness/color grammar');
assert(new Set([...a.image.data].filter((v,i)=>i%4===0)).size>10,'material must have visible but subtle tonal variation');
assert.equal(estateSurfaceTexture(THREE,'glass'),null,'glazing must stay transparent, not stone-textured');
assert.equal(estateSurfaceTexture({},'timber'),null,'lightweight renderer retains flat-color fallback');
const fallback=estateSurfaceProperties({},'timber');assert.deepEqual(fallback,{});
const props=estateSurfaceProperties(THREE,'roof');assert.strictEqual(props.map,props.bumpMap);
const material={...props,dispose(){this.materialDisposed=true;}};
disposeEstateSurfaceMaterial(material);
assert.equal(props.map.disposed,1,'shared color/bump texture is released once');
assert.equal(material.materialDisposed,true);
console.log('Estates PBR-inspired surface fidelity: deterministic tiles, fallback and lifecycle passed');
