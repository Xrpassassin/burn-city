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
assert.match(scene, /from '\.\/homefront-ground-detail\.mjs'/, 'load deterministic lightweight ground dressing');
assert.match(scene, /new THREE\.InstancedMesh\(/, 'batch micro-props to avoid one draw call per piece of scenery');
assert.match(scene, /addGroundDetailInstances\(chunk, cx, cz\)/, 'cull ground details with their spatial chunk');
assert.match(scene, /coarsePointer \? 1\.15 : 1\.6/, 'cap mobile render resolution to preserve frame time while allowing sharper desktop output');
assert.match(scene, /zombieAudio\.tick\(dt, audioMe, audioZombies/, 'drive ambient infected audio and threat heartbeat from Homefront world snapshots');
assert.match(scene, /zombieAudio\.hit\(\{ hs: detail\.hitZone === 'head'/, 'play shared hit and headshot audio only after authoritative combat confirmation');
assert.match(scene, /zombieAudio\.zdie\(target\)/, 'play infected death audio only after server-confirmed kills');
assert.match(scene, /homefront:combat-hit-feedback/, 'preserve the existing weapon and particle feedback event alongside shared audio');
assert.match(scene, /const environmentVisuals = new Map\(\)/, 'index rendered environment structures by authoritative collision ID');
assert.match(scene, /registerEnvironmentVisual\(id, structure\)/, 'register grouped building meshes using the shared authoritative layout id');
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
assert.match(scene, /\/api\/homefront\/world\/exploration/, 'load account-persisted exploration notes');
assert.match(scene, /\/api\/homefront\/world\/exploration\/discover/, 'submit landmark discoveries for server-side distance validation');
assert.match(scene, /function renderExplorationJournal\(\)/, 'render persistent story leads and field notes in the in-game journal');
assert.match(page, /id="explorationJournalContent"/, 'provide a field journal panel in the expedition UI');
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
assert.match(scene, /frontierBand/, 'show the current expansion band in the expedition HUD');
assert.match(scene, /frontierDepth/, 'show inward frontier depth and rising danger context');
assert.match(scene, /gunfire attracts attention/, 'warn players that noise escalates danger beyond the perimeter');
assert.match(scene, /route surveyed; inspect local clues/, 'surveying a route points players toward evidence rather than implying completion');
assert.match(scene, /attackInfectedButton/, 'wire the attack control to encounter state');
assert.match(scene, /Visible held weapon silhouette/, 'render a visible weapon prop for each explorer in the 3D world');
assert.match(scene, /event\.button !== 2 \|\| masterView !== 'third-person'/, 'right mouse drag orbits the third-person camera without hijacking ground travel');
assert.match(scene, /cameraYawOffset \+= event\.movementX \* 0\.006/, 'camera orbit changes the follow heading');
assert.match(scene, /cameraPitchOffset = Math\.max\(-0\.25, Math\.min\(0\.45/, 'camera pitch stays within a safe view angle');
assert.match(scene, /cameraDistance = Math\.max\(3\.5, Math\.min\(10\.5/, 'mouse wheel zoom is clamped to playable third-person distances');
assert.match(scene, /const masterView = 'third-person'/, 'exploration camera is locked to third-person');
assert.doesNotMatch(scene, /masterView = masterView === 'third-person'/, 'tactical overhead is not a general exploration hotkey');
assert.match(page, /Overhead view is reserved for base construction/, 'camera guidance reserves overhead view for base construction');
assert.match(page, /orbit/i, 'the game explains camera orbit controls to the player');
assert.match(page, /zoom/i, 'the game explains camera zoom controls to the player');
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

assert.match(scene, /const weaponId = WEAPON_IDS\.includes\(detail\.weaponId\)/, 'select only known server-equipped weapon profiles for impact feedback');
assert.match(scene, /weaponId === 'pump_shotgun' \|\| isAuto \? 'shotgun'/, 'shotgun and automatic tiers reuse the licensed firearm sample');
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
assert.match(page, /if\(action\?\.type==='build'\)\{constructionPaused=homefrontMode==='workshop';/, 'keep Workshop pause active after a successful placement while resuming normal activity outside Workshop');

assert.match(page, /const constructionView=!!pendingBuilding\|\|constructionPaused/, 'switch to construction camera only while building');
assert.match(page, /cameraPose\(\{mode:yardView\.mode,building:constructionView/, 'the refuge yard camera is third-/first-person and only goes overhead while building');
assert.match(page, /camera\.position\.lerp\((?:new THREE\.Vector3|yardCamTarget\.set)\(pose\.px,pose\.py,pose\.pz\),blend\)/, 'blend smoothly between construction and the previous walking view');
assert.doesNotMatch(page, /Vector3\(constructionView\?0:19/, 'no fixed elevated yard camera outside construction');
assert.match(page, /yardView=attachViewControls\(host,\{canLook:\(\)=>!pendingBuilding&&!constructionPaused\}\)/, 'yard look/joystick controls pause during construction');
assert.match(scene, /attachViewControls\(host, \{ onTap: onWorldTap, wheel: false \}\)/, 'Graveyard taps come from the shared controller so drag-to-look never travels');
assert.match(scene, /cameraPose\(\{ mode: view\.mode/, 'Graveyard camera follows the remembered first-/third-person mode');
assert.match(scene, /worldMove\(view\.move\(\), heading\)/, 'joystick / WASD travel is relative to the camera heading');
assert.match(scene, /noiseWarning=noiseLevel>=55\?' Loud container! Noise '/, 'loot UI warns when a noisy container can attract infected');
assert.match(scene, /if \(view\.visible\) renderer\.render/, 'offscreen Graveyard canvas skips rendering');
assert.match(page, /if\(yardView\.visible&&homefrontMode!=='expedition'\)renderer\.render/, 'hidden refuge scene skips rendering during expeditions');
assert.match(page, /vertexColors:true/, 'refuge yard ground uses subtle vertex-color variation instead of a flat slab');
assert.match(page, /yard-edge-/, 'refuge yard uses named batched edge dressing meshes');
assert.match(page, /coarsePointer\?1:1\.5/, 'refuge rendering lowers pixel ratio on touch devices');
assert.match(page, /renderer\.shadowMap\.enabled=!coarsePointer/, 'expensive yard shadows are disabled on touch devices for smoother play');

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
assert.match(readFileSync(new URL('../client/arena/homefront.html', import.meta.url), 'utf8'), /for\(let actorIndex=0;actorIndex<survivorActors\.length;actorIndex\+\+\)\{const actor=survivorActors\[actorIndex\];actor\.phase\+=dt/, 'animate survivor work activity every world frame with neighbor-aware navigation');
assert.match(readFileSync(new URL('../client/arena/homefront.html', import.meta.url), 'utf8'), /actor\.role==='mechanic'/, 'give mechanics a distinct repair-work motion');
assert.match(readFileSync(new URL('../client/arena/homefront.html', import.meta.url), 'utf8'), /actor\.role==='farmer'/, 'give farmers a distinct tending motion');
const homefrontPage = readFileSync(new URL('../client/arena/homefront.html', import.meta.url), 'utf8');
assert.match(homefrontPage, /if\(survivor\.task==='tend_crops'\|\|survivor\.role==='farmer'\)/, 'route farmers toward planted crop plots with a garden fallback');
assert.match(homefrontPage, /if\(survivor\.task==='emergency_repair'\|\|survivor\.task==='maintain_structures'\|\|survivor\.task==='stand_by_repairs'\|\|survivor\.role==='mechanic'\)/, 'send mechanics toward damaged structures before the workshop fallback');
assert.match(homefrontPage, /if\(survivor\.task==='perimeter_watch'\|\|survivor\.role==='guard'\)/, 'guards patrol the perimeter and prioritize damaged defenses');

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
assert.match(homefrontPage, /priorityButton\.disabled=busy\|\|!priorityAffordable/, 'disable priority repair when the refuge lacks required materials');
assert.match(homefrontPage, /PERIMETER STABLE · All defensive structures are at full integrity/, 'show a stable state when no perimeter defense is damaged');


// Siege incident lifecycle: warning, guard response, and persisted after-action report.
assert.match(homefrontPage, /id="siegeIncidentSummary" aria-live="polite"/, 'show a persistent accessible siege incident summary');
assert.match(homefrontPage, /incident=base\.lastSiege/, 'render the server-persisted last siege report');
assert.match(homefrontPage, /incident\.phases/, 'render the ordered incident phases');
assert.match(homefrontPage, /incident\.target\.integrityBefore/, 'show target integrity before and after the siege');
assert.match(homefrontPage, /incident\.refugeHpAfter.*base\.baseMaxHp/, 'show refuge health after the incident');


assert.match(homefrontPage, /incident\?\.status==='incoming'\?'Resolve siege defense':'Begin siege warning'/, 'switch the siege control between warning and defense phases');
assert.match(homefrontPage, /INCOMING SIEGE: inspect the threatened structure and repair if needed/, 'tell players they can assess and repair before resolving the attack');
assert.match(homefrontPage, /type:base\?\.lastSiege\?\.status==='incoming'\?'defend':'start_siege'/, 'use separate server actions for starting and resolving a siege');

assert.match(homefrontPage, /const byId=id=>id\?structures\.find\(item=>String\(item\.id\)===String\(id\)\):null;[\s\S]*?const target=byId\(survivor\.taskTarget\)/, 'resolve persisted survivor task targets consistently across ID types');
assert.match(homefrontPage, /if\(survivor\.task==='defend_perimeter'&&target\)return workSpot\(target,index,1\.45\)/, 'place responding survivors in a reachable work position at their persisted siege target');
assert.match(homefrontPage, /taskLabels\[task\]\|\|labels\[role\]/, 'show the active survivor behavior above the 3D actor');
assert.match(homefrontPage, /task:survivor\.task/, 'carry persistent behavior into survivor animation actors');
assert.match(homefrontPage, /taskNote\.textContent='Current task: '/, 'show persistent survivor tasks in the settlement roster');

assert.match(homefrontPage, /startX=Math\.cos\(startAngle\)\*2\.2,startZ=Math\.sin\(startAngle\)\*2\.2/, 'survivors begin near the refuge before walking to their assigned stations');
assert.match(homefrontPage, /targetX:x,targetZ:z,targetYaw:spot\.yaw,speed:1\.1\+\(i%3\)\*\.12/, 'each survivor actor carries a destination and individual movement speed');
assert.match(homefrontPage, /distance>\.12/, 'survivors stop moving when they reach their assigned destination');
assert.match(homefrontPage, /actor\.walkAction\.reset\(\)\.fadeIn\(\.15\)\.play\(\)/, 'blend into walk animation while moving between stations when assets provide one');
assert.match(homefrontPage, /const working=!moving&&(?:awareness\.mode!=='threat'&&)?isWorkingTask\(actor\.role,actor\.task\)/, 'task-specific work animations start only after survivors arrive at their work location');


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
assert.match(survivorVisualPage, /survivor\.task==='defend_perimeter'\?find\(\[\/aim\/i,\s*\/shoot\/i,\s*\/attack\/i,\s*\/guard\/i,\s*\/idle\/i\]\)/, 'prefer defensive stance or combat clips for guards responding to a siege');
assert.match(survivorVisualPage, /const working=!moving&&(?:awareness\.mode!=='threat'&&)?isWorkingTask\(actor\.role,actor\.task\)/, 'keep sheltering survivors out of work/aim animation transitions through task-specific work-state logic');


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


assert.match(homefrontPage, /\['quarry','⛏️ Quarry'/, 'construction menu offers a quarry for stone production');
assert.match(homefrontPage, /\['smelter','🔥 Smelter'/, 'construction menu offers a smelter for steel production');
assert.match(homefrontPage, /\['salvage_yard','♻️ Salvage yard'/, 'construction menu offers a salvage yard for scrap production');
assert.match(homefrontPage, /quarry:0x777a7d,smelter:0x8a4931,salvage_yard:0x77715f/, 'new production facilities have visible 3D color identities');


assert.match(homefrontPage, /Repair · 1 stone \+ 1 scrap/, 'stone structures display their matching repair material cost');
assert.match(homefrontPage, /Repair · 1 steel \+ 2 scrap/, 'steel structures display their matching repair material cost');


assert.match(homefrontPage, /Emergency repair · '\+emergencyText\+' · \+100 HP/, 'emergency repair controls show tier-appropriate materials');
assert.match(homefrontPage, /priorityMaterial==='steel'\?'2 steel \+ 4 scrap'/, 'live breach alert uses the same steel repair cost');


assert.match(homefrontPage, /function structureCondition\(s\)/, 'structure condition is derived from authoritative integrity');
assert.match(homefrontPage, /function drawMaterialDamage\(g,s\)/, '3D structure rendering adds material-specific damage');
assert.match(homefrontPage, /if\(s\.material==='wood'\)\{const count=condition==='SCUFFED'\?1:condition==='DAMAGED'\?2:4;/, 'wood develops increasing splinter damage as integrity falls');
assert.match(homefrontPage, /const crackCount=condition==='SCUFFED'\?1:condition==='DAMAGED'\?3:5/, 'stone develops progressively denser cracks as integrity falls');
assert.match(homefrontPage, /const scratches=condition==='SCUFFED'\?1:condition==='DAMAGED'\?3:4/, 'steel shows increasing impact scars as integrity falls');
assert.match(homefrontPage, /type:'reinforce_gate'/, 'gate controls call the server-authoritative steel reinforcement action');
assert.match(homefrontPage, /s\.reinforcementLevel>=2/, 'tier-two gate armor has a distinct 3D appearance');
assert.match(homefrontPage, /steel reinforcement '\+\(s\.reinforcementLevel\|\|0\)\+'\/2/, 'gate cards show persistent armor tier');


assert.match(page, /const ZOMBIE_BLOCKING_TYPES=new Set\(\['wall','gate','entrance','exit','sandbags','barbed_wire','trench','watchtower','turret'\]\)/, 'infected navigation treats intact perimeter structures as obstacles');
assert.match(page, /function zombieFindPath\(start,goal,structures,ignoreId=''\)/, 'infected use a grid pathfinder rather than moving in a straight line through defenses');
assert.match(page, /function zombieRouteFor\(base,start\)/, 'infected routes adapt to the current refuge perimeter');
assert.match(page, /breaches=structures\.filter\(s=>s\.hp<=0\)/, 'navigation detects destroyed perimeter structures as breaches');
assert.match(page, /zombieFindPath\(outer,inner,structures,breach\.id\)/, 'infected route through the breached opening before entering the refuge');
assert.match(page, /const candidates=structures\.filter\(s=>s\.hp>0\)\.sort\(\(a,b\)=>a\.hp\/Math\.max\(1,a\.maxHp\)-b\.hp\/Math\.max\(1,b\.maxHp\)\)/, 'without a breach, infected pressure the weakest intact perimeter structure');
assert.match(page, /while\(waypoint&&Math\.hypot\(waypoint\.x-o\.position\.x,waypoint\.z-o\.position\.z\)<\.22\)/, 'infected follow route waypoints with smooth movement');
assert.match(page, /!pendingBuilding&&!constructionPaused\)\{for\(const actor of zombieActors\)/, 'construction pause still freezes infected movement');

assert.match(page, /function zombiePlanFor\(base,start,index\)/, 'assign infected distinct breach-runner and structure-siege behaviors');
assert.match(page, /mode:'siege',targetId:target\.id/, 'retain the attacked structure identity for reactive siege presentation');
assert.match(page, /mode:'breach',targetId:breach\.id/, 'track which breach each runner is exploiting');
assert.match(page, /\/attack\|bite\|claw\|melee\|punch\/i/, 'use available zombie attack clips when the asset provides them');
assert.match(page, /attacking=!moving&&actor\.mode==='siege'/, 'infected switch into an attack stance when they reach a living defense');
assert.match(page, /actor\.attackPhase\+=dt\*7/, 'procedural fallback zombies visibly strike when no attack clip exists');
assert.match(page, /radius=1\.6\+\(index%4\)\*\.85/, 'breach runners spread into the settlement rather than stacking at its center');

assert.match(page, /function addSiegeTracer\(from,to,color=0xffb45c,lifetime=\.16\)/, 'create short-lived tracer effects for visible defensive fire');
assert.match(page, /function addSiegeImpact\(point\)/, 'render impact sparks at the structure being attacked');
assert.match(page, /function updateReactiveSiege\(dt\)/, 'coordinate siege impacts and defensive response visuals');
assert.match(page, /target=base\.structures\.find\(s=>String\(s\.id\)===String\(actor\.targetId\)&&s\.hp>0\)/, 'tie visible wall impacts to the actual targeted intact structure');
assert.match(page, /survivor\.role!=='guard'/, 'guards visually return fire during an active wave');
assert.match(page, /s\.type==='turret'/, 'intact mounted turrets visually fire at nearby infected');
assert.match(page, /target\.hitReaction=\.18/, 'defensive shots produce a visible infected hit reaction');
assert.match(page, /if\(!base\?\.wave\|\|pendingBuilding\|\|constructionPaused\)return/, 'construction mode suppresses siege and defensive-fire effects');
assert.match(page, /function updateSiegeEffects\(dt\)/, 'expire temporary tracer and impact objects cleanly');


// Confirmed firearms get visible tracer feedback, and the heavy machine gun is wired through the client weapon handling.
assert.match(scene, /tracerPool\.emit\(/, 'confirmed firearm hits draw pooled tracers (no per-shot geometry)');
assert.match(scene, /detail\.hits\.slice\(0, 6\)/, 'one tracer per server-resolved round, capped');
assert.doesNotMatch(scene, /new THREE\.Line\(new THREE\.BufferGeometry\(\)\.setFromPoints\(\[from, to\]\)/, 'no per-shot Line allocation in the Graveyard');
assert.match(scene, /heavy_machine_gun/, 'recognize the late-game heavy machine gun in client feedback and cadence');
assert.match(page, /\.\.\.firearmTiers\]\.map\(/, 'weapon bench lists the server firearm tiers');
assert.match(page, /Unlocks at refuge level '\+t\.level/, 'locked tiers explain the settlement level they need');
assert.match(page, /'Survey '\+t\.zoneLabel\+' to unlock'/, 'district requirement for the top tiers is explained');
assert.match(scene, /weaponId === 'heavy_machine_gun' \? 1\.18/, 'render a visibly longer heavy-machine-gun silhouette');
assert.match(scene, /const ammoBox = new THREE\.Mesh/, 'add a visible ammunition box to the heavy machine gun');
// Production facilities must be placeable: the client-side placement check knows their caps and costs.
assert.match(homefrontPage, /quarry:2,smelter:2,salvage_yard:2[,}].*?costs=/, 'quarry/smelter/salvage yard have client placement caps');
assert.match(homefrontPage, /gun_platform:4,mortar_pit:2\},costs=/, 'gun platform / mortar pit have client placement caps');
assert.match(homefrontPage, /gun_platform:\{wood:18,scrap:12\},mortar_pit:\{wood:8,scrap:20,steel:4\}/, 'gun platform / mortar pit have client costs matching the server');
assert.match(homefrontPage, /\['gun_platform','🗼 Gun platform'/, 'gun platform is in the build list');
assert.match(homefrontPage, /\['mortar_pit','💥 Mortar pit'/, 'mortar pit is in the build list');
assert.match(homefrontPage, /smelter:\{wood:20,scrap:18,stone:10\}/, 'smelter placement cost mirrors the server');

assert.match(scene, /WEAPON_DELAY\[equippedWeaponId\]/, 'autofire cadence mirrors the server tier table');
for (const id of ['smg','assault_rifle','machine_gun','heavy_machine_gun']) assert.match(scene, new RegExp("'" + id + "'"), id + ' is wired into Graveyard feedback');

assert.match(scene, /walkingCameraHeading\(localActor\?\.rotation\.y \|\| 0, cameraYawOffset, view\.yaw, continuousInput\.enabled\)/,
  'direct walking uses stable camera yaw instead of rotating movement with the avatar');
assert.match(scene, /directSprintRequested\(sprintTravel, view\.running\(\), aiming\)/,
  'direct walking includes Shift and the shared touch RUN button and respects aiming');


assert.match(scene, /requiresHomefrontSceneRebuild\(lastRenderedWorldData, next\)/,
  'movement acknowledgements rebuild 3D meshes only when entity visuals materially change');
assert.match(scene, /mergeHomefrontInputSnapshot\(previous, data\)/,
  'continuous server responses update the world state without discarding negotiated protocol');
assert.match(scene, /explorerPositions\.set\(p\.id, \{/,
  'remote players interpolate from authoritative coordinates without reconstructing walkers');
assert.match(scene, /applyEnvironmentStateSnapshot\(next\.world\?\.environmentStructures\)/,
  'environment collision damage remains replicated during lightweight input updates');


assert.match(scene, /refreshContinuousProximity\(next\)/,
  'direct walking refreshes actionable ranges on acknowledged server snapshots');
assert.match(scene, /homefrontInputProximity\(data, \{/,
  'loot, combat and environment controls use server-authoritative range calculations');
assert.match(scene, /selectedInteriorLandmarkId = nearInterior \? guidance\.nearest\.id : null/,
  'nearby interior enter actions update during direct walking');


assert.match(scene, /homefrontContextAction\(\{/,
  'in-world context prompt selects only nearby Homefront actions');
assert.match(scene, /homefrontActionTarget\(current, contextControls\)/,
  'context prompt delegates to existing permission-checked action controls');
assert.match(scene, /event\.code !== 'KeyE'/,
  'E key activates context actions only when view has focus');
assert.match(scene, /contextPrompt\.addEventListener\('pointerdown', event => event\.stopPropagation\(\)\)/,
  'mobile context tap cannot trigger underlying movement or raycast');


assert.match(scene, /from '\.\/homefront-power-station\.mjs'/,
  'load the Ashfall Thermal Station landmark skyline module');
assert.match(scene, /cityChunkAt\(POWER_STATION_SITE\.x, POWER_STATION_SITE\.z\)\.add\(/,
  'station belongs to the existing streamed industrial-side chunk');
assert.match(scene, /buildPowerStationSkyline\(THREE, terrainElevation\(POWER_STATION_SITE\.x, POWER_STATION_SITE\.z\)\)/,
  'station uses terrain elevation while staying decorative and off the server collision map');


assert.match(scene, /from '\.\/homefront-room-proximity\.mjs'/,
  'scene imports server-compatible physical room interaction rules');
assert.match(scene, /nearestInteriorInteraction\(roomBlueprint, interiorState, roomAnchor, worldData\.self\)/,
  'nearby E/tap targets are selected from the current room and authoritative player position');
assert.match(scene, /current\.id === 'interior-action'/,
  'in-world prompt can use authored server-backed objects');
assert.match(scene, /current\.id === 'interior-door'/,
  'in-world prompt can traverse connected rooms');
assert.match(scene, /current\.targetId !== shownContext\?\.targetId/,
  'stale nearby action targets are rejected before triggering server requests');


assert.match(scene, /from '\.\/homefront-camera-occlusion\.mjs'/,
  'Homefront imports pure third-person interior wall clearance');
assert.match(scene, /node\.userData\?\.interiorCameraOccluder/,
  'room camera raycast indexes structural occluders only once per building');
assert.match(scene, /cameraWallRaycaster\.intersectObjects\(walls\.filter\(wall => wall\.visible\), false\)/,
  'wall check skips opened doors without touching gameplay collision');
assert.match(scene, /coarsePointer \? 90 : 45/,
  'mobile raycast updates are capped lower than desktop');
assert.match(scene, /if \(view\.mode !== 'first' && interiorState\?\.landmarkId\)/,
  'first-person and outdoor movement retain the existing camera');


assert.match(scene, /from '\.\/homefront-interior-visibility\.mjs'/,
  'Homefront uses one physical building with explicit exterior/interior visual layers');
assert.match(scene, /piece\.visible = false; \/\/ Opaque street facade shown until an authenticated entry/,
  'interior geometry is not rendered over the exterior building before entry');
assert.match(scene, /applyInteriorVisualLayers\(interiorState\?\.landmarkId \|\| null, interiorSetPieces, landmarkSetPieces\)/,
  'entering or leaving swaps only the currently authorized building visual layer');
assert.match(scene, /raycaster\.intersectObjects\(\s*\[\.\.\.landmarkSetPieces\.values\(\)\]/,
  'outside facades remain clickable to request the original authenticated enter route');
assert.match(scene, /for \(const hit of interiorHits\)/,
  'floor geometry cannot swallow a clickable interior switch or doorway target');
assert.match(scene, /if \(hit\.object\.userData\?\.interiorCameraOccluder\) break;/,
  'opaque interior walls stop raycasting before a target behind them');

assert.match(scene, /claimExplorationSurvey\(survey\.id\)/,
  'Field Journal offers explicit manually initiated survey claims');
assert.match(scene, /exploration\/claim/,
  'survey reward claims always use authenticated server routes');
assert.match(scene, /data\.surveys/,
  'one-time contract readiness comes from the server, not local landmark flags');
assert.match(scene, /explorationSurveyPending\.has\(contractId\)/,
  'duplicate claim clicks are suppressed while a request is pending');


assert.match(scene, /from '\.\/homefront-atmosphere\.mjs'/,
  'Homefront reuses authored site district data for lightweight cosmetic environmental changes');
assert.match(scene, /atmosphereAt\(\{/,
  'world frame loop computes conditions from server-confirmed position and active room');
assert.match(scene, /scene\.fog\.color\.lerp\(ambientFogColor,ambientBlend\)/,
  'existing fog color transitions smoothly without added postprocessing or lights');
assert.match(scene, /ashMotes\.visible = ambientTarget\.ashVisible/,
  'outdoor ash is hidden when entering a sheltered shared room');
assert.match(scene, /lastAmbientUpdateAt >= AMBIENT_UPDATE_MS/,
  'cosmetic profiles refresh on a bounded cadence, not once per particle per frame');


assert.match(scene, /from '\.\/homefront-interior-lamps\.mjs'/,
  'Homefront loads the batched room lighting profile helper');
assert.match(scene, /applyInteriorLampProfile\(interiorSetPieces\.get\(interiorState\.landmarkId\), interiorState\)/,
  'power restoration visuals consume authenticated shared interior flags');


assert.match(scene, /from '\.\/homefront-interior-event-feed\.mjs'/,
  'world scene shows real server-owned shared building events');
assert.match(scene, /showInteriorEvent\(data\.interiorInstance\)/,
  'full world snapshot updates nearby shared event state');
assert.match(scene, /showInteriorEvent\(merged\.world\.interiorInstance\)/,
  '2.4-second presence polls can show new co-op alarms without a full reload');
assert.match(scene, /if \(!eventToast\.hidden && now > eventToastUntil\) eventToast\.hidden = true;/,
  'immersive feedback is short-lived and does not block game controls');
assert.match(scene, /sfx\.radio\(\)/,
  'the existing sound system handles the shared shutter alarm');
assert.match(scene, /explorationEvidence = data\.evidence/,
  'individual survivor clue notes come from the server');
assert.match(scene, /explorationEvidence\.slice\(-20\)\.reverse\(\)/,
  'evidence list uses capped authored text');
