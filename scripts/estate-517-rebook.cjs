#!/usr/bin/env node
'use strict';
// Usage (on the server, operator only):  node scripts/estate-517-rebook.cjs            -> dry run
//                                        node scripts/estate-517-rebook.cjs --apply    -> re-book
// Bookkeeping only: no signing, no transactions. Back up DATA_DIR/shop.db first.
const path=require('node:path');const {DatabaseSync}=require('node:sqlite');
const dir=process.env.DATA_DIR||path.join(__dirname,'..','data');
const db=new DatabaseSync(path.join(dir,'shop.db'));
const r=require('../server/estate-517-policy3-migration').rebook517(db,{apply:process.argv.includes('--apply')});
console.log(JSON.stringify(r,null,1));db.close();
