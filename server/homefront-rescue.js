'use strict';
const Collision=require('./homefront-collision');
const {survivorPosition,SURVIVOR_INTERACT_RADIUS}=require('../client/arena/homefront-survivor-encounters.mjs');
// Shared by the action handler and each viewer's snapshot. Reach is derived
// from the real survivor model, never a caller-supplied target coordinate.
function reachError(world,account,point){
 const p=world.players?.[account];
 if(!p)return 'not_in_expedition';
 if(p.vehicleId)return 'exit_vehicle_before_rescue';
 if(world.interiors?.[account]?.activeLandmarkId)return 'leave_building_before_rescue';
 if(!point||point.type!=='rescue')return 'too_far_from_rescue';
 const target=survivorPosition(point);
 if(!Number.isFinite(p.x)||!Number.isFinite(p.z)||
    Math.hypot(p.x-target.x,p.z-target.z)>SURVIVOR_INTERACT_RADIUS)return 'too_far_from_rescue';
 const removed=Object.values(world.environmentStructures||{}).filter(s=>s.health<=0).map(s=>s.id);
 if(!Collision.canTraverse(p.x,p.z,target.x,target.z,{radius:0.1,sampleStep:0.2,
    removedObstacleIds:[...Collision.interiorRemovedIds(null),...removed]}))return 'rescue_path_blocked';
 return null;
}
module.exports={reachError};
