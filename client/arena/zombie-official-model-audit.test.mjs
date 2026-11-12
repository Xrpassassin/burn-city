import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {COMMUNITY_ART,enabledCommunityArt} from './community-art-intake.mjs';
const nurse=COMMUNITY_ART.find(x=>x.id==='mutant-nurse');
const blob=COMMUNITY_ART.find(x=>x.id==='living-flesh-blob');
for(const spec of [nurse,blob]){
 assert(spec&&spec.mode==='zombies'&&spec.installed===false,
  'Art source not licensed-and-verified in an actual local GLB: never mark as installed');
 assert.equal(spec.license,'CC-BY-4.0');
 assert.equal(spec.sha256,null);
}
assert.equal(enabledCommunityArt('zombies').length,0);
const source=readFileSync(new URL('../../scripts/acquire-official-zombies-sketchfab.mjs',import.meta.url),'utf8');
assert(source.includes('2bc6e1cac98e458a824691009ef2433c'));
assert(source.includes('6357bbc094d54cf5ba150ef2951b3750'));
assert(source.includes("meta")||source.includes("metadata"));
assert(source.includes("metadata.license?.slug!=='by'"));
assert(source.includes("metadata.isDownloadable!==true"));
assert(source.includes("Authorization:'Bearer '+token"));
assert(source.includes("token.length<12"),'never allow unauthenticated viewer ripping');
assert(!source.includes('sketchfab-prod-media.s3.amazonaws.com'),'never bake a signed CDN link');
assert(source.includes("REVIEW_ONLY_NOT_INSTALLED"));
assert(!source.includes("installed:true"));
const python=readFileSync(new URL('../../scripts/convert-official-zombies-sketchfab.py',import.meta.url),'utf8');
assert(python.includes("zipfile.ZipFile")&&python.includes("ZIP symlinks not permitted"));
assert(python.includes("total>250_000_000"));
assert(python.includes("export_format='GLB'"));
const workflow=readFileSync(new URL('../../.github/workflows/zombie-special-sketchfab-official-audit.yml',import.meta.url),'utf8');
assert(workflow.includes('workflow_dispatch:'));
assert(workflow.includes('github.ref == \'refs/heads/main\''));
assert(workflow.includes('secrets.SKETCHFAB_OAUTH_TOKEN'));
assert(workflow.includes('source-review.glb'));
assert(!workflow.includes('git push')&&!workflow.includes('contents: write'),
 'official art preview must never automatically commit or enable GLBs');
console.log('Official Sketchfab nurse/flesh-blob source gate passed: two exact CC BY UIDs, user-owned OAuth only, safe ZIP scan, rig review, no art auto-deployment.');
