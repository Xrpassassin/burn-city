import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const page = await readFile(new URL('../client/arena/homefront.html', import.meta.url), 'utf8');

assert.match(page, /function inspectYardSurvivor\(e,directSurvivor=null\)/, '3D refuge supports direct survivor inspection');
assert.match(page, /function updateNearbyInteraction\(constructionView\)/, 'survivors, structures, and farm plots create a contextual proximity prompt');
assert.match(page, /closestDistance=2\.5/, 'survivor interaction requires close physical proximity');
assert.match(page, /e\.key==='e'\|\|e\.key==='E'/, 'keyboard users can interact with a nearby survivor');
assert.match(page, /Talk \/ inspect · E/, 'interaction prompt explains the contextual action and key');
assert.match(page, /function inspectNearbySurvivor\(survivor\)/, 'touch prompt opens the same survivor inspection panel');
assert.match(page, /raycaster\.intersectObject\(survivorGroup,true\)/, 'inspection raycasts only against survivor actors');
assert.match(page, /model\.userData\.survivorId=String\(survivor\.id\|\|i\)/, 'animated survivor actors carry a stable inspection id');
assert.match(page, /g\.userData\.survivorId=String\(survivor\.id\|\|i\)/, 'procedural survivor actors carry a stable inspection id');
assert.match(page, /Current activity:/, 'inspection explains the survivor\'s current job');
assert.match(page, /data-survivor-dialogue/, 'talk interaction provides contextual survivor dialogue');
assert.match(page, /const lines=hp<40\?/, 'dialogue reflects survivor health, morale, and role');
assert.match(page, /Work target:/, 'inspection exposes a survivor\'s current work target');
assert.match(page, /survivor\.taskReason/, 'inspection includes the behavior reason when available');
assert.match(page, /survivorInspection/, 'inspection panel is accessible and dismissible');
assert.match(page, /Assign survivor role/, 'inspection exposes a direct role assignment control');
assert.match(page, /act\(\{type:'assign',survivorId:survivor\.id,role\}\)/, 'role orders use the existing server-authoritative action');
assert.match(page, /if\(!visiting\)\{const orderLabel/, 'read-only visitor mode does not expose assignment controls');
assert.match(page, /role==='farmer'&&!\(base\.farmPlots\|\|\[\]\)\.some\(plot=>plot\.crop\)/, 'farmer assignment is disabled until crops are planted');
console.log('Homefront contextual survivor, structure, and farm interaction tests passed');

assert.match(page, /function inspectYardStructure\(e,directStructure=null\)/, '3D yard supports direct inspection of built structures');
assert.match(page, /function showStructureInspection\(structure\)/, 'structure inspection exposes integrity and contextual actions');
assert.match(page, /userData\.structureId=s\.id/, 'rendered structures carry a stable server object id');
assert.match(page, /function inspectYardFarmPlot\(plot\)/, 'farm plots expose contextual planting, watering, and harvest actions');
assert.match(page, /type:'turret_manning',target:structure\.id,manned:!structure\.manned/, 'turret crew interaction uses the server-authoritative action');
assert.match(page, /type:'trench_upgrade',target:structure\.id/, 'trench upgrades use the server-authoritative action');
assert.match(page, /nearbyStructure=best\?\.kind==='structure'/, 'nearby structures participate in proximity prompts');
assert.match(page, /promptButton\.textContent=best\.kind==='survivor'\?/, 'interaction prompt adapts to survivors, farm plots, and structures');
assert.match(page, /host\.append\(renderer\.domElement\);renderer\.domElement\.addEventListener\('pointerup',inspectYardSurvivor\);renderer\.domElement\.addEventListener\('pointerup',inspectYardStructure\);/, '3D inspection handlers are registered only after the renderer exists');
assert.doesNotMatch(page, /\\\\nfunction initWorld/, 'module code uses a real line break before world initialization');
assert.match(page, /const openGateIds=new Set\(\),gateMotion=new Map\(\)/, 'gate motion and traversable-open state are tracked per physical gate');
assert.match(page, /function updatePhysicalGates\(dt\)/, 'nearby gates animate open and close with frame-based motion');
assert.match(page, /distance<2\.25/, 'gate begins opening before the player reaches its collision boundary');
assert.match(page, /distance>3\.1/, 'gate waits until the player has cleared the doorway before closing');
assert.match(page, /leaf\.rotation\.y=motion\.angle/, 'gate leaf rotates around a hinge instead of disappearing');
assert.match(page, /collisionStructures=st\.filter\(item=>!openGateIds\.has\(String\(item\.id\)\)\)/, 'an open gate stops blocking player movement while closed gates remain collidable');
assert.match(page, /g\.userData\.gateLeaf=leaf/, 'each procedural gate exposes its animated door leaf');
assert.match(page, /updatePhysicalGates\(dt\)/, 'physical gate state updates inside the third-person simulation loop');
assert.match(page, /const openGateIds=new Set\(\),gateMotion=new Map\(\),containerMotion=new Map\(\)/, 'physical gates and storage containers maintain per-object motion state');
assert.match(page, /g\.userData\.containerLid=lid/, 'storage has a hinged lid attached to the physical container');
assert.match(page, /function updatePhysicalContainers\(dt\)/, 'storage lids animate based on player proximity');
assert.match(page, /motion\.target=!constructionPaused&&!pendingBuilding&&distance<2\.2\?-.95:0/, 'storage lids open nearby and close after the player leaves');
assert.match(page, /Settlement supply snapshot/, 'storage inspection shows a clear inventory snapshot label');
assert.match(page, /These are shared settlement supplies, not a separate container inventory\./, 'storage inspection does not misrepresent shared supplies as separately persisted container contents');
assert.match(page, /playerDistance<\.82/, 'survivors receive local separation from the player instead of passing through them');
assert.match(page, /playerDistance<\.68/, 'survivors turn toward the player at close interaction distance');
assert.match(page, /updatePhysicalContainers\(dt\)/, 'container physics update in the third-person simulation loop');
assert.match(page, /const openGateIds=new Set\(\),gateMotion=new Map\(\),containerMotion=new Map\(\),workshopMotion=new Map\(\)/, 'gate, container, and workshop physical state is tracked per object');
assert.match(page, /g\.userData\.workshopGear=gear/, 'workshop machinery is a physical animated scene object');
assert.match(page, /function updatePhysicalWorkshops\(dt\)/, 'workshop machinery responds to player proximity');
assert.match(page, /distance<3\.2/, 'workshop machinery activates when the player approaches the work area');
assert.match(page, /gear\.rotation\.z=motion\.angle/, 'workshop wheel visibly rotates while active');
assert.match(page, /updatePhysicalWorkshops\(dt\)/, 'workshop interaction updates in the third-person simulation loop');

assert.match(page, /steeringDirection\(/, 'survivors use obstacle-aware steering instead of walking through structures');
assert.match(page, /separationVector\(/, 'survivors avoid crowding each other with separation steering');
assert.match(page, /isPositionBlocked\(nx,nz,collisionStructures,\.32\)/, 'third-person player movement respects solid structure footprints');
assert.match(page, /navObstacles=\(base\?\.structures\|\|\[\]\)\.filter\(item=>item\.hp>0&&!openGateIds\.has\(String\(item\.id\)\)\)/, 'open gates remain navigable while solid structures steer survivor movement');

assert.match(page, /function survivorSpot\(survivor,index\)/, 'survivors receive a role/task-aware homefront destination');
assert.match(page, /const taskStation=\{stockpile_supplies:'storage',infirmary_duty:'infirmary',triage_standby:'infirmary',maintain_structures:'workshop',stand_by_repairs:'workshop'\}/, 'survivor work assignments route to the matching station');
assert.match(page, /if\(survivor\.task==='take_shelter'\)return/, 'survivors assigned to shelter move into the refuge interior');
assert.match(page, /const workSpot=\(item,slot=index,radius=1\.35\)/, 'work destinations are spaced around the target structure instead of inside it');
assert.match(page, /if\(survivor\.task==='tend_crops'\|\|survivor\.role==='farmer'\)/, 'farmers route to actual planted crop plots');

assert.match(page, /const cotSpots=\[\[-2\.55,2\.45\],\[2\.55,2\.45\],\[-2\.75,4\],\[2\.75,4\],\[-2\.55,5\.55\],\[2\.55,5\.55\]\]/, 'the refuge includes six visible cot/rest locations');
assert.match(page, /if\(survivor\.task==='rest_at_refuge'\)\{const cotSpots=/, 'resting survivors navigate to a specific bedroll instead of an arbitrary idle point');

assert.match(page, /updateRouteRecovery\(actor\.routeRecovery,\{x:o\.position\.x,z:o\.position\.z\},\{x:actor\.targetX,z:actor\.targetZ\},now\)/, 'survivors continuously detect route stalls against their current destination');
assert.match(page, /preferredOffset:actor\.routeRecovery\.preferredOffset/, 'survivor steering applies a temporary alternate approach after repeated stalls');

assert.match(page, /actor\.routePlan=updateRoutePlan\(actor\.routePlan,\{x:o\.position\.x,z:o\.position\.z\},\{x:actor\.targetX,z:actor\.targetZ\},navObstacles,\{actorRadius:\.28\}\)/, 'survivors maintain a stable detour plan against current structure footprints');
assert.match(page, /const navTarget=actor\.routePlan\.detour\|\|\{x:actor\.targetX,z:actor\.targetZ\}/, 'survivor steering follows a detour waypoint before resuming its assigned destination');

assert.match(page, /safeMovePosition\(\{x:o\.position\.x,z:o\.position\.z\},\{x:steering\.x\*step,z:steering\.z\*step\},navObstacles,\.28\)/, 'survivor travel validates movement against solid structure footprints');
assert.match(page, /moving&&!actor\.routePlan\.unreachable/, 'survivors pause instead of walking into a route with no safe immediate detour');
assert.match(page, /safePush=safeMovePosition/, 'player proximity nudges cannot push survivors through fortifications');
assert.match(page, /separationStep=safeMovePosition/, 'crowd separation cannot push survivors through fortifications');
