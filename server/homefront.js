// Authenticated, persistent API for the optional unranked Zombies Homefront mode.
'use strict';
const Store = require('./store');
const Core = require('./homefront-core');
const World = require('./homefront-world');
const Combat = require('./homefront-combat');
const Survival = require('./homefront-survival');
const Inventory = require('./homefront-inventory');
const Loot = require('./homefront-loot');

const SESSION_RESOURCES = ['wood','scrap','food','water','meds','ammo'];
function addSessionTotals(player, { embers = 0, resources = {}, consumed = {} } = {}) {
  const stats = player?.homefrontSessionStart?.totals;
  if (!stats) return;
  stats.embersEarned += Math.max(0, Number.isFinite(embers) ? embers : 0);
  for (const id of SESSION_RESOURCES) {
    stats.resourcesCollected[id] += Math.max(0, Number.isFinite(resources[id]) ? resources[id] : 0);
    stats.suppliesConsumed[id] += Math.max(0, Number.isFinite(consumed[id]) ? consumed[id] : 0);
  }
  stats.rewardEvents += 1;
}
function initSessionStart(player, base, now = Date.now()) {
  if (player.homefrontSessionStart && Number.isFinite(player.homefrontSessionStart.at)) return;
  player.homefrontSessionStart = {
    at: now, embers: base.embers, resources: { ...base.resources },
    repelledCount: Number.isSafeInteger(base.repelledCount) ? base.repelledCount : 0,
    totals: { embersEarned: 0, resourcesCollected: Object.fromEntries(SESSION_RESOURCES.map(id => [id, 0])), suppliesConsumed: Object.fromEntries(SESSION_RESOURCES.map(id => [id, 0])), rewardEvents: 0, repels: 0 }
  };
}
function buildReturnDebrief(start, base, packed, now = Date.now()) {
  const resourceNet = {};
  for (const id of ['wood','scrap','food','water','meds','ammo']) {
    resourceNet[id] = (base.resources?.[id] || 0) - (Number.isFinite(start?.resources?.[id]) ? start.resources[id] : (base.resources?.[id] || 0));
  }
  return {
    startedAt: Number.isFinite(start?.at) ? start.at : null,
    endedAt: now,
    embersNet: (base.embers || 0) - (Number.isFinite(start?.embers) ? start.embers : (base.embers || 0)),
    resourceNet,
    attacksRepelled: Math.max(0, Number.isSafeInteger(start?.totals?.repels) ? start.totals.repels : (base.repelledCount || 0) - (Number.isSafeInteger(start?.repelledCount) ? start.repelledCount : (base.repelledCount || 0))),
    fieldSuppliesReturned: Object.values(packed?.stored || {}).reduce((n, qty) => n + (Number.isFinite(qty) ? qty : 0), 0),
    grossEmbersEarned: Math.max(0, Number.isFinite(start?.totals?.embersEarned) ? start.totals.embersEarned : 0),
    grossResourcesCollected: Object.fromEntries(SESSION_RESOURCES.map(id => [id, Math.max(0, Number.isFinite(start?.totals?.resourcesCollected?.[id]) ? start.totals.resourcesCollected[id] : 0)])),
    suppliesConsumed: Object.fromEntries(SESSION_RESOURCES.map(id => [id, Math.max(0, Number.isFinite(start?.totals?.suppliesConsumed?.[id]) ? start.totals.suppliesConsumed[id] : 0)])),
    rewardEvents: Math.max(0, Number.isSafeInteger(start?.totals?.rewardEvents) ? start.totals.rewardEvents : 0)
  };
}

async function handle(req, res, url, { json, gate, ip, body, who, store = Store }) {
  const publicVisit = url.pathname === '/api/homefront/visit';
  const worldRoute = url.pathname === '/api/homefront/world' || url.pathname.startsWith('/api/homefront/world/');
  if (url.pathname !== '/api/homefront' && url.pathname !== '/api/homefront/action' && !publicVisit && !worldRoute) return false;
  if (req.method !== 'GET' && req.method !== 'POST') { json(res, 405, { error: 'method_not_allowed' }); return true; }
  if (publicVisit) {
    if (req.method !== 'GET') { json(res, 405, { error: 'method_not_allowed' }); return true; }
    if (gate('homefront-visit-ip:' + ip, 60, 60e3)) { json(res, 429, { error: 'slow_down' }); return true; }
    try {
      const owner = String(url.searchParams.get('owner') || '').trim();
      if (!owner || owner.length > 128) { json(res, 400, { error: 'invalid_owner' }); return true; }
      const db = store.load('homefront.json', {});
      const saved = db[owner];
      if (!saved || saved.visibility !== 'public') { json(res, 404, { error: 'refuge_private_or_not_found', message: 'This refuge is private or does not exist.' }); return true; }
      const base = Core.validateBase(saved, owner);
      if (!base || base.visibility !== 'public') { json(res, 404, { error: 'refuge_private_or_not_found' }); return true; }
      // Visitors receive a read-only settlement snapshot. Never expose the owner's action route here.
      json(res, 200, { mode: 'homefront-visit', base: { ...base, owner: undefined, log: base.log.slice(-8) } });
      return true;
    } catch (e) { json(res, 500, { error: 'homefront_visit_unavailable' }); return true; }
  }
  const user = who();
  if (!user?.acct) { json(res, 401, { error: 'sign_in_with_xaman', message: 'Sign in to save your personal refuge.' }); return true; }
  if (worldRoute) {
    if (gate('homefront-world:' + user.acct, 120, 60e3) || gate('homefront-world-ip:' + ip, 300, 60e3)) { json(res, 429, { error: 'slow_down' }); return true; }
    try {
      const payload = req.method === 'POST' ? await body() : null;
      const db = World.normalizeWorld(store.load('homefront-world.json', World.defaultWorld()));
      let outcome;
      if (req.method === 'GET' && url.pathname === '/api/homefront/world') {
        if (db.players && db.players[user.acct] && Date.now() - db.players[user.acct].lastSeen <= World.PRESENCE_TTL) {
          const joined = World.enter(db, user.acct);
          store.save('homefront-world.json', joined.world);
          json(res, 200, { mode: 'homefront-world', ...joined.result }); return true;
        }
        json(res, 200, { mode: 'homefront-world', ...World.snapshot(db, user.acct) }); return true;
      }
      if (req.method !== 'POST' || !payload || typeof payload !== 'object' || Array.isArray(payload)) { json(res, 400, { error: 'invalid_world_action' }); return true; }
      switch (url.pathname) {
        case '/api/homefront/world/survival': {
          const player = db.players[user.acct];
          if (!player) throw new Error('not_in_expedition');
          const action = typeof payload.action === 'string' ? payload.action : '';
          const now = Date.now();
          const bases = store.load('homefront.json', {});
          const base = Core.validateBase(bases[user.acct] || Core.createBase(user.acct), user.acct);
          if (!base) throw new Error('save_invalid');
          let inventory = Inventory.normalize(player.inventory);
          let survival;
          let logText = '';
          if (action === 'cook_food' || action === 'purify_water') {
            const recipe = action === 'cook_food'
              ? { input: 'rawFood', output: 'food', label: 'Cooked raw food at a safe heat source.' }
              : { input: 'dirtyWater', output: 'water', label: 'Purified dirty water using field fuel.' };
            if (inventory[recipe.input] < 1) throw new Error('missing_' + recipe.input);
            if (inventory.wood < 1) throw new Error('missing_fuel');
            const converted = Inventory.add(inventory, recipe.output, 1);
            if (converted.accepted !== 1) throw new Error('inventory_full');
            inventory = Inventory.remove(converted.inventory, recipe.input, 1).inventory;
            inventory = Inventory.remove(inventory, 'wood', 1).inventory;
            survival = Survival.tick(player.survival, now);
            logText = recipe.label;
          } else {
            const itemFor = { eat: 'food', drink: 'water', bandage: 'meds' }[action];
            if (itemFor) inventory = Inventory.remove(inventory, itemFor, 1).inventory;
            survival = Survival.act(player.survival, action, now);
            logText = ({ eat: 'Consumed a cooked ration in the field.', drink: 'Drank carried clean water in the field.', bandage: 'Used carried medical supplies to treat field injuries.', catch_breath: 'Stopped to recover stamina.' })[action];
          }
          const survivalConsumed = {};
          if (action === 'eat') survivalConsumed.food = 1;
          if (action === 'drink') survivalConsumed.water = 1;
          if (action === 'bandage') survivalConsumed.meds = 1;
          if (action === 'cook_food') { survivalConsumed.food = 1; survivalConsumed.wood = 1; }
          if (action === 'purify_water') { survivalConsumed.water = 1; survivalConsumed.wood = 1; }
          if (Object.keys(survivalConsumed).length) addSessionTotals(player, { consumed: survivalConsumed });
          player.inventory = inventory;
          player.survival = survival;
          player.lastSeen = now;
          if (logText && action !== 'catch_breath') {
            base.revision++;
            base.updatedAt = now;
            base.log.push({ id: (base.log.at(-1)?.id || 0) + 1, kind: 'survival', text: logText, at: now });
            base.log = base.log.slice(-20);
            bases[user.acct] = base;
            store.save('homefront.json', bases);
          }
          store.save('homefront-world.json', db);
          json(res, 200, { mode: 'homefront-world', ...World.snapshot(db, user.acct, now), base, survival, inventory: { ...inventory, used: Inventory.used(inventory), capacity: Inventory.CAPACITY } });
          return true;
        }
        case '/api/homefront/world/inventory': {
          const player = db.players[user.acct];
          if (!player) throw new Error('not_in_expedition');
          const bases = store.load('homefront.json', {});
          const base = Core.validateBase(bases[user.acct] || Core.createBase(user.acct), user.acct);
          if (!base) throw new Error('save_invalid');
          const action = typeof payload.action === 'string' ? payload.action : '';
          let inventory = Inventory.normalize(player.inventory);
          if (action === 'take') {
            const id = typeof payload.item === 'string' ? payload.item : '';
            const qty = Number.isFinite(payload.amount) ? payload.amount : 1;
            const taken = Inventory.withdraw(inventory,base.resources,id,qty);
            inventory=taken.inventory;base.resources=taken.resources;
            base.revision++;base.updatedAt=Date.now();
            base.log.push({id:(base.log.at(-1)?.id||0)+1,kind:'inventory',text:'Packed '+taken.taken+' '+id+' from refuge stores.',at:Date.now()});
          } else if (action === 'stash' || action === 'return') {
            const packed=Inventory.stash(inventory,base.resources);inventory=packed.inventory;
            for(const [id,qty] of Object.entries(packed.stored))base.resources[id]=Math.min(999999,(base.resources[id]||0)+qty);
            base.revision++;base.updatedAt=Date.now();
            base.log.push({id:(base.log.at(-1)?.id||0)+1,kind:'inventory',text:'Returned field supplies to refuge stores.',at:Date.now()});
          } else throw new Error('unknown_inventory_action');
          base.log=base.log.slice(-20);bases[user.acct]=base;player.inventory=inventory;player.lastSeen=Date.now();
          store.save('homefront.json',bases);store.save('homefront-world.json',db);
          json(res,200,{mode:'homefront-world',...World.snapshot(db,user.acct),base,inventory:{...inventory,used:Inventory.used(inventory),capacity:Inventory.CAPACITY}});
          return true;
        }
        case '/api/homefront/world/loot': {
          const player = db.players[user.acct];
          if (!player) throw new Error('not_in_expedition');
          const now = Date.now();
          const found = Loot.claim(db.lootNodes, {
            account: user.acct,
            player,
            nodeId: typeof payload.nodeId === 'string' ? payload.nodeId : '',
            now,
            addItem: (inventory, item, amount) => Inventory.add(inventory, item, amount)
          });
          db.lootNodes = found.state;
          player.lastSeen = now;
          player.survival = Survival.tick(player.survival, now);
          const bases = store.load('homefront.json', {});
          const base = Core.validateBase(bases[user.acct] || Core.createBase(user.acct), user.acct);
          if (!base) throw new Error('save_invalid');
          const lootResources = {};
          for (const drop of [...found.accepted, ...found.overflow]) {
            const resourceId = ({ rawFood: 'food', dirtyWater: 'water' })[drop.item] || drop.item;
            if (Object.prototype.hasOwnProperty.call(base.resources, resourceId)) {
              lootResources[resourceId] = (lootResources[resourceId] || 0) + drop.amount;
            }
          }
          addSessionTotals(player, { resources: lootResources });
          for (const drop of found.overflow) {
            const resourceId = ({ rawFood: 'food', dirtyWater: 'water' })[drop.item] || drop.item;
            if (Object.prototype.hasOwnProperty.call(base.resources, resourceId)) {
              base.resources[resourceId] = Math.min(999999, (base.resources[resourceId] || 0) + drop.amount);
            }
          }
          if (found.overflow.length) {
            base.revision++; base.updatedAt = now;
            base.log.push({id:(base.log.at(-1)?.id||0)+1,kind:'scavenge',text:'Overflow from a field supply container was transferred to refuge stores.',at:now});
            base.log=base.log.slice(-20);
            bases[user.acct]=base;
            store.save('homefront.json',bases);
          }
          store.save('homefront-world.json', db);
          json(res, 200, {
            mode: 'homefront-world',
            ...World.snapshot(db, user.acct, now),
            base,
            loot: { node: found.node, accepted: found.accepted, overflow: found.overflow, overflowDestination: 'refuge' },
            inventory: { ...Inventory.normalize(player.inventory), used: Inventory.used(player.inventory), capacity: Inventory.CAPACITY }
          });
          return true;
        }
        case '/api/homefront/world/encounter': {
          if (req.method !== 'POST') { json(res, 405, { error: 'method_not_allowed' }); return true; }
          const player = db.players[user.acct];
          if (!player) throw new Error('not_in_expedition');
          const spawned = Combat.spawn({ encounters: db.encounters, account: user.acct, player, now: Date.now() });
          db.encounters = spawned.encounters;
          player.lastSeen = Date.now();
          store.save('homefront-world.json', db);
          json(res, 200, { mode: 'homefront-world', ...World.snapshot(db, user.acct), encounter: spawned.encounter, reused: spawned.reused });
          return true;
        }
        case '/api/homefront/world/reload': {
          if (req.method !== 'POST') { json(res, 405, { error: 'method_not_allowed' }); return true; }
          const player = db.players[user.acct];
          if (!player) throw new Error('not_in_expedition');
          const bases = store.load('homefront.json', {});
          const base = Core.validateBase(bases[user.acct] || Core.createBase(user.acct), user.acct);
          if (!base) throw new Error('save_invalid');
          const weaponId = Object.prototype.hasOwnProperty.call(Combat.WEAPON_MAGAZINE_CAPACITY, base.equippedWeapon) ? base.equippedWeapon : 'pipe_blade';
          const capacity = Combat.WEAPON_MAGAZINE_CAPACITY[weaponId];
          if (capacity < 1) throw new Error('weapon_does_not_reload');
          const magazine = player.weaponMagazine && player.weaponMagazine.weaponId === weaponId ? player.weaponMagazine : { weaponId, loaded: 0 };
          const inventory = Inventory.normalize(player.inventory);
          const requestedRounds = Number.isInteger(payload.rounds) ? Math.max(1, Math.min(capacity, payload.rounds)) : capacity;
          const loaded = Math.min(requestedRounds, capacity - magazine.loaded, inventory.ammo);
          if (loaded <= 0) throw new Error(magazine.loaded >= capacity ? 'magazine_full' : 'no_reserve_ammo');
          inventory.ammo -= loaded;
          player.inventory = inventory;
          player.weaponMagazine = { weaponId, loaded: magazine.loaded + loaded };
          player.lastSeen = Date.now();
          store.save('homefront-world.json', db);
          json(res, 200, { mode: 'homefront-world', ...World.snapshot(db, user.acct), inventory: { ...inventory, used: Inventory.used(inventory), capacity: Inventory.CAPACITY }, reloaded: loaded });
          return true;
        }
        case '/api/homefront/world/attack': {
          if (req.method !== 'POST') { json(res, 405, { error: 'method_not_allowed' }); return true; }
          const player = db.players[user.acct];
          if (!player) throw new Error('not_in_expedition');
          const bases = store.load('homefront.json', {});
          const savedBase = bases[user.acct] || Core.createBase(user.acct);
          const base = Core.validateBase(savedBase, user.acct);
          if (!base) throw new Error('save_invalid');
          const carried = Inventory.normalize(player.inventory);
          const weaponId = Object.prototype.hasOwnProperty.call(Combat.WEAPON_MAGAZINE_CAPACITY, base.equippedWeapon) ? base.equippedWeapon : 'pipe_blade';
          const magazine = player.weaponMagazine && player.weaponMagazine.weaponId === weaponId ? player.weaponMagazine : { weaponId, loaded: 0 };
          const combatBase = Core.validateBase({ ...base, resources: { ...base.resources, ammo: magazine.loaded } }, user.acct);
          const combatAt = Date.now();
          const survivalBeforeAttack = Survival.tick(player.survival, combatAt);
          const outcome = Combat.attack({ encounters: db.encounters, account: user.acct, player, base: combatBase, survival: survivalBeforeAttack, now: combatAt, weaponPower: Core.weaponPower(base), targetId: payload?.targetId ?? null, aimPoint: payload?.aimPoint ?? null });
          player.weaponMagazine = { weaponId, loaded: outcome.base.resources.ammo };
          outcome.base.resources.ammo = base.resources.ammo;
          player.inventory = carried;
          db.encounters = outcome.encounters;
          player.survival = outcome.survival || survivalBeforeAttack;
          if (outcome.enemyDamage > 0) {
            player.survival.health = Math.max(0, player.survival.health - outcome.enemyDamage);
            player.survival.infection = Math.min(100, player.survival.infection + Math.max(1, Math.floor(outcome.enemyDamage / 4)));
          }
          player.lastSeen = combatAt;
          bases[user.acct] = outcome.base;
          store.save('homefront.json', bases);
          store.save('homefront-world.json', db);
          json(res, 200, { mode: 'homefront-world', ...World.snapshot(db, user.acct), encounter: outcome.encounter, combat: { killed: outcome.killed, damage: outcome.damage, hitZone: outcome.hitZone, aimed: outcome.aimed, aimStability: outcome.aimStability, adsProgress: outcome.adsProgress, enemyDamage: outcome.enemyDamage, ammoCost: outcome.ammoCost, reward: outcome.reward }, inventory: { ...Inventory.normalize(player.inventory), used: Inventory.used(player.inventory), capacity: Inventory.CAPACITY }, base: outcome.base });
          return true;
        }
        case '/api/homefront/world/enter': {
          outcome=World.enter(db,user.acct);
          const player=outcome.world.players[user.acct];
          if(player&&!player.inventoryInitialized){
            const bases=store.load('homefront.json',{});
            const base=Core.validateBase(bases[user.acct]||Core.createBase(user.acct),user.acct);
            if(!base)throw new Error('save_invalid');
            const kit={food:Math.min(2,base.resources.food),water:Math.min(2,base.resources.water),meds:Math.min(1,base.resources.meds),ammo:Math.min(4,base.resources.ammo),scrap:0,wood:0};
            for(const [id,qty] of Object.entries(kit))base.resources[id]=Math.max(0,(base.resources[id]||0)-qty);
            player.inventory=Inventory.normalize(kit);player.inventoryInitialized=true;
            base.revision++;base.updatedAt=Date.now();base.log.push({id:(base.log.at(-1)?.id||0)+1,kind:'inventory',text:'Packed a starter field kit from refuge stores.',at:Date.now()});base.log=base.log.slice(-20);
            bases[user.acct]=base;store.save('homefront.json',bases);outcome.result=World.snapshot(outcome.world,user.acct);
          }
          if (player) {
            const sessionBases = store.load('homefront.json', {});
            const sessionBase = Core.validateBase(sessionBases[user.acct] || Core.createBase(user.acct), user.acct);
            if (!sessionBase) throw new Error('save_invalid');
            sessionBase.repelledCount = Number.isSafeInteger(sessionBase.repelledCount) ? sessionBase.repelledCount : 0;
            initSessionStart(player, sessionBase);
          }
          break;
        }
        case '/api/homefront/world/move': outcome = World.move(db, user.acct, Number(payload.x), Number(payload.z), Date.now(), payload.sprint === true); break;
        case '/api/homefront/world/aim': outcome = World.setAiming(db, user.acct, payload.aiming, Date.now()); break;
        case '/api/homefront/world/rescue': {
          const player = db.players[user.acct];
          if (!player) throw new Error('not_in_expedition');
          const nearest = World.nearestPoint(player.x, player.z, 'rescue');
          if (!nearest || nearest.distance > 14) throw new Error('too_far_from_rescue');
          if (payload.pointId && payload.pointId !== nearest.point.id) throw new Error('too_far_from_rescue');
          const now = Date.now();
          const rescue = db.rescues[nearest.point.id];
          if (rescue.readyAt > now) throw new Error('rescue_unavailable');
          const bases = store.load('homefront.json', {});
          const savedBase = bases[user.acct] || Core.createBase(user.acct);
          const base = Core.validateBase(savedBase, user.acct);
          if (!base) throw new Error('save_invalid');
          const difficulty = typeof payload.difficulty === 'string' ? payload.difficulty : 'standard';
          const carried=Inventory.normalize(player.inventory);
          if(carried.food<2||carried.ammo<1)throw new Error('field_supplies_required');
          const carriedBefore={...carried};
          const workingBase=Core.validateBase({...base,resources:{...base.resources,food:carried.food,ammo:carried.ammo}},user.acct);
          const nextBase=Core.applyAction(workingBase,user.acct,{type:'rescue_survivor',zone:nearest.point.zone,difficulty},now);
          carried.food=nextBase.resources.food;carried.ammo=nextBase.resources.ammo;
          addSessionTotals(player,{embers:Math.max(0,nextBase.embers-base.embers),consumed:{food:Math.max(0,carriedBefore.food-carried.food),ammo:Math.max(0,carriedBefore.ammo-carried.ammo)}});
          nextBase.resources.food=base.resources.food;nextBase.resources.ammo=base.resources.ammo;player.inventory=carried;
          rescue.readyAt = now + 8 * 60e3;
          bases[user.acct] = nextBase;
          store.save('homefront.json', bases);
          player.lastSeen = now;
          store.save('homefront-world.json', db);
          const snap = World.snapshot(db, user.acct, now);
          json(res, 200, { mode: 'homefront-world', ...snap, base: nextBase, encounter: { id: nearest.point.id, label: nearest.point.label, rescued: true, readyAt: rescue.readyAt, difficulty, survivor: nextBase.survivors.at(-1), event: nextBase.log.at(-1)?.text } });
          return true;
        }
        case '/api/homefront/world/cache': {
          const player = db.players[user.acct];
          if (!player) throw new Error('not_in_expedition');
          const nearest = World.nearestPoint(player.x, player.z, 'cache');
          if (!nearest || nearest.distance > 14) throw new Error('too_far_from_cache');
          if (payload.pointId && payload.pointId !== nearest.point.id) throw new Error('too_far_from_cache');
          const now = Date.now();
          const cache = db.caches[nearest.point.id];
          if (cache.readyAt > now) throw new Error('cache_empty');
          const bases = store.load('homefront.json', {});
          const savedBase = bases[user.acct] || Core.createBase(user.acct);
          const base = Core.validateBase(savedBase, user.acct);
          if (!base) throw new Error('save_invalid');
          const difficulty = typeof payload.difficulty === 'string' ? payload.difficulty : 'standard';
          const spec = Core.DIFFICULTIES[difficulty];
          if (!spec) throw new Error('unknown_difficulty');
          const carried=Inventory.normalize(player.inventory);
          if(carried.food<2||carried.ammo<1)throw new Error('field_supplies_required');
          const carriedBefore={...carried};
          const workingBase=Core.validateBase({...base,resources:{...base.resources,food:carried.food,ammo:carried.ammo}},user.acct);
          const nextBase=Core.applyAction(workingBase,user.acct,{type:'expedition',zone:nearest.point.zone,difficulty});
          const expeditionEmbers=Math.max(0,nextBase.embers-base.embers);
          const grossResources={};
          for(const id of ['wood','scrap','meds'])grossResources[id]=Math.max(0,(nextBase.resources[id]||0)-(base.resources[id]||0));
          carried.food=nextBase.resources.food;carried.ammo=nextBase.resources.ammo;
          nextBase.resources.food=base.resources.food;nextBase.resources.ammo=base.resources.ammo;
          const scrap = Math.floor((8 + nearest.point.risk * 4) * spec.reward);
          const wood = Math.floor((4 + nearest.point.risk * 2) * spec.reward);
          const ammo = Math.floor((2 + nearest.point.risk * 2) * spec.reward);
          const meds = nearest.point.risk >= 3 ? Math.max(1, Math.floor((nearest.point.risk - 2) * spec.reward)) : 0;
          const embers = Math.floor((15 + nearest.point.risk * 10) * spec.reward);
          nextBase.resources.scrap = Math.min(999999, nextBase.resources.scrap + scrap);
          nextBase.resources.wood = Math.min(999999, nextBase.resources.wood + wood);
          nextBase.resources.ammo = Math.min(999999, nextBase.resources.ammo + ammo);
          nextBase.resources.meds = Math.min(999999, nextBase.resources.meds + meds);
          for(const id of ['scrap','wood','ammo','meds']){
            const found=Math.max(0,(nextBase.resources[id]||0)-(base.resources[id]||0));
            if(found){const packed=Inventory.add(carried,id,found);carried[id]=packed.inventory[id];nextBase.resources[id]=Math.max(0,(nextBase.resources[id]||0)-packed.accepted);}
          }
          nextBase.resources.food=base.resources.food;player.inventory=carried;
          nextBase.embers = Math.min(999999999, nextBase.embers + embers);
          nextBase.log.push({ id: (nextBase.log.at(-1)?.id || 0) + 1, kind: 'cache', text: 'Opened ' + nearest.point.label + ' on ' + spec.label + ': bonus cache yielded ' + scrap + ' scrap, ' + wood + ' wood, ' + ammo + ' ammunition, ' + meds + ' medicine, and ' + embers + ' Embers. The shared cache will replenish in five minutes.', at: now });
          nextBase.log = nextBase.log.slice(-20);
          for(const id of ['scrap','wood','ammo','meds'])grossResources[id]=(grossResources[id]||0)+({scrap,wood,ammo,meds}[id]||0);
          addSessionTotals(player,{embers:expeditionEmbers+embers,resources:grossResources,consumed:{food:Math.max(0,carriedBefore.food-carried.food),ammo:Math.max(0,carriedBefore.ammo-carried.ammo)}});
          cache.readyAt = now + 5 * 60e3;
          bases[user.acct] = nextBase;
          store.save('homefront.json', bases);
          player.lastSeen = now;
          store.save('homefront-world.json', db);
          const snap = World.snapshot(db, user.acct, now);
          json(res, 200, { mode: 'homefront-world', ...snap, base: nextBase, encounter: { id: nearest.point.id, label: nearest.point.label, cacheOpened: true, readyAt: cache.readyAt, bonus: { scrap, wood, ammo, meds, embers }, difficulty, event: nextBase.log.at(-1)?.text } });
          return true;
        }
        case '/api/homefront/world/scavenge':
        case '/api/homefront/world/boss-hunt': {
          const player = db.players[user.acct];
          if (!player) throw new Error('not_in_expedition');
          const isBoss = url.pathname.endsWith('/boss-hunt');
          const nearest = World.nearestPoint(player.x, player.z, isBoss ? 'boss' : 'non-boss');
          if (!nearest || nearest.distance > (isBoss ? 14 : 18)) throw new Error(isBoss ? 'not_at_boss_site' : 'too_far_from_site');
          if (isBoss && payload.pointId && payload.pointId !== nearest.point.id) throw new Error('not_at_boss_site');
          const bases = store.load('homefront.json', {});
          const savedBase = bases[user.acct] || Core.createBase(user.acct);
          const base = Core.validateBase(savedBase, user.acct);
          if (!base) throw new Error('save_invalid');
          const difficulty = typeof payload.difficulty === 'string' ? payload.difficulty : 'standard';
          let workingBase=base;
          const carried=Inventory.normalize(player.inventory);
          if(carried.food<2||carried.ammo<1)throw new Error('field_supplies_required');
          const carriedBefore={...carried};
          workingBase=Core.validateBase({...base,resources:{...base.resources,food:carried.food,ammo:carried.ammo}},user.acct);
          const nextBase=Core.applyAction(workingBase,user.acct,{type:isBoss?'boss_attack':'expedition',zone:nearest.point.zone,difficulty});
          let grossEmbers=Math.max(0,nextBase.embers-base.embers);
          const grossResources={};
          carried.food=nextBase.resources.food;carried.ammo=nextBase.resources.ammo;
          nextBase.resources.food=base.resources.food;nextBase.resources.ammo=base.resources.ammo;
          let defeated = false;
          if (isBoss) {
            const boss = db.bosses[nearest.point.id];
            if (boss.respawnAt && boss.respawnAt <= Date.now()) { boss.hp = boss.maxHp; boss.respawnAt = 0; }
            if (boss.respawnAt > Date.now() || boss.hp <= 0) throw new Error('boss_respawning');
            const threatScale = Core.DIFFICULTIES[difficulty]?.threat;
            if (!threatScale) throw new Error('unknown_difficulty');
            const combatPower = Core.weaponPower(nextBase);
            const weaponDamage = Math.max(8, Math.floor(((nearest.point.id === 'research_annex' ? 30 : 36) + (combatPower - 1) * 4) / threatScale));
            boss.hp = Math.max(0, boss.hp - weaponDamage);
            if (boss.hp === 0) {
              defeated = true; boss.respawnAt = Date.now() + 5 * 60e3;
              nextBase.resources.scrap = Math.min(999999, nextBase.resources.scrap + 45);
              nextBase.resources.meds = Math.min(999999, nextBase.resources.meds + 3);
              const bossEmbers = 80 * Core.DIFFICULTIES[difficulty].reward;
              nextBase.embers = Math.min(999999999, nextBase.embers + Math.floor(bossEmbers));
              nextBase.log.push({ id: (nextBase.log.at(-1)?.id || 0) + 1, kind: 'boss', text: 'Boss defeated at ' + nearest.point.label + '! Recovered 45 bonus scrap, 3 medicine, and bonus embers.', at: Date.now() });
              nextBase.log = nextBase.log.slice(-20);
            }
          }
          grossEmbers=Math.max(0,nextBase.embers-base.embers);
          for(const id of ['wood','scrap','meds']){
            const found=Math.max(0,(nextBase.resources[id]||0)-(base.resources[id]||0));
            grossResources[id]=found;
            if(found){const packed=Inventory.add(carried,id,found);carried[id]=packed.inventory[id];nextBase.resources[id]=Math.max(0,(nextBase.resources[id]||0)-packed.accepted);}
          }
          addSessionTotals(player,{embers:grossEmbers,resources:grossResources,consumed:{food:Math.max(0,carriedBefore.food-carried.food),ammo:Math.max(0,carriedBefore.ammo-carried.ammo)}});
          player.inventory=carried;
          bases[user.acct] = nextBase; store.save('homefront.json', bases);
          player.lastSeen = Date.now();
          store.save('homefront-world.json', db);
          const snap = World.snapshot(db, user.acct);
          json(res, 200, { mode: 'homefront-world', ...snap, base: nextBase, inventory: { ...Inventory.normalize(player.inventory), used: Inventory.used(player.inventory), capacity: Inventory.CAPACITY }, encounter: isBoss ? { id: nearest.point.id, label: nearest.point.label, hp: db.bosses[nearest.point.id].hp, maxHp: db.bosses[nearest.point.id].maxHp, defeated, difficulty, weapon: nextBase.equippedWeapon } : { id: nearest.point.id, label: nearest.point.label, scavenged: true, difficulty, event: nextBase.log.at(-1)?.text } });
          return true;
        }
        case '/api/homefront/world/party/create': outcome = World.createParty(db, user.acct); break;
        case '/api/homefront/world/party/join': outcome = World.joinParty(db, user.acct, payload.code); break;
        case '/api/homefront/world/leave': {
          const player=db.players[user.acct];
          let returnedBase=null;
          if(player){
            const bases=store.load('homefront.json',{});
            const base=Core.validateBase(bases[user.acct]||Core.createBase(user.acct),user.acct);
            if(!base)throw new Error('save_invalid');
            const packed=Inventory.stash(player.inventory,base.resources);
            for(const [id,qty] of Object.entries(packed.stored))base.resources[id]=Math.min(999999,(base.resources[id]||0)+qty);
            base.repelledCount = Number.isSafeInteger(base.repelledCount) ? base.repelledCount : 0;
            const debrief = buildReturnDebrief(player.homefrontSessionStart, base, packed);
            base.revision++;base.updatedAt=Date.now();bases[user.acct]=base;store.save('homefront.json',bases);returnedBase=base;
            outcome = World.leave(db,user.acct);
            if (returnedBase) outcome.result.base = returnedBase;
            outcome.result.debrief = debrief;
            break;
          }
          outcome=World.leave(db,user.acct);
          break;
        }
        default: json(res, 404, { error: 'world_route_not_found' }); return true;
      }
      store.save('homefront-world.json', outcome.world);
      json(res, 200, { mode: 'homefront-world', ...outcome.result }); return true;
    } catch (e) {
      const message = String(e?.message || 'homefront_world_error');
      const clientError = /^(not_in_expedition|move_cooldown|field_supplies_required|unknown_inventory_action|unknown_item|inventory_full|not_carrying_[a-z]+|not_hungry|not_thirsty|not_injured|not_exhausted|unknown_survival_action|missing_|party_not_found|party_full|already_in_party|invalid_world_action|party_leader_controls_movement|too_far_from_site|too_far_from_cache|cache_empty|too_far_from_loot|loot_node_empty|unknown_loot_node|too_far_from_rescue|rescue_unavailable|survivor_capacity|unknown_rescue_zone|not_at_boss_site|boss_respawning|no_active_encounter|encounter_expired|enemy_out_of_range|attack_cooldown|insufficient_ammo|weapon_does_not_reload|magazine_full|no_reserve_ammo|insufficient_water|zone_not_discovered|unknown_exploration_zone|expedition_supplies_required|base_destroyed|insufficient_)/.test(message);
      json(res, clientError ? 400 : 500, { error: message });
      if (!clientError) console.error('[homefront-world]', message);
      return true;
    }
  }
  if (gate('homefront:' + user.acct, 90, 60e3) || gate('homefront-ip:' + ip, 180, 60e3)) {
    json(res, 429, { error: 'slow_down' }); return true;
  }
  try {
    // Parse the request body before reading the shared save file. Once the save is
    // loaded, action validation and the atomic store write contain no await point,
    // preventing concurrent requests from committing stale snapshots over each other.
    const payload = req.method === 'POST' ? await body() : null;
    const db = store.load('homefront.json', {});
    let base = db[user.acct];
    if (!base) {
      base = Core.createBase(user.acct);
      db[user.acct] = base;
      store.save('homefront.json', db);
    } else {
      base = Core.validateBase(base, user.acct);
      if (!base) { json(res, 500, { error: 'save_invalid', message: 'The saved refuge could not be validated; it was not overwritten.' }); return true; }
    }
    if (req.method === 'GET' && url.pathname === '/api/homefront') {
      json(res, 200, { mode: 'homefront', base });
      return true;
    }
    if (req.method !== 'POST' || url.pathname !== '/api/homefront/action') {
      json(res, 405, { error: 'method_not_allowed' }); return true;
    }
    if (!payload || !payload.action || typeof payload.action !== 'object' || Array.isArray(payload.action)) {
      json(res, 400, { error: 'invalid_action' }); return true;
    }
    if (payload.action.type === 'expedition' || payload.action.type === 'boss_attack') throw new Error('use_shared_expedition_map');
    base.repelledCount = Number.isSafeInteger(base.repelledCount) ? base.repelledCount : 0;
    const next = Core.applyAction(base, user.acct, payload.action);
    const repelled = payload.action.type === 'defend' && next.log.at(-1)?.kind === 'defense' && next.log.at(-1)?.text.startsWith('Perimeter breach repelled');
    next.repelledCount = base.repelledCount + (repelled ? 1 : 0);
    if (repelled) {
      const worldDb = store.load('homefront-world.json', {});
      const activePlayer = worldDb.players?.[user.acct];
      if (activePlayer?.homefrontSessionStart?.totals) {
        activePlayer.homefrontSessionStart.totals.repels = (activePlayer.homefrontSessionStart.totals.repels || 0) + 1;
        store.save('homefront-world.json', worldDb);
      }
    }
    db[user.acct] = next;
    store.save('homefront.json', db);
    json(res, 200, { mode: 'homefront', base: next });
    return true;
  } catch (e) {
    const message = String(e?.message || 'homefront_error');
    const clientError = /^(invalid_|unknown_|insufficient_|cosmetic_|placement_|building_cap|structure_limit|survivor_capacity|guard_capacity|expedition_supplies_required|base_destroyed|not_enough_food|repair_supplies_required|already_repaired|upgrade_maxed|resource_capacity|use_shared_expedition_map)/.test(message);
    json(res, clientError ? 400 : 500, { error: message });
    if (!clientError) console.error('[homefront]', message);
    return true;
  }
}
module.exports = { handle, buildReturnDebrief, addSessionTotals, initSessionStart };
