// Firekeepers are 1/1s: one bespoke spec per NFTokenID (issuer rKZmQq3gMCNmV6th3wZPhfqgZ3815vUmiV, taxon 1).
// 22 tokens minted (2 later burned on the ledger, kept here harmlessly). Specs were written by reviewing each
// token's own art and metadata (outside the repo); they are shape/colour parameters, not copies of the art.
// 'sculpt' picks the organic head (nft-avatar-head-specs.js); 'fidelity' is an honest note vs the art.
// Unknown/new Firekeepers fall back to the trait-based look in nftchar.js.
export const FK_1OF1 = Object.freeze({
 "0008C350CBA4A5AF2A8012786865E81067D054E55EB87419221BD6C505B95429": {
  "name": "Kalunga, The Inferno Warden",
  "sculpt": "human",
  "skin": "#6f3f22",
  "head": {
   "jawW": 1.2,
   "skullW": 1.04,
   "lid": 0.5
  },
  "fidelity": "good: broad-jawed dark-skinned warrior, gold neck rings, gold chest linework, dreads + head flames"
 },
 "0008C350CBA4A5AF2A8012786865E81067D054E55EB874193901A7C405B9542A": {
  "name": "Phoenix-Patriot, Flameborne of Freedom",
  "sculpt": "bird",
  "skin": "#e0912e",
  "cloth": "#b8232f",
  "feather": "#e0912e",
  "head": {
   "eyewear": "shades"
  },
  "fidelity": "approximate: phoenix/eagle head with beak and shades; flag-wrap shown as red top, no stars/stripes"
 },
 "0008C350CBA4A5AF2A8012786865E81067D054E55EB874194FE778C705B9542B": {
  "name": "Chainbreaker, Born of Burn",
  "sculpt": "human",
  "skin": "#e2a33a",
  "head": {
   "mouthStyle": "grin",
   "jawW": 1.1
  },
  "fidelity": "fair: golden fire-skinned grinning brawler, bare chest; heavy chains reduced to the gold neck ring"
 },
 "0008C350CBA4A5AF2A8012786865E81067D054E55EB8741966CD49C605B9542C": {
  "name": "The Cryptid, Flameborn Sovereign",
  "sculpt": "reptile",
  "skin": "#1b1c21",
  "cloth": "#c9ccd2",
  "scale": "#1b1c21",
  "eyes": "#f2c94c",
  "tongue": true,
  "fidelity": "good: black serpent head with long snout, yellow eyes, forked pink tongue, silver armor, crown, red third eye"
 },
 "0008C350CBA4A5AF2A8012786865E81067D054E55EB874197DB31AC905B9542D": {
  "name": "Drop King, Sovereign of Supply",
  "sculpt": "human",
  "skin": "#2a2a2e",
  "cloth": "#1d1d1f",
  "head": {
   "cover": "space-helmet"
  },
  "fidelity": "weak: art head is an XRP coin in a glass bubble with a crown; shown as a dark head in a space-helmet rim"
 },
 "0008C350CBA4A5AF2A8012786865E81067D054E55EB874199498EBC805B9542E": {
  "name": "F.B.I. \u2013 Fire. Burn. Insurgency.",
  "sculpt": "human",
  "skin": "#e6a83a",
  "cloth": "#1c1d22",
  "head": {
   "eyewear": "shades"
  },
  "fidelity": "good: gold fire skin, black suit, shades, cap"
 },
 "0008C350CBA4A5AF2A8012786865E81067D054E55EB87419AB7EBCCB05B9542F": {
  "name": "The Burned Knight",
  "sculpt": "helm",
  "skin": "#3a2a20",
  "cloth": "#4d5038",
  "metal": "#2c2e2a",
  "fidelity": "good: dark great helm with glowing visor slit, olive armor, flame collar"
 },
 "0008C350CBA4A5AF2A8012786865E81067D054E55EB87419C2648DCA05B95430": {
  "name": "PYRO \u2013 The Flame Incarnate",
  "sculpt": "human",
  "skin": "#e6a83a",
  "cloth": "#e8e4dc",
  "head": {
   "cover": "gas-mask"
  },
  "fidelity": "fair: gold skin, gas mask, white/red fireproof suit; flamethrower tanks not modelled"
 },
 "0008C350CBA4A5AF2A8012786865E81067D054E55EB87419D94A5ECD05B95431": {
  "name": "AI SAMURAI \u2013 The Code of Fire",
  "sculpt": "helm",
  "skin": "#d6a335",
  "cloth": "#2f7a4a",
  "metal": "#2f6e45",
  "head": {
   "cover": "samurai-mask"
  },
  "fidelity": "fair: green kabuto-style helm and green armor; gold oni mask simplified"
 },
 "0008C350CBA4A5AF2A8012786865E81067D054E55EB87419F0302FCC05B95432": {
  "name": "SLIME \u2014 The Alchemical Flame-Tamer",
  "sculpt": "human",
  "skin": "#3fbf9a",
  "head": {
   "mouthStyle": "grin"
  },
  "drips": true,
  "fidelity": "good: smooth teal slime body with drips on the face, grin, flame head"
 },
 "0008C350CBA4A5AF2A8012786865E81067D054E55EB87419071600CF05B95433": {
  "name": "Ash-9",
  "sculpt": "human",
  "skin": "#e6a83a",
  "cloth": "#1d1d20",
  "fidelity": "fair: gold skin, black tactical vest; headset not modelled"
 },
 "0008C350CBA4A5AF2A8012786865E81067D054E55EB874191DFBD1CE05B95434": {
  "name": "Space Monkey",
  "sculpt": "monkey",
  "skin": "#5a3d26",
  "cloth": "#e6e8ea",
  "head": {
   "cover": "space-helmet"
  },
  "fidelity": "good: monkey face (brow, muzzle, big ears) in a space-helmet rim, white space suit"
 },
 "0008C350CBA4A5AF2A8012786865E81067D054E55EB8741934E1A2D105B95435": {
  "name": "The Architect",
  "sculpt": "human",
  "skin": "#e6a83a",
  "cloth": "#8a8d92",
  "beard": "#f2c14e",
  "fidelity": "good: gold fire skin, full flame-yellow beard, grey suit and tie"
 },
 "0008C350CBA4A5AF2A8012786865E81067D054E55EB874194BC773D005B95436": {
  "name": "The Collector",
  "sculpt": "human",
  "skin": "#e6a83a",
  "cloth": "#1d1d20",
  "head": {
   "cover": "lower-mask"
  },
  "maskCol": "#9e1f1f",
  "fidelity": "fair: gold skin, red lower-face mask, black armor; skull helmet and loot bags not modelled"
 },
 "0008C350CBA4A5AF2A8012786865E81067D054E55EB8741962AD44D305B95437": {
  "name": "The Nordic Warrior",
  "sculpt": "helm",
  "skin": "#e6a83a",
  "cloth": "#1d1d20",
  "metal": "#1e1e22",
  "horns": true,
  "fur": "#6b5a48",
  "fidelity": "fair: dark horned helm, fur collar, black armor"
 },
 "0008C350CBA4A5AF2A8012786865E81067D054E55EB87419799315D205B95438": {
  "name": "The Seer",
  "sculpt": "human",
  "skin": "#e6a83a",
  "cloth": "#b51f2d",
  "hair": "#c2341c",
  "head": {
   "skullW": 0.94,
   "jawW": 0.82,
   "lid": 0.3
  },
  "fidelity": "fair: slimmer feminine face, long red hair, crown, red/gold armor; jewels simplified"
 },
 "0008C350CBA4A5AF2A8012786865E81067D054E55EB874199078E6D505B95439": {
  "name": "The Wolf",
  "sculpt": "wolf",
  "skin": "#d9581c",
  "cloth": "#1c1c1f",
  "hood": "#4b8fd0",
  "fidelity": "good: wolf head with long tapered snout, pointed ears, cheek and neck ruff, amber eyes, black leather jacket, blue hood collar"
 },
 "0008C350CBA4A5AF2A8012786865E81067D054E55EB87419A75EB7D405B9543A": {
  "name": "Cryptwalker",
  "sculpt": "skull",
  "skin": "#e6dcc4",
  "cloth": "#e2b62e",
  "brain": true,
  "fidelity": "good: skull with exposed pink brain, red-ember sockets, yellow puffer jacket"
 },
 "0008C350CBA4A5AF2A8012786865E81067D054E55EB87419BE4488D705B9543B": {
  "name": "The Assassin",
  "sculpt": "human",
  "skin": "#8a2a1a",
  "cloth": "#1e1e22",
  "head": {
   "cover": "lower-mask"
  },
  "fidelity": "fair: masked assassin, dark gi, flame hair; katana not modelled"
 },
 "0008C350CBA4A5AF2A8012786865E81067D054E55EB87419D52A59D605B9543C": {
  "name": "The Reaper",
  "sculpt": "skull",
  "skin": "#e6dcc4",
  "cloth": "#2a2522",
  "hoodCol": "#3a2f28",
  "fidelity": "good: skull in a dark hood, flowing dark gown; scythe not modelled"
 },
 "0008C350CBA4A5AF2A8012786865E81067D054E55EB87419EC102AD905B9543D": {
  "name": "Shadow Ember",
  "sculpt": "human",
  "skin": "#141416",
  "cloth": "#141416",
  "head": {
   "cover": "balaclava"
  },
  "fidelity": "good: all-black shinobi with only the eye slit showing"
 },
 "0008C350CBA4A5AF2A8012786865E81067D054E55EB8741902F5FBD805B9543E": {
  "name": "Omechron, The Final Protocol",
  "sculpt": "human",
  "skin": "#e6a83a",
  "cloth": "#1a1a1d",
  "beard": "#f2c14e",
  "fidelity": "good: gold fire skin, flame beard, crown of flames, black/gold robe"
 }
});
export function firekeeperSpec(id) { return FK_1OF1[String(id || '').toUpperCase()] || null; }
