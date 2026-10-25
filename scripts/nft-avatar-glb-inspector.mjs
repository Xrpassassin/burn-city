#!/usr/bin/env node
/**
 * Offline structural inspector for local GLB files.
 * Reads the GLB container and JSON scene graph; it does not render, download, or approve assets.
 * Usage: node scripts/nft-avatar-glb-inspector.mjs path/to/model.glb [--json]
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { pathToFileURL } from 'node:url';

const GLB_MAGIC = 0x46546c67;
const JSON_CHUNK = 0x4e4f534a;
const BIN_CHUNK = 0x004e4942;
const COMPONENT_BYTES = new Map([[5120,1],[5121,1],[5122,2],[5123,2],[5125,4],[5126,4]]);
const TYPE_COMPONENTS = new Map([['SCALAR',1],['VEC2',2],['VEC3',3],['VEC4',4],['MAT2',4],['MAT3',9],['MAT4',16]]);

const object = v => v !== null && typeof v === 'object' && !Array.isArray(v);
const arr = v => Array.isArray(v) ? v : [];
const validIndex = (v, values) => Number.isInteger(v) && v >= 0 && v < values.length;

export function inspectGlbBuffer(buffer) {
  const errors = [], warnings = [];
  const fail = (code, message) => errors.push({ code, message });
  const warn = (code, message) => warnings.push({ code, message });
  if (!Buffer.isBuffer(buffer)) return { ok:false, errors:[{code:'INVALID_INPUT',message:'input must be a Buffer'}], warnings:[], summary:null };
  if (buffer.length < 20) return { ok:false, errors:[{code:'TRUNCATED_HEADER',message:'GLB is shorter than its minimum header and JSON chunk'}], warnings:[], summary:null };
  const magic = buffer.readUInt32LE(0), version = buffer.readUInt32LE(4), declaredLength = buffer.readUInt32LE(8);
  if (magic !== GLB_MAGIC) fail('BAD_MAGIC','file does not start with the glTF binary magic');
  if (version !== 2) fail('UNSUPPORTED_VERSION','GLB version must be 2');
  if (declaredLength !== buffer.length) fail('LENGTH_MISMATCH','header length ' + declaredLength + ' does not match file length ' + buffer.length);
  let offset = 12, json = null, binaryChunks = 0, binaryChunkLength = 0, jsonChunks = 0;
  while (offset + 8 <= buffer.length) {
    const length = buffer.readUInt32LE(offset), type = buffer.readUInt32LE(offset + 4);
    offset += 8;
    if (length % 4 !== 0) fail('CHUNK_ALIGNMENT','chunk length must be 4-byte aligned');
    if (length > buffer.length - offset) { fail('CHUNK_OUT_OF_BOUNDS','chunk extends beyond file'); break; }
    const chunk = buffer.subarray(offset, offset + length);
    if (type === JSON_CHUNK) {
      jsonChunks++;
      if (jsonChunks > 1) fail('MULTIPLE_JSON_CHUNKS','GLB must contain exactly one JSON chunk');
      try { json = JSON.parse(chunk.toString('utf8').replace(/[\u0000\u0020]+$/g,'')); }
      catch { fail('INVALID_JSON_CHUNK','JSON chunk is not valid JSON'); }
    } else if (type === BIN_CHUNK) { binaryChunks++; binaryChunkLength = length; }
    else warn('UNKNOWN_CHUNK','unrecognized GLB chunk type ' + type);
    offset += length;
  }
  if (offset !== buffer.length) fail('TRAILING_OR_TRUNCATED_BYTES','chunk sequence does not end at the declared file boundary');
  if (jsonChunks !== 1) fail('MISSING_JSON_CHUNK','GLB must contain exactly one JSON chunk');
  if (!object(json)) return { ok:false, errors, warnings, summary:null };
  if (!object(json.asset) || json.asset.version !== '2.0') fail('GLTF_VERSION','asset.version must be 2.0');
  for (const key of ['scenes','nodes','meshes','materials','textures','images','accessors','bufferViews','buffers','skins','animations']) {
    if (json[key] != null && !Array.isArray(json[key])) fail('INVALID_ARRAY','"' + key + '" must be an array');
  }
  const scenes=arr(json.scenes), nodes=arr(json.nodes), meshes=arr(json.meshes), materials=arr(json.materials),
    textures=arr(json.textures), images=arr(json.images), accessors=arr(json.accessors),
    views=arr(json.bufferViews), buffers=arr(json.buffers), skins=arr(json.skins), animations=arr(json.animations);
  if (!scenes.length) warn('NO_SCENES','no scene is declared');
  if (!nodes.length) fail('NO_NODES','model has no nodes');
  if (!meshes.length) warn('NO_MESHES','model has no meshes');
  if (!materials.length) warn('NO_MATERIALS','model has no materials');
  if (json.scene != null && !validIndex(json.scene, scenes)) fail('INVALID_DEFAULT_SCENE','default scene index is out of range');
  let primitives=0, triangles=0, skinnedMeshNodes=0, nodeMeshRefs=0, nodeSkinRefs=0, animationChannels=0, externalUris=[];
  for (const [i, scene] of scenes.entries()) {
    for (const n of arr(scene.nodes)) if (!validIndex(n,nodes)) fail('SCENE_NODE_INDEX','scene ' + i + ' references invalid node ' + n);
  }
  for (const [i,node] of nodes.entries()) {
    for (const child of arr(node.children)) if (!validIndex(child,nodes)) fail('NODE_CHILD_INDEX','node ' + i + ' references invalid child ' + child);
    if (node.mesh != null) { nodeMeshRefs++; if (!validIndex(node.mesh,meshes)) fail('NODE_MESH_INDEX','node ' + i + ' references invalid mesh'); }
    if (node.skin != null) { nodeSkinRefs++; if (!validIndex(node.skin,skins)) fail('NODE_SKIN_INDEX','node ' + i + ' references invalid skin'); if (node.mesh == null) fail('SKIN_WITHOUT_MESH','node ' + i + ' has a skin but no mesh'); }
  }
  for (const [i,mesh] of meshes.entries()) for (const [j,p] of arr(mesh.primitives).entries()) {
    primitives++;
    const mode = p.mode == null ? 4 : p.mode;
    if (![0,1,2,3,4,5,6].includes(mode)) fail('PRIMITIVE_MODE','mesh ' + i + ' primitive ' + j + ' has invalid mode');
    const pos = p.attributes?.POSITION;
    if (pos == null || !validIndex(pos,accessors)) fail('POSITION_ACCESSOR','mesh ' + i + ' primitive ' + j + ' needs a valid POSITION accessor');
    else {
      const acc=accessors[pos];
      if (acc.type !== 'VEC3' || !Number.isInteger(acc.count) || acc.count < 1) fail('POSITION_LAYOUT','POSITION accessor must be a non-empty VEC3');
      if (!Array.isArray(acc.min) || !Array.isArray(acc.max) || acc.min.length !== 3 || acc.max.length !== 3 || ![...acc.min,...acc.max].every(Number.isFinite)) warn('POSITION_BOUNDS','mesh ' + i + ' primitive ' + j + ' lacks finite position bounds');
    }
    if (p.indices != null) {
      if (!validIndex(p.indices,accessors)) fail('INDEX_ACCESSOR','mesh ' + i + ' primitive ' + j + ' has invalid indices accessor');
      else if (mode === 4) triangles += Math.floor((accessors[p.indices].count || 0) / 3);
    } else if (mode === 4 && pos != null && validIndex(pos,accessors)) triangles += Math.floor((accessors[pos].count || 0) / 3);
    if (p.material != null && !validIndex(p.material,materials)) fail('PRIMITIVE_MATERIAL','mesh ' + i + ' primitive ' + j + ' references invalid material');
    for (const [semantic,index] of Object.entries(p.attributes || {})) if (!validIndex(index,accessors)) fail('ATTRIBUTE_ACCESSOR','mesh ' + i + ' primitive ' + j + ' attribute ' + semantic + ' references invalid accessor');
  }
  for (const [i,skin] of skins.entries()) {
    if (!arr(skin.joints).length) fail('EMPTY_SKIN','skin ' + i + ' has no joints');
    for (const joint of arr(skin.joints)) if (!validIndex(joint,nodes)) fail('SKIN_JOINT_INDEX','skin ' + i + ' references invalid joint node');
    if (skin.inverseBindMatrices != null && (!validIndex(skin.inverseBindMatrices,accessors) || accessors[skin.inverseBindMatrices]?.type !== 'MAT4')) fail('INVERSE_BIND_MATRICES','skin ' + i + ' inverseBindMatrices must reference a MAT4 accessor');
  }
  for (const [i,animation] of animations.entries()) {
    const samplers=arr(animation.samplers);
    for (const [j,channel] of arr(animation.channels).entries()) {
      animationChannels++;
      if (!validIndex(channel.sampler,samplers)) fail('ANIMATION_SAMPLER','animation ' + i + ' channel ' + j + ' references invalid sampler');
      const target=channel.target || {};
      if (target.node != null && !validIndex(target.node,nodes)) fail('ANIMATION_NODE','animation ' + i + ' targets invalid node');
      if (!['translation','rotation','scale','weights'].includes(target.path)) fail('ANIMATION_PATH','animation ' + i + ' has unsupported target path');
    }
    for (const [j,sampler] of samplers.entries()) {
      if (!validIndex(sampler.input,accessors) || !validIndex(sampler.output,accessors)) fail('ANIMATION_ACCESSOR','animation ' + i + ' sampler ' + j + ' has invalid input/output accessor');
      else if (accessors[sampler.input].type !== 'SCALAR') fail('ANIMATION_INPUT_TYPE','animation ' + i + ' sampler ' + j + ' input must be SCALAR');
    }
  }
  for (const [i,view] of views.entries()) {
    if (!validIndex(view.buffer,buffers)) fail('BUFFERVIEW_BUFFER_INDEX','bufferView ' + i + ' references invalid buffer');
    if (!Number.isInteger(view.byteLength) || view.byteLength < 0) fail('BUFFERVIEW_LENGTH','bufferView ' + i + ' has invalid byteLength');
    if (!Number.isInteger(view.byteOffset ?? 0) || (view.byteOffset ?? 0) < 0) fail('BUFFERVIEW_OFFSET','bufferView ' + i + ' has invalid byteOffset');
    if (validIndex(view.buffer,buffers) && Number.isInteger(view.byteLength) && view.byteLength >= 0 && Number.isInteger(view.byteOffset ?? 0) && (view.byteOffset ?? 0) >= 0) {
      const end=(view.byteOffset ?? 0)+view.byteLength;
      if (end > buffers[view.buffer].byteLength) fail('BUFFERVIEW_OUT_OF_BOUNDS','bufferView ' + i + ' exceeds declared buffer byteLength');
    }
  }
  for (const [i,acc] of accessors.entries()) {
    if (!COMPONENT_BYTES.has(acc.componentType) || !TYPE_COMPONENTS.has(acc.type) || !Number.isInteger(acc.count) || acc.count < 0) fail('ACCESSOR_LAYOUT','accessor ' + i + ' has invalid component type, shape, or count');
    if (acc.bufferView != null && !validIndex(acc.bufferView,views)) fail('ACCESSOR_BUFFERVIEW_INDEX','accessor ' + i + ' references invalid bufferView');
    if (acc.bufferView != null && validIndex(acc.bufferView,views) && COMPONENT_BYTES.has(acc.componentType) && TYPE_COMPONENTS.has(acc.type)) {
      const view=views[acc.bufferView], offset=acc.byteOffset ?? 0, componentBytes=COMPONENT_BYTES.get(acc.componentType);
      if (!Number.isInteger(offset) || offset < 0) fail('ACCESSOR_OFFSET','accessor ' + i + ' has invalid byteOffset');
      else {
        if (offset % componentBytes !== 0) fail('ACCESSOR_ALIGNMENT','accessor ' + i + ' byteOffset is not component-aligned');
        const elementBytes=componentBytes*TYPE_COMPONENTS.get(acc.type);
        const stride=view.byteStride ?? elementBytes;
        if (view.byteStride != null && (!Number.isInteger(view.byteStride) || view.byteStride < elementBytes || view.byteStride > 252 || view.byteStride % 4 !== 0)) fail('BUFFERVIEW_STRIDE','bufferView ' + acc.bufferView + ' has invalid byteStride');
        const required=offset + Math.max(0,acc.count-1)*stride + elementBytes;
        if (required > view.byteLength) fail('ACCESSOR_OUT_OF_BOUNDS','accessor ' + i + ' exceeds its bufferView');
      }
    }
  }
  if (binaryChunks > 1) fail('MULTIPLE_BIN_CHUNKS','GLB may contain at most one BIN chunk');
  const embeddedBuffers = buffers.filter(bufferDef => typeof bufferDef.uri !== 'string');
  if (embeddedBuffers.length > 1) fail('MULTIPLE_EMBEDDED_BUFFERS','GLB may have at most one embedded buffer');
  if (embeddedBuffers.length && binaryChunks !== 1) fail('MISSING_BIN_CHUNK','buffer without a URI requires exactly one GLB BIN chunk');
  if (!embeddedBuffers.length && binaryChunks) warn('UNREFERENCED_BIN_CHUNK','BIN chunk exists but no buffer references it');
  for (const [i,bufferDef] of buffers.entries()) {
    if (typeof bufferDef.uri === 'string') externalUris.push({kind:'buffer',index:i,uri:bufferDef.uri});
    if (!Number.isInteger(bufferDef.byteLength) || bufferDef.byteLength < 0) fail('BUFFER_LENGTH','buffer ' + i + ' has invalid byteLength');
    else if (typeof bufferDef.uri !== 'string' && binaryChunks === 1) {
      if (bufferDef.byteLength > binaryChunkLength) fail('BUFFER_BIN_LENGTH','embedded buffer byteLength exceeds BIN chunk length');
      if (binaryChunkLength - bufferDef.byteLength > 3) fail('BIN_PADDING_LENGTH','BIN chunk may exceed embedded buffer byteLength by at most 3 padding bytes');
    }
  }
  for (const [i,imageDef] of images.entries()) if (typeof imageDef.uri === 'string') externalUris.push({kind:'image',index:i,uri:imageDef.uri});
  for (const uri of externalUris) warn('EXTERNAL_RESOURCE','external ' + uri.kind + ' URI requires packaging/provenance review: ' + uri.uri);
  for (const [i,texture] of textures.entries()) if (texture.source != null && !validIndex(texture.source,images)) fail('TEXTURE_SOURCE','texture ' + i + ' references invalid image');
  const summary = {
    byteLength: buffer.length,
    sha256: crypto.createHash('sha256').update(buffer).digest('hex'),
    gltfVersion: json.asset?.version || null,
    generator: json.asset?.generator || null,
    sceneCount: scenes.length, nodeCount: nodes.length, meshCount: meshes.length,
    primitiveCount: primitives, estimatedTriangleCount: triangles,
    materialCount: materials.length, textureCount: textures.length, imageCount: images.length,
    accessorCount: accessors.length, skinCount: skins.length, skinnedMeshNodeCount: skinnedMeshNodes || nodes.filter(n=>n.skin!=null&&n.mesh!=null).length,
    animationCount: animations.length, animationChannelCount: animationChannels,
    externalResourceCount: externalUris.length,
    extensionsRequired: arr(json.extensionsRequired),
    extensionsUsed: arr(json.extensionsUsed)
  };
  if (summary.extensionsRequired.length) warn('REQUIRED_EXTENSIONS','required extensions need runtime support review: ' + summary.extensionsRequired.join(', '));
  if (!skins.length) warn('NO_SKIN','no skin found; acceptable for props, but not a rigged humanoid/creature base');
  if (!animations.length) warn('NO_ANIMATIONS','no embedded animations found; external retargeting may still be possible');
  return { ok:errors.length===0, errors, warnings, summary };
}

export function inspectGlbFile(filename) {
  const resolved = path.resolve(filename);
  const stat = fs.statSync(resolved);
  if (!stat.isFile()) throw new Error('input path is not a file');
  return { file: resolved, ...inspectGlbBuffer(fs.readFileSync(resolved)) };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const filename=process.argv[2], jsonMode=process.argv.includes('--json');
  if (!filename) {
    console.error('Usage: node scripts/nft-avatar-glb-inspector.mjs path/to/model.glb [--json]');
    process.exitCode=2;
  } else {
    try {
      const report=inspectGlbFile(filename);
      if (jsonMode) console.log(JSON.stringify(report,null,2));
      else {
        console.log((report.ok?'GLB STRUCTURE VALID':'GLB STRUCTURE REJECTED') + ': ' + report.file);
        console.log(JSON.stringify(report.summary,null,2));
        for (const item of report.errors) console.error('ERROR ['+item.code+'] '+item.message);
        for (const item of report.warnings) console.warn('WARN ['+item.code+'] '+item.message);
      }
      if (!report.ok) process.exitCode=1;
    } catch(error) { console.error('Unable to inspect GLB:',error.message); process.exitCode=2; }
  }
}
