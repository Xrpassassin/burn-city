'use strict';
const assert = require('node:assert/strict');
const { planOwnerCurrencyPayouts } = require('./estate-owner-currency-plan');
const a = 'rGLEgQdktoN4Be5thhk6seg1HifGPBxY5Q';
const b = 'rsJJMwweNS6GveA12RV7xmGNG1HdgAuiNd';
const base = { epochId:'2026-10-28T18:00:00Z', distributableImgUnits:'1000000', holdings:[{propertyId:'estate-villa-01',acct:a}], fundingRef:'validated:funding:1', sourceLedgerIndex:1 };
assert.throws(() => planOwnerCurrencyPayouts({...base, preferences:{[a]:'PLX'}}), /invalid_owner_payout_preference|unknown property/);
assert.throws(() => planOwnerCurrencyPayouts({...base, preferences:null}), /preferences_required/);
console.log('Owner currency plan validation smoke tests passed');
