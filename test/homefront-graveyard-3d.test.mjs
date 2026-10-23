import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const scene = readFileSync(new URL('../client/arena/homefront-graveyard-3d.js', import.meta.url), 'utf8');
const page = readFileSync(new URL('../client/arena/homefront.html', import.meta.url), 'utf8');

assert.match(scene, /from '\.\/vendor\/three\.module\.min\.js'/, 'reuse the vendored Three.js runtime');
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
assert.match(page, /id="packFood"/, 'allow rations to be packed from refuge stores');
assert.match(page, /id="stashInventory"/, 'allow carried supplies to be stashed');
assert.match(page, /id="drinkInField"/, 'provide a hydration action');
assert.match(page, /id="cosmeticCollection"/, 'provide the cosmetic skin collection UI');
assert.match(page, /cosmetic-only|never change combat power/i, 'explain that cosmetic skins do not affect combat power');
assert.match(page, /homefront-graveyard-3d\.js/, 'load the 3D scene module');
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
assert.match(scene, /pointercancel|pointerup/, 'stop autofire on pointer release or cancellation');
assert.match(scene, /JSON\.stringify\(targetId \? \{ targetId/, 'include the selected target with combat requests');

