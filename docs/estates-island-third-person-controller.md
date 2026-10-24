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

- Resolves horizontal movement against the island boundary, lake, assigned building footprints, and tree collision radii.
- Preserves the actor's vertical coordinate; the host remains responsible for jumping, gravity, animation, and floor height.
- Smoothly follows the actor with the existing camera and points it toward the actor's look target.
- Emits property inspection prompt changes only when the nearby lot changes; an interaction press marks the property result as confirmed.
- Emits the return-to-city prompt only when entering/leaving the gate radius. The host still requires a deliberate confirmation before invoking the trusted exit callback.
- Does not assign ownership to unassigned lots or trust client-supplied owner IDs.

## Remaining integration work

The adapter is not yet wired into `client/js/app.js`'s live frame loop, and no physical bridge placement has been chosen in the city coordinate system. Do not enable it by fabricating authentication or authorization callbacks. Next integration work must select a non-overlapping world transform, preserve city-side player/camera state for return, and connect the real UI plus authenticated shared-instance router.
