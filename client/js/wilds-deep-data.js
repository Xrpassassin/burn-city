// BURN City: The Wilds — deep area content: Glassroot Grove (Wilds design package, zone 2: "mineral-veined roots, old power conduits,
// ruins, hidden paths", levels ~5–12) with Orrick Vale (Ruin Surveyor) and Sable Kest (Field Tinker), their quests from quests.json
// ("Tags in the Roots", "The Missing Tinker"), and the Confluence stones (preview of the Verdant Bulwark recipe from creatures.json).
// Lives in js/ (not client/data/wilds/) because it is layout + dialogue for wilds-deep.js, loaded only with it.
// World coordinates: the deep realm, off the city map (see DEEP in wilds-gate.js: centre 1400,1370, radius 420).
export const ENTRY = { x: 1400, z: 990 }, RETURN_ARCH = { x: 1400, z: 978 };
export const TRAIL = [[1400, 978], [1398, 1010], [1388, 1046], [1362, 1082], [1352, 1104], [1330, 1150], [1308, 1196], [1290, 1236], [1318, 1268], [1362, 1292], [1408, 1310],
  [1452, 1330], [1508, 1340], [1556, 1338], [1530, 1384], [1482, 1420], [1420, 1446], [1360, 1468], [1376, 1512], [1414, 1560], [1440, 1608], [1416, 1646], [1400, 1676]];
export const CREEK = [[985, 1306], [1080, 1324], [1170, 1314], [1260, 1290], [1340, 1302], [1410, 1318], [1480, 1300], [1560, 1292], [1640, 1318], [1730, 1306], [1815, 1296]];
export const CAMP = { x: 1340, z: 1104, fire: { x: 1346, z: 1098 } };
export const CONFLUENCE = { x: 1400, z: 1690, r: 15 };
export const RUINS = [ // old power conduits (west), the glass tangle (east), the tram-yard ruins (north)
  { kind: 'conduit', x: 1268, z: 1232 }, { kind: 'glass', x: 1562, z: 1330 }, { kind: 'ruin', x: 1352, z: 1474 }];
export const TAGS = [{ id: 'tag_a', label: 'survey tag A', x: 1272, z: 1238 }, { id: 'tag_b', label: 'survey tag B', x: 1566, z: 1338 }, { id: 'tag_c', label: 'survey tag C', x: 1356, z: 1480 }];
export const CLUES = [{ id: 'clue_1', label: 'Sable\'s calibrator', x: 1500, z: 1502 }, { id: 'clue_2', label: 'Sable\'s binding spool', x: 1446, z: 1612 }, { id: 'clue_3', label: 'Sable\'s ration tin', x: 1328, z: 1604 }];
export const CLEARINGS = [[ENTRY.x, ENTRY.z, 14], [CAMP.x, CAMP.z, 16], [CONFLUENCE.x, CONFLUENCE.z, 24], ...RUINS.map(r => [r.x, r.z, 13]), ...CLUES.map(c => [c.x, c.z, 5])];
// encounter table (zone baseline + species range; a few lower-level creatures stay for ecology). lv = [band low, band high]
export const SPAWNS = [
  { sp: 'shardmole', x: 1300, z: 1196, r: 30, lv: [5, 9] }, { sp: 'shardmole', x: 1500, z: 1452, r: 28, lv: [6, 10] },
  { sp: 'briarback', x: 1250, z: 1380, r: 30, lv: [8, 11] }, { sp: 'briarback', x: 1590, z: 1246, r: 30, lv: [8, 11] },
  { sp: 'brookwarden', x: 1200, z: 1318, r: 22, lv: [9, 12] }, { sp: 'brookwarden', x: 1606, z: 1306, r: 22, lv: [9, 12] },
  { sp: 'veilwing', x: 1352, z: 1528, r: 26, lv: [7, 11] }, { sp: 'veilwing', x: 1466, z: 1150, r: 26, lv: [7, 10] },
  { sp: 'kilnfox', x: 1624, z: 1496, r: 30, lv: [10, 12] },
  { sp: 'mosskit', x: 1432, z: 1072, r: 22, lv: [3, 6] }, { sp: 'cinderling', x: 1296, z: 1436, r: 24, lv: [4, 7] },
  { sp: 'rootcoloss', x: 1530, z: 1714, r: 18, lv: [16, 16], fixed: 1 },   // authored elite at the Confluence's edge (fixed level)
  { sp: 'briarback', x: 1432, z: 1632, r: 9, lv: [9, 10], qtag: 'territorial_creature', quest: 'the_missing_tinker', obj: 'resolve_disturbance' },   // Sable's problem
];
export const NPCS = [
  { id: 'orrick_vale', name: 'Orrick Vale', role: 'Ruin Surveyor', x: 1334, z: 1110, look: [1360, 1090], walker: { suit: 0x4a3a2a, accent: 0xffb04a, skin: 1, hair: 0x9a9a9a }, rest: true,
    quests: ['tags_in_the_roots'],
    say: {
      locked: "Mara sent you? Not yet, I think. Finish her trail lessons first — calm or bind something gentle — then come find me. The Grove doesn't forgive guesswork.",
      offer_tags_in_the_roots: "Orrick Vale, Relic Survey. My crew pinned three survey tags to the old grid out here — a power conduit, a glassroot tangle, the tram-yard ruins — and then the roots moved. Bring them back and I'll show you which paths are safe.",
      active_tags_in_the_roots: "Tag A is on the old conduit west of camp, B is east where the roots turn to glass, C is north in the ruins. Look for the orange flags. Watch the Briarbacks.",
      ready_tags_in_the_roots: "All three. The grid lines still line up — so the paths do too. Here, rootfiber. And Sable went north toward the Confluence and hasn't come back. Would you look?",
      done: "The grid holds. North is the Confluence — the stones where bonds change shape. Sable Kest went that way. Rest here any time.",
    } },
  { id: 'sable_kest', name: 'Sable Kest', role: 'Field Tinker', x: 1388, z: 1674, look: [1400, 1690], walker: { suit: 0x2a3a4a, accent: 0x5ff0d0, skin: 3, hair: 0x1a1210 },
    quests: ['the_missing_tinker'],
    say: {
      locked: "You found me — good. But I can't leave yet. Get Orrick's tags back first; he'll vouch for you. Then I'll tell you what's wrong out here.",
      offer_the_missing_tinker: "Sable Kest, field tinker. A Briarback's claimed the path back and scattered my kit — calibrator, binding spool, ration tin. Find my three tools and settle that Briarback — calm it or best it — and we both walk out.",
      active_the_missing_tinker: "My tools glint in the ferns: east past the old tram ruin, by the creek bend, and up near the stones. The Briarback marked ⚠ is the territorial one.",
      ready_the_missing_tinker: "My kit and a clear path, and nothing broken that matters. Training treats — your companion's earned them.",
      done: "The Confluence hums when bonded pairs stand here. I'm studying it. Come back when two of your companions trust you deeply.",
    } },
];
export const CONFLUENCE_TEXT = { title: 'The Confluence', sub: 'Confluence Circle · standing stones',
  body: 'Seven stones around a pool that glows when bonded companions stand close. Here, compatible companions can be combined into a new form — the originals are kept, and a new companion is created. Nothing happens without your confirmation.',
  recipe: 'Verdant Bulwark: Mosskit + Shardmole → Briarback (bond 2 each, needs "Confluence basics").', soon: 'The Confluence opens in a later update. This visit is logged in your journal.' };
