// Estates island entry/exit adapter. UI calls showPrompt on proximity and
// confirmEntry only after the player explicitly accepts the prompt.
// Authentication/authorization callbacks must be backed by the trusted session/server.
export function createEstatesEntryAdapter({
  instancePool,
  authenticatePlayer,
  authorizeEntry,
  transitionToInstance,
  returnToCity,
  onState = () => {},
  instanceKey = 'estates-island',
  defaultReturnAnchor = 'estates-island-entrance'
} = {}) {
  if (!instancePool || typeof instancePool.acquire !== 'function') throw new TypeError('instancePool.acquire is required');
  for (const [name, fn] of Object.entries({ authenticatePlayer, authorizeEntry, transitionToInstance, returnToCity })) {
    if (typeof fn !== 'function') throw new TypeError(name + ' callback is required');
  }
  if (typeof instanceKey !== 'string' || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(instanceKey)) {
    throw new TypeError('instanceKey must be stable kebab-case');
  }

  let promptVisible = false;
  let transitionPending = false;
  let activeLease = null;
  let activePlayerId = null;
  let returnAnchor = defaultReturnAnchor;
  const notify = event => { try { onState(Object.freeze({ ...event })); } catch { /* UI observers cannot break travel. */ } };

  function showPrompt({ returnTo = defaultReturnAnchor } = {}) {
    if (activeLease || transitionPending) return { shown: false, reason: 'transition-unavailable' };
    returnAnchor = typeof returnTo === 'string' && returnTo.trim() ? returnTo : defaultReturnAnchor;
    promptVisible = true;
    notify({ state: 'prompt', destinationId: 'estates-island', returnTo: returnAnchor, requiresConfirmation: true });
    return { shown: true, requiresConfirmation: true, destinationId: 'estates-island' };
  }

  function cancelPrompt() {
    if (!promptVisible || transitionPending) return false;
    promptVisible = false;
    notify({ state: 'prompt-cancelled', destinationId: 'estates-island' });
    return true;
  }

  async function confirmEntry(context = {}) {
    if (!promptVisible) return { ok: false, reason: 'confirmation-required' };
    if (transitionPending) return { ok: false, reason: 'transition-in-progress' };
    if (activeLease) return { ok: false, reason: 'already-inside' };
    transitionPending = true;
    promptVisible = false;
    notify({ state: 'authorizing', destinationId: 'estates-island' });
    let lease = null;
    try {
      const principal = await authenticatePlayer(context);
      if (!principal || typeof principal.id !== 'string' || !principal.id.trim()) {
        return { ok: false, reason: 'authentication-required' };
      }
      const authorization = await authorizeEntry(principal, { destinationId: 'estates-island', context });
      if (authorization !== true && !(authorization && authorization.allowed === true)) {
        notify({ state: 'entry-denied', destinationId: 'estates-island' });
        return { ok: false, reason: 'entry-denied' };
      }

      // Pool acquisition is deliberately after authenticated identity and access checks.
      lease = await instancePool.acquire(instanceKey, principal.id, {
        entranceId: context.entranceId ?? 'estates-island-entrance',
        returnTo: returnAnchor
      });
      await transitionToInstance({
        principal,
        instance: lease.instance,
        instanceKey,
        destinationId: 'estates-island',
        returnTo: returnAnchor,
        context
      });
      activeLease = lease;
      activePlayerId = principal.id;
      lease = null;
      notify({ state: 'entered', destinationId: 'estates-island', playerId: activePlayerId, returnTo: returnAnchor });
      return { ok: true, destinationId: 'estates-island', returnTo: returnAnchor };
    } catch (error) {
      notify({ state: 'entry-failed', destinationId: 'estates-island', error });
      return { ok: false, reason: 'entry-failed', error };
    } finally {
      if (lease) lease.release();
      transitionPending = false;
      if (!activeLease) promptVisible = true;
      notify({ state: 'idle', destinationId: 'estates-island', inside: Boolean(activeLease) });
    }
  }

  async function exit({ reason = 'player-exit' } = {}) {
    if (transitionPending) return { ok: false, reason: 'transition-in-progress' };
    if (!activeLease) return { ok: false, reason: 'not-inside' };
    transitionPending = true;
    const lease = activeLease;
    const playerId = activePlayerId;
    activeLease = null;
    activePlayerId = null;
    try {
      lease.release();
      await returnToCity({ playerId, returnTo: returnAnchor, reason });
      notify({ state: 'returned-to-city', destinationId: 'estates-island', returnTo: returnAnchor });
      return { ok: true, returnTo: returnAnchor };
    } catch (error) {
      notify({ state: 'return-failed', destinationId: 'estates-island', returnTo: returnAnchor, error });
      return { ok: false, reason: 'return-failed', returnTo: returnAnchor, error };
    } finally {
      transitionPending = false;
      notify({ state: 'idle', destinationId: 'estates-island', inside: Boolean(activeLease) });
    }
  }

  function disconnect() {
    promptVisible = false;
    if (!activeLease) return false;
    const lease = activeLease;
    activeLease = null;
    activePlayerId = null;
    lease.release();
    notify({ state: 'disconnected', destinationId: 'estates-island' });
    return true;
  }

  return Object.freeze({
    showPrompt,
    cancelPrompt,
    confirmEntry,
    exit,
    disconnect,
    get state() {
      return Object.freeze({ promptVisible, transitionPending, inside: Boolean(activeLease), playerId: activePlayerId, returnTo: returnAnchor });
    }
  });
}
