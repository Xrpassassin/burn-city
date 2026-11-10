'use strict';
// Owner-only persistent Estate Hangar. Local flight checkpoint claims are not independently verified.
// No rewards or payout influence can derive from this data.
const crypto=require('node:crypto');
const {estateHelicopterAccess}=require('./estate-tycoon-rooms');
const PAINT=Object.freeze({obsidian:0x223b4b,ember:0x9f4731,arctic:0xc0d0d8,verdant:0x3d7664,royal:0x55426f});
const TRIM=Object.freeze({brass:0xb49b67,ice:0x73d4e6,chrome:0xb4bdc7,copper:0xd1784d,ivory:0xe6ddd0});
const STOPS=Object.freeze(['north-lookout','east-coast','south-lake']);
const DEFAULT_STYLE=Object.freeze({paint:'obsidian',trim:'brass',callsign:'BURN AIR'});
const SESSION_TTL_MS=60*60*1000;
function createEstateHangarLogbook({db,tycoonStore,accessFor,clock=Date.now}={}){
 if(typeof db?.prepare!=='function'||typeof db?.exec!=='function'||typeof tycoonStore?.state!=='function'||
  typeof accessFor!=='function'||typeof clock!=='function')throw TypeError('hangar_dependencies_required');
 db.exec("CREATE TABLE IF NOT EXISTS estate_hangar_style ("+
  "property_id TEXT PRIMARY KEY NOT NULL, paint TEXT NOT NULL DEFAULT 'obsidian',"+
  "trim TEXT NOT NULL DEFAULT 'brass', callsign TEXT NOT NULL DEFAULT 'BURN AIR',"+
  "updated_at INTEGER NOT NULL, FOREIGN KEY(property_id) REFERENCES estate_property_ownership(property_id))");
 db.exec("CREATE TABLE IF NOT EXISTS estate_hangar_flights ("+
  "session_id TEXT PRIMARY KEY NOT NULL, property_id TEXT NOT NULL,pilot_acct TEXT NOT NULL,"+
  "started_at INTEGER NOT NULL,ended_at INTEGER,duration_s INTEGER,route_ids TEXT,"+
  "status TEXT NOT NULL CHECK(status IN ('started','finished','abandoned')),"+
  "FOREIGN KEY(property_id) REFERENCES estate_property_ownership(property_id))");
 db.exec("CREATE UNIQUE INDEX IF NOT EXISTS estate_hangar_single_active ON estate_hangar_flights(property_id) WHERE status='started'");
 db.exec("CREATE INDEX IF NOT EXISTS estate_hangar_history ON estate_hangar_flights(property_id,ended_at DESC)");
 const stGet=db.prepare('SELECT paint,trim,callsign FROM estate_hangar_style WHERE property_id=?');
 const flightsGet=db.prepare("SELECT session_id,started_at,ended_at,duration_s,route_ids FROM estate_hangar_flights WHERE property_id=? AND status='finished' ORDER BY ended_at DESC,session_id DESC LIMIT 30");
 const flightBySession=db.prepare('SELECT * FROM estate_hangar_flights WHERE session_id=?');
 const authorized=(propertyId,acct)=>estateHelicopterAccess({propertyId,acct,accessFor,tycoonStore});
 function snapshot(propertyId,acct){
  const valid=authorized(propertyId,acct);if(!valid.ok)return valid;
  const style=stGet.get(propertyId)||DEFAULT_STYLE;
  const flights=flightsGet.all(propertyId).map(f=>({
   sessionId:f.session_id,startedAt:f.started_at,endedAt:f.ended_at,
   durationSeconds:f.duration_s,routeVisited:JSON.parse(f.route_ids||'[]'),verification:'client_reported'
  }));
  const total=db.prepare("SELECT COUNT(*) AS n,COALESCE(SUM(duration_s),0) AS seconds FROM estate_hangar_flights WHERE property_id=? AND status='finished'").get(propertyId);
  const all=db.prepare("SELECT route_ids FROM estate_hangar_flights WHERE property_id=? AND status='finished'").all(propertyId);
  const stops=new Set();let circuit=false;
  for(const row of all){const ids=JSON.parse(row.route_ids||'[]');if(ids.length===3)circuit=true;for(const id of ids)if(STOPS.includes(id))stops.add(id);}
  return {ok:true,propertyId,style:{paint:style.paint,trim:style.trim,callsign:style.callsign},
   choices:{paints:Object.keys(PAINT),trims:Object.keys(TRIM)},
   flights,totals:{completedFlights:total.n,flightSeconds:total.seconds,stopIds:[...stops]},
   milestones:{firstLanding:total.n>=1,frequentPilot:total.n>=10,allLookouts:stops.size===3,oneFlightCircuit:circuit},
   verification:'client_reported',persistent:true,financialRewards:false,tokenRewards:false,scope:'property',sharePolicy:'unchanged'};
 }
 function setStyle({propertyId,acct,paint,trim,callsign}={}){
  const valid=authorized(propertyId,acct);if(!valid.ok)return valid;
  if(!Object.hasOwn(PAINT,paint)||!Object.hasOwn(TRIM,trim)||
   typeof callsign!=='string'||!/^[A-Z0-9][A-Z0-9 -]{1,14}[A-Z0-9]$/.test(callsign)||
   / {2,}/.test(callsign))return {ok:false,error:'invalid_hangar_style'};
  const now=clock();if(!Number.isSafeInteger(now)||now<1)return {ok:false,error:'invalid_hangar_clock'};
  db.prepare("INSERT INTO estate_hangar_style(property_id,paint,trim,callsign,updated_at) VALUES(?,?,?,?,?) "+
   "ON CONFLICT(property_id) DO UPDATE SET paint=excluded.paint,trim=excluded.trim,callsign=excluded.callsign,updated_at=excluded.updated_at")
   .run(propertyId,paint,trim,callsign,now);
  return snapshot(propertyId,acct);
 }
 function startFlight({propertyId,acct}={}){
  const valid=authorized(propertyId,acct);if(!valid.ok)return valid;
  const now=clock();if(!Number.isSafeInteger(now)||now<1)return {ok:false,error:'invalid_hangar_clock'};
  db.exec('BEGIN IMMEDIATE');
  try{
   db.prepare("UPDATE estate_hangar_flights SET status='abandoned',ended_at=? WHERE property_id=? AND status='started' AND (started_at<? OR pilot_acct<>?)")
    .run(now,propertyId,now-SESSION_TTL_MS,acct);
   const existing=db.prepare("SELECT session_id FROM estate_hangar_flights WHERE property_id=? AND pilot_acct=? AND status='started'").get(propertyId,acct);
   if(existing){db.exec('COMMIT');return {ok:true,propertyId,sessionId:existing.session_id,reused:true,verification:'client_reported'};}
   const sessionId=crypto.randomBytes(16).toString('hex');
   db.prepare("INSERT INTO estate_hangar_flights(session_id,property_id,pilot_acct,started_at,status) VALUES(?,?,?,?,'started')")
    .run(sessionId,propertyId,acct,now);
   db.exec('COMMIT');return {ok:true,propertyId,sessionId,reused:false,verification:'client_reported'};
  }catch(e){db.exec('ROLLBACK');throw e;}
 }
 function finishFlight({propertyId,acct,sessionId,durationSeconds,routeVisited}={}){
  const valid=authorized(propertyId,acct);if(!valid.ok)return valid;
  if(typeof sessionId!=='string'||!/^[0-9a-f]{32}$/.test(sessionId))return {ok:false,error:'invalid_flight_session'};
  const row=flightBySession.get(sessionId);
  if(!row||row.property_id!==propertyId||row.pilot_acct!==acct)return {ok:false,error:'flight_session_not_found'};
  if(row.status==='finished')return {...snapshot(propertyId,acct),alreadyFinished:true};
  if(row.status!=='started')return {ok:false,error:'flight_session_expired'};
  const now=clock(),serverElapsed=Math.floor(Math.max(0,now-row.started_at)/1000);
  if(!Number.isSafeInteger(now)||now<row.started_at||now-row.started_at>SESSION_TTL_MS)
   return {ok:false,error:'flight_session_expired'};
  if(!Number.isInteger(durationSeconds)||durationSeconds<0||durationSeconds>5400||
   durationSeconds>serverElapsed+10)return {ok:false,error:'invalid_flight_duration'};
  if(!Array.isArray(routeVisited)||routeVisited.length>STOPS.length||
   routeVisited.some(id=>typeof id!=='string'||!STOPS.includes(id))||
   new Set(routeVisited).size!==routeVisited.length)return {ok:false,error:'invalid_flight_route'};
  const changed=db.prepare("UPDATE estate_hangar_flights SET status='finished',ended_at=?,duration_s=?,route_ids=? "+
   "WHERE session_id=? AND status='started' AND pilot_acct=? AND property_id=?")
   .run(now,durationSeconds,JSON.stringify(routeVisited),sessionId,acct,propertyId);
  if(changed.changes!==1)return {ok:false,error:'flight_session_changed'};
  return snapshot(propertyId,acct);
 }
 return Object.freeze({snapshot,setStyle,startFlight,finishFlight});
}
module.exports={createEstateHangarLogbook,PAINT,TRIM,STOPS,DEFAULT_STYLE};
