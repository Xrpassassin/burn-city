// Original rounded canvas pack for Homefront explorers.
// Rendering only: no gameplay inventory/capacity or collision changes.
export function createHomefrontFieldPackGeometry(THREE) {
  const shape=new THREE.Shape();
  shape.moveTo(-.21,-.41);
  shape.lineTo(.21,-.41);
  shape.quadraticCurveTo(.31,-.41,.31,-.31);
  shape.lineTo(.31,.29);
  shape.quadraticCurveTo(.31,.41,.19,.41);
  shape.lineTo(-.19,.41);
  shape.quadraticCurveTo(-.31,.41,-.31,.29);
  shape.lineTo(-.31,-.31);
  shape.quadraticCurveTo(-.31,-.41,-.21,-.41);
  const geometry=new THREE.ExtrudeGeometry(shape,{
    depth:.23,steps:1,bevelEnabled:true,bevelThickness:.035,
    bevelSize:.025,bevelSegments:2,curveSegments:4
  });
  geometry.translate(0,0,-.115);
  geometry.computeBoundingSphere();
  geometry.name='homefront-canvas-field-pack';
  return geometry;
}
