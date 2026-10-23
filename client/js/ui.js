// Burn City UI v7: groups the toolbar, overflow menu, status row, gear column, and body state classes the CSS layout keys off.
// Only moves existing elements (handlers and ids stay intact), so other modules keep working.
const $ = id => document.getElementById(id);
const Q = new URLSearchParams(location.search);
const TOUCH = matchMedia('(pointer:coarse)').matches || /Mobi|Android|iPhone|iPad/.test(navigator.userAgent) || Q.has('mobile');
document.body.classList.toggle('touch', TOUCH);
const btns = $('btns');
if (btns) {
  // 1) Mode switch as a segmented control
  const seg = document.createElement('div'); seg.className = 'seg'; seg.setAttribute('role', 'group'); seg.setAttribute('aria-label', 'Camera mode');
  const labels = { orbit: '◎ Orbit', fly: '✈ Fly', explore: '🚶 Explore' }, kbd = { orbit: '1', fly: '2', explore: '' };
  btns.querySelectorAll('[data-m]').forEach(b => { if (labels[b.dataset.m]) b.textContent = labels[b.dataset.m]; if (!TOUCH && kbd[b.dataset.m]) b.dataset.kbd = kbd[b.dataset.m]; seg.append(b); });
  btns.prepend(seg);
  const tour = $('tour'); if (tour) { seg.after(tour); if (!TOUCH) tour.dataset.kbd = '3'; }

  // 2) Overflow menu for secondary actions
  const more = document.createElement('div'); more.id = 'more'; more.setAttribute('role', 'menu'); document.body.append(more);
  const moreBtn = document.createElement('button'); moreBtn.id = 'moreBtn'; moreBtn.textContent = '⋯';
  moreBtn.setAttribute('aria-label', 'More'); moreBtn.setAttribute('aria-haspopup', 'menu'); moreBtn.setAttribute('aria-expanded', 'false');
  btns.append(moreBtn);
  const L = { copyLink: 'Copy link to this view', installBtn: 'Install app', audio: 'Sound', guideBtn: 'How to read the city', musicBtn: 'Music',
    socialBtn: 'Social', bagBtn: 'My bag', tour: 'Guided tour' };
  const ICON = { copyLink: '🔗', installBtn: '⬇', guideBtn: '?', musicBtn: '♪', socialBtn: '💬', bagBtn: '💼', tour: '▶' };
  const KEY = { tour: '3' };
  const ORDER = ['tour', 'guideBtn', 'musicBtn', 'audio', 'socialBtn', 'bagBtn', 'copyLink', 'installBtn'];
  const compact = matchMedia('(max-width:700px), (max-height:500px) and (orientation:landscape)');
  const stay = new Set(['moreBtn', 'playBtn', 'bcMoveGamesOpen']);   // bcMoveGamesOpen: Movement & Games hub (movement-games-menu.js)
  function adopt(b) {
    if (!b || !b.id || stay.has(b.id) || b.closest('.seg')) return;
    if (b.id === 'tour' && !compact.matches) return; // roomy screens keep Tour on the bar
    b.dataset.l = L[b.id] || b.getAttribute('aria-label') || '';
    if (ICON[b.id] && b.id !== 'audio') b.textContent = ICON[b.id];
    if (!TOUCH && KEY[b.id]) b.dataset.k = KEY[b.id];
    delete b.dataset.kbd;
    b.setAttribute('role', 'menuitem');
    more.append(b);
    [...more.children].sort((a, c) => ORDER.indexOf(a.id) - ORDER.indexOf(c.id)).forEach(x => more.append(x));
  }
  const sweep = () => [...btns.children].filter(x => x.tagName === 'BUTTON').forEach(adopt);
  sweep(); new MutationObserver(sweep).observe(btns, { childList: true });
  const setOpen = o => { more.classList.toggle('open', o); document.body.classList.toggle('moreOpen', o); moreBtn.classList.toggle('on', o); moreBtn.setAttribute('aria-expanded', String(o)); };
  moreBtn.onclick = e => { e.stopPropagation(); setOpen(!more.classList.contains('open')); };
  more.addEventListener('click', e => { if (e.target.closest('button')) setTimeout(() => setOpen(false), 120); });
  document.addEventListener('pointerdown', e => { if (!more.contains(e.target) && e.target !== moreBtn) setOpen(false); });
  addEventListener('keydown', e => { if (e.key === 'Escape') setOpen(false); });
  compact.addEventListener('change', () => { const t = $('tour'); if (!t) return; if (compact.matches) adopt(t); else { delete t.dataset.l; delete t.dataset.k; t.removeAttribute('role'); t.textContent = '▶ Tour'; if (!TOUCH) t.dataset.kbd = '3'; seg.after(t); } });

  // 3) Body classes for the current mode (CSS moves the dock, minimap and prompts out of the controls' way)
  const syncMode = () => { const on = seg.querySelector('.on'); const c = window.__city;   // ✈ Fly left the dock (#109), so ask app.js for the mode; the dock alone made Fly read as Orbit (no body.mFly)
    const m = c && c.getMode ? c.getMode() : on ? on.dataset.m : 'orbit';
    document.body.classList.toggle('mFly', m === 'fly'); document.body.classList.toggle('mExplore', m === 'explore'); };
  new MutationObserver(syncMode).observe(seg, { subtree: true, attributes: true, attributeFilter: ['class'] }); syncMode();
}

// 4) Status row: weather chip + live pill side by side
{
  const st = document.createElement('div'); st.id = 'status';
  const w = $('wchip'), l = $('live');
  if (w || l) { document.body.append(st); w && st.append(w); l && st.append(l); }
}

// 5) HUD: tapping the weather chip opens Settings; phones hide the toolbar while the HUD is open
{
  const hud = $('hud'), sec = $('secSettings'), w = $('wchip');
  if (w && sec) w.addEventListener('click', () => { sec.open = true; if (hud && getComputedStyle($('hudBody')).display === 'none') $('hudToggle')?.click(); });
  // fx2 adds "City features" to the HUD; tuck it into Settings
  const tuck = () => { const f = document.querySelector('#hudBody > .feat'); if (f && sec) sec.append(f); };
  tuck(); const hb = $('hudBody'); hb && new MutationObserver(tuck).observe(hb, { childList: true });
  if (hud) new MutationObserver(() => document.body.classList.toggle('uiHudOpen', hud.classList.contains('open')))
    .observe(hud, { attributes: true, attributeFilter: ['class'] });
  document.querySelectorAll('#hud details.sec').forEach(d => {
    const k = 'bc_sec_' + d.id; try { if (localStorage.getItem(k) === '1') d.open = true; } catch {}
    d.addEventListener('toggle', () => { try { localStorage.setItem(k, d.open ? '1' : '0'); } catch {} });
  });
}

// 6) Gear column on desktop too (phones get it from app.js): Board / Web / Jet with key hints, right edge under the status row
(function gear() {
  const web = $('webBtn'), jet = $('jetBtn');
  if (!web || !jet) return setTimeout(gear, 500);
  let gb = $('gearBar');
  if (!gb) {
    gb = document.createElement('div'); gb.id = 'gearBar';
    const sk = document.createElement('button'); sk.id = 'gbSkate'; sk.textContent = '🛹 Board'; sk.setAttribute('aria-label', 'Skateboard'); sk.dataset.k = 'B';
    sk.onclick = e => { e.stopPropagation(); e.preventDefault(); if (window.__jet && window.__jet.on) jet.click(); if (web.getAttribute('aria-pressed') === 'true') web.click(); window.__skate && window.__skate.toggle(); sk.blur(); };
    web.dataset.k = 'Q'; gb.append(sk, web, jet); document.body.append(gb);
    setInterval(() => {
      const on = document.body.classList.contains('mExplore') && web.style.display !== 'none' && !window.__burnTowerOpen;
      gb.classList.toggle('on', on); sk.classList.toggle('on', !!(window.__skate && window.__skate.active));
      web.classList.toggle('on', web.getAttribute('aria-pressed') === 'true');
    }, 250);
  }
  [web, jet].forEach(b => b.addEventListener('click', () => b.blur()));
})();

// 7) Live state classes: skating (reserves room above the controls), tower open, fishing/boat bars
setInterval(() => {
  const b = document.body;
  b.classList.toggle('skating', !!(window.__skate && window.__skate.active));
  b.classList.toggle('inTower', !!window.__burnTowerOpen);
}, 300);
