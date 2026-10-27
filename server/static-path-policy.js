'use strict';
const path=require('node:path');
const fs=require('node:fs');
function insideRoot(root,candidate){
 const rel=path.relative(path.resolve(root),path.resolve(candidate));
 return rel===''||(rel!=='..'&&!rel.startsWith('..'+path.sep)&&!path.isAbsolute(rel));
}
function resolvePublicFile(root,pathname){
 if(typeof pathname!=='string')return null;
 let decoded;
 try{decoded=decodeURIComponent(pathname);}catch{return null;}
 if(!decoded.startsWith('/')||decoded.includes('\\')||decoded.includes('\0'))return null;
 const base=path.resolve(root);
 const candidate=path.resolve(base,'.'+decoded);
 if(!insideRoot(base,candidate))return null;
 // Existing symlink components must not escape the public root.
 try{
  const realRoot=fs.realpathSync(base);
  const realCandidate=fs.realpathSync(candidate);
  if(!insideRoot(realRoot,realCandidate))return null;
 }catch{return null;}
 return candidate;
}
module.exports={insideRoot,resolvePublicFile};
