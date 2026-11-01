// Homefront district atmosphere: deterministic and *cosmetic only*.
// Driven from server-confirmed player position and authored site metadata.
// No radiation/oxygen/visibility penalty, combat buffs, network traffic,
// random loot, physics, sound triggers or lighting/shadow passes.
import { LANDMARKS } from './homefront-exploration-content.mjs';

export const AMBIENT_UPDATE_MS = 4000;
const WEATHER_PHASE_MS = 90_000;
const LOOK = Object.freeze({
  outskirts: Object.freeze({ name:'Windblown outskirts', fog:0x171a18, sky:0x111312, density:0.0034, ash:0.25 }),
  residential: Object.freeze({ name:'Hollow Blocks haze', fog:0x25221e, sky:0x171412, density:0.0043, ash:0.23 }),
  commercial: Object.freeze({ name:'Market smoke', fog:0x30251d, sky:0x1c1411, density:0.0047, ash:0.30 }),
  hospital: Object.freeze({ name:'Quarantine mist', fog:0x202a2b, sky:0x11191a, density:0.0045, ash:0.20 }),
  industrial: Object.freeze({ name:'Ironworks ash', fog:0x33251e, sky:0x1b1411, density:0.0051, ash:0.34 }),
  subway: Object.freeze({ name:'Buried Line dust', fog:0x161e20, sky:0x0d1214, density:0.0050, ash:0.12 }),
  research_lab: Object.freeze({ name:'Blackglass containment haze', fog:0x182529, sky:0x101719, density:0.0048, ash:0.13 })
});
export const ATMOSPHERE_DISTRICTS = Object.freeze(Object.keys(LOOK));

function hash(value) {
  let result=2166136261;
  for (const ch of value) result=Math.imul(result^ch.charCodeAt(0),16777619)>>>0;
  return result>>>0;
}
export function nearbyAtmosphereDistrict(player, serverDistrict) {
  if (!player || !Number.isFinite(player.x) || !Number.isFinite(player.z)) return 'outskirts';
  const near = LANDMARKS.reduce((best, landmark) => {
    const distance=Math.hypot(player.x-landmark.x,player.z-landmark.z);
    return distance < best.distance ? { landmark, distance } : best;
  },{landmark:null,distance:Infinity});
  if (near.distance <= 15 && LOOK[near.landmark.district]) return near.landmark.district;
  return serverDistrict === 'perimeter' ? 'outskirts'
    : serverDistrict === 'graveyard_core' ? 'research_lab'
    : (Object.prototype.hasOwnProperty.call(LOOK,serverDistrict) ? serverDistrict : 'outskirts');
}

export function atmosphereAt({ player = null, serverDistrict = null, interior = null, timeMs = 0 } = {}) {
  const roomLandmark = interior?.landmarkId && LANDMARKS.find(p => p.id === interior.landmarkId);
  const id = roomLandmark?.district && LOOK[roomLandmark.district]
    ? roomLandmark.district : nearbyAtmosphereDistrict(player,serverDistrict);
  const settings = LOOK[id];
  const tick=Number.isFinite(timeMs) && timeMs>=0 ? Math.floor(timeMs/WEATHER_PHASE_MS) : 0;
  const phase=hash('homefront:air:'+id+':'+tick)%3;
  const inside=!!roomLandmark && !!interior?.roomId;
  const powered=inside && Array.isArray(interior.flags) &&
    ['emergency_power','ashfall_grid','blackglass_power'].some(flag=>interior.flags.includes(flag));
  if (inside) return Object.freeze({
    district:id, name: powered?'Powered service wing':'Unpowered interior',
    fogColor:powered?0x24302c:0x1d2322, skyColor:powered?0x131b19:0x111616,
    fogDensity:0.0024, ashOpacity:0, ashVisible:false, windX:0, phase:'sheltered', inside:true
  });
  // A tiny changing visual gust, deterministic per district/time bucket, never
  // interrupts controls, reduces gameplay sight range or changes server threats.
  const gust = phase === 2 ? 1 : phase === 1 ? 0.5 : 0;
  return Object.freeze({
    district:id, name:settings.name,
    fogColor:settings.fog, skyColor:settings.sky,
    fogDensity:Math.min(0.0055,settings.density+gust*0.00035),
    ashOpacity:Math.min(0.40,settings.ash+gust*0.04),
    ashVisible:true, windX:((hash(id+':wind:'+tick)%201)-100)/100*(0.25+gust*0.55),
    phase:gust===1?'ash gust':gust===0.5?'breezy':'still',inside:false
  });
}
