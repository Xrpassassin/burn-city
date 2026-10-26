'use strict';
// Isolated chain-neutral preview server. Does NOT import legacy XRPL services.
// Explicitly not a multiplayer/gameplay server yet.
const http=require('node:http');
const fs=require('node:fs');
const path=require('node:path');
const {resolveWorldProfile}=require('./world-profiles');
function createWorldPreviewServer({world='sol',clientRoot=path.resolve(__dirname,'../../client')}={}){
  const profile=resolveWorldProfile(world);
  const root=path.resolve(clientRoot);
  return http.createServer((req,res)=>{
    const url=new URL(req.url,'http://localhost');
    const send=(status,body,type='application/json')=>{
      res.writeHead(status,{'content-type':type,'cache-control':'no-store','x-content-type-options':'nosniff'});
      res.end(type==='application/json'?JSON.stringify(body):body);
    };
    if(req.method!=='GET'&&req.method!=='HEAD')return send(405,{error:'method_not_allowed'});
    if(url.pathname==='/api/world-config')return send(200,{
      id:profile.id,brand:profile.brand,chain:profile.chain,network:profile.network,
      features:profile.enabledFeatures,previewOnly:true
    });
    if(url.pathname==='/health')return send(200,{ok:true,world:profile.id,previewOnly:true});
    if(url.pathname.startsWith('/api/')||url.pathname.startsWith('/admin/')||
       url.pathname==='/data.js')return send(404,{error:'feature_unavailable'});
    // Serve only inert web assets in preview mode; no legacy HTML/JS bootstraps
    // that may invoke XRPL routes or start game clients.
    const allowed={'.css':'text/css','.png':'image/png','.jpg':'image/jpeg',
      '.jpeg':'image/jpeg','.webp':'image/webp','.svg':'image/svg+xml',
      '.glb':'model/gltf-binary','.woff2':'font/woff2'};
    let decoded;
    try{decoded=decodeURIComponent(url.pathname)}catch{return send(400,{error:'invalid_path'})}
    const segments=decoded.split('/');
    if(decoded.includes('\\')||decoded.includes('\0')||segments.some(s=>s==='..'||s.startsWith('.')))
      return send(400,{error:'invalid_path'});
    const target=path.resolve(root,'.'+decoded);
    const rel=path.relative(root,target);
    if(!rel||rel==='..'||rel.startsWith('..'+path.sep)||path.isAbsolute(rel))
      return send(404,{error:'not_found'});
    const ext=path.extname(target).toLowerCase();
    if(!allowed[ext])return send(404,{error:'not_found'});
    let real;
    try{real=fs.realpathSync(target)}catch{return send(404,{error:'not_found'})}
    const realRel=path.relative(root,real);
    if(realRel==='..'||realRel.startsWith('..'+path.sep)||path.isAbsolute(realRel))
      return send(404,{error:'not_found'});
    try{
      if(!fs.statSync(real).isFile())return send(404,{error:'not_found'});
      res.writeHead(200,{'content-type':allowed[ext],'cache-control':'no-store','x-content-type-options':'nosniff'});
      if(req.method==='HEAD')return res.end();
      fs.createReadStream(real).pipe(res);
    }catch{return send(404,{error:'not_found'})}
  });
}
if(require.main===module){
  const world=process.env.GAME_WORLD||'sol';
  if(world!=='sol')throw new Error('Preview entry point only supports sol');
  const port=Number(process.env.PORT||8080);
  createWorldPreviewServer({world}).listen(port,()=>console.log('SOL City isolated preview on '+port));
}
module.exports={createWorldPreviewServer};
