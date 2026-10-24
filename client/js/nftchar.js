// BURN City NFT avatars: smoother, articulated characters driven by verified RACC / Firekeepers / 589 traits.
// The NFT artwork remains the visual ground truth: a full-composition chest tabard plus optional floating peer card.
// Typed metadata adds a best-effort 3D interpretation. Geometry/materials are cached for phone performance.
import * as THREE from 'three';
import { resolveNftAvatarProfile } from './nft-avatar-adapters.js';
import { resolveNftAvatarComponents } from './nft-avatar-components.js';
import { resolveNftAvatarReconstruction } from './nft-avatar-reconstruction.js';
const G = new Map(), TX = new Map(), MT = new Map();
const geo = (k, f) => G.get(k) || (G.set(k, f()), G.get(k));
const mat = (c, r = .72, m = .05, e = 0) => {
  const color = typeof c === 'number' ? '#' + c.toString(16).padStart(6, '0') : String(c || '#888');
  const k = [color, r, m, e].join('|');
  if (!MT.has(k)) MT.set(k, new THREE.MeshStandardMaterial({ color, roughness: r, metalness: m, emissive: e || 0 }));
  return MT.get(k);
};
const glow = c => mat(c, .36, .12, c);
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
  const pal = n?.pal || {}, key = n?.key || '589';
  const profile = resolveNftAvatarProfile(n);
  const components = resolveNftAvatarComponents(profile);
  const reconstruction = resolveNftAvatarReconstruction(profile);
  const originalTraitPairs = profile.rawTraits;
  const traitPairs = profile.renderTraits;
  const traitText = traitPairs.map(([type, value]) => String(type) + ' ' + String(value));
  const tr = [...traitText, ...(Array.isArray(n?.t) ? n.t : [])].map(v => String(v).toLowerCase());
  const traitValue = re => String(traitPairs.find(([type]) => re.test(String(type)))?.[1] || '');
  const traitColor = (re, fallback) => {
    const v = traitValue(re).toLowerCase().trim();
    if (/^#[0-9a-f]{6}$/i.test(v)) return v;
    const palette = [['rainbow','#a86bff'],['gold','#d6ad45'],['silver','#b9c4cf'],['black','#202126'],['white','#e6e4df'],
      ['gray','#858a91'],['grey','#858a91'],['red','#b72d32'],['orange','#e87927'],['yellow','#e0c34a'],['green','#43845a'],
      ['blue','#426db0'],['purple','#7952a1'],['pink','#d879a8'],['brown','#78513c'],['tan','#bd9a73'],['cyan','#4bbcc4'],
      ['teal','#328f8a'],['cream','#e4d4b5']];
    const found = palette.find(([word]) => v.includes(word));
    return found ? found[1] : fallback;
  };
  const g = new THREE.Group(); g.name = 'burn-city-nft-avatar';
  const add = (geometry, material, x=0, y=0, z=0, parent=g) => {
    const mesh = new THREE.Mesh(geometry, material); mesh.position.set(x,y,z); mesh.castShadow = true; mesh.receiveShadow = true; parent.add(mesh); return mesh;
  };
  const bodyHex = traitColor(/clothes|outfit|shirt|top|body|armor|jacket|robe/i, color(pal.body, '#424957'));
  const faceHex = key === 'racc' ? traitColor(/fur color|fur|skin|face/i, '#858a91') : traitColor(/skin tone|skin color|skin$|face$/i, color(pal.face, '#c9a27e'));
  const hairHex = traitColor(/hair color|hair$/i, has(tr,/white hair|silver hair/)?'#bfc3ca':has(tr,/red hair/)?'#7b2c24':has(tr,/blond|blonde/)?'#c8a05b':has(tr,/blue hair/)?'#344f9a':color(pal.top,'#201c20'));
  const topHex = traitColor(/outerwear|coat|jacket|helmet|headwear/i, color(pal.top, bodyHex));
  const accentHex = profile.collectionKey === 'fk' ? components.flame.color : traitColor(/accent|accessory|flame|fire|aura/i, color(pal.acc, '#ff7a1a'));
  const eyeMood=traitValue(/eye appearance/i).toLowerCase();
  const eyeHex = traitColor(/eye color|iris color|eyes?$|iris$/i, /flame|burn|melt|glow|neon/i.test(eyeMood)||has(tr,/flaming eyes|burn eye|melt|glowing eyes/)?accentHex:'#343039');
  const skin = mat(faceHex, .82, .01), cloth = mat(bodyHex, .82, .02), darkCloth = mat(shade(bodyHex,.52),.86,.04);
  const trim = mat(topHex,.6,.12), accent = glow(accentHex), metal = mat('#a8b1ba',.34,.68), bootMat = mat('#191b20',.78,.16);
  const lite = !!opts.lite;
  const S = geo(lite ? 'unit-sphere-lite' : 'unit-sphere', () => new THREE.SphereGeometry(1, lite ? 10 : 16, lite ? 8 : 12));
  const addSphere = (parent, material, pos, scale, geometry=S) => { const m=add(geometry,material,pos[0],pos[1],pos[2],parent); m.scale.set(scale[0],scale[1],scale[2]); return m; };
  const addCapsule = (parent, material, pos, radius, length, scale=[1,1,1]) => { const m=add(capsule(radius,length,lite?8:10,lite?3:4),material,pos[0],pos[1],pos[2],parent); m.scale.set(...scale); return m; };
  const addBox = (parent, material, pos, size) => add(box(...size),material,pos[0],pos[1],pos[2],parent);

  // Natural silhouette: rounded torso, shoulder/hip transitions, articulated forearms and shins (not block limbs).
  addCapsule(g,darkCloth,[0,.82,0],.19,.14,[1.03,.72,.76]);
  const torso = addCapsule(g,cloth,[0,1.17,0],.245,.39,[1.16,1.04,.76]);
  torso.name = 'avatar-torso';
  // Stable, subtle silhouette variation gives each token an individual baseline when metadata has no body-build trait.
  const silhouetteVariants = [.94,.97,1,1.03,1.06];
  const silhouette = silhouetteVariants[profile.identitySeed % silhouetteVariants.length];
  const hasBodyShape = profile.rawTraits.some(([type]) => /body type|body shape|body build|physique|stature/i.test(type));
  if (!hasBodyShape) { torso.scale.x *= silhouette; torso.scale.y *= 2 - silhouette; }
  torso.scale.x *= reconstruction.torsoWidth;
  torso.scale.y *= reconstruction.torsoHeight;
  torso.name = 'avatar-torso-' + reconstruction.signature;
  addSphere(g,trim,[-.205,1.43,0],[.18,.15,.75]);
  addSphere(g,trim,[.205,1.43,0],[.18,.15,.75]);
  add(geo('neck',()=>new THREE.CylinderGeometry(.075,.09,.15,12)),skin,0,1.55,0);
  // Clothing details read as stitching/zipper/pockets instead of square torso plates.
  addBox(g,metal,[0,1.18,.188],[.018,.37,.012]);
  for (const s of [-1,1]) {
    addBox(g,trim,[s*.105,1.03,.188],[.105,.105,.018]);
    addBox(g,darkCloth,[s*.105,1.03,.2],[.077,.073,.012]);
  }
  const belt = add(cylinder(.235,.235,.065,16),accent,0,.88,0); belt.scale.set(1,.55,.77);
  addBox(g,metal,[0,.88,.184],[.09,.052,.025]);
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
  // Surface patterns are driven by actual metadata and remain visible around the artwork tabard.
  const patternColor=traitColor(/pattern|marking|camo|stripe|spot|outfit/i,'#b8b3a7');
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

  if (components.bodyEffect !== 'none') {
    const bodyFlameColor=components.flame.color || accentHex;
    const flameCount=components.bodyEffect==='flame-on'?6:components.bodyEffect==='heating-up'?3:2;
    for(let i=0;i<flameCount;i++) {
      const side=i%2?1:-1, y=components.bodyEffect==='flame-on'?1.02+(i%3)*.16:1.1+(i%2)*.12;
      const z=i%3===0?.18:.035, size=components.bodyEffect==='flame-on'?.052:components.bodyEffect==='heating-up'?.038:.025;
      const flame=add(geo('nft-body-flame:'+size,()=>new THREE.ConeGeometry(size,size*2.7,6)),glow(bodyFlameColor),side*(.18+(i%3)*.035),y,z);
      flame.rotation.z=side*-.16; flame.name='nft-body-effect-flame';
    }
  }

  const legs = [-1,1].map(s => {
    const hip = new THREE.Group(); hip.position.set(s*reconstruction.hipSpan,.84,0); hip.scale.y = reconstruction.legScale; g.add(hip);
    addSphere(hip,darkCloth,[0,-.04,0],[.135,.16,.13]);
    addCapsule(hip,cloth,[0,-.245,0],.09,.31,[1.08,1,.96]);
    const knee = new THREE.Group(); knee.position.set(0,-.43,0); hip.add(knee);
    addSphere(knee,trim,[0,0,.015],[.094,.092,.094]);
    addCapsule(knee,darkCloth,[0,-.205,0],.075,.25,[1.02,1,.95]);
    addCapsule(knee,bootMat,[0,-.385,.045],.075,.08,[1.08,.62,1.5]);
    addSphere(knee,bootMat,[0,-.415,.11],[.085,.045,.105]);
    hip.userData.knee = knee; return hip;
  });
  const arms = [-1,1].map(s => {
    const shoulder = new THREE.Group(); shoulder.position.set(s*reconstruction.shoulderSpan,1.42,0); shoulder.scale.y = reconstruction.armScale; g.add(shoulder);
    addSphere(shoulder,trim,[0,0,0],[.105,.115,.11]);
    addCapsule(shoulder,cloth,[0,-.17,0],.072,.22,[1,1,1]);
    const elbow = new THREE.Group(); elbow.position.set(0,-.3,0); shoulder.add(elbow);
    addSphere(elbow,darkCloth,[0,0,0],[.074,.072,.075]);
    addCapsule(elbow,cloth,[0,-.135,0],.059,.17,[1,1,1]);
    addSphere(elbow,skin,[0,-.255,.01],[.061,.068,.062]);
    addSphere(elbow,skin,[0,-.285,.04],[.048,.045,.05]);
    shoulder.userData.elbow=elbow; return shoulder;
  });

  const head = new THREE.Group(); head.position.set(0,reconstruction.headY,0); head.name='nft-head-' + reconstruction.signature; g.add(head);
  const hasFaceShape = profile.rawTraits.some(([type]) => /head shape|face shape|skull shape/i.test(type));
  if (!hasFaceShape) head.scale.x = silhouetteVariants[(profile.identitySeed >>> 3) % silhouetteVariants.length];
  head.scale.multiply(new THREE.Vector3(...reconstruction.headScale));
  if (key === 'racc') {
    // RACC gets an unmistakable rounded raccoon skull, eye mask, muzzle, ears and ringed tail.
    addSphere(head,skin,[0,.02,0],[.235,.255,.22]);
    addSphere(head,mat(traitColor(/mask/i,has(tr,/red mask/)?'#c4161c':'#282a30')),[0,.005,.165],[.207,.105,.07]);
    for (const s of [-1,1]) {
      // Layered ears: rounded outer fur, a tapered silhouette, and a contrasting inner ear.
      addSphere(head,mat('#686d75'),[s*.19,.205,-.005],[.085,.095,.065]);
      const earTip=add(geo('nft-racc-ear-tip',()=>new THREE.ConeGeometry(.068,.19,8)),mat('#686d75'),s*.19,.285,-.004,head);
      earTip.rotation.z=-s*.22; earTip.name='nft-racc-ear-tip';
      addSphere(head,mat(traitColor(/fur color|fur/i,'#b77e82')),[s*.19,.215,.052],[.043,.058,.018]).name='nft-racc-inner-ear';
      // Pale cheek ruffs widen the unmistakable raccoon face silhouette.
      const cheek=addSphere(head,mat(shade(faceHex,1.22)),[s*.145,-.065,.155],[.082,.072,.047]);
      cheek.name='nft-racc-cheek-ruff';
      addSphere(head,mat('#c9cdd0'),[s*.085,.02,.22],[.055,.05,.025]);
      addSphere(head,components.eyeStyle === 'glowing' ? glow(eyeHex) : mat(eyeHex),[s*.085,.02,.242],[.022,.025,.012]);
      addSphere(head,mat('#f0e4d0'),[s*.055,-.09,.19],[.075,.052,.052]);
    }
    addSphere(head,mat('#bfc2c5'),[0,-.1,.205],[.11,.075,.07]);
    addSphere(head,mat('#17181b'),[0,-.075,.267],[.036,.027,.022]);
    const tail = new THREE.Group(); tail.position.set(0,.77,-.17); tail.rotation.x=-.72; g.add(tail);
    for(let i=0;i<6;i++) {
      const segmentColor = components.tailStyle === 'dark-tip' && i > 3 ? '#202126'
        : components.tailStyle === 'light-tip' && i > 3 ? '#e0ded8'
        : components.tailStyle === 'ringed' ? (i%2 ? '#292b30' : '#969ba2')
        : (i%2 ? shade(faceHex,.72) : faceHex);
      addSphere(tail,mat(segmentColor),[0,0,-.12*i],[.095-i*.008,.09-i*.007,.11]);
    }
  } else {
    addSphere(head,skin,[0,.015,0],[.19,.235,.18]);
    // Facial planes, eyes, brows, nose and ears create a less toy-like human face.
    const surprisedEyes=/surprised|wide|open/i.test(components.eyeAppearance);
    for (const s of [-1,1]) {
      addSphere(head,skin,[s*.19,.01,0],[.04,.065,.045]);
      addSphere(head,mat('#f0e7d9'),[s*.067,.045,.158],surprisedEyes?[.038,.034,.018]:[.035,.025,.018]);
      addSphere(head,components.eyeStyle === 'glowing' ? glow(eyeHex) : mat(eyeHex),[s*.067,.043,.175],surprisedEyes?[.018,.023,.01]:[.016,.018,.01]);
      addCapsule(head,mat(shade(faceHex,.65)),[s*.067,.092,.155],.012,.035,[1,.6,.6]).rotation.z=s*.15;
    }
    addSphere(head,mat(shade(faceHex,.76)),[0,-.015,.172],[.025,.04,.03]);
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
    const hairColor = hairHex;
    if (components.hairStyle !== 'bald' && !has(tr,/bald|shaved|no hair/)) {
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
      if (/mustache|moustache/.test(components.facialHair.toLowerCase())) {
        for(const side of [-1,1]) addSphere(head,mat(beardColor),[side*.045,-.055,.176],[.05,.018,.018]).name='nft-moustache';
      } else if (/goatee|chin/.test(components.facialHair.toLowerCase())) {
        addSphere(head,mat(beardColor),[0,-.105,.153],[.055,.045,.035]).name='nft-goatee';
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
  } else if (components.headwearStyle === 'rock') {
    const rock=addSphere(head,mat(traitColor(/headwear/i,'#777a80')),[0,.16,-.01],[.22,.17,.2]); rock.name='nft-rock-headwear';
  } else if (components.headwearStyle === 'helmet' || has(tr,/helmet/)) {
    addSphere(head,metal,[0,.17,-.015],[.225,.105,.205]);
    addBox(head,accent,[0,.11,.17],[.24,.035,.035]);
  } else if (components.headwearStyle === 'crown' || has(tr,/crown/)) {
    add(geo('crown-band',()=>new THREE.TorusGeometry(.15,.025,6,20)),glow('#ffcc33'),0,.21,0,head);
    for(const s of [-1,0,1]) add(geo('crown-point',()=>new THREE.ConeGeometry(.035,.13,7)),glow(traitColor(/crown|headwear/i,'#ffcc33')),s*.105,.3,0,head);
  } else if (components.headwearStyle === 'hood' || has(tr,/hood/)) {
    const hood=addSphere(head,mat(shade(bodyHex,.78)),[0,.045,-.035],[.245,.27,.21]); hood.renderOrder=0;
  } else if (['hat','beanie','band'].includes(components.headwearStyle) || has(tr,/hat|cap|fitted|beanie|visor|sweatband|headband/)) {
    addSphere(head,hatColor,[0,.15,-.01],[.22,.105,.2]);
    if (!has(tr,/beanie/)) addBox(head,hatColor,[0,.105,.18],[.25,.025,.12]);
  } else if (components.headwearStyle === 'custom') {
    // Unknown named headwear still gets a bounded, legible silhouette instead of disappearing.
    const crown=addSphere(head,hatColor,[0,.16,-.015],[.205,.095,.18]);
    crown.name='nft-custom-headwear';
    addBox(head,hatColor,[0,.105,.16],[.235,.022,.085]).name='nft-custom-headwear-brim';
    const crest=add(geo('nft-custom-headwear-crest',()=>new THREE.ConeGeometry(.035,.09,6)),glow(accentHex),0,.245,-.005,head);
    crest.name='nft-custom-headwear-crest';
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
  } else if(has(tr,/shade|sunglass|frames|goggle|eyewear/)) {
    addBox(head,mat(has(tr,/gold/)?'#c9a34a':'#14161b',.32,.5),[0,.045,.183],[.34,.052,.025]);
    addBox(head,metal,[0,.045,.2],[.055,.018,.018]);
  }
  if(has(tr,/flame|fire|on fire|flaming|ember/)||key==='fk') {
    for(const [x,h] of [[-.12,.24],[-.04,.32],[.055,.27],[.13,.2]]) {
      const flame=add(geo('flame',()=>new THREE.ConeGeometry(.055,.25,7)),glow(accentHex),x,.24+h*.25,-.04,head);
      flame.scale.y=h/.25; flame.userData.flame=1;
    }
    addSphere(head,glow(shade(accentHex,.6)),[0,-.01,.14],[.2,.055,.03]);
  }
  if(components.accessoryStyle === 'chain' || has(tr,/chain|medallion|necklace|gold pick|grill/)) {
    // Wearable jewelry sits just in front of the full-artwork tabard, never behind it.
    // This preserves the complete NFT composition while keeping a token's chain legible in-world.
    const chain=add(geo('necklace',()=>new THREE.TorusGeometry(.15,.018,6,24)),glow(traitColor(/chain|accessory/i,'#e8b923')),0,1.49,.255);
    chain.rotation.x=1.25;
    chain.name='nft-chain-base';
    chain.renderOrder=3;
    if(key==='589') {
      const linkMat=glow(traitColor(/chain|accessory/i,'#e8b923'));
      for(let i=0;i<10;i++) {
        const angle=Math.PI*.12+(Math.PI*.76*i/9);
        const link=add(geo('nft-protocol-chain-link',()=>new THREE.TorusGeometry(.018,.005,4,8)),linkMat,Math.cos(angle)*.16,1.47-Math.sin(angle)*.075,.268);
        link.rotation.x=1.1; link.rotation.z=angle-Math.PI/2; link.name='nft-protocol-chain-link'; link.renderOrder=3;
      }
      const pendant=add(geo('nft-protocol-chain-pendant',()=>new THREE.OctahedronGeometry(.045,0)),glow(accentHex),0,1.365,.285);
      pendant.name='nft-protocol-chain-pendant'; pendant.renderOrder=3;
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
    // Preserve the existence of unfamiliar collection accessories as visible, deterministic geometry.
    const charm=add(geo('nft-custom-accessory',()=>new THREE.DodecahedronGeometry(.055,0)),glow(traitColor(/accessory|jewel|chain/i,accentHex)),.205,1.24,.235);
    charm.name='nft-custom-accessory';
    const mount=add(geo('nft-custom-accessory-mount',()=>new THREE.TorusGeometry(.067,.009,5,14)),metal,.205,1.24,.226);
    mount.name='nft-custom-accessory-mount';
  }
  if(has(tr,/armor|fur|collar|cape/)) {
    for(const s of [-1,1]) addSphere(g,has(tr,/fur/)?mat('#b8a68a'):trim,[s*.28,1.43,-.005],[.13,.1,.13]);
    if(has(tr,/cape/)) { const cape=addBox(g,darkCloth,[0,1.14,-.18],[.35,.62,.06]); cape.rotation.x=-.12; }
  }
  if(key==='589') {
    // Protocol silhouette: wider shoulders, a technical chest plate and an unmistakable burn insignia.
    addBox(g,accent,[0,.88,.22],[.28,.045,.035]).name='nft-protocol-belt-insignia';
    addBox(g,metal,[0,.88,.242],[.065,.055,.015]);
    addBox(g,trim,[-.12,1.31,.19],[.035,.2,.018]).name='nft-protocol-strap';
    addBox(g,trim,[.12,1.31,.19],[.035,.2,.018]).name='nft-protocol-strap';
    // Keep the Protocol insignia above the artwork tabard instead of hiding it behind the image plane.
    const emblem=add(geo('nft-protocol-emblem',()=>new THREE.TorusGeometry(.055,.012,5,16)),glow(accentHex),0,1.655,.245);
    emblem.name='nft-protocol-emblem'; emblem.renderOrder=3;
    if(components.outfitStyle==='streetwear') {
      // Put the small shirt mark below the tabard frame, where the original artwork cannot occlude it.
      addBox(g,mat('#15171c'),[0,.775,.252],[.12,.055,.012]).name='nft-protocol-shirt-print';
      const shirtSigil=add(geo('nft-protocol-shirt-sigil',()=>new THREE.ConeGeometry(.022,.045,3)),glow(accentHex),0,.775,.266);
      shirtSigil.name='nft-protocol-shirt-sigil'; shirtSigil.renderOrder=3;
      // The artwork panel spans the torso center; edge stitching stays outside its frame.
      for(const side of [-1,1]) {
        const stitch=addBox(g,trim,[side*.292,1.19,.24],[.012,.16,.012]);
        stitch.name='nft-protocol-shirt-stitch';
        stitch.renderOrder=3;
      }
    }
  }

  if(key==='fk') {
    // Firekeepers have a collection-specific robe silhouette and ember mantle, even with sparse metadata.
    const hem=add(geo('nft-firekeeper-robe-hem',()=>new THREE.CylinderGeometry(.235,.34,.52,12)),darkCloth,0,.79,-.015);
    hem.name='nft-firekeeper-robe-hem';
    // Split outer panels create layered fabric rather than a single cylindrical robe.
    for (const side of [-1,1]) {
      const panel=add(geo('nft-firekeeper-robe-panel',()=>new THREE.CapsuleGeometry(.065,.36,3,8)),trim,side*.19,.91,.105);
      panel.scale.set(.8,1,.36); panel.rotation.z=side*-.035; panel.name='nft-firekeeper-robe-panel';
      const stitch=addBox(g,glow(shade(accentHex,.78)),[side*.105,.98,.197],[.012,.3,.012]);
      stitch.name='nft-firekeeper-robe-embroidery';
    }
    const mantle=add(geo('nft-firekeeper-mantle',()=>new THREE.TorusGeometry(.255,.045,6,20)),trim,0,1.405,-.005);
    mantle.rotation.x=Math.PI/2; mantle.name='nft-firekeeper-mantle';
    const sigil=add(geo('nft-firekeeper-sigil',()=>new THREE.OctahedronGeometry(.052,0)),glow(accentHex),0,1.22,.22);
    sigil.name='nft-firekeeper-sigil';
    // A rear cowl silhouette makes Firekeepers readable from profile; facial features stay unobscured.
    const cowl=addSphere(head,trim,[0,.055,-.085],[.245,.265,.15]);
    cowl.name='nft-firekeeper-cowl';
    addSphere(g,glow(shade(accentHex,.72)),[0,1.15,-.19],[.07,.12,.035]);
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
      const charge=addBox(g,mat('#a72b27',.62,.08),[.31,1.04,-.13],[.13,.16,.09]);
      charge.name='nft-held-tnt';
      addBox(g,mat('#d7c5a0'),[.31,1.04,-.08],[.09,.045,.012]).name='nft-tnt-label';
      const fuse=addCapsule(g,mat('#d8b76d'),[.31,1.145,-.13],.012,.055,[1,1,1]); fuse.rotation.z=-.25; fuse.name='nft-tnt-fuse';
      addSphere(g,glow('#ff8b2c'),[.31,1.18,-.13],[.018,.018,.018]).name='nft-tnt-spark';
    } else if (components.weaponStyle === 'blade' || /sword|blade|katana|knife/i.test(weaponTrait)) {
      const blade=addBox(g,metal,[.31,1.05,-.13],[.035,.48,.025]); blade.rotation.z=-.12;
      addBox(g,weaponMat,[.31,.8,-.13],[.12,.035,.04]);
    } else if (components.weaponStyle === 'melee') {
      const staff=addCapsule(g,weaponMat,[.31,1.08,-.13],.022,.43,[1,1,1]); staff.rotation.z=-.16;
      addSphere(g,glow(accentHex),[.31,1.32,-.13],[.055,.055,.055]);
    } else {
      const gun=addCapsule(g,weaponMat,[.31,1.1,-.13],.035,.34,[.8,1,.8]); gun.rotation.z=-.25;
    }
  }

  // The original NFT is the per-token visual source of truth. Give it a prominent, framed chest tabard
  // instead of a tiny badge; preserve the complete composition and its original aspect ratio (never crop).
  const url=opts.srv?nftImg(opts.srv,n):'';
  if(url&&opts.panel!==false) {
    const artFrame=addBox(g,mat('#15191f',.42,.34),[0,1.24,.207],[.57,.73,.026]);
    artFrame.name='nft-artwork-frame';
    addBox(g,metal,[0,1.61,.223],[.59,.018,.018]).name='nft-artwork-frame-top';
    addBox(g,metal,[0,.87,.223],[.59,.018,.018]).name='nft-artwork-frame-bottom';
    const artTexture=tex(url);
    const artMaterial=new THREE.MeshBasicMaterial({map:artTexture,transparent:true,side:THREE.DoubleSide,depthWrite:false,toneMapped:false});
    const artPanel=add(geo('nft-artwork-panel',()=>new THREE.PlaneGeometry(1,1)),artMaterial,0,1.24,.226);
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
  g.userData.nftAvatarProfile={collectionKey:profile.collectionKey,collectionName:profile.collectionName,archetype:profile.archetype,identitySeed:profile.identitySeed,hasCollectionAdapter:profile.hasCollectionAdapter,components,reconstruction};
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
    head.children.forEach(o=>{if(o.userData.flame)o.scale.y=.8+Math.sin(t*13+o.position.x*17)*.22});
    if(g.userData.card)g.userData.card.position.y=g.userData.frame.position.y=2.55+Math.sin(t*2)*.045;
  };
  g.traverse(o=>{if(o.isMesh){o.frustumCulled=true;o.userData.nftAvatarPart=true}});
  return g;
}
export function disposeNftChar(g) {
  // Most geometries, materials and NFT textures are intentionally shared/cached. Do not dispose them per avatar.
  if(!g)return;
  g.traverse(o=>{if(o.isSprite||(o.isMesh&&o.material?.map))o.material.dispose()});
  g.removeFromParent();
}
