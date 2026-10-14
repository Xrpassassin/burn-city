// Retention: daily streak chip, daily zombie challenge, weekly BURN-coin hunt, shareable postcard. Safari-safe, no deps.
import * as THREE from 'three';
const Q = new URLSearchParams(location.search), SRV = Q.get('citysrv') || 'https://burn-city-game.fly.dev';
const W = () => window.__city, LS = localStorage, T0 = Date.now();
const tok = () => { try { return LS.bcToken || '' } catch (e) { return '' } };
const api = (p, b) => fetch(SRV + p, b ? { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + tok() }, body: JSON.stringify(b) } : {}).then(r => r.json());
const utcDay = (ms = Date.now()) => new Date(ms).toISOString().slice(0, 10);
const isoWeek = (d = new Date()) => { const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())), dy = t.getUTCDay() || 7; t.setUTCDate(t.getUTCDate() + 4 - dy); const y = new Date(Date.UTC(t.getUTCFullYear(), 0, 1)); return `${t.getUTCFullYear()}-W${String(Math.ceil(((t - y) / 864e5 + 1) / 7)).padStart(2, '0')}` };
const J = (k, d) => { try { return JSON.parse(LS[k] || 'null') ?? d } catch (e) { return d } };
// ---------- 1) streak (local; server copy is authoritative for rewards when signed in) ----------
const st = J('bcStreak', { last: null, n: 0, best: 0 }); { const t = utcDay(), y = utcDay(Date.now() - 864e5); if (st.last !== t) { st.n = st.last === y ? st.n + 1 : 1; st.last = t; st.best = Math.max(st.best, st.n); LS.bcStreak = JSON.stringify(st) } }
// ---------- 4) hunt state ----------
const WK = isoWeek(); let hunt = J('bcHunt', { week: WK, got: [] }); if (hunt.week !== WK) hunt = { week: WK, got: [] };
const saveHunt = () => LS.bcHunt = JSON.stringify(hunt);
async function sync() { if (!tok()) return; try { const r = await api('/api/streak', {}); if (r.n) { st.n = Math.max(st.n, r.n); st.best = Math.max(st.best, r.best); LS.bcStreak = JSON.stringify(st); if (r.week === WK) { hunt.got = [...new Set([...hunt.got, ...r.hunt])]; saveHunt() } (r.granted || []).forEach(g => toast('🎁 Reward unlocked: ' + g.replace(/_/g, ' '))); chip() } } catch (e) { } }
// ---------- UI: chip + panel ----------
const css = document.createElement('style'); css.textContent = `#rChip{position:fixed;left:calc(12px + env(safe-area-inset-left));top:calc(118px + env(safe-area-inset-top));z-index:25;font:700 13px system-ui;padding:7px 11px;border-radius:14px;border:1px solid #ff8a2a66;background:#140a04cc;color:#ffd27a;backdrop-filter:blur(6px)}
#rPanel{position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);z-index:80;width:min(92vw,360px);background:#0b1020f2;border:1px solid #ffffff26;border-radius:16px;padding:16px;color:#e8eefc;font:14px system-ui;display:none}#rPanel.on{display:block}
#rPanel h3{margin:0 0 8px;color:#ffb36a}#rPanel .r{display:flex;justify-content:space-between;gap:8px;padding:6px 0;border-bottom:1px solid #ffffff12}#rPanel button.b{margin-top:8px;width:100%;padding:10px;border-radius:10px;border:1px solid #ff9a3a;background:#ff7a1a;color:#fff;font-weight:700}
#rPanel .x{position:absolute;right:10px;top:8px;background:none;border:0;color:#fff;font-size:18px}#rToast{position:fixed;left:50%;bottom:calc(70px + env(safe-area-inset-bottom));transform:translateX(-50%);z-index:90;background:#140a04ee;color:#ffd27a;padding:10px 14px;border-radius:12px;font:600 14px system-ui;display:none}
@media (max-width:600px){#rChip{top:auto;bottom:calc(150px + env(safe-area-inset-bottom));left:calc(12px + env(safe-area-inset-left))}}`; document.head.append(css);
const chipEl = document.createElement('button'); chipEl.id = 'rChip'; chipEl.setAttribute('aria-label', 'Streak, daily challenge, coin hunt, postcard'); document.body.append(chipEl);
const chip = () => chipEl.textContent = `🔥 ${st.n} · 🪙 ${hunt.got.length}/5`; chip();
const panel = document.createElement('div'); panel.id = 'rPanel'; document.body.append(panel);
const toastEl = document.createElement('div'); toastEl.id = 'rToast'; document.body.append(toastEl);
function toast(t) { toastEl.textContent = t; toastEl.style.display = 'block'; clearTimeout(toast.k); toast.k = setTimeout(() => toastEl.style.display = 'none', 3500) }
async function openPanel() {
  const nx = st.best < 7 ? `${7 - st.n} more days → Streak Flame skin` : st.best < 30 ? `${30 - st.n} more days → Eternal Flame` : 'All streak rewards earned';
  panel.innerHTML = `<button class="x" aria-label="Close">✕</button><h3>🔥 ${st.n}-day streak</h3><div class="r"><span>Best</span><b>${st.best} days</b></div><div class="r"><span>Next reward</span><b>${nx}</b></div>
   <div class="r"><span>🪙 BURN coin hunt (${WK})</span><b>${hunt.got.length}/5 found</b></div><div class="dim" style="font-size:12px;opacity:.7">5 glowing coins hide in the city each week. Walk or fly close to grab them. All 5 → BURN Coin Drone skin.</div>
   <div class="r"><span>🧟 Daily zombie challenge</span><b id="rDm">…</b></div><div id="rDt" style="font-size:12px;opacity:.8"></div>
   <button class="b" id="rDaily">Play today's challenge (free)</button><button class="b" id="rCard" style="background:#1a2440;border-color:#4a6aa0">📸 Share postcard</button>
   ${tok() ? '' : '<div style="font-size:12px;opacity:.7;margin-top:6px">Sign in with Xaman to sync your streak and earn rewards.</div>'}`;
  panel.classList.add('on'); panel.querySelector('.x').onclick = () => panel.classList.remove('on');
  panel.querySelector('#rDaily').onclick = () => location.href = 'arena/?mode=zombie&daily=1'; panel.querySelector('#rCard').onclick = postcard;
  try { const d = await api('/api/daily'); panel.querySelector('#rDm').textContent = d.mod ? d.mod.name : '—'; panel.querySelector('#rDt').innerHTML = (d.top || []).slice(0, 5).map((e, i) => `${i + 1}. ${e.acct} · ${e.best}`).join('<br>') || 'No scores yet today: be first.' } catch (e) { panel.querySelector('#rDm').textContent = 'offline' }
}
chipEl.onclick = openPanel;
// ---------- 4) coins: deterministic weekly positions, one instanced draw ----------
function mulberry(a) { return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296 } }
let coins = null, coinMesh = null;
function placeCoins() {
  const c = W(); let h = 0; for (const ch of 'bc-hunt-' + WK) h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0; const r = mulberry(h);
  const nodes = c.E.nodes.filter(n => n.pos && !n.minor && n.h); coins = [];
  for (let i = 0; i < 5; i++) { const n = nodes[Math.floor(r() * nodes.length)], a = r() * 6.283, roof = r() < .4, rad = roof ? 0 : n.w * 2.2 + r() * Math.max(6, (n.distR || 40) * .5);
    coins.push(new THREE.Vector3(n.pos.x + Math.cos(a) * rad, roof ? (n.roofY || n.h * .4) + 2 : 1.6 + r() * 8, n.pos.z + Math.sin(a) * rad)) }
  const g = new THREE.CylinderGeometry(1.1, 1.1, .22, 20).rotateX(Math.PI / 2);
  coinMesh = new THREE.InstancedMesh(g, new THREE.MeshBasicMaterial({ color: 0xffb020 }), 5); coinMesh.frustumCulled = false; c.S.add(coinMesh);
  const halo = new THREE.Points(new THREE.BufferGeometry().setFromPoints(coins), new THREE.PointsMaterial({ color: 0xffa020, size: 7, transparent: true, opacity: .55, depthWrite: false, blending: THREE.AdditiveBlending })); halo.frustumCulled = false; c.S.add(halo); coinMesh.userData.halo = halo
}
const M = new THREE.Matrix4(), q = new THREE.Quaternion(), Y = new THREE.Vector3(0, 1, 0), one = new THREE.Vector3(1, 1, 1), tmp = new THREE.Vector3();
let lastFind = 0;
function tick() {
  requestAnimationFrame(tick); const c = W(); if (!c || !coins) return; const t = performance.now() / 1000, m = c.getMode();
  const me = m === 'explore' ? c.P.pos : m === 'fly' ? (c.drone && c.drone() && c.drone().visible ? c.drone().position : c.C.position) : null;
  coins.forEach((p, i) => { const got = hunt.got.includes(i); q.setFromAxisAngle(Y, t * 2 + i); M.compose(tmp.copy(p).setY(p.y + Math.sin(t * 2 + i) * .3), q, got ? tmp.clone().set(0, 0, 0) : one); coinMesh.setMatrixAt(i, M);
    if (!got && me && me.distanceTo(p) < (m === 'fly' ? 5 : 3.2) && Date.now() - lastFind > 1500) { lastFind = Date.now(); hunt.got.push(i); saveHunt(); chip(); toast(`🪙 BURN coin ${hunt.got.length}/5 found!${hunt.got.length === 5 ? ' Drone skin unlocked' + (tok() ? '' : ' (sign in to claim)') : ''}`);
      if (tok()) api('/api/hunt', { week: WK, coin: i, secs: Math.round((Date.now() - T0) / 1000) }).then(r => (r.granted || []).forEach(g => toast('🎁 Reward unlocked: ' + g.replace(/_/g, ' ')))).catch(() => { }) } });
  coinMesh.instanceMatrix.needsUpdate = true; const pos = coinMesh.userData.halo.geometry.attributes.position; coins.forEach((p, i) => pos.setY(i, hunt.got.includes(i) ? -999 : p.y)); pos.needsUpdate = true
}
// ---------- 5) postcard ----------
async function postcard() {
  const c = W(); c.comp ? c.comp.render() : c.R.render(c.S, c.C); const src = c.R.domElement, cw = 1200, ch = 675, cv = document.createElement('canvas'); cv.width = cw; cv.height = ch; const x = cv.getContext('2d');
  x.fillStyle = '#0a0612'; x.fillRect(0, 0, cw, ch); const s = Math.max((cw - 40) / src.width, (ch - 150) / src.height), w = src.width * s, h = src.height * s;
  x.save(); x.beginPath(); x.rect(20, 20, cw - 40, ch - 150); x.clip(); x.drawImage(src, (cw - w) / 2, 20 + (ch - 150 - h) / 2, w, h); x.restore();
  x.strokeStyle = '#ff8a2a'; x.lineWidth = 4; x.strokeRect(20, 20, cw - 40, ch - 150);
  x.fillStyle = '#ffd27a'; x.font = '900 46px system-ui,sans-serif'; x.fillText('🔥 BURN CITY', 30, ch - 70); x.fillStyle = '#fff'; x.font = '600 24px system-ui,sans-serif';
  x.fillText(`${st.n}-day streak · 🪙 ${hunt.got.length}/5 coins · ${new Date().toLocaleDateString()}`, 30, ch - 34); x.textAlign = 'right'; x.fillStyle = '#9fd8ff'; x.font = '600 24px system-ui,sans-serif'; x.fillText('xrpassassin.github.io/burn-city', cw - 30, ch - 34);
  const blob = await new Promise(r => cv.toBlob(r, 'image/png')); if (!blob) return toast('Could not render postcard');
  const file = new File([blob], 'burn-city-postcard.png', { type: 'image/png' }), text = `My Burn City: ${st.n}-day streak 🔥 #XRPL #BurnCity`;
  if (navigator.canShare && navigator.canShare({ files: [file] })) { try { await navigator.share({ files: [file], text, url: 'https://xrpassassin.github.io/burn-city/' }); return } catch (e) { if (e.name === 'AbortError') return } }
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'burn-city-postcard.png'; document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000); toast('Postcard saved')
}
window.__retain = { openPanel, postcard, coins: () => coins, hunt: () => hunt, streak: () => st };
(function boot() { if (!window.__ready || !W()) return setTimeout(boot, 500); placeCoins(); requestAnimationFrame(tick); sync() })();
