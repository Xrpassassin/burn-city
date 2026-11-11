// Original procedural Homefront ground meshes. Render-only: no colliders,
// movement rules, loot, spawning, or external texture/asset dependencies.
// Shared geometry is instanced by the existing world-chunk renderer.
export function createHomefrontTuftGeometry(THREE) {
  const positions=[],shades=[];
  const tri=(a,b,c,shade)=>{
    positions.push(...a,...b,...c);
    for(let n=0;n<3;n++)shades.push(shade,shade*0.99,shade*0.94);
  };
  // Seven asymmetric, curved blades: the original single cone read as a
  // plastic spike at walking height. These are broad enough to silhouette
  // but stay within one small static mesh and one existing draw call.
  for(let i=0;i<7;i++){
    const angle=i*2.399963229728653+0.19;
    const dx=Math.cos(angle),dz=Math.sin(angle),rx=-dz,rz=dx;
    const height=.39+.048*((i*5)%7);
    const width=.072+.012*(i%3);
    const lean=.095+.026*(i%4);
    const baseA=[rx*width,0,rz*width];
    const baseB=[-rx*width,0,-rz*width];
    const midA=[dx*lean*.56+rx*width*.45,height*.56,dz*lean*.56+rz*width*.45];
    const midB=[dx*lean*.56-rx*width*.45,height*.56,dz*lean*.56-rz*width*.45];
    const tip=[dx*lean*1.5,height,dz*lean*1.5];
    const shade=.83+.021*(i%5);
    tri(baseA,baseB,midA,shade);
    tri(baseB,midB,midA,shade*.92);
    tri(midA,midB,tip,shade*.98);
  }
  const geometry=new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  geometry.setAttribute('color',new THREE.Float32BufferAttribute(shades,3));
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  geometry.name='homefront-irregular-grass-cluster';
  return geometry;
}

export function createHomefrontRubbleGeometry(THREE) {
  const geometry=new THREE.DodecahedronGeometry(.28,0);
  const pos=geometry.getAttribute('position');
  // Flatten varied facets and slightly chip their silhouette. Displacement is
  // deterministic in local coordinates so neighboring chunks never flicker.
  for(let i=0;i<pos.count;i++){
    const x=pos.getX(i),y=pos.getY(i),z=pos.getZ(i);
    const rough=.86+.11*Math.sin(x*31+z*47)+.065*Math.cos(x*53-z*19);
    pos.setXYZ(i,x*rough,y*.66,z*(.91+.08*Math.cos(x*29+z*17)));
  }
  pos.needsUpdate=true;
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  geometry.name='homefront-chipped-stone';
  return geometry;
}
