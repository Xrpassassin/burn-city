// Physically-plausible rainbow: one back-faced dome around the camera, one draw call, additive, no depth write.
// Angles are measured from the antisolar point (-sunD): primary ~40.5-42.5° (violet in, red out), brighter sky inside it,
// faint reversed secondary ~50-53.5°, and the gap between left unlit (Alexander's dark band). Fades at the horizon/haze
// and disappears when the sun is high (antisolar point too far below the horizon) or set.
import * as THREE from 'three';
export function makeRainbow(scene, U, cam, segs = 32) {
  const m = new THREE.ShaderMaterial({
    uniforms: { op: { value: 0 }, sunD: U.sunD }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.BackSide, fog: false,
    vertexShader: 'varying vec3 vP;void main(){vP=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
    fragmentShader: `uniform float op;uniform vec3 sunD;varying vec3 vP;
float g(float x,float c,float w){x=(x-c)/w;return exp(-x*x);}
void main(){vec3 d=normalize(vP);float a=degrees(acos(clamp(dot(d,-sunD),-1.,1.)));
 vec3 p=vec3(g(a,42.,.75),g(a,41.25,.75),g(a,40.5,.75)*1.15);
 vec3 s=vec3(g(a,50.6,1.1),g(a,51.7,1.1),g(a,52.9,1.1)*1.1)*.38;
 float inner=.07*smoothstep(8.,39.,a)*(1.-smoothstep(39.6,40.8,a));
 vec3 c=p+s+vec3(inner*1.05,inner,inner*.95);
 float hz=smoothstep(-.01,.07,d.y)*mix(.4,1.,smoothstep(0.,.3,d.y));
 float k=op*hz*smoothstep(.7,.5,sunD.y)*smoothstep(-.03,.06,sunD.y);
 if(k<.002)discard;gl_FragColor=vec4(c,k);}`
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(1800, segs, segs / 2), m);
  mesh.frustumCulled = false; mesh.renderOrder = 2; mesh.visible = false; scene.add(mesh);
  return (rainbow, day) => { mesh.visible = rainbow > .01; if (!mesh.visible) return; mesh.position.copy(cam.position); m.uniforms.op.value = rainbow * .55 * (.55 + .45 * day); };
}
