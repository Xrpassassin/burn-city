// Burn City UI v6: groups the toolbar, adds an overflow menu and a status row.
// Only moves existing elements (handlers and ids stay intact), so other modules keep working.
const $ = id => document.getElementById(id);
const btns = $('btns');
if (btns) {
  // 1) Mode switch as a segmented control
  const seg = document.createElement('div'); seg.className = 'seg'; seg.setAttribute('role', 'group'); seg.setAttribute('aria-label', 'Camera mode');
  const labels = { orbit: '◎ Orbit', fly: '✈ Fly', explore: '🚶 Explore' };
  btns.querySelectorAll('[data-m]').forEach(b => { if (labels[b.dataset.m]) b.textContent = labels[b.dataset.m]; seg.append(b); });
  btns.prepend(seg);
  const tour = $('tour'); if (tour) seg.after(tour);

  // 2) Overflow menu for secondary actions
  const more = document.createElement('div'); more.id = 'more'; more.setAttribute('role', 'menu'); document.body.append(more);
  const moreBtn = document.createElement('button'); moreBtn.id = 'moreBtn'; moreBtn.textContent = '⋯';
  moreBtn.setAttribute('aria-label', 'More'); moreBtn.setAttribute('aria-haspopup', 'menu'); moreBtn.setAttribute('aria-expanded', 'false');
  btns.append(moreBtn);
  const L = { copyLink: 'Copy link to this view', installBtn: 'Install app', audio: 'Sound', guideBtn: 'How to read the city', musicBtn: 'Music',
    socialBtn: 'Social', bagBtn: 'My bag', tour: 'Guided tour' };
  const ICON = { copyLink: '🔗', installBtn: '⬇', guideBtn: '?', musicBtn: '♪', socialBtn: '💬', bagBtn: '💼', tour: '▶' };
  const ORDER = ['tour', 'guideBtn', 'musicBtn', 'audio', 'socialBtn', 'bagBtn', 'copyLink', 'installBtn'];
  const phone = matchMedia('(max-width:700px)');
  const stay = new Set(['moreBtn', 'playBtn']);
  function adopt(b) {
    if (!b || !b.id || stay.has(b.id) || b.closest('.seg')) return;
    if (b.id === 'tour' && !phone.matches) return; // desktop keeps Tour on the bar
    b.dataset.l = L[b.id] || b.getAttribute('aria-label') || '';
    if (ICON[b.id] && b.id !== 'audio') b.textContent = ICON[b.id];
    b.setAttribute('role', 'menuitem');
    more.append(b);
    [...more.children].sort((a, c) => ORDER.indexOf(a.id) - ORDER.indexOf(c.id)).forEach(x => more.append(x));
  }
  const sweep = () => [...btns.children].filter(x => x.tagName === 'BUTTON').forEach(adopt);
  sweep(); new MutationObserver(sweep).observe(btns, { childList: true });
  // Buttons can rewrite their own text (copy link → "Copied"); keep the icon short in the menu
  const setOpen = o => { more.classList.toggle('open', o); moreBtn.classList.toggle('on', o); moreBtn.setAttribute('aria-expanded', String(o)); };
  moreBtn.onclick = e => { e.stopPropagation(); setOpen(!more.classList.contains('open')); };
  more.addEventListener('click', e => { if (e.target.closest('button')) setTimeout(() => setOpen(false), 120); });
  document.addEventListener('pointerdown', e => { if (!more.contains(e.target) && e.target !== moreBtn) setOpen(false); });
  addEventListener('keydown', e => { if (e.key === 'Escape') setOpen(false); });
  phone.addEventListener('change', () => { const t = $('tour'); if (!t) return; if (phone.matches) adopt(t); else { delete t.dataset.l; t.textContent = '▶ Tour'; seg.after(t); } });

  // 3) Body classes for the current mode (lets CSS move the dock out of the joystick's way)
  const syncMode = () => { const on = seg.querySelector('.on'); const m = on ? on.dataset.m : 'orbit';
    document.body.classList.toggle('mFly', m === 'fly'); document.body.classList.toggle('mExplore', m === 'explore'); };
  new MutationObserver(syncMode).observe(seg, { subtree: true, attributes: true, attributeFilter: ['class'] }); syncMode();
}

// 4) Status row: weather chip + live pill side by side
{
  const st = document.createElement('div'); st.id = 'status';
  const w = $('wchip'), l = $('live');
  if (w || l) { document.body.append(st); w && st.append(w); l && st.append(l); }
}

// 5) HUD: tapping the weather chip opens Settings; phone hides the toolbar while the HUD is open
{
  const hud = $('hud'), sec = $('secSettings'), w = $('wchip');
  if (w && sec) w.addEventListener('click', () => { sec.open = true; });
  // fx2 adds "City features" to the HUD; tuck it into Settings
  const tuck = () => { const f = document.querySelector('#hudBody > .feat'); if (f && sec) sec.append(f); };
  tuck(); const hb = $('hudBody'); hb && new MutationObserver(tuck).observe(hb, { childList: true });
  if (hud) new MutationObserver(() => document.body.classList.toggle('uiHudOpen', hud.classList.contains('open')))
    .observe(hud, { attributes: true, attributeFilter: ['class'] });
  // Desktop: remember which sections are open
  document.querySelectorAll('#hud details.sec').forEach(d => {
    const k = 'bc_sec_' + d.id; try { if (localStorage.getItem(k) === '1') d.open = true; } catch {}
    d.addEventListener('toggle', () => { try { localStorage.setItem(k, d.open ? '1' : '0'); } catch {} });
  });
}
