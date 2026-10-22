# BURN City MOBA — Architecture and Product Contract

**Status:** proposal only; no live runtime changes.  
**Target:** a future, separately instanced MOBA launched from BURN City.  
**Coordination:** keep this work isolated from Hark's active branches. Do not merge, deploy, add dependencies, or wire the prototype into production without review.

## Product decisions

- **One match, two camera modes:** tactical isometric/top-down and close third-person. Players can switch during a match without changing hero identity, match state, abilities, cooldowns, target state, or progression.
- **Initial match format:** classic 5v5 as the target ruleset. The matchmaking system must support incomplete queues by filling missing slots with AI; a smaller 3v3 mode can be considered later, not used as a silent substitute for ranked 5v5.
- **BURN City connection:** launch as a distinct game experience from the existing Movement & Games hub. Reuse the BURN City identity/lore where appropriate, but isolate match simulation, matchmaking, combat authority, and match lifecycle from the city runtime.
- **Ranked and XRP:** design interfaces for ranked rating, season records, eligibility and reward settlement, but do not enable XRP wagers, entry fees, prize pools or automated payouts in the first prototype. Those require separate security, abuse, economy, and legal review.

## Camera contract

Both camera modes are views of the same authoritative world, not separate game modes.

### Tactical isometric / top-down
- Default for map awareness, lane reads, objective planning and coordinated team fights.
- Supports clear telegraphs, readable ability ranges and tactical minimap information.
- Input maps to the same normalized movement/ability commands as third-person mode.

### Close third-person
- Follow camera behind or near the hero, with collision-aware camera placement and mobile-friendly orbit/aim controls.
- Adds a more personal sense of movement and combat without changing damage, range, cooldowns, vision rules or hit validation.
- Must not reveal hidden opponents or objectives that are not available under the match's visibility rules.

### Switching and competitive fairness
- Camera switch is local presentation state and must not reset movement, lock-on, targeting, cooldowns or input state.
- Server validates movement, attacks, cooldowns, visibility, damage and objectives independently of camera choice.
- Camera-specific targeting assistance may differ in interface but must resolve to the same server-validated rules.
- Test camera switching during combat, crowding, death/respawn, mobile touch input and reconnect.
- If third-person view proves to provide a meaningful visibility or aiming advantage, tune visibility/aiming rules or restrict camera selection in ranked until parity is demonstrated.

## Match and map model

Initial target is a readable three-lane map with two bases, towers, minion waves, jungle routes/camps and neutral objectives. The win condition is to destroy the opposing core. Start with a small map and a limited number of original heroes; avoid cloning copyrighted champions, names, art, voice lines or ability designs from existing games.

A match should have explicit lifecycle states:
1. queueing;
2. team/role assignment;
3. loading and ready check;
4. live match;
5. pause/disconnect recovery where supported;
6. victory/defeat finalization;
7. server-verified results and return to the BURN City hub.

Each match runs in its own server-authoritative instance. Match state is isolated from city movement and the existing arena/dungeon runtimes. Share only stable identity/lore/entitlement interfaces after their ownership and security contracts are reviewed.

## AI backfill and difficulty

### Queue fill
- The target lobby is 10 slots (5 per side).
- When the queue timer expires or the player chooses an AI practice queue, fill empty slots with bots rather than leaving the lobby unusable.
- Support a configuration such as Easy, Normal, Hard and Expert, but keep difficulty a server-selected match property, not a client-supplied trust value.
- Make bot participation visible before the match starts and record which slots were AI-controlled.
- If a human disconnects, a bot may take over after a grace period. Reconnection should return control only through an explicit safe handoff; do not create two controllers for one hero.
- Avoid swapping a bot for a human mid-combat unless the control transition can be made safely and transparently.

### Bot behavior progression
1. **Phase 1:** lane-following, basic attacks, safe retreat, tower avoidance and simple ability use.
2. **Phase 2:** last-hitting/farming, wave awareness, tower defense, recalls/resets and team grouping.
3. **Phase 3:** objective timing, role/hero-specific behavior, team fight positioning, pings and coordinated decisions.
4. **Phase 4:** difficulty tuning using reaction delay, tactical priorities, execution consistency and information limits—not hidden omniscience or impossible reaction speed.

Bots must obey the same map visibility, cooldown, movement, resource and damage rules as players. Difficulty should not secretly multiply damage or health in competitive play. Practice modes may use explicit, disclosed modifiers.

## Ranked system and future XRP rewards

- Keep unranked, AI practice and ranked queues distinct.
- Use a rating system such as an Elo/Glicko-family rating with placement matches, uncertainty, seasonal resets and server-verified results; choose the exact algorithm after match duration and population data exist.
- Store match IDs, roster, human/bot slots, camera choices, disconnects, result, ruleset version and rating changes in an auditable result record.
- AI-filled ranked matches must have published rules. Prefer a separate bot-assisted ranked queue or exclude AI-only outcomes from standard ranked rating until abuse and fairness analysis establishes safe rules.
- Never let clients submit authoritative win/loss, rating, reward amount or XRP payout values.
- Keep competitive rating separate from cosmetic/lore progression and wallet eligibility.
- XRP integration is a later phase: define eligibility, sanctions/geographic restrictions as applicable, anti-bot and anti-collusion controls, treasury limits, dispute handling, transaction reconciliation and legal review before any transfer. Do not market it as a guaranteed earning mechanism.
- No entry fees, wagering, pooled stakes or automated on-chain prize distribution in the initial MOBA prototype.

## Future world events

An alien invasion or other BURN City world event can later appear as a **separate, opt-in unranked ruleset** or limited-time event. It may affect map objectives or introduce a neutral threat, but must not enter ranked matches until the event is balanced, deterministic enough for competition and fully visible to all players. Shared city-world events and MOBA match instances must communicate through an explicit event contract rather than directly mutating each other's state.

## Suggested architecture boundaries

- **MOBA shell/client:** HUD, minimap, input mapping, camera controller, accessibility and mobile layout.
- **Camera adapters:** isometric and third-person presentation; neither owns combat truth.
- **Match simulation:** server-owned movement validation, abilities, combat, visibility, minions, towers, objectives and win conditions.
- **Matchmaking:** queues, team composition, AI backfill policy, reconnect handoff and region selection.
- **Bot controller:** difficulty profiles and tactical decisions, emitting the same permitted player-intent commands as a human client.
- **Ranked service:** season/rating updates from finalized server match records.
- **Reward settlement adapter:** future interface only; disabled until separately approved.
- **BURN City bridge:** launch/return to hub and reviewed identity/lore entitlements; no dependency on the city's render loop for match simulation.

The actual server framework and current authentication/session contracts must be inspected before implementation. This document does not assume a new engine, server framework, database, or dependency.

## Delivery phases and acceptance gates

### Phase 0 — repository audit
- Inventory current game launch/return contracts, auth/session behavior, test scripts, server runtime, deployment constraints and open PR conflicts.
- Hark reviews ownership boundaries and whether a separate match process is needed.
- Do not touch the live city/arena/dungeon files.

### Phase 1 — offline vertical slice
- One small map, one hero, basic movement/attack, two camera modes and a local bot.
- Switching views preserves the exact same hero and match state.
- No wallet, ranked rating, persistence migration or production route.

### Phase 2 — playable 5v5 simulation
- Three hero archetypes, minion waves, towers, base/core objective and bots with multiple difficulty profiles.
- Add deterministic simulations for combat invariants, bot slot filling, disconnect/reconnect handoff and win-condition finalization.

### Phase 3 — online unranked
- Dedicated authoritative match instance, matchmaking, reconnects, result records, mobile controls and performance budget.
- Load/security tests before public access.

### Phase 4 — ranked beta
- Rating/season records, anti-cheat and bot-participation policy, review tools and public rules.
- Camera fairness tests required before both perspectives are allowed in ranked.

### Phase 5 — optional XRP rewards / world events
- Separate security, economy, legal and abuse review before enabling any financial feature.
- Alien invasion and other special rulesets start in unranked only.

## Review checklist for Hark

1. Confirm the MOBA should remain an independent match experience, launched from BURN City.
2. Audit the existing client/server/session contracts before choosing process boundaries.
3. Review camera parity, server authority, mobile controls and information visibility.
4. Review AI backfill policy and whether bot-assisted matches belong in standard ranked.
5. Review XRP reward settlement as a disabled future interface only.
6. Confirm the proposed phases avoid collision with open gameplay PRs.

## Non-goals for this proposal

No production MOBA, new server, dependencies, wallet integration, ranked ladder, live AI agents, save migration, database changes, runtime imports, or deployment. This is an architecture contract for review, not a claim that the game mode is implemented.
