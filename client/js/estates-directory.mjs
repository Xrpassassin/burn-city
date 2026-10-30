// Read-only, manifest-backed Estates directory. Does not infer wallet ownership.
export function searchEstateLots(lots, query='', filter='all', ownedPropertyIds=[]) {
  if(!Array.isArray(lots)||typeof query!=='string'||!['all','mapped','unassigned','mine'].includes(filter)||!Array.isArray(ownedPropertyIds))
    throw new TypeError('invalid Estates directory query');
  const mine=new Set(ownedPropertyIds.filter(id=>typeof id==='string'));
  const term=query.trim().toLocaleLowerCase();
  return lots.filter(lot=>{
    if(!lot||typeof lot.id!=='string')return false;
    const mapped=typeof lot.propertyId==='string'&&lot.propertyId.length>0;
    if(filter==='mapped'&&!mapped||filter==='unassigned'&&mapped||filter==='mine'&&(!mapped||!mine.has(lot.propertyId)))return false;
    return [lot.id,lot.address,lot.district,lot.tier].some(value=>String(value??'').toLocaleLowerCase().includes(term));
  }).map(lot=>Object.freeze({id:lot.id,propertyId:lot.propertyId??null,
    address:lot.address??lot.id,district:lot.district??'',tier:lot.tier??'',
    position:lot.position}));
}
