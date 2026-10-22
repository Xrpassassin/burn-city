// Blacktide ocean surface model.
// A deterministic directional wave spectrum reduces the repetitive look of a
// small hand-picked wave set. CPU surface sampling and mesh displacement share
// the same generated components. Normals are derived analytically for mobile.
// Spectrum construction is an original adaptation of the Phillips-spectrum and
// deterministic-component approach used by DRIFT (MIT); see THIRD_PARTY_NOTICES.md.

const G = 9.8;
const WAVE_COUNT = 16;
const WIND_ANGLE = 0.28;
const WIND_SPEED = 10;
const TARGET_SIGMA = 0.68;
const TAU = Math.PI * 2;

// Stable PRNG: clients produce the same sea instead of a new random pattern.
function mulberry32(seed) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function buildSpectrum() {
  const random = mulberry32(20261022);
  const windScale = (WIND_SPEED * WIND_SPEED) / G;
  // Keep wavelengths above the phone ocean grid's Nyquist limit to avoid
  // shimmering/aliasing at the current 64-segment coarse-device mesh.
  const minWavelength = 62;
  const maxWavelength = 360;
  const raw = [];
  let energy = 0;

  for (let i = 0; i < WAVE_COUNT; i++) {
    const f = (i + random()) / WAVE_COUNT;
    const wavelength = minWavelength * Math.pow(maxWavelength / minWavelength, f);
    const k = TAU / wavelength;
    const spread = 0.35 + 1.15 * f;
    const angle = WIND_ANGLE + (random() * 2 - 1) * spread;
    const dx = Math.cos(angle), dz = Math.sin(angle);
    const kL = k * windScale;
    const directional = Math.pow(Math.max(Math.cos(angle - WIND_ANGLE), 0), 2);
    const spectrum = Math.exp(-1 / (kL * kL)) / (k * k) * directional;
    const amplitude = Math.sqrt(Math.max(spectrum, 0)) * (0.5 + 0.5 * random());
    const speed = Math.sqrt(G / k) * (0.9 + 0.2 * random());
    const phase = random() * TAU;
    raw.push({ dx, dz, k, amplitude, speed, phase });
    energy += amplitude * amplitude;
  }

  const normalization = TARGET_SIGMA / Math.sqrt(energy || 1);
  return raw.map(wave => ({ ...wave, amplitude: wave.amplitude * normalization }));
}

const waveData = buildSpectrum();

// Return displacement and world-space slopes at a world-space x/z point.
export function sampleOceanSurface(x, z, time) {
  let height = 0, slopeX = 0, slopeZ = 0;
  for (const wave of waveData) {
    const phase = wave.k * (wave.dx * x + wave.dz * z) - time * wave.speed + wave.phase;
    const sine = Math.sin(phase);
    const derivative = Math.cos(phase) * wave.amplitude * wave.k;
    height += sine * wave.amplitude;
    slopeX += derivative * wave.dx;
    slopeZ += derivative * wave.dz;
  }
  // A restrained, broad detail swell adds local motion without high-frequency
  // noise that aliases on mobile screens.
  const detailPhase = x * 0.075 + z * 0.041 + time * 2.2;
  height += Math.sin(detailPhase) * 0.075;
  const detailSlope = Math.cos(detailPhase) * 0.075;
  slopeX += detailSlope * 0.075;
  slopeZ += detailSlope * 0.041;
  return { height, slopeX, slopeZ };
}

// Compatibility helper used by the ship and NPC vessels.
export function sampleOceanHeight(x, z, time) {
  return sampleOceanSurface(x, z, time).height;
}

// Update vertex heights and analytic normals in one pass; no per-vertex object
// allocations and no expensive triangle-normal recomputation.
export function updateOceanGeometry(geometry, basePositions, time) {
  const positions = geometry.attributes.position;
  const normals = geometry.attributes.normal;
  for (let i = 0; i < positions.count; i++) {
    const offset = i * 3;
    const x = basePositions[offset], z = basePositions[offset + 2];
    let height = 0, slopeX = 0, slopeZ = 0;
    for (const wave of waveData) {
      const phase = wave.k * (wave.dx * x + wave.dz * z) - time * wave.speed + wave.phase;
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
