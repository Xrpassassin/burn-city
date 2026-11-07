// Wallet-free Homefront: disposable personal saves, optionally one shared world.
'use strict';
const crypto = require('node:crypto');
const Homefront = require('./homefront');

const PREFIX = '/api/homefront/guest';
const IDLE_MS = 90 * 60 * 1000;
const MAX_SESSIONS = 128;
const UNCLAIMED_MS = 5 * 60 * 1000;   // a session never used for play expires quickly
const MAX_PER_IP = 3;               // live sessions per caller; the oldest is replaced

function disposableStore() {
  const data = new Map();
  return {
    load(name, fallback) {
      return data.has(name) ? structuredClone(data.get(name)) : structuredClone(fallback);
    },
    save(name, value) { data.set(name, structuredClone(value)); }
  };
}

function createGuestHandler({ now = Date.now, maxSessions = MAX_SESSIONS, maxPerIp = MAX_PER_IP, overworld = null } = {}) {
  const sessions = new Map();
  const remove = token => {
    const session = sessions.get(token);
    if (session) overworld?.release(session.account);
    sessions.delete(token);
  };
  const sweep = () => {
    const time = now();
    for (const [token, session] of sessions) {
      if (time >= session.expires) remove(token);
    }
  };
  async function handle(req, res, url, { json, gate, ip, body }) {
    if (url.pathname !== PREFIX && !url.pathname.startsWith(PREFIX + '/')) return false;
    const suffix = url.pathname.slice(PREFIX.length);
    sweep();
    if (suffix === '/start') {
      if (req.method !== 'POST') { json(res, 405, {error:'method_not_allowed'}); return true; }
      if (gate('homefront-guest-start-ip:' + ip, 12, 60000)) {
        json(res, 429, {error:'slow_down'}); return true;
      }
      // Bounded admission per caller: replacing the caller's oldest session means
      // reloads and repeated starts never consume more than maxPerIp slots.
      const mine = [...sessions].filter(([, s]) => s.ip === ip).sort((a, b) => a[1].created - b[1].created);
      while (mine.length >= maxPerIp) remove(mine.shift()[0]);
      // A replaced page sends its previous token so that slot is freed at once.
      const previous = String(req.headers['x-homefront-guest'] || '');
      if (sessions.get(previous)?.ip === ip) remove(previous);
      if (sessions.size >= maxSessions) {
        json(res, 503, {error:'guest_capacity_reached'}); return true;
      }
      const token = crypto.randomBytes(32).toString('hex');
      const account = 'guest_' + crypto.randomBytes(12).toString('hex');
      const personal = disposableStore();
      sessions.set(token, {
        account, store: overworld ? overworld.admit(account, personal) : personal,
        expires: now() + UNCLAIMED_MS, ip, created: now(), claimed: false
      });
      json(res, 200, { token, persistent: false, multiplayer: !!overworld, expiresAfterIdleMs: IDLE_MS });
      return true;
    }
    if (suffix !== '' && suffix !== '/action' && suffix !== '/world' && !suffix.startsWith('/world/')) {
      json(res, 404, {error:'guest_route_not_found'}); return true;
    }
    // A guest token is NOT a Pay/Xaman bearer token. It can only access the
    // disposable Homefront handler. The real route remains wallet-authenticated.
    const token = String(req.headers['x-homefront-guest'] || '');
    const session = /^[a-f0-9]{64}$/.test(token) ? sessions.get(token) : null;
    if (!session) { json(res, 401, {error:'guest_session_expired'}); return true; }
    // Temporary identities can meet and scavenge, but cannot obtain invitations,
    // summon saved survivors, or damage persistent players through throwaway IDs.
    if (overworld && (suffix.startsWith('/world/party/') || suffix === '/world/pvp' ||
        (suffix === '/world/travel' && req.method === 'POST'))) {
      json(res, 403, {error:'connect_wallet_for_party_or_pvp'}); return true;
    }
    session.claimed = true;
    session.expires = now() + IDLE_MS;
    const target = new URL(url.href);
    target.pathname = '/api/homefront' + suffix;
    const handled = await Homefront.handle(req, res, target, {
      json, gate, ip, body, who: () => ({acct: session.account}), store: session.store
    });
    if (!handled) json(res, 404, {error:'guest_route_not_found'});
    return true;
  }
  return {handle, sweep};
}

module.exports = {handle: createGuestHandler().handle, createGuestHandler};
