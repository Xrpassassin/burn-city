// Notification lane: one queue (priority, dedupe, low-priority rate limit, staleness), placement that
// never overlaps reserved UI, and every legacy toast surface routed through it.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createNotifyQueue, findLaneSlot, PRIORITY } from './notify-lane.mjs';

// --- queue
{
  const q = createNotifyQueue({ lowGapMs: 5000 });
  assert.equal(q.push({ text: 'swap A', priority: 'low' }, 0), 'queued');
  assert.equal(q.push({ text: 'swap A', priority: 'low' }, 10), 'merged', 'queued duplicate merges (counter) instead of stacking');
  assert.equal(q.items[0].count, 2);
  assert.equal(q.push({ text: 'Link copied' }, 20), 'queued');
  assert.equal(q.push({ text: 'Payment failed', priority: 'critical' }, 30), 'queued');
  assert.equal(q.next(40).text, 'Payment failed', 'critical first');
  assert.equal(q.next(41).text, 'Link copied', 'then normal');
  assert.equal(q.next(42).text, 'swap A', 'then low');
  q.push({ text: 'swap B', priority: 'low' }, 100);
  assert.equal(q.next(200), null, 'low priority is rate-limited (one per 5s)');
  assert.equal(q.next(5100).text, 'swap B');
  assert.equal(q.push({ text: 'swap A', priority: 'low' }, 6000), 'deduped', 'same ambient message within 30s is dropped');
  assert.equal(q.push({ text: 'swap A', priority: 'low' }, 50000), 'queued', 'and allowed again later');
}
{
  const q = createNotifyQueue();
  for (let i = 0; i < 6; i++) q.push({ text: 'feed ' + i, priority: 'low' }, i);
  assert.equal(q.size, 3, 'low backlog capped at 3 (oldest dropped)');
  assert.deepEqual(q.items.map(i => i.text), ['feed 3', 'feed 4', 'feed 5']);
  assert.equal(q.next(60000), null, 'stale ambient items are dropped, not flushed late');
  q.push({ text: 'Payment confirmed', priority: 'critical' }, 0);
  q.push({ text: 'hello' }, 0);
  assert.equal(q.next(1, { onlyCritical: true }).text, 'Payment confirmed', 'quiet mode only releases critical');
  assert.equal(q.next(2, { onlyCritical: true }), null);
  assert.equal(q.next(3).text, 'hello');
  q.push({ text: 'hello' }, 4000); // normal dedupe window is short
  assert.equal(q.push({ text: 'again' }, 4100), 'queued');
  assert.equal(q.push({ text: 'oops', priority: 'critical' }, 4200), 'queued');
  assert.equal(q.push({ text: 'oops', priority: 'critical' }, 4300), 'merged');
  assert.ok(PRIORITY.critical > PRIORITY.normal && PRIORITY.normal > PRIORITY.low);
}
// --- placement
{
  const vw = 390, vh = 844;
  const hud = [{ x: 0, y: 0, width: 390, height: 186 }, { x: 284, y: 186, width: 90, height: 140 }, { x: 8, y: 186, width: 103, height: 130 }];
  const joy = { x: 22, y: 698, width: 120, height: 120 }, use = { x: 290, y: 670, width: 90, height: 150 };
  const s = findLaneSlot([...hud, joy, use], { vw, vh, w: 340, h: 48, align: 'center', top: 8, bottom: vh * .62 });
  assert.ok(s, 'phone finds a slot');
  const box = { x: s.x, y: s.y, width: s.w, height: 48 };
  for (const r of [...hud, joy, use]) assert.ok(!(box.x < r.x + r.width && box.x + box.width > r.x && box.y < r.y + r.height && box.y + box.height > r.y), 'slot overlaps nothing reserved');
  assert.ok(s.y >= 326 + 8, 'below the HUD + side buttons');
  assert.equal(findLaneSlot([{ x: 0, y: 0, width: vw, height: vh }], { vw, vh, w: 300, h: 40 }), null, 'no free space -> null (caller defers)');
  const d = findLaneSlot([{ x: 900, y: 80, width: 370, height: 40 }], { vw: 1280, vh: 800, w: 300, h: 40, align: 'right', top: 30, edge: 16 });
  assert.equal(d.x, 1280 - 16 - 300, 'desktop lane hugs the right edge');
  assert.ok(d.y + 40 <= 80 - 8 || d.y >= 128, 'and never overlaps the status row');
}
// --- HUD panels are no-go zones (follow-up: toast landed over the City recap on phones)
{
  const { HUD_PANELS } = await import('./notify-lane.mjs');
  for (const id of ['#recap', '#info', '#music', '#keysBox', '#rPanel']) assert.ok(HUD_PANELS.includes(id), id + ' reserved');
  // phone: HUD rows + recap panel (top 180..390) -> lane goes below the recap, never on it
  const recap = { x: 12, y: 180, width: 366, height: 210 };
  const s = findLaneSlot([{ x: 0, y: 0, width: 390, height: 170 }, recap], { vw: 390, vh: 844, w: 340, h: 48, align: 'center', top: 8, bottom: 844 * .62 });
  assert.ok(s && s.y >= 390 + 8, 'lane slot below the recap panel');
  // a recap that fills the lane band -> no slot (toast waits instead of covering it)
  assert.equal(findLaneSlot([{ x: 0, y: 0, width: 390, height: 523 }], { vw: 390, vh: 844, w: 340, h: 48, align: 'center', top: 8, bottom: 844 * .62 }), null);
}
// --- wiring: every legacy surface goes through the lane
const src = f => readFileSync(new URL(f, import.meta.url), 'utf8');
const app = src('./app.js'), events = src('./events.js'), retain = src('./retain.js'), menu = src('./movement-games-menu.js'), fx2 = src('./fx2.js'), lane = src('./notify-lane.mjs');
assert.match(app, /const notifyLane=installNotifyLane\(window\);/);
assert.match(app, /function toast\(html,col,opts=\{\}\)\{return notifyLane\(/, 'app toasts use the lane');
assert.match(app, /function evBanner\(html,col\)\{notifyLane\.banner\(/, 'event banners are gated by the lane');
assert.match(app, /priority:'low',key:'swap:'/, 'swap feed is low priority, deduped per pool');
assert.ok(!/id='whaleToast'/.test(app), 'whale alert no longer has its own fixed button');
assert.match(app, /window\.__bcToast=\(text,col,opts\)=>notifyLane\(/);
assert.ok(!/id = 'cityToast'/.test(events) && /notify\(\{ text: txt/.test(events), 'city incidents use the lane');
assert.ok(!/toastEl/.test(retain) && /notify\(\{ text: t/.test(retain), 'streak/coin messages use the lane');
assert.match(menu, /priority:mustAct\?'critical':'normal'/, 'menu blockers are critical (shown inline in the menu sheet)');
assert.match(fx2, /__bcNotify\?\.isQuiet\?\.\(\)/, 'burn camera sweep waits for quiet');
for (const sel of ['#loader:not(.done)', '#bcEstatesXaman', '#bcEstatesLivePrompt', '#bcMoveGamesPanel', '[aria-modal="true"]', '#aegisNews[data-expanded]'])
  assert.ok(lane.includes(`'${sel}'`), 'quiet while ' + sel);
for (const sel of ['#joy', '#tbtns', '#aegisNews', '#status', "'button'"]) assert.ok(lane.includes(sel), 'lane avoids ' + sel);
assert.match(lane, /pointer-events:none/); assert.match(lane, /#bcNotifyLane>\.toast\{pointer-events:auto/);
assert.match(lane, /'typing'/); assert.match(lane, /'moving'/);
console.log('Notification lane: queue/dedupe/rate-limit/quiet, collision-free placement, all surfaces routed');
