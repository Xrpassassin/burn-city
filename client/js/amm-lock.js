import { blackHoleAltitude } from './blackhole-altitude.mjs';
import { verifiedBurnFraction } from './verified-burn-visual.mjs';
import { verifiedSupplyFraction } from './verified-supply-visual.mjs';
import { verifiedEcosystemSupplyFraction } from './verified-ecosystem-supply-visual.mjs';
import { issuerReturnCard, supplyReconciliationCard, ecosystemSupplyCard } from './issuer-return-card.mjs';
// AMM lock + burn visuals (server truth: GET /api/amm-lock, server/amm-lock.js). +3 draw calls total, all instanced/merged:
//   1) ONE InstancedMesh: gold segmented chain halo around every pool bridge (at the arc's midpoint). Lit arc = VERIFIED permanently locked
//      share of the LP token supply; dim amber dashes = time-locked (Escrow); faint steel = the rest; grey dashes = UNVERIFIED (nothing gold).
//      The bridge body (thickness = liquidity, colour = activity) is never touched.
//   2) ONE InstancedMesh: a dark black/violet singularity per TOKEN (not per pool), above its tower, sized by verified supply reduction or issuer returns.
//   3) ONE InstancedMesh: thin accretion disks. Shader-only motion; no particles,
//      textures, lights, render targets, or post-processing. Reduced motion freezes animation.
// Cards: pool card (tap a bridge) + token card (tap a tower or a singularity) get a lock/burn section with figures, status and sources.
// Strict gold (client/js/goldlock.js, #121 gold vein + Forever Rails) is unchanged: it stays the "certified" badge (>= 95% AND >= 5k XRP), the halo is the measurement.
// Test: ?locktest (fixture covering every case, no network) · ?debug=1 -> window.__ammLock.
const FIX_NOTE = 'locktest fixture';
const short = a => a ? a.slice(0, 6) + '…' + a.slice(-4) : '';
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmtN = x => x == null ? '—' : x >= 1e12 ? (x / 1e12).toFixed(2) + 'T' : x >= 1e9 ? (x / 1e9).toFixed(2) + 'B' : x >= 1e6 ? (x / 1e6).toFixed(2) + 'M' : x >= 1e3 ? (x / 1e3).toFixed(1) + 'k' : x >= 1 ? x.toFixed(1) : x.toPrecision(3);
const pctS = x => x == null ? '—' : (x >= 10 ? x.toFixed(1) : x >= 1 ? x.toFixed(2) : x.toFixed(3)) + '%';
const STALE_MS = 6 * 3600e3;

// fixture: every acceptance case, mapped onto real bridges/tokens so it renders in the real city
function fixture(bridges, N) {
  const now = 'fixture', big = [...bridges].filter(b => !b.minor).sort((x, y) => y.p.tvl_xrp - x.p.tvl_xrp), small = bridges.filter(b => b.minor);
  const P = {}, T = {}, mk = (b, o) => { if (b) P[b.p.amm] = { amm: b.p.amm, pair: b.p.a + '/' + b.p.b, ts: now, lp_supply: 1e6, lp_supply_src: 'amm_info(' + b.p.amm + ').lp_token (LPTokenBalance) · ' + FIX_NOTE, holders_src: FIX_NOTE, reported_pct: b.p.locked_pct, ...o }; };
  const D = (pct, cls, reason, acct) => ({ acct: acct || 'rFixture' + cls + Math.round(pct), lp: pct * 1e4, pct, cls, reason, source: 'account_info · ' + FIX_NOTE });
  mk(big[0], { status: 'verified', locked_pct: 90.5, locked_lp: 905000, time_locked_pct: 0, held_pct: 9.2, unchecked_pct: .3, reason: 'case: large pool, partial lock', destinations: [D(90.5, 'permanent', 'master disabled, regular key rrrrrrrrrrrrrrrrrrrrBZbvji (black hole), no signers'), D(9.2, 'held', 'master key enabled')] });
  mk(big[1], { status: 'verified', locked_pct: 100, locked_lp: 1e6, time_locked_pct: 0, held_pct: 0, reason: 'case: 100% verified lock', destinations: [D(60, 'permanent', 'master disabled, no regular key, no signers'), D(40, 'permanent', 'master disabled, regular key rrrrrrrrrrrrrrrrrrrrrhoLvTp (black hole), no signers')] });
  mk(big[2], { status: 'verified', locked_pct: 10, locked_lp: 1e5, time_locked_pct: 0, held_pct: 90, reason: 'case: LP holder not black-holed (regular key + signer list)', destinations: [D(60, 'held', 'master disabled but regular key rSomeKey'), D(30, 'held', 'master disabled but a signer list exists'), D(10, 'permanent', 'master disabled, no regular key, no signers')] });
  mk(big[3], { status: 'unverified', locked_pct: null, locked_pct_min: 30, reported_pct: 70, reason: 'case: failed fetch (could not read 1 LP holder account)', destinations: [D(40, 'unknown', 'account_info failed: timeout'), D(30, 'permanent', 'master disabled, no regular key, no signers')] });
  mk(big[4], { status: 'verified', locked_pct: 50, locked_lp: 5e5, time_locked_pct: 20, held_pct: 30, reason: 'case: partial + time-locked (Escrow)', destinations: [D(50, 'permanent', 'master disabled, no regular key, no signers'), D(20, 'time_locked', 'Escrow FinishAfter 2027-01-01')] });
  mk(big[5], { status: 'verified', locked_pct: 0, locked_lp: 0, held_pct: 100, reason: 'case: 0% locked', destinations: [D(100, 'held', 'master key enabled')] });
  mk(small[0], { status: 'verified', locked_pct: 64, locked_lp: 64e4, held_pct: 36, reason: 'case: small pool, partial lock', destinations: [D(64, 'permanent', 'master disabled, no regular key, no signers')] });
  const tk = (name, o) => { const n = N[name]; if (!n || !n.key || !n.key.includes('-')) return; const i = n.key.indexOf('-'); T[name] = { token: name, issuer: n.key.slice(0, i), currency: n.key.slice(i + 1), ts: now, supply: 1e9, supply_src: 'gateway_balances.obligations · ' + FIX_NOTE, holders_src: FIX_NOTE, pools: bridges.filter(b => b.p.a === name || b.p.b === name).map(b => b.p.amm), ...o }; };
  const toks = Object.keys(N).filter(k => N[k].key && N[k].key.includes('-')).sort((a, b) => (N[b].tvl || 0) - (N[a].tvl || 0));
  const multi = toks.find(k => bridges.filter(b => b.p.a === k || b.p.b === k).length > 2) || toks[0];
  tk(multi, { status: 'verified', burned: 1.5e8, burned_pct: 15, issuer_keys_disabled: true, reason: 'case: token in multiple pools (one singularity, no double count)', black_holes: [{ acct: 'rFixtureBH1', amount: 1e8, pct: 10, cls: 'burned', reason: 'master disabled, no regular key, no signers' }, { acct: 'rFixtureBH2', amount: 5e7, pct: 5, cls: 'burned', reason: 'master disabled, regular key rrrrrrrrrrrrrrrrrrrrBZbvji (black hole), no signers' }] });
  const rest = toks.filter(k => k !== multi);
  tk(rest[0], { status: 'verified', burned: 6e8, burned_pct: 60, issuer_keys_disabled: false, reason: 'case: large burn', black_holes: [{ acct: 'rFixtureBH3', amount: 6e8, pct: 60, cls: 'burned', reason: 'master disabled, no regular key, no signers' }] });
  tk(rest[1], { status: 'verified', burned: 0, burned_pct: 0, issuer_keys_disabled: true, reason: 'case: issuer black-holed, no burned balance', black_holes: [] });
  tk(rest[2], { status: 'unverified', burned: null, burned_pct: null, issuer_keys_disabled: null, reason: 'case: failed fetch', black_holes: [] });
  tk(rest[3], { status: 'verified', burned: 2e7, burned_pct: 2, issuer_keys_disabled: false, reason: 'case: small burn + designated address', black_holes: [{ acct: 'rFixtureBH4', amount: 2e7, pct: 2, cls: 'burned', reason: 'master disabled, no regular key, no signers' }, { acct: 'rFixtureKEY', amount: 5e7, pct: 5, cls: 'designated', reason: 'sent to designated address: master disabled but regular key rSomeKey' }] });
  return { v: 1, ts: now, fixture: true, pools: P, tokens: T };
}

// A fixed-size BURN marker signals a verified inaccessible issuer; it is not a
// burn percentage. A verified supply snapshot or issuer-return history supplies that.
export function burnIssuerMarker(key, issuerVerified, fresh) {
  return key === 'rwgNTwrsZKPe7xYCy4emjFAYpgnuioHSkd-4255524E00000000000000000000000000000000' && issuerVerified === true && fresh === true;
}
export function initAmmLock(c) {
  const { THREE, S, bridges, N, U, anim, TIER, MOBILE, pick } = c, Q = new URLSearchParams(location.search), TEST = Q.has('locktest'), DBG = /[?&]debug=1/.test(location.search);
  const LOW = TIER === 'low', RM = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const st = { data: null, err: null, fetched: null, draws: 0 }, tokNames = Object.keys(N).filter(k => N[k].key && N[k].key.includes('-'));
  const lockT = { value: 0 };   // own clock: frozen with reduced motion
  anim.push((t) => { if (!RM) lockT.value = t; });

  // ---- 1) halos: one instanced draw ----
  const NB = bridges.length, ring = new THREE.TorusGeometry(1, .07, 6, LOW ? 40 : 64);
  const hA = new Float32Array(NB * 4); ring.setAttribute('lk', new THREE.InstancedBufferAttribute(hA, 4));
  const fogU = THREE.UniformsUtils.merge([THREE.UniformsLib.fog]);
  const hm = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, toneMapped: false, fog: true, uniforms: { t: lockT, ...fogU },
    vertexShader: 'attribute vec4 lk;varying vec4 vL;varying float vA;varying vec3 vN;\n#include <fog_pars_vertex>\nvoid main(){vL=lk;vec2 c=normalize(position.xy);vA=fract(.25-atan(position.y,position.x)/6.2831853);'
      + 'vec3 o=position-vec3(c,0.);float th=lk.z>1.5?.55:(.6+1.1*lk.x);vec3 p=vec3(c,0.)+o*th;vN=normalize(normalMatrix*mat3(instanceMatrix)*normal);vec4 mvPosition=modelViewMatrix*instanceMatrix*vec4(p,1.);gl_Position=projectionMatrix*mvPosition;\n#include <fog_vertex>\n}',
    // lk = (verified permanent share, time-locked share, status 1 verified | 2 unverified, 0)
    fragmentShader: 'uniform float t;varying vec4 vL;varying float vA;varying vec3 vN;\n#include <fog_pars_fragment>\nvoid main(){float NS=36.;float sg=fract(vA*NS);if(sg<.16)discard;float spec=pow(max(0.,vN.y*.6+vN.z*.8),5.);float rim=pow(1.-abs(vN.z),2.);vec3 col;float a;'
      + 'if(vL.z>1.5){if(mod(floor(vA*NS),2.)>.5)discard;col=vec3(.55,.58,.66)*(.6+.5*spec);a=.55;}'
      + 'else if(vA<vL.x){float gl=vL.x>.89?smoothstep(.06,0.,abs(fract(vA-t*.05)-.5)-.44):0.;col=vec3(.62,.4,.08)*(.5+.35*rim)+vec3(.7,.55,.3)*(spec*.45+gl*.5);a=.9;}'
      + 'else if(vA<vL.x+vL.y){if(mod(floor(vA*NS),2.)>.5)discard;col=vec3(.5,.26,.05)*(.5+.4*spec);a=.7;}'
      + 'else{col=vec3(.42,.46,.52)*(.35+.5*spec);a=.22;}gl_FragColor=vec4(col,a);\n#include <fog_fragment>\n}' });
  const halos = new THREE.InstancedMesh(ring, hm, Math.max(1, NB)); halos.frustumCulled = false; halos.renderOrder = 3; S.add(halos);
  const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _v = new THREE.Vector3(), _s = new THREE.Vector3(), Z = new THREE.Vector3(0, 0, 1), _t = new THREE.Vector3();
  const mids = bridges.map(b => { const p = b.curve.getPoint(.5), tg = b.curve.getTangent(.5).normalize(); return { p, q: new THREE.Quaternion().setFromUnitVectors(Z, tg), R: b.r * 1.45 + .55 }; });

  // ---- 2) singularities: one instanced draw (+ invisible pick spheres, 0 draws) ----
  const NT = Math.max(1, tokNames.length), sph = new THREE.SphereGeometry(1, LOW ? 12 : 20, LOW ? 8 : 14);
  const sA = new Float32Array(NT); sph.setAttribute('bp', new THREE.InstancedBufferAttribute(sA, 1));
  const sm = new THREE.ShaderMaterial({ toneMapped: false, fog: true, uniforms: { t: lockT, ...fogU },
    vertexShader: 'attribute float bp;varying vec3 vN;varying float vB;varying vec3 vP;\n#include <fog_pars_vertex>\nvoid main(){vB=bp;vN=normalize(normalMatrix*mat3(instanceMatrix)*normal);vP=position;vec4 mvPosition=modelViewMatrix*instanceMatrix*vec4(position,1.);gl_Position=projectionMatrix*mvPosition;\n#include <fog_vertex>\n}',
    fragmentShader: 'uniform float t;varying vec3 vN;varying float vB;varying vec3 vP;\n#include <fog_pars_fragment>\nvoid main(){float f=pow(1.-abs(normalize(vN).z),4.);float sw=.5+.5*sin(atan(vP.z,vP.x)*3.+vP.y*4.-t*.6);vec3 col=vec3(.001,.0,.003)+vec3(.45,.16,.95)*f*(.7+.3*vB)+vec3(.25,.05,.5)*f*sw*.5;gl_FragColor=vec4(col,1.);\n#include <fog_fragment>\n}' });
  const sing = new THREE.InstancedMesh(sph, sm, NT); sing.frustumCulled = false; S.add(sing);
  const pickMat = new THREE.MeshBasicMaterial({ visible: false }), pickGeo = new THREE.SphereGeometry(1, 8, 6), pickers = {};
  // city centre for the outward offset (singularities sit on the far side of each tower from the hub, at street level: apart from every rail)
  const cx = tokNames.reduce((s, k) => s + N[k].pos.x, 0) / Math.max(1, tokNames.length), cz = tokNames.reduce((s, k) => s + N[k].pos.z, 0) / Math.max(1, tokNames.length);
  const singPos = (n, R, fraction, verified, out) => out.set(n.pos.x, blackHoleAltitude({ rooftop: n.top || n.h || 0, radius: R, fraction, verified }), n.pos.z);
  // Verified burns earn a dramatic skyline silhouette; fixed issuer markers remain small.
  const singR = (f,verified) => verified ? 2 + 13 * Math.sqrt(Math.max(0,Math.min(1,f))) : 2.2;

  // ---- 3) accretion disks: one instanced draw, no lights/textures/post passes ----
  const diskGeo = new THREE.RingGeometry(1.06, 2.2, LOW ? 32 : 64);
  const diskMat = new THREE.ShaderMaterial({transparent:true,depthWrite:false,side:THREE.DoubleSide,
    blending:THREE.AdditiveBlending,toneMapped:false,fog:true,uniforms:{t:lockT,...THREE.UniformsUtils.merge([THREE.UniformsLib.fog])},
    vertexShader:`varying vec2 p;
#include <fog_pars_vertex>
    void main(){p=position.xy;vec4 mvPosition=modelViewMatrix*instanceMatrix*vec4(position,1.);gl_Position=projectionMatrix*mvPosition;
#include <fog_vertex>
}`,
    fragmentShader:`uniform float t;varying vec2 p;
#include <fog_pars_fragment>
    void main(){float r=length(p);float a=atan(p.y,p.x);float edge=smoothstep(1.06,1.16,r)*(1.-smoothstep(1.5,2.2,r));
    float bands=.55+.45*sin(r*18.-a*2.+t*.7);float hot=pow(max(0.,1.-abs(r-1.16)*8.),2.);
    vec3 col=mix(vec3(.38,.13,.8),vec3(1.,.56,.17),hot);float alpha=edge*(.16+.34*bands)+hot*.6;
    gl_FragColor=vec4(col,alpha);
#include <fog_fragment>
}`});
  const disks = new THREE.InstancedMesh(diskGeo,diskMat,NT);disks.frustumCulled=false;S.add(disks);
  const diskQ = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1,0,0),-1.24);
  st.draws = 3;

  const poolOf = b => st.data && st.data.pools ? st.data.pools[b.p.amm] : null;
  const fresh = o => o && (st.data && st.data.fixture || Date.now() - (o.t_ms != null ? o.t_ms : Date.parse(o.ts)) <= STALE_MS);
  const poolView = b => { const o = poolOf(b); if (!o || !fresh(o) || o.status === 'unverified') return { st: 'unverified', o, perm: 0, tl: 0 }; return { st: 'verified', o, perm: (o.locked_pct || 0) / 100, tl: (o.time_locked_pct || 0) / 100 }; };
  const tokOf = k => { const o = st.data && st.data.tokens ? st.data.tokens[k] : null;
    if(st.data?.fixture){if(!o||!fresh(o)||o.status==='unverified'||o.burned_pct==null)return {st:'unverified',o,f:0};return {st:o.status,o,f:o.burned_pct/100};}
    const supply = verifiedSupplyFraction(o?.supply_reconciliation,N[k]?.key);
    if(supply!==null && fresh(o))return {st:'verified',o:{...o,burned:o.supply_reconciliation.burned,burned_pct:supply*100},f:supply,net:true};
    // IMM and XRPyro use a separately validated launch-vs-outstanding snapshot.
    // No legacy holder ratio or market supply is eligible to scale the singularity.
    const ecosystem = verifiedEcosystemSupplyFraction(o?.supply_reconciliation,k);
    if(ecosystem!==null && fresh(o))return {st:'verified',o:{...o,burned_pct:ecosystem*100},f:ecosystem,net:true};
    const historical = verifiedBurnFraction(o?.issuer_return_history, N[k]?.key);
    if(historical !== null && fresh(o))return {st:'verified',o:{...o,burned:o.issuer_return_history.burned,burned_pct:historical*100},f:historical};
    // A verified inaccessible issuer earns a small, fixed marker even while its
    // launch supply is not established. This is NEVER a supply-percentage claim.
    const pendingIssuer = (k==='IMM' && N[k]?.key==='rH1znLFaK7wtmDGRSu4WPEqHCuofuJHdHP-IMM') ||
      (k==='XRPyro' && N[k]?.key==='rHqQ84DqPBbd5dRmhGAHrQ7eW3DCkbR9va-XRPYRO');
    if((burnIssuerMarker(N[k]?.key,o?.issuer_keys_disabled,!!fresh(o)) ||
      pendingIssuer && o?.issuer_keys_disabled===true && !!fresh(o)))
      return {st:'history_pending',o,f:0.08};
    return {st:'unverified',o,f:0};
  };

  function apply() {
    bridges.forEach((b, i) => { const v = poolView(b), M = mids[i], vis = b.group.visible;
      // verified: lit arc = permanent share (nothing drawn when it is 0); unverified: grey dashed ring only where some lock was reported
      const show = vis && (v.st === 'verified' ? v.perm + v.tl > 0 : (b.p.locked_pct || 0) > 0 || (v.o && v.o.locked_pct_min > 0));
      hA.set([v.st === 'verified' ? v.perm : 0, v.st === 'verified' ? v.tl : 0, v.st === 'verified' ? 1 : 2, 0], i * 4);
      _m.compose(M.p, M.q, _s.setScalar(show ? M.R : 0)); halos.setMatrixAt(i, _m); });
    halos.instanceMatrix.needsUpdate = true; ring.attributes.lk.needsUpdate = true;
    let visibleSingularities = 0;
    tokNames.forEach((k, i) => { const v = tokOf(k), n = N[k], on = v.f > 0, R = singR(v.f, v.st === 'verified'); singPos(n, R, v.f, v.st === 'verified', _v);
      if(on) { const slot=visibleSingularities++;
        _m.compose(_v,_q.identity(),_s.setScalar(R));sing.setMatrixAt(slot,_m);sA[slot]=v.f;
        _m.compose(_v,diskQ,_s.setScalar(R));disks.setMatrixAt(slot,_m);
      }
      let pk = pickers[k]; if (on) { if (!pk) { pk = pickers[k] = new THREE.Mesh(pickGeo, pickMat); pk.userData = { kind: 'ammlock', token: k }; S.add(pk); pick.push(pk); } pk.position.copy(_v); pk.scale.setScalar(R * 1.6); pk.visible = true; }
      else if (pk) { pk.position.set(0, -999, 0); } });
    sing.count = disks.count = visibleSingularities;
    sing.instanceMatrix.needsUpdate = true; sph.attributes.bp.needsUpdate = true; disks.instanceMatrix.needsUpdate = true;
  }
  // follow towers that rescale with market cap + the minor-pool toggle: cheap re-apply every 2 s (CPU, ~70 matrices)
  let acc = 0; anim.push((t, dt) => { acc += dt || 0; if (acc < 2) return; acc = 0; apply(); });

  async function load() {
    if (TEST) { st.data = fixture(bridges, N); st.fetched = Date.now(); apply(); return; }
    try { const r = await fetch('/api/amm-lock', { cache: 'no-cache' }); const j = await r.json(); if (j && j.pools) { st.data = j; st.err = r.ok ? null : j.error || 'http ' + r.status; } else st.err = 'bad response'; }
    catch (e) { st.err = e.message; }
    st.fetched = Date.now(); apply();
  }
  apply(); load(); if (!TEST) setInterval(load, 10 * 60e3);

  // ---- cards (reuse #info styling: table rows, .dim) ----
  const badge = (s, stale) => s === 'verified' ? '<b style="color:#7dffa8">✓ VERIFIED on-ledger</b>' : s === 'partial' ? '<b style="color:#ffd27a">◐ PARTIAL (lower bound)</b>' : `<b style="color:#c9c9d6">? UNVERIFIED${stale ? ' (stale)' : ''}</b>`;
  const CLS = { permanent: ['#ffc64a', 'permanently locked'], time_locked: ['#ff9d3c', 'time-locked'], held: ['#8fd8ff', 'held (keys exist)'], unknown: ['#c9c9d6', 'unverified'], burned: ['#b98cff', 'black hole'], designated: ['#d9a7ff', 'sent to designated address'] };
  const legend = '<div class="dim" style="margin-top:6px;line-height:1.5"><span style="color:#8fd8ff">━</span> bridge = liquidity (thickness) + activity (blue→red) · <span style="color:#ffc64a">◯</span> gold chain halo = LP permanently locked (verified) · <span style="color:#ff9d3c">┅</span> time-locked · <span style="color:#c9c9d6">┅</span> grey = unverified · <span style="color:#b98cff">●</span> singularity = verified supply reduction · gold vein = strict gold (≥95% + ≥5k XRP)</div>';
  function poolHTML(p) {
    const b = bridges.find(x => x.p === p || x.p.amm === p.amm); const v = b ? poolView(b) : { st: 'unverified' }, o = v.o, stale = o && !fresh(o);
    const rows = [['Total liquidity', `${fmtN(p.tvl_xrp)} XRP <span class="dim">(bridge thickness · ECO reserves)</span>`], ['Lock status', badge(v.st, stale)]];
    if (o && v.st === 'verified') rows.push(['Permanently locked LP', `<b style="color:#ffc64a">${pctS(o.locked_pct)}</b> of LP supply · ${fmtN(o.locked_lp)} of ${fmtN(o.lp_supply)} LP tokens`]);
    else rows.push(['Permanently locked LP', `<b>not verified</b>${o && o.locked_pct_min > 0 ? ` · at least ${pctS(o.locked_pct_min)} confirmed` : ''}${p.locked_pct > 0 ? ` · ${pctS(+p.locked_pct)} reported (unverified)` : ''}`]);
    if (o && o.time_locked_pct > 0) rows.push(['Time-locked LP', `<span style="color:#ff9d3c">${pctS(o.time_locked_pct)}</span> <span class="dim">(Escrow, released later: not permanent)</span>`]);
    if (o && o.held_pct != null) rows.push(['Held / unchecked', `${pctS(o.held_pct)} held by accounts with keys${o.unchecked_pct > 0 ? ` · ${pctS(o.unchecked_pct)} in holders <0.1% (not checked, not counted)` : ''}`]);
    if (o && o.destinations && o.destinations.length) rows.push(['Lock destinations', o.destinations.slice(0, 6).map(d => { const c = CLS[d.cls] || CLS.unknown; return `<div><span style="color:${c[0]}">${c[1]}</span> · ${esc(short(d.acct))} · ${pctS(d.pct)} <span class="dim">${esc(d.reason)}</span></div>`; }).join('')]);
    if (o) rows.push(['Source', `<span class="dim">${esc(o.lp_supply_src || '')}${o.holders_src ? ' · ' + esc(o.holders_src) : ''} ${/^\d{4}-/.test(o.ts || '') ? ' · checked ' + esc(o.ts.slice(0, 16).replace('T', ' ')) + ' UTC' : ''}${o.reason ? ' · ' + esc(o.reason) : ''}</span>`]);
    else rows.push(['Source', `<span class="dim">${st.err ? 'lock service unavailable (' + esc(st.err) + ')' : 'not checked yet'}</span>`]);
    return `<div class="amml" role="group" aria-label="Locked liquidity details"><h3 style="margin:10px 0 4px;font-size:13px">🔒 Locked liquidity (gold halo)</h3><table style="width:100%;table-layout:fixed">${rows.map(r => `<tr><td style="width:34%;white-space:normal;vertical-align:top">${r[0]}</td><td style="white-space:normal;overflow-wrap:anywhere;word-break:break-word">${r[1]}</td></tr>`).join('')}</table>${legend}</div>`;
  }
  function tokHTML(k) {
    const v = tokOf(k), o = v.o, stale = o && !fresh(o), n = N[k]; const rows = [['Burn status', badge(v.st, stale)]];
    if(!st.data?.fixture){
      const supplyCard = supplyReconciliationCard({record:fresh(o)?o?.supply_reconciliation:null,tokenKey:n?.key,tokenName:k});
      if(supplyCard)return supplyCard;
      const ecosystemCard = ecosystemSupplyCard({record:fresh(o)?o?.supply_reconciliation:null,tokenName:k});
      if(ecosystemCard)return ecosystemCard;
      return issuerReturnCard({ record: fresh(o) ? o?.issuer_return_history : null,
        tokenKey: n?.key, tokenName: k,
        issuerVerified: !!(o && fresh(o) && o.issuer_keys_disabled === true) });
    }
    if (o && v.st !== 'unverified') rows.push(['Burned / inaccessible', `<b style="color:#b98cff">${fmtN(o.burned)} ${esc(k)}</b> · ${pctS(o.burned_pct)} of total supply${v.st === 'partial' ? ' <span class="dim">(at least)</span>' : ''}`]);
    else rows.push(['Burned / inaccessible', '<b>not verified</b>' + (o && o.burned_min > 0 ? ` · at least ${fmtN(o.burned_min)}` : '')]);
    if (o && o.supply != null) rows.push(['Total supply (denominator)', `${fmtN(o.supply)} <span class="dim">${esc(o.supply_src)}</span>`]);
    if (o && o.black_holes && o.black_holes.length) rows.push(['Holders', o.black_holes.slice(0, 6).map(d => { const c = CLS[d.cls] || CLS.unknown; return `<div><span style="color:${c[0]}">${c[1]}</span> · ${esc(short(d.acct))} · ${fmtN(d.amount)} (${pctS(d.pct)}) <span class="dim">${esc(d.reason)}</span></div>`; }).join('')]);
    rows.push(['Issuer keys', o && o.issuer_keys_disabled != null ? (o.issuer_keys_disabled ? 'disabled (issuer black-holed: no new supply can be issued) <span class="dim">· a separate fact, not burned supply</span>' : 'active (issuer can still sign)') : 'unverified']);
    if (n && n.burn_vol > 0) rows.push(['Burn history', `${fmtN(n.burn_vol)} returned to the issuer <span class="dim">(reported by the burn scan; destroyed, so already outside the supply above)</span>`]);
    if (o) rows.push(['Source', `<span class="dim">${esc(o.holders_src || '')} · ${esc(o.issuer_src || '')} ${/^\d{4}-/.test(o.ts || '') ? ' · checked ' + esc(o.ts.slice(0, 16).replace('T', ' ')) + ' UTC' : ''}${o.reason ? ' · ' + esc(o.reason) : ''}${o.pools ? ' · one singularity for ' + o.pools.length + ' pool(s): burned supply is not pool liquidity' : ''}</span>`]);
    return `<div class="amml" role="group" aria-label="Burned supply details"><h3 style="margin:10px 0 4px;font-size:13px">🕳 Black-hole supply (singularity)</h3><table style="width:100%;table-layout:fixed">${rows.map(r => `<tr><td style="width:34%;white-space:normal;vertical-align:top">${r[0]}</td><td style="white-space:normal;overflow-wrap:anywhere;word-break:break-word">${r[1]}</td></tr>`).join('')}</table>${legend}</div>`;
  }
  const api = {
    get data() { return st.data; }, get err() { return st.err; }, draws: () => st.draws, particles: 0, reduced: RM, low: LOW, test: TEST,
    // "Locked LP" text for the existing pool card row + hover tip: verified figure, else the served one labelled unverified
    lpText(p) { const b = bridges.find(x => x.p === p); const v = b ? poolView(b) : null; return v && v.st === 'verified' ? pctS(v.o.locked_pct) + ' verified' : pctS(+p.locked_pct || 0) + ' reported · unverified'; },
    card(box, u) { if (!box || !u) return; let h = ''; if (u.pool && !u.node) h = poolHTML(u.pool); else if (u.node && !u.lot && tokNames.includes(u.node.name)) h = tokHTML(u.node.name); if (h) box.insertAdjacentHTML('beforeend', h); },
    open(u) { const box = document.getElementById('info'); if (!box || !u.token) return; box.innerHTML = `<button class="x" aria-label="Close">✕</button><h2>${esc(u.token)} · black hole</h2>` + tokHTML(u.token); box.classList.remove('v2'); box.style.display = 'block'; box.scrollTop = 0; box.querySelector('.x').onclick = () => box.style.display = 'none'; },
    tip(u) { const v = tokOf(u.token); return `Black hole · ${u.token} · ${v.st === 'history_pending' ? 'issuer inaccessible; launch supply unverified (fixed marker)' : v.st === 'unverified' ? 'unverified' : pctS(v.o.burned_pct) + (v.net?' net supply reduction':' of supply burned')} · tap for details`; },
    view: (DBG || TEST) ? () => ({ pools: bridges.map((b, i) => { const v = poolView(b); return { pair: b.p.a + '/' + b.p.b, amm: b.p.amm, st: v.st, perm: v.perm, tl: v.tl, shown: halos.instanceMatrix.array[i * 16] !== 0 || halos.instanceMatrix.array[i * 16 + 1] !== 0, mid: mids[i].p.toArray(), R: mids[i].R }; }),
      tokens: tokNames.map((k, i) => { const v = tokOf(k); return { token: k, st: v.st, f: v.f, pos: pickers[k] && v.f > 0 ? pickers[k].position.toArray() : null }; }) }) : undefined,
    objs: (DBG || TEST) ? [halos, sing, disks].filter(Boolean) : undefined,
    apply: (DBG || TEST) ? apply : undefined, load: (DBG || TEST) ? load : undefined,
  };
  window.__ammLock = api;   // read by app.js hooks (cards / tip / showInfo); figures only, no test controls
  return api;
}
