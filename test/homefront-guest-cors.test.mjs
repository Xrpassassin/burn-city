// Regression for cross-origin Homefront Guest Play served from GitHub Pages.
// Evaluate ONLY the actual production CORS response function; do not start
// production's money/ledger server or load any production secrets.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const source=readFileSync('server/server.js','utf8');
const start=source.indexOf('const ORIGINS = ');
const end=source.indexOf('const gates =',start);
assert(start>=0&&end>start,'actual server CORS response source is available');
const json=vm.runInNewContext(source.slice(start,end)+'\njson;',Object.create(null));
assert.equal(typeof json,'function');
assert.match(source,/if \(req\.method === 'OPTIONS'\) return json\(res, 204, \{\}\)/,
  'real server handles CORS OPTIONS before API auth and routes');

function call(origin){
  let status=null,headers=null,body=null;
  const res={
    req:{headers:{origin}},
    writeHead(code,h){status=code;headers=h;},
    end(content){body=content;}
  };
  json(res,204,{});
  return {status,headers,body};
}
const github=call('https://xrpassassin.github.io');
assert.equal(github.status,204);
assert.equal(github.headers['access-control-allow-origin'],
  'https://xrpassassin.github.io',
  'the GitHub Pages client is a specifically allowed origin');
const allowed=github.headers['access-control-allow-headers']
  .split(',').map(s=>s.trim().toLowerCase());
for(const header of ['authorization','content-type','x-homefront-guest'])
  assert(allowed.includes(header),'cross-origin gameplay preflight permits '+header);
assert(!allowed.includes('x-admin-token'),
  'guest capability must not broaden privileged admin headers');
assert(github.headers['access-control-allow-methods'].includes('OPTIONS'));
assert.equal(github.headers['cache-control'],'no-store',
  'guest credentials and game states must not be cached');
assert.notEqual(github.headers['access-control-allow-origin'],'*',
  'guest capability never allows arbitrary third-party origins');
const bad=call('https://unauthorized.example');
assert.notEqual(bad.headers['access-control-allow-origin'],'https://unauthorized.example',
  'attacker-controlled origins cannot be reflected by the server');
console.log('HOMEFRONT GITHUB-PAGES GUEST CORS PREFLIGHT PASSED');
