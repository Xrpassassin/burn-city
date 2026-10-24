# Estates Island third-person controller adapter

`client/js/estates-island-controller.mjs` connects the island's collision/proximity layer to the existing game's actor and camera objects. It deliberately receives the existing player input rather than installing a second keyboard/touch system.

## Host integration contract

The host creates the controller only after the island scene and its navigation manifest exist:

```js
import { createEstatesIslandController } from './estates-island-controller.mjs';

const controller = createEstatesIslandController({
  manifest: estatesRuntime.manifest,
  actor: avatar,
  camera: C,
  input: ({ dt, yaw, moveX, moveZ }) => ({
    // Convert the game's camera-relative input into world-space delta in metres.
    delta: { x: moveX * dt, z: moveZ * dt }
  }),
  onPropertyPrompt: property => showInspectPropertyPrompt(property),
  onPropertyPromptClear: () => hideInspectPropertyPrompt(),
  onExitPrompt: state => showReturnToCityPrompt(state)
});

// In the active island branch of the host's existing frame loop:
const state = controller.update({
  dt, yaw: playerYaw, moveX: desiredWorldVelocityX, moveZ: desiredWorldVelocityZ,
  interactPressed: justPressedInteract,
  exitPressed: justPressedExit
});

// On island teardown:
controller.dispose();
```

This is an integration contract, not a claim that the above host variables or prompt functions already exist. The host must route its existing keyboard/mobile input through the adapter only while Estates is active. Its `input` callback may return a `delta` in world-space metres; without that field, `moveX` and `moveZ` are treated as world-space velocity components and multiplied by `dt`.

## Behavior

- Resolves horizontal movement against the island boundary, lake, assigned building footprints, tree collision radii, and landmark-specific collision shapes (kiosk/market counters, plaza fixtures, overlook rails, and trailhead sign).
- Preserves the actor's vertical coordinate; the host remains responsible for jumping, gravity, animation, and floor height.
- Smoothly follows the actor with the existing camera and points it toward the actor's look target.
- Emits property inspection prompt changes only when the nearby lot changes; an interaction press marks the property result as confirmed.
- Emits the return-to-city prompt only when entering/leaving the gate radius. The host still requires a deliberate confirmation before invoking the trusted exit callback.
- Does not assign ownership to unassigned lots or trust client-supplied owner IDs.

## Remaining integration work

The adapter is now wired into `client/js/app.js` through `client/js/estates-island-live.mjs`. The live host renders the island at world X=650, adds a bridge from the city-side gate (X=445, Z=188), routes the existing Explore input through collision-aware island movement after explicit entry, and returns the player to the city gate on explicit confirmation. The island and bridge use the existing Three.js scene and camera; the service worker precaches the integration module.

This is a playable local traversal/inspection layer, not yet a networked shared instance. The live catalog currently has nine property records mapped to 21 physical lot anchors; unassigned lots remain unassigned. Property inspection is read-only. Private property access/building, verified wallet ownership, server-authoritative authorization, multiplayer replication, saved placement, and shared-instance routing are not enabled. Before enabling those features, connect a trusted server session and authorization policy rather than accepting a client-supplied owner ID. The chosen X=650 transform is a first integration placement and still needs a visual/browser collision QA pass against the complete city scene.
