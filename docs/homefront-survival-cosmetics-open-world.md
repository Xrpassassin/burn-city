# Homefront: Survival, Cosmetics, UI, and Open-World Gameplay Design

## Product direction

Homefront should feel like a persistent survival RPG alongside BURN City, not a menu of disconnected reward buttons. Players should make meaningful field choices, read the world through sound, lighting, landmarks, silhouettes, and environmental clues, and return to a refuge that visibly reflects their decisions.

“Open world” means players can travel freely through connected districts and choose risk/reward routes. The current procedural Graveyard is a prototype blockout, not yet a finished city; keep that distinction clear in reviews.

## Survival loop now implemented

- Server-owned field condition: health, hunger, thirst, stamina, infection pressure, and last-tick timestamp.
- Hunger and thirst decay only while the player is active in the Graveyard; no offline starvation.
- Movement costs stamina. Critical hunger/thirst gradually pressure health.
- Eat one food ration to restore hunger, drink one clean-water unit to restore thirst, use one medicine to restore health/reduce infection pressure, or catch your breath to restore stamina.
- Water is a persistent refuge resource and is available from the Ember Exchange.
- Values are stored with the shared-world player record and returned as selfSurvival; the UI displays readable values and condition bars.
- Survival actions require an authenticated player currently in the expedition. Costs and effects are applied server-side.

## Intended survival depth

1. **Condition, not busywork:** hunger/thirst should be slow pressures that encourage preparation, not constant button mashing. Health should not tick down unless needs are critically depleted or a combat hazard causes injury.
2. **Readable consequences:** low stamina should slow movement or make attacks less effective; low health should trigger a clear retreat warning; infection should have a visible symptom and treatment path. Avoid hidden debuffs.
3. **Field recovery:** safe rooms, clean-water points, first-aid stashes, and rest spots should be authored world interactions. Medical stations at the refuge should improve recovery, not grant invulnerability.
4. **Risk by geography:** district depth, sight lines, noise, weather, time of day, and objective type determine danger. Do not introduce round-based escalation.
5. **Preparation choices:** carry enough water/food/ammo/medicine, or travel light for more loot capacity. Any carry limit must be clear in UI and server-enforced.
6. **No unfair offline loss:** no offline base destruction, starvation, or survivor death without an explicit opt-in rule and strong warning.

## Item inventory and skins

Keep functional item stats separate from cosmetic appearance. A skin must never secretly increase weapon damage, loot odds, movement, or ranked/main-world power.

### Proposed data contract
- inventory: owned functional item IDs and quantities, server-authoritative.
- equipment: weapon, tool, clothing/armor slots and equipped item IDs.
- cosmeticsOwned: stable skin IDs earned through play or purchased with Homefront-only Embers.
- cosmeticsEquipped: slot-to-skin mapping, validated against owned skins.
- appearance: authored body/face/hair presets, palette, and optional wear/dirt state. Do not send arbitrary materials/shaders from the client.
- Each skin record has id, slot, displayName, rarity, assetPath, palette, unlockRule, and a cosmetic-only flag.
- The server validates ownership and slot compatibility. The client receives only public cosmetic IDs and safe render parameters.

### Skin categories
- Weapons: rusted steel, wrapped grip, police surplus, industrial hazard stripe, medical salvage, rare expedition relics.
- Clothing: scavenger, medic, mechanic, watch guard, rain gear, cold-weather layers.
- Backpack/tool: water canteen, field radio, patched rucksack, med pouch, climbing rope.
- Refuge: banner, lighting, wall finish, campfire, storage markings. These are cosmetic settlement variants, not defense-stat shortcuts.

### Acquisition and economy
- Earn common skins from first-time district surveys, rescue milestones, and challenge achievements.
- Rare/epic skins can be crafted from cosmetic salvage and Embers.
- Do not sell power. Clearly label any future paid cosmetics and never mix Homefront purchases with BURN City ranked items unless deliberately designed and reviewed.
- Prevent duplicate grants unless a clear conversion system exists.

## UI/UX contract

### Expedition HUD
- Compact condition bars: health, hunger, thirst, stamina, infection.
- Inventory quick slots for food, water, medicine, and equipped weapon.
- Context action prompt near a cache, rescue, door, workstation, or safe room.
- Landmark name, district, risk level, and short objective text.
- Combat feedback: hit, blocked/out of range, ammo spent, enemy HP, reward, and retreat state.
- Touch targets at least 44px, safe-area aware, readable in daylight and dark mode, and usable without hover.

### Inventory and skin collection
- Filter tabs: All, Weapons, Tools, Clothing, Backpacks, Cosmetics, Consumables.
- Item cards show name, rarity, functional stats (if any), weight/capacity (if implemented), owned/equipped state, and exact cost.
- Skin preview uses the real target model with a before/after toggle. Never present a flat swatch as if it were a finished 3D skin.
- Equip/apply should be quick in safe areas. Confirm only when replacing a meaningful loadout.
- Accessibility: icon plus text, color is never the only rarity signal, and focus/keyboard navigation remains supported.

### World interaction
- Use diegetic world prompts near doors, caches, survivor groups, ladders, workbenches, radios, and safe rooms.
- Every marker needs a recognizable icon and a textual equivalent; markers must not obscure the skyline.
- Provide map, compass, journal, nearby objective, and optional reduced-motion / low-effects settings.
- World soundscape should communicate distant horde pressure, interior/exterior transitions, weather, generator state, and safe-room ambience. Do not rely on audio alone for essential information.

## Open-world build roadmap

### Phase A — survival foundation (implemented first pass; needs live QA)
- [x] Add server-owned vitals, needs decay, stamina costs, recovery actions, clean-water resource, UI bars, and focused unit tests.
- [x] Connect infected retaliation to health loss and infection pressure.
- Keep field state in Homefront world persistence; never write into main BURN City saves or ranked progression.

### Phase B — physical interactions and inventory
- Introduce server-authoritative item definitions and inventory stacks.
- Add nearby interaction resolution by server-side distance and POI identity; the client may request an action but cannot select arbitrary rewards.
- Add doors/containers with persistent state, keyed access, search duration, and bounded loot tables.
- Add carry capacity only with clear item weights, storage UI, and a stash transfer action.

### Phase C — authored district identity
- Keep the procedural city for blockout, then layer authored landmarks, interiors, alleys, rooftops, underpasses, blocked routes, safe rooms, and shortcuts.
- Each district needs a visual palette, lighting/weather profile, ambient sound profile, loot table, infected roster, survivor stories, and optional objectives.
- Add collision/navmesh or waypoint navigation so AI cannot walk through buildings. Do not mistake decorative buildings for traversable interiors.
- Add persistence for opened doors, looted containers, rescue outcomes, and world events with reset/cooldown policies.

### Phase D — cosmetics and character presence
- [x] Add owned/equipped skin registry and validation to the save schema; add cosmetic collection UI with unlock/equip actions and cosmetic-only stat guard.
- [ ] Render selected skins on actual survivor avatars, weapon models, backpacks, and refuge assets.
- Render a real local survivor avatar and remote player avatars with safe, smoothed network updates.
- Apply weapon skins to the equipped weapon model, clothing/backpack cosmetics to the avatar, and refuge skins to corresponding structure materials.
- Use existing bundled assets or properly licensed open-source assets; record provenance and licenses. Avoid external runtime CDN dependencies.

### Phase E — atmosphere and dynamic events
- Day/night cycle and weather should affect visibility, audio, and tactical decisions, with mobile performance options.
- Dynamic events: generator outages, distress-radio calls, wandering hordes, rescue convoys, locked quarantine doors, and rare high-risk caches.
- World events are optional and location-based. Alien invasion remains a future event, not part of the initial playable acceptance target.
- Keep server ownership of event triggers, rewards, cooldowns, and world state.

## Engineering guardrails
- Keep Homefront as an isolated, unranked mode; current API is hosted in the existing BURN City server and still needs a dedicated runtime/deployment for strict instance isolation.
- Do not trust client-provided account IDs, loot rolls, skin ownership, coordinates for rewards, or resource deltas.
- Validate save migrations and preserve existing saves when adding new fields.
- This document is a plan, not proof that all roadmap features are implemented. Browser/mobile playtesting and current CI are still required.
