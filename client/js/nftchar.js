// BURN City NFT avatars: smoother, articulated characters driven by verified RACC / Firekeepers / 589 traits.
// Original NFT artwork remains available as a reference portrait and optional QA tabard; token traits drive the 3D body.
// Typed metadata adds a best-effort 3D interpretation. Geometry/materials are cached for phone performance.
import * as THREE from 'three';
import { resolveNftAvatarProfile } from './nft-avatar-adapters.js';
import { resolveNftAvatarComponents } from './nft-avatar-components.js';
import { resolveNftAvatarReconstruction } from './nft-avatar-reconstruction.js';
import { bakeAvatar, disposeBaked } from './avatar-bake.js';
import { resolveNftHeadShape } from './nft-avatar-head.js';
import { sculptHeadGeometry, SCULPT_MATERIAL, SCULPT_METAL_MATERIAL } from './nft-avatar-sculpt.js';
import { humanHeadSpec, wolfHeadSpec, reptileHeadSpec, monkeyHeadSpec, skullHeadSpec, greatHelmSpec, birdHeadSpec } from './nft-avatar-head-specs.js';
import { firekeeperSpec } from './nft-avatar-firekeepers-1of1.js';
import { palette589, cloth589, PAL_589, PAL_RACC } from './nft-avatar-palette.js';
const G = new Map(), TX = new Map(), MT = new Map();
const QA_MARKER_MAT = new THREE.MeshBasicMaterial({color:'#e5bd54',wireframe:true});
const geo = (k, f) => G.get(k) || (G.set(k, f()), G.get(k));
const mat = (c, r = .72, m = .05, e = 0) => {
  const color = typeof c === 'number' ? '#' + c.toString(16).padStart(6, '0') : String(c || '#888');
  const k = [color, r, m, e].join('|');
  if (!MT.has(k)) MT.set(k, new THREE.MeshStandardMaterial({ color, roughness: r, metalness: m, emissive: e || 0 }));
  return MT.get(k);
};
const glow = c => mat(c, .36, .12, c);
// Flames glow like the art's fire: unlit vertex gradient from a deep ember base through the token accent to a hot yellow tip.
const flameGeoFn = () => { const g = new THREE.ConeGeometry(.055, .25, 7), p = g.attributes.position, col = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) { const t = (p.getY(i) + .125) / .25; col[i * 3] = 1; col[i * 3 + 1] = .2 + .7 * t * t; col[i * 3 + 2] = .02 + .3 * t * t * t; }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3)); return g; };
const flameMat = c => { const k = 'flame|' + c; if (!MT.has(k)) MT.set(k, new THREE.MeshBasicMaterial({ color: new THREE.Color(c).lerp(new THREE.Color('#ffd27a'), .5), vertexColors: true })); return MT.get(k); };
const sphere = () => new THREE.SphereGeometry(1, 16, 12);
const capsule = (r, len, radial = 10, cap = 4) => geo('capsule:' + [r,len,radial,cap].join(','), () => new THREE.CapsuleGeometry(r, len, cap, radial));
const box = (w, h, d) => geo('box:' + [w,h,d].join(','), () => new THREE.BoxGeometry(w,h,d));
const cylinder = (r1,r2,h,n=12) => geo('cyl:' + [r1,r2,h,n].join(','), () => new THREE.CylinderGeometry(r1,r2,h,n));
export function nftImg(srv, n) { return n && n.img ? srv.replace(/\/$/, '') + n.img.replace(/\.webp$/, '.jpg') : ''; }
function tex(url) {
  if (!url) return null;
  if (TX.has(url)) return TX.get(url);
  const t = new THREE.TextureLoader().setCrossOrigin('anonymous').load(url, x => { x.needsUpdate = true; }, undefined, () => {});
  if ('colorSpace' in t) t.colorSpace = THREE.SRGBColorSpace;
  t.generateMipmaps = false; t.minFilter = THREE.LinearFilter; TX.set(url, t); return t;
}
const C = new THREE.Color(), shade = (h, k) => '#' + C.set(h || '#888').multiplyScalar(k).getHexString();
const has = (t, re) => t.some(v => re.test(v));
const color = (value, fallback) => /^#[0-9a-f]{6}$/i.test(String(value || '')) ? value : fallback;
// Typed NFT attributes are retained separately so identical values from different traits are not conflated.
export function buildNftChar(n, opts = {}) {
  const pal = n?.pal || {}, key = String(n?.key || '589').trim().toLowerCase();
  const profile = resolveNftAvatarProfile(n);
  const components = resolveNftAvatarComponents(profile);
  const reconstruction = resolveNftAvatarReconstruction(profile);
  // Per-token head: skull/jaw/neck/eyes/brows/cover come from this token's own traits (see nft-avatar-head.js).
  // Firekeepers are 1/1s: a bespoke per-NFTokenID spec wins; unknown Firekeepers use traits (+ small jitter).
  const fk1 = key === 'fk' ? firekeeperSpec(n?.id) : null;
  const hs = resolveNftHeadShape(profile, { jitter: !fk1 });
  let sculptKind = '', creature = false, noFace = false;
  if (fk1) { Object.assign(hs, fk1.head || {}); if (fk1.skin) hs.skin = fk1.skin; if (/^(wolf|reptile|monkey|skull)$/.test(fk1.sculpt)) hs.faceKind = fk1.sculpt; }
  const originalTraitPairs = profile.rawTraits;
  const traitPairs = profile.renderTraits;
  // Keep trait names and values separate: a background called "Burn" must not invent flames,
  // and a clothing label must not accidentally count as a headwear trait.
  const tr = [...traitPairs.map(([, value]) => String(value)), ...(Array.isArray(n?.t) ? n.t : [])].map(v => String(v).toLowerCase());
  const traitValue = re => String(traitPairs.find(([type]) => re.test(String(type)))?.[1] || '');
  const hasTrait = (typeRe, valueRe = /.+/) => traitPairs.some(([type, value]) => typeRe.test(String(type)) && valueRe.test(String(value)));
  const hasHairTrait = traitPairs.some(([type, value]) => /hair|haircut|hairstyle/i.test(String(type)) || /mohawk|hawk|dread|braid|afro|curly|coily|spiky|ponytail|undercut|long hair|short hair|topknot|bun|bald|shaved|no hair/i.test(String(value)));
  const traitColor = (re, fallback) => {
    const v = traitValue(re).toLowerCase().trim();
    if (/^#[0-9a-f]{6}$/i.test(v)) return v;
    const palette = [
      ['rainbow','#a86bff'],['gold','#d6ad45'],['silver','#b9c4cf'],['charcoal','#353941'],['black','#202126'],
      ['white','#e6e4df'],['ivory','#eee5d2'],['cream','#e4d4b5'],['beige','#c8b99c'],['gray','#858a91'],['grey','#858a91'],
      ['crimson','#a51f35'],['scarlet','#b51f2d'],['burgundy','#6e1c35'],['maroon','#702b32'],['red','#b72d32'],
      ['orange','#e87927'],['yellow','#e0c34a'],['lime','#86b93d'],['olive','#737a32'],['emerald','#26865b'],
      ['forest','#28513a'],['green','#43845a'],['navy','#243a63'],['cobalt','#2854a6'],['azure','#3c8ed6'],
      ['royal','#355ca8'],['blue','#426db0'],['purple','#7952a1'],['magenta','#b833a6'],['fuchsia','#d43bb8'],
      ['pink','#d879a8'],['brown','#78513c'],['tan','#bd9a73'],['bronze','#9a6b3c'],['cyan','#4bbcc4'],['teal','#328f8a']
    ];
    const found = palette.find(([word]) => v.includes(word));
    return found ? found[1] : fallback;
  };
  const g = new THREE.Group(); g.name = 'burn-city-nft-avatar';
  const add = (geometry, material, x=0, y=0, z=0, parent=g) => {
    const mesh = new THREE.Mesh(geometry, material); mesh.position.set(x,y,z); mesh.castShadow = true; mesh.receiveShadow = true; parent.add(mesh); return mesh;
  };
  // Reference-art match (2026-10 review of real RACC / Firekeepers / 589 Protocol tokens, see
  // docs/nft-avatar-polish-credits.md): realistic skin tones, tees over dark denim, bare-chested
  // muscular Firekeepers. Explicit color traits still win over these collection defaults.
  const rawValue = re => String(profile.rawTraits.find(([type]) => re.test(String(type)))?.[1] || '').trim().toLowerCase();
  const fkChest = key === 'fk' ? rawValue(/^chest$/i) : '', fkNeck = key === 'fk' ? rawValue(/^neck\s*$/i) : '';
  const fkFace = key === 'fk' ? rawValue(/^face$/i) : '', fkHead = key === 'fk' ? rawValue(/^head$/i) : '';
  const fkAccessory = key === 'fk' ? rawValue(/^accessory$/i) : '';
  const fkRobed = key === 'fk' && components.outfitStyle === 'robes';
  const fkBare = key === 'fk' && !fkRobed && (fk1 ? !fk1.cloth : !/armor|suit|mail/.test(fkChest));
  const fkFlameEyes = key === 'fk' && /flaming eyes|fire eyes|glowing eyes/.test(fkFace);
  const p589Body = key === '589' ? rawValue(/^body$/i) : '', p589Cloth = key === '589' ? rawValue(/^clothing$/i) : '';
  const refSkin = key === '589' ? palette589(p589Body)?.skin || '#6f3a24'
    : key === 'fk' && hs.skin ? hs.skin
    : key === 'fk' && !fkRobed ? (/slime/.test(fkChest+fkFace) ? '#3fbf9a' : /lizard|reptil/.test(fkFace) ? '#24262b' : /suit|beard/.test(fkChest+fkFace) ? '#e0a33c' : '#6f3f22') : '';
  const refCloth = key === 'fk' && fk1?.cloth ? fk1.cloth : key === '589' ? cloth589(p589Cloth) || (/punk/.test(p589Cloth) ? '#ecebe6' : /burn xrp tee/.test(p589Cloth) ? '#d6c3a0' : /jersey/.test(p589Cloth) ? '#c8352a' : /black burn tee/.test(p589Cloth) ? '#1d1d21' : /space suit/.test(p589Cloth) ? '#d9dde2' : '') 
    : key === 'fk' && !fkRobed ? (/suit/.test(fkChest) ? '#62666e' : /armor/.test(fkChest) ? '#4d5038' : '#2c2420') : '';
  const bodyHex = traitColor(/outfit|armor/i, refCloth || color(pal.body, '#424957'));
  const faceHex = key === 'racc' ? (/^(gr[ae]y)?$/i.test(traitValue(/fur color/i).trim()) ? PAL_RACC.skin : traitColor(/fur color|fur|skin|face/i, '#858a91')) : (refSkin && !traitValue(/skin tone|skin color/i) ? refSkin : traitColor(/skin tone|skin color|skin$|face$/i, color(pal.face, '#c9a27e')));
  const hairHex = traitColor(/hair color|hair$/i, has(tr,/white hair|silver hair/)?'#bfc3ca':has(tr,/red hair/)?'#7b2c24':has(tr,/blond|blonde/)?'#c8a05b':has(tr,/blue hair/)?'#344f9a':key==='589'&&has(tr,/mohawk/)?'#d4471c':key==='fk'?'#1f1712':color(pal.top,'#201c20'));
  const topHex = traitColor(/outerwear|coat|jacket|helmet|headwear/i, key==='589'&&has(tr,/fitted|cap/)?'#5a5d63':color(pal.top, bodyHex));
  const accentHex = profile.collectionKey === 'fk' ? components.flame.color : traitColor(/accent|accessory|flame|fire|aura/i, color(pal.acc, '#ff7a1a'));
  const eyeMood=traitValue(/eye appearance/i).toLowerCase();
  const eyeHex = traitColor(/eye color|iris color|eyes?$|iris$/i, /flame|burn|melt|glow|neon/i.test(eyeMood)||has(tr,/flaming eyes|burn eye|melt|glowing eyes/)?accentHex:'#343039');
  // Colour palette sampled from the art (v121): drives the bake's gradients, crack pattern and shadow tone.
  const artPal = key === 'fk' && fk1 ? { ...fk1.pal, crackle: fk1.crackle || 0, crack: fk1.sculpt === 'wolf' ? fk1.pal.accent : '' } : key === '589' ? { ...PAL_589, ...(palette589(p589Body) || {}) } : key === 'racc' ? PAL_RACC : null;
  const skin = mat(faceHex, .82, .01), cloth = mat(bodyHex, .82, .02), darkCloth = mat(shade(bodyHex,.52),.86,.04);
  skin.userData.bcSurf = key === 'racc' ? 'fur' : 'skin';
  const trim = mat(topHex,.6,.12), accent = glow(accentHex), metal = mat('#a8b1ba',.34,.68), bootMat = mat('#191b20',.78,.16), soleMat = mat('#3a3d44',.9,.02);
  // Per-region materials: tees and bare arms show skin, trousers are dark denim/leather, RACC limbs are fur.
  const torsoMat = fkBare ? skin : cloth;
  const pantsMat = key === '589' ? mat('#283041',.88,.02) : key === 'racc' ? skin : key === 'fk' && !fkRobed ? mat(/suit/.test(fkChest)?'#4c5058':'#2a221d',.86,.03) : null;
  const shinMat = pantsMat ? (key === 'racc' ? skin : mat(shade(key === '589' ? '#283041' : '#2a221d',.82),.88,.02)) : null;
  const shortSleeve = (key === '589' && components.outfitStyle === 'streetwear') || fkBare;
  const sleeveless = key === '589' && /jersey|tank/.test(p589Cloth);
  const sleeveMat = fkBare || sleeveless ? skin : cloth, forearmMat = shortSleeve ? skin : cloth;
  const handMat = key === 'racc' ? mat('#2b2c31',.82,.01) : skin;
  const lite = !!opts.lite;
  const S = geo(lite ? 'unit-sphere-lite' : 'unit-sphere', () => new THREE.SphereGeometry(1, lite ? 10 : 16, lite ? 8 : 12));
  const flameGeo = geo('flame-gradient', flameGeoFn);
  const SLow = geo('unit-sphere-low',()=>new THREE.SphereGeometry(1,8,6));
  const addSphere = (parent, material, pos, scale, geometry=(lite&&Math.max(scale[0],scale[1],scale[2])<.045?SLow:S)) => { const m=add(geometry,material,pos[0],pos[1],pos[2],parent); m.scale.set(scale[0],scale[1],scale[2]); return m; };
  const addCapsule = (parent, material, pos, radius, length, scale=[1,1,1]) => { const m=add(capsule(radius,length,lite?8:10,lite?3:4),material,pos[0],pos[1],pos[2],parent); m.scale.set(...scale); return m; };
  const addBox = (parent, material, pos, size) => add(box(...size),material,pos[0],pos[1],pos[2],parent);
  const addDiagnosticMarker = (parent, slot, pos, scale) => {
    if (!opts.debugUnknownTraits) return null;
    const marker = add(geo('nft-diagnostic-marker',()=>new THREE.SphereGeometry(1,10,8)), QA_MARKER_MAT, pos[0],pos[1],pos[2],parent);
    marker.scale.set(...scale); marker.name='nft-unsupported-trait-'+slot; marker.userData.diagnosticOnly=true; return marker;
  };

  // Natural silhouette: rounded torso, shoulder/hip transitions, articulated forearms and shins (not block limbs).
  addCapsule(g,pantsMat||darkCloth,[0,.82,0],.19,.14,[1.03,.72,.76]);
  const torso = addCapsule(g,torsoMat,[0,1.17,0],.245,.39,[1.16,1.04,.76]);
  torso.name = 'avatar-torso';
  // Never fabricate anatomy from a token ID hash: absent an explicit body-build trait,
  // collection proportions stay neutral and stable. Identity must come from source traits/art.
  const bodyShapeTrait = profile.rawTraits.find(([type]) => /body type|body shape|body build|physique|stature/i.test(type))?.[1] || '';
  const bodyShapeText = String(bodyShapeTrait).toLowerCase();
  const hasBodyShape = !!bodyShapeTrait;
  const bodyBuild = /bulky|heavy|large|muscular|buff|stocky|broad/.test(bodyShapeText) ? 'broad'
    : /slim|thin|lean|narrow|skinny/.test(bodyShapeText) ? 'slim'
    : /tall|lanky|elongated/.test(bodyShapeText) ? 'tall'
    : /short|compact|small|stout/.test(bodyShapeText) ? 'compact'
    : /athletic|fit|toned/.test(bodyShapeText) ? 'athletic' : 'default';
  const bodyScale = bodyBuild === 'broad' ? [1.16,.98,1.08]
    : bodyBuild === 'slim' ? [.84,1.04,.92]
    : bodyBuild === 'tall' ? [.96,1.16,.96]
    : bodyBuild === 'compact' ? [1.02,.86,1.02]
    : bodyBuild === 'athletic' ? [1.07,1.04,1] : [1,1,1];
  // With no body-build trait, keep the collection baseline instead of randomizing proportions.
  torso.scale.x *= reconstruction.torsoWidth * bodyScale[0];
  torso.scale.y *= reconstruction.torsoHeight * bodyScale[1];
  torso.scale.z *= bodyScale[2];
  torso.name = 'avatar-torso-' + reconstruction.signature;
  // Shoulder volume follows the garment color; armor plates are added only when the
  // token actually has an armor trait.
  for (const side of [-1,1]) {
    const shoulder=addSphere(g,torsoMat,[side*.205,1.405,-.002],[.115,.105,.105]);
    shoulder.name='nft-natural-shoulder';
  }
  add(geo('neck',()=>new THREE.CylinderGeometry(.075,.09,.15,12)),skin,0,1.55,0).scale.set(hs.neckW,hs.neckH,hs.neckW*.95);
  // Keep the base body intentionally quiet: collection identity should come from the NFT's
  // actual traits, not a universal sci-fi chest plate, bright belt, and oversized pockets.
  const seamMat = mat(shade(bodyHex,.72),.9,.01);
  if (!fkBare) {
  addBox(g,seamMat,[0,1.2,.187],[.009,.22,.006]).name='nft-garment-center-seam';
  for (const side of [-1,1]) {
    const seam=addBox(g,seamMat,[side*.155,1.2,.162],[.006,.24,.006]);
    seam.name='nft-garment-side-seam';
  }
  }
  const beltMat=mat(pantsMat?'#1b1b1f':shade(bodyHex,.48),.9,.02);
  const belt = add(cylinder(.218,.218,.035,20),beltMat,0,.88,0);
  belt.scale.set(1,.52,.75); belt.name='nft-neutral-belt';
  // Trait recipes change readable silhouette details without changing gameplay or NFT ownership.
  if (components.outfitStyle === 'robes') {
    const robe = addCapsule(g, darkCloth, [0, .99, -.015], .22, .23, [1.18, 1.25, .82]);
    robe.name = 'nft-robe-outer-layer';
    addBox(g, trim, [0, 1.06, .205], [.035, .35, .018]);
  } else if (components.outfitStyle === 'armor') {
    for (const side of [-1, 1]) {
      const plate = addSphere(g, metal, [side * .22, 1.38, .055], [.145, .105, .13]);
      plate.name = 'nft-armor-shoulder';
      addBox(g, accent, [side * .22, 1.38, .17], [.07, .018, .012]);
    }
    addBox(g, metal, [0, 1.18, .207], [.22, .25, .025]);
  } else if (components.outfitStyle === 'tailored') {
    for (const side of [-1, 1]) {
      const lapel = addBox(g, trim, [side * .07, 1.28, .198], [.055, .19, .016]);
      lapel.rotation.z = side * -.22;
    }
  } else if (components.outfitStyle === 'streetwear') {
    addCapsule(g, darkCloth, [0, 1.43, -.025], .115, .12, [1.2, .8, .9]);
  }
  // RACC source-specific garment reconstruction: only apply when the NFT metadata names
  // the recognizable yellow-striped sweater, avoiding invented stripes on other tokens.
  const raccFitText = traitValue(/fits|outfit|clothing|sweater|shirt/i).toLowerCase();
  if (key === 'racc' && /yellow striped sweater/.test(raccFitText)) {
    const sweater = addCapsule(g, mat('#35383c', .94, .01), [0,1.17,.002], .249,.395,[1.16,1.04,.78]);
    sweater.name='nft-racc-striped-sweater';
    const yellow = mat('#e2bd32',.9,.01);
    // Segmented horizontal bands follow the torso's curved front; gaps at the sides
    // prevent the stripes from reading as flat rectangles wrapped through the body.
    for(let row=0;row<5;row++) {
      const y=1.035+row*.067;
      for(let segment=-2;segment<=2;segment++) {
        const x=segment*.078;
        const z=.002+.188*Math.sqrt(Math.max(.12,1-(x/.285)**2));
        const stripe=addBox(g,yellow,[x,y,z],[.039,.009,.006]);
        stripe.name='nft-racc-sweater-stripe';
        stripe.rotation.z=-x*.22;
      }
    }
    const collar=add(geo('nft-racc-sweater-collar',()=>new THREE.TorusGeometry(.078,.012,6,20)),yellow,0,1.405,.01,g);
    collar.rotation.x=Math.PI/2;
    collar.name='nft-racc-sweater-collar';
    addBox(g,mat('#e2bd32'),[0,1.385,.075],[.105,.014,.009]).name='nft-racc-sweater-neckline';
  }
  // Surface patterns are driven by actual metadata and remain visible around the artwork tabard.
  // Prefer a dedicated pattern/marking trait; use outfit color only as a fallback.
  // Including "outfit" in the primary matcher made an earlier clothing trait mask a later pattern trait.
  const patternColor=traitColor(/pattern|marking|camo|stripe|spot/i,traitColor(/outfit|armor/i,'#b8b3a7'));
  if (components.patternStyle === 'stripes') {
    for (const side of [-1,1]) for (let i=0;i<3;i++) {
      const stripe=addBox(g,mat(patternColor),[side*(.205+i*.012),1.13+i*.075,.177],[.012,.052,.012]);
      stripe.rotation.z=side*.12;
      stripe.name='nft-pattern-stripe';
    }
  } else if (components.patternStyle === 'spots' || components.patternStyle === 'camouflage') {
    for (let i=0;i<6;i++) {
      const side=i%2?1:-1, y=1.0+((i*7)%5)*.075, z=.175;
      const patch=addSphere(g,mat(i%2?patternColor:shade(patternColor,.68)),[side*(.17+((i*3)%3)*.018),y,z],[.025+(i%3)*.008,.018+(i%2)*.009,.009]);
      patch.name=components.patternStyle==='spots'?'nft-pattern-spot':'nft-camouflage-patch';
    }
  } else if (components.patternStyle === 'checkered') {
    // Keep the pattern on the torso's exposed edges so it remains visible beside the full NFT artwork panel.
    for (const side of [-1,1]) for (let row=0;row<4;row++) for (let col=0;col<2;col++) {
      if ((row+col)%2===0) {
        const tile=addBox(g,mat(col===0?patternColor:shade(patternColor,.58)),
          [side*(.275+col*.018),1.015+row*.07,.194],[.018,.035,.009]);
        tile.name='nft-pattern-checker';
      }
    }
  }

  if (['flame-on','heating-up','about-to-burn'].includes(components.bodyEffect)) {
    const bodyFlameColor=components.flame.color || accentHex;
    const flameCount=components.bodyEffect==='flame-on'?6:components.bodyEffect==='heating-up'?3:2;
    for(let i=0;i<flameCount;i++) {
      // Source art shows small flame licks rising off the shoulders, not decals on the shirt front.
      const side=i%2?1:-1, y=1.47+(i%3)*.025;
      const z=-.04+(i%3)*.05, size=components.bodyEffect==='flame-on'?.04:components.bodyEffect==='heating-up'?.032:.024;
      const flame=add(geo('nft-body-flame:'+size,()=>new THREE.ConeGeometry(size,size*2.7,6)),glow(bodyFlameColor),side*(.2+(i%3)*.035),y,z);
      flame.rotation.z=side*-.16; flame.name='nft-body-effect-flame';
    }
  }

  const legs = [-1,1].map(s => {
    const hip = new THREE.Group(); hip.position.set(s*reconstruction.hipSpan*bodyScale[0],.84,0); hip.scale.set(bodyScale[0]===1?1:Math.sqrt(bodyScale[0]), reconstruction.legScale*bodyScale[1], bodyScale[2]); g.add(hip);
    addSphere(hip,pantsMat||darkCloth,[0,-.04,0],[.135,.16,.13]);
    addCapsule(hip,pantsMat||cloth,[0,-.245,0],.09,.31,[1.08,1,.96]);
    const knee = new THREE.Group(); knee.position.set(0,-.43,0); hip.add(knee);
    // Reference art has no contrasting knee caps; matching the trouser keeps the leg from reading as a toy joint.
    addSphere(knee,pantsMat||trim,[0,0,.015],pantsMat?[.084,.088,.084]:[.094,.092,.094]);
    addCapsule(knee,shinMat||darkCloth,[0,-.205,0],.075,.25,[1.02,1,.95]);
    addCapsule(knee,bootMat,[0,-.385,.045],.075,.08,[1.08,.62,1.5]);
    addSphere(knee,bootMat,[0,-.415,.11],[.085,.045,.105]);
    // Rubber sole + toe cap give the shoe a readable silhouette (merged into the baked mesh, no extra draw call).
    add(capsule(.07,.13,8,2),soleMat,0,-.452,.07,knee).scale.set(1.12,.28,1.18);
    addSphere(knee,soleMat,[0,-.425,.17],[.068,.032,.05],geo('unit-sphere-low',()=>new THREE.SphereGeometry(1,8,6)));
    hip.userData.knee = knee; return hip;
  });
  const arms = [-1,1].map(s => {
    const shoulder = new THREE.Group(); shoulder.position.set(s*reconstruction.shoulderSpan*bodyScale[0],1.42,0); shoulder.scale.set(Math.sqrt(bodyScale[0]), reconstruction.armScale*bodyScale[1], bodyScale[2]); g.add(shoulder);
    // Shoulder ball follows the sleeve/skin instead of a contrasting trim color (a toy-figure cue).
    addSphere(shoulder,key==='generic'?trim:sleeveMat,[0,0,0],fkBare?[.118,.125,.118]:[.105,.115,.11]);
    addCapsule(shoulder,sleeveMat,[0,-.17,0],fkBare?.08:.072,.22,[1,1,1]);
    if (shortSleeve && !fkBare && !sleeveless) { const cuff=addCapsule(shoulder,cloth,[0,-.1,0],.076,.07,[1,1,1]); cuff.name='nft-tee-sleeve'; }
    const elbow = new THREE.Group(); elbow.position.set(0,-.3,0); shoulder.add(elbow);
    addSphere(elbow,shortSleeve?forearmMat:darkCloth,[0,0,0],[.068,.068,.07]);
    addCapsule(elbow,forearmMat,[0,-.135,0],fkBare?.064:.059,.17,[1,1,1]);
    addSphere(elbow,handMat,[0,-.255,.01],[.056,.064,.058]);
    addSphere(elbow,handMat,[0,-.285,.04],[.046,.043,.048]);
    add(capsule(.016,.035,5,1),handMat,-s*.04,-.262,.045,elbow).rotation.z=-s*.75;
    if(!lite) for(let f=0;f<3;f++) add(capsule(.012,.03,5,1),handMat,(f-1)*.022,-.322,.045,elbow);
    shoulder.userData.elbow=elbow; return shoulder;
  });

  const head = new THREE.Group(); head.position.set(0,reconstruction.headY,0); head.name='nft-head-' + reconstruction.signature; g.add(head);
  const faceShapeTrait = profile.rawTraits.find(([type]) => /head shape|face shape|skull shape/i.test(type))?.[1] || '';
  const faceShapeText = String(faceShapeTrait).toLowerCase();
  const hasFaceShape = !!faceShapeTrait;
  const faceScale = /square|angular|blocky|wide jaw/.test(faceShapeText) ? [1.12,.94,1]
    : /long|oblong|elongated/.test(faceShapeText) ? [.92,1.14,1]
    : /round|circular|soft/.test(faceShapeText) ? [1.08,1.04,1.04]
    : /narrow|thin|slim/.test(faceShapeText) ? [.86,1,1]
    : [1,1,1];
  // With no face-shape trait, keep the collection-specific head proportions unchanged.
  head.scale.multiply(new THREE.Vector3(...reconstruction.headScale));
  head.scale.multiply(new THREE.Vector3(...faceScale));
  // Realistic head-to-body ratio (589 / Firekeepers ~1:6.5-7, RACC stylised): shrink the whole head
  // group, then seat the chin on the neck so smaller heads never float.
  head.scale.multiplyScalar(hs.scale);
  if (key !== 'generic') head.position.y = (key === 'racc' ? 1.5 : 1.6) + (key === 'racc' ? .235 : .22) * head.scale.y;
  if (key === 'racc') {
    // RACC gets an unmistakable rounded raccoon skull, eye mask, muzzle, ears and ringed tail.
    addSphere(head,skin,[0,.02,0],[.235,.255,.22]).name='nft-racc-skull';
    // Sculpt the classic raccoon mask as a tapered, angular band instead of a flat oval.
    // The stepped contour leaves room for the eye patches and follows the brow/temple silhouette.
    const maskShape = new THREE.Shape();
    maskShape.moveTo(-.218,.055);
    maskShape.lineTo(-.16,.09); maskShape.lineTo(-.085,.072);
    maskShape.lineTo(0,.038); maskShape.lineTo(.085,.072);
    maskShape.lineTo(.16,.09); maskShape.lineTo(.218,.055);
    maskShape.lineTo(.17,-.015); maskShape.lineTo(.105,-.055);
    maskShape.lineTo(.055,-.025); maskShape.lineTo(0,-.012);
    maskShape.lineTo(-.055,-.025); maskShape.lineTo(-.105,-.055);
    maskShape.lineTo(-.17,-.015); maskShape.closePath();
    const maskGeometry=new THREE.ExtrudeGeometry(maskShape,{depth:.018,bevelEnabled:true,bevelSegments:1,steps:1,bevelSize:.004,bevelThickness:.003});
    // Bend the mask over the ellipsoidal skull so the temples do not float like a flat visor.
    // Keep the original extrusion as a small raised rim, while seating each vertex on the face.
    const maskPositions=maskGeometry.attributes.position;
    for(let i=0;i<maskPositions.count;i++){
      const x=maskPositions.getX(i), y=maskPositions.getY(i)+.005;
      const nx=x/.235, ny=(y-.02)/.255;
      const faceZ=.22*Math.sqrt(Math.max(0,1-nx*nx-ny*ny));
      maskPositions.setZ(i,faceZ-.204+.004+maskPositions.getZ(i)*.2);
    }
    maskPositions.needsUpdate=true;
    maskGeometry.computeVertexNormals();
    const maskMesh=add(maskGeometry,
      mat(traitColor(/mask/i,has(tr,/red mask/)?'#c4161c':'#282a30')),-0,.005,.204,head);
    maskMesh.name='nft-racc-angular-eye-mask';
    for (const s of [-1,1]) {
      // Layered ears: rounded outer fur, a tapered silhouette, and a contrasting inner ear.
      addSphere(head,mat('#686d75'),[s*.19,.205,-.005],[.085,.095,.065]);
      const earTip=add(geo('nft-racc-ear-tip',()=>new THREE.ConeGeometry(.068,.19,8)),mat('#686d75'),s*.19,.285,-.004,head);
      earTip.rotation.z=-s*.22; earTip.name='nft-racc-ear-tip';
      addSphere(head,mat(traitColor(/fur color|fur/i,'#b77e82')),[s*.19,.215,.052],[.043,.058,.018]).name='nft-racc-inner-ear';
      // Pale cheek ruffs widen the unmistakable raccoon face silhouette.
      const cheek=addSphere(head,mat(shade(faceHex,1.22)),[s*.145,-.065,.155],[.082,.072,.047]);
      cheek.name='nft-racc-cheek-ruff';
      addSphere(head,mat('#d8d9d6'),[s*.085,.02,.222],[.052,.047,.022]).name='nft-racc-eye-patch';
      // RACC source art commonly uses vivid blue irises; explicit token eye traits still override this default.
      const raccEyeHex = traitValue(/eye color|iris color|eyes?$|iris$/i) ? eyeHex : '#287ed1';
      addSphere(head,components.eyeStyle === 'glowing' ? glow(raccEyeHex) : mat(raccEyeHex),[s*.085,.02,.244],[.024,.027,.013]).name='nft-racc-eye';
      addSphere(head,mat('#11151b'),[s*.085,.02,.255],[.009,.016,.006]).name='nft-racc-pupil';
      addSphere(head,mat('#ffffff'),[s*.078,.03,.261],[.005,.006,.003]).name='nft-racc-eye-glint';
      // Separate pale muzzle pads give the raccoon a forward-projecting animal profile
      // instead of reading as a human face with a mask.
      const muzzlePad=addSphere(head,mat(shade(faceHex,1.28)),[s*.048,-.087,.255],[.058,.043,.066]);
      muzzlePad.name='nft-racc-muzzle-pad';
    }
    // A tapered bridge widens at the cheeks and narrows toward the nose. It is a
    // dedicated RACC feature, not a generic human nose scaled up.
    const muzzle=add(geo('nft-racc-tapered-muzzle',()=>new THREE.CylinderGeometry(.045,.094,.17,12,1)),mat(shade(faceHex,1.22)),0,-.075,.244,head);
    muzzle.rotation.x=Math.PI/2;
    muzzle.name='nft-racc-tapered-muzzle';
    addSphere(head,mat('#f0e4d0'),[0,-.11,.276],[.067,.042,.055]).name='nft-racc-chin';
    // A softly flattened triangular nose and two tiny nostrils read better in profile than a sphere alone.
    const nose=add(geo('nft-racc-nose-shape',()=>new THREE.SphereGeometry(1,12,8)),mat('#17181b'),0,-.061,.327,head);
    nose.scale.set(.038,.026,.019); nose.name='nft-racc-nose';
    for(const s of [-1,1]) {
      addSphere(head,mat('#090a0c'),[s*.016,-.065,.343],[.006,.004,.003]).name='nft-racc-nostril';
    }
    // A restrained mouth seam anchors the muzzle pads and chin without imposing an expression trait.
    const mouthCurve=new THREE.CatmullRomCurve3([
      new THREE.Vector3(0,-.079,.329),
      new THREE.Vector3(0,-.105,.326),
      new THREE.Vector3(-.035,-.119,.313),
      new THREE.Vector3(-.052,-.11,.307)
    ]);
    const mouth=add(geo('nft-racc-mouth-seam',()=>new THREE.TubeGeometry(mouthCurve,8,.0035,5,false)),mat('#4b3935'),0,0,0,head);
    mouth.name='nft-racc-mouth-seam';
    const mouthMirror=add(geo('nft-racc-mouth-seam-mirror',()=>new THREE.TubeGeometry(new THREE.CatmullRomCurve3([
      new THREE.Vector3(0,-.079,.329),
      new THREE.Vector3(0,-.105,.326),
      new THREE.Vector3(.035,-.119,.313),
      new THREE.Vector3(.052,-.11,.307)
    ]),8,.0035,5,false)),mat('#4b3935'),0,0,0,head);
    mouthMirror.name='nft-racc-mouth-seam';
    if (components.tailStyle !== 'none' && components.tailStyle !== 'custom') {
      const tail = new THREE.Group(); tail.name='nft-racc-tail'; tail.position.set(0,.77,-.17); tail.rotation.x=-.72; g.add(tail);
      for(let i=0;i<6;i++) {
        const segmentColor = components.tailStyle === 'dark-tip' && i > 3 ? '#202126'
          : components.tailStyle === 'light-tip' && i > 3 ? '#e0ded8'
          : components.tailStyle === 'ringed' ? (i%2 ? '#292b30' : '#969ba2')
          : (i%2 ? shade(faceHex,.72) : faceHex);
        addSphere(tail,mat(segmentColor),[0,0,-.12*i],[.095-i*.008,.09-i*.007,.11]);
      }
    } else if (components.tailStyle === 'custom') {
      // Do not display the generic segmented tail as if it faithfully represents a custom design.
      addDiagnosticMarker(g,'tail',[0,.88,-.48],[.14,.2,.14]);
    }
  } else {
    addSphere(head,skin,[0,.015,0],[.19*hs.skullW,.235*hs.skullH,.18*hs.skullD]).name='nft-head-skull';
    // Jaw/cheek volume: Firekeepers get broad square jaws, 589s a leaner jawline (per-token from traits).
    // Organic sculpted heads (SDF -> smooth mesh, nft-avatar-sculpt.js) for 589 humans and every Firekeeper:
    // real cranium/brow/cheekbones/jaw for humans; wolf/reptile/monkey/skull/bird anatomy for creature tokens.
    sculptKind = (key==='589'||key==='fk') ? (fk1?.sculpt || ({skull:'skull',wolf:'wolf',monkey:'monkey',reptile:'reptile'})[hs.faceKind]
      || (key==='fk' && /helmet/.test(fkHead) && !/space/.test(fkHead) ? 'helm' : 'human')) : '';
    creature = /^(wolf|reptile|monkey|skull|bird)$/.test(sculptKind); noFace = creature || sculptKind==='helm';
    if (sculptKind) {
      head.remove(head.getObjectByName('nft-head-skull'));
      const extra = [];
      const beardCol = fk1?.beard || (/beard/.test(fkFace) ? shade(faceHex,1.12) : '');
      if (beardCol) extra.push({ t:'e', c:[0,-.15,.1], r:[.135,.105,.105], col:beardCol, k:.04 }, { t:'e', c:[0,-.07,.168], r:[.055,.016,.02], col:beardCol, k:.02 });
      if (fk1?.hair) extra.push({ t:'e', c:[0,.085,-.045], r:[.188,.2,.212], col:fk1.hair, k:.03 }, { t:'c', a:[0,0,-.13], b:[0,-.32,-.13], r1:.16, r2:.12, col:fk1.hair, k:.05 });
      if (fk1?.drips) for (const [x,l] of [[-.09,.07],[-.03,.05],[.05,.08],[.1,.05]]) extra.push({ t:'c', a:[x,.0,.17], b:[x*1.05,-l,.172], r1:.014, r2:.009, col:shade(faceHex,1.2), k:.02 });
      const spec = sculptKind==='wolf' ? wolfHeadSpec({ fur:faceHex, light:shade(faceHex,1.35), dark:shade(faceHex,.7) })
        : sculptKind==='reptile' ? reptileHeadSpec({ scale:faceHex, belly:shade(faceHex,1.5) })
        : sculptKind==='monkey' ? monkeyHeadSpec({ fur:faceHex })
        : sculptKind==='skull' ? skullHeadSpec({ bone:faceHex, brain: !!fk1?.brain || /brain/.test(fkHead) })
        : sculptKind==='bird' ? birdHeadSpec({ feather:fk1?.feather || faceHex })
        : sculptKind==='helm' ? greatHelmSpec({ metal:fk1?.metal || '#2c2e2a' })
        : humanHeadSpec(hs, faceHex, { prims: extra });
      const sm = new THREE.Mesh(sculptHeadGeometry(spec, { lite }), sculptKind==='helm' ? SCULPT_METAL_MATERIAL : SCULPT_MATERIAL);
      sm.name = 'nft-head-sculpt-' + sculptKind; sm.castShadow = true; sm.userData.bcSurf = /wolf|monkey/.test(sculptKind) ? 'fur' : sculptKind==='helm' ? 'metal' : 'skin'; head.add(sm);
    } else addSphere(head,skin,[0,-.095-hs.jawDrop,.025],[.15*hs.jawW,.105,.15*hs.jawD]).name='nft-head-jaw';
    // Facial planes, eyes, brows, nose and ears create a less toy-like human face.
    const surprisedEyes=/surprised|wide|open/i.test(components.eyeAppearance);
    const lowSphere=geo('unit-sphere-low',()=>new THREE.SphereGeometry(1,8,6));
    const sockets=hs.faceKind==='skull';
    if (creature) {
      // Creature eyes sit inside the sculpted sockets (wolf amber, serpent yellow, skull embers).
      const E={wolf:[.062,.052,.15,fk1?.pal?.glow||'#ffb020'],reptile:[.085,.066,.112,fk1?.eyes||'#f2c94c'],monkey:[.058,.042,.142,'#2a1a10'],skull:[.064,.04,.13,'#ff5a1a'],bird:[.095,.07,.1,'#ffcf3a']}[sculptKind];
      for (const s of [-1,1]) addSphere(head,sculptKind==='monkey'?mat(E[3],.35,0):glow(E[3]),[s*E[0],E[1],E[2]],[.017,.014,.012],lowSphere).name='nft-creature-eye';
    }
    if (!noFace) for (const s of [-1,1]) {
      const ex=s*.067*hs.eyeGap;
      if(hs.earSize>0 && !sculptKind) addSphere(head,skin,[s*(.19*hs.skullW+(hs.earSize>1?.02:0)),.01,0],[.04*hs.earSize,.065*hs.earSize,.045]).name=hs.earSize>1?'nft-head-ear-large':'nft-head-ear';
      if(sockets) {
        // Skull face (Firekeepers "Skull"): dark sockets with a faint ember instead of eyeballs.
        addSphere(head,mat('#151314',.9,0),[ex,.04,.163],[.042,.038,.022]).name='nft-skull-socket';
        addSphere(head,glow('#ff5a1a'),[ex,.04,.178],[.009,.009,.004],lowSphere).name='nft-skull-ember';
      } else {
        addSphere(head,mat('#f0e7d9'),[ex,.045,.158],[.035*hs.eyeW,.025*hs.eyeH*(surprisedEyes?1.15:1),.018]);
        const eyeGlow = components.eyeStyle === 'glowing' || fkFlameEyes || hs.eyeStyle==='burn-glow';
        addSphere(head,eyeGlow ? glow(fkFlameEyes||hs.eyeStyle==='burn-glow'?'#ff8a1e':eyeHex) : mat(eyeHex),[ex,.043,.175],surprisedEyes?[.016,.02,.01]:[.012*hs.eyeW,.014*Math.max(.8,hs.eyeH),.01]);
        if(!eyeGlow) addSphere(head,mat('#0d0f14',.4,0),[ex,.043,.183],[.007,.008,.004],lowSphere).name='nft-eye-pupil';
        if(key!=='generic' && !surprisedEyes && hs.lid>0) {
          // Heavy upper lid: the source art's flat, narrowed stare instead of round cartoon eyeballs.
          const lid=addSphere(head,mat(shade(faceHex,.78),.8,.01),[ex,.06-hs.lid*.008,.172],[.04*hs.eyeW,.012+hs.lid*.012,.02],lowSphere);
          lid.rotation.z=s*-hs.lidTilt; lid.name='nft-eye-upper-lid';
        }
        if(key==='generic') addSphere(head,mat('#ffffff',.2,0,'#ffffff'),[s*.061,.051,.186],[.004,.005,.002],lowSphere).name='nft-eye-glint';
      }
      // Brows: height, slope and thickness follow the token's Eye trait ("Interesting" raises one brow).
      const brow=addCapsule(head,mat(shade(faceHex,sockets?.5:.65)),[ex,.092+hs.browY+(s<0?hs.browL:0),sculptKind?.152:.155],(sculptKind?.009:.012)*hs.browThick,.035,[1,.6,.6]);
      brow.rotation.z=s*hs.browTilt; brow.name='nft-head-brow';
    }
    if(hs.eyeStyle==='gold-melt') {
      // 589 "Golden Melt Down": melting gold shades.
      const gold=mat('#d9ad3c',.3,.85);
      for(const s of [-1,1]) addBox(head,gold,[s*.067,.045,.19],[.075,.04,.012]).name='nft-gold-melt-lens';
      addBox(head,gold,[0,.05,.19],[.04,.01,.01]);
      for(const [x,l] of [[-.09,.05],[-.05,.03],[.06,.06],[.095,.035]]) addCapsule(head,gold,[x,.02-l*.5,.19],.006,l,[1,1,1]).name='nft-gold-melt-drip';
    }
    if(hs.eyewear==='shades') { const shades=mat('#111216',.25,.5); for(const s of [-1,1]) addBox(head,shades,[s*.067,.045,.19],[.08,.035,.012]).name='nft-fk-shades'; addBox(head,shades,[0,.05,.19],[.05,.01,.01]); }
    if(sculptKind) { /* creature anatomy lives in the sculpted mesh */ } else if(hs.faceKind==='wolf') {
      const fur=mat(faceHex,.85,.01);
      const snout=addCapsule(head,fur,[0,-.05,.2],.06,.1,[1,.8,1]); snout.rotation.x=Math.PI/2; snout.name='nft-wolf-snout';
      addSphere(head,mat('#141416'),[0,-.035,.3],[.03,.022,.02]).name='nft-wolf-nose';
      for(const s of [-1,1]) { const ear=add(geo('nft-wolf-ear',()=>new THREE.ConeGeometry(.06,.16,6)),fur,s*.12,.24,-.01,head); ear.rotation.z=-s*.25; ear.name='nft-wolf-ear'; }
    } else if(hs.faceKind==='monkey') {
      addSphere(head,mat('#b88a62',.85,.01),[0,-.06,.15],[.12,.085,.07]).name='nft-monkey-muzzle';
    } else if(hs.faceKind==='reptile') {
      addSphere(head,skin,[0,-.06,.17],[.11,.07,.11]).name='nft-reptile-snout';
    } else if(sockets) {
      addBox(head,mat('#151314',.9,0),[0,-.03,.19],[.03,.03,.01]).name='nft-skull-nose';
      for(let i=-3;i<=3;i++) addBox(head,mat('#efe6cf',.7,0),[i*.016,-.115,.172],[.012,.022,.01]).name='nft-skull-teeth';
    }
    // Nose geometry follows an explicit NFT trait when present; otherwise keep a subtle human nose.
    const noseText=traitValue(/nose|nostril/i).toLowerCase();
    const noseMat=mat(shade(faceHex,/robot|metal|cyber|chrome/.test(noseText)?.58:.76),.78,.02);
    if (sculptKind) { /* sculpted nose */ } else if (/robot|metal|cyber|chrome/.test(noseText)) {
      const bridge=addBox(head,metal,[0,.005,.177],[.035,.075,.025]); bridge.name='nft-nose-bridge';
      const nose=addBox(head,metal,[0,-.035,.196],[.055,.035,.03]); nose.name='nft-nose-robotic';
      for(const s of [-1,1]) addSphere(head,mat('#25272b'),[s*.019,-.047,.213],[.006,.006,.004]).name='nft-nostril';
    } else {
      const bridge=addSphere(head,noseMat,[0,.002,.174],[.014,.045,.018]); bridge.name='nft-nose-bridge';
      const noseScale=/broad|wide|flat|button/.test(noseText)?[.035,.022,.027]
        :/long|prominent|pointed/.test(noseText)?[.022,.043,.027]
        :/snout|animal|raccoon/.test(noseText)?[.04,.027,.035]
        :/hook|curved|aquiline/.test(noseText)?[.024,.038,.028]
        :[.023,.027,.024];
      const nose=addSphere(head,noseMat,[0,-.027,.193],noseScale);
      nose.name=/broad|wide|flat/.test(noseText)?'nft-nose-broad'
        :/button/.test(noseText)?'nft-nose-button'
        :/long|prominent|pointed/.test(noseText)?'nft-nose-long'
        :/hook|curved|aquiline/.test(noseText)?'nft-nose-hooked'
        :/snout|animal|raccoon/.test(noseText)?'nft-nose-snout':'nft-nose';
      if(/hook|curved|aquiline/.test(noseText)) nose.rotation.x=-.24;
      for(const s of [-1,1]) addSphere(head,mat(shade(faceHex,.62)),[s*(noseScale[0]*.48),-.039,.211],[.005,.006,.004]).name='nft-nostril';
    }
    // Human/Protocol masks are distinct wearable geometry; the original NFT art tabard remains intact below.
    if (components.hasMask) {
      const maskColor=traitColor(/mask/i,'#25272d');
      const mask=addSphere(head,mat(maskColor,.62,.12),[0,-.075,.19],[.145,.078,.045]);
      mask.name='nft-trait-face-mask';
      addBox(head,mat(shade(maskColor,.72)),[0,-.025,.205],[.025,.035,.025]);
    }
    const mouthTrait = traitValue(/mouth|expression|emotion/i).toLowerCase();
    // Facial hair is rendered from the typed trait recipe below, not from untyped token words.
    if (/fang|teeth|snarl|open mouth|scream|grrr|angry|rage/.test(mouthTrait)) {
      addSphere(head,mat('#2a1517'),[0,-.105,.177],[.07,.035,.025]);
      for (const s of [-1,1]) add(geo('tooth',()=>new THREE.ConeGeometry(.012,.035,6)),mat('#f2e7ce'),s*.026,-.095,.199,head);
    } else if (/smile|grin|happy|smirk|sly/.test(mouthTrait)) {
      const smile=add(geo('smile',()=>new THREE.TorusGeometry(.035,.008,5,14,Math.PI)),mat('#5a2c2b'),0,-.105,.176,head); smile.rotation.z=Math.PI;
      if(/smirk|sly/.test(mouthTrait)) smile.rotation.z=Math.PI+.28;
    } else if (/meh|hmp|hmm/.test(mouthTrait)) {
      addBox(head,mat('#5a2c2b'),[0,-.105,.176],[.055,.008,.008]).name='nft-neutral-mouth';
    }
    // Token-specific mouth extras and face coverings (balaclava, masks, space helmet) sized to this skull.
    if (/grin/.test(hs.mouthStyle)) {
      addBox(head,mat('#2a1517'),[0,-.108,.172],[.085,.024,.012]).name='nft-head-grin';
      addBox(head,mat('#efe6cf',.6,0),[0,-.1,.176],[.075,.011,.008]).name='nft-head-grin-teeth';
    }
    if (hs.cover === 'balaclava') {
      const knit=mat(/red/.test(String(traitValue(/^headwear$/i)).toLowerCase())?'#b8231f':'#16161a',.95,0);
      addSphere(head,knit,[0,.02,0],[.2*hs.skullW,.25*hs.skullH,.192*hs.skullD]).name='nft-protocol-balaclava';
      addSphere(head,knit,[0,-.1,.025],[.158*hs.jawW,.11,.158*hs.jawD]).name='nft-protocol-balaclava-jaw';
      // Eye slit: a strip of skin with the token's stare re-seated in front of the knit.
      addBox(head,skin,[0,.045,.19],[.2,.052,.012]).name='nft-protocol-balaclava-eyehole';
      for(const s of [-1,1]) {
        addSphere(head,mat('#f0e7d9'),[s*.067*hs.eyeGap,.045,.196],[.032,.02,.008],lowSphere);
        addSphere(head,mat('#0d0f14',.4,0),[s*.067*hs.eyeGap,.044,.203],[.008,.009,.003],lowSphere);
        const lid=addBox(head,mat(shade(faceHex,.78),.8,.01),[s*.067*hs.eyeGap,.06,.2],[.07,.014,.008]); lid.rotation.z=s*-hs.lidTilt;
      }
      if (has(tr,/burn/)) addBox(head,mat('#e07a2a',.7,.05),[.07,.17,.15],[.05,.03,.01]).name='nft-protocol-balaclava-logo';
    } else if (hs.cover === 'space-helmet') {
      const rim=add(geo('nft-space-helmet-rim',()=>new THREE.TorusGeometry(.25,.022,6,24)),mat('#cfd5dc',.35,.6),0,.02,.06,head); rim.name='nft-space-helmet-rim';
      addSphere(head,mat('#dfe3e8',.4,.45),[0,.03,-.07],[.27,.29,.2]).name='nft-space-helmet-shell';
    } else if (/mask/.test(hs.cover)) {
      const maskHex=hs.cover==='samurai-mask'?'#9e1f1f':hs.cover==='gas-mask'?'#3a3d36':'#1b1c20';
      addSphere(head,mat(maskHex,.6,.15),[0,-.085,.06],[.165*hs.jawW,.1,.15]).name='nft-fk-face-mask';
      if (hs.cover==='gas-mask') { const f=add(cylinder(.035,.04,.06,10),mat('#26282a',.5,.4),0,-.1,.2,head); f.rotation.x=Math.PI/2; f.name='nft-fk-gas-filter'; }
    }
    const hairColor = hairHex;
    if (hasHairTrait && components.hairStyle !== 'bald' && !has(tr,/bald|shaved|no hair/)) {
      const hairMat=mat(hairColor,.9,.01);
      const hair=add(geo('hair-cap',()=>new THREE.SphereGeometry(1,16,10,0,Math.PI*2,0,Math.PI*.48)),hairMat,0,.09,-.005,head);
      hair.name='nft-hair-cap'; hair.scale.set(.202,.19,.19);
      if (components.hairStyle === 'afro') {
        hair.scale.set(.235,.22,.21);
        for(let i=0;i<9;i++){const a=i*Math.PI*2/9;addSphere(head,hairMat,[Math.cos(a)*.14,.13,Math.sin(a)*.12],[.065,.065,.06]);}
      } else if (components.hairStyle === 'mohawk' || components.hairStyle === 'spiky') {
        const count=components.hairStyle==='mohawk'?5:7;
        for(let i=0;i<count;i++){
          const x=(i-(count-1)/2)*.045, h=components.hairStyle==='mohawk'?.16+(i%2)*.025:.11+(i%3)*.025;
          const spike=add(geo('nft-hair-spike:'+count,()=>new THREE.ConeGeometry(.035,.16,7)),hairMat,x,.205+h*.28,-.005,head);
          spike.scale.y=h/.16; spike.rotation.z=(i-(count-1)/2)*-.07; spike.name='nft-hair-spike';
        }
      } else if (components.hairStyle === 'dreadlocks' || components.hairStyle === 'braids') {
        const count=components.hairStyle==='dreadlocks'?6:4;
        for(let i=0;i<count;i++){
          const x=(i-(count-1)/2)*.052, len=components.hairStyle==='dreadlocks'?.19:.15;
          const lock=addCapsule(head,hairMat,[x,.005,-.045],components.hairStyle==='dreadlocks'?.025:.014,len,[1,1,1]);
          lock.rotation.z=(i-(count-1)/2)*-.12; lock.name=components.hairStyle==='dreadlocks'?'nft-dreadlock':'nft-braid';
        }
      } else if (components.hairStyle === 'long') {
        for(const side of [-1,1]) { const lock=addCapsule(head,hairMat,[side*.155,-.07,-.025],.027,.23,[1,1,1]); lock.rotation.z=side*.08; lock.name='nft-long-hair'; }
      } else if (components.hairStyle === 'ponytail') {
        // Tie gathered hair behind the skull; unlike long hair, the silhouette projects backward.
        const tie=addSphere(head,mat('#c5a35b'),[0,.095,-.17],[.035,.035,.025]); tie.name='nft-ponytail-tie';
        const tail=addCapsule(head,hairMat,[0,.055,-.245],.034,.22,[1,1,1]); tail.rotation.x=-.18; tail.rotation.z=-.08; tail.name='nft-ponytail';
        for(const side of [-1,1]) { const lock=addCapsule(head,hairMat,[side*.15,-.035,-.035],.022,.15,[1,1,1]); lock.rotation.z=side*.08; lock.name='nft-ponytail-side-lock'; }
      } else if (components.hairStyle === 'undercut') {
        // Preserve the top cap but add close-cut temple panels to make the side-shaved profile legible.
        for(const side of [-1,1]) {
          const panel=addSphere(head,mat(shade(hairColor,.62),.95,.01),[side*.174,.055,.005],[.035,.095,.11]);
          panel.name='nft-undercut-temple';
        }
        const sweep=addCapsule(head,hairMat,[.045,.16,.005],.035,.12,[1.1,1,.8]); sweep.rotation.z=-.35; sweep.name='nft-undercut-swept-top';
      } else if (components.hairStyle === 'bun') {
        addSphere(head,hairMat,[0,.19,-.12],[.085,.075,.08]).name='nft-hair-bun';
      }
    }
    if (components.hasMarkings) {
      const markText=String(components.markings||'').toLowerCase();
      const markHex=traitColor(/markings|face paint|tattoo|scar|freckles|war paint/i,'#b42d3b');
      if (/scar/.test(markText)) {
        const scar=addBox(head,mat(markHex),[.07,.005,.177],[.012,.105,.009]); scar.rotation.z=-.35; scar.name='nft-facial-scar';
      } else if (/freckle|spot/.test(markText)) {
        for(let i=0;i<6;i++) addSphere(head,mat(markHex),[.045+(i%3)*.025,-.005-Math.floor(i/3)*.025,.178],[.008,.008,.006]).name='nft-freckle';
      } else {
        for(const side of [-1,1]) {
          const mark=addBox(head,mat(markHex),[side*.075,-.005,.178],[.025,.055,.009]); mark.rotation.z=side*.35; mark.name='nft-face-paint';
        }
      }
    }
    if (components.facialHair && !/none|clean.?shaven|no facial hair/i.test(components.facialHair)) {
      const beardColor=traitColor(/facial hair|beard|mustache/i,'#332821');
      const facialHairText=components.facialHair.toLowerCase();
      if (/mustache|moustache/.test(facialHairText)) {
        for(const side of [-1,1]) addSphere(head,mat(beardColor),[side*.045,-.055,.176],[.05,.018,.018]).name='nft-moustache';
      } else if (/goatee|chin/.test(facialHairText)) {
        addSphere(head,mat(beardColor),[0,-.105,.153],[.055,.045,.035]).name='nft-goatee';
      } else if (/stubble|five.?o.?clock|short beard/.test(facialHairText)) {
        for(let i=0;i<13;i++) {
          const x=((i%5)-2)*.035, y=-.07-Math.floor(i/5)*.025;
          addSphere(head,mat(shade(beardColor,.72)),[x,y,.177],[.009,.009,.006]).name='nft-beard-stubble';
        }
      } else if (/long|wizard|braided|viking/.test(facialHairText)) {
        const beard=addSphere(head,mat(beardColor),[0,-.12,.145],[.085,.09,.052]); beard.name='nft-beard-long';
        if(/braid|viking/.test(facialHairText)) {
          const braid=addCapsule(head,mat(beardColor),[0,-.22,.16],.018,.1,[1,1,1]); braid.name='nft-beard-braid';
        }
      } else {
        addSphere(head,mat(beardColor),[0,-.105,.145],[.105,.075,.055]).name='nft-beard';
      }
    }
  }

  // Trait-driven identity: headwear, eyewear, horns, fire, jewelry, fur/capes and armor accents.
  const hatColor = mat(topHex,.65,.12);
  if (components.headwearStyle === 'halo') {
    const halo=add(geo('nft-burn-halo',()=>new THREE.TorusGeometry(.19,.018,7,28)),glow(traitColor(/headwear/i,accentHex)),0,.245,-.005,head);
    halo.rotation.x=.18; halo.name='nft-burn-halo';
    for(let i=0;i<4;i++) addSphere(head,glow(accentHex),[Math.cos(i*Math.PI/2)*.19,.245+Math.sin(i*Math.PI/2)*.19,0],[.022,.022,.022]).name='nft-halo-spark';
  } else if (components.headwearStyle === 'beehive') {
    const hive=add(geo('nft-beehive',()=>new THREE.ConeGeometry(.15,.27,9)),mat(traitColor(/headwear/i,'#d5a83f')) ,0,.22,-.005,head);
    hive.name='nft-beehive-headwear';
    add(geo('nft-beehive-band',()=>new THREE.TorusGeometry(.12,.012,5,16)),metal,0,.17,-.005,head);
  } else if (components.headwearStyle === 'straw-hat') {
    // A woven/conical hat has a broad brim and tapered crown; do not collapse it into the generic cap recipe.
    const strawColor = mat(traitColor(/headwear/i, '#c8ad72'), .94, .01);
    const brim = add(geo('nft-straw-hat-brim',()=>new THREE.CylinderGeometry(.32,.305,.024,32)),strawColor,0,.16,-.005,head);
    brim.name='nft-straw-hat-brim';
    // The source RACC hat has a tall, sharply tapered woven crown, not a flat-topped bucket.
    const crown = add(geo('nft-straw-hat-crown',()=>new THREE.ConeGeometry(.158,.285,20,3)),strawColor,0,.31,-.005,head);
    crown.name='nft-straw-hat-crown';
    const weaveDark = mat(traitColor(/headwear/i, '#8a6841'), .96, .01);
    // Concentric weave rows lie flat across the hat's horizontal cross-sections.
    // Keep each row in the XY plane (the torus default) so it encircles the crown rather than forming vertical hoops.
    for (const [row, radius, y] of [[0,.285,.174],[1,.245,.205],[2,.205,.238],[3,.165,.271],[4,.125,.304],[5,.085,.337],[6,.045,.368]]) {
      const ring = add(geo('nft-straw-hat-weave-row-'+row,()=>new THREE.TorusGeometry(radius,.0035,4,32)),row%2 ? strawColor : weaveDark,0,y,-.005,head);
      ring.name='nft-straw-hat-weave-row-'+row;
    }
    const band = add(geo('nft-straw-hat-band',()=>new THREE.TorusGeometry(.145,.012,5,24)),weaveDark,0,.205,-.005,head);
    band.name='nft-straw-hat-band';
  } else if (components.headwearStyle === 'rock') {
    const rock=addSphere(head,mat(traitColor(/headwear/i,'#777a80')),[0,.16,-.01],[.22,.17,.2]); rock.name='nft-rock-headwear';
  } else if ((components.headwearStyle === 'helmet' || has(tr,/helmet/)) && !(key==='fk' && /helmet/.test(fkHead)) && hs.cover!=='space-helmet') {
    addSphere(head,metal,[0,.17,-.015],[.225,.105,.205]);
    addBox(head,accent,[0,.11,.17],[.24,.035,.035]);
  } else if (components.headwearStyle === 'crown' || has(tr,/crown/)) {
    add(geo('crown-band',()=>new THREE.TorusGeometry(.15,.025,6,20)),glow('#ffcc33'),0,.21,0,head);
    for(const s of [-1,0,1]) add(geo('crown-point',()=>new THREE.ConeGeometry(.035,.13,7)),glow(traitColor(/crown|headwear/i,'#ffcc33')),s*.105,.3,0,head);
  } else if ((components.headwearStyle === 'hood' || has(tr,/hood/)) && key !== 'fk') {
    const hood=addSphere(head,mat(shade(bodyHex,.78)),[0,.045,-.035],[.245,.27,.21]); hood.renderOrder=0;
  } else if (['hat','beanie','band'].includes(components.headwearStyle) || has(tr,/hat|\bcap\b|fitted|beanie|visor|sweatband|headband/)) {
    addSphere(head,hatColor,[0,.15,-.01],[.212,.115,.2]);
    if (!has(tr,/beanie/)) addBox(head,mat(shade(topHex,.8),.7,.1),[0,.1,.19],[.23,.014,.13]);
    if (key==='589' && has(tr,/burn/)) addBox(head,mat('#c8352a',.7,.05),[0,.19,.17],[.12,.045,.02]).name='nft-protocol-cap-logo';
  } else if (components.headwearStyle === 'custom') {
    // Unknown named headwear is flagged in visual QA instead of being misrepresented as a generic hat.
    addDiagnosticMarker(head,'headwear',[0,.16,-.015],[.19,.12,.17]);
  }
  if(components.hasHorns || has(tr,/horn|antler|tusk/)) {
    const hornText=String(components.horns||traitValue(/horn|antler|tusk/i)).toLowerCase();
    const hornColor=traitColor(/horn|antler|tusk/i,/gold|metal|bronze/.test(hornText)?'#bca56b':'#ded5c6');
    for(const side of [-1,1]) {
      const antler=/antler|branch/.test(hornText);
      const h=add(geo(antler?'nft-antler':'nft-horn',()=>new THREE.ConeGeometry(antler?.035:.045,antler?.28:.22,8)),mat(hornColor),side*.15,.24,-.01,head);
      h.rotation.z=-side*(antler?.32:.55); h.name=antler?'nft-antler':'nft-horn';
      if(antler) { const tine=add(geo('nft-antler-tine',()=>new THREE.ConeGeometry(.018,.13,6)),mat(hornColor),side*.19,.34,-.01,head); tine.rotation.z=side*.3; }
    }
  }
  if(has(tr,/lash|eyelash/)) {
    for(const side of [-1,1]) for(let i=0;i<3;i++) {
      const lash=addBox(head,mat('#171719'),[side*(.045+i*.019),.072,.181],[.008,.035,.008]);
      lash.rotation.z=side*(.35+i*.16); lash.name='nft-eyelash';
    }
  } else if(components.eyewear && !/none|no eyewear|empty/i.test(components.eyewear) || has(tr,/shade|sunglass|frames|goggle|eyewear/)) {
    // Use recognizable frame silhouettes rather than a single bar for every eyewear trait.
    const eyewearText=String(components.eyewear||tr.join(' ')).toLowerCase();
    const frameMat=mat(/gold|brass/i.test(eyewearText)?'#c9a34a':/silver|chrome|metal/i.test(eyewearText)?'#aeb8c4':'#14161b',.32,.5);
    const lensMat=mat(/mirror|chrome|silver/i.test(eyewearText)?'#8dabbc':/red/i.test(eyewearText)?'#8b303b':'#27313b',.28,.28);
    if(/goggle|aviator|pilot/i.test(eyewearText)) {
      for(const side of [-1,1]) {
        const lens=addSphere(head,lensMat,[side*.072,.045,.183],[.067,.052,.018]); lens.name='nft-eyewear-goggle-lens';
        const rim=add(geo('nft-eyewear-goggle-rim',()=>new THREE.TorusGeometry(.058,.009,5,16)),frameMat,side*.072,.045,.198,head);
        rim.name='nft-eyewear-goggle-rim';
      }
      addBox(head,frameMat,[0,.045,.188],[.035,.012,.016]);
    } else if(/round|circular|john lennon/i.test(eyewearText)) {
      for(const side of [-1,1]) {
        const lens=add(geo('nft-eyewear-round-lens',()=>new THREE.CircleGeometry(.047,16)),lensMat,side*.067,.045,.18,head); lens.name='nft-eyewear-round-lens';
        const rim=add(geo('nft-eyewear-round-frame',()=>new THREE.TorusGeometry(.047,.007,5,18)),frameMat,side*.067,.045,.191,head);
        rim.name='nft-eyewear-round-frame';
      }
      addBox(head,frameMat,[0,.045,.19],[.025,.009,.012]);
    } else if(/visor|shield|cyber/i.test(eyewearText)) {
      const visor=addBox(head,lensMat,[0,.045,.184],[.34,.075,.026]); visor.name='nft-eyewear-visor';
      const brow=addBox(head,frameMat,[0,.086,.201],[.35,.012,.012]); brow.name='nft-eyewear-visor-frame';
    } else {
      for(const side of [-1,1]) {
        const lens=addBox(head,lensMat,[side*.067,.045,.181],[.105,.052,.018]); lens.name='nft-eyewear-rect-lens';
        const rim=addBox(head,frameMat,[side*.067,.045,.193],[.112,.059,.008]); rim.name='nft-eyewear-rect-frame';
        const inset=addBox(head,lensMat,[side*.067,.045,.198],[.098,.045,.006]); inset.name='nft-eyewear-rect-lens';
      }
      addBox(head,frameMat,[0,.045,.196],[.025,.009,.012]);
    }
  }
  // Only a fire/flame trait can add head flames; a background named "Burn" is not a body effect.
  if(hasTrait(/body effect|flame|aura/i,/flame|fire|on fire|flaming|ember|inferno|heating up|smolder/i)||key==='fk') {
    for(const [x,h] of [[-.12,.24],[-.04,.32],[.055,.27],[.13,.2]]) {
      const fs=key==='589'?.55:1;
      const flame=add(flameGeo,flameMat(accentHex),x,.24+h*.25*fs,-.04,head);
      flame.scale.set(fs,h/.25*fs,fs); flame.userData.flame=1; flame.userData.flameBase=h/.25*fs;
    }
    // Thin ember streaks under the eyes (was a wide glowing band that read as clown cheeks).
    if(fkFlameEyes) for(const s of [-1,1]) addSphere(head,glow(shade(accentHex,.75)),[s*.095,-.012,.168],[.04,.009,.012]).rotation.z=s*-.35;
  }
  if(key!=='fk' && (components.accessoryStyle === 'chain' || has(tr,/chain|medallion|necklace|gold pick|grill/))) {
    // Wearable jewelry sits just in front of the full-artwork tabard, never behind it.
    // This preserves the complete NFT composition while keeping a token's chain legible in-world.
    const chain=add(geo('necklace',()=>new THREE.TorusGeometry(.15,.012,6,24)),mat(traitColor(/chain|accessory/i,'#d9ad3c'),.3,.85),0,1.47,.07);
    chain.rotation.x=1.25;
    chain.name='nft-chain-base';
    chain.renderOrder=3;
    if(key==='589') {
      const linkMat=mat(traitColor(/chain|accessory/i,'#d9ad3c'),.3,.85);
      for(let i=0;i<10;i++) {
        const angle=Math.PI*.12+(Math.PI*.76*i/9);
        const link=add(geo('nft-protocol-chain-link',()=>new THREE.TorusGeometry(.018,.005,4,8)),linkMat,Math.cos(angle)*.15,1.45-Math.sin(angle)*.075,.2);
        link.rotation.x=1.1; link.rotation.z=angle-Math.PI/2; link.name='nft-protocol-chain-link'; link.renderOrder=3;
      }
      // A BURN pendant is only valid when the actual chain/accessory trait identifies it.
      if(/burn|protocol|logo|emblem/i.test(traitValue(/^accessory$/i))) {
        const pendant=add(geo('nft-protocol-chain-pendant',()=>new THREE.OctahedronGeometry(.045,0)),glow(accentHex),0,1.355,.21);
        pendant.name='nft-protocol-chain-pendant'; pendant.renderOrder=3;
      }
    }
  } else if (components.accessoryStyle === 'relic') {
    const relic = add(geo('nft-relic',()=>new THREE.OctahedronGeometry(.075,0)),glow(accentHex),0,1.28,.235);
    relic.name = 'nft-relic-accessory';
    add(geo('relic-setting',()=>new THREE.TorusGeometry(.09,.012,5,16)),metal,0,1.28,.225).rotation.x=.3;
  } else if (components.accessoryStyle === 'earring') {
    for (const side of [-1,1]) add(geo('nft-earring',()=>new THREE.TorusGeometry(.025,.007,5,10)),glow('#e8b923'),side*.205,1.78,.055,head);
  } else if (components.accessoryStyle === 'pack') {
    addBox(g,darkCloth,[0,1.18,-.2],[.25,.32,.13]);
    for (const side of [-1,1]) addBox(g,trim,[side*.12,1.28,-.12],[.035,.22,.025]);
  } else if (components.accessoryStyle === 'custom') {
    // Unknown accessories are surfaced as QA-only markers; do not invent a pendant shape in-game.
    addDiagnosticMarker(g,'accessory',[.205,1.24,.235],[.055,.055,.055]);
  }
  const hasFurCollar = hasTrait(/^(?:armor|fur|collar|cape|outerwear)$/i) || has(tr,/armor|fur collar|cape/);
  if(hasFurCollar) {
    const furCollar = hasTrait(/^(?:fur|collar)$/i) || has(tr,/fur collar|fur trim/);
    for(const s of [-1,1]) addSphere(g,furCollar?mat('#b8a68a'):trim,[s*.28,1.43,-.005],[.13,.1,.13]);
    if(hasTrait(/cape/i) || has(tr,/cape/)) { const cape=addBox(g,darkCloth,[0,1.14,-.18],[.35,.62,.06]); cape.rotation.x=-.12; cape.name='nft-trait-cape'; }
  }
  if(key==='589') {
    // The Protocol identity mark is a token trait, not a universal decal stamped onto every NFT.
    // A background called "Burn" is not a logo. Brand geometry requires a clothing/accessory/identity trait.
    const hasProtocolMark=hasTrait(/outfit|identity|brand|logo|emblem|insignia/i,/burn|protocol|insignia|logo|emblem/i) || has((Array.isArray(n?.t)?n.t:[]).map(String),/burn|protocol|insignia|logo|emblem/i);
    if(hasProtocolMark) {
      addBox(g,mat('#1b1b1f',.9,.02),[0,.88,.22],[.28,.045,.035]).name='nft-protocol-belt-insignia';
      addBox(g,metal,[0,.88,.242],[.065,.055,.015]);
      // Keep the trait-backed Protocol insignia above the optional QA artwork panel.
      const emblem=add(box(.075,.026,.01),mat('#c8352a',.7,.05),-.1,1.34,.205);
      emblem.name='nft-protocol-emblem'; emblem.renderOrder=3;
    }
    // Straps only appear when the token metadata calls for tactical/technical gear.
    if(hasTrait(/strap|harness|gear|outfit|armor/i,/strap|harness|tactical|techwear/i) || has((Array.isArray(n?.t)?n.t:[]).map(String),/strap|harness|tactical|techwear/i)) {
      addBox(g,trim,[-.12,1.31,.19],[.035,.2,.018]).name='nft-protocol-strap';
      addBox(g,trim,[.12,1.31,.19],[.035,.2,.018]).name='nft-protocol-strap';
    }
    if(/punk/.test(p589Cloth)) {
      // "Punk Burner": open black leather vest over the white tee.
      const leather=mat('#17171a',.55,.18);
      for(const side of [-1,1]) { const panel=addBox(g,leather,[side*.17,1.19,.15],[.1,.42,.02]); panel.rotation.y=side*.45; panel.name='nft-protocol-punk-vest'; }
      addBox(g,leather,[0,1.19,-.17],[.4,.44,.03]).name='nft-protocol-punk-vest';
    }
    if(components.outfitStyle==='streetwear') {
      if(hasProtocolMark) {
        addBox(g,mat('#15171c'),[0,.775,.252],[.12,.055,.012]).name='nft-protocol-shirt-print';
        const shirtSigil=add(geo('nft-protocol-shirt-sigil',()=>new THREE.ConeGeometry(.022,.045,3)),glow(accentHex),0,.775,.266);
        shirtSigil.name='nft-protocol-shirt-sigil'; shirtSigil.renderOrder=3;
      }
      // Restrained edge stitching supports the streetwear silhouette without inventing a logo.
      for(const side of [-1,1]) {
        const stitch=addBox(g,seamMat,[side*.292,1.19,.24],[.012,.16,.012]);
        stitch.name='nft-protocol-shirt-stitch';
        stitch.renderOrder=3;
      }
    }
  }

  if(key==='fk' && !fkRobed) {
    // Real Firekeepers art: broad bare chest with gold tribal linework, heavy gold neck rings,
    // armor/suit chests, flaming heads. Geometry follows each token's Head/Neck/Chest/Face/Accessory.
    const gold=mat(fk1?.pal?.metal && /^#[e-f]/i.test(fk1.pal.metal) ? fk1.pal.metal : '#e2b04a',.26,.9);
    const tattooMat=fk1?.glowTattoo ? glow(shade(fk1.pal.accent,.8)) : gold;
    if (fkBare) {
      for (const side of [-1,1]) {
        // Low, flattened pectoral planes give the muscular silhouette without blobby toy anatomy.
        const pec=addSphere(g,skin,[side*.09,1.3,.135],[.115,.07,.06],SLow); pec.name='nft-firekeeper-pec';
      }
      if (/tattoo|tribal/.test(fkChest)) for (let i=0;i<6;i++) {
        const side=i%2?1:-1, row=Math.floor(i/2);
        const line=addBox(g,tattooMat,[side*(.07+row*.03),1.32-row*.1,.198-row*.006],[.12,.012,.008]);
        line.rotation.z=side*(.5-row*.25); line.name='nft-firekeeper-tribal-tattoo';
      }
    } else if (/armor|mail/.test(fkChest)) {
      const plate=addSphere(g,mat(shade(bodyHex,1.1),.4,.7),[0,1.26,.035],[.27,.24,.175]); plate.name='nft-firekeeper-breastplate';
      for (const side of [-1,1]) addSphere(g,mat(shade(bodyHex,.9),.4,.7),[side*.27,1.42,0],[.13,.1,.13]).name='nft-armor-shoulder';
      if (fk1?.pal?.accent) {
        // Art trim (e.g. the Burned Knight's red edging) as a collar band and shoulder rims.
        const band=add(geo('nft-armor-trim-band',()=>new THREE.TorusGeometry(.2,.022,6,lite?12:20)),mat(fk1.pal.accent,.4,.6),0,1.47,.0); band.rotation.x=Math.PI/2; band.name='nft-armor-trim';
        for (const side of [-1,1]) addSphere(g,mat(fk1.pal.accent,.4,.6),[side*.27,1.37,0],[.135,.03,.135]).name='nft-armor-trim';
      }
    } else if (/suit/.test(fkChest)) {
      addBox(g,mat('#e8e6e0'),[0,1.32,.19],[.09,.2,.01]).name='nft-firekeeper-shirt';
      for (const side of [-1,1]) { const lapel=addBox(g,mat(shade(bodyHex,.8)),[side*.07,1.3,.2],[.05,.2,.012]); lapel.rotation.z=side*-.25; }
    }
    if (/gold|medallion|ring/.test(fkNeck)) {
      for (const [y,r] of [[1.56,.105],[1.515,.175]]) { const neckRing=add(geo('nft-firekeeper-neck-ring:'+r,()=>new THREE.TorusGeometry(r,.026,6,20)),gold,0,y,.01); neckRing.rotation.x=Math.PI/2; neckRing.name='nft-firekeeper-gold-collar'; }
    } else if (/flame|fire/.test(fkNeck)) {
      const collar=add(geo('nft-firekeeper-flame-collar',()=>new THREE.TorusGeometry(.14,.03,6,20)),glow('#ff6a1a'),0,1.49,0); collar.rotation.x=Math.PI/2; collar.name='nft-firekeeper-flame-collar';
    } else if (/tie/.test(fkNeck)) {
      addBox(g,mat('#1a1b20'),[0,1.3,.205],[.035,.2,.01]).name='nft-firekeeper-tie';
    }
    if (/dred|dread|lock/.test(fkHead)) for (let i=0;i<6;i++) {
      const a=-1.3+i*(2.6/5); const lock=add(capsule(.024,.2,6,2),mat(hairHex,.9,.01),Math.sin(a)*.18,.16,Math.cos(a)*.05-.04,head);
      lock.rotation.z=-Math.sin(a)*.9; lock.rotation.x=-.35; lock.name='nft-dreadlock';
    }
    if (sculptKind && (components.headwearStyle === 'hood' || /hood/.test(fkHead))) {
      // Draped hood: a lathed cloth shell open at the face, so the sculpted skull/face peers out of it.
      const hoodGeo=geo('nft-fk-hood:'+(lite?1:0),()=>{const pts=[[.0,.36],[.12,.33],[.21,.25],[.25,.12],[.255,-.04],[.25,-.18],[.29,-.3],[.34,-.38]].map(([r,y])=>new THREE.Vector2(r,y));
        const g2=new THREE.LatheGeometry(pts,lite?12:28,.75,Math.PI*2-1.5); g2.computeVertexNormals(); return g2;});
      const hood=add(hoodGeo,mat(fk1?.hoodCol||shade(bodyHex,.8),.9,.01),0,.0,-.02,head); hood.name='nft-firekeeper-hood';
    }
    if (sculptKind==='helm') {
      addBox(head,glow(fk1?.pal?.glow||'#ff8a1e'),[0,.045,.2],[.17,.016,.02]).name='nft-firekeeper-helm-slit';
      if (fk1?.horns) for (const s of [-1,1]) { const h=add(geo('nft-helm-horn',()=>new THREE.ConeGeometry(.045,.24,lite?6:10)),(fk1.horn?mat(fk1.horn,.26,.9):mat('#e8dcc0',.6,.05)),s*.24,.16,0,head); h.rotation.z=-s*1.0; h.name='nft-firekeeper-helm-horn'; }
    } else if (/helmet/.test(fkHead) && !/space/.test(fkHead)) {
      const helm=addSphere(head,mat('#2c2e2a',.45,.65),[0,.025,0],[.215,.26,.215]); helm.name='nft-firekeeper-great-helm';
      addBox(head,glow('#ff8a1e'),[0,.04,.205],[.16,.018,.02]).name='nft-firekeeper-helm-slit';
      addBox(head,mat('#2c2e2a',.45,.65),[0,.2,.02],[.03,.12,.36]).name='nft-firekeeper-helm-crest';
    }
    if (/tattoo|tribal/.test(fkFace)) for (const side of [-1,1]) {
      const mark=addBox(head,tattooMat,[side*.075,-.02,sculptKind?.19:.176],[.012,.06,.006]); mark.rotation.z=side*.3; mark.name='nft-face-paint';
    }
    if (/tongue/.test(fkFace) || fk1?.tongue) addBox(head,mat('#d46a9a'),sculptKind==='reptile'?[0,-.08,.33]:[0,-.16,.17],sculptKind==='reptile'?[.02,.01,.1]:[.035,.12,.012]).name='nft-firekeeper-tongue';
    if (/beard/.test(fkFace) && !sculptKind) addSphere(head,mat(shade(faceHex,1.12)),[0,-.11,.14],[.11,.08,.06]).name='nft-beard';
    if (/shoulder pad/.test(fkAccessory)) addSphere(g,mat('#1d1e22',.45,.6),[.27,1.43,0],[.14,.1,.14]).name='nft-firekeeper-shoulder-pad';
    if (/third eye/.test(fkAccessory)) addSphere(head,glow('#ff3b2a'),[0,.12,.17],[.02,.025,.01]).name='nft-firekeeper-third-eye';
  }
  if(key==='fk' && fkRobed) {
    // The collection establishes a layered robe silhouette, but optional wearable details must
    // follow this token's metadata instead of being stamped onto every Firekeeper.
    const hem=add(geo('nft-firekeeper-robe-hem',()=>new THREE.CylinderGeometry(.235,.34,.52,12)),darkCloth,0,.79,-.015);
    hem.name='nft-firekeeper-robe-hem';
    for (const side of [-1,1]) {
      const panel=add(geo('nft-firekeeper-robe-panel',()=>new THREE.CapsuleGeometry(.065,.36,3,8)),trim,side*.19,.91,.105);
      panel.scale.set(.8,1,.36); panel.rotation.z=side*-.035; panel.name='nft-firekeeper-robe-panel';
      const stitch=addBox(g,glow(shade(accentHex,.78)),[side*.105,.98,.197],[.012,.3,.012]);
      stitch.name='nft-firekeeper-robe-embroidery';
    }
    if (components.outfitStyle === 'robes' && /mantle|layer|ceremonial/i.test(traitValue(/outfit|armor/i))) {
      const mantle=add(geo('nft-firekeeper-mantle',()=>new THREE.TorusGeometry(.255,.045,6,20)),trim,0,1.405,-.005);
      mantle.rotation.x=Math.PI/2; mantle.name='nft-firekeeper-mantle';
    }
    if (components.accessoryStyle === 'relic') {
      const sigil=add(geo('nft-firekeeper-sigil',()=>new THREE.OctahedronGeometry(.052,0)),glow(accentHex),0,1.22,.22);
      sigil.name='nft-firekeeper-sigil';
    }
    if (components.headwearStyle === 'hood') {
      // Only tokens whose Head/Cowl trait calls for it receive the rear cowl silhouette.
      if (!sculptKind) {
      const cowl=addSphere(head,trim,[0,.055,-.085],[.245,.265,.15]);
      cowl.name='nft-firekeeper-cowl';
      }
    }
    if (components.flame.style !== 'default') {
      addSphere(g,glow(shade(components.flame.color || accentHex,.72)),[0,1.15,-.19],[.07,.12,.035]).name='nft-firekeeper-rear-ember';
    }
  }

  // Background belongs to the original 2D NFT composition, not wearable geometry.
  // Keep it intact in the artwork panel/portrait; never reinterpret it as a halo around the 3D body.
  const wingTrait=traitValue(/wing/i).toLowerCase();
  if (components.wingStyle !== 'none' && wingTrait && !/none|no wing/i.test(wingTrait)) for (const side of [-1,1]) {
    const wingColor = components.wingStyle === 'mechanical' ? '#aeb9c8' : traitColor(/wing|feather/i,'#d8d6d0');
    const wing=addCapsule(g,mat(wingColor),[side*.31,1.28,-.13],.075,.3,[1,1.5,.42]);
    wing.rotation.z=side*-.55;
    if (components.wingStyle === 'mechanical') for (let plate=0; plate<3; plate++) {
      const feather=addBox(g,metal,[side*(.31+.055*plate),1.34-.075*plate,-.085],[.09,.025,.025]);
      feather.rotation.z=side*-.55;
    }
  }
  const weaponTrait=traitValue(/weapon|held item|gear/i).toLowerCase();
  if (weaponTrait && !/none|empty|no weapon|nothing/i.test(weaponTrait)) {
    const weaponMat=mat(/gold|legendary/i.test(weaponTrait)?'#d6ad45':'#353942',.48,.4);
    if (components.weaponStyle === 'explosive') {
      // A short red dynamite/TNT stick is more legible than a featureless rectangular charge.
      const charge=add(geo('nft-held-tnt',()=>new THREE.CylinderGeometry(.043,.043,.22,12)),mat('#b52c2b',.58,.06),.31,1.045,-.13,g);
      charge.name='nft-held-tnt';
      for(const y of [1.0,1.09]) {
        const band=add(geo('nft-tnt-paper-band',()=>new THREE.TorusGeometry(.043,.004,5,12)),mat('#e0d4b6'),.31,y,-.13,g);
        band.rotation.x=Math.PI/2;
        band.name='nft-tnt-paper-band';
      }
      addBox(g,mat('#e7d7b4'),[.31,1.045,-.085],[.066,.038,.009]).name='nft-tnt-label';
      addBox(g,mat('#292b30'),[.31,1.045,-.074],[.038,.009,.004]).name='nft-tnt-label-mark';
      const fuse=addCapsule(g,mat('#c5a36d'),[.31,1.167,-.13],.009,.052,[1,1,1]); fuse.rotation.z=-.25; fuse.name='nft-tnt-fuse';
      const sparkCore=addSphere(g,glow('#fff0a1'),[.31,1.2,-.13],[.009,.009,.009]); sparkCore.name='nft-tnt-spark-core';
      addSphere(g,glow('#ff7b24'),[.31,1.2,-.13],[.02,.02,.02]).name='nft-tnt-spark';
      for(let i=0;i<4;i++) {
        const a=i*Math.PI/2;
        const ember=addSphere(g,glow('#ffb34d'),[.31+Math.cos(a)*.027,1.2+Math.sin(a)*.027,-.13],[.004,.004,.004]);
        ember.name='nft-tnt-ember';
      }
    } else if (components.weaponStyle === 'blade' || /sword|blade|katana|knife/i.test(weaponTrait)) {
      const blade=addBox(g,metal,[.31,1.05,-.13],[.035,.48,.025]); blade.rotation.z=-.12;
      addBox(g,weaponMat,[.31,.8,-.13],[.12,.035,.04]);
    } else if (components.weaponStyle === 'melee') {
      const staff=addCapsule(g,weaponMat,[.31,1.08,-.13],.022,.43,[1,1,1]); staff.rotation.z=-.16;
      addSphere(g,glow(accentHex),[.31,1.32,-.13],[.055,.055,.055]);
    } else if (components.weaponStyle === 'firearm') {
      const gun=addCapsule(g,weaponMat,[.31,1.1,-.13],.035,.34,[.8,1,.8]); gun.rotation.z=-.25;
    } else if (components.weaponStyle === 'custom') {
      addDiagnosticMarker(g,'weapon',[.31,1.08,-.13],[.09,.14,.06]);
    }
  }

  // Keep original art as a reference portrait, not a billboard covering the reconstructed body.
  // The torso tabard is opt-in for QA only; the in-game avatar should be judged on its own geometry.
  const directArtwork = String(opts.artworkUrl || n?.image || n?.img || '').trim();
  const url = /^https?:\/\//i.test(directArtwork) ? directArtwork : (opts.srv ? nftImg(opts.srv,n) : '');
  if(url&&opts.panel===true) {
    // A thin curved backing follows the torso instead of presenting the NFT like a rigid
    // cardboard sign. The source artwork remains complete and aspect-fitted on the curved surface.
    const artFrame=addBox(g,mat('#171a20',.62,.12),[0,1.24,.205],[.57,.73,.008]);
    artFrame.name='nft-artwork-frame';
    const frameTrim=mat('#6e7885',.58,.22);
    addBox(g,frameTrim,[0,1.61,.211],[.57,.009,.009]).name='nft-artwork-frame-top';
    addBox(g,frameTrim,[0,.87,.211],[.57,.009,.009]).name='nft-artwork-frame-bottom';
    const artTexture=tex(url);
    const artMaterial=new THREE.MeshBasicMaterial({map:artTexture,transparent:true,side:THREE.DoubleSide,depthWrite:false,toneMapped:false});
    const artPanel=add(geo('nft-artwork-curved-panel',()=>{
      const geometry=new THREE.BufferGeometry();
      const positions=[],uvs=[],indices=[];
      const cols=20,rows=2;
      for(let y=0;y<=rows;y++) for(let x=0;x<=cols;x++){
        const u=x/cols, v=y/rows, px=u-.5;
        positions.push(px, v-.5, .055*(1-Math.pow(px*2,2)));
        uvs.push(u,v);
      }
      for(let y=0;y<rows;y++) for(let x=0;x<cols;x++){
        const a=y*(cols+1)+x,b=a+1,c=a+cols+1,d=c+1;
        indices.push(a,b,c,b,d,c);
      }
      geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
      geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));
      geometry.setIndex(indices); geometry.computeVertexNormals(); return geometry;
    }),artMaterial,0,1.24,.216);
    artPanel.name='nft-artwork-panel'; artPanel.castShadow=false; artPanel.receiveShadow=false; artPanel.renderOrder=2;
    artPanel.scale.set(.54,.69,1);
    g.userData.artPanel=artPanel; g.userData.artTexture=artTexture;
    g.userData.artworkIdentity={mode:'framed-full-composition',source:url,aspectFit:'contain',cropped:false};
  }
  if(url&&opts.card) {
    const sp=new THREE.Sprite(new THREE.SpriteMaterial({map:tex(url),depthWrite:false})); sp.scale.set(.62,.62,1); sp.position.set(0,2.55,0); g.add(sp); g.userData.card=sp;
    const fr=new THREE.Sprite(new THREE.SpriteMaterial({color:accentHex,depthWrite:false})); fr.scale.set(.7,.7,1); fr.position.set(0,2.55,-.01); fr.renderOrder=-1; g.add(fr); g.userData.frame=fr;
  }
  g.userData.legs=legs; g.userData.arms=arms; g.userData.head=head; g.userData.nftId=n?.id;
  g.userData.nftTraits=originalTraitPairs.map(([type,value])=>[String(type),String(value)]);
  const unsupportedVisualTraits = [
    components.outfitStyle === 'custom' ? {slot:'outfit',value:traitValue(/^(?:outfit|armor)$/i)} : null,
    components.headwearStyle === 'custom' ? {slot:'headwear',value:traitValue(/^headwear$/i)} : null,
    components.hairStyle === 'custom' ? {slot:'hair style',value:traitValue(/^hair style$/i) || traitValue(/^headwear$/i)} : null,
    components.accessoryStyle === 'custom' ? {slot:'accessory',value:traitValue(/^accessory$/i)} : null,
    components.weaponStyle === 'custom' ? {slot:'weapon',value:traitValue(/^weapon$/i)} : null,
    components.wingStyle === 'custom' ? {slot:'wing',value:traitValue(/^wing$/i)} : null,
    components.tailStyle === 'custom' ? {slot:'tail',value:traitValue(/^tail$/i)} : null,
    components.patternStyle === 'custom' ? {slot:'body pattern',value:traitValue(/body pattern/i) || traitValue(/outfit|armor/i)} : null,
    components.bodyEffect === 'custom' ? {slot:'body effect',value:traitValue(/^body effect$/i)} : null,
    components.expression === 'custom' ? {slot:'expression',value:traitValue(/^expression$/i)} : null,
    components.hasMarkings && !/scar|freckle|spot|paint|tattoo|war paint/i.test(components.markings) ? {slot:'markings',value:components.markings} : null,
    components.eyeAppearance && !/surprised|wide|open|flame|burn|melt|glow|neon|angry|sleep|closed/i.test(components.eyeAppearance) ? {slot:'eye appearance',value:components.eyeAppearance} : null
  ].filter(item => item && item.value);
  // Every source trait gets a clear disposition: 3D, artwork-only, or flagged for review.
  const geometryNeeded = new Set(unsupportedVisualTraits.map(item => String(item.slot || '').toLowerCase()));
  const unsupportedStyleSlots = [
    components.outfitStyle === 'custom' ? 'outfit' : null,
    components.headwearStyle === 'custom' ? 'headwear' : null,
    components.hairStyle === 'custom' ? 'hair style' : null,
    components.accessoryStyle === 'custom' ? 'accessory' : null,
    components.weaponStyle === 'custom' ? 'weapon' : null,
    components.wingStyle === 'custom' ? 'wing' : null,
    components.tailStyle === 'custom' ? 'tail' : null,
    components.patternStyle === 'custom' ? 'body pattern' : null,
    components.bodyEffect === 'custom' ? 'body effect' : null,
    components.expression === 'custom' ? 'expression' : null,
    components.hasMarkings && !/scar|freckle|spot|paint|tattoo|war paint/i.test(components.markings) ? 'markings' : null,
    components.eyeAppearance && !/surprised|wide|open|flame|burn|melt|glow|neon|angry|sleep|closed/i.test(components.eyeAppearance) ? 'eye appearance' : null
  ].filter(Boolean);
  for (const slot of unsupportedStyleSlots) geometryNeeded.add(slot);
  const renderableSlots = new Set([
    'eye color','eye appearance','eye wear','body effect','accessory','outfit','headwear','weapon',
    'fur color','hair style','hair color','skin color','armor','mask','expression','facial hair',
    'markings','body pattern','horns','wing','flame','tail','nose'
  ]);
  const traitCoverage = profile.rawTraits.map(([rawType, value], index) => {
    const slot = String(profile.renderTraits[index]?.[0] || rawType).toLowerCase();
    let status = 'visualized';
    let fidelityLevel = 'procedural-approximation';
    let reason = 'Recognized by the current procedural renderer; not yet approved as a faithful visual match';
    if (slot === 'background' || /background|backdrop|scene/i.test(rawType)) {
      status = 'artwork-only';
      fidelityLevel = 'not-3d';
      reason = 'Preserved in original artwork; intentionally not converted into wearable geometry';
    } else if (slot === 'identity') {
      status = 'collection-identity';
      fidelityLevel = 'collection-selection';
      reason = 'Selects the collection recipe; does not prove this token likeness';
    } else if (geometryNeeded.has(slot) || !renderableSlots.has(slot)) {
      status = 'needs-dedicated-visual';
      fidelityLevel = 'unsupported';
      reason = geometryNeeded.has(slot) ? 'Current renderer lacks a faithful model for this value' : 'Trait type has no explicit renderer mapping yet';
    } else if (/body type|body shape|body build|physique|stature|face shape/i.test(rawType)) {
      reason = 'Recognized anatomy input; resulting proportions remain a procedural approximation pending reference review';
    }
    return { rawType, slot, value, status, fidelityLevel, reason, visuallyApproved: false };
  });
  g.userData.nftAvatarProfile={collectionKey:profile.collectionKey,collectionName:profile.collectionName,archetype:profile.archetype,identitySeed:profile.identitySeed,hasCollectionAdapter:profile.hasCollectionAdapter,components,reconstruction,unsupportedVisualTraits};
  g.userData.nftAvatarProfile.traitCoverage = traitCoverage;
  // No trait mapping or passing unit test can certify likeness without human reference-art review.
  g.userData.nftAvatarProfile.visualApproval = 'not-reviewed';
  g.userData.nftAvatarProfile.visualApprovalRequired = true;
  g.userData.nftMedia={animation:n?.animation||'',video:n?.video||'',audio:n?.audio||'',model3d:n?.model3d||'',artwork:n?.artwork||''};
  g.userData.anim=(t,moving,armsUp)=>{
    // Fit the real artwork without cropping once its remote image has decoded.
    const panel=g.userData.artPanel, image=g.userData.artTexture?.image;
    if(panel&&image&&!panel.userData.artFitDone) {
      const iw=Number(image.naturalWidth||image.videoWidth||image.width)||0;
      const ih=Number(image.naturalHeight||image.videoHeight||image.height)||0;
      if(iw>0&&ih>0) {
        const fit=Math.min(.54/iw,.69/ih);
        panel.scale.set(iw*fit,ih*fit,1); panel.userData.artFitDone=true;
      }
    }
    const sw=moving?Math.sin(t*9)*.62:Math.sin(t*2)*.025;
    legs[0].rotation.x=sw; legs[1].rotation.x=-sw;
    legs.forEach((hip)=>{if(hip.userData.knee)hip.userData.knee.rotation.x=Math.max(0,Math.cos(t*9))*.55*(moving?1:0)});
    arms.forEach((arm,i)=>{arm.rotation.x=armsUp?-1.2:(i===0?-sw*.72:sw*.72);if(arm.userData.elbow)arm.userData.elbow.rotation.x=armsUp?-.45:.12});
    head.rotation.y=Math.sin(t*.65)*.04;
    head.children.forEach(o=>{if(o.userData.flame)o.scale.y=(o.userData.flameBase||1)*(.8+Math.sin(t*13+o.position.x*17)*.22)});
    if(g.userData.card)g.userData.card.position.y=g.userData.frame.position.y=2.55+Math.sin(t*2)*.045;
  };
  g.traverse(o=>{if(o.isMesh){o.frustumCulled=true;o.userData.nftAvatarPart=true}});
  // Collapse ~60-115 part meshes into a few skinned meshes (rig groups stay animated); opts.bake=false keeps raw parts for QA.
  g.userData.artPalette=artPal;
  if(opts.bake!==false){try{g.userData.bake=bakeAvatar(g,{style:'nft',lite,palette:artPal})}catch(e){g.userData.bake={error:String(e&&e.message||e)}}}
  return g;
}
export function disposeNftChar(g) {
  // Most geometries, materials and NFT textures are intentionally shared/cached. Do not dispose them per avatar.
  if(!g)return;
  disposeBaked(g);
  g.traverse(o=>{if(o.isSprite||(o.isMesh&&o.material?.map))o.material.dispose()});
  g.removeFromParent();
}