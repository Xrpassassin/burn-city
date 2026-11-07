# Homefront: one shared, open overworld

Status: **implementation contract for draft PR #566**. Do not promote the unfinished
continuous-movement path to production until the physical-device playtest and
desktop/phone expedition suites pass.

## Player experience

- Every survivor occupies **one common world coordinate space**. Towns, roads,
  patrols, salvage, bosses and enterable buildings are physical locations that
  other survivors can reach by travelling through the terrain. No per-wallet
  clone of the overworld, point-and-click replacement or iframe scene.
- Each player receives a **unique, persistent Homefront entry location** in
  that same world. The first assigned settlement is North Gate / Pine Crossing;
  subsequent survivors receive other collision-safe distant trailheads.
  Existing reservations survive offline exits, reconnects, party grouping and
  infected defeat. The shared world remains unchanged when any player logs out.
- The safe vicinity and rising difficulty are calculated **relative to that
  survivor's own Homefront**, not a global difficulty zone. Consequently two
  survivors physically standing at the same location can face different
  outbound danger because one has travelled farther from home.
- Nearby strangers must appear in each other's world snapshots. Party members
  can group, encounter the same infected patrols, and travel to the same
  building. The network interest grid culls unrelated distant players; it
  must not create different server world states for them.
- Shared salvage containers, environmental destruction, doors with shared
  switches, and world bosses have one server-owned physical state. Individual
  RPG progression, inventories, personal room discoveries, and rewards remain
  account-owned; clients cannot mint resources by sending scene/UI metadata.
- A defeated survivor returns to their own reserved Homefront trailhead with
  existing survival respawn and field-inventory rules. They do not respawn
  at another survivor's base or receive a replacement map.

## Current implementation

The wallet-authenticated `/api/homefront/world` routes use one persisted
`homefront-world.json` containing shared player presence, reserved
`refugeEntries`, patrol encounters, loot nodes, door mechanisms and parties.
The map is currently bounded by `WORLD_SIZE=100` and is chunk-rendered by
the client. This is the **shared-world foundation**, not yet the desired
large DayZ-scale wilderness.

Individual Homefront/refuge interiors currently use separate access-controlled
pockets linked from the common world. As we expand the map, those private
rooms should be anchored to **world-visible buildings at the owners' reserved
coordinates**, with invitation/access checks on entry. Do not create
independent open-world copies merely because individual bases are private.

**Known gap: wallet-free guests.** `server/homefront-guest.js` deliberately
creates a separate disposable in-memory store for every guest session and
returns `multiplayer:false`. Therefore guest players do **not yet share the
wallet-authenticated persistent world**; claims that all player types meet
would be inaccurate. Do not simply give anonymous guests the persistent
Homefront store: that would allow untrusted temporary accounts to mutate
shared save state without robust admission, expiry and abuse protection.

## Remaining production work

1. Design a **single shared authority** for wallet and guest presence with
   bounded anonymous-session identifiers, per-session throttles, online
   expiration/cleanup, and no automatic guest-to-wallet asset migration.
   Guests may play but may only save long-term personal progress after wallet
   authentication. Protect shared loot, PvP and invite permissions from abuse.
2. Place persistent Homefront structures in the shared world near reserved
   gates. Stream only nearby public-safe markers and solid geometry, and keep
   private interiors permission-gated rather than duplicating the map.
3. Replace legacy party leader-controlled walking and automatic party
   regrouping with an **explicit cooperative-follow option** for future
   open-world movement, preserving safe team transport only when requested.
4. Expand beyond today's small coordinate bounds through streamed terrain,
   roads, forest/town/industrial traversal, local encounter simulation and
   server-coordinated spatial partitioning. No invisible zone teleporting.
5. Test on a physical phone, validate 3D camera and zombie gameplay parity,
   and pass the desktop/mobile browser expedition suite before enabling
   continuous movement for production.

## Regression coverage

- `test/homefront-world-sim.js`: permanent gate allocation, retained gates,
  per-player exposure and defeat-return invariants.
- `test/homefront-single-overworld.test.js`: five separate assigned sites,
  reciprocal encounter presence, shared physical loot cooldown and persistence
  after another account returns from Homefront.
- `test/homefront-explore-multiplayer-sim.js`: real HTTP handler with four
  authenticated accounts using the **same world store** and shared buildings.
- `test/homefront-pine-relay-sim.mjs`: traversable physical relay route,
  collision, sound, local danger and server-owned scavenging.
