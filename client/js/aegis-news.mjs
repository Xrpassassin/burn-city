// Compact AEGIS City Watch news strip. UI only: no polling, wallets or game-state writes.
// The upstream AEGIS module validates the live feed before calling updateAegisNewsFeed.
// Inspired by WAI-ARIA status patterns; native controls keep the dependency surface tiny.
const SNOOZE_MS = 15 * 60 * 1000;
const ROTATE_MS = 9500;
const PRIORITY_MS = 14000;
const clean = value => typeof value === 'string'
  ? value.replace(/[\u0000-\u001f\u007f<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, 180) : '';
const LEVEL_NAMES = ['NORMAL', 'ELEVATED', 'CRITICAL'];
let lines = [], level = 0, index = 0, pinned = null, lastMessage = '', lastMessageAt = 0;
let mutedUntil = 0, root = null, headline = null, levelNode = null, announcer = null;
try { mutedUntil = Number(sessionStorage.getItem('bc_aegisNewsUntil')) || 0; } catch {}
const now = () => Date.now();
function mount() {
  if (root) return;
  root = document.createElement('aside');
  root.id = 'aegisNews';
  root.hidden = true;
  root.setAttribute('aria-label', 'AEGIS City Watch news');
  root.innerHTML = `<span class="an-brand" aria-hidden="true"><span class="an-mark">◈</span> AEGIS <span class="an-brand-extra">CITY WATCH</span></span>
    <span class="an-level" aria-label="Threat level"></span>
    <button class="an-headline" type="button" title="Open the AEGIS Command console" aria-label="Open AEGIS Command console"></button>
    <button class="an-dismiss" type="button" aria-label="Hide AEGIS news for 15 minutes" title="Hide for 15 minutes">×</button>
    <span class="an-announcer" role="status" aria-live="polite" aria-atomic="true"></span>`;
  headline = root.querySelector('.an-headline');
  levelNode = root.querySelector('.an-level');
  announcer = root.querySelector('.an-announcer');
  headline.addEventListener('click', () => window.__aegis?.open?.());
  root.querySelector('.an-dismiss').addEventListener('click', () => {
    mutedUntil = now() + SNOOZE_MS;
    try { sessionStorage.setItem('bc_aegisNewsUntil', String(mutedUntil)); } catch {}
    render();
  });
  document.body.append(root);
}
function render() {
  mount();
  if (document.hidden || now() < mutedUntil || (!lines.length && !pinned)) {
    root.hidden = true;
    return;
  }
  if (pinned && now() >= pinned.until) pinned = null;
  if (!lines.length && !pinned) { root.hidden = true; return; }
  const active = pinned || { text: lines[index % lines.length], level };
  if (!active.text) { root.hidden = true; return; }
  root.hidden = false;
  root.dataset.level = String(active.level);
  levelNode.textContent = LEVEL_NAMES[active.level] || LEVEL_NAMES[0];
  headline.textContent = active.text;
  // The button's accessible name includes the headline rather than replacing it.
  headline.setAttribute('aria-label', 'AEGIS news: ' + active.text + '. Open AEGIS Command');
}
// The feed rotates on a discrete interval, not a continuously moving marquee.
// Updates don't repeatedly announce each headline to screen readers.
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
  if (root) { root.hidden = true; announcer.textContent = ''; }
}
addEventListener('bc:aegis-news', event => {
  const item = event.detail || {};
  publishAegisHeadline(item.text, item.level);
});
document.addEventListener('visibilitychange', render);
setInterval(() => {
  if (document.hidden) return;
  if (pinned && now() >= pinned.until) pinned = null;
  if (!pinned && lines.length > 1) index = (index + 1) % lines.length;
  render();
}, ROTATE_MS);
