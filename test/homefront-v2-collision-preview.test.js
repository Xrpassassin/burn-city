'use strict';
const test=require('node:test'), assert=require('node:assert/strict');
const {createV2CollisionPreview,pointBlockedV2,canTraverseV2Preview}=require('../server/homefront-v2-collision-preview');
test('v2 collision preview deterministic and isolated',()=>{
 const a=createV2CollisionPreview(),b=createV2CollisionPreview();
 assert.equal(a.version,2);assert.equal(a.previewOnly,true);
 assert.deepEqual(a.obstacles,b.obstacles);assert.ok(a.obstacles.length>0);
 assert.ok(Object.isFrozen(a.obstacles));
});
test('rotated rectangle collision mirrors visible v2 footprint',()=>{
 const catalog={version:2,previewOnly:true,obstacles:[{id:'wall',x:0,z:0,halfX:3,halfZ:1,rotation:Math.PI/4}]};
 assert.equal(pointBlockedV2(catalog,0,0).id,'wall');
 assert.equal(pointBlockedV2(catalog,20,20),null);
 assert.equal(canTraverseV2Preview(catalog,{x:-5,z:0},{x:5,z:0}),false);
 assert.throws(()=>pointBlockedV2(null,0,0),TypeError);
});
