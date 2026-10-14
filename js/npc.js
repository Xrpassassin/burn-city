// Shill-bot NPCs: a few client-only walkers that read out FACTUAL tokenomics of the nearest tower, templated only from the site's
// own data (data.js / burned.js). Missing fields are skipped. No opinions, predictions or advice. Not visitors, not on the minimap.
import * as THREE from 'three';
const W = () => window.__city, N = 4, $ = id => document.getElementById(id);
const fS = v => v >= 1e12 ? (v / 1e12).toFixed(2) + 'T' : v >= 1e9 ? (v / 1e9).toFixed(2) + 'B' : v >= 1e6 ? (v / 1e6).toFixed(2) + 'M' : v >= 1e3 ? (v / 1e3).toFixed(1) + 'k' : (+v).toLocaleString('en-US', { maximumFractionDigits: 2 });
const fN = v => Math.round(v).toLocaleString('en-US');
function facts(n) { const c = W(), f = [], T = n.name; if (!T || T === 'XRP') return f;
  if (n.holders != null) f.push(`${T} has ${fN(n.holders)} holders on the XRP Ledger.`);
  if (n.circ != null) f.push(`${T} supply outstanding: ${fS(n.circ)} tokens.`);
  const bu = n.burn_complete && n.burned_pct != null ? { pct: n.burned_pct } : (window.BURNED && window.BURNED.tokens && window.BURNED.tokens[T] ? { pct: window.BURNED.tokens[T].burned_pct } : null);
  if (bu && bu.pct != null) f.push(`🔥 ${bu.pct.toFixed(2)}% of ${T} has been permanently burned (sent back to the issuer).`);
  if (n.tvl != null) f.push(`${T} AMM pools hold ${fN(n.tvl)} XRP of liquidity${n.pools ? ` across ${n.pools} pools` : ''}.`);
  if (n.lockedShare != null) f.push(`${(n.lockedShare * 100).toFixed(1)}% of ${T}'s LP tokens are locked.`);
  const fr = (c.bridges || []).filter(b => b.forever && (b.p.a === T || b.p.b === T)).sort((a, b) => b.lockedXrp - a.lockedXrp)[0];
  if (fr) f.push(`🔒 ${fr.p.a}⇄${fr.p.b} is a Forever Rail: ${fN(fr.lockedXrp)} XRP of LP locked.`);
  if (n.top10_pct != null && !n.top_partial) f.push(`Top 10 ${T} holders hold ${n.top10_pct}%.`);
  if (n.vol24h != null) f.push(`${T} traded ${fN(n.vol24h)} XRP of volume in the last 24h.`);
  return f }
const css = document.createElement('style'); css.textContent = `.npcTag{position:fixed;left:0;top:0;pointer-events:none;z-index:4;font:700 11px system-ui;color:#ffd27a;text-shadow:0 0 4px #000;white-space:nowrap;transform:translate(-50%,-100%)}
.npcBub{position:fixed;left:0;top:0;pointer-events:none;z-index:4;max-width:220px;background:#101826e6;border:1px solid #ffb02088;color:#eef;border-radius:10px;padding:6px 9px;font:12px/1.3 system-ui;transform:translate(-50%,-100%);opacity:0;transition:opacity .5s}
.npcBub.on{opacity:1}@media (max-width:600px){.npcBub{max-width:160px;font-size:10.5px;padding:4px 7px}.npcTag{font-size:9.5px}}`; document.head.append(css);
let bots = [];
function mk(i) { const c = W(), g = new THREE.Group(), body = new THREE.MeshStandardMaterial({ color: 0x5a6070, metalness: .7, roughness: .35 }), glow = new THREE.MeshBasicMaterial({ color: 0xffb020, toneMapped: false });
  const add = (geo, m, y, x = 0, z = 0) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); g.add(o); return o };
  add(new THREE.BoxGeometry(.6, .8, .4), body, 1.05); const head = add(new THREE.BoxGeometry(.45, .38, .4), body, 1.7); add(new THREE.BoxGeometry(.32, .08, .02), glow, 1.72, 0, -.21);
  add(new THREE.CylinderGeometry(.02, .02, .3), body, 2.03); add(new THREE.SphereGeometry(.06, 8, 6), glow, 2.2);
  const legs = [add(new THREE.BoxGeometry(.18, .6, .18), body, .3, -.15), add(new THREE.BoxGeometry(.18, .6, .18), body, .3, .15)]; legs.forEach(l => l.geometry.translate(0, -.0, 0));
  c.S.add(g); const tag = document.createElement('div'); tag.className = 'npcTag'; tag.textContent = '🤖 NPC'; const bub = document.createElement('div'); bub.className = 'npcBub'; document.body.append(tag, bub);
  const n = c.E.nodes.filter(x => x.name !== 'XRP' && x.pos)[i % 8] || c.E.nodes[0]; g.position.set(n.pos.x + 12, 0, n.pos.z + 12);
  return { g, legs, tag, bub, tgt: null, next: performance.now() + 3000 + i * 2500, hide: 0, ph: Math.random() * 6 } }
function pickTgt(b) { const ns = W().E.nodes.filter(n => n.pos && !n.minor), n = ns[(Math.random() * ns.length) | 0], a = Math.random() * 6.283, r = (n.distR || 30) * (.55 + Math.random() * .3);
  b.tgt = new THREE.Vector3(n.pos.x + Math.cos(a) * r, 0, n.pos.z + Math.sin(a) * r); if (window.__estate && window.__estate.inLake(b.tgt.x, b.tgt.z, 6)) b.tgt = null }
const _v = new THREE.Vector3(); let last = performance.now();
function tick() { requestAnimationFrame(tick); const c = W(); if (!c) return; const now = performance.now(), dt = Math.min(.1, (now - last) / 1000); last = now; const w = innerWidth, h = innerHeight;
  for (const b of bots) { const p = b.g.position; if (!b.tgt) pickTgt(b);
    if (b.tgt) { const dx = b.tgt.x - p.x, dz = b.tgt.z - p.z, d = Math.hypot(dx, dz); if (d < 1.5) b.tgt = null; else { const s = Math.min(d, 2.4 * dt); p.x += dx / d * s; p.z += dz / d * s; b.g.rotation.y = Math.atan2(-dx, -dz); b.ph += dt * 8 } }
    for (const k of c.colliders) { if (!k.r) continue; const ex = p.x - k.x, ez = p.z - k.z, m = k.r + .5; if (Math.abs(ex) > m || Math.abs(ez) > m) continue; const e = Math.hypot(ex, ez); if (e < m) { p.x += ex / (e || 1) * (m - e); p.z += ez / (e || 1) * (m - e); b.tgt = null } }
    b.legs[0].rotation.x = Math.sin(b.ph) * .5; b.legs[1].rotation.x = -Math.sin(b.ph) * .5;
    if (now > b.next) { b.next = now + 8000 + Math.random() * 7000; let best = null, bd = 1e9; for (const n of c.E.nodes) { if (!n.pos || n.name === 'XRP') continue; const d = Math.hypot(n.pos.x - p.x, n.pos.z - p.z); if (d < bd) { bd = d; best = n } }
      const F = best ? facts(best) : []; if (F.length) { b.bub.textContent = F[(Math.random() * F.length) | 0]; b.bub.classList.add('on'); b.hide = now + 5500 } }
    if (b.hide && now > b.hide) { b.bub.classList.remove('on'); b.hide = 0 }
    const dc = c.C.position.distanceTo(p), vis = dc < 70; _v.copy(p).setY(2.6).project(c.C); const on = vis && _v.z < 1 && Math.abs(_v.x) < 1.1 && Math.abs(_v.y) < 1.1;
    b.tag.style.display = b.bub.style.display = on ? '' : 'none'; if (on) { const x = (_v.x + 1) / 2 * w, y = (1 - _v.y) / 2 * h; b.tag.style.transform = `translate(${Math.max(30, Math.min(w - 30, x))}px,${y}px) translate(-50%,-100%)`; const bw = (b.bub.offsetWidth || 160) / 2 + 6, bx = Math.max(bw, Math.min(w - bw, x)); b.bub.style.transform = `translate(${bx}px,${y - 16}px) translate(-50%,-100%)` } } }
window.__npc = { bots: () => bots, facts };
(function boot() { const c = W(); if (!window.__ready || !c || !c.E || !c.E.nodes || !c.colliders) return setTimeout(boot, 800); const n = c.TIER === 'low' ? 2 : N; for (let i = 0; i < n; i++) bots.push(mk(i)); requestAnimationFrame(tick) })();
