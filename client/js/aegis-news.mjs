// AEGIS City Watch news ticker: a slim, news-station style crawl pinned to the very top edge.
// UI only: no polling, wallets or game-state writes. The upstream AEGIS module validates the
// live feed before calling updateAegisNewsFeed; what AEGIS says is unchanged.
//  - Feed lines are queued and crawl right-to-left in one seamless loop (CSS transform only).
//  - Event-driven headlines (publishAegisHeadline) jump to the front, tagged by level, for 14 s.
//  - The bar reserves its own strip: <html class="aegis-ticker-on"> pushes the HUD's --sa-t
//    down by the ticker height, so nothing overlaps and the safe-area inset is respected.
//  - Hover/focus pauses the crawl; tapping it expands a panel listing every current line, with
//    "Open AEGIS Command", so ELEVATED/CRITICAL items are always reachable.
//  - prefers-reduced-motion: no crawl; one line at a time with a gentle fade every 9.5 s.
const SNOOZE_MS = 15 * 60 * 1000;
const ROTATE_MS = 9500;
const PRIORITY_MS = 14000;
const SPEED_PX_S = 70;
const clean = value => typeof value === 'string'
  ? value.replace(/[\u0000-\u001f\u007f<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, 180) : '';
const LEVEL_NAMES = ['NORMAL', 'ELEVATED', 'CRITICAL'];
let lines = [], level = 0, index = 0, pinned = null, lastMessage = '', lastMessageAt = 0, shownKey = '';
let mutedUntil = 0, root = null, brand = null, levelNode = null, track = null, headline = null, panel = null, list = null, announcer = null;
try { mutedUntil = Number(sessionStorage.getItem('bc_aegisNewsUntil')) || 0; } catch {}
const now = () => Date.now();
const reducedMotion = () => { try { return !!matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; } };
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
function setExpanded(open) {
  if (!root) return;
  panel.hidden = !open;
  root.toggleAttribute('data-expanded', open);
  brand.setAttribute('aria-expanded', String(open));
  headline.setAttribute('aria-expanded', String(open));
  if (open) renderPanel();
}
function mount() {
  if (root) return;
  root = el('aside');
  root.id = 'aegisNews';
  root.hidden = true;
  root.setAttribute('aria-label', 'AEGIS City Watch news ticker');
  brand = el('button', 'an-brand an-expand');
  brand.type = 'button';
  brand.setAttribute('aria-controls', 'aegisNewsPanel');
  brand.setAttribute('aria-label', 'Show all AEGIS headlines');
  brand.append(Object.assign(el('span', 'an-mark', '◈'), { ariaHidden: 'true' }), el('span', 'an-word', 'AEGIS'));
  levelNode = el('span', 'an-level');
  brand.append(levelNode);
  const viewport = el('div', 'an-viewport');
  headline = el('button', 'an-headline');
  headline.type = 'button';
  headline.setAttribute('aria-controls', 'aegisNewsPanel');
  track = el('span', 'an-track');
  headline.append(track);
  viewport.append(headline);
  const dismiss = el('button', 'an-dismiss', '×');
  dismiss.type = 'button';
  dismiss.setAttribute('aria-label', 'Hide AEGIS news for 15 minutes');
  dismiss.title = 'Hide for 15 minutes';
  panel = el('div', 'an-panel');
  panel.id = 'aegisNewsPanel';
  panel.hidden = true;
  list = el('ul', 'an-list');
  const actions = el('div', 'an-actions');
  const open = el('button', 'an-open', 'Open AEGIS Command');
  open.type = 'button';
  open.addEventListener('click', () => { setExpanded(false); window.__aegis?.open?.(); });
  const close = el('button', 'an-close', 'Close');
  close.type = 'button';
  close.addEventListener('click', () => setExpanded(false));
  actions.append(open, close);
  panel.append(list, actions);
  announcer = el('span', 'an-announcer');
  announcer.setAttribute('role', 'status');
  announcer.setAttribute('aria-live', 'polite');
  announcer.setAttribute('aria-atomic', 'true');
  const toggle = () => setExpanded(panel.hidden);
  brand.addEventListener('click', toggle);
  headline.addEventListener('click', toggle);
  dismiss.addEventListener('click', () => {
    mutedUntil = now() + SNOOZE_MS;
    try { sessionStorage.setItem('bc_aegisNewsUntil', String(mutedUntil)); } catch {}
    setExpanded(false);
    render();
  });
  addEventListener('keydown', e => { if (e.key === 'Escape' && root && !panel.hidden) setExpanded(false); });
  addEventListener('pointerdown', e => { if (root && !panel.hidden && !root.contains(e.target)) setExpanded(false); }, true);
  root.append(brand, viewport, dismiss, panel, announcer);
  document.body.append(root);
}
// Items in crawl order: the live priority headline first, then the queued feed lines.
function items() {
  const out = [];
  if (pinned) out.push({ text: pinned.text, level: pinned.level, priority: true });
  for (const text of lines) if (!pinned || text !== pinned.text) out.push({ text, level, priority: false });
  return out;
}
function itemNode(item) {
  const span = el('span', 'an-item');
  span.dataset.level = String(item.level);
  // Only the live priority headline gets a tag, and not when its text already names the level.
  const tag = item.level > 0 ? LEVEL_NAMES[item.level] : 'UPDATE';
  if (item.priority && !item.text.toUpperCase().includes(tag)) span.append(el('b', 'an-tag', tag));
  span.append(el('span', 'an-text', item.text));
  return span;
}
function renderPanel() {
  list.replaceChildren(...items().map(item => { const li = el('li'); li.append(itemNode(item)); return li; }));
}
function setVisible(visible) {
  root.hidden = !visible;
  document.documentElement.classList.toggle('aegis-ticker-on', visible);
  if (!visible) setExpanded(false);
}
function render() {
  mount();
  if (pinned && now() >= pinned.until) pinned = null;
  const all = items();
  if (document.hidden || now() < mutedUntil || !all.length) { setVisible(false); shownKey = ''; return; }
  setVisible(true);
  const lead = all[0];
  root.dataset.level = String(Math.max(pinned ? pinned.level : 0, level));
  levelNode.textContent = LEVEL_NAMES[+root.dataset.level] || LEVEL_NAMES[0];
  const reduce = reducedMotion();
  const shown = reduce ? [all[index % all.length]] : all;
  const key = (reduce ? 'r|' : 'm|') + shown.map(i => i.level + (i.priority ? '!' : '') + i.text).join('\n');
  // Accessible name carries the lead headline (priority first) rather than the whole crawl.
  headline.setAttribute('aria-label', 'AEGIS news: ' + (shown[0] || lead).text + '. Show all headlines');
  headline.dataset.lead = (shown[0] || lead).text;
  if (!panel.hidden) renderPanel();
  if (key === shownKey) return;
  shownKey = key;
  root.dataset.motion = reduce ? 'static' : 'crawl';
  const run = () => { const r = el('span', 'an-run'); shown.forEach(i => r.append(itemNode(i), el('span', 'an-sep', '◆'))); return r; };
  if (reduce) { track.replaceChildren(run()); track.style.animationDuration = ''; return; }
  const copy = run();
  copy.setAttribute('aria-hidden', 'true');
  track.replaceChildren(run(), copy);   // two identical runs: translate -50% loops seamlessly
  // Restart from the right edge so a new priority headline is seen first.
  track.classList.remove('an-go');
  const width = track.firstChild.getBoundingClientRect?.().width || 600;
  track.style.animationDuration = Math.max(12, width / SPEED_PX_S).toFixed(1) + 's';
  void track.offsetWidth;
  track.classList.add('an-go');
}
export function updateAegisNewsFeed(payload) {
  const next = Array.isArray(payload?.lines) ? payload.lines.map(clean).filter(Boolean).slice(0, 12) : [];
  const changed = lines.join('\n') !== next.join('\n');
  lines = next;
  level = Math.max(0, Math.min(2, Number(payload?.level) || 0));
  if (changed) index = 0;
  render();
}
export function publishAegisHeadline(message, severity = level) {
  const text = clean(message);
  if (!text) return;
  const t = now();
  if (text === lastMessage && t - lastMessageAt < 8000) return;
  lastMessage = text;
  lastMessageAt = t;
  const lv = Math.max(0, Math.min(2, Number(severity) || 0));
  pinned = { text, level: lv, until: t + PRIORITY_MS };
  index = 0;
  if (t >= mutedUntil) {
    mount();
    announcer.textContent = text; // only event-driven alerts get announced
  }
  render();
}
export function clearAegisNews() {
  lines = [];
  level = 0;
  index = 0;
  pinned = null;
  if (root) { setVisible(false); announcer.textContent = ''; shownKey = ''; }
}
addEventListener('bc:aegis-news', event => {
  const item = event.detail || {};
  publishAegisHeadline(item.text, item.level);
});
document.addEventListener('visibilitychange', render);
setInterval(() => {
  if (document.hidden) return;
  if (pinned && now() >= pinned.until) pinned = null;
  if (reducedMotion()) index++;
  render();
}, ROTATE_MS);
