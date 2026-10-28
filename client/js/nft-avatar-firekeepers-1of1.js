// Firekeepers are 1/1s: one bespoke spec per NFTokenID (issuer rKZmQq3gMCNmV6th3wZPhfqgZ3815vUmiV, taxon 1).
// 22 tokens minted (2 later burned on the ledger, kept here harmlessly). Specs were written by reviewing each
// token's own art and metadata (outside the repo); they are shape/colour parameters, not copies of the art.
// 'pal' holds 5 key colours sampled from the token's art (skin, skin shadow, accent, metal, glow) as numbers only;
// 'crackle' (0-1) is how strongly the molten-skin crack pattern shows.
// 'sculpt' picks the organic head (nft-avatar-head-specs.js); 'fidelity' is an honest note vs the art.
// Unknown/new Firekeepers fall back to the trait-based look in nftchar.js.
export const FK_1OF1 = Object.freeze({
 "0008C350CBA4A5AF2A8012786865E81067D054E55EB87419221BD6C505B95429": {
  "name": "Kalunga, The Inferno Warden",
  "sculpt": "human",
  "skin": "#5a2e12",
  "head": {
   "jawW": 1.2,
   "skullW": 1.04,
   "lid": 0.5
  },
  "fidelity": "good: broad-jawed dark-skinned warrior, gold neck rings, gold chest linework, dreads + head flames",
  "pal": {
   "skin": "#5a2e12",
   "shadow": "#2e1508",
   "accent": "#f9c827",
   "metal": "#e0a526",
   "glow": "#ff8a1e"
  },
  "crackle": 0,
  "glowTattoo": true
 },
 "0008C350CBA4A5AF2A8012786865E81067D054E55EB874193901A7C405B9542A": {
  "name": "Phoenix-Patriot, Flameborne of Freedom",
  "sculpt": "bird",
  "skin": "#e39a1f",
  "cloth": "#b8202a",
  "feather": "#e0912e",
  "head": {
   "eyewear": "shades"
  },
  "fidelity": "approximate: phoenix/eagle head with beak and shades; flag-wrap shown as red top, no stars/stripes",
  "pal": {
   "skin": "#e39a1f",
   "shadow": "#8d3300",
   "accent": "#c8202a",
   "metal": "#1a1a1e",
   "glow": "#ffb020"
  },
  "crackle": 0.5
 },
 "0008C350CBA4A5AF2A8012786865E81067D054E55EB874194FE778C705B9542B": {
  "name": "Chainbreaker, Born of Burn",
  "sculpt": "human",
  "skin": "#e2ac2c",
  "head": {
   "mouthStyle": "grin",
   "jawW": 1.1
  },
  "fidelity": "fair: golden fire-skinned grinning brawler, bare chest; heavy chains reduced to the gold neck ring",
  "pal": {
   "skin": "#e2ac2c",
   "shadow": "#ba5832",
   "accent": "#d2421a",
   "metal": "#8c8f96",
   "glow": "#ffb43a"
  },
  "crackle": 1
 },
 "0008C350CBA4A5AF2A8012786865E81067D054E55EB8741966CD49C605B9542C": {
  "name": "The Cryptid, Flameborn Sovereign",
  "sculpt": "reptile",
  "skin": "#17171a",
  "cloth": "#b8bcc4",
  "scale": "#1b1c21",
  "eyes": "#f2c94c",
  "tongue": true,
  "fidelity": "good: black serpent head with long snout, yellow eyes, forked pink tongue, silver armor, crown, red third eye",
  "pal": {
   "skin": "#17171a",
   "shadow": "#0a0a0c",
   "accent": "#e2b04a",
   "metal": "#b8bcc4",
   "glow": "#ffd23a"
  },
  "crackle": 0
 },
 "0008C350CBA4A5AF2A8012786865E81067D054E55EB874197DB31AC905B9542D": {
  "name": "Drop King, Sovereign of Supply",
  "sculpt": "human",
  "skin": "#6b4a1c",
  "cloth": "#141416",
  "head": {
   "cover": "space-helmet"
  },
  "fidelity": "weak: art head is an XRP coin in a glass bubble with a crown; shown as a dark head in a space-helmet rim",
  "pal": {
   "skin": "#6b4a1c",
   "shadow": "#2a1c0a",
   "accent": "#f2efe8",
   "metal": "#f2c230",
   "glow": "#ff8a1e"
  },
  "crackle": 0
 },
 "0008C350CBA4A5AF2A8012786865E81067D054E55EB874199498EBC805B9542E": {
  "name": "F.B.I. \u2013 Fire. Burn. Insurgency.",
  "sculpt": "human",
  "skin": "#efab12",
  "cloth": "#1c1d22",
  "head": {
   "eyewear": "shades"
  },
  "fidelity": "good: gold fire skin, black suit, shades, cap",
  "pal": {
   "skin": "#efab12",
   "shadow": "#b0560e",
   "accent": "#b8232f",
   "metal": "#e2b04a",
   "glow": "#ff8a1e"
  },
  "crackle": 1
 },
 "0008C350CBA4A5AF2A8012786865E81067D054E55EB87419AB7EBCCB05B9542F": {
  "name": "The Burned Knight",
  "sculpt": "helm",
  "skin": "#3a2a20",
  "cloth": "#5c5a2a",
  "metal": "#1f2021",
  "fidelity": "good: dark great helm with glowing visor slit, olive armor, flame collar",
  "pal": {
   "skin": "#3a2a20",
   "shadow": "#1a140e",
   "accent": "#9e2a14",
   "metal": "#1f2021",
   "glow": "#ffb020"
  },
  "crackle": 0
 },
 "0008C350CBA4A5AF2A8012786865E81067D054E55EB87419C2648DCA05B95430": {
  "name": "PYRO \u2013 The Flame Incarnate",
  "sculpt": "human",
  "skin": "#e6b318",
  "cloth": "#f3eee4",
  "head": {
   "cover": "gas-mask"
  },
  "fidelity": "fair: gold skin, gas mask, white/red fireproof suit; flamethrower tanks not modelled",
  "pal": {
   "skin": "#e6b318",
   "shadow": "#c46a10",
   "accent": "#d0302a",
   "metal": "#9aa0a8",
   "glow": "#ff8a1e"
  },
  "crackle": 1
 },
 "0008C350CBA4A5AF2A8012786865E81067D054E55EB87419D94A5ECD05B95431": {
  "name": "AI SAMURAI \u2013 The Code of Fire",
  "sculpt": "helm",
  "skin": "#d6a335",
  "cloth": "#28783d",
  "metal": "#2f6e45",
  "head": {
   "cover": "samurai-mask"
  },
  "fidelity": "fair: green kabuto-style helm and green armor; gold oni mask simplified",
  "pal": {
   "skin": "#d6a335",
   "shadow": "#0b2a16",
   "accent": "#eba80e",
   "metal": "#2f6e45",
   "glow": "#ff5a14"
  },
  "crackle": 0
 },
 "0008C350CBA4A5AF2A8012786865E81067D054E55EB87419F0302FCC05B95432": {
  "name": "SLIME \u2014 The Alchemical Flame-Tamer",
  "sculpt": "human",
  "skin": "#1dcc9d",
  "head": {
   "mouthStyle": "grin"
  },
  "drips": true,
  "fidelity": "good: smooth teal slime body with drips on the face, grin, flame head",
  "pal": {
   "skin": "#1dcc9d",
   "shadow": "#0f7a62",
   "accent": "#f2650f",
   "metal": "#e2b04a",
   "glow": "#ffd23a"
  },
  "crackle": 0
 },
 "0008C350CBA4A5AF2A8012786865E81067D054E55EB87419071600CF05B95433": {
  "name": "Ash-9",
  "sculpt": "human",
  "skin": "#eaa514",
  "cloth": "#1d1d20",
  "fidelity": "fair: gold skin, black tactical vest; headset not modelled",
  "pal": {
   "skin": "#eaa514",
   "shadow": "#b45a10",
   "accent": "#c0302a",
   "metal": "#1b1a1a",
   "glow": "#ff8a1e"
  },
  "crackle": 1
 },
 "0008C350CBA4A5AF2A8012786865E81067D054E55EB874191DFBD1CE05B95434": {
  "name": "Space Monkey",
  "sculpt": "monkey",
  "skin": "#c9a77a",
  "cloth": "#f2eeed",
  "head": {
   "cover": "space-helmet"
  },
  "fidelity": "good: monkey face (brow, muzzle, big ears) in a space-helmet rim, white space suit",
  "pal": {
   "skin": "#c9a77a",
   "shadow": "#775c55",
   "accent": "#e2b04a",
   "metal": "#cfd6dd",
   "glow": "#ff8a1e"
  },
  "crackle": 0
 },
 "0008C350CBA4A5AF2A8012786865E81067D054E55EB8741934E1A2D105B95435": {
  "name": "The Architect",
  "sculpt": "human",
  "skin": "#e39615",
  "cloth": "#8e9196",
  "beard": "#f7e08a",
  "fidelity": "good: gold fire skin, full flame-yellow beard, grey suit and tie",
  "pal": {
   "skin": "#e39615",
   "shadow": "#a5460f",
   "accent": "#ffe38a",
   "metal": "#c0c4ca",
   "glow": "#ffc84a"
  },
  "crackle": 1
 },
 "0008C350CBA4A5AF2A8012786865E81067D054E55EB874194BC773D005B95436": {
  "name": "The Collector",
  "sculpt": "human",
  "skin": "#e0a020",
  "cloth": "#1d1d20",
  "head": {
   "cover": "lower-mask"
  },
  "maskCol": "#9e1f1f",
  "fidelity": "fair: gold skin, red lower-face mask, black armor; skull helmet and loot bags not modelled",
  "pal": {
   "skin": "#e0a020",
   "shadow": "#a2400e",
   "accent": "#992b2b",
   "metal": "#e2a92a",
   "glow": "#ffb020"
  },
  "crackle": 1
 },
 "0008C350CBA4A5AF2A8012786865E81067D054E55EB8741962AD44D305B95437": {
  "name": "The Nordic Warrior",
  "sculpt": "helm",
  "skin": "#c79f32",
  "cloth": "#141414",
  "metal": "#1e1e22",
  "horns": true,
  "fur": "#6b5a48",
  "fidelity": "fair: dark horned helm, fur collar, black armor",
  "pal": {
   "skin": "#c79f32",
   "shadow": "#3a2a10",
   "accent": "#684430",
   "metal": "#1e1e22",
   "glow": "#ffb020"
  },
  "crackle": 0.6,
  "horn": "#eaa806"
 },
 "0008C350CBA4A5AF2A8012786865E81067D054E55EB87419799315D205B95438": {
  "name": "The Seer",
  "sculpt": "human",
  "skin": "#e8a12a",
  "cloth": "#9d0a12",
  "hair": "#c2341c",
  "head": {
   "skullW": 0.94,
   "jawW": 0.82,
   "lid": 0.3
  },
  "fidelity": "fair: slimmer feminine face, long red hair, crown, red/gold armor; jewels simplified",
  "pal": {
   "skin": "#e8a12a",
   "shadow": "#b3401a",
   "accent": "#c2341c",
   "metal": "#e2b04a",
   "glow": "#ff3b2a"
  },
  "crackle": 1
 },
 "0008C350CBA4A5AF2A8012786865E81067D054E55EB874199078E6D505B95439": {
  "name": "The Wolf",
  "sculpt": "wolf",
  "skin": "#e84718",
  "cloth": "#171512",
  "hood": "#3d93c9",
  "fidelity": "good: wolf head with long tapered snout, pointed ears, cheek and neck ruff, amber eyes, black leather jacket, blue hood collar",
  "pal": {
   "skin": "#e84718",
   "shadow": "#9e2a0e",
   "accent": "#ffb020",
   "metal": "#3d93c9",
   "glow": "#ffd23a"
  },
  "crackle": 0.8
 },
 "0008C350CBA4A5AF2A8012786865E81067D054E55EB87419A75EB7D405B9543A": {
  "name": "Cryptwalker",
  "sculpt": "skull",
  "skin": "#ece3cf",
  "cloth": "#e2b62e",
  "brain": true,
  "fidelity": "good: skull with exposed pink brain, red-ember sockets, yellow puffer jacket",
  "pal": {
   "skin": "#ece3cf",
   "shadow": "#a59a84",
   "accent": "#e48aa0",
   "metal": "#cfd6dd",
   "glow": "#ff3b1a"
  },
  "crackle": 0
 },
 "0008C350CBA4A5AF2A8012786865E81067D054E55EB87419BE4488D705B9543B": {
  "name": "The Assassin",
  "sculpt": "human",
  "skin": "#b8321a",
  "cloth": "#2a2b2e",
  "head": {
   "cover": "lower-mask"
  },
  "fidelity": "fair: masked assassin, dark gi, flame hair; katana not modelled",
  "pal": {
   "skin": "#b8321a",
   "shadow": "#4a1208",
   "accent": "#df6a11",
   "metal": "#2a2b2e",
   "glow": "#ffc83a"
  },
  "crackle": 0
 },
 "0008C350CBA4A5AF2A8012786865E81067D054E55EB87419D52A59D605B9543C": {
  "name": "The Reaper",
  "sculpt": "skull",
  "skin": "#c9b27a",
  "cloth": "#3a2c22",
  "hoodCol": "#4a4644",
  "fidelity": "good: skull in a dark hood, flowing dark gown; scythe not modelled",
  "pal": {
   "skin": "#c9b27a",
   "shadow": "#5a4a2a",
   "accent": "#925522",
   "metal": "#4a4644",
   "glow": "#ffb020"
  },
  "crackle": 0
 },
 "0008C350CBA4A5AF2A8012786865E81067D054E55EB87419EC102AD905B9543D": {
  "name": "Shadow Ember",
  "sculpt": "human",
  "skin": "#141416",
  "cloth": "#18181b",
  "head": {
   "cover": "balaclava"
  },
  "fidelity": "good: all-black shinobi with only the eye slit showing",
  "pal": {
   "skin": "#141416",
   "shadow": "#08080a",
   "accent": "#b8232f",
   "metal": "#2a2a2e",
   "glow": "#ffc83a"
  },
  "crackle": 0
 },
 "0008C350CBA4A5AF2A8012786865E81067D054E55EB8741902F5FBD805B9543E": {
  "name": "Omechron, The Final Protocol",
  "sculpt": "human",
  "skin": "#ee9414",
  "cloth": "#1a1416",
  "beard": "#b9b2a6",
  "fidelity": "good: gold fire skin, flame beard, crown of flames, black/gold robe",
  "pal": {
   "skin": "#ee9414",
   "shadow": "#a2400e",
   "accent": "#c8302a",
   "metal": "#e2a92a",
   "glow": "#ff8a1e"
  },
  "crackle": 1
 }
});
export function firekeeperSpec(id) { return FK_1OF1[String(id || '').toUpperCase()] || null; }
