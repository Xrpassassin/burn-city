import assert from 'node:assert/strict';
import {blackHoleRadius} from './blackhole-radius.mjs';
assert.ok(blackHoleRadius({fraction:.965156,status:'verified'})>14);
assert.ok(blackHoleRadius({fraction:.035224328,status:'partial'})>4.5);
assert.ok(blackHoleRadius({fraction:.000595847,status:'partial'})>3.5);
assert.ok(blackHoleRadius({fraction:.3945887469710871,status:'estimated'})>7.7);
assert.ok(blackHoleRadius({fraction:.3945887469710871,status:'estimated'})<blackHoleRadius({fraction:.3945887469710871,status:'verified'}));
assert.equal(blackHoleRadius({fraction:.08,status:'history_pending'}),2.2);
assert.equal(blackHoleRadius({fraction:1,status:'unverified'}),2.2);
assert.equal(blackHoleRadius({fraction:0,status:'verified'}),2);
assert.equal(blackHoleRadius({fraction:NaN,status:'partial'}),3.4);
console.log('Verified, preview and fixed issuer-only sizing are independent');
// BURN landmark core: ~48 units at the historical/verified ~96.5% reduction.
{
  const f=(1e15-34_843_974_557_394.52)/1e15;
  for(const status of ['manual','verified']){
    const R=blackHoleRadius({fraction:f,status,token:'BURN'});
    assert.ok(R>47.5&&R<48.1,`BURN ${status} radius ${R}`);
  }
  assert.equal(blackHoleRadius({fraction:1,status:'verified',token:'BURN'}),48);
  assert.equal(blackHoleRadius({fraction:0,status:'verified',token:'BURN'}),2,'no reduction: no landmark core');
  assert.equal(blackHoleRadius({fraction:0,status:'unverified',token:'BURN'}),2.2);
}
// IMM and XRPyro keep main's status-based radii exactly (token name changes nothing).
for(const token of ['IMM','XRPyro']){
  for(const [fraction,status] of [[.64,'verified'],[.3945887469710871,'estimated'],[.035224328,'partial'],[.08,'history_pending'],[1,'unverified'],[NaN,'partial']]){
    const f=Number.isFinite(fraction)?fraction:0;
    const main=status==='verified'?2+13*Math.sqrt(f):status==='partial'||status==='estimated'?3.4+7*Math.sqrt(f):2.2;
    assert.equal(blackHoleRadius({fraction,status,token}),main,`${token} ${status}`);
  }
  assert.ok(blackHoleRadius({fraction:1,status:'verified',token})<=15);
}
console.log('BURN ~48-unit landmark core; IMM/XRPyro sizing unchanged');
// Clearance: the giant BURN core and its tilted accretion disk stay well above the rooftop.
{
  const { blackHoleAltitude } = await import('./blackhole-altitude.mjs');
  const f=(1e15-34_843_974_557_394.52)/1e15, R=blackHoleRadius({fraction:f,status:'manual',token:'BURN'});
  const rooftop=100, y=blackHoleAltitude({rooftop,radius:R,fraction:f,verified:true});
  const diskHalfHeight=2.2*R*Math.cos(1.24); // RingGeometry outer 2.2, tilted 1.24 rad about X
  const lowest=y-Math.max(R,diskHalfHeight);
  assert.ok(lowest-rooftop>=12,`clearance ${lowest-rooftop}`);
  assert.ok(lowest-rooftop>55,'BURN hole floats a clear gap above its tower');
}
console.log('BURN core and disk clear the rooftop');
