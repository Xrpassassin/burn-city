// Burn City diagnostics. Always: small render-safety fixes. With ?debug=objects: an overlay to hide object groups
// one at a time (to isolate a rendering glitch) + GPU/render-target info + a copyable report.
import * as THREE from 'three';
const Q=new URLSearchParams(location.search),W=()=>window.__city;
function boot(){const c=W();if(!c||!window.__ready)return setTimeout(boot,400);
 // safety: additive/transparent effects never write depth (prevents dark cut-outs behind glow sprites)
 const fixMats=()=>c.S.traverse(o=>{const ms=o.material?(Array.isArray(o.material)?o.material:[o.material]):[];ms.forEach(m=>{if(m.transparent&&m.blending===THREE.AdditiveBlending&&m.depthWrite){m.depthWrite=false;m.needsUpdate=true}})});
 fixMats();setTimeout(fixMats,8000);
 if(Q.get('debug')!=='objects')return;
 const CATS=[['sprites','Sprites (glows, fog banks, moon, beacons)',o=>o.isSprite],['points','Particles / points (fire, stars, rain)',o=>o.isPoints],['lines','Lines (rails, rain, bolts)',o=>o.isLine||o.isLineSegments],
  ['reflect','Ground reflection',o=>o.isReflector||(o.material&&o.material.uniforms&&o.material.uniforms.tDiffuse&&o.isMesh)],
  ['planes','Flat planes (billboards, ads, banners, screens)',o=>o.isMesh&&o.geometry&&o.geometry.type==='PlaneGeometry'],
  ['transp','Other transparent meshes (pool tubes, glow shells, markers)',o=>o.isMesh&&o.material&&(o.material.transparent||(Array.isArray(o.material)&&o.material.some(m=>m.transparent)))],
  ['opaque','Opaque meshes (towers, ground)',o=>o.isMesh||o.isInstancedMesh]];
 const layerOf={};CATS.forEach(([k],i)=>layerOf[k]=i+1);
 const tag=()=>c.S.traverse(o=>{if(o.isLight){o.layers.enableAll();return}if(o===c.S||o.isCamera||o.isGroup||o.userData.__dbg)return;const cat=CATS.find(([,,f])=>f(o));if(!cat){o.layers.enable(9);o.userData.__dbg='other';return}o.layers.enable(layerOf[cat[0]]);o.userData.__dbg=cat[0]});
 tag();setInterval(tag,2000);c.C.layers.enableAll();c.C.layers.disable(0);   // objects keep layer 0 for tap-picking; camera renders by category layer
 const box=document.createElement('div');box.id='dbgPanel';box.innerHTML='<b>Burn City · debug=objects</b><div class="dl"></div><div class="dp"></div><pre class="di"></pre><button class="dc">Copy report</button> <button class="dx">Hide panel</button>';document.body.append(box);
 const dl=box.querySelector('.dl'),dp=box.querySelector('.dp'),di=box.querySelector('.di');
 const cb=(label,on,fn)=>{const l=document.createElement('label'),i=document.createElement('input');i.type='checkbox';i.checked=on;i.onchange=()=>fn(i.checked);l.append(i,' '+label);return l};
 CATS.forEach(([k,label])=>dl.append(cb(label,true,v=>v?c.C.layers.enable(layerOf[k]):c.C.layers.disable(layerOf[k]))));
 dl.append(cb('HTML overlays (labels, name tags)',true,v=>['labels','ptags'].forEach(id=>{const e=document.getElementById(id);if(e)e.style.visibility=v?'':'hidden'})));
 dp.append(cb('Bloom (glow post-effect)',c.bloom.enabled,v=>c.bloom.enabled=v),cb('NaN sanitize pass',c.sanitize.enabled,v=>c.sanitize.enabled=v));
 const gl=c.R.getContext(),ext=gl.getExtension('WEBGL_debug_renderer_info');
 const info=()=>{const i=c.R.info;return [`GPU: ${ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):'n/a'}`,`UA: ${navigator.userAgent}`,`WebGL2: ${c.R.capabilities.isWebGL2}  float RT: ${!!gl.getExtension('EXT_color_buffer_float')}  half RT: ${!!(gl.getExtension('EXT_color_buffer_half_float')||c.R.capabilities.isWebGL2)}`,
   `post RT type: ${c.RT_BYTE?'8-bit (Safari/Apple safe)':'half-float'}  apple GPU: ${c.APPLE_GPU}  pixelRatio: ${c.R.getPixelRatio()}`,`fps: ${window.__fps||'?'}  calls: ${i.render.calls}  tris: ${i.render.triangles}  textures: ${i.memory.textures}  geometries: ${i.memory.geometries}`,
   `hidden groups: ${CATS.filter(([k])=>!c.C.layers.isEnabled(layerOf[k])).map(x=>x[0]).join(',')||'none'}  bloom: ${c.bloom.enabled}  sanitize: ${c.sanitize.enabled}`].join('\n')};
 setInterval(()=>di.textContent=info(),1000);
 box.querySelector('.dc').onclick=async()=>{try{await navigator.clipboard.writeText(info());box.querySelector('.dc').textContent='Copied ✓'}catch(e){prompt('Copy this report:',info())}};
 box.querySelector('.dx').onclick=()=>box.classList.toggle('min');
}
boot();
