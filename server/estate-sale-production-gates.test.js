'use strict';
// Runtime tests cover defaults, exact opt-in, credentials, dry-run and pause gates.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'server.js'),'utf8');
assert.match(source,/const estateSales = createEstateSalesRuntime\(\{db:Pay.sdb,pay:Pay,config:C,paused:require\('\.\/guard'\).paused\}\)/);
assert.doesNotMatch(source,/createEstate(?:ReservationApi|XamanPaymentSession|SaleFinalization)\(Pay.sdb,\s*\{\s*enabled:\s*true/);
require('./estate-sales-runtime.test');
