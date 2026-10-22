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


---

# Refined implementation framework

This section turns the product plan into explicit module boundaries, data contracts, state transitions and acceptance tests. Names below are proposed interfaces, not existing production APIs.

## 1. Proposed repository shape

Keep the first prototype self-contained and framework-neutral. Do not add a server process or dependencies until the Phase 0 audit confirms the right deployment boundary.

    client/moba/
      index.html
      src/app.mjs
      src/match-client.mjs
      src/input/command-mapper.mjs
      src/camera/camera-controller.mjs
      src/camera/isometric-camera.mjs
      src/camera/third-person-camera.mjs
      src/ui/hud.mjs
      src/ui/minimap.mjs
      src/ui/scoreboard.mjs
      src/presentation/hero-view.mjs
      tests/camera-parity.test.mjs
    server/moba/
      protocol.mjs
      match-session.mjs
      simulation.mjs
      combat-rules.mjs
      objectives.mjs
      bots/controller.mjs
      bots/difficulty-profiles.mjs
      matchmaking/queue-policy.mjs
      matchmaking/backfill.mjs
      results/match-record.mjs
      results/ranked-adapter.mjs

This is a logical target layout, not a mandate to create every file in one pass. The first code PR should add only a renderer-independent rules core and tests; add a rendered prototype only after contracts are reviewed. Reuse repository conventions and existing components where safe; do not duplicate camera/rendering infrastructure unnecessarily.

## 2. Core domain model

Use plain serializable data at boundaries. Keep render objects, callbacks, DOM elements and Three.js objects out of authoritative state.

    match = {
      schemaVersion: 1,
      matchId: "server-generated-id",
      rulesetId: "classic-5v5",
      status: "live",
      tick: 0,
      teams: [
        { teamId: "blue", coreHealth: 10000, playerSlots: [] },
        { teamId: "red", coreHealth: 10000, playerSlots: [] }
      ],
      entities: [],
      objectives: [],
      visibilityByPlayer: {},
      result: null
    }

Required concepts:
- **MatchSession:** match ID, ruleset version, lifecycle, roster, server clock, reconnect deadlines and result status.
- **PlayerSlot:** stable slot ID, team, selected hero, controller type (human, bot, empty), connection state and bot profile when applicable.
- **HeroState:** position/velocity, health/resources, level/experience, cooldowns, status effects, respawn state and server-issued entity ID.
- **AbilityDefinition:** immutable targeting, range, cooldown, cost, windup, effect and valid-target rules.
- **MatchRecord:** final roster/controller history, result, ruleset version, duration, disconnects, anti-cheat flags and rating disposition.
- **CameraPreference:** client-only setting; never authoritative combat state.

Use stable server-issued entity IDs. Reject invalid values at network boundaries. Never accept client-submitted health, cooldown, damage, objective completion, win/loss, rating or reward amount.

## 3. Network command and snapshot contract

The client sends intent, not outcomes. The server validates each intent against current state.

Proposed client-to-server messages:
- match.ready: player confirms assets and controls are ready.
- hero.select: requested hero ID, only during selection.
- input.move: normalized movement vector and sequence number.
- ability.cast: ability ID, target entity or aim point, and sequence number.
- target.request: optional target preference; server validates visibility and range.
- match.ping: limited, rate-limited tactical ping.
- session.reconnect: authenticated session token and last acknowledged sequence.

Proposed server-to-client messages:
- match.snapshot: authoritative tick, visible entity state and event sequence.
- match.event: validated events such as ability started, damage applied, tower destroyed, hero defeated or objective captured.
- match.roster: teams, human/bot slot markers and reconnect status.
- match.phase: lifecycle transitions and timers.
- match.finalized: immutable result summary and record ID.

Protocol requirements:
- Validate payload size, types, ranges, enum values, ownership and rate limits.
- Include schema/ruleset versions and monotonic sequence/tick identifiers.
- Client prediction may improve responsiveness, but reconciliation returns to authoritative state.
- Send only opponents/entities visible under server visibility rules.
- Reuse existing auth/session only after audit; do not invent a parallel identity or wallet token.
- Never place signing keys or XRP payout credentials in browser code.

## 4. Match state machine

    created -> queueing -> assembling_roster -> ready_check -> loading
      -> live -> resolving_result -> finalized -> returned_to_hub

    queueing / assembling_roster / ready_check / loading -> cancelled
    live -> recovery -> live or resolving_result

Every transition needs one owner and explicit timeout behavior. Finalization must be idempotent: duplicate finish messages or reconnect retries cannot grant duplicate rating or rewards. If the server cannot establish a trustworthy result, mark it void or disputed rather than infer a winner from client reports.

## 5. AI slot and difficulty contract

A bot occupies a normal player slot and submits permitted intents through the same simulation boundary. It cannot bypass combat validation.

Suggested difficulty profile fields:
- reaction delay range;
- decision update interval;
- pathing and positioning quality;
- last-hit timing tolerance;
- retreat and resource thresholds;
- objective-priority weights;
- team-coordination level;
- hero familiarity and combo proficiency.

Difficulty changes decision quality and consistency, not hidden combat math. Keep each bot profile stable for a match; do not silently escalate difficulty because a human is winning.

Backfill policy:
1. Determine queue mode and allowed human/bot composition.
2. Fill missing slots with the selected, disclosed bot profile.
3. Publish roster and bot slots before ready check.
4. Lock roster at match start except documented disconnect takeover.
5. On disconnect, start a grace timer; if policy permits, bot takeover is recorded as a match event.
6. On reconnect, pause bot decisions at a safe simulation boundary and transfer control exactly once.
7. Finalize controller history for ranked eligibility and review.

Recommended queues: Practice vs AI (always available), Unranked 5v5 (AI fill after a wait), and later Ranked 5v5 (human-only by default until a published bot policy is approved). Never label a bot-filled match as human-only ranked.

## 6. Dual-camera parity framework

Camera changes only a local view adapter. The match client continues to emit the same normalized intent schema.

    keyboard / touch / controller
                |
          command mapper
                |
          match client ---- authoritative server
                |
           local hero target
             /          \
        isometric     third-person
          camera         camera

Acceptance tests:
- Switching camera 100 times during movement does not duplicate input or alter server hero identity.
- Cooldowns, health, position, hit results and ability ranges remain unchanged across camera choices.
- Hidden enemies remain hidden in both views; no camera sees through walls or bypasses fog-of-war.
- Switching while stunned, casting, dead, respawning, crowded or reconnecting does not reset ability state.
- Phone controls respect safe-area insets and touch targets of at least 44 CSS px.
- If aiming differs by camera, define a fair server-side target-resolution policy and test it before ranked release.

## 7. Initial combat and map rules

Use versioned, data-driven rules. Keep the first prototype deliberately small:
- One test hero per team initially; expand to three archetypes after movement/camera/combat is stable.
- Three lanes are the long-term target; prototype one short lane and two base structures first if that accelerates iteration.
- Basic attack, one active ability, health/resource, death/respawn, one tower per side, minion waves and a core win condition.
- No inventory shop, jungle, ranked rating, XRP integration or persistent hero power in the first vertical slice.

A renderer-free simulation test must advance ticks and assert movement bounds, cooldown enforcement, damage limits, death/respawn and win-condition finalization without launching a browser.

## 8. Ranked result and XRP adapter boundary

The ranked adapter accepts only a finalized server-generated MatchRecord. It returns eligible, ineligible or review plus reason codes; it does not transfer funds.

Before ranked beta, define allowed rulesets, minimum human participation, bot-slot policy, surrender/disconnect/remake/server-crash outcomes, anti-smurf and collusion review, rating reversals, season placement and public rules.

A future XRP service is a separate trust boundary. It must independently verify eligibility, use server-controlled limits, record transaction IDs and reconcile failures. No client-triggered payout and no automated financial reward in this framework.

## 9. Test matrix and exit gates

| Area | Required proof before advancing |
|---|---|
| Pure rules | Deterministic tests for cooldown, range, damage, death, respawn, objectives and core destruction |
| Camera | Parity tests; no state reset or hidden-information leak |
| AI | Full roster fill, disclosed bot slots, difficulty profiles and reconnect handoff without duplicate control |
| Protocol | Reject invalid payloads, spoofed entities, stale sequences, replays, rate-limit violations and oversized messages |
| Match lifecycle | Every valid transition, timeout/cancel paths and idempotent finalization |
| Ranked | Bot policy, disconnect disposition, duplicate-result rejection and rating audit trail |
| Mobile | Portrait/landscape, safe-area controls, camera toggle and readable ability telegraphs |
| Performance | Target-player simulation and low-end mobile render budget measured before public beta |
| Security | Server-authority audit, session authentication and no wallet secrets in client |
| Integration | Launch/return through existing experience contract, only after review and behind an opt-in entry |

## 10. Refined implementation order

1. **Audit-only:** confirm the existing experience registry, auth/session path, Node server, websocket patterns, test scripts and open PR conflicts. Record findings without touching live files.
2. **Rules core:** pure modules for match lifecycle, player slots, combat primitives and validation, with deterministic Node tests. No Three.js dependency.
3. **Camera lab:** isolated client prototype uses the same local hero state and input mapper with two camera adapters. Not connected to ranked or live hub.
4. **Local AI:** basic bot uses the same command interface; add difficulty parameters and simulation tests.
5. **Offline vertical slice:** one lane, two heroes, minions/towers/core and both cameras. Demonstrate match win and return screen.
6. **Dedicated online match:** only after security/session review, add server authority, matchmaking, backfill, reconnect and match records.
7. **Ranked beta:** human-only by default, rating service, audit/appeal policy and anti-cheat.
8. **XRP/event extensions:** separately reviewed and disabled by default; world invasion first appears in an unranked event mode.

**Definition of done for the first implementation PR:** a pure rules core with tests, no production imports, no runtime route, no save migration, no new dependency, and a review note explaining how a standalone MOBA client/server will consume it. Do not bundle camera prototype or wallet functionality into that first PR.
