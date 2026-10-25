'use strict';

// Durable, owner-authorized Estates building placements. Geometry is derived from the
// same catalog ordering and slot layout used by the client island scene; request bodies
// never supply lot bounds, owner identity, existing placements, or permission grants.
const { CATALOG } = require('./estate-economy');
const { planEstatePlacement } = require('./estates-building-placement');

const SLOT_LAYOUT = Object.freeze([
  [-42,-91],[-14,-99],[14,-99],[42,-91],[-76,-54],[-48,-47],[-20,-53],[20,-53],[48,-47],[76,-54],
  [-91,-12],[-63,-6],[-35,-12],[35,-12],[63,-6],[91,-12],[-72,38],[-42,52],[-14,62],[14,62],[48,48]
]);
const LOT_WIDTH = 20, LOT_DEPTH = 18;
const FOOTPRINTS = Object.freeze({
  mansion: Object.freeze({ width:13, depth:11 }),
  family: Object.freeze({ width:10, depth:9 }),
  starter: Object.freeze({ width:8, depth:7 }),
  apartment: Object.freeze({ width:7, depth:8 }),
  trailer: Object.freeze({ width:6, depth:5 })
});
const ID_RE = /^[A-Za-z0-9_-]{1,80}$/;
const finite = n => typeof n === 'number' && Number.isFinite(n);
const fail = reason => Object.freeze({ ok:false, reason });

function createEstatesLayoutStore({ db, access, now = Date.now, catalog = CATALOG } = {}) {
  if (!db || typeof db.exec !== 'function' || typeof db.prepare !== 'function') throw new TypeError('sqlite_database_required');
  if (!access || typeof access.accessFor !== 'function' || typeof access.canAct !== 'function') throw new TypeError('estate_access_service_required');
  if (typeof now !== 'function') throw new TypeError('clock_must_be_function');
  const propertyById = new Map((catalog.properties || []).map(p => [p.id,p]));
  const tierById = new Map((catalog.tiers || []).map(t => [t.id,t]));
  db.exec(`
    CREATE TABLE IF NOT EXISTS estate_build_placements (
      property_id TEXT NOT NULL,
      placement_id TEXT NOT NULL,
      created_by_acct TEXT NOT NULL,
      building_type TEXT NOT NULL,
      x REAL NOT NULL,
      z REAL NOT NULL,
      width REAL NOT NULL,
      depth REAL NOT NULL,
      rotation_y REAL NOT NULL,
      height REAL NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      PRIMARY KEY(property_id, placement_id)
    );
    CREATE INDEX IF NOT EXISTS estate_build_placements_property_idx
      ON estate_build_placements(property_id, created_at, placement_id);
  `);
  const selectRows = db.prepare(`SELECT placement_id AS placementId, property_id AS propertyId,
    created_by_acct AS createdByAcct, building_type AS buildingType, x, z, width, depth,
    rotation_y AS rotationY, height, created_at AS createdAt, updated_at AS updatedAt
    FROM estate_build_placements WHERE property_id=? ORDER BY created_at, placement_id`);
  const insertRow = db.prepare(`INSERT INTO estate_build_placements
    (property_id,placement_id,created_by_acct,building_type,x,z,width,depth,rotation_y,height,created_at,updated_at)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`);
  const deleteRow = db.prepare('DELETE FROM estate_build_placements WHERE property_id=? AND placement_id=?');

  function resolveLot(propertyId) {
    const property = propertyById.get(propertyId);
    if (!property) return null;
    const index = catalog.properties.findIndex(p => p.id === propertyId);
    const slot = SLOT_LAYOUT[index];
    const tier = tierById.get(property.tier);
    const footprint = FOOTPRINTS[property.tier];
    if (!slot || !tier || !footprint) return null;
    return { propertyId, x:slot[0], z:slot[1], width:LOT_WIDTH, depth:LOT_DEPTH, baseFootprint:footprint };
  }

  function readAccess(account, propertyId) {
    if (typeof account !== 'string' || !/^r[1-9A-HJ-NP-Za-km-z]{24,34}$/.test(account)) return { error:'authenticated-account-required' };
    if (!resolveLot(propertyId)) return { error:'unknown-property' };
    let decision;
    try { decision = access.accessFor(account, propertyId); } catch { return { error:'access-service-unavailable' }; }
    if (!decision || decision.allowed !== true) return { error:decision?.reason || 'property-access-denied' };
    return { decision };
  }

  function list(account, propertyId) {
    const auth = readAccess(account, propertyId);
    if (auth.error) return fail(auth.error);
    return Object.freeze({ ok:true, propertyId, role:auth.decision.role || 'tour',
      placements:selectRows.all(propertyId).map(row => ({ ...row })) });
  }

  function savePlacement(account, input = {}) {
    const propertyId = typeof input.propertyId === 'string' ? input.propertyId : '';
    const auth = readAccess(account, propertyId);
    if (auth.error) return fail(auth.error);
    let allowed = false;
    try { allowed = access.canAct(account, propertyId, 'build') === true; } catch { return fail('access-service-unavailable'); }
    if (!allowed) return fail('build-permission-required');
    const placementId = typeof input.placementId === 'string' ? input.placementId : '';
    if (!ID_RE.test(placementId)) return fail('invalid-placement-id');
    const lot = resolveLot(propertyId);
    const existing = selectRows.all(propertyId).map(row => ({ ...row }));
    existing.push({
      placementId:'__estate_base_building__', propertyId,
      x:lot.x, z:lot.z, width:lot.baseFootprint.width, depth:lot.baseFootprint.depth
    });
    const timestamp = now();
    if (!Number.isSafeInteger(timestamp) || timestamp < 0) return fail('invalid-clock');
    const plan = planEstatePlacement({
      principal:{ authenticated:true, subjectId:account },
      grant:{ verifiedBy:'estate-authorization-service', status:'active', subjectId:account,
        propertyId, expiresAt:timestamp+30_000, permissions:['build'] },
      lot, buildingType:input.buildingType,
      position:input.position,
      rotationY:input.rotationY === undefined ? 0 : input.rotationY,
      existingPlacements:existing, now:timestamp, placementId
    });
    if (!plan.ok) return fail(plan.reason);
    const p = plan.placement;
    try {
      insertRow.run(propertyId, placementId, account, p.buildingType, p.x, p.z,
        p.width, p.depth, p.rotationY, p.height, timestamp, timestamp);
    } catch (error) {
      if (/constraint|unique/i.test(String(error?.message || error))) return fail('placement-id-conflict');
      return fail('layout-storage-unavailable');
    }
    return Object.freeze({ ok:true, placement:Object.freeze({
      placementId, propertyId, createdByAcct:account, buildingType:p.buildingType,
      x:p.x, y:p.y, z:p.z, width:p.width, depth:p.depth, height:p.height,
      rotationY:p.rotationY, createdAt:timestamp, updatedAt:timestamp, status:'persisted'
    }) });
  }

  function removePlacement(account, propertyId, placementId) {
    const auth = readAccess(account, propertyId);
    if (auth.error) return fail(auth.error);
    let allowed = false;
    try { allowed = access.canAct(account, propertyId, 'build') === true; } catch { return fail('access-service-unavailable'); }
    if (!allowed) return fail('build-permission-required');
    if (typeof placementId !== 'string' || !ID_RE.test(placementId)) return fail('invalid-placement-id');
    const result = deleteRow.run(propertyId, placementId);
    return result.changes ? { ok:true, removed:true, propertyId, placementId } : fail('placement-not-found');
  }

  return Object.freeze({ list, savePlacement, removePlacement, resolveLot });
}

module.exports = { SLOT_LAYOUT, LOT_WIDTH, LOT_DEPTH, FOOTPRINTS, createEstatesLayoutStore };
