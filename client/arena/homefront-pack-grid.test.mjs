import assert from 'node:assert/strict';
import { FIELD_PACK_CELLS, FIELD_ITEM_CATALOG, fieldPackModel, fieldPackKey, createFieldPackGrid } from './homefront-pack-grid.mjs';

assert.equal(FIELD_PACK_CELLS,12);
assert.deepEqual(FIELD_ITEM_CATALOG.map(x=>x.id),['food','rawFood','water','dirtyWater','meds','ammo','scrap','wood']);
const full=fieldPackModel({food:8,rawFood:8,water:8,dirtyWater:8,meds:5,ammo:12,scrap:8,wood:8,used:500,capacity:24});
assert.equal(full.cells.length,12,'four decorative display cells do not create new server inventory stacks');
assert.ok(full.cells.slice(8).every(x=>x.empty));
assert.equal(full.used,8+8+8+8+5+12+16+16,'weight is derived solely from the eight authoritative item categories');
assert.equal(full.capacity,24);
assert.ok(full.full);
assert.equal(full.remaining,0);
const sample=fieldPackModel({food:3,water:2,ammo:7,scrap:2,capacity:24});
assert.equal(sample.used,3+2+7+4);
assert.equal(sample.remaining,24-16);
assert.equal(sample.cells.find(x=>x.id==='food').maxStack,8);
assert.equal(sample.cells.find(x=>x.id==='meds').maxStack,5);
assert.equal(sample.cells.find(x=>x.id==='ammo').maxStack,12);
assert.equal(sample.cells.find(x=>x.id==='wood').weight,2);
assert.equal(sample.cells.find(x=>x.id==='food').use,'eatInField');
assert.equal(sample.cells.find(x=>x.id==='water').use,'drinkInField');
assert.equal(sample.cells.find(x=>x.id==='meds').use,'bandageInField');
assert.equal(sample.cells.find(x=>x.id==='rawFood').use,null);
assert.equal(fieldPackModel(null).available,false);
assert.equal(fieldPackModel(null).used,0);
assert.equal(fieldPackModel({food:'999',scrap:Infinity,wood:-5,water:NaN,ammo:99}).used,12,
  'unexpected or forged numeric input cannot introduce new item categories or out-of-range amounts');
assert.equal(fieldPackModel({food:9.99}).cells[0].quantity,8);
assert.equal(fieldPackModel({food:0.7}).cells[0].quantity,0);
assert.notEqual(fieldPackKey({food:1}),fieldPackKey({food:2}));
assert.equal(fieldPackKey({food:1}),fieldPackKey({food:1,arbitrary:1e9}));
assert.notEqual(fieldPackKey(null),fieldPackKey({}), 'signed-out pack and empty signed-in pack are different');

class FakeNode {
  constructor(tag) {this.tagName=tag;this.children=[];this.listeners={};this.attributes={};this.className='';this.style={};this.textContent='';this.title='';this.disabled=false;this.type='';this.classList={add:name=>{this.className+=' '+name;}};}
  setAttribute(name,val){this.attributes[name]=val;}
  append(...items){this.children.push(...items);}
  replaceChildren(...items){this.children=items;}
  addEventListener(type,fn){this.listeners[type]=fn;}
}
const document={createElement:tag=>new FakeNode(tag)};
const actions=[];
const view=createFieldPackGrid(document,{food:2,water:1,meds:1,ammo:4,capacity:24},id=>actions.push(id));
assert.equal(view.tagName,'section');
assert.equal(view.attributes['aria-label'],'Field backpack inventory');
const grid=view.children[2];
assert.equal(grid.children.length,12);
assert.equal(grid.children[0].attributes['aria-label'],'Cooked ration, 2 of 8');
assert.equal(grid.children[0].children[0].textContent,'×2');
grid.children[0].listeners.click();
assert.equal(grid.children[0].attributes['aria-pressed'],'true');
const details=view.children[3];
assert.ok(details.children.some(x=>x.textContent.includes('Cooked ration')));
const useButton=details.children.find(x=>x.tagName==='button');
useButton.listeners.click();
assert.deepEqual(actions,['eatInField'],'item actions only relay to existing authenticated field survival controls');
grid.children[4].listeners.click();
details.children.find(x=>x.tagName==='button').listeners.click();
assert.deepEqual(actions,['eatInField','bandageInField']);
assert.equal(grid.children[7].attributes['aria-pressed'],'false');
assert.equal(grid.children[8].disabled,true);
assert.equal(createFieldPackGrid(document,null).children[2].children[0].disabled,true,
  'inventory cannot be used without authoritative expedition state');
console.log('Homefront Minecraft-style field pack visual model and item interaction tests passed.');
