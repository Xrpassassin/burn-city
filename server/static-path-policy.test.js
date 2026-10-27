'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {insideRoot,resolvePublicFile}=require('./static-path-policy');
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'burn-static-policy-'));
try{
 const root=path.join(temp,'client'), sibling=path.join(temp,'client-secret');
 fs.mkdirSync(root);fs.mkdirSync(sibling);
 fs.writeFileSync(path.join(root,'index.html'),'ok');
 fs.writeFileSync(path.join(sibling,'secret.txt'),'secret');
 assert.equal(resolvePublicFile(root,'/index.html'),path.join(root,'index.html'));
 assert.equal(resolvePublicFile(root,'/%69ndex.html'),path.join(root,'index.html'));
 assert.equal(resolvePublicFile(root,'/%ZZ'),null);
 assert.equal(resolvePublicFile(root,'/%2e%2e/client-secret/secret.txt'),null);
 assert.equal(resolvePublicFile(root,'/../client-secret/secret.txt'),null);
 assert.equal(resolvePublicFile(root,'/not-found'),null);
 assert.equal(resolvePublicFile(root,'/%00index.html'),null);
 assert.equal(resolvePublicFile(root,'/%5cindex.html'),null);
 assert.equal(resolvePublicFile(root,'/%2e%2e%2fclient-secret%2fsecret.txt'),null);
 assert.equal(resolvePublicFile(root,'/index.html%00.js'),null);
 assert.equal(resolvePublicFile(root,'/index.html?qa=1'),null);
 assert.equal(insideRoot(root,path.join(sibling,'secret.txt')),false);
 fs.symlinkSync(sibling,path.join(root,'outside'),'dir');
 assert.equal(resolvePublicFile(root,'/outside/secret.txt'),null);
 console.log('Static path containment tests passed');
}finally{fs.rmSync(temp,{recursive:true,force:true});}
