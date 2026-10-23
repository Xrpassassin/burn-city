// Authenticated, persistent API for the optional unranked Zombies Homefront mode.
'use strict';
const Store = require('./store');
const Core = require('./homefront-core');

async function handle(req, res, url, { json, gate, ip, body, who, store = Store }) {
  if (url.pathname !== '/api/homefront' && url.pathname !== '/api/homefront/action') return false;
  if (req.method !== 'GET' && req.method !== 'POST') { json(res, 405, { error: 'method_not_allowed' }); return true; }
  const user = who();
  if (!user?.acct) { json(res, 401, { error: 'sign_in_with_xaman', message: 'Sign in to save your personal refuge.' }); return true; }
  if (gate('homefront:' + user.acct, 90, 60e3) || gate('homefront-ip:' + ip, 180, 60e3)) {
    json(res, 429, { error: 'slow_down' }); return true;
  }
  try {
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
    const payload = await body();
    if (!payload || !payload.action || typeof payload.action !== 'object' || Array.isArray(payload.action)) {
      json(res, 400, { error: 'invalid_action' }); return true;
    }
    const next = Core.applyAction(base, user.acct, payload.action);
    db[user.acct] = next;
    Store.save('homefront.json', db);
    json(res, 200, { mode: 'homefront', base: next });
    return true;
  } catch (e) {
    const message = String(e?.message || 'homefront_error');
    const clientError = /^(invalid_|unknown_|insufficient_|placement_|building_cap|structure_limit|survivor_capacity|guard_capacity|expedition_supplies_required|base_destroyed|not_enough_food|repair_supplies_required|already_repaired)/.test(message);
    json(res, clientError ? 400 : 500, { error: message });
    if (!clientError) console.error('[homefront]', message);
    return true;
  }
}
module.exports = { handle };
