// Regenerates client/city-credits.html from client/assets/citizens/models.json and client/assets/props/props.json
import { readFileSync, writeFileSync } from 'node:fs';
const root = new URL('../../client/', import.meta.url);
const { models } = JSON.parse(readFileSync(new URL('assets/citizens/models.json', root)));
const { props } = JSON.parse(readFileSync(new URL('assets/props/props.json', root)));
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const propRows = props.map(m => `<li><a href="${esc(m.url)}" target="_blank" rel="noopener">"${esc(m.title)}"</a> by <a href="${esc(m.artistUrl)}" target="_blank" rel="noopener">${esc(m.artist)}</a>, licensed under <a href="${esc(m.licenseUrl)}" target="_blank" rel="noopener">${esc(m.license)}</a> — ${esc(m.use)}</li>`).join('\n');
const rows = models.map(m => `<li><a href="${esc(m.url)}" target="_blank" rel="noopener">"${esc(m.title)}"</a> by <a href="${esc(m.artistUrl)}" target="_blank" rel="noopener">${esc(m.artist)}</a>, licensed under <a href="http://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noopener">CC BY 4.0</a></li>`).join('\n');
writeFileSync(new URL('city-credits.html', root), `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>BURN City · artists &amp; licenses</title>
<style>body{margin:0;background:#0c0a0d;color:#eee;font:15px/1.55 system-ui;padding:22px}main{max-width:760px;margin:auto}h1{color:#ffb16a;font:800 22px/1.2 monospace}a{color:#ffbd84}li{margin:8px 0}p{color:#b9b2b0}</style></head><body><main>
<h1>BURN City · artists &amp; licenses</h1>
<h2>City citizens (3D people)</h2>
<p>The people walking around BURN City are based on these 3D models from Sketchfab. Changes: the meshes were simplified for phones, textures were resized and re-encoded, a humanoid skeleton was added (with hand and thigh skin weights separated), and original walk and idle animations, per-person gaits and idle gestures were created in-house.</p>
<ul>
${rows}
</ul>
<h2>Street props &amp; animals</h2>
<p>These props and animals are based on 3D models from Sketchfab. Changes: the meshes were simplified and merged for phones, textures were resized and re-encoded, and the motion (doors sliding, birds flying, ducks paddling, boat bobbing) is driven by the game.</p>
<ul>
${propRows}
</ul>
<p><a href="./">Back to BURN City</a></p>
</main></body></html>
`);
console.log('city-credits.html:', models.length, 'models,', props.length, 'props');
