// First-pass static scanner for explicitly staged external code; not a security guarantee.
// Usage: node scripts/audit-external-code.mjs path/to/vendor-file-or-directory
import fs from 'node:fs';
import path from 'node:path';
const roots=process.argv.slice(2);
if(!roots.length){console.error('Usage: node scripts/audit-external-code.mjs <paths...>');process.exit(2);}
const patterns=[
 ['shell-pipe',/(?:curl|wget)\b[^\n]{0,200}\|\s*(?:sh|bash|zsh)\b/i],
 ['dynamic-eval',/\b(?:eval\s*\(|new\s+Function\s*\()/],
 ['child-process',/\b(?:child_process|execSync|spawnSync|execFileSync)\b/],
 ['credential-access',/\b(?:process\.env|\.ssh\/|\.aws\/|seed\s*phrase|private\s*key)\b/i],
 ['remote-code',/\b(?:import\s*\(\s*['"]https?:|fetch\s*\([^)]*\)[^\n]{0,120}\beval\b)/i],
 ['install-hook',/\b(?:preinstall|postinstall|prepare)\b/i],
 ['encoded-execution',/\b(?:atob|Buffer\.from)\s*\([^\n]{0,150}(?:base64|eval|Function)/i]
];
const allowed=new Set(['.js','.mjs','.cjs','.ts','.tsx','.jsx','.json','.yaml','.yml','.sh','.md','.mdc','.wgsl','.html']);
const findings=[];let checked=0;
function scan(p){
 const stat=fs.lstatSync(p);
 if(stat.isSymbolicLink())throw Error('Refusing symlink: '+p);
 if(stat.isDirectory()){
  for(const name of fs.readdirSync(p)){
   if(name==='node_modules'||name==='.git')continue;
   scan(path.join(p,name));
  }
  return;
 }
 if(!stat.isFile()||!allowed.has(path.extname(p)))return;
 if(stat.size>2_000_000){findings.push([p,0,'oversized-file']);return;}
 checked++;
 const lines=fs.readFileSync(p,'utf8').split(/\r?\n/);
 lines.forEach((line,i)=>{for(const [name,re] of patterns)if(re.test(line))findings.push([p,i+1,name]);});
}
try{for(const p of roots)scan(p);}catch(e){console.error(e.message);process.exit(2);}
for(const [p,line,name] of findings)console.log(`${p}:${line}: REVIEW ${name}`);
console.log(`Scanned ${checked} source files; ${findings.length} review findings.`);
process.exit(findings.length?1:0);
