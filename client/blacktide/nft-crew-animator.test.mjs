import assert from 'node:assert/strict';
import { createCrewAnimator } from './nft-crew-animator.mjs';
const events=[];
class Mixer {
  clipAction(clip) {return {reset(){return this;},fadeIn(){return this;},fadeOut(){return this;},play(){events.push(clip.name);}};}
  update(dt){events.push(dt);}
  stopAllAction(){events.push('stop');}
  uncacheRoot(){events.push('uncache');}
}
const a=createCrewAnimator({THREE:{AnimationMixer:Mixer},model:{},animations:[{name:'Idle'},{name:'Walk'}]});
assert.equal(a.ok,true);assert.equal(a.playIdle(),true);assert.equal(a.play('walk'),true);assert.equal(a.play('missing'),false);
a.update(2);a.update(-1);assert.ok(events.includes(.1));assert.equal(events.filter(x=>typeof x==='number').length,1);
a.dispose();assert.ok(events.includes('stop'));assert.ok(events.includes('uncache'));
assert.equal(createCrewAnimator({THREE:{},model:{}}).ok,false);
console.log('BlackTide NFT crew animator tests passed');
