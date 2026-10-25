// Shore exploration state rules. Gameplay wiring remains a follow-up.
// Never grant rewards or authorize dock access from this client-side module.
export const SHORE_STATES = Object.freeze(['aboard','docked','ashore']);
export function shoreTransition(state, action, context={}) {
  const docked = context.atPort === true;
  const stopped = Number.isFinite(context.speed) && Math.abs(context.speed) <= 0.5;
  if (state === 'aboard' && action === 'dock' && docked && stopped) return { ok:true, state:'docked' };
  if (state === 'docked' && action === 'disembark' && docked && stopped) return { ok:true, state:'ashore' };
  if (state === 'ashore' && action === 'embark' && docked) return { ok:true, state:'docked' };
  if (state === 'docked' && action === 'depart') return { ok:true, state:'aboard' };
  return { ok:false, state, reason:'invalid-transition' };
}
export function intoxicationEffects(drinks, elapsedMinutes=0) {
  const count=Number.isFinite(drinks)?Math.max(0,Math.min(12,Math.floor(drinks))):0;
  const minutes=Number.isFinite(elapsedMinutes)?Math.max(0,elapsedMinutes):0;
  const intensity=Math.max(0,Math.min(1,(count-minutes/12)/6));
  return { intensity, cameraSway:0.025*intensity, movementSway:0.12*intensity,
    reactionMultiplier:1+0.4*intensity, sober:intensity===0 };
}
