// Gate and safety assertions for the isolated Homefront-only Fly preview.
// Exercises a REAL HTTP process and actual Homefront GET/POST handlers against
// isolated disposable guest sessions. Requires no Fly token or network.
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { createServer } from 'node:net';
import { once } from 'node:events';
const pass='pr551-local-only-password-that-is-never-used-in-fly';
const bare=spawnSync(process.execPath,['scripts/homefront-preview-gateway.cjs'],{
  env:{...process.env,HOMEFRONT_PREVIEW_MODE:'1',HOMEFRONT_PREVIEW_PASSWORD:''},
  encoding:'utf8',timeout:12000
});
assert.equal(bare.status,1,'preview refuses to boot without its independent access password');
assert.match(bare.stderr,/HOMEFRONT_PREVIEW_PASSWORD/);

const freePort=async()=>{
  const srv=createServer();
  srv.listen(0,'127.0.0.1');
  await once(srv,'listening');
  const port=srv.address().port;
  await new Promise(ok=>srv.close(ok));
  return port;
};
const port=await freePort();
const child=spawn(process.execPath,['scripts/homefront-preview-gateway.cjs'],{
  env:{...process.env,PORT:String(port),HOMEFRONT_PREVIEW_MODE:'1',
    HOMEFRONT_PREVIEW_PASSWORD:pass,HOMEFRONT_CONTINUOUS_MOVEMENT:'0',
    DRY_RUN:'true',BURN_JOB_IN_SERVER:'false',DATA_DIR:'/tmp/homefront-preview-test-'+port},
  stdio:['ignore','pipe','pipe']
});
let stdout='',stderr='';
child.stdout.on('data',chunk=>{stdout+=chunk;});
child.stderr.on('data',chunk=>{stderr+=chunk;});
const site='http://localhost:'+port;
const get=async(path,opts={})=>fetch(site+path,{redirect:'manual',...opts});
const form=(pw)=>new URLSearchParams({password:pw}).toString();
try{
  let ready=false;
  for(let i=0;i<80;i++){
    try{const response=await get('/healthz');if(response.ok){ready=true;break;}}catch{}
    await new Promise(ok=>setTimeout(ok,150));
    if(child.exitCode!==null)throw Error('preview exited: '+stderr);
  }
  assert(ready,'isolated preview binds a fresh local port');
  const health=await (await get('/healthz')).json();
  assert.deepEqual(health,{status:'preview',saves:'memory-only',payments:false});
  for(const pathname of ['/','/arena/homefront.html','/api/homefront/guest/start',
    '/api/homefront/guest/world','/client/arena/homefront-hud.mjs','/api/estates/status']){
    const response=await get(pathname);
    assert.equal(response.status,401,'unauthenticated request cannot access '+pathname);
  }
  const wrong=await get('/preview-login',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:form('incorrect')});
  assert.equal(wrong.status,403,'incorrect password rejected');
  assert(!(wrong.headers.get('set-cookie')||'').includes('homefront_preview='),
    'password failure must never issue a session');

  const login=await get('/preview-login',{method:'POST',
    headers:{'content-type':'application/x-www-form-urlencoded'},body:form(pass)});
  assert.equal(login.status,303,'correct password redirects to the test game');
  assert.equal(login.headers.get('location'),'/arena/homefront.html');
  const cookieHeader=login.headers.get('set-cookie')||'';
  for(const attribute of ['HttpOnly','Secure','SameSite=Strict','Max-Age=14400']){
    assert(cookieHeader.includes(attribute),'preview session cookie must use '+attribute);
  }
  const cookie=cookieHeader.split(';')[0];
  const h={cookie};
  // The browser Max-Age is not a server-side expiry. Ensure the gateway
  // issues independent random sessions instead of a reusable HMAC cookie.
  const relogin=await get('/preview-login',{method:'POST',
    headers:{'content-type':'application/x-www-form-urlencoded'},body:form(pass)});
  assert.equal(relogin.status,303,'second valid login creates a fresh session');
  const secondCookie=(relogin.headers.get('set-cookie')||'').split(';')[0];
  assert.match(secondCookie,/^homefront_preview=[a-f0-9]{64}$/);
  assert.notEqual(secondCookie,cookie,
    're-login does not return a deterministic reusable preview cookie');
  const forged=cookie.slice(0,-1)+(cookie.endsWith('a')?'b':'a');
  assert.equal((await get('/api/homefront/guest/start',{method:'POST',headers:{cookie:forged}})).status,401,
    'tampered session token is never accepted');
  const started=await get('/api/homefront/guest/start',{method:'POST',headers:{cookie:secondCookie}});
  assert.equal(started.status,200,'preview password permits isolated guest creation only');
  const {token:guestToken,persistent,multiplayer}=await started.json();
  assert.match(guestToken,/^[a-f0-9]{64}$/);
  assert.equal(persistent,false);
  assert.equal(multiplayer,false);
  const page=await get('/arena/homefront.html',{headers:h});
  assert.equal(page.status,200);
  const csp=page.headers.get('content-security-policy')||'';
  assert(csp.includes("connect-src 'self' blob:"),
    'preview permits local Three.js GLTF blob texture loads');
  assert(!csp.includes("connect-src *")&&!csp.includes("connect-src https:"),
    'preview forbids external fetches and wallet endpoints');
  const html=await page.text();
  assert(html.includes('window.__BURN_CITY_ISOLATED_PREVIEW__=true'),
    'preview always marks its isolated game');
  assert(html.includes('GUEST PREVIEW · UNSAVED · NO PAYMENTS'),
    'cannot mistake testing server for the production game');
  assert(!html.includes('preview-only-inmemory-bearer') &&
    html.includes('localStorage.removeItem("bcToken")'),
    'preview must never inject a fake authenticated wallet session');
  assert(html.includes('homefront-hud.mjs'),
    'preview serves production Homefront UI and actual renderer source');

  const gh={...h,'x-homefront-guest':guestToken};
  assert.equal((await get('/api/homefront/guest',{headers:h})).status,401,
    'preview password alone cannot access a guest world without its guest token');
  const data=await get('/api/homefront/guest',{headers:gh});
  assert.equal(data.status,200,'actual Homefront handler serves guest refuge');
  const state=await data.json();
  assert.equal(state.mode,'homefront');
  assert(state.base&&state.base.owner.startsWith('guest_'));
  const second=await (await get('/api/homefront/guest/start',{method:'POST',headers:h})).json();
  assert.notEqual(second.token,guestToken,'guest worlds have separate identities');
  assert.equal((await get('/api/homefront',{headers:gh})).status,404,
    'guest token never grants access to wallet-scoped Homefront route');
  const jet=await get('/api/jetpack',{headers:h});
  assert.equal(jet.status,200);
  assert.equal((await jet.json()).payments,false);

  // No live Estates, payment, token, Xaman or generic BURN City route exists.
  for(const route of ['/api/estates','/api/estates/status',
    '/api/estates/purchase/payment/start','/api/signin','/api/signin/finish',
    '/api/xumm','/api/burn']){
    for(const method of ['GET','POST']){
      const res=await get(route,{method,headers:{...h,'content-type':'application/json'},
        ...(method==='POST'?{body:'{}'}:{})});
      assert.equal(res.status,404,'non-Homefront route blocked: '+method+' '+route);
    }
  }
  const invalidAction=await get('/api/homefront/guest/action',{method:'POST',
    headers:{...gh,'content-type':'application/json'},body:'{"action":{"type":"not_real"}}'});
  assert([400,404].includes(invalidAction.status),'invalid fake action rejected by real game rules');
  const check=await get('/api/homefront/guest',{headers:gh});
  assert.equal(check.status,200,'testing a rejected action cannot corrupt disposable refuge');

  const staticSource=await get('/arena/homefront-hud.mjs',{headers:h});
  assert.equal(staticSource.status,200,'real HUD module available under preview');
  assert.match(await staticSource.text(),/createHud/);
  const forbidden=await get('/.env',{headers:h});
  assert.equal(forbidden.status,404,'sensitive config files never served');
  const redirect=await get('/',{headers:h});
  assert.equal(redirect.status,200,'signed-in user enters preview');
  console.log('HOMEFRONT FLY PREVIEW SECURITY GATE PASSED',JSON.stringify({
    passwordRequired:true,secureCookie:true,assetsProtected:true,
    disposableGuestRefuge:true,strictApiAllowlist:true,
    walletsPaymentsAndEstatesUnavailable:true,productionDataUnaffected:true
  }));
}finally{
  child.kill('SIGTERM');
  await Promise.race([once(child,'exit'),new Promise(ok=>setTimeout(ok,2000))]);
}
