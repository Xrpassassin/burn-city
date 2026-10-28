import assert from 'node:assert/strict';
import {ESTATES_MENU,normalizeEstateListing} from './estates-menu-model.mjs';
assert.deepEqual(ESTATES_MENU.tabs,['marketplace','my-properties','rewards']);
assert.equal(ESTATES_MENU.features.payoutsEnabled,false);
assert.equal(normalizeEstateListing({propertyId:'trailer-01',status:'available',priceDrops:'3000000'}).priceDrops,'3000000');
assert.equal(normalizeEstateListing({propertyId:'trailer-01',status:'unknown'}).status,'unavailable');
console.log('estates menu model tests passed');
