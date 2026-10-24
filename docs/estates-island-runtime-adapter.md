# Estates Island runtime adapter

## Purpose

`client/js/estates-island-runtime.mjs` composes the existing scene manifest, optional Three.js renderer, and entry/exit adapter behind one host-facing API. It is an integration seam, not a full game bootstrap.

## Host integration

The host must provide its existing `THREE` namespace and scene, the catalog JSON, and trusted session/server callbacks for authentication and access authorization. It must also supply the actual instance pool and transition callbacks.

```js
import catalog from '../data/estate-catalog.json' with { type: 'json' };
import { createEstatesIslandRuntime } from '../js/estates-island-runtime.mjs';

const estates = createEstatesIslandRuntime({
  THREE,
  scene: cityScene,
  catalog,
  instancePool,
  authenticatePlayer: context => sessionApi.requirePlayer(context),
  authorizeEntry: (principal, request) => estateApi.canEnter(principal, request),
  transitionToInstance: payload => worldRouter.enterSharedInstance(payload),
  returnToCity: payload => worldRouter.returnToCity(payload)
});

// Call from the existing player-position update:
const proximity = estates.updateProximity(player.position);

// If near and proximity.promptVisible, show a UI prompt with an explicit Confirm button.
// Only that button should call:
await estates.confirmEntry({ source: 'estates-entry-ui' });

// The exit UI should call:
await estates.exit();

// When the host experience shuts down:
estates.dispose();
```

The example names `sessionApi`, `estateApi`, `worldRouter`, `instancePool`, and `cityScene` are host-owned dependencies, not existing implementations guaranteed by this module. Never authorize based on a client-supplied player ID; identity and access decisions must be server-backed.

## Lifecycle contract

- Building the runtime creates the manifest and renderer but does not enter the island.
- Proximity and entrance interaction only expose an explicit-confirmation prompt.
- `confirmEntry` delegates to the existing adapter, which authenticates and authorizes before acquiring an instance lease.
- `exit` releases the lease and calls the host return transition.
- `dispose` disconnects/releases any active lease and disposes renderer geometry/materials.
- The host still owns player movement, camera, collision/physics, rendering loop, UI prompt, network replication, persistence, and server-side instance lifecycle.

## Current content limitation

The current catalog file contains nine property records and the scene has 21 lot anchors. This adapter maps every catalog record to a lot; it does not discover or verify the project's complete owned NFT/property inventory. Expand the authored island layout before cataloging more than 21 properties.
