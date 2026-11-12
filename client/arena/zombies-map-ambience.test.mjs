import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
import {createZombiesMapAmbience,zombiesAmbientSites} from './zombies-map-ambience.mjs';
const require=createRequire(import.meta.url);
const {gen}=require('../../server/mapgen.js');
const {Room}=require('../../server/game');
const Cod=require('../../server/cod');

const calls=[];
let muted=false,vol=.3,state='running';
const audio={
 get muted(){return muted;},get vol(){return vol;},
 get ctx_(){return {state};},
 zombieEnvironmentCue(...args){calls.push(args);return true;}
};
const sound=createZombiesMapAmbience(audio);
const src=gen(9864);
const layout={...src,kind:'proc',grid:src.grid,gw:40,gh:32,cell:2};
assert.deepEqual(zombiesAmbientSites(layout),zombiesAmbientSites(layout));
const original=JSON.stringify(layout);
const sites=zombiesAmbientSites(layout);
assert(sites.length>0&&sites.length<=18);
assert(sites.every(s=>['pressure','steam','arc','creak','metal'].includes(s.cue)));
assert.equal(JSON.stringify(layout),original,'audio must never alter authoritative map layout');
const player={x:sites[0].x,z:sites[0].z,y:0};
assert.equal(sound.start(layout).sites,sites.length);
assert.equal(sound.active,true);
assert.equal(sound.tick(100,{x:9999,z:9999,y:0}),false,'off-map audio never plays');
assert.equal(calls.length,0);
for(let i=0;i<1100;i++)sound.tick(.07,player,true);
assert(calls.length>=2&&calls.length<=9,'acoustic cues remain sparse, never every frame');
for(const [cue,x,y,z,gain] of calls){
 assert(['pressure','steam','arc','creak','metal'].includes(cue));
 assert(Number.isFinite(x)&&Number.isFinite(y)&&Number.isFinite(z));
 assert(Math.hypot(x-player.x,z-player.z)<24);
 assert(gain<.5,'environment mix should not overpower the original Zombies gunfire');
}
const beforeMute=calls.length;
muted=true;
for(let i=0;i<500;i++)sound.tick(.07,player,true);
assert.equal(calls.length,beforeMute,'audio respects global mute');
muted=false;vol=0;
for(let i=0;i<500;i++)sound.tick(.07,player,true);
assert.equal(calls.length,beforeMute,'audio respects saved global zero volume');
vol=.3;state='suspended';
for(let i=0;i<500;i++)sound.tick(.07,player,true);
assert.equal(calls.length,beforeMute,'no AutoPlay audio while Safari AudioContext is suspended');
state='running';
for(let i=0;i<450;i++)sound.tick(.07,player,false);
assert.equal(calls.length,beforeMute,'no audio for dead/downed players');
for(let i=0;i<500;i++)sound.tick(.07,player,true);
assert(calls.length>beforeMute);
const afterEnabled=calls.length;
sound.stop();
assert.equal(sound.size,0);
for(let i=0;i<500;i++)sound.tick(.07,player,true);
assert.equal(calls.length,afterEnabled,'leaving Zombies must stop all new atmospheric cues');
const tiny=createZombiesMapAmbience(audio,{mobile:true});
const mobileSites=zombiesAmbientSites(layout,{mobile:true});
assert(mobileSites.length<=sites.length);
tiny.start(layout);
const startMobile=calls.length;
for(let i=0;i<1400;i++)tiny.tick(.07,{x:mobileSites[0].x,z:mobileSites[0].z,y:0},true);
assert(calls.length-startMobile<=8,'mobile audio mix caps event frequency');
tiny.stop();

for(const [name,id] of [['refinery','refinery'],['cosmodrome','cosmodrome'],['random',null]]){
 const room=new Room('zombies-ambience-'+name,'zombie',id==='cosmodrome'?null:id);
 if(name==='cosmodrome')room.mapId='cosmodrome';
 if(name==='random')room.seedT=9827;
 room.reset();Cod.bind(room);
 const actual=Cod.layout();
 const points=zombiesAmbientSites(actual);
 assert(points.length>0,'existing '+name+' map must have anchored, valid sound sources');
 for(const p of points)assert(actual.grid?.length>0&&Number.isFinite(p.x)&&Number.isFinite(p.z));
}
const index=readFileSync(new URL('./index.html',import.meta.url),'utf8');
assert(index.includes("ZENV.start(m.map)")&&index.includes("ZENV.start(e.map)"),
 'initial Zombies map and helicopter map transitions must reset ambience');
assert(index.includes("ZENV.stop()")&&index.includes("ZENV.tick(dt,pred"),
 'audio only active in original Zombies runtime; cleanly torn down');
const sfx=readFileSync(new URL('./sfx.js',import.meta.url),'utf8');
assert(sfx.includes('zombieEnvironmentCue(kind,x,y,z,gain=0.45)'));
assert(sfx.includes('if(!ready()||![x,y,z,gain].every(Number.isFinite))return false'));
assert(sfx.includes('pan.connect(bus)')&&sfx.includes('source.onended=()=>pan.disconnect()'),
 'new sounds must obey the existing user-mute bus and release spatial nodes');
console.log('Original Zombies spatial environmental audio passed: deterministic authored zones, sparse events, real maps, Safari unlock, mute/volume, transition and teardown, mobile caps.');
