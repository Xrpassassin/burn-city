import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { EMOJI_ICON, ICON_ROOTS, COUNT_ROOTS } from './ui-forge.mjs';

const read = p => readFileSync(new URL(p, import.meta.url), 'utf8');
const src = read('./ui-forge.mjs');
const css = read('../ui-forge.css');
const est = read('../estate-forge.css');
const index = read('../index.html');
const estates = read('../estate-properties.html');
const credits = read('../city-credits.html');
const sw = read('../sw.js');
const tokens = read('../burn-ui-tokens.css');

// every mapped icon has artwork embedded
for (const name of new Set(Object.values(EMOJI_ICON))) assert.match(src, new RegExp(`"${name}":`), `icon ${name} embedded`);
// icons never touch the notification lane, user text or world labels
assert.ok(!ICON_ROOTS.some(s => /NotifyLane|toast|#labels/.test(s)), 'notification lane untouched');
assert.match(src, /closest\?\.\('input,textarea,\[contenteditable\],#bcNotifyLane,#labels'\)/);
assert.ok(COUNT_ROOTS.includes('#rChip'));
assert.ok(!COUNT_ROOTS.includes('#burnCount'), 'no tweening of mixed time/price text');
// count-up respects reduced motion
assert.match(src, /prefers-reduced-motion: reduce/);
// licence + credit
assert.match(read('../icons/tabler/LICENSE'), /MIT License/);
assert.match(credits, /Tabler Icons[\s\S]*MIT License/);
// wiring: forge loads last on both pages and is precached
assert.ok(index.indexOf('ui-forge.css') > index.indexOf('estates-xaman-signin.css'), 'forge after other sheets');
assert.match(index, /<script type="module" src="js\/ui-forge\.mjs"><\/script>/);
assert.ok(estates.indexOf('estate-forge.css') > estates.indexOf('ui-forge.css'));
assert.match(sw, /'ui-forge\.css', 'js\/ui-forge\.mjs'/);
// only tokens, no raw new colours for the canonical ember
assert.match(tokens, /--bc-ember:#ff8b39/);
// a11y/perf guards in the component sheet
assert.match(css, /prefers-reduced-motion:reduce/);
assert.match(css, /min-height:44px/);
assert.ok(!/backdrop-filter:blur\(\d/.test(css), 'no hard-coded blur; use --bc-blur token');
assert.match(est, /prefers-reduced-motion:reduce/);
// #669 lane logic is not overridden (style only: no display/visibility rules on the lane container)
assert.ok(!/#bcNotifyLane\{[^}]*(display|visibility)\s*:/.test(css), 'lane visibility untouched');
console.log('ui-forge tests ok');
// follow-ups: leftover emoji surfaces + arena menu opt-in + desktop 44px top bar
for (const r of ['#burnCount', '#guide .gbox', '#skGear .sg-card']) assert.ok(ICON_ROOTS.includes(r), r + ' iconified');
for (const e of ['🏙', '🏗', '🎣', '🚧', '🏍', '🗡']) assert.ok(EMOJI_ICON[e], e + ' mapped');
assert.match(read('../arena/index.html'), /<script type="module" src="\.\.\/js\/ui-forge\.mjs" data-forge-roots="#menu h2/);
assert.match(css, /#btns #moreBtn\{min-height:44px!important;min-width:44px!important/);
console.log('ui-forge follow-up tests ok');
