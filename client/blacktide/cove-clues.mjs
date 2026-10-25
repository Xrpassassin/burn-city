// Local environmental mystery clues. Client discovery is narrative only.
export const COVE_CLUES=Object.freeze([
 {id:'broken-manifest',title:'Torn Shipping Manifest',x:-60,z:-92,text:'Three ships sailed beyond the reef. Every name has been scratched from the Crown registry.'},
 {id:'salt-stained-letter',title:'Salt-Stained Letter',x:-52,z:-82,text:'The letter bears a broken crown seal. Someone at the tavern knows who delivered it.'},
 {id:'reef-marker',title:'Reef Warning Marker',x:-56,z:-76,text:'Fresh blade marks cross the warning post. The reef was not the only danger.'}
]);
export function nearestClue(pos,found=[],range=2.7) {
 if(!pos||!Number.isFinite(pos.x)||!Number.isFinite(pos.z))return null;
 const seen=new Set(found);
 return COVE_CLUES.find(c=>!seen.has(c.id)&&Math.hypot(c.x-pos.x,c.z-pos.z)<=range)||null;
}
