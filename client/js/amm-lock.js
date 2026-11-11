import { blackHoleAltitude } from './blackhole-altitude.mjs';
import { blackHoleRadius } from './blackhole-radius.mjs';
import { verifiedBurnFraction } from './verified-burn-visual.mjs';
import { verifiedSupplyFraction } from './verified-supply-visual.mjs';
import { verifiedEcosystemSupplyFraction } from './verified-ecosystem-supply-visual.mjs';
import { observedBurnPreview } from './observed-burn-preview.mjs';
import { xrpyroLedgerOutstanding } from './xrpyro-supply-visual.mjs';
import { immLedgerOutstanding } from './imm-supply-visual.mjs';
import { issuerReturnCard, supplyReconciliationCard, ecosystemSupplyCard } from './issuer-return-card.mjs';
// AMM lock verification + black-hole visuals (server: GET /api/amm-lock).
//   1) Verified permanent LP share drives the solid gold tube inside the AMM rail and tower spiral.
//      No halo or gold ring geometry. Time-locked and unverified shares never turn gold.
//   2) ONE InstancedMesh: a dark black/violet singularity per TOKEN (not pool).
//   3) ONE InstancedMesh: thin accretion disks. Shader-only motion; no particles,
//      textures, lights, render targets, or post-processing. Reduced motion freezes animation.
// Cards: pool card (tap a bridge) + token card (tap a tower or a singularity) get a lock/burn section with figures, status and sources.
// Strict gold (client/js/goldlock.js) remains a separate verified ≥95% / ≥5k XRP label, but continuous bar thickness uses verified permanent LP share for every pool.
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

  // The verified LP-lock fraction now controls the inner gold bar inside
  // every pool line (app.js), not an orbiting ring. Token singularities remain.
  const fogU = THREE.UniformsUtils.merge([THREE.UniformsLib.fog]);
  const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _v = new THREE.Vector3(),
    _s = new THREE.Vector3(), Z = new THREE.Vector3(0,0,1), _t = new THREE.Vector3();
  const lastGold = new Map();
  const publishLock=b=>{
    if(typeof c.onVerifiedPool!=='function')return;
    const view=poolView(b),share=view.st==='verified'?view.perm:null;
    if(!lastGold.has(b.p.amm)||lastGold.get(b.p.amm)!==share){
      lastGold.set(b.p.amm,share);
      c.onVerifiedPool(b.p.amm,share);
    }
  };

  // ---- 2) singularities: one instanced draw (+ invisible pick spheres, 0 draws) ----
  const NT = Math.max(1, tokNames.length), sph = new THREE.SphereGeometry(1, LOW ? 12 : 20, LOW ? 8 : 14);
  const sA = new Float32Array(NT * 4); sph.setAttribute('bp', new THREE.InstancedBufferAttribute(sA, 4));
  const sm = new THREE.ShaderMaterial({ toneMapped: false, fog: true, uniforms: { t: lockT, ...fogU },
    vertexShader: 'attribute vec4 bp;varying vec3 vN;varying float vB;varying vec3 vTint;varying vec3 vP;\n#include <fog_pars_vertex>\nvoid main(){vB=bp.x;vTint=bp.yzw;vN=normalize(normalMatrix*mat3(instanceMatrix)*normal);vP=position;vec4 mvPosition=modelViewMatrix*instanceMatrix*vec4(position,1.);gl_Position=projectionMatrix*mvPosition;\n#include <fog_vertex>\n}',
    fragmentShader: 'uniform float t;varying vec3 vN;varying float vB;varying vec3 vTint;varying vec3 vP;\n#include <fog_pars_fragment>\nvoid main(){float f=pow(1.-abs(normalize(vN).z),4.);float sw=.5+.5*sin(atan(vP.z,vP.x)*3.+vP.y*4.-t*.6);vec3 col=vec3(.001,.0,.003)+vTint*f*(.7+.3*vB)+vTint*f*sw*.35;gl_FragColor=vec4(col,1.);\n#include <fog_fragment>\n}' });
  const sing = new THREE.InstancedMesh(sph, sm, NT); sing.frustumCulled = false; S.add(sing);
  const pickMat = new THREE.MeshBasicMaterial({ visible: false }), pickGeo = new THREE.SphereGeometry(1, 8, 6), pickers = {};
  // city centre for the outward offset (singularities sit on the far side of each tower from the hub, at street level: apart from every rail)
  const cx = tokNames.reduce((s, k) => s + N[k].pos.x, 0) / Math.max(1, tokNames.length), cz = tokNames.reduce((s, k) => s + N[k].pos.z, 0) / Math.max(1, tokNames.length);
  const singPos = (n, R, fraction, verified, out) => out.set(n.pos.x, blackHoleAltitude({ rooftop: n.top || n.h || 0, radius: R, fraction, verified }), n.pos.z);
  // Verified burns earn a dramatic skyline silhouette; fixed issuer markers remain small.

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
  st.draws = 2;

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
    // Supply-based IMM and XRPyro previews use obligations from the read-only
    // ledger service. Require the exact token identity, gateway source, fresh
    // verified holder snapshot and disabled issuer keys. Not an audited burn.
    const xrpyroSupply = xrpyroLedgerOutstanding({name:k,tokenKey:N[k]?.key,record:o});
    const immSupply = immLedgerOutstanding({name:k,tokenKey:N[k]?.key,record:o});
    const previewSupply = k==='IMM' ? immSupply : xrpyroSupply;
    const preview = observedBurnPreview({name:k,tokenKey:N[k]?.key,
      observedReturns:N[k]?.burn_vol,transactionCount:N[k]?.burn_txs,
      scanComplete:N[k]?.burn_complete,
      outstandingSupply:previewSupply === null ? undefined : previewSupply,
      outstandingSource:previewSupply === null ? undefined : 'xrpl_gateway_balances'});
    if(preview && o?.issuer_keys_disabled===true && fresh(o))
      return {st:preview.status === 'indicative_outstanding_supply' ? 'estimated' : 'partial',o,f:preview.fraction,preview};
    // A verified inaccessible issuer earns a small, fixed marker even while its
    // launch supply is not established. This is NEVER a supply-percentage claim.
    const pendingIssuer = (k==='IMM' && N[k]?.key==='rH1znLFaK7wtmDGRSu4WPEqHCuofuJHdHP-IMM') ||
      (k==='XRPyro' && N[k]?.key==='rHqQ84DqPBbd5dRmhGAHrQ7eW3DCkbR9va-58525079726F0000000000000000000000000000');
    if((burnIssuerMarker(N[k]?.key,o?.issuer_keys_disabled,!!fresh(o)) ||
      pendingIssuer && o?.issuer_keys_disabled===true && !!fresh(o)))
      return {st:'history_pending',o,f:0.08};
    return {st:'unverified',o,f:0};
  };

  function apply() {
    // Draw only VERIFIED permanent LP in the tube centre. Stale, escrow,
    // partial/unknown and reported-only percentages never look gold.
    bridges.forEach(publishLock);
    let visibleSingularities = 0;
    tokNames.forEach((k, i) => { const v = tokOf(k), n = N[k], on = v.f > 0, R = blackHoleRadius({fraction:v.f,status:v.st}); singPos(n, R, v.f, v.st === 'verified' || v.st === 'estimated', _v);
      if(on) { const slot=visibleSingularities++;
        _m.compose(_v,_q.identity(),_s.setScalar(R));sing.setMatrixAt(slot,_m);
        // BURN purple, IMM turquoise, XRPyro ember-orange; one batched shader and one singularity per token.
        const tint = k==='IMM' ? [.08,.78,.83] : k==='XRPyro' ? [1.,.3,.07] : [.52,.2,.98];
        sA.set([v.f,...tint],slot*4);
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
  const badge = (s, stale) => s === 'verified' ? '<b style="color:#7dffa8">✓ VERIFIED on-ledger</b>' : s === 'estimated' ? '<b style="color:#ffd27a">◐ ESTIMATED (launch minus supply)</b>' : s === 'partial' ? '<b style="color:#ffd27a">◐ PARTIAL (lower bound)</b>' : `<b style="color:#c9c9d6">? UNVERIFIED${stale ? ' (stale)' : ''}</b>`;
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
      const card = issuerReturnCard({ record: fresh(o) ? o?.issuer_return_history : null,
        tokenKey: n?.key, tokenName: k,
        issuerVerified: !!(o && fresh(o) && o.issuer_keys_disabled === true) });
      if(!v.preview)return card;
      if(v.preview.status === 'indicative_outstanding_supply') {
        const comparisonUrl = k==='IMM' ?
          'https://xrpl.to/token/rH1znLFaK7wtmDGRSu4WPEqHCuofuJHdHP-IMM' :
          'https://xrpl.to/token/rHqQ84DqPBbd5dRmhGAHrQ7eW3DCkbR9va-58525079726F0000000000000000000000000000';
        return card + '<p class="dim"><b>Estimated launch-relative supply reduction: '+
          (v.preview.fraction*100).toFixed(4)+'%</b>. Launch supply: '+esc(String(v.preview.baseline))+
          ' '+esc(k)+' (project-provided); current outstanding: '+esc(String(v.preview.outstanding))+
          ' '+esc(k)+'; difference: '+esc(String(v.preview.removed))+' '+esc(k)+
          '. Source: XRPL gateway_balances (issuer obligations). '+
          'This is a supply-based visual estimate, not a complete historical burn audit. '+
          '<a href="'+comparisonUrl+'" target="_blank" rel="noopener noreferrer">Compare on XRPL.to</a>.</p>';
      }
      return card + '<p class="dim">Indicative lower-bound visual: '+esc(String(v.preview.observedReturns))+' '+esc(k)+
        ' observed returned to issuer in an incomplete history scan; compared with the project-provided launch supply of '+
        esc(String(v.preview.baseline))+'. The '+(v.preview.fraction*100).toFixed(4)+
        '% preview is NOT verified cumulative burned supply. Supply figures from independent explorers conflict.</p>';
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
    tip(u) { const v = tokOf(u.token); return `Black hole · ${u.token} · ${v.preview?.status === 'indicative_outstanding_supply' ? pctS(v.preview.fraction * 100) + ' estimated supply reduction (not audited burns)' : v.preview ? 'indicative partial issuer returns, NOT verified burn supply' : v.st === 'history_pending' ? 'issuer inaccessible; launch supply unverified (fixed marker)' : v.st === 'unverified' ? 'unverified' : pctS(v.o.burned_pct) + (v.net?' net supply reduction':' of supply burned')} · tap for details`; },
    view: (DBG || TEST) ? () => ({ pools: bridges.map((b) => { const v = poolView(b), midpoint=b.curve.getPoint(.5);
      return { pair: b.p.a + '/' + b.p.b, amm: b.p.amm, st: v.st, perm: v.perm, tl: v.tl,
        shown: v.st==='verified'&&v.perm>0, mid: midpoint.toArray(), R: b.r*1.45+.55 }; }),
      tokens: tokNames.map((k, i) => { const v = tokOf(k); return { token: k, st: v.st, f: v.f, pos: pickers[k] && v.f > 0 ? pickers[k].position.toArray() : null }; }) }) : undefined,
    objs: (DBG || TEST) ? [sing, disks].filter(Boolean) : undefined,
    apply: (DBG || TEST) ? apply : undefined, load: (DBG || TEST) ? load : undefined,
  };
  window.__ammLock = api;   // read by app.js hooks (cards / tip / showInfo); figures only, no test controls
  return api;
}
