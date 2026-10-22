// Glassroot Grove ambient species (Mirehare, Ashfang) from Xrpassassin #111.
// Kept in code instead of client/data/wilds/creatures.json (that folder is not edited by integrations):
// merged into the loaded creature data only when an id is missing, so a later JSON entry always wins.
export const AMBIENT_SPECIES = Object.freeze([
  {
    "id": "mirehare",
    "name": "Mirehare",
    "rarity": "common",
    "affinity": [
      "Verdant",
      "Gale"
    ],
    "temperament": "skittish",
    "habitats": [
      "glassroot_grove"
    ],
    "levelRange": [
      5,
      9
    ],
    "baseStats": {
      "hp": 28,
      "power": 8,
      "guard": 7,
      "speed": 13,
      "focus": 8
    },
    "roles": [
      "wildlife",
      "scout"
    ],
    "passiveTrait": "Quickstep: its swift movement makes it difficult to corner.",
    "abilities": [
      "leaf_flick",
      "soothing_call"
    ],
    "evolution": null,
    "confluenceTags": [
      "verdant",
      "gale",
      "wildlife",
      "quick"
    ]
  },
  {
    "id": "ashfang",
    "name": "Ashfang",
    "rarity": "uncommon",
    "affinity": [
      "Ember",
      "Stone"
    ],
    "temperament": "territorial",
    "habitats": [
      "glassroot_grove",
      "ashen_hollow"
    ],
    "levelRange": [
      6,
      11
    ],
    "baseStats": {
      "hp": 38,
      "power": 13,
      "guard": 9,
      "speed": 11,
      "focus": 7
    },
    "roles": [
      "predator",
      "striker"
    ],
    "passiveTrait": "Ambusher: guards its territory and charges intruders who approach too closely.",
    "abilities": [
      "spark_nip",
      "flare_dash"
    ],
    "evolution": null,
    "confluenceTags": [
      "ember",
      "stone",
      "predator",
      "striker"
    ]
  }
]);

export function withAmbientSpecies(data) {
  if (!data || !Array.isArray(data.creatures)) return data;
  const have = new Set(data.creatures.map(c => c && c.id));
  for (const sp of AMBIENT_SPECIES) if (!have.has(sp.id)) data.creatures.push(JSON.parse(JSON.stringify(sp)));
  return data;
}
