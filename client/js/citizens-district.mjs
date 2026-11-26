// Project AION's first district. Its clock and decisions depend on the NPCs in the City scene.
const districtPlace = id => 'district:' + id;

export const DISTRICT_CAST = [
  {
    id: 'ines', name: 'Officer Ines Ward', modelId: 'elegance-black-b', faction: 'Precinct 1',
    personality: 'A neighborhood officer who knows Maya and puts the people on the block first.',
    dialogue: ["Maya knows everyone on this block. If something changes, she'll know first."]
  },
  {
    id: 'roe', name: 'Officer Elias Roe', modelId: 'exec-navy', faction: 'Precinct 1',
    personality: 'An impatient patrol officer who has a running feud with Jax.',
    dialogue: ["Jax likes an audience. I know where he'll go when he loses one."]
  },
  {
    id: 'jax', name: 'Jax Vale', modelId: 'inked-warrior', faction: 'Cinder Crew',
    personality: 'A proud Cinder Crew member who holds grudges and hates backing down in public.',
    dialogue: ["I've been on this block my whole life. Roe still talks like I'm passing through."]
  },
  {
    id: 'nia', name: 'Nia Moss', modelId: 'gothic-elegance', faction: 'Cinder Crew',
    personality: 'The crew member who knows how to get Jax to walk away. She grew up with Skye.',
    dialogue: ["Skye and I used to feed quarters into the same cabinet. Things were easier then."]
  }
].map(profile => ({
  schema: 'burn-city-citizen/1', ...profile,
  schedule: [{ time: '00:00', place: profile.faction === 'Precinct 1' ? 'police' : 'shop:arcade' }]
}));

const duty = (place, activity, say) => ({ place: districtPlace(place), activity, say });
const assignments = {
  routine: {
    ines: duty('west', 'Checking in on Main Street'),
    roe: duty('west-end', 'Walking the beat'),
    jax: duty('east-end', 'Waiting for Nia'),
    nia: duty('east', 'Keeping an eye on Jax'),
    maya: duty('door', 'Working the counter'),
    skye: duty('witness', 'Waiting outside Hot Beans')
  },
  gathering: {
    ines: duty('near-west', 'Trying to settle things', 'Maya, stay by the door. I’ll handle this.'),
    roe: duty('left', 'Confronting Jax', 'Jax. We need to talk about yesterday.'),
    jax: duty('right', 'Standing his ground', 'You want to do this here, in front of everyone?'),
    nia: duty('near-east', 'Talking Jax down', 'Jax, let it go. Skye is right there.'),
    maya: duty('door', 'Working the counter'),
    skye: duty('witness', 'Waiting outside Hot Beans')
  },
  clash: {
    ines: duty('near-west', 'Separating the group', 'Back up. Give them some room.'),
    roe: duty('left', 'Scuffling with Jax'),
    jax: duty('right', 'Scuffling with Roe'),
    nia: duty('near-east', 'Calling Jax away', 'Come on, Jax. We’re leaving.'),
    maya: duty('door', 'Watching from the doorway'),
    skye: duty('witness', 'Keeping clear of the scuffle')
  },
  aftermath: {
    ines: duty('door', 'Checking on Maya'),
    roe: duty('east', 'Following the Cinder Crew'),
    jax: duty('east-end', 'Leaving the block'),
    nia: duty('east-end', 'Walking Jax home'),
    maya: duty('door', 'Closing Hot Beans early'),
    skye: duty('witness', 'Checking on the neighbors')
  },
  settled: {
    ines: duty('near-west', 'Patrolling Hot Beans'),
    roe: { place: 'police', activity: 'Reporting back to the precinct' },
    jax: { place: 'shop:arcade', activity: 'Cooling off near the arcade' },
    nia: { place: 'shop:arcade', activity: 'Making sure Jax stays put' }
  },
  mediation: {
    roe: duty('arcade-left', 'Meeting Jax outside Pixel Arcade', 'I said I’d hear you out. Go ahead.'),
    jax: duty('arcade-right', 'Meeting Roe outside Pixel Arcade', 'We can talk if you’ll let me finish.'),
    nia: duty('arcade-near-east', 'Making introductions', 'I asked Skye to come. We could use someone we both trust.'),
    skye: duty('arcade-witness', 'Helping Nia mediate'),
    ines: duty('near-west', 'Covering Main Street while Roe talks'),
    maya: duty('door', 'Serving customers at Hot Beans')
  },
  community: {
    jax: duty('arcade-right', 'Playing friendly matches at Pixel Arcade'),
    nia: duty('arcade-near-east', 'Making room for new players'),
    skye: duty('arcade-witness', 'Teaching the newcomers'),
    dex: duty('arcade-door', 'Visiting the neighborhood arcade'),
    ines: duty('near-west', 'Checking in on Main Street'),
    roe: duty('west', 'Walking the beat away from the arcade'),
    maya: duty('door', 'Serving customers at Hot Beans')
  }
};

const streetPatrol = duty('west', 'Patrolling Main Street');
const openShift = {
  ines: duty('door', 'Checking in at Hot Beans'),
  roe: duty('west-end', 'Walking the Main Street beat'),
  jax: duty('arcade-east', 'Waiting for a free arcade cabinet'),
  nia: duty('arcade-door', 'Catching up with Skye')
};

const reports = {
  maya: 'I saw Roe get in Jax’s face. I closed early before anyone else got dragged into it.',
  skye: 'From where I stood, Jax made the first move. Nia was the one who got him to leave.',
  ines: 'Maya was shaken. I’m keeping my patrol on this block for the rest of the shift.',
  roe: 'Jax and I both lost our patience. I owe the precinct a report.',
  jax: 'I would’ve stayed if Nia hadn’t asked me herself.',
  nia: 'I got Jax out of there. I’m going to find Skye later and see how she’s doing.'
};

const truceReports = {
  roe: 'Nia and Skye got us talking. Jax gets his evenings at the arcade. I’ll give the place some room.',
  jax: 'Roe actually heard me out. I’ll keep the arcade quiet if he gives us our space.',
  nia: 'Jax listened when Skye spoke up. We agreed to keep the arcade open to everyone.',
  skye: 'Nia asked me to sit in. They finally agreed to leave their history outside the arcade.'
};
const walkoutReports = {
  roe: 'We tried to talk at the arcade, but we left without an agreement.',
  jax: 'I told Roe I’d try again when Nia and Skye could both make it.',
  nia: 'We needed Skye there. I’ll find another time for everyone.',
  skye: 'The two of them still don’t trust each other. Nia’s going to try again.'
};
const communityReports = {
  jax: 'I finally taught Dex the controls. He still beat me on his second go.',
  nia: 'People are coming back to the arcade. Sometimes all it takes is leaving the door open.',
  skye: 'Nia brought in some new faces tonight. We put their names up on the board.',
  dex: 'Skye showed me around Pixel Arcade. I might start coming here after my walks.'
};

const positions = {
  'west-end': [-10, 1], west: [-7, 0], 'near-west': [-3.4, 0],
  left: [-.85, 0], right: [.85, 0], 'near-east': [3.4, 0],
  east: [7, 0], 'east-end': [10, 1], witness: [-4, 2.8], door: [0, 3.1]
};

export function districtTargets(storefront, colliders = [], prefix = '') {
  const forward = { x: Math.sin(storefront.yaw), z: Math.cos(storefront.yaw) };
  const targets = {};
  for (const [id, [along, towardShop]] of Object.entries(positions)) {
    const at = distance => ({
      x: storefront.door.x + forward.z * along - forward.x * (distance - towardShop),
      z: storefront.door.z - forward.x * along - forward.z * (distance - towardShop)
    });
    let point = at(5.3);
    for (let distance = 5.8; distance <= 11.3; distance += .5) {
      if (!colliders.some(o => o.r && Math.hypot(point.x - o.x, point.z - o.z) < o.r + .65)) break;
      point = at(distance);
    }
    targets[districtPlace(prefix + id)] = point;
  }
  return targets;
}

const OUTCOME_KEY = 'burn-city:aion:district-outcome:v1';
const ARCHIVE_SIZE = 3;
// Dex can start the shift at the power plant, several minutes away on foot.
const COMMUNITY_WINDOW = 480;

export function makeDistrict(storage = null, hasArcade = true) {
  let outcome = null;
  try {
    const saved = storage?.getItem(OUTCOME_KEY);
    if (saved === 'clash' || saved === 'truce' || saved === 'walkout') outcome = saved;
  } catch { /* Continue the district in this session. */ }

  let phase = outcome ? 'settled' : 'routine', elapsed = 0, mayaSawClash = false;
  let witnessedClash = [];
  const pendingReports = new Map(), remembered = new Set();
  function enter(next) { phase = next; elapsed = 0; }
  function remember(lines, saw) {
    for (const [id, line] of Object.entries(lines)) {
      if (!saw(id) || remembered.has(line)) continue;
      remembered.add(line);
      const pending = pendingReports.get(id) ?? [];
      pendingReports.set(id, [...pending.slice(1 - ARCHIVE_SIZE), line]);
    }
  }
  function settle(nextOutcome) {
    outcome = nextOutcome;
    try { storage?.setItem(OUTCOME_KEY, outcome); } catch { /* Keep the current outcome in memory. */ }
  }

  return {
    get phase() { return phase; },
    get outcome() { return outcome; },
    get coffeeClosed() { return phase === 'aftermath' && mayaSawClash; },
    assignment(id) {
      if (phase === 'aborted') return assignments.routine[id];
      if (phase === 'aftermath' && !mayaSawClash) {
        if (id === 'maya') return assignments.routine.maya;
        if (id === 'ines') return streetPatrol;
      }
      if (phase === 'settled') {
        if (outcome === 'truce' && hasArcade) {
          return Math.floor(elapsed / 20) % 2 ? openShift[id] : assignments.community[id];
        }
        if (id === 'ines' && Math.floor(elapsed / 12) % 2 === 1) return streetPatrol;
      }
      return assignments[phase][id];
    },
    tick(dt, arrived) {
      elapsed += dt;
      if (phase === 'routine' && elapsed >= 9) enter('gathering');
      else if (phase === 'gathering') {
        if (elapsed >= 3 && DISTRICT_CAST.every(({ id }) => arrived(id))) {
          witnessedClash = Object.keys(reports).filter(arrived);
          mayaSawClash = witnessedClash.includes('maya');
          enter('clash');
        } else if (elapsed >= 45) enter('aborted');
      } else if (phase === 'aborted' && elapsed >= 45) enter('gathering');
      else if (phase === 'clash' && elapsed >= 7) {
        remember(reports, id => witnessedClash.includes(id));
        settle('clash');
        enter('aftermath');
      } else if (phase === 'aftermath' && elapsed >= 75) enter('settled');
      else if (phase === 'settled' && elapsed >= 40 && hasArcade) {
        enter(outcome === 'truce' ? 'community' : 'mediation');
      } else if (phase === 'mediation') {
        const rivalsMet = arrived('roe') && arrived('jax');
        const mediatorsMet = arrived('nia') && arrived('skye');
        if (elapsed >= 12 && rivalsMet && mediatorsMet) {
          remember(truceReports, arrived);
          settle('truce');
          enter('settled');
        } else if (elapsed >= 150) {
          if (rivalsMet) {
            remember(walkoutReports, arrived);
            settle('walkout');
          }
          enter('settled');
        }
      } else if (phase === 'community') {
        const groupMet = ['jax', 'nia', 'skye', 'dex'].every(arrived);
        if (elapsed >= 20 && groupMet) {
          remember(communityReports, arrived);
          enter('settled');
        } else if (elapsed >= COMMUNITY_WINDOW) enter('settled');
      }
    },
    recall(id) { return pendingReports.get(id)?.shift() ?? null; }
  };
}
