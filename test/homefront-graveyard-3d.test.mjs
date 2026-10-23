import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const scene = readFileSync(new URL('../client/arena/homefront-graveyard-3d.js', import.meta.url), 'utf8');
const page = readFileSync(new URL('../client/arena/homefront.html', import.meta.url), 'utf8');

assert.match(scene, /from '\.\/zaudio\.js'/, 'reuse the Zombies sound director in Homefront');
assert.match(scene, /from '\.\/zombie-model-pilot\.mjs'/, 'reuse the existing animated Zombies model pilot');
assert.match(scene, /zombieModelPilot\.update\(modelCandidates, dt, localForModels\)/, 'drive animated infected from authoritative encounter snapshots');
assert.match(scene, /modeledZombieIds\.has\(actor\.userData\.encounterId\)/, 'bound detailed rigs and retain procedural fallback actors');
assert.match(scene, /const opacity = modeled \? 0 : 1/, 'preserve raycast hit proxies under animated models');
assert.match(scene, /createZombieModelPilot\(scene, \{ targetHeight: 2\.7, maxModels: /, 'fit rigs to Homefront combat hitbox scale with a lower rig cap on touch devices');
assert.match(scene, /createZombieAudio\(sfx, \{ base: new URL\('\.\/sfx\/'/, 'reuse the existing positional zombie audio sample bank');
assert.match(scene, /zombieAudio\.tick\(dt, audioMe, audioZombies/, 'drive ambient infected audio and threat heartbeat from Homefront world snapshots');
assert.match(scene, /zombieAudio\.hit\(\{ hs: detail\.hitZone === 'head'/, 'play shared hit and headshot audio only after authoritative combat confirmation');
assert.match(scene, /zombieAudio\.zdie\(target\)/, 'play infected death audio only after server-confirmed kills');
assert.match(scene, /homefront:combat-hit-feedback/, 'preserve the existing weapon and particle feedback event alongside shared audio');
assert.match(scene, /const environmentVisuals = new Map\(\)/, 'index rendered environment structures by authoritative collision ID');
assert.match(scene, /registerEnvironmentVisual\('building:' \+ x \+ ',' \+ z, structure\)/, 'group building meshes so server-confirmed destruction removes the whole structure');
assert.match(scene, /registerEnvironmentVisual\(prefix \+ ':' \+ cell\[0\] \+ ',' \+ cell\[1\], g\)/, 'map destructible environmental props to the server collision catalog');
assert.match(scene, /applyEnvironmentStateSnapshot\(data\.world\?\.environmentStructures\)/, 'replicate server-owned structure health and stages into the renderer');
assert.match(scene, /environment\/damage/, 'send structure damage requests through the authoritative Homefront API');
assert.match(scene, /JSON\.stringify\(\{ structureId: selectedEnvironmentId \}\)/, 'submit only the selected stable structure ID for server validation');
assert.match(scene, /raycaster\.intersectObjects\(\[\.\.\.environmentVisuals\.values\(\)\]/, 'allow players to select physical structures in the 3D world');
assert.match(page, /id="damageEnvironment"/, 'expose a nearby structure interaction control');

assert.match(scene, /function spawnEnvironmentImpact\(state, previousState = null\)/, 'spawn transient impact feedback from server-confirmed environment damage');
assert.match(scene, /piece\.userData\.environmentDebris = true/, 'mark environmental debris for deterministic lifecycle handling');
assert.match(scene, /if \(state\) spawnEnvironmentImpact\(\{ \.\.\.selected, \.\.\.state \}, previousState\)/, 'spawn debris only after the server accepts structure damage');
assert.match(scene, /state\.stage === 'destroyed' \|\| state\.health <= 0/, 'increase debris burst when a structure is destroyed');
assert.match(scene, /group\.visible = !destroyed/, 'hide structures only when authoritative state says collision is destroyed');
assert.match(scene, /state\.stage === 'critical'/, 'render progressive visual damage stages without changing gameplay authority');
assert.match(scene, /from '\.\/vendor\/three\.module\.min\.js'/, 'reuse the vendored Three.js runtime');
const zombiePilot = readFileSync(new URL('../client/arena/zombie-model-pilot.mjs', import.meta.url), 'utf8');
assert.match(zombiePilot, /selectZombieModelCandidates/, 'reuse deterministic near-player model selection');
assert.match(zombiePilot, /targetHeight = Number\.isFinite\(options\.targetHeight\)/, 'configure model scale for Homefront');
assert.match(zombiePilot, /MAX_MODELS = 8/, 'cap expensive animated rigs');
assert.match(zombiePilot, /MAX_MODEL_DISTANCE = 28/, 'keep detailed rigs near the player');
assert.match(zombiePilot, /react\(id, kind = 'HitReact'\)/, 'expose authoritative hit and death animation reactions');
assert.match(zombiePilot, /next\.setLoop\(THREE\.LoopOnce, 1\)/, 'play hit and death clips as one-shot reactions');
assert.match(zombiePilot, /item\.deadUntil = item\.reactionUntil/, 'retain server-confirmed death animation after encounter removal');
assert.match(scene, /zombieModelPilot\?\.react\(active\.id, detail\.killed \? 'Death' : 'HitReact'\)/, 'trigger animated reactions only from confirmed combat events');
assert.match(scene, /GLTFLoader/, 'reuse the existing GLTF asset loader');
assert.match(scene, /SkeletonUtils\.clone/, 'clone animated zombie rigs safely');
assert.match(scene, /assets\/homefront\/zombie\.glb/, 'reuse the existing Homefront zombie model');
assert.match(scene, /\/api\/homefront\/world/, 'read the shared Homefront world snapshot');
assert.match(scene, /\/api\/homefront\/world\/move/, 'send movement through the authoritative world API');
assert.match(scene, /data\.world\?\.pointsOfInterest/, 'render server-authored points of interest');
assert.match(scene, /data\.world\?\.bosses|data\.world\?\.caches/, 'bind interactive landmark visuals to shared encounter state');
assert.match(scene, /worldData\.party && !worldData\.party\.leader/, 'respect leader-controlled party movement');
assert.match(scene, /Math\.max\(-100, Math\.min\(100/, 'clamp client targets to the shared map bounds');
assert.match(scene, /server-limited/, 'explain that movement is server-limited');
assert.match(scene, /\/api\/homefront\/world\/' \+ action/, 'combat controls call authenticated server combat endpoints');
assert.match(scene, /data\.encounters/, 'render active server-owned infected encounters');
assert.match(scene, /const combatActors = new Map\(\)/, 'retain infected scene actors across authoritative snapshots');
assert.match(scene, /state\.targetX - actor\.position\.x/, 'interpolate infected movement between server snapshots');
assert.match(scene, /actor\.userData\.hitFlash = 0\.38/, 'give confirmed enemy damage a brief visual hit flash');
assert.match(scene, /threatRing/, 'render a proximity danger telegraph for nearby infected');
assert.match(scene, /threatDistance <= 3/, 'increase infected danger feedback at close combat distance');
assert.match(scene, /attackInfectedButton/, 'wire the attack control to encounter state');
assert.match(scene, /Visible held weapon silhouette/, 'render a visible weapon prop for each explorer in the 3D world');
assert.match(scene, /event\.button !== 2 \|\| masterView !== 'third-person'/, 'right mouse drag orbits the third-person camera without hijacking ground travel');
assert.match(scene, /cameraYawOffset \+= event\.movementX \* 0\.006/, 'camera orbit changes the follow heading');
assert.match(scene, /cameraPitchOffset = Math\.max\(-0\.25, Math\.min\(0\.45/, 'camera pitch stays within a safe view angle');
assert.match(scene, /cameraDistance = Math\.max\(3\.5, Math\.min\(10\.5/, 'mouse wheel zoom is clamped to playable third-person distances');
assert.match(scene, /const masterView = 'third-person'/, 'exploration camera is locked to third-person');
assert.doesNotMatch(scene, /masterView = masterView === 'third-person'/, 'tactical overhead is not a general exploration hotkey');
assert.match(scene, /Overhead view is reserved for base construction/, 'camera guidance reserves overhead view for base construction');
assert.match(scene, /right-drag to orbit · scroll to zoom/, 'the game explains orbit and zoom controls to the player');
assert.match(scene, /homefront:cosmetics/, 'receive equipped cosmetic and weapon selection from the Homefront loadout');
assert.match(scene, /equippedWeaponSkinColor/, 'apply the equipped weapon skin finish to the local 3D weapon');
assert.match(scene, /weaponId === 'shock_maul'/, 'render a distinct shock maul silhouette');
assert.match(scene, /weaponId === 'marksman_rifle'/, 'render a distinct marksman rifle silhouette');
assert.ok(scene.includes("new THREE.BoxGeometry(width, length, weaponId === 'shock_maul' ? 0.22 : 0.19)"), 'build weapon silhouettes from lightweight Three.js primitives without new assets');
assert.match(scene, /attackInfectedButton\.disabled = !active \|\| active\.defeated \|\| active\.hp <= 0 \|\| distance > \(active\.range \|\| 0\)/, 'keep attack disabled after requests when the enemy remains out of range');
assert.match(page, /id="findInfected"/, 'provide a control to initiate an infected encounter');
assert.match(page, /id="attackInfected"/, 'provide an attack control for active infected');
assert.match(page, /id="graveyard3d"/, 'embed the 3D world in Homefront');
assert.match(page, /id="graveyardMap"/, 'preserve the existing 2D tactical map fallback');
assert.match(page, /id="survivalVitals"/, 'show server-owned field survival vitals');
assert.match(page, /id="fieldInventory"/, 'show carried inventory and item counts');
assert.match(page, /id="packFood"/, 'allow cooked rations to be packed from refuge stores');
assert.match(page, /id="packRawFood"/, 'allow raw food to be packed without upgrading its quality');
assert.match(page, /id="packDirtyWater"/, 'allow contaminated water to be packed without upgrading its quality');
assert.match(page, /insufficient_rawFood/, 'show a useful message when raw food stores are insufficient');
assert.match(page, /insufficient_dirtyWater/, 'show a useful message when dirty water stores are insufficient');
assert.match(page, /id="stashInventory"/, 'allow carried supplies to be stashed');
assert.match(page, /id="drinkInField"/, 'provide a hydration action');
assert.match(page, /id="cosmeticCollection"/, 'provide the cosmetic skin collection UI');
assert.match(page, /cosmetic-only|never change combat power/i, 'explain that cosmetic skins do not affect combat power');
assert.match(page, /homefront-graveyard-3d\.js/, 'load the 3D scene module');
const constructionTick = page.indexOf('const constructionView=!!pendingBuilding||constructionPaused;if(!constructionView)for(const mixer of zombieMixers)mixer.update(dt)');
assert(constructionTick >= 0, 'freeze infected animation mixers while protected construction mode is active');
assert.match(page, /if\(base\?\.wave>0&&!pendingBuilding&&!constructionPaused\)/, 'pause local infected movement during construction and server-confirmed build placement');
console.log('Homefront 3D Graveyard integration checks passed.');

assert.match(scene, /homefront:combat-hit/, 'trigger visible weapon feedback only after the server confirms combat');
assert.match(scene, /weaponSwingUntil/, 'animate the equipped weapon after a confirmed strike');
assert.match(scene, /explorer\.userData\.weapon\.rotation\.z/, 'animate a visible strike arc in the 3D scene');
assert.match(scene, /weaponSwingWeaponId === 'marksman_rifle' \? 0\.62 : 0\.46/, 'firearms use weapon-specific recoil strength');
assert.match(scene, /weaponSwingWeaponId === 'shock_maul'/, 'shock maul uses a heavier dedicated swing animation');
assert.match(scene, /const kick = progress < 0\.2 \? progress \/ 0\.2/, 'firearm recoil kicks back quickly and recovers during the animation');
assert.match(scene, /const headshot = state\.impactStyle === 'headshot'/, 'confirmed headshots trigger a stronger infected flinch');
assert.match(scene, /headshot \? 0\.28 : 0\.12/, 'headshot hit reactions have a distinct knockback response');

assert.match(scene, /impactStyle === 'blunt'/, 'blunt weapons produce a heavier body-bash response');
assert.ok(scene.includes("if (detail.killed && style === 'sharp' && target)"), 'sharp-weapon separation effect requires a confirmed kill');
assert.match(scene, /homefront:combat-hit/, 'impact response only runs from confirmed combat results');

assert.match(scene, /import \{ sfx \} from '\.\/sfx\.js'/, 'reuse the existing arena sound engine');
assert.ok(scene.includes("sfx.play(sfx.has(sound) ? sound : 'hit'"), 'fall back to a loaded hit sample when a dedicated weapon sound is unavailable');
assert.ok(scene.includes("const count = detail.hitZone === 'head' ? (detail.killed ? 30 : 16)"), 'head hits get distinct blood particle feedback');
assert.match(scene, /drop\.userData\.blood = true/, 'mark short-lived blood particles for fade-out');

assert.match(scene, /const weaponId = \['pipe_blade','pump_shotgun','marksman_rifle','shock_maul'\]/, 'select only known server-equipped weapon profiles for impact feedback');
assert.match(scene, /weaponId === 'pump_shotgun' \? 'shotgun'/, 'shotgun impacts use their dedicated licensed sample when available');
assert.ok(scene.includes("detail.killed ? (weaponId === 'pump_shotgun' ? 26 : 18)"), 'shotgun killing blows produce a wider, stronger impact burst');
assert.match(scene, /\.catch\(\(\) => \{\}\)/, 'audio asset failures cannot interrupt confirmed combat feedback');
assert.match(scene, /data\.combat\.encounterId/, 'resolve encounter IDs from the combat response when available');

assert.match(scene, /hitZone: data\.combat\.hitZone/, 'forward the server-calculated hit zone to the scene');
assert.match(scene, /detail\.hitZone === 'head'/, 'headshots get distinct impact presentation');
assert.match(scene, /HEADSHOT!/, 'show a headshot callout only when the server reports one');
assert.match(page, /id="autoFireInfected"/, 'provide a dedicated hold-to-autofire control');
assert.match(page, /id="reloadWeapon"/, 'provide a reload control for firearm magazines');
assert.match(page, /id="ammoStatus"/, 'show loaded rounds and reserve ammunition in the combat UI');
assert.match(scene, /Magazine ' \+ magazine\.loaded \+ '\/' \+ magazine\.capacity/, 'keep magazine and reserve counts visible as world snapshots update');
assert.match(scene, /\/api\/homefront\/world\/reload/, 'reload requests are authenticated and server-authoritative');
assert.match(scene, /data\.selfWeaponMagazine/, 'display the server-owned magazine state after reload');
assert.match(scene, /raycaster\.intersectObject\(combatGroup, true\)/, 'select an infected using actual 3D mesh ray intersection');
assert.match(scene, /body\.userData\.combatHitbox = true/, 'use the infected body as a valid aim hitbox');
assert.match(scene, /head\.userData\.combatHitbox = true/, 'use the infected head as a valid aim hitbox');
assert.match(scene, /combatHits\.find\(hit => hit\.object\.userData\?\.combatHitbox\)/, 'ignore labels and threat rings when calculating the aim point');
assert.match(scene, /selectedCombatAimPoint = \{ x: hit\.x, y: hit\.y, z: hit\.z \}/, 'derive aim point from the 3D ray hit rather than a client-chosen hit-zone label');
assert.match(scene, /const fireLoop = async \(\) =>/, 'repeat authenticated attacks while the autofire control is held');
assert.match(scene, /return !\(data\.combat\?\.killed\)/, 'stop the held firing loop after a confirmed kill');
assert.match(scene, /setPointerCapture\(event\.pointerId\)/, 'keep mobile autofire held through pointer movement');
assert.match(scene, /const aimPoint = selectedCombatAimPoint && activeTarget && targetId === activeTarget\.id/, 'refresh the aim point against the latest target snapshot on each shot');
assert.match(scene, /fired === false\) \{ stopAutoFire\(\); return; \}/, 'stop repeated requests after a combat error such as empty ammunition');
assert.match(scene, /function cancelReload\(message = 'Reload interrupted\.'/ , 'support cancelling a reload before ammunition transfer');
assert.match(scene, /Reload interrupted by combat/, 'combat input interrupts an in-progress reload');
assert.match(scene, /Reload interrupted by movement/, 'movement interrupts an in-progress reload');
assert.match(scene, /scheduleReloadStep\(state\)/, 'progress shotgun reloads one server-confirmed shell at a time');
assert.match(scene, /2250/, 'give the marksman rifle a longer reload animation than a shotgun shell insertion');
assert.match(scene, /sfx\.reloadWeapon\(shotgun \? 'shotgun' : 'marksman_rifle'\)/, 'play weapon-specific reload handling audio');
assert.match(scene, /if \(reloadState\) \{ const phase/, 'animate the held weapon during the reload action');
assert.match(scene, /pointercancel|pointerup/, 'stop autofire on pointer release or cancellation');
assert.match(scene, /JSON\.stringify\(targetId \? \{ targetId/, 'include the selected target with combat requests');


assert.match(page, /id="aimWeapon"/, 'provide a contextual aim toggle');
assert.match(page, /id="aimStability"/, 'show weapon stability and recovery feedback');
assert.match(scene, /let aiming = false/, 'track the explicit aiming stance');
assert.match(scene, /aimRecoveryUntil = performance\.now\(\) \+ \(sprintTravel \? 1800 : 900\)/, 'travel and sprinting trigger different local aim recovery windows');
assert.match(scene, /targetStability = aiming \? 1 - recovery \* 0\.58/, 'aiming visibly recovers more slowly after movement');
assert.match(scene, /aimWeaponButton\.setAttribute\('aria-pressed', String\(aiming\)\)/, 'expose aim state accessibly');
assert.match(scene, /\/api\/homefront\/world\/aim/, 'aim stance is confirmed by the server rather than trusted locally');
assert.match(scene, /sprint: sprintTravel/, 'sprint travel is requested explicitly and clamped by the server');
assert.match(scene, /authoritativeAimStability/, 'display server-calculated weapon stability after combat');
assert.match(page, /id="sprintTravel"/, 'provide an accessible sprint travel toggle');

assert.match(scene, /equippedOutfitColor/, 'apply the equipped outfit skin to the local survivor avatar');
assert.match(scene, /equippedBackpackColor/, 'apply the equipped backpack skin to the visible field pack');
assert.match(scene, /parseCosmeticColor/, 'accept only valid six-digit cosmetic colors');
assert.match(scene, /const backpack = new THREE.Mesh/, 'render a visible backpack on explorer avatars');

assert.match(scene, /g\.userData\.lootGlow = \{ mesh: glow, color, available: !!p\.available \}/, 'retain each supply node glow metadata for selection feedback');
assert.match(scene, /node\.userData\.lootNodeId === selectedLootId/, 'highlight the currently selected physical supply node');
assert.match(scene, /Math\.sin\(now \* 0\.006\) \* 0\.055/, 'pulse the selected supply ring in the render loop');
assert.match(scene, /focus\.mesh\.material\.color\.setHex\(selected \? 0xffe08a : focus\.color\)/, 'restore each supply node base glow color when selection changes');
assert.match(scene, /const previousExplorerPositions = new Map\(\)/, 'preserve each explorer position across world snapshots');
assert.match(scene, /explorerPositions\.set\(key, \{ x: p\.x, y: targetY, z: p\.z \}\)/, 'store authoritative explorer destinations separately from rendered positions');
assert.match(scene, /const travelBlend = 1 - Math\.exp\(-8 \* dt\)/, 'interpolate explorer motion smoothly per frame instead of snapping on each snapshot');
assert.match(scene, /explorer\.rotation\.y = Math\.atan2\(target\.x - explorer\.position\.x, target\.z - explorer\.position\.z\)/, 'turn moving explorers toward their travel direction');
assert.match(scene, /g\.userData\.avatarParts = \[/, 'retain avatar body, head, backpack, and strap references for animation');
assert.match(scene, /const bob = movingAvatar \? Math\.abs\(Math\.sin\(now \* 0\.014\)\) \* 0\.11/, 'add a lightweight step bob while explorers move');
assert.match(scene, /part\.object\.position\.y = part\.baseY \+ bob/, 'animate avatar parts without changing authoritative world coordinates');

assert.match(page, /let base = null, threatProfile = null, busy = false, pendingBuilding = null, pendingRotation = 0, constructionPaused = false/, 'track a protected construction pause independently of placement selection');
assert.match(page, /if\(base\?\.wave>0&&!pendingBuilding&&!constructionPaused\)/, 'freeze hostile base actor movement throughout construction and placement requests');
assert.match(page, /Protected construction mode: hostile base activity is paused/, 'tell players construction mode is protected');
assert.match(page, /construction pause remains active until the server confirms the build/, 'keep the pause active while the server validates and saves placement');
assert.match(page, /if\(action\?\.type==='build'\)\{constructionPaused=false;/, 'resume base activity after the build request settles');

assert.match(page, /const constructionView=!!pendingBuilding\|\|constructionPaused/, 'switch to construction camera only while building');
assert.match(page, /cameraPose\(\{mode:yardView\.mode,building:constructionView/, 'the refuge yard camera is third-/first-person and only goes overhead while building');
assert.match(page, /camera\.position\.lerp\(new THREE\.Vector3\(pose\.px,pose\.py,pose\.pz\),blend\)/, 'blend smoothly between construction and the previous walking view');
assert.doesNotMatch(page, /Vector3\(constructionView\?0:19/, 'no fixed elevated yard camera outside construction');
assert.match(page, /yardView=attachViewControls\(host,\{canLook:\(\)=>!pendingBuilding&&!constructionPaused\}\)/, 'yard look/joystick controls pause during construction');
assert.match(scene, /attachViewControls\(host, \{ onTap: onWorldTap, wheel: false \}\)/, 'Graveyard taps come from the shared controller so drag-to-look never travels');
assert.match(scene, /cameraPose\(\{ mode: view\.mode/, 'Graveyard camera follows the remembered first-/third-person mode');
assert.match(scene, /worldMove\(view\.move\(\), heading\)/, 'joystick / WASD travel is relative to the camera heading');
assert.match(scene, /if \(view\.visible\) renderer\.render/, 'offscreen Graveyard canvas skips rendering');
assert.match(page, /if\(yardView\.visible\)renderer\.render/, 'offscreen yard canvas skips rendering');

assert.match(page, /id="tillPlot"/, 'the refuge exposes a player-led farm plot control');
assert.match(page, /type:'farm_till',x:p\.x,z:p\.z/, 'tilling uses tap-to-place yard coordinates validated by the server');
assert.match(page, /type:'farm_plant',plotId:p\.id/, 'empty plots can be planted from the refuge panel');
assert.match(page, /type:'farm_water',plotId:p\.id/, 'growing plots can be watered from the refuge panel');
assert.match(page, /type:'farm_harvest',plotId:p\.id/, 'mature plots can be harvested from the refuge panel');
assert.match(page, /drawFarmPlot\(plot\)/, 'farm plots render in the 3D yard');

// Homefront refuge role markers must expose each assigned survivor's job in-world.
assert.match(readFileSync(new URL('../client/arena/homefront.html', import.meta.url), 'utf8'), /function drawRoleLabel\(x,z,role,task\)/, 'render role and task labels above survivors');
assert.match(readFileSync(new URL('../client/arena/homefront.html', import.meta.url), 'utf8'), /drawRoleLabel\(x,z,survivor\.role,survivor\.task\)/, 'attach role and task labels to survivor world positions');
assert.match(readFileSync(new URL('../client/arena/homefront.html', import.meta.url), 'utf8'), /materials\.forEach\(m=>\{if\(m\.map\)m\.map\.dispose\(\);m\.dispose\(\)\}\)/, 'dispose role-label textures when the world is redrawn');

assert.match(readFileSync(new URL('../client/arena/homefront.html', import.meta.url), 'utf8'), /survivorActors\.push\(\{object:g,role:survivor\.role,task:survivor\.task,phase:i\*1\.71,baseY:0,targetX:x,targetZ:z,targetYaw:spot\.yaw,speed:1\.1\+\(i%3\)\*\.12,moving:true,leftArm,rightArm,body,head\}\)/, 'track procedural survivor rigs, assigned tasks, and station movement');
assert.match(readFileSync(new URL('../client/arena/homefront.html', import.meta.url), 'utf8'), /for\(const actor of survivorActors\)\{actor\.phase\+=dt/, 'animate survivor work activity every world frame');
assert.match(readFileSync(new URL('../client/arena/homefront.html', import.meta.url), 'utf8'), /actor\.role==='mechanic'/, 'give mechanics a distinct repair-work motion');
assert.match(readFileSync(new URL('../client/arena/homefront.html', import.meta.url), 'utf8'), /actor\.role==='farmer'/, 'give farmers a distinct tending motion');
const homefrontPage = readFileSync(new URL('../client/arena/homefront.html', import.meta.url), 'utf8');
assert.match(homefrontPage, /if\(survivor\.role==='farmer'\)\{const plot=base\.farmPlots\?\.find\(item=>item\.crop\)/, 'place farmers beside an actively planted crop when available');
assert.match(homefrontPage, /if\(survivor\.role==='mechanic'\)\{const damaged=base\.structures\.filter\(item=>item\.hp<item\.maxHp\)/, 'send mechanics toward the most damaged structure before falling back to the workshop');
assert.match(homefrontPage, /if\(survivor\.role==='guard'\)\{const defensiveTypes=new Set\(\['wall','gate','watchtower','entrance','exit','sandbags','barbed_wire','trench','turret'\]\);const breach=base\.structures\.filter\(item=>defensiveTypes\.has\(item\.type\)&&item\.hp<item\.maxHp\)/, 'redirect guards to damaged perimeter defenses while preserving their patrol fallback');

assert.match(homefrontPage, /if\(s\.hp<=0\)\{g\.userData\.breached=true;g\.userData\.structureId=s\.id;/, 'render zero-HP structures as persistent breach wreckage instead of intact defenses');
assert.match(homefrontPage, /const breachMarker=block\(g,\.78,\.07,\.07,0,\.68,0,0xe34d3e\)/, 'make a destroyed perimeter opening visually identifiable in the 3D refuge');
assert.match(homefrontPage, /integrity<=\.25\?0xd94a3e:integrity<=\.6\?0xc77a3e/, 'tint critical and damaged structures by server-reported integrity');


// Live perimeter alerts must reflect the authoritative structure snapshot and prioritize the weakest defense.
assert.match(homefrontPage, /id="breachAlert" role="alert"/, 'provide an accessible live perimeter integrity alert');
assert.match(homefrontPage, /const damagedDefenses=base\.structures\.filter\(s=>defensiveTypes\.has\(s\.type\)/, 'derive breach status only from defensive structures');
assert.match(homefrontPage, /\.sort\(\(a,b\)=>a\.integrity-b\.integrity/, 'prioritize the defensive structure with the lowest integrity');
assert.match(homefrontPage, /priority\.hp<=0\?'BREACHED':priority\.integrity<=25\?'CRITICAL':priority\.integrity<=60\?'DAMAGED'/, 'label breached, critical, and damaged perimeter states');
assert.match(homefrontPage, /id="repairPriorityBreach"/, 'provide a direct priority breach repair control');
assert.match(homefrontPage, /priorityButton\.onclick=\(\)=>act\(\{type:'emergency_repair',target:priority\.id\}\)/, 'send priority repair through the existing server-authoritative action');
assert.match(homefrontPage, /priorityButton\.disabled=busy\|\|base\.resources\.wood<4\|\|base\.resources\.scrap<2/, 'disable priority repair when the refuge lacks required materials');
assert.match(homefrontPage, /PERIMETER STABLE · All defensive structures are at full integrity/, 'show a stable state when no perimeter defense is damaged');


// Siege incident lifecycle: warning, guard response, and persisted after-action report.
assert.match(homefrontPage, /id="siegeIncidentSummary" aria-live="polite"/, 'show a persistent accessible siege incident summary');
assert.match(homefrontPage, /const incident=base\.lastSiege/, 'render the server-persisted last siege report');
assert.match(homefrontPage, /incident\.phases/, 'render the ordered incident phases');
assert.match(homefrontPage, /incident\.target\.integrityBefore/, 'show target integrity before and after the siege');
assert.match(homefrontPage, /incident\.refugeHpAfter\+'\/'+base\.baseMaxHp/, 'show refuge health after the incident');


assert.match(homefrontPage, /incident\?\.status==='incoming'\?'Resolve siege defense':'Begin siege warning'/, 'switch the siege control between warning and defense phases');
assert.match(homefrontPage, /INCOMING SIEGE: inspect the threatened structure and repair if needed/, 'tell players they can assess and repair before resolving the attack');
assert.match(homefrontPage, /type:base\?\.lastSiege\?\.status==='incoming'\?'defend':'start_siege'/, 'use separate server actions for starting and resolving a siege');

assert.match(homefrontPage, /const assignedTarget=survivor\.taskTarget&&base\.structures\.find\(item=>item\.id===survivor\.taskTarget\)/, 'place responding survivors at their persisted server-assigned siege target');
assert.match(homefrontPage, /taskLabels\[task\]\|\|labels\[role\]/, 'show the active survivor behavior above the 3D actor');
assert.match(homefrontPage, /task:survivor\.task/, 'carry persistent behavior into survivor animation actors');
assert.match(homefrontPage, /taskNote\.textContent='Current task: '/, 'show persistent survivor tasks in the settlement roster');

assert.match(homefrontPage, /startX=Math\.cos\(startAngle\)\*2\.2,startZ=Math\.sin\(startAngle\)\*2\.2/, 'survivors begin near the refuge before walking to their assigned stations');
assert.match(homefrontPage, /targetX:x,targetZ:z,targetYaw:spot\.yaw,speed:1\.1\+\(i%3\)\*\.12/, 'each survivor actor carries a destination and individual movement speed');
assert.match(homefrontPage, /distance>\.12/, 'survivors stop moving when they reach their assigned destination');
assert.match(homefrontPage, /actor\.walkAction\.reset\(\)\.fadeIn\(\.15\)\.play\(\)/, 'blend into walk animation while moving between stations when assets provide one');
assert.match(homefrontPage, /working=!moving&&\['farmer','mechanic','medic','scavenger'\]/, 'role work animations start after survivors arrive at their work location');


// Survivor visual pass: keep the CC0 rig, add role-readable equipment silhouettes,
// and select the closest animation clip available without requiring every clip.
const survivorVisualPage = readFileSync(new URL('../client/arena/homefront.html', import.meta.url), 'utf8');
assert.match(survivorVisualPage, /const SURVIVOR_GEAR=\{/, 'define distinct survivor gear profiles by settlement role');
assert.match(survivorVisualPage, /function addSurvivorGear\(model,survivor,index\)/, 'attach equipment to each cloned survivor rather than mutate the shared GLB');
assert.match(survivorVisualPage, /model\.userData\.homefrontGear=gear/, 'track the per-actor equipment group for future cosmetic customization');
assert.match(survivorVisualPage, /kit:'helmet'/, 'give guards a recognizable helmet silhouette');
assert.match(survivorVisualPage, /kit:'hat'/, 'give farmers a distinct hat silhouette');
assert.match(survivorVisualPage, /kit:'hardhat'/, 'give mechanics a hardhat silhouette');
assert.match(survivorVisualPage, /kit:'medical'/, 'give medics a visible medical marker');
assert.match(survivorVisualPage, /function survivorAnimationProfile\(clips,survivor\)/, 'resolve animation clips from the actual source model instead of assuming fixed clip names');
assert.match(survivorVisualPage, /rolePatterns=\{/, 'map role-specific activity to likely animation names with graceful fallbacks');
assert.match(survivorVisualPage, /survivorAnimationProfile\(clips,survivor\)/, 'select each survivor animation profile from role and persistent task');
assert.match(survivorVisualPage, /survivor\.task==='defend_perimeter'\?find\(\[\/aim\/i, \/shoot\/i, \/attack\/i, \/guard\/i, \/idle\/i\]\)/, 'prefer defensive stance or combat clips for guards responding to a siege');
assert.match(survivorVisualPage, /actor\.task==='take_shelter'/, 'keep sheltering survivors out of work/aim animation transitions');


// Individual survivor stats are visible in the roster and backed by server-persisted skills.
const survivorStatsPage = readFileSync(new URL('../client/arena/homefront.html', import.meta.url), 'utf8');
assert.match(survivorStatsPage, /const statLabels=\[\['combat','CMB'\],\['scavenging','SCV'\],\['farming','FRM'\],\['medical','MED'\],\['engineering','ENG'\],\['endurance','END'\]\]/,
  'the survivor roster displays all six individual skill categories');
assert.match(survivorStatsPage, /Individual survivor skills, each rated 1–10/,
  'the roster explains the meaning and scale of survivor stats');


assert.match(homefrontPage, /stone:\['🪨','Stone'\],steel:\['🏗️','Steel'/, 'show advanced construction materials in the resource inventory');
assert.match(homefrontPage, /upgrade_structure_material/, 'structure cards offer server-authoritative material upgrades');
assert.match(homefrontPage, /Maximum material tier · steel-reinforced/, 'steel structures clearly show that material progression is capped');

assert.match(homefrontPage, /if\(s\.material==='stone'\)c=0x777a7d;else if\(s\.material==='steel'\)c=0x77838a/, 'stone and steel tiers change the 3D structure palette');
assert.match(homefrontPage, /if\(s\.material==='stone'\)\{for\(const x of \[-\.72,\.72\]\)/, 'stone structures receive visible masonry reinforcement seams');
assert.match(homefrontPage, /else if\(s\.material==='steel'\)\{for\(const x of \[-\.76,\.76\]\)/, 'steel structures receive visible metal reinforcement bands');
