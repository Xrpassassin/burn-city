import assert from 'node:assert/strict';
import {searchEstateLots} from './estates-directory.mjs';
const lots=[
  {id:'lot-1',propertyId:'p1',address:'Harbor View',district:'north-shore',tier:'mansion',position:{x:0,z:0}},
  {id:'lot-2',propertyId:null,address:'Unassigned Lot',district:'east-village',tier:'unassigned',position:{x:10,z:10}},
  {id:'lot-3',propertyId:'p3',address:'Cinder Heights',district:'east-village',tier:'starter',position:{x:20,z:20}}
];
assert.deepEqual(searchEstateLots(lots,'harbor').map(l=>l.id),['lot-1']);
assert.deepEqual(searchEstateLots(lots,'EAST','mapped').map(l=>l.id),['lot-3']);
assert.deepEqual(searchEstateLots(lots,'','unassigned').map(l=>l.id),['lot-2']);
assert.equal(searchEstateLots(lots,'missing').length,0);
assert.throws(()=>searchEstateLots(lots,'','owned'),TypeError);
console.log('Estates directory tests passed');
