// Paired maritime gateway contract. Host resolves world-instance changes.
// Coordinates are instance-local; arrival is deliberately inside navigable water.
export const ESTATES_CITY_MARINE_GATE=Object.freeze({
 id:'estates-east-channel',
 estates:Object.freeze({exit:Object.freeze({x:225,z:0}),arrival:Object.freeze({x:216,z:0}),heading:Math.PI/2}),
 city:Object.freeze({arrival:Object.freeze({x:0,z:0}),heading:Math.PI/2}),
 channelWidth:64,
 visual:Object.freeze({marker:'paired-channel-buoys',shoreline:'matching-channel-mouth',waterLevel:-1.1})
});
export function mapEstatesDepartureToCity({boatId,heading,speed,passengerIds=[]}={}){
 if(typeof boatId!=='string'||!boatId||!Number.isFinite(heading)||!Number.isFinite(speed)||speed<0||
 !Array.isArray(passengerIds)||passengerIds.some(id=>typeof id!=='string'||!id))return null;
 return Object.freeze({
 gatewayId:ESTATES_CITY_MARINE_GATE.id,
 destination:'burn-city',
 arrival:Object.freeze({...ESTATES_CITY_MARINE_GATE.city.arrival}),
 heading, speed, boatId,
 passengerIds:Object.freeze([...passengerIds])
 });
}
export function mapCityReturnToEstates({boatId,heading,speed,passengerIds=[]}={}){
 const outbound=mapEstatesDepartureToCity({boatId,heading,speed,passengerIds});
 if(!outbound)return null;
 return Object.freeze({...outbound,destination:'estates-island',
 arrival:Object.freeze({...ESTATES_CITY_MARINE_GATE.estates.arrival})});
}
