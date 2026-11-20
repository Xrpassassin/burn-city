// BURN City "Forge" UI runtime (presentation only): one consistent icon set replacing mixed emoji in
// the HUD, menus and sheets, plus reward count-up/pop animations. No game, payment or notification logic.
// Icons: Tabler Icons (MIT, (c) Paweł Kuna) — https://tabler.io/icons — credited in city-credits.html.
const ICONS = {
"alert-triangle": "<path d=\"M12 9v4\" /> <path d=\"M10.363 3.591l-8.106 13.534a1.914 1.914 0 0 0 1.636 2.871h16.214a1.914 1.914 0 0 0 1.636 -2.87l-8.106 -13.536a1.914 1.914 0 0 0 -3.274 0z\" /> <path d=\"M12 16h.01\" />",
"bolt": "<path d=\"M13 3l0 7l6 0l-8 11l0 -7l-6 0l8 -11\" />",
"building-castle": "<path d=\"M15 19v-2a3 3 0 0 0 -6 0v2a1 1 0 0 1 -1 1h-4a1 1 0 0 1 -1 -1v-14h4v3h3v-3h4v3h3v-3h4v14a1 1 0 0 1 -1 1h-4a1 1 0 0 1 -1 -1z\" /> <path d=\"M3 11l18 0\" />",
"chart-line": "<path d=\"M4 19l16 0\" /> <path d=\"M4 15l4 -6l4 2l4 -5l4 4\" />",
"check": "<path d=\"M5 12l5 5l10 -10\" />",
"circle-check": "<path d=\"M12 12m-9 0a9 9 0 1 0 18 0a9 9 0 1 0 -18 0\" /> <path d=\"M9 12l2 2l4 -4\" />",
"coin": "<path d=\"M12 12m-9 0a9 9 0 1 0 18 0a9 9 0 1 0 -18 0\" /> <path d=\"M14.8 9a2 2 0 0 0 -1.8 -1h-2a2 2 0 1 0 0 4h2a2 2 0 1 1 0 4h-2a2 2 0 0 1 -1.8 -1\" /> <path d=\"M12 7v10\" />",
"compass": "<path d=\"M8 16l2 -6l6 -2l-2 6l-6 2\" /> <path d=\"M12 12m-9 0a9 9 0 1 0 18 0a9 9 0 1 0 -18 0\" /> <path d=\"M12 3l0 2\" /> <path d=\"M12 19l0 2\" /> <path d=\"M3 12l2 0\" /> <path d=\"M19 12l2 0\" />",
"device-gamepad-2": "<path d=\"M12 5h3.5a5 5 0 0 1 0 10h-5.5l-4.015 4.227a2.3 2.3 0 0 1 -3.923 -2.035l1.634 -8.173a5 5 0 0 1 4.904 -4.019h3.4z\" /> <path d=\"M14 15l4.07 4.284a2.3 2.3 0 0 0 3.925 -2.023l-1.6 -8.232\" /> <path d=\"M8 9v2\" /> <path d=\"M7 10h2\" /> <path d=\"M14 10h2\" />",
"dots": "<path d=\"M5 12m-1 0a1 1 0 1 0 2 0a1 1 0 1 0 -2 0\" /> <path d=\"M12 12m-1 0a1 1 0 1 0 2 0a1 1 0 1 0 -2 0\" /> <path d=\"M19 12m-1 0a1 1 0 1 0 2 0a1 1 0 1 0 -2 0\" />",
"eye": "<path d=\"M10 12a2 2 0 1 0 4 0a2 2 0 0 0 -4 0\" /> <path d=\"M21 12c-2.4 4 -5.4 6 -9 6c-3.6 0 -6.6 -2 -9 -6c2.4 -4 5.4 -6 9 -6c3.6 0 6.6 2 9 6\" />",
"flag": "<path d=\"M5 5a5 5 0 0 1 7 0a5 5 0 0 0 7 0v9a5 5 0 0 1 -7 0a5 5 0 0 0 -7 0v-9z\" /> <path d=\"M5 21v-7\" />",
"flame": "<path d=\"M12 10.941c2.333 -3.308 .167 -7.823 -1 -8.941c0 3.395 -2.235 5.299 -3.667 6.706c-1.43 1.408 -2.333 3.621 -2.333 5.588c0 3.704 3.134 6.706 7 6.706s7 -3.002 7 -6.706c0 -1.712 -1.232 -4.403 -2.333 -5.588c-2.084 3.353 -3.257 3.353 -4.667 2.235\" />",
"gift": "<path d=\"M3 8m0 1a1 1 0 0 1 1 -1h16a1 1 0 0 1 1 1v2a1 1 0 0 1 -1 1h-16a1 1 0 0 1 -1 -1z\" /> <path d=\"M12 8l0 13\" /> <path d=\"M19 12v7a2 2 0 0 1 -2 2h-10a2 2 0 0 1 -2 -2v-7\" /> <path d=\"M7.5 8a2.5 2.5 0 0 1 0 -5a4.8 8 0 0 1 4.5 5a4.8 8 0 0 1 4.5 -5a2.5 2.5 0 0 1 0 5\" />",
"help": "<path d=\"M12 12m-9 0a9 9 0 1 0 18 0a9 9 0 1 0 -18 0\" /> <path d=\"M12 17l0 .01\" /> <path d=\"M12 13.5a1.5 1.5 0 0 1 1 -1.5a2.6 2.6 0 1 0 -3 -4\" />",
"home": "<path d=\"M5 12l-2 0l9 -9l9 9l-2 0\" /> <path d=\"M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2 -2v-7\" /> <path d=\"M9 21v-6a2 2 0 0 1 2 -2h2a2 2 0 0 1 2 2v6\" />",
"info-circle": "<path d=\"M3 12a9 9 0 1 0 18 0a9 9 0 0 0 -18 0\" /> <path d=\"M12 9h.01\" /> <path d=\"M11 12h1v4h1\" />",
"link": "<path d=\"M9 15l6 -6\" /> <path d=\"M11 6l.463 -.536a5 5 0 0 1 7.071 7.072l-.534 .464\" /> <path d=\"M13 18l-.397 .534a5.068 5.068 0 0 1 -7.127 0a4.972 4.972 0 0 1 0 -7.071l.524 -.463\" />",
"lock": "<path d=\"M5 13a2 2 0 0 1 2 -2h10a2 2 0 0 1 2 2v6a2 2 0 0 1 -2 2h-10a2 2 0 0 1 -2 -2v-6z\" /> <path d=\"M11 16a1 1 0 1 0 2 0a1 1 0 0 0 -2 0\" /> <path d=\"M8 11v-4a4 4 0 1 1 8 0v4\" />",
"message-circle": "<path d=\"M3 20l1.3 -3.9c-2.324 -3.437 -1.426 -7.872 2.1 -10.374c3.526 -2.501 8.59 -2.296 11.845 .48c3.255 2.777 3.695 7.266 1.029 10.501c-2.666 3.235 -7.615 4.215 -11.574 2.293l-4.7 1\" />",
"music": "<path d=\"M3 17a3 3 0 1 0 6 0a3 3 0 0 0 -6 0\" /> <path d=\"M13 17a3 3 0 1 0 6 0a3 3 0 0 0 -6 0\" /> <path d=\"M9 17v-13h10v13\" /> <path d=\"M9 8h10\" />",
"plane": "<path d=\"M16 10h4a2 2 0 0 1 0 4h-4l-4 7h-3l2 -7h-4l-2 2h-3l2 -4l-2 -4h3l2 2h4l-2 -7h3z\" />",
"player-play": "<path d=\"M7 4v16l13 -8z\" />",
"qrcode": "<path d=\"M4 4m0 1a1 1 0 0 1 1 -1h4a1 1 0 0 1 1 1v4a1 1 0 0 1 -1 1h-4a1 1 0 0 1 -1 -1z\" /> <path d=\"M7 17l0 .01\" /> <path d=\"M14 4m0 1a1 1 0 0 1 1 -1h4a1 1 0 0 1 1 1v4a1 1 0 0 1 -1 1h-4a1 1 0 0 1 -1 -1z\" /> <path d=\"M7 7l0 .01\" /> <path d=\"M4 14m0 1a1 1 0 0 1 1 -1h4a1 1 0 0 1 1 1v4a1 1 0 0 1 -1 1h-4a1 1 0 0 1 -1 -1z\" /> <path d=\"M17 7l0 .01\" /> <path d=\"M14 14l3 0\" /> <path d=\"M20 14l0 .01\" /> <path d=\"M14 14l0 3\" /> <path d=\"M14 20l3 0\" /> <path d=\"M17 17l3 0\" /> <path d=\"M20 17l0 3\" />",
"rocket": "<path d=\"M4 13a8 8 0 0 1 7 7a6 6 0 0 0 3 -5a9 9 0 0 0 6 -8a3 3 0 0 0 -3 -3a9 9 0 0 0 -8 6a6 6 0 0 0 -5 3\" /> <path d=\"M7 14a6 6 0 0 0 -3 6a6 6 0 0 0 6 -3\" /> <path d=\"M15 9m-1 0a1 1 0 1 0 2 0a1 1 0 1 0 -2 0\" />",
"route": "<path d=\"M3 19a2 2 0 1 0 4 0a2 2 0 0 0 -4 0\" /> <path d=\"M19 7a2 2 0 1 0 0 -4a2 2 0 0 0 0 4z\" /> <path d=\"M11 19h5.5a3.5 3.5 0 0 0 0 -7h-8a3.5 3.5 0 0 1 0 -7h4.5\" />",
"sailboat": "<path d=\"M2 20a2.4 2.4 0 0 0 2 1a2.4 2.4 0 0 0 2 -1a2.4 2.4 0 0 1 2 -1a2.4 2.4 0 0 1 2 1a2.4 2.4 0 0 0 2 1a2.4 2.4 0 0 0 2 -1a2.4 2.4 0 0 1 2 -1a2.4 2.4 0 0 1 2 1a2.4 2.4 0 0 0 2 1a2.4 2.4 0 0 0 2 -1\" /> <path d=\"M4 18l-1 -3h18l-1 3\" /> <path d=\"M11 12h7l-7 -9v9\" /> <path d=\"M8 7l-2 5\" />",
"settings": "<path d=\"M10.325 4.317c.426 -1.756 2.924 -1.756 3.35 0a1.724 1.724 0 0 0 2.573 1.066c1.543 -.94 3.31 .826 2.37 2.37a1.724 1.724 0 0 0 1.065 2.572c1.756 .426 1.756 2.924 0 3.35a1.724 1.724 0 0 0 -1.066 2.573c.94 1.543 -.826 3.31 -2.37 2.37a1.724 1.724 0 0 0 -2.572 1.065c-.426 1.756 -2.924 1.756 -3.35 0a1.724 1.724 0 0 0 -2.573 -1.066c-1.543 .94 -3.31 -.826 -2.37 -2.37a1.724 1.724 0 0 0 -1.065 -2.572c-1.756 -.426 -1.756 -2.924 0 -3.35a1.724 1.724 0 0 0 1.066 -2.573c-.94 -1.543 .826 -3.31 2.37 -2.37c1 .608 2.296 .07 2.572 -1.065z\" /> <path d=\"M9 12a3 3 0 1 0 6 0a3 3 0 0 0 -6 0\" />",
"shopping-cart": "<path d=\"M6 19m-2 0a2 2 0 1 0 4 0a2 2 0 1 0 -4 0\" /> <path d=\"M17 19m-2 0a2 2 0 1 0 4 0a2 2 0 1 0 -4 0\" /> <path d=\"M17 17h-11v-14h-2\" /> <path d=\"M6 5l14 1l-1 7h-13\" />",
"skateboarding": "<path d=\"M16 4a1 1 0 1 0 2 0a1 1 0 0 0 -2 0\" /> <path d=\"M5.5 15h3.5l.75 -1.5\" /> <path d=\"M14 19v-5l-2.5 -3l2.5 -4\" /> <path d=\"M8 8l3 -1h4l1 3h3\" /> <path d=\"M17.5 21a.5 .5 0 1 0 0 -1a.5 .5 0 0 0 0 1z\" fill=\"currentColor\" /> <path d=\"M3 18c0 .552 .895 1 2 1h14c1.105 0 2 -.448 2 -1\" /> <path d=\"M6.5 21a.5 .5 0 1 0 0 -1a.5 .5 0 0 0 0 1z\" fill=\"currentColor\" />",
"trophy": "<path d=\"M8 21l8 0\" /> <path d=\"M12 17l0 4\" /> <path d=\"M7 4l10 0\" /> <path d=\"M17 4v8a5 5 0 0 1 -10 0v-8\" /> <path d=\"M5 9m-2 0a2 2 0 1 0 4 0a2 2 0 1 0 -4 0\" /> <path d=\"M19 9m-2 0a2 2 0 1 0 4 0a2 2 0 1 0 -4 0\" />",
"volume": "<path d=\"M15 8a5 5 0 0 1 0 8\" /> <path d=\"M17.7 5a9 9 0 0 1 0 14\" /> <path d=\"M6 15h-2a1 1 0 0 1 -1 -1v-4a1 1 0 0 1 1 -1h2l3.5 -4.5a.8 .8 0 0 1 1.5 .5v14a.8 .8 0 0 1 -1.5 .5l-3.5 -4.5\" />",
"volume-off": "<path d=\"M15 8a5 5 0 0 1 1.912 4.934m-1.377 2.602a5 5 0 0 1 -.535 .464\" /> <path d=\"M17.7 5a9 9 0 0 1 2.362 11.086m-1.676 2.299a9 9 0 0 1 -.686 .615\" /> <path d=\"M9.069 5.054l.431 -.554a.8 .8 0 0 1 1.5 .5v2m0 4v8a.8 .8 0 0 1 -1.5 .5l-3.5 -4.5h-2a1 1 0 0 1 -1 -1v-4a1 1 0 0 1 1 -1h2l1.294 -1.664\" /> <path d=\"M3 3l18 18\" />",
"walk": "<path d=\"M13 4m-1 0a1 1 0 1 0 2 0a1 1 0 1 0 -2 0\" /> <path d=\"M7 21l3 -4\" /> <path d=\"M16 21l-2 -4l-3 -3l1 -6\" /> <path d=\"M6 12l2 -3l4 -1l3 3l3 1\" />",
"wallet": "<path d=\"M17 8v-3a1 1 0 0 0 -1 -1h-10a2 2 0 0 0 0 4h12a1 1 0 0 1 1 1v3m0 4v3a1 1 0 0 1 -1 1h-12a2 2 0 0 1 -2 -2v-12\" /> <path d=\"M20 12v4h-4a2 2 0 0 1 0 -4h4\" />",
"world": "<path d=\"M3 12a9 9 0 1 0 18 0a9 9 0 0 0 -18 0\" /> <path d=\"M3.6 9h16.8\" /> <path d=\"M3.6 15h16.8\" /> <path d=\"M11.5 3a17 17 0 0 0 0 18\" /> <path d=\"M12.5 3a17 17 0 0 1 0 18\" />",
"x": "<path d=\"M18 6l-12 12\" /> <path d=\"M6 6l12 12\" />"
};
// emoji / glyph -> icon (longest keys first so variation-selector forms win)
export const EMOJI_ICON = {"◎": "compass", "🚶": "walk", "▶": "player-play", "🏠": "home", "🔗": "link", "🔇": "volume-off", "🔊": "volume", "♪": "music", "💬": "message-circle", "⋯": "dots", "🔥": "flame", "🪙": "coin", "🚀": "rocket", "✈️": "plane", "✈": "plane", "⛵": "sailboat", "🛹": "skateboarding", "🕸️": "world", "🕸": "world", "🎮": "device-gamepad-2", "✕": "x", "×": "x", "⇄": "route", "☰": "eye", "🏆": "trophy", "🎁": "gift", "⚡": "bolt", "⚙️": "settings", "⚙": "settings", "🛒": "shopping-cart", "👛": "wallet", "🔒": "lock", "📈": "chart-line", "⚑": "flag", "⚠️": "alert-triangle", "⚠": "alert-triangle", "✓": "check", "🏰": "building-castle", "🏘️": "building-castle", "🏘": "building-castle"};
const KEYS = Object.keys(EMOJI_ICON).sort((a, b) => b.length - a.length);
const RX = new RegExp('(' + KEYS.map(k => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|') + ')\\uFE0F?', 'u');
const NS = 'http://www.w3.org/2000/svg';
// Where emoji are swapped for icons. Kept to chrome (buttons, chips, sheet titles), never to user text,
// toasts or game content.
export const ICON_ROOTS = ['#btns', '#more', '#bcMoveGamesOpen', '#bcMoveGamesPanel .bc-mg-card', '#rChip', '#gearBar', '#webBtn', '#tbtns',
  '#hud .row.tl', '.jp-sheet h3', '#bcEstatesXaman .bc-xaman-close', '#bcEstatesLivePrompt', '#estate-views'];

export function iconSvg(name, doc = document) {
  const svg = doc.createElementNS(NS, 'svg');
  svg.setAttribute('class', 'bc-ico'); svg.setAttribute('viewBox', '0 0 24 24'); svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('data-i', name); svg.setAttribute('focusable', 'false');
  svg.innerHTML = ICONS[name] || '';
  return svg;
}

// Replace known emoji inside text nodes of `el` with inline SVG icons. Returns the number replaced.
export function iconify(el, doc = el.ownerDocument || document) {
  if (!el || el.closest?.('input,textarea,[contenteditable],#bcNotifyLane,#labels')) return 0;
  let n = 0;
  // the ⋯ menu's lone "?" (How to read the city) gets the help icon
  for (const b of el.querySelectorAll?.('#guideBtn') || []) if (b.firstChild?.nodeType === 3 && b.firstChild.nodeValue.trim() === '?') { b.firstChild.replaceWith(iconSvg('help', doc)); n++; }
  const walker = doc.createTreeWalker(el, 4 /* NodeFilter.SHOW_TEXT */);
  const nodes = []; for (let t = walker.nextNode(); t; t = walker.nextNode()) if (RX.test(t.nodeValue)) nodes.push(t);
  for (let node of nodes) {
    // app.js rewrites #vExit whenever its text differs from "☰ View"/"✕ Exit": leave it alone to avoid a rewrite loop
    if (node.parentElement?.closest('#vExit')) continue;
    const host = node.parentElement?.closest('button,a,[role=button],[role=tab]');
    let m;
    while (node && (m = RX.exec(node.nodeValue))) {
      const after = node.splitText(m.index);
      const rest = after.splitText(m[0].length);
      after.replaceWith(iconSvg(EMOJI_ICON[m[1]], doc));
      if (/^\s/.test(rest.nodeValue) || !rest.nodeValue) {} else rest.nodeValue = ' ' + rest.nodeValue;
      node = rest; n++;
    }
    // keep an accessible name when the emoji was the only label
    if (host && !host.getAttribute('aria-label') && !host.textContent.trim()) {
      const name = host.title || host.dataset.l || host.querySelector('.bc-ico')?.dataset.i?.replace(/-\d$/, '').replace(/-/g, ' ');
      if (name) host.setAttribute('aria-label', name);
    }
  }
  return n;
}

// Reward count-up: when an integer inside a watched element goes UP, tween it and pop the element.
const reduced = () => globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
const lastNums = new WeakMap();
export function countUp(el, from, to, ms = 900, onFrame) {
  if (reduced() || !(to > from)) return Promise.resolve();
  el.classList.remove('fg-count-pop'); void el.offsetWidth; el.classList.add('fg-count-pop');
  return new Promise(res => {
    const t0 = performance.now();
    const step = t => { const k = Math.min(1, (t - t0) / ms), e = 1 - Math.pow(1 - k, 3), v = Math.round(from + (to - from) * e);
      onFrame?.(v); if (k < 1) requestAnimationFrame(step); else { el.classList.remove('fg-count-pop'); res(); } };
    requestAnimationFrame(step);
  });
}
function watchCounts(el) {
  if (el.__fgTween) return;
  const now = (el.textContent.match(/\d+/g) || []).map(Number), before = lastNums.get(el);
  lastNums.set(el, now);
  if (!before || before.length !== now.length) return;
  const i = now.findIndex((v, j) => v > before[j]);
  if (i < 0) return;
  // the i-th number lives in some text node; tween that node's digits in place
  const walker = document.createTreeWalker(el, 4); let k = 0, target = null, re = /\d+/g;
  for (let t = walker.nextNode(); t && !target; t = walker.nextNode()) for (const m of t.nodeValue.matchAll(re)) { if (k++ === i) { target = { t, at: m.index, len: m[0].length }; break; } }
  if (!target) return;
  el.__fgTween = true;
  const { t, at } = target; let len = target.len;
  countUp(el, before[i], now[i], 900, v => { if (!t.isConnected) return; const s = String(v); t.nodeValue = t.nodeValue.slice(0, at) + s + t.nodeValue.slice(at + len); len = s.length; })
    .finally(() => { el.__fgTween = false; lastNums.set(el, now); });
}
export const COUNT_ROOTS = ['#rChip', '.bc-ty-count', '.fg-count']; // only pure counters — never mixed text with times or prices

export function installForge(doc = document) {
  if (doc.__bcForge) return doc.__bcForge;
  let timer = 0;
  const flush = () => { timer = 0;
    for (const sel of ICON_ROOTS) for (const el of doc.querySelectorAll(sel)) iconify(el, doc);
    for (const sel of COUNT_ROOTS) for (const el of doc.querySelectorAll(sel)) watchCounts(el);
  };
  const schedule = () => { if (!timer) timer = setTimeout(flush, 120); }; // batched: at most ~8 passes/s, never per frame
  // Chrome is rebuilt by many modules (mode switches, chip updates): re-apply on DOM changes, batched.
  const mo = new MutationObserver(muts => { for (const m of muts) { if (m.target?.closest?.('#labels,#bcNotifyLane,canvas')) continue; schedule(); return; } });
  mo.observe(doc.body, { childList: true, subtree: true, characterData: true });
  flush();
  doc.documentElement.classList.add('bc-forge');
  return (doc.__bcForge = { flush, iconify, countUp, disconnect: () => mo.disconnect() });
}
if (typeof document !== 'undefined' && document.body) { installForge(document); window.__bcCountUp = countUp; }
else if (typeof document !== 'undefined') document.addEventListener('DOMContentLoaded', () => { installForge(document); window.__bcCountUp = countUp; });
