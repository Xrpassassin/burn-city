// BURN City NFT avatars: smoother, articulated characters driven by verified RACC / Firekeepers / 589 traits.
// The NFT artwork remains the visual ground truth: a full-composition chest tabard plus optional floating peer card.
// Typed metadata adds a best-effort 3D interpretation. Geometry/materials are cached for phone performance.
import * as THREE from 'three';
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
  const traitPairs = (Array.isArray(n?.traits) ? n.traits : []).filter(a => Array.isArray(a) && a.length > 1).slice(0, 64);
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
  const hairHex = traitColor(/hair color|fur color|hair$/i, has(tr,/white hair|silver hair/)?'#bfc3ca':has(tr,/red hair/)?'#7b2c24':has(tr,/blond|blonde/)?'#c8a05b':has(tr,/blue hair/)?'#344f9a':'#201c20');
  const topHex = traitColor(/outerwear|coat|jacket|helmet|headwear/i, color(pal.top, bodyHex));
  const accentHex = traitColor(/accent|accessory|flame|fire|aura/i, color(pal.acc, '#ff7a1a'));
  const eyeHex = traitColor(/eye color|iris color|eyes?$|iris$/i, key==='589'||has(tr,/flaming eyes|burn eye|melt|glowing eyes/)?accentHex:'#343039');
  const backgroundHex = traitColor(/background|backdrop/i, color(pal.bg, shade(bodyHex, .8)));
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

  const legs = [-1,1].map(s => {
    const hip = new THREE.Group(); hip.position.set(s*.125,.84,0); g.add(hip);
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
    const shoulder = new THREE.Group(); shoulder.position.set(s*.32,1.42,0); g.add(shoulder);
    addSphere(shoulder,trim,[0,0,0],[.105,.115,.11]);
    addCapsule(shoulder,cloth,[0,-.17,0],.072,.22,[1,1,1]);
    const elbow = new THREE.Group(); elbow.position.set(0,-.3,0); shoulder.add(elbow);
    addSphere(elbow,darkCloth,[0,0,0],[.074,.072,.075]);
    addCapsule(elbow,cloth,[0,-.135,0],.059,.17,[1,1,1]);
    addSphere(elbow,skin,[0,-.255,.01],[.061,.068,.062]);
    addSphere(elbow,skin,[0,-.285,.04],[.048,.045,.05]);
    shoulder.userData.elbow=elbow; return shoulder;
  });

  const head = new THREE.Group(); head.position.set(0,1.77,0); head.name='nft-head'; g.add(head);
  if (key === 'racc') {
    // RACC gets an unmistakable rounded raccoon skull, eye mask, muzzle, ears and ringed tail.
    addSphere(head,skin,[0,.02,0],[.235,.255,.22]);
    addSphere(head,mat(traitColor(/mask/i,has(tr,/red mask/)?'#c4161c':'#282a30')),[0,.005,.165],[.207,.105,.07]);
    for (const s of [-1,1]) {
      addSphere(head,mat('#686d75'),[s*.19,.205,-.005],[.085,.095,.065]);
      addSphere(head,mat('#c9cdd0'),[s*.085,.02,.22],[.055,.05,.025]);
      addSphere(head,mat(eyeHex),[s*.085,.02,.242],[.022,.025,.012]);
      addSphere(head,mat('#f0e4d0'),[s*.055,-.09,.19],[.075,.052,.052]);
    }
    addSphere(head,mat('#bfc2c5'),[0,-.1,.205],[.11,.075,.07]);
    addSphere(head,mat('#17181b'),[0,-.075,.267],[.036,.027,.022]);
    const tail = new THREE.Group(); tail.position.set(0,.77,-.17); tail.rotation.x=-.72; g.add(tail);
    for(let i=0;i<6;i++) addSphere(tail,mat(i%2?'#292b30':'#969ba2'),[0,0,-.12*i],[.095-i*.008,.09-i*.007,.11]);
  } else {
    addSphere(head,skin,[0,.015,0],[.19,.235,.18]);
    // Facial planes, eyes, brows, nose and ears create a less toy-like human face.
    for (const s of [-1,1]) {
      addSphere(head,skin,[s*.19,.01,0],[.04,.065,.045]);
      addSphere(head,mat('#f0e7d9'),[s*.067,.045,.158],[.035,.025,.018]);
      addSphere(head,mat(eyeHex),[s*.067,.043,.175],[.016,.018,.01]);
      addCapsule(head,mat(shade(faceHex,.65)),[s*.067,.092,.155],.012,.035,[1,.6,.6]).rotation.z=s*.15;
    }
    addSphere(head,mat(shade(faceHex,.76)),[0,-.015,.172],[.025,.04,.03]);
    const mouthTrait = traitValue(/mouth|expression|emotion/i).toLowerCase();
    if (has(tr,/beard|goatee|mustache|moustache/)) addSphere(head,mat('#332821'),[0,-.095,.145],[.105,.075,.055]);
    if (/fang|teeth|snarl|open mouth|scream/.test(mouthTrait)) {
      addSphere(head,mat('#2a1517'),[0,-.105,.177],[.07,.035,.025]);
      for (const s of [-1,1]) add(geo('tooth',()=>new THREE.ConeGeometry(.012,.035,6)),mat('#f2e7ce'),s*.026,-.095,.199,head);
    } else if (/smile|grin|happy/.test(mouthTrait)) {
      add(geo('smile',()=>new THREE.TorusGeometry(.035,.008,5,14,Math.PI)),mat('#5a2c2b'),0,-.105,.176,head).rotation.z=Math.PI;
    }
    const hairColor = hairHex;
    if (!has(tr,/bald|shaved|no hair/)) {
      const hair=add(geo('hair-cap',()=>new THREE.SphereGeometry(1,16,10,0,Math.PI*2,0,Math.PI*.48)),mat(hairColor,.9,.01),0,.09,-.005,head);
      hair.scale.set(.202,.19,.19);
      if (has(tr,/dreads|braids/)) for(let i=0;i<5;i++) addCapsule(head,mat(hairColor),[-.15+i*.075,.0,-.06],.025,.14,[1,1,1]).rotation.z=-.2;
    }
  }

  // Trait-driven identity: headwear, eyewear, horns, fire, jewelry, fur/capes and armor accents.
  const hatColor = mat(topHex,.65,.12);
  if (has(tr,/helmet/)) {
    addSphere(head,metal,[0,.17,-.015],[.225,.105,.205]);
    addBox(head,accent,[0,.11,.17],[.24,.035,.035]);
  } else if (has(tr,/crown/)) {
    add(geo('crown-band',()=>new THREE.TorusGeometry(.15,.025,6,20)),glow('#ffcc33'),0,.21,0,head);
    for(const s of [-1,0,1]) add(geo('crown-point',()=>new THREE.ConeGeometry(.035,.13,7)),glow(traitColor(/crown|headwear/i,'#ffcc33')),s*.105,.3,0,head);
  } else if (has(tr,/hood/)) {
    const hood=addSphere(head,mat(shade(bodyHex,.78)),[0,.045,-.035],[.245,.27,.21]); hood.renderOrder=0;
  } else if (has(tr,/hat|cap|fitted|beanie|visor|sweatband|headband/)) {
    addSphere(head,hatColor,[0,.15,-.01],[.22,.105,.2]);
    if (!has(tr,/beanie/)) addBox(head,hatColor,[0,.105,.18],[.25,.025,.12]);
  }
  if(has(tr,/horn/)) for(const s of [-1,1]) { const h=add(geo('horn',()=>new THREE.ConeGeometry(.045,.22,8)),mat('#ded5c6'),s*.16,.24,-.01,head); h.rotation.z=-s*.55; }
  if(has(tr,/shade|sunglass|frames|goggle/)) {
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
  if(has(tr,/chain|medallion|necklace|gold pick|grill/)) {
    const chain=add(geo('necklace',()=>new THREE.TorusGeometry(.15,.018,6,24)),glow('#e8b923'),0,1.49,.025);
    chain.rotation.x=1.25;
  }
  if(has(tr,/armor|fur|collar|cape/)) {
    for(const s of [-1,1]) addSphere(g,has(tr,/fur/)?mat('#b8a68a'):trim,[s*.28,1.43,-.005],[.13,.1,.13]);
    if(has(tr,/cape/)) { const cape=addBox(g,darkCloth,[0,1.14,-.18],[.35,.62,.06]); cape.rotation.x=-.12; }
  }
  if(key==='589') {
    addBox(g,accent,[0,.88,.22],[.28,.045,.035]);
    addBox(g,metal,[0,.88,.242],[.065,.055,.015]);
  }
  if(key==='fk') {
    // Firekeepers keep a visible ember identity even when no literal flame trait exists.
    addSphere(g,glow(shade(accentHex,.72)),[0,1.15,-.19],[.07,.12,.035]);
  }

  // Keep background traits visible as a subtle 3D halo rather than silently dropping them.
  if (traitValue(/background|backdrop/i)) {
    const halo=add(geo('trait-background-halo',()=>new THREE.TorusGeometry(.43,.012,5,36)),glow(backgroundHex),0,1.22,-.255);
    halo.rotation.z=.05; halo.renderOrder=-1;
  }
  const wingTrait=traitValue(/wing/i).toLowerCase();
  if (wingTrait && !/none|no wing/i.test(wingTrait)) for (const side of [-1,1]) {
    const wing=addCapsule(g,mat(traitColor(/wing|feather/i,'#d8d6d0')),[side*.31,1.28,-.13],.075,.3,[1,1.5,.42]);
    wing.rotation.z=side*-.55;
  }
  const weaponTrait=traitValue(/weapon|held item|gear/i).toLowerCase();
  if (weaponTrait && !/none|empty|no weapon|nothing/i.test(weaponTrait)) {
    const weaponMat=mat(/gold|legendary/i.test(weaponTrait)?'#d6ad45':'#353942',.48,.4);
    if (/sword|blade|katana|knife/i.test(weaponTrait)) {
      const blade=addBox(g,metal,[.31,1.05,-.13],[.035,.48,.025]); blade.rotation.z=-.12;
      addBox(g,weaponMat,[.31,.8,-.13],[.12,.035,.04]);
    } else {
      const gun=addCapsule(g,weaponMat,[.31,1.1,-.13],.035,.34,[.8,1,.8]); gun.rotation.z=-.25;
    }
  }

  // Preserve the actual NFT composition on the walking avatar. Unlike a tiny circular crop, this image panel
  // uses contain-fit sizing once the image dimensions are available, so square, portrait and landscape art survive.
  const url=opts.srv?nftImg(opts.srv,n):'';
  if(url&&opts.panel!==false) {
    addBox(g,mat('#15191f',.45,.28),[0,1.18,.207],[.375,.49,.025]);
    const artTexture=tex(url);
    const artMaterial=new THREE.MeshBasicMaterial({map:artTexture,transparent:true,side:THREE.DoubleSide,depthWrite:false,toneMapped:false});
    const artPanel=add(geo('nft-artwork-panel',()=>new THREE.PlaneGeometry(1,1)),artMaterial,0,1.18,.224);
    artPanel.name='nft-artwork-panel'; artPanel.castShadow=false; artPanel.receiveShadow=false;
    artPanel.scale.set(.35,.46,1);
    g.userData.artPanel=artPanel; g.userData.artTexture=artTexture;
  }
  if(url&&opts.card) {
    const sp=new THREE.Sprite(new THREE.SpriteMaterial({map:tex(url),depthWrite:false})); sp.scale.set(.62,.62,1); sp.position.set(0,2.55,0); g.add(sp); g.userData.card=sp;
    const fr=new THREE.Sprite(new THREE.SpriteMaterial({color:accentHex,depthWrite:false})); fr.scale.set(.7,.7,1); fr.position.set(0,2.55,-.01); fr.renderOrder=-1; g.add(fr); g.userData.frame=fr;
  }
  g.userData.legs=legs; g.userData.arms=arms; g.userData.head=head; g.userData.nftId=n?.id;
  g.userData.nftTraits=traitPairs.map(([type,value])=>[String(type),String(value)]);
  g.userData.nftMedia={animation:n?.animation||'',video:n?.video||'',audio:n?.audio||'',model3d:n?.model3d||'',artwork:n?.artwork||''};
  g.userData.anim=(t,moving,armsUp)=>{
    // Fit the real artwork without cropping once its remote image has decoded.
    const panel=g.userData.artPanel, image=g.userData.artTexture?.image;
    if(panel&&image&&!panel.userData.artFitDone) {
      const iw=Number(image.naturalWidth||image.videoWidth||image.width)||0;
      const ih=Number(image.naturalHeight||image.videoHeight||image.height)||0;
      if(iw>0&&ih>0) {
        const fit=Math.min(.35/iw,.46/ih);
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
