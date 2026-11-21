// Unit test for the HUD zones (t449u): tier/category map, menu order and the overlap helper.
import assert from 'node:assert/strict';
import fs from 'node:fs';
const { HZ_ZONES, HZ_MENU, menuOrder, overlaps } = await import('./hud-zones.mjs');
// every corner zone is defined and no element sits in two zones
const zones = ['top-left', 'top-right', 'top-center', 'bottom-left', 'bottom-right'];
assert.deepEqual(Object.keys(HZ_ZONES).sort(), zones.slice().sort());
const all = Object.values(HZ_ZONES).flat();
assert.equal(new Set(all).size, all.length, 'an element is in two zones');
for (const essential of ['#hud', '#rChip', '#minimap', '#aegisNews', '#joy', '#tbtns', '#moreBtn']) assert.ok(all.includes(essential), essential + ' has a zone');
// the ⋯ menu has the seven categories, in order, and keeps every pre-existing menu entry (nothing removed)
assert.deepEqual(HZ_MENU.map(g => g.cat), ['Play & games', 'Estates', 'Social & chat', 'Inventory', 'Rewards', 'Settings & music', 'Info & help']);
const order = menuOrder();
for (const id of ['tour', 'guideBtn', 'musicBtn', 'audio', 'socialBtn', 'bagBtn', 'copyLink', 'installBtn'])
  assert.ok(order.includes(id), id + ' stays in the menu');
assert.equal(new Set(order).size, order.length, 'menu ids are unique');
// shortcuts only click existing controls (no new game actions)
for (const g of HZ_MENU) for (const it of g.items) if (it.label && !it.info) assert.ok(it.target || it.action === 'settings', it.id + ' is a shortcut');
// overlap helper
const R = (name, left, top, w, h) => ({ name, left, top, right: left + w, bottom: top + h });
assert.deepEqual(overlaps([R('a', 0, 0, 10, 10), R('b', 10, 0, 10, 10)]), []);
assert.deepEqual(overlaps([R('a', 0, 0, 10, 10), R('b', 5, 5, 10, 10)]), [['a', 'b', 5, 5]]);
// wiring: loaded last on the city page, precached, and every zone is reserved by the notification lane
const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
assert.ok(html.indexOf('hud-zones.css') > html.indexOf('ui-forge.css'), 'hud-zones.css loads after ui-forge.css');
assert.ok(html.includes('js/hud-zones.mjs'));
const sw = fs.readFileSync(new URL('../sw.js', import.meta.url), 'utf8');
assert.ok(sw.includes("'hud-zones.css'") && sw.includes("'js/hud-zones.mjs'"), 'precached');
const { HUD_PANELS } = await import('./notify-lane.mjs');
assert.ok(HUD_PANELS.includes('[data-hz-zone]'), 'notify lane avoids the HUD zones');
console.log('HUD zones: 5 corner zones, 7 menu categories, nothing removed, lane-registered');
