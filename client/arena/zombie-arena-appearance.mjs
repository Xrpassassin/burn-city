// ORIGINAL Zombies game only. Visual-only human infected styling.
// Never import Homefront assets, survivors, AI, combat or world presentation.
export const ARENA_ZOMBIE_SKINS=Object.freeze([
 Object.freeze([0x8b887c,0x777e77,0x9b8f83,0x6e746d]), // shambler: ashen / mottled
 Object.freeze([0xaba193,0x99958b,0x8c8176]),             // sprinter: pallid
 Object.freeze([0x74766f,0x66645d,0x827b6c]),             // heavy: bruised grey
 Object.freeze([0x535050,0x67605a]),                      // juggernaut: soot
 Object.freeze([0xaaa094,0x9a9387]),                      // loper: emaciated
 Object.freeze([0x687476,0x748080]),                      // skitter: drowned slate
 Object.freeze([0x667781,0x73838a]),                      // elemental flying
 Object.freeze([0x796e7c,0x6a6374]),                      // ranged mutation
 Object.freeze([0x5d5050,0x77625d]),                      // boss: burned flesh
 Object.freeze([0xbab5ae,0xa39a93])                       // containment infected: pale
]);
export const ARENA_ZOMBIE_EYES=Object.freeze([
 0x3f3730,0x443830,0x44352f,0x702e27,0x443830,
 0x374248,0x6e9eae,0x9b7da0,0xb2784a,0x39322e
]);
export const ARENA_ZOMBIE_CLOTH=Object.freeze([
 0x544a42,0x3d484a,0x68655e,0x69524a,0x51564d,0x887c68,0x55535a
]);
export const ARENA_ZOMBIE_PANTS=Object.freeze([0x393936,0x4a453e,0x333e42,0x49443d]);
export function isArcaneInfected(type) {
 return type===6||type===7||type===8;
}
// Only exceptional elementals / bosses receive a SMALL eye glow. Ordinary
// flesh-colored shamblers use deep sockets, not cartoon LED eyes.
export function zombieEyeIntensity(type,{burning=false,dead=false,low=false}={}) {
 if(dead||low)return 0;
 return burning?0.5:isArcaneInfected(type)?0.36:0;
}
export function zombieHumanShape(type) {
 const sizes=[1,.85,1.45,1.9,1,.62,.9,1.05,1.55,1.18];
 return sizes[Math.max(0,Math.min(9,Math.floor(Number(type)||0)))]??1;
}
