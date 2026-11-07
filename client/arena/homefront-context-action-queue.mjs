// Single explicit doorway tap, held briefly across a pending movement ack.
// Never trusts a stale prompt: the destination must still be interactable when
// the server/client movement settles. No implicit teleport or repeat actions.
export function queueDoorwayTap({intent,isBusy,current,commit,schedule=setTimeout,intervalMs=75,maxChecks=20}={}) {
  if (intent?.id!=='enter-doorway' || !intent.targetId ||
      typeof isBusy!=='function' || typeof current!=='function' ||
      typeof commit!=='function' || typeof schedule!=='function' ||
      !Number.isInteger(maxChecks) || maxChecks<1 || maxChecks>60) return ()=>{};
  let stopped=false, checks=0;
  const step=()=>{
    if(stopped)return;
    if(isBusy()){
      if(++checks>=maxChecks)return;
      schedule(step,intervalMs);
      return;
    }
    const target=current(); // includes current position, visibility and session checks
    if(!target || target.id!==intent.id || target.targetId!==intent.targetId)return;
    stopped=true;
    commit(intent.targetId);
  };
  step();
  return ()=>{stopped=true;};
}
