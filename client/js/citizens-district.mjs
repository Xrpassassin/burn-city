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
  }
};

const streetPatrol = duty('west', 'Patrolling Main Street');

const reports = {
  maya: 'I saw Roe get in Jax’s face. I closed early before anyone else got dragged into it.',
  skye: 'From where I stood, Jax made the first move. Nia was the one who got him to leave.',
  ines: 'Maya was shaken. I’m keeping my patrol on this block for the rest of the shift.',
  roe: 'Jax and I both lost our patience. I owe the precinct a report.',
  jax: 'I would’ve stayed if Nia hadn’t asked me herself.',
  nia: 'I got Jax out of there. I’m going to find Skye later and see how she’s doing.'
};

const positions = {
  'west-end': [-10, 1], west: [-7, 0], 'near-west': [-3.4, 0],
  left: [-.85, 0], right: [.85, 0], 'near-east': [3.4, 0],
  east: [7, 0], 'east-end': [10, 1], witness: [-4, 2.8], door: [0, 3.1]
};

export function districtTargets(coffee, colliders = []) {
  const forward = { x: Math.sin(coffee.yaw), z: Math.cos(coffee.yaw) };
  const targets = {};
  for (const [id, [along, towardShop]] of Object.entries(positions)) {
    const at = distance => ({
      x: coffee.door.x + forward.z * along - forward.x * (distance - towardShop),
      z: coffee.door.z - forward.x * along - forward.z * (distance - towardShop)
    });
    let point = at(5.3);
    for (let distance = 5.8; distance <= 11.3; distance += .5) {
      if (!colliders.some(o => o.r && Math.hypot(point.x - o.x, point.z - o.z) < o.r + .65)) break;
      point = at(distance);
    }
    targets[districtPlace(id)] = point;
  }
  return targets;
}

export function makeDistrict() {
  let phase = 'routine', elapsed = 0;
  const witnesses = new Set(), heard = new Set();
  function enter(next) { phase = next; elapsed = 0; }
  return {
    get phase() { return phase; },
    get coffeeClosed() { return phase === 'aftermath' && witnesses.has('maya'); },
    assignment(id) {
      if (phase === 'aborted') return assignments.routine[id];
      if (phase === 'aftermath' && !witnesses.has('maya')) {
        if (id === 'maya') return assignments.routine.maya;
        if (id === 'ines') return streetPatrol;
      }
      if (phase === 'settled' && id === 'ines' && Math.floor(elapsed / 12) % 2 === 1) return streetPatrol;
      return assignments[phase][id];
    },
    tick(dt, arrived) {
      elapsed += dt;
      if (phase === 'routine' && elapsed >= 9) enter('gathering');
      else if (phase === 'gathering') {
        if (elapsed >= 3 && DISTRICT_CAST.every(({ id }) => arrived(id))) {
          for (const id of Object.keys(reports)) if (arrived(id)) witnesses.add(id);
          enter('clash');
        } else if (elapsed >= 45) enter('aborted');
      } else if (phase === 'clash' && elapsed >= 7) enter('aftermath');
      else if (phase === 'aftermath' && elapsed >= 75) enter('settled');
    },
    recall(id) {
      if ((phase !== 'aftermath' && phase !== 'settled') || !witnesses.has(id) || heard.has(id)) return null;
      heard.add(id);
      return reports[id];
    }
  };
}
