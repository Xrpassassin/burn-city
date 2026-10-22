// Blacktide ocean surface model.
// Original Three.js implementation informed by the documented multi-wave
// configuration concepts in The Legend of Pirates Online's libpirates-src.
// It is not a direct port of libpirates.dll or Panda3D code.

const WAVES = [
  { dx: 0.8288, dz: 0.5595, amplitude: 0.62, wavelength: 324.7441, speed: 1.0 },
  { dx: 0.9949, dz: 0.1005, amplitude: 0.22, wavelength: 96.5732, speed: 4.0 },
  { dx: -0.5699, dz: -0.8217, amplitude: 0.91, wavelength: 208.0925, speed: 1.24 },
  { dx: 0.5331, dz: -0.8460, amplitude: 0.16, wavelength: 74.3260, speed: 4.0 }
];

const TAU = Math.PI * 2;
const waveData = WAVES.map(wave => {
  const length = Math.hypot(wave.dx, wave.dz) || 1;
  return { ...wave, dx: wave.dx / length, dz: wave.dz / length, k: TAU / wave.wavelength };
});

// Return the vertical displacement at a world-space x/z coordinate.
export function sampleOceanHeight(x, z, time) {
  let height = 0;
  for (const wave of waveData) {
    const phase = (x * wave.dx + z * wave.dz) * wave.k - time * wave.speed;
    height += Math.sin(phase) * wave.amplitude;
  }
  // A restrained, shorter swell adds visual life without making the ship jitter.
  height += Math.sin(x * 0.075 + z * 0.041 + time * 2.2) * 0.075;
  return height;
}

// Apply the same analytical surface to the mesh so ship motion and visible
// water share one wave model. basePositions is a copy of the geometry's
// original position buffer and should be created once.
export function updateOceanGeometry(geometry, basePositions, time) {
  const positions = geometry.attributes.position;
  for (let i = 0; i < positions.count; i++) {
    const offset = i * 3;
    positions.array[offset + 1] = sampleOceanHeight(
      basePositions[offset],
      basePositions[offset + 2],
      time
    );
  }
  positions.needsUpdate = true;
  geometry.computeVertexNormals();
}
