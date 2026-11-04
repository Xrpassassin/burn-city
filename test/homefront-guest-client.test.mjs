import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { startGuest, endGuest, isGuest, hasHomefrontPlayer, fetchHomefront } from '../client/arena/homefront-guest.mjs';
const urls=[], token='a'.repeat(64);
const priorFetch=globalThis.fetch, priorStorage=globalThis.localStorage;
globalThis.localStorage={ getItem:()=>null };
globalThis.fetch=async(url,options={})=>{
  urls.push({url,options});
  return {ok:true,json:async()=>({token})};
};
try {
  assert.equal(isGuest(),false);
  assert.equal(hasHomefrontPlayer(),false);
  await startGuest('https://burn-city-game.fly.dev');
  assert.equal(isGuest(),true);
  assert.equal(hasHomefrontPlayer(),true);
  assert.deepEqual(urls[0].options, {method:'POST',cache:'no-store',credentials:'omit'});
  assert(urls[0].url.endsWith('/api/homefront/guest/start'));
  await fetchHomefront('https://burn-city-game.fly.dev','/api/homefront/world/enter',{
    method:'POST',headers:{'content-type':'application/json'},body:'{}'
  });
  assert(urls[1].url.endsWith('/api/homefront/guest/world/enter'));
  assert.equal(urls[1].options.headers['x-homefront-guest'],token);
  assert.equal(urls[1].options.headers['content-type'],'application/json');
  await fetchHomefront('https://burn-city-game.fly.dev','/api/jetpack',{method:'GET'});
  assert(urls[2].url.endsWith('/api/jetpack'),
    'guest tokens do not get redirected to unrelated payment APIs');
  assert(!urls[2].options.headers,'no guest authentication sent to payment APIs');
  endGuest();
  assert.equal(isGuest(),false,'connecting a wallet discards unsaved guest state');
  assert.equal(hasHomefrontPlayer(),false);
  const guestSource=readFileSync('client/arena/homefront-guest.mjs','utf8');
  assert(!/localStorage\.setItem|sessionStorage/.test(guestSource),
    'a reload does not preserve disposable guest credentials');
  const html=readFileSync('client/arena/homefront.html','utf8');
  assert(html.includes('await startGuest(API)'), 'unauthenticated visitors start playable guest world');
  assert(html.includes('Connect wallet to save'), 'save boundary clearly presented');
  assert(html.includes('endGuest();expeditionWorld=null'),
    'wallet sign-in replaces guest world instead of importing unsaved progress');
  const scene=readFileSync('client/arena/homefront-graveyard-3d.js','utf8');
  assert(scene.includes('homefrontFetch('), 'actual Graveyard scene uses guest-aware transport');
  assert(!scene.includes("fetch(API + '/api/homefront"),
    'all direct world API requests respect guest isolation');
  console.log('HOMEFRONT GUEST CLIENT AND WEBGL ROUTING PASSED');
} finally {
  endGuest();
  globalThis.fetch=priorFetch;
  globalThis.localStorage=priorStorage;
}
