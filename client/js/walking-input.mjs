// Renderer-independent, normalized on-foot movement intent.
// x = right, z = forward. Consumers own physics, collisions, camera and animation.
const finite = value => Number.isFinite(value) ? value : 0;
export function walkingIntent(keys = new Set(), touch = {x:0,z:0}, run = false) {
  const pressed = key => keys?.has?.(key) === true;
  const keyboardX = Number(pressed('d') || pressed('arrowright')) - Number(pressed('a') || pressed('arrowleft'));
  const keyboardZ = Number(pressed('w') || pressed('arrowup')) - Number(pressed('s') || pressed('arrowdown'));
  // Keyboard takes priority when active; don't accidentally amplify two devices.
  const x = keyboardX || keyboardZ ? keyboardX : finite(touch?.x);
  const z = keyboardX || keyboardZ ? keyboardZ : finite(touch?.z);
  const length = Math.hypot(x,z);
  const scale = length > 1 ? 1 / length : 1;
  const nx = x * scale, nz = z * scale;
  return {x:nx,z:nz,moving:Math.hypot(nx,nz) > .01,run:!!run};
}
export function locomotionState(intent, grounded = true) {
  if (!grounded) return 'jump';
  if (!intent?.moving) return 'idle';
  return intent.run ? 'run' : 'walk';
}
