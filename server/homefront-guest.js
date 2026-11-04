// Wallet-free Homefront trial. Each guest plays in a private, disposable RAM store.
// This module NEVER calls the persistent Homefront store or joins the shared world.
'use strict';
const crypto = require('node:crypto');
const Homefront = require('./homefront');

const PREFIX = '/api/homefront/guest';
const IDLE_MS = 90 * 60 * 1000;
const MAX_SESSIONS = 128;

function disposableStore() {
  const data = new Map();
  return {
    load(name, fallback) {
      return data.has(name) ? structuredClone(data.get(name)) : structuredClone(fallback);
    },
    save(name, value) { data.set(name, structuredClone(value)); }
  };
}

function createGuestHandler({ now = Date.now, maxSessions = MAX_SESSIONS } = {}) {
  const sessions = new Map();
  const sweep = () => {
    const time = now();
    for (const [token, session] of sessions) {
      if (time >= session.expires) sessions.delete(token);
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
      if (sessions.size >= maxSessions) {
        json(res, 503, {error:'guest_capacity_reached'}); return true;
      }
      const token = crypto.randomBytes(32).toString('hex');
      sessions.set(token, {
        account: 'guest_' + crypto.randomBytes(12).toString('hex'),
        store: disposableStore(), expires: now() + IDLE_MS
      });
      json(res, 200, { token, persistent: false, multiplayer: false, expiresAfterIdleMs: IDLE_MS });
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
    session.expires = now() + IDLE_MS;
    const target = new URL(url.href);
    target.pathname = '/api/homefront' + suffix;
    const handled = await Homefront.handle(req, res, target, {
      json, gate, ip, body, who: () => ({acct: session.account}), store: session.store
    });
    if (!handled) json(res, 404, {error:'guest_route_not_found'});
    return true;
  }
  return {handle};
}

module.exports = {handle: createGuestHandler().handle, createGuestHandler};
