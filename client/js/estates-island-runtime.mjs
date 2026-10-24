// Compose the Estates Island manifest, Three.js renderer, and explicit entry/exit adapter.
// This is an integration seam for the host game; it does not create a renderer, camera,
// physics world, authenticated session, or server authorization policy by itself.
import { buildEstatesIslandScene, updateEstatesEntranceProximity } from './estates-island-scene.mjs';
import { createEstatesIslandRenderer } from './estates-island-renderer.mjs';
import { createEstatesEntryAdapter } from './estates-entry-adapter.mjs';

export function createEstatesIslandRuntime({
  THREE,
  scene,
  catalog,
  instancePool,
  authenticatePlayer,
  authorizeEntry,
  transitionToInstance,
  returnToCity,
  onState = () => {},
  seed = 20261024,
  instanceKey = 'estates-island'
} = {}) {
  if (typeof onState !== 'function') throw new TypeError('onState must be a function');
  const manifest = buildEstatesIslandScene({ catalog, seed });
  let disposed = false;
  const entryAdapter = createEstatesEntryAdapter({
    instancePool, authenticatePlayer, authorizeEntry, transitionToInstance, returnToCity,
    instanceKey,
    onState: event => { try { onState({ ...event, source: 'entry' }); } catch { /* Observers cannot break runtime. */ } }
  });
  const renderer = createEstatesIslandRenderer({
    THREE, scene, manifest,
    onInteract: item => {
      if (disposed || item.destinationId !== 'estates-island') return { shown: false, reason: 'runtime-unavailable' };
      return entryAdapter.showPrompt({ returnTo: item.returnAnchor ?? manifest.returnAnchor });
    }
  });

  function updateProximity(playerPosition, options = {}) {
    if (disposed) return Object.freeze({ near: false, promptVisible: false, requiresConfirmation: true, disposed: true });
    return updateEstatesEntranceProximity({
      adapter: entryAdapter,
      playerPosition,
      entrancePosition: manifest.access.find(item => item.id === 'island-gate').position,
      radius: options.radius ?? 7,
      wasPromptVisible: options.wasPromptVisible ?? entryAdapter.state.promptVisible
    });
  }

  return Object.freeze({
    manifest,
    renderer,
    entryAdapter,
    updateProximity,
    // The host UI must call this only after the player explicitly confirms the prompt.
    confirmEntry: context => disposed
      ? Promise.resolve({ ok: false, reason: 'runtime-disposed' })
      : entryAdapter.confirmEntry(context),
    exit: options => disposed
      ? Promise.resolve({ ok: false, reason: 'runtime-disposed' })
      : entryAdapter.exit(options),
    dispose() {
      if (disposed) return false;
      disposed = true;
      entryAdapter.disconnect();
      renderer.dispose();
      try { onState({ state: 'disposed', destinationId: 'estates-island', source: 'runtime' }); } catch { /* Observer isolation. */ }
      return true;
    },
    get isDisposed() { return disposed; }
  });
}
