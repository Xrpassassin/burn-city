/* UI overlap collector (runs in the page via Playwright `page.evaluate(src)`; no deps).
 * Collects the painted boxes of visible fixed/absolute HUD roots (buttons, chips, banners, cards, joysticks),
 * flags every pair from different roots that intersects (>= MIN px both ways), plus painted fixed boxes outside
 * the safe-area insets. Roots covering more than 45% of the viewport are treated as intentional overlays
 * (modals, full-screen panels) and listed under `overlays` instead of being paired.
 * Usage: const r = await page.evaluate(`(${uiOverlapCollect})(${JSON.stringify(insets)}, ${JSON.stringify(ignoreSelector)})`)
 * Allow-list a deliberate pair by giving either element data-overlap-ok.
 */
function uiOverlapCollect(ins, ignore) {
  ins = ins || { top: 0, bottom: 0, left: 0, right: 0 };
  // ignore: selector for deliberate layering on a page (scene art, crosshair + hit marker); anonymous no-text divs are skipped when ignore includes ':anon'
  const anon = !!ignore && /:anon/.test(ignore); ignore = ignore ? ignore.replace(/,?\s*:anon/, '').replace(/^,/, '') : '';
  const skip = e => (ignore && e.closest(ignore)) || (anon && !e.id && !e.className && !e.textContent.trim());
  const vw = innerWidth, vh = innerHeight, MIN = 3, out = { overlaps: [], unsafe: [], overlays: [], roots: 0 };
  const shown = e => { for (let x = e; x && x !== document.documentElement; x = x.parentElement) { const s = getComputedStyle(x); if (s.display === 'none' || s.visibility === 'hidden' || +s.opacity < 0.05) return false; } return true; };
  const nm = e => { let n = e.id ? '#' + e.id : e.tagName.toLowerCase() + (typeof e.className === 'string' && e.className.trim() ? '.' + e.className.trim().split(/\s+/)[0] : ''); const t = (e.getAttribute('aria-label') || e.textContent || '').trim().replace(/\s+/g, ' '); const t2 = Array.from(t).slice(0, 24).join(''); return t2 ? n + '[' + t2 + ']' : n; };
  const alpha = c => { const m = /rgba?\(([^)]+)\)/.exec(c); if (!m) return c === 'transparent' ? 0 : 1; const p = m[1].split(/[ ,/]+/).filter(Boolean); return p.length > 3 ? parseFloat(p[3]) : 1; };
  const painted = e => {
    if (/^(BUTTON|IMG|SVG|INPUT|SELECT|VIDEO|SUMMARY|PROGRESS|METER|TEXTAREA)$/i.test(e.tagName) || (e.tagName === 'CANVAS')) return true;
    const s = getComputedStyle(e);
    if (alpha(s.backgroundColor) > 0.05 || s.backgroundImage !== 'none' || parseFloat(s.borderTopWidth) + parseFloat(s.borderLeftWidth) > 0 && alpha(s.borderTopColor) > 0.05) return true;
    for (const n of e.childNodes) if (n.nodeType === 3 && n.textContent.trim()) return true;
    return false;
  };
  // visible part of the box: clipped to the viewport and to every overflow-clipping ancestor (scrolling cards, truncated chips)
  const box = (e, vp = true) => { const b = e.getBoundingClientRect(); let l = vp ? Math.max(0, b.left) : b.left, t = vp ? Math.max(0, b.top) : b.top, r = vp ? Math.min(vw, b.right) : b.right, bt = vp ? Math.min(vh, b.bottom) : b.bottom;
    for (let a = e.parentElement; a && a !== document.body; a = a.parentElement) { const s = getComputedStyle(a); if (s.overflowX !== 'visible' || s.overflowY !== 'visible') { const c = a.getBoundingClientRect(); l = Math.max(l, c.left); t = Math.max(t, c.top); r = Math.min(r, c.right); bt = Math.min(bt, c.bottom); } }
    return r - l > 1 && bt - t > 1 ? { l, t, r, b: bt } : null; };
  const isPos = e => { const p = getComputedStyle(e).position; return p === 'fixed' || p === 'absolute' || p === 'sticky'; };
  // HUD roots: positioned elements with no positioned ancestor below <body>
  const roots = [];
  for (const e of document.body.querySelectorAll('*')) {
    if (e.tagName === 'SCRIPT' || e.tagName === 'STYLE' || !isPos(e)) continue;
    let a = e.parentElement, nested = false; for (; a && a !== document.body; a = a.parentElement) if (isPos(a)) { nested = true; break; }
    if (nested || !shown(e)) continue;
    const b = box(e); if (!b) continue;
    if (e.tagName === 'CANVAS' && (b.r - b.l) * (b.b - b.t) > vw * vh * 0.3) continue; // the 3D view
    if ((b.r - b.l) * (b.b - b.t) > vw * vh * 0.45) { out.overlays.push(nm(e)); continue; }
    roots.push(e);
  }
  out.roots = roots.map(nm);
  const items = [];
  for (const root of roots) {
    const fixedRoot = getComputedStyle(root).position === 'fixed';
    const walk = e => {
      if (!shown(e)) return;
      if (painted(e)) { const b = box(e); if (b) items.push({ e, root, b, fixedRoot }); }
      for (const c of e.children) walk(c);
    };
    walk(root);
  }
  const seen = new Set();
  for (let i = 0; i < items.length; i++) for (let j = i + 1; j < items.length; j++) {
    const A = items[i], B = items[j];
    if (A.root === B.root || A.e.contains(B.e) || B.e.contains(A.e)) continue;
    if (A.e.closest('[data-overlap-ok]') || B.e.closest('[data-overlap-ok]') || skip(A.e) || skip(B.e)) continue;
    const w = Math.min(A.b.r, B.b.r) - Math.max(A.b.l, B.b.l), h = Math.min(A.b.b, B.b.b) - Math.max(A.b.t, B.b.t);
    if (w < MIN || h < MIN) continue;
    const key = nm(A.root) + ' x ' + nm(B.root); if (seen.has(key)) continue; seen.add(key);
    out.overlaps.push({ a: nm(A.root), ae: nm(A.e), b: nm(B.root), be: nm(B.e), w: Math.round(w), h: Math.round(h) });
  }
  const unsafeSeen = new Set();
  for (const it of items) {
    if (!it.fixedRoot || unsafeSeen.has(it.root)) continue;
    if (it.e.tagName === 'CANVAS') continue;
    const c = box(it.e, false); if (!c) continue; const r = { left: c.l, top: c.t, right: c.r, bottom: c.b, width: c.r - c.l, height: c.b - c.t };
    if (r.top < ins.top - 1 || r.bottom > vh - ins.bottom + 1 || r.left < ins.left - 1 || r.right > vw - ins.right + 1) {
      if (r.width >= vw - 2 || r.height >= vh - 2) continue; // full-bleed bars/backdrops may run under the insets
      unsafeSeen.add(it.root); out.unsafe.push(nm(it.e) + ' ' + [r.left, r.top, r.right, r.bottom].map(Math.round).join(','));
    }
  }
  return out;
}
if (typeof module !== 'undefined') module.exports = { uiOverlapCollect };
