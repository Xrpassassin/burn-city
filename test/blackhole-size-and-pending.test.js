'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const src=fs.readFileSync(require('node:path').join(__dirname,'../client/js/amm-lock.js'),'utf8');
assert.match(src,/import \{ blackHoleRadius \} from '\.\/blackhole-radius\.mjs'/);
assert.match(src,/pendingIssuer && o\?\.issuer_keys_disabled===true && !!fresh\(o\)/);
assert.match(src,/rH1znLFaK7wtmDGRSu4WPEqHCuofuJHdHP-IMM/);
assert.match(src,/rHqQ84DqPBbd5dRmhGAHrQ7eW3DCkbR9va-58525079726F0000000000000000000000000000/);
// Every singularity (BURN included) is sized by the shared radius module; the
// token name only selects BURN's landmark branch there.
assert.match(src,/const v = tokOf\(k\), n = N\[k\], on = v\.f > 0, R = blackHoleRadius\(\{fraction:v\.f,status:v\.st,token:k\}\)/);
assert.doesNotMatch(src,/R = k==='BURN'/,'no inline BURN radius bypassing blackhole-radius.mjs');
// Fresh verified ledger readings must win over the historical BURN snapshot.
const at=re=>{const m=src.search(re);assert.ok(m>=0,String(re));return m;};
const manual=at(/return \{st:'manual'/);
for(const re of [/if\(supply!==null && fresh\(o\)\)return \{st:'verified'/,/if\(ecosystem!==null && fresh\(o\)\)return \{st:'verified'/,/if\(historical !== null && fresh\(o\)\)return \{st:'verified'/])
  assert.ok(at(re)<manual,'verified path '+re+' must precede the manual fallback');
assert.match(src,/if\(k==='BURN' && N\[k\]\?\.key===BURN_TOKEN_KEY\)return \{st:'manual'/,'fallback is BURN-only, by exact token key');
// The fallback is labeled as historical / not verified everywhere it is shown.
assert.match(src,/s === 'manual' \? '<b[^>]*>◐ HISTORICAL SNAPSHOT \(not live verified\)<\/b>'/);
assert.match(src,/historical visual estimate/);
assert.match(src,/Not a live verified reading/);
assert.match(src,/historical net reduction \(not verified\)/);
// Historical figure: 1e15 original minus 34,843,974,557,394.52 outstanding ≈ 96.5156%.
const frac=(1e15-34_843_974_557_394.52)/1e15;
assert.ok(Math.abs(frac*100-96.5156)<1e-3);
assert.match(src,/BURN_LAST_REPORTED_OUTSTANDING = 34_843_974_557_394\.52/);
console.log('BURN landmark sizing, verified-first fallback order, historical labels and IMM/XRPyro pending marker guards passed');
