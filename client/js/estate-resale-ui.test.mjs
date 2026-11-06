import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {cardVisible,sectionVisible,formatDrops,xrpToDrops,shortWallet,resaleMessage,VIEWS} from './estate-resale-ui.mjs';
assert.deepEqual(VIEWS,['available','owned','for-sale','mine']);
assert.equal(cardVisible('available','available'),true);assert.equal(cardVisible('available','sales-paused'),true);assert.equal(cardVisible('available','owned'),false);
assert.equal(cardVisible('owned','owned-by-you'),true);assert.equal(cardVisible('owned','available'),false);
assert.equal(cardVisible('for-sale','owned',true),true);assert.equal(cardVisible('for-sale','owned',false),false);
assert.equal(sectionVisible('for-sale','resale'),true);assert.equal(sectionVisible('available','resale'),false);assert.equal(sectionVisible('mine','owned'),true);
assert.equal(formatDrops('5000000'),'5 XRP');assert.equal(formatDrops('1500000'),'1.5 XRP');
assert.equal(xrpToDrops('2.5'),'2500000');assert.equal(xrpToDrops('1'),'1000000');assert.equal(xrpToDrops('abc'),null);assert.equal(xrpToDrops('1.1234567'),null);
assert.equal(shortWallet('rwfnp2k2jU8VeFbkK85AJqu2NyAjtiaEpb'),'rwfnp2…aEpb');
assert.match(resaleMessage('estate_resale_disabled'),/not activated/);
// layout guards for the Estates page: safe areas, sticky view tabs, and the views exist
const html=readFileSync(new URL('../estate-properties.html',import.meta.url),'utf8');
assert.match(html,/viewport-fit=cover/);assert.match(html,/env\(safe-area-inset-top\)/);assert.match(html,/#estate-views\{position:sticky/);
for(const v of VIEWS)assert.match(html,new RegExp('data-view="'+v+'"'));
assert.match(html,/id="resale-listings"/);assert.doesNotMatch(html,/marketplace fee of/i,'no undisclosed fee');
// main city top bar: View/Estates live in the toolbar flow, no hard-coded offsets
const css=readFileSync(new URL('../ui.css',import.meta.url),'utf8'),app=readFileSync(new URL('./app.js',import.meta.url),'utf8'),ui=readFileSync(new URL('./ui.js',import.meta.url),'utf8'),idx=readFileSync(new URL('../index.html',import.meta.url),'utf8');
assert.doesNotMatch(css,/#vExit\{left:auto!important;right:calc\(var\(--right\) \+ 118px\)/,'no magic offset for View button');
assert.match(app,/getElementById\('btns'\)\|\|document\.body\)\.prepend\(ex\)/);
assert.match(ui,/'vExit'\]\)/);assert.match(ui,/--hud-right/);assert.match(css,/max-width:calc\(100vw - var\(--hud-right/);
assert.doesNotMatch(idx,/id="estatesPreviewLink"[^>]*style=/,'Estates link styled by CSS, not inline');
console.log('estate resale ui + layout tests passed');
