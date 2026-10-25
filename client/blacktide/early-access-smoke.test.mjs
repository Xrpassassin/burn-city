// BlackTide early-access static smoke test: run without browser or network.
// Prevent missing controls, broken local imports, or missing vendored loader from shipping.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
const root=path.resolve(import.meta.dirname,'../..');
const page=fs.readFileSync(path.join(root,'client/blacktide/index.html'),'utf8');
const js=fs.readFileSync(path.join(root,'client/blacktide/blacktide.js'),'utf8');
for(const id of ['game','intro','begin','message','speed','heading','hull']) {
  assert.match(page,new RegExp('id="'+id+'"'), 'Missing UI element: '+id);
}
for(const action of ['left','right','forward','back','fire']) {
  assert.match(page,new RegExp('data-control="'+action+'"'), 'Missing touch control: '+action);
}
assert.match(page,/type="module" src="\.\/blacktide\.js"/);
assert.match(page,/"three":"\.\.\/vendor\/three\/build\/three\.module\.min\.js"/);
for(const match of js.matchAll(/from\s+['"]([^'"]+)['"]/g)) {
  const spec=match[1];
  if(spec==='three') continue;
  assert.ok(spec.startsWith('.'),'Unexpected non-local import: '+spec);
  assert.ok(fs.existsSync(path.resolve(root,'client/blacktide',spec)),'Missing import: '+spec);
}
assert.ok(fs.existsSync(path.join(root,'client/vendor/three/build/three.module.min.js')));
assert.ok(fs.existsSync(path.join(root,'client/vendor/three/examples/jsm/loaders/GLTFLoader.js')));
assert.match(js,/Trade\.init\(scene\)/);
assert.match(js,/tick\(\)/);
console.log('BlackTide early-access static smoke checks passed');
