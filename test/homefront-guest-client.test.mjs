import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { startGuest, endGuest, isGuest, hasHomefrontPlayer, fetchHomefront } from '../client/arena/homefront-guest.mjs';
import { travelOptions } from '../client/arena/homefront-travel.mjs';
const urls=[], token='a'.repeat(64);
const priorFetch=globalThis.fetch, priorStorage=globalThis.localStorage, priorWindow=globalThis.window;
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
    method:'POST',headers:{'content-type':'application/json',authorization:'Bearer OLD_WALLET_TOKEN'},body:'{}'
  });
  assert(urls[1].url.endsWith('/api/homefront/guest/world/enter'));
  assert.equal(urls[1].options.headers.get('x-homefront-guest'),token);
  assert.equal(urls[1].options.headers.get('content-type'),'application/json');
  assert.equal(urls[1].options.headers.has('authorization'),false,
    'guest requests must strip expired wallet authorization');
  assert.equal(urls[1].options.credentials,'omit',
    'guest requests must not send any same-origin wallet cookies');
  await fetchHomefront('https://burn-city-game.fly.dev','/api/jetpack',{method:'GET'});
  assert(urls[2].url.endsWith('/api/jetpack'),
    'guest tokens do not get redirected to unrelated payment APIs');
  assert(!urls[2].options.headers,'no guest authentication sent to payment APIs');
  endGuest();
  assert.equal(isGuest(),false,'connecting a wallet discards unsaved guest state');
  assert.equal(hasHomefrontPlayer(),false);
  // Only a password-gated isolated PREVIEW may send its session cookie;
  // production guests never send stale wallet cookies or authorization.
  globalThis.window={__BURN_CITY_ISOLATED_PREVIEW__:true};
  await startGuest('https://burn-city-homefront-preview-551.fly.dev');
  assert.equal(urls.at(-1).options.credentials,'same-origin',
    'isolated preview sends its own password session cookie');
  await fetchHomefront('https://burn-city-homefront-preview-551.fly.dev','/api/homefront');
  assert.equal(urls.at(-1).options.credentials,'same-origin',
    'isolated guest API carries the preview access cookie');
  endGuest();
  globalThis.window={__BURN_CITY_ISOLATED_PREVIEW__:false};
  await startGuest('https://burn-city-game.fly.dev');
  assert.equal(urls.at(-1).options.credentials,'omit',
    'a normal production guest can never inherit the preview cookie exception');
  endGuest();
  const guestSource=readFileSync('client/arena/homefront-guest.mjs','utf8');
  assert(!/localStorage\.setItem|sessionStorage/.test(guestSource),
    'a reload does not preserve disposable guest credentials');
  const html=readFileSync('client/arena/homefront.html','utf8');
  assert(html.includes('await startGuest(API)'), 'unauthenticated visitors start playable guest world');
  assert(html.includes('Connect wallet to save'), 'save boundary clearly presented');
  assert(html.includes('endGuest();location.reload()'),
    'wallet sign-in resets the entire guest renderer before loading wallet progress');
  const scene=readFileSync('client/arena/homefront-graveyard-3d.js','utf8');
  assert(scene.includes('homefrontFetch('), 'actual Graveyard scene uses guest-aware transport');
  assert(!scene.includes("fetch(API + '/api/homefront"),
    'all direct world API requests respect guest isolation');
  const guestOptions=travelOptions({party:{leader:true,members:[]}},{guest:true});
  assert.deepEqual(guestOptions.map(o=>o.id),['solo'],
    'guest Homefront only offers private solo exploration');
  assert.deepEqual(travelOptions(null,{guest:true,inWorld:true}).map(o=>o.id),['return'],
    'guest in Wastes can return to private refuge');
  const savedOptions=travelOptions(null,{guest:false});
  assert(savedOptions.some(o=>o.id==='party_create')&&savedOptions.some(o=>o.id==='party_join'),
    'wallet-connected players retain regular multiplayer travel choices');
  assert(html.includes('guest:()=>isGuest()'),
    'actual Travel overlay receives the guest status');
  assert(html.includes('Guest session ended')&&html.includes('Start new guest refuge'),
    'expired session offers a clear new start instead of a stalled game');
  assert(html.includes('Guest survival values are temporary and NOT saved.'),
    'the survival panel must not claim that guest progress is persisted');
  assert(html.includes('guest items and progress will not transfer'),
    'guest tutorial explains the wallet handoff before first gameplay');

  // Real 401 from the disposable server revokes guest capability, not a
  // legitimate wallet session, and NEVER automatically retries a mutation.
  const oldMock=globalThis.fetch, events=[];
  globalThis.window={__BURN_CITY_ISOLATED_PREVIEW__:false,
    dispatchEvent:event=>{events.push(event.type)}};
  await startGuest('https://burn-city-game.fly.dev');
  const beforeCount=urls.length;
  globalThis.fetch=async(url,options)=>{
    urls.push({url,options});
    return new Response(JSON.stringify({error:'guest_session_expired'}),{
      status:401,headers:{'content-type':'application/json'}
    });
  };
  const expired=await fetchHomefront('https://burn-city-game.fly.dev','/api/homefront/action',{
    method:'POST',headers:{'content-type':'application/json'},body:'{"action":{"type":"workday"}}'
  });
  assert.equal(expired.status,401,'expired guests retain original HTTP error');
  assert.equal(urls.length,beforeCount+1,'expired guest mutations are not replayed');
  assert.equal(isGuest(),false,'expired session clears memory-only credential');
  assert.deepEqual(events,['homefront-guest-expired'],
    'one explicit UI recovery prompt instead of silent world replacement');
  globalThis.fetch=oldMock;
  console.log('HOMEFRONT GUEST CLIENT AND WEBGL ROUTING PASSED');
} finally {
  endGuest();
  globalThis.fetch=priorFetch;
  globalThis.localStorage=priorStorage;
  if(priorWindow===undefined)delete globalThis.window;
  else globalThis.window=priorWindow;
}
