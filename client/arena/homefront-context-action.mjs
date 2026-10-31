// One contextual action at a time in Homefront's 3D scene.
// Presentation only: the existing authenticated action buttons remain the
// source of invocation, and server routes validate distance/permissions.
export function homefrontContextAction({
  canEnter = false, enterTitle = '',
  canLoot = false, lootLabel = '',
  canDamage = false, environmentLabel = ''
} = {}) {
  if (canEnter) return Object.freeze({
    id: 'enter', label: enterTitle ? 'Enter ' + String(enterTitle).slice(0, 56) : 'Enter building'
  });
  if (canLoot) return Object.freeze({
    id: 'loot', label: lootLabel ? 'Search ' + String(lootLabel).slice(0, 56) : 'Search container'
  });
  if (canDamage) return Object.freeze({
    id: 'damage', label: environmentLabel ? 'Break ' + String(environmentLabel).slice(0, 56) : 'Damage structure'
  });
  return null;
}

export function homefrontActionTarget(action, controls) {
  const button = action?.id === 'enter' ? controls?.enter
    : action?.id === 'loot' ? controls?.loot
    : action?.id === 'damage' ? controls?.damage : null;
  if (!button || button.hidden || button.disabled || typeof button.click !== 'function') return null;
  return button;
}
