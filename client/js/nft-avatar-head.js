// Per-token head shaping for BURN City NFT avatars.
// Maps each token's own traits (Body / Eye / Mouth / Head for 589 Protocol; Head / Face / Neck for
// Firekeepers; fur / mask / eyes for RACC) to head-shape parameters. Values were set against the real
// collection art (589 tokens #001-#00534, 9 Firekeepers 1/1s, RACC customs; reviewed outside the repo).
// Unknown trait values fall back to the collection default. 589 / RACC share one look per trait value;
// unknown Firekeepers get a small identity-seeded jitter (+-3%) so they are not clones.
const text = v => String(v ?? '').trim().toLowerCase();
const raw = (profile, re) => text((profile.rawTraits || []).find(([type]) => re.test(String(type)))?.[1]);

// Head-to-body: 589 / Firekeepers art is realistic (about 1:6.5-7). RACC keeps its stylised big head.
export const HEAD_BASE = Object.freeze({
  '589':   { scale: .64, skullW: 1, skullH: 1, skullD: 1, jawW: .9, jawD: .9, jawDrop: 0, neckW: 1, neckH: 1, eyeW: 1, eyeH: .8, eyeGap: 1, lid: .55, lidTilt: .12, browY: 0, browTilt: .22, browL: 0, browThick: 1.15, earSize: 1, faceKind: 'human' },
  fk:      { scale: .62, skullW: 1.04, skullH: 1, skullD: 1.02, jawW: 1.12, jawD: 1, jawDrop: .006, neckW: 1.4, neckH: 1.05, eyeW: .95, eyeH: .75, eyeGap: 1, lid: .5, lidTilt: .18, browY: -.004, browTilt: .28, browL: 0, browThick: 1.35, earSize: 1, faceKind: 'human' },
  racc:    { scale: .9, skullW: 1, skullH: 1, skullD: 1, jawW: 1, jawD: 1, jawDrop: 0, neckW: 1.1, neckH: 1, eyeW: 1, eyeH: 1, eyeGap: 1, lid: 0, lidTilt: 0, browY: 0, browTilt: 0, browL: 0, browThick: 1, earSize: 1, faceKind: 'raccoon' },
  generic: { scale: 1, skullW: 1, skullH: 1, skullD: 1, jawW: 1, jawD: 1, jawDrop: 0, neckW: 1, neckH: 1, eyeW: 1, eyeH: 1, eyeGap: 1, lid: 0, lidTilt: 0, browY: 0, browTilt: .15, browL: 0, browThick: 1, earSize: 1, faceKind: 'human' }
});

// Trait value -> parameter overrides. First matching rule per slot wins.
export const HEAD_TRAIT_RULES = Object.freeze({
  '589': {
    eye: [
      [/^fr$/, { lid: .6, eyeH: .72, lidTilt: .14, browTilt: .26 }],                                   // flat, narrowed hard stare
      [/surprised/, { lid: 0, eyeH: 1.25, eyeW: 1.05, browY: .012, browTilt: -.05 }],
      [/golden melt/, { lid: .35, eyeStyle: 'gold-melt' }],
      [/interesting/, { lid: .45, browL: .016, browTilt: .1 }],                                          // one raised brow
      [/burn eye/, { lid: .4, eyeStyle: 'burn-glow' }],
      [/sticky dead|dead/, { lid: .85, eyeH: .6 }]
    ],
    mouth: [
      [/angry/, { jawW: .94, mouthStyle: 'angry' }], [/hmp/, { mouthStyle: 'flat' }], [/meh/, { mouthStyle: 'flat-low' }],
      [/smirk/, { mouthStyle: 'smirk' }], [/yolo/, { mouthStyle: 'open-grin', jawDrop: .006 }]
    ],
    head: [
      [/halo/, { skullH: 1.03, skullW: .97, bald: true }],                                               // smooth, bald, slightly tall dome
      [/mohawk/, { skullW: .95 }],
      [/fitted|cap/, { skullH: .98 }],
      [/shiesty/, { cover: 'balaclava', earSize: 0 }],
      [/space helmet/, { cover: 'space-helmet', earSize: 0 }],
      [/crown/, { skullH: 1.01 }]
    ],
    body: [
      [/cool off/, { skullW: .97, jawW: .88 }], [/flame on/, { jawW: .92 }], [/about to burn/, { jawW: .93 }], [/heating up/, {}]
    ]
  },
  fk: {
    face: [
      [/skull/, { faceKind: 'skull', skin: '#e6dcc4', jawW: 1.0, lid: 0, earSize: 0 }],
      [/wolf/, { faceKind: 'wolf', skin: '#d4621f', skullW: 1.06, lid: .3, earSize: 0 }],
      [/monkey/, { faceKind: 'monkey', skin: '#6b4a2e', earSize: 1.6, jawW: 1.05, lid: .2 }],
      [/lizard|reptil/, { faceKind: 'reptile', skin: '#24262b', skullW: .96, jawW: 1.02, lid: .2 }],
      [/beard/, { jawW: 1.15, lid: .55 }], [/grin/, { mouthStyle: 'grin', lid: .35 }],
      [/gas mask/, { cover: 'gas-mask' }], [/samurai/, { cover: 'samurai-mask' }], [/mask/, { cover: 'lower-mask' }],
      [/sunglasses/, { eyewear: 'shades' }], [/flaming eyes/, { eyeStyle: 'burn-glow', lid: .3 }],
      [/tattoo/, { jawW: 1.16 }], [/slime/, { skin: '#3fbf9a' }], [/space helmet/, { cover: 'space-helmet' }], [/jewels/, { eyewear: 'jewels' }]
    ],
    head: [
      [/space helmet/, { cover: 'space-helmet' }], [/helmet/, { cover: 'great-helm' }], [/hood/, { skullH: .98 }], [/crown/, { skullH: 1.02 }],
      [/dred|dread/, { skullW: 1.02 }], [/flames/, {}]
    ],
    neck: [
      [/collar|ring|medallion|under armor|covered/, { neckW: 1.5 }], [/tie/, { neckW: 1.3 }], [/scorch|bones/, { neckW: 1.35 }]
    ]
  },
  racc: {
    mask: [[/red|crimson/, { maskTint: 'red' }]],
    eyes: [[/glow|laser/, { eyeStyle: 'burn-glow' }]]
  }
});

function hash(n) { let h = (n >>> 0) || 1; return () => { h ^= h << 13; h >>>= 0; h ^= h >>> 17; h ^= h << 5; h >>>= 0; return (h % 10000) / 10000; }; }

export function resolveNftHeadShape(profile = {}, { jitter = true } = {}) {
  const key = ['589', 'fk', 'racc'].includes(String(profile.collectionKey)) ? String(profile.collectionKey) : 'generic';
  const out = { ...HEAD_BASE[key], collectionKey: key, eyeStyle: 'natural', mouthStyle: '', cover: '', bald: false, skin: '', eyewear: '', maskTint: '', matchedTraits: [] };
  const rules = HEAD_TRAIT_RULES[key] || {};
  const slots = key === '589' ? { eye: /^eye$/i, mouth: /^mouth$/i, head: /^head$/i, body: /^body$/i }
    : key === 'fk' ? { face: /^face$/i, head: /^head$/i, neck: /^neck\s*$/i }
    : key === 'racc' ? { mask: /mask/i, eyes: /eye/i } : {};
  for (const [slot, re] of Object.entries(slots)) {
    const value = raw(profile, re); if (!value) continue;
    const hit = (rules[slot] || []).find(([pattern]) => pattern.test(value));
    if (hit) { Object.assign(out, hit[1]); out.matchedTraits.push(slot + ':' + value); }
  }
  // Identity-seeded, head-only micro variation (+-3%): same traits, different token -> not a clone.
  // 589 / RACC are deliberately shared-base collections (same trait value -> same look); only trait-fallback
  // Firekeepers without a bespoke 1/1 spec get the jitter.
  if (key === 'fk' && jitter && profile.identitySeed) {
    const r = hash(profile.identitySeed), j = a => 1 + (r() * 2 - 1) * a;
    out.skullW *= j(.03); out.skullH *= j(.025); out.jawW *= j(.035); out.eyeGap *= j(.04); out.browTilt += (r() * 2 - 1) * .04; out.scale *= j(.015);
  }
  for (const k of ['scale', 'skullW', 'skullH', 'skullD', 'jawW', 'jawD', 'neckW', 'neckH', 'eyeW', 'eyeH', 'eyeGap']) out[k] = Math.round(out[k] * 1000) / 1000;
  return out;
}
