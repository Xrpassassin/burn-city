// Animation helper for rigged NFT crew GLBs. The caller owns the Three.js clock.
export function createCrewAnimator({ THREE, model, animations = [] }) {
  if (!THREE?.AnimationMixer || !model) return { ok: false, reason: 'missing-three-or-model' };
  const mixer = new THREE.AnimationMixer(model);
  const clips = new Map();
  for (const clip of animations) {
    if (clip && typeof clip.name === 'string' && clip.name.trim()) clips.set(clip.name.toLowerCase(), clip);
  }
  let active = null;
  function play(name, fadeSeconds = 0.2) {
    const clip = clips.get(String(name).toLowerCase());
    if (!clip) return false;
    const action = mixer.clipAction(clip);
    if (action !== active) {
      action.reset();
      if (active && typeof active.fadeOut === 'function') active.fadeOut(fadeSeconds);
      if (typeof action.fadeIn === 'function') action.fadeIn(fadeSeconds);
      action.play();
      active = action;
    }
    return true;
  }
  function playIdle() {
    for (const name of ['idle', 'idle_01', 'standing', 'breathing']) if (play(name)) return true;
    return false;
  }
  function update(delta) {
    if (Number.isFinite(delta) && delta > 0) mixer.update(Math.min(delta, 0.1));
  }
  function dispose() {
    if (typeof mixer.stopAllAction === 'function') mixer.stopAllAction();
    if (typeof mixer.uncacheRoot === 'function') mixer.uncacheRoot(model);
    active = null;
  }
  return { ok: true, play, playIdle, update, dispose };
}
