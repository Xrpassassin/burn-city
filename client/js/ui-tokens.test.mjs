// Forge design tokens + self-hosted fonts: every @font-face file exists, the OFL license and credit
// ship with them, the token families are complete, and numbers use tabular figures.
import assert from 'node:assert/strict';
import {readFileSync,existsSync,statSync} from 'node:fs';
const root=new URL('../',import.meta.url);
const read=f=>readFileSync(new URL(f,root),'utf8');
const tokens=read('burn-ui-tokens.css');
const faces=[...tokens.matchAll(/url\("([^"]+\.woff2)"\)/g)].map(m=>m[1]);
assert.ok(faces.length>=6,'font faces declared');
for(const f of faces){assert.ok(existsSync(new URL(f,root)),'font file exists: '+f);assert.ok(statSync(new URL(f,root)).size>8000,'font not empty: '+f);
 assert.equal(readFileSync(new URL(f,root)).subarray(0,4).toString('latin1'),'wOF2','woff2 signature: '+f);}
assert.match(tokens,/font-display:swap/);
assert.ok(!/fonts\.googleapis|fonts\.gstatic/.test(tokens),'fonts are self-hosted, no third-party requests');
const ofl=read('fonts/barlow/OFL.txt');assert.match(ofl,/SIL Open Font License, Version 1\.1/);
assert.match(read('city-credits.html'),/Barlow[^]*SIL Open Font License 1\.1/,'font credit entry');
for(const family of ['--bc-font-display','--bc-font-ui','--bc-font-data','--bc-coal-900','--bc-ember','--bc-gold','--bc-heat',
 '--bc-space-4','--bc-radius-md','--bc-cut','--bc-outline-w','--bc-shadow-panel','--bc-lip','--bc-glow-heat','--bc-dur-pop','--bc-ease-pop','--bc-touch-target'])
 assert.match(tokens,new RegExp(family+':'),'token '+family);
assert.match(tokens,/--bc-ember:#ff8b39;/,'canonical ember unchanged (ui-v8 smoke)');
assert.match(tokens,/--bc-touch-target:44px/);
assert.match(tokens,/html\{font-variant-numeric:tabular-nums\}/,'tabular numerals');
assert.match(tokens,/prefers-reduced-motion:reduce\)\{:root\{[^}]*--bc-dur-pop:0ms/,'reduced motion zeroes motion tokens');
assert.match(tokens,/\(pointer:coarse\)[^{]*\{:root\{--bc-blur:none\}/,'no heavy blur on phones');
for(const page of ['index.html','estate-properties.html'])assert.match(read(page),/rel="preload" href="fonts\/barlow\/Barlow-600\.woff2" as="font" type="font\/woff2" crossorigin/,page+' preloads the UI font');
console.log('UI tokens + fonts: '+faces.length+' self-hosted OFL faces, full token set, tabular numerals');
