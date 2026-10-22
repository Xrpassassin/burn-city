// Blacktide ocean surface model.
// Analytic multi-directional waves keep the visible surface and vessel sampling
// on the same model. Normals are derived analytically to avoid recomputing them
// from every triangle on every frame, which is expensive on mobile GPUs/CPUs.
// Wave model is original Three.js code informed by general documented multi-wave
// concepts; this is not a port of another game's binary or engine code.

const WAVES = [
  { dx: 0.8288, dz: 0.5595, amplitude: 0.62, wavelength: 324.7441, speed: 1.0 },
  { dx: 0.9949, dz: 0.1005, amplitude: 0.22, wavelength: 96.5732, speed: 4.0 },
  { dx: -0.5699, dz: -0.8217, amplitude: 0.91, wavelength: 208.0925, speed: 1.24 },
  { dx: 0.5331, dz: -0.8460, amplitude: 0.16, wavelength: 74.3260, speed: 4.0 },
  // Shorter, lower-amplitude cross swells add local surface detail without
  // allowing small waves to dominate the ship's movement.
  { dx: 0.31, dz: 0.95, amplitude: 0.075, wavelength: 38, speed: 2.8 },
  { dx: -0.88, dz: 0.47, amplitude: 0.045, wavelength: 23, speed: 4.1 }
];

const TAU = Math.PI * 2;
const waveData = WAVES.map(wave => {
  const length = Math.hypot(wave.dx, wave.dz) || 1;
  return { ...wave, dx: wave.dx / length, dz: wave.dz / length, k: TAU / wave.wavelength };
});

// Return displacement and its world-space slopes at a world-space x/z point.
// The slopes provide an analytic surface normal for both rendering and boats.
export function sampleOceanSurface(x, z, time) {
  let height = 0, slopeX = 0, slopeZ = 0;
  for (const wave of waveData) {
    const phase = (x * wave.dx + z * wave.dz) * wave.k - time * wave.speed;
    const s = Math.sin(phase) * wave.amplitude;
    const derivative = Math.cos(phase) * wave.amplitude * wave.k;
    height += s;
    slopeX += derivative * wave.dx;
    slopeZ += derivative * wave.dz;
  }
  const detailPhase = x * 0.075 + z * 0.041 + time * 2.2;
  height += Math.sin(detailPhase) * 0.075;
  const detailSlope = Math.cos(detailPhase) * 0.075;
  slopeX += detailSlope * 0.075;
  slopeZ += detailSlope * 0.041;
  return { height, slopeX, slopeZ };
}

// Compatibility helper used by the ship while keeping its vertical motion
// tied to exactly the same surface as the ocean mesh.
export function sampleOceanHeight(x, z, time) {
  return sampleOceanSurface(x, z, time).height;
}

// Update vertex heights and analytic normals in one pass. basePositions is a
// copy of the geometry's original position buffer and should be made once.
export function updateOceanGeometry(geometry, basePositions, time) {
  const positions = geometry.attributes.position;
  const normals = geometry.attributes.normal;
  for (let i = 0; i < positions.count; i++) {
    const offset = i * 3;
    const x = basePositions[offset], z = basePositions[offset + 2];
    let height = 0, slopeX = 0, slopeZ = 0;
    // Inline the vertex calculation to avoid allocating one object per vertex.
    for (const wave of waveData) {
      const phase = (x * wave.dx + z * wave.dz) * wave.k - time * wave.speed;
      height += Math.sin(phase) * wave.amplitude;
      const derivative = Math.cos(phase) * wave.amplitude * wave.k;
      slopeX += derivative * wave.dx;
      slopeZ += derivative * wave.dz;
    }
    const detailPhase = x * 0.075 + z * 0.041 + time * 2.2;
    height += Math.sin(detailPhase) * 0.075;
    const detailSlope = Math.cos(detailPhase) * 0.075;
    slopeX += detailSlope * 0.075;
    slopeZ += detailSlope * 0.041;
    positions.array[offset + 1] = height;
    const nx = -slopeX, ny = 1, nz = -slopeZ;
    const invLength = 1 / Math.hypot(nx, ny, nz);
    normals.array[offset] = nx * invLength;
    normals.array[offset + 1] = ny * invLength;
    normals.array[offset + 2] = nz * invLength;
  }
  positions.needsUpdate = true;
  normals.needsUpdate = true;
}
