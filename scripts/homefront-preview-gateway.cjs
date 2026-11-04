// Ephemeral Homefront-only preview gateway: serves real gameplay client code,
// but synthetic in-memory accounts. No production server, ledger, wallet,
// payments, persisted saves, or GitHub-volume boot sequence is loaded here.
'use strict';
const http = require('node:http');
const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');

const secret = process.env.HOMEFRONT_PREVIEW_PASSWORD || '';
if (secret.length < 20 || /^(?:changeme|password|preview|test)/i.test(secret)) {
  console.error('HOMEFRONT_PREVIEW_PASSWORD: nontrivial separate preview secret required (>=20 chars)');
  process.exit(1);
}
if (process.env.HOMEFRONT_CONTINUOUS_MOVEMENT === '1') {
  console.error('Continuous movement must remain disabled in isolated Homefront UI preview');
  process.exit(1);
}
if (process.env.HOMEFRONT_PREVIEW_MODE !== '1') {
  console.error('HOMEFRONT_PREVIEW_MODE=1 is required for this dedicated preview server');
  process.exit(1);
}
const ACCOUNT='preview-refuge-player';
const FAKE_BEARER='preview-only-inmemory-bearer';
const ROOT=path.resolve(__dirname,'../client');
const COOKIE='homefront_preview';
// Tokens are per-login, unpredictable and expire on the server as well as the
// browser. A deterministic cookie would remain valid after Max-Age expires.
const SESSION_MS=4*60*60*1000;
const sessions=new Map();
const loginFailures=new Map();
const files=new Map();
const copy=value=>structuredClone(value);
const store={
  load(name,fallback){return files.has(name)?copy(files.get(name)):fallback;},
  save(name,value){files.set(name,copy(value));}
};
const Homefront=require('../server/homefront');
const mime={
  '.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8',
  '.mjs':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8',
  '.json':'application/json','.png':'image/png','.jpg':'image/jpeg',
  '.jpeg':'image/jpeg','.webp':'image/webp','.svg':'image/svg+xml',
  '.glb':'model/gltf-binary','.gltf':'model/gltf+json','.mp3':'audio/mpeg',
  '.ogg':'audio/ogg','.wav':'audio/wav','.woff2':'font/woff2',
  '.ico':'image/x-icon','.gif':'image/gif'
};
const headers={
  'Cache-Control':'no-store',
  'X-Content-Type-Options':'nosniff',
  'X-Frame-Options':'DENY',
  'Referrer-Policy':'no-referrer',
  'Content-Security-Policy':"default-src 'self' data: blob:; connect-src 'self' blob:; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; media-src 'self' data: blob:; font-src 'self' data:; worker-src 'self' blob:; form-action 'self'; frame-ancestors 'none'",
  'Cross-Origin-Resource-Policy':'same-origin'
};
function send(res,status,type,body,additional={}) {
  res.writeHead(status,{...headers,'Content-Type':type,...additional});
  res.end(body);
}
function json(res,status,obj) {
  send(res,status,'application/json; charset=utf-8',JSON.stringify(obj));
}
function authed(req) {
  const cookies=String(req.headers.cookie||'').split(';').map(x=>x.trim());
  const value=cookies.find(x=>x.startsWith(COOKIE+'='))?.slice(COOKIE.length+1)||'';
  if(!/^[a-f0-9]{64}$/.test(value)) return false;
  const expires=sessions.get(value);
  if(!expires)return false;
  if(expires<=Date.now()){sessions.delete(value);return false;}
  return true;
}
function loginPage(message='') {
  const warning=message?'<p role="alert">Access denied. Check the preview password.</p>':'';
  return '<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width, initial-scale=1"><title>BURN City · Homefront preview</title><style>body{background:#12100f;color:#f8e5cd;font:16px system-ui;min-height:95vh;display:grid;place-items:center}main{padding:24px;max-width:400px;border:1px solid #86563c;border-radius:16px;background:#231b18}input,button{display:block;width:100%;box-sizing:border-box;margin-top:14px;padding:14px;border-radius:8px}button{background:#a55626;color:white;border:0;font-weight:bold}p{line-height:1.45}</style></head><body><main><h1>Homefront UI preview</h1><p>Isolated synthetic player and disposable world. No wallets, real purchases, or production saves.</p>'+warning+'<form method="POST" action="/preview-login"><label>Preview access password<input type="password" name="password" required autocomplete="off"></label><button type="submit">Open preview</button></form></main></body></html>';
}
function renderGame(html) {
  const intro='<script>localStorage.setItem("bcToken",'+JSON.stringify(FAKE_BEARER)+');localStorage.setItem("bcAcct",'+JSON.stringify(ACCOUNT)+');localStorage.setItem("bcHomefrontTutorial:'+ACCOUNT+'","seen");window.__BURN_CITY_ISOLATED_PREVIEW__=true;</script>'+
    '<style>#homefrontPreviewMarker{position:fixed;right:calc(9px + env(safe-area-inset-right));bottom:calc(8px + env(safe-area-inset-bottom));z-index:9999;font:700 10px system-ui;letter-spacing:.05em;padding:6px 9px;border:1px solid #df9d57aa;background:#29170ded;color:#ffe0b4;border-radius:8px;pointer-events:none}</style>';
  const marker='<div id="homefrontPreviewMarker" aria-label="Isolated test environment">PREVIEW · SYNTHETIC DATA · NO PAYMENTS</div>';
  return html.replace('</head>',intro+'</head>').replace('</body>',marker+'</body>');
}
async function parseBody(req,max=4096) {
  let value='',size=0;
  for await (const chunk of req) {
    size+=chunk.length;
    if(size>max)throw new Error('request_too_large');
    value+=chunk.toString('utf8');
  }
  return value;
}
const app=http.createServer(async(req,res)=>{
  const url=new URL(req.url||'/', 'http://localhost');
  try{
    if(url.pathname==='/healthz'&&req.method==='GET')return json(res,200,{status:'preview',saves:'memory-only',payments:false});
    if(url.pathname==='/preview-login'&&req.method==='POST'){
      const ip=req.socket.remoteAddress||'unknown';
      const state=loginFailures.get(ip)||{count:0,until:Date.now()+60000};
      if(state.until<Date.now()){state.count=0;state.until=Date.now()+60000;}
      if(state.count>=10)return send(res,429,'text/plain','Too many attempts');
      state.count++;loginFailures.set(ip,state);
      const input=new URLSearchParams(await parseBody(req));
      const provided=Buffer.from(input.get('password')||'');
      const actual=Buffer.from(secret);
      if(provided.length!==actual.length||!crypto.timingSafeEqual(provided,actual)){
        return send(res,403,'text/html; charset=utf-8',loginPage(true));
      }
      state.count=0;
      for(const [token,expires] of sessions){
        if(expires<=Date.now())sessions.delete(token);
      }
      const token=crypto.randomBytes(32).toString('hex');
      sessions.set(token,Date.now()+SESSION_MS);
      res.writeHead(303,{...headers,'Location':'/arena/homefront.html',
        'Set-Cookie':COOKIE+'='+token+'; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=14400'});
      return res.end();
    }
    if(!authed(req))return send(res,401,'text/html; charset=utf-8',loginPage());
    if(req.method!=='GET'&&req.method!=='HEAD'&&req.method!=='POST'){
      return json(res,405,{error:'method_not_allowed'});
    }
    if(url.pathname==='/api/jetpack'&&req.method==='GET'){
      return json(res,200,{owned:{homefront:false},payments:false});
    }
    if(url.pathname.startsWith('/api/')){
      if(!(url.pathname==='/api/homefront'||url.pathname.startsWith('/api/homefront/'))){
        return json(res,404,{error:'preview_only_homefront'});
      }
      const raw= req.method==='POST' ? await parseBody(req,65536) : '';
      const wrapped={...req,method:req.method};
      const served=await Homefront.handle(wrapped,res,url,{
        json,ip:'127.0.0.1',gate:()=>false,who:()=>({acct:ACCOUNT}),
        body:async()=>raw?JSON.parse(raw):{},store
      });
      if(!served)return json(res,404,{error:'preview_endpoint_not_found'});
      return;
    }
    if(req.method!=='GET'&&req.method!=='HEAD')return json(res,405,{error:'read_only_asset'});
    const pathname=url.pathname==='/'?'/arena/homefront.html':decodeURIComponent(url.pathname);
    const target=path.resolve(ROOT,'.'+pathname);
    if(!target.startsWith(ROOT+path.sep)||!mime[path.extname(target)]){
      return json(res,404,{error:'asset_not_available'});
    }
    let data=await fs.readFile(target);
    if(pathname==='/arena/homefront.html')data=Buffer.from(renderGame(data.toString('utf8')));
    if(req.method==='HEAD'){
      res.writeHead(200,{...headers,'Content-Type':mime[path.extname(target)]});
      return res.end();
    }
    send(res,200,mime[path.extname(target)],data);
  }catch(error){
    const known=error?.code==='ENOENT'?404:400;
    return json(res,known,{error:known===404?'asset_not_found':'invalid_preview_request'});
  }
});
const port=Number(process.env.PORT||8080);
app.listen(port,'0.0.0.0',()=>console.log('Isolated Homefront UI preview serving on '+port));
module.exports={app};
