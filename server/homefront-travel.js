// Homefront RPG travel: the private Homefront instance <-> the shared open world (the Graveyard).
// Server-authoritative presence for players who are in a Homefront (their own or a party friend's),
// so a party survives the trip home and "Travel with party" / "Join friend's Homefront" work.
// State lives in homefront-world.json as `homefronts: { acct: { host, partyCode, lastSeen, since, pendingTravel } }`.
// Players listed here are NOT in `players` (the shared world): no world snapshot, interest, director,
// encounters or PvP ever reaches them. Party membership is kept while their presence is fresh.
'use strict';
const crypto = require('crypto');
const HOME_TTL = 45_000;          // same as World.PRESENCE_TTL; the Homefront page polls GET /travel every ~15 s
const PENDING_TTL = 60_000;       // a "travel with party" summons expires after a minute
const MAX_PARTY = 4;
const hash = s => { let h = 2166136261; for (const c of String(s)) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return h >>> 0; };
const publicId = acct => 'survivor-' + hash(acct).toString(36).slice(0, 7);
const ACCT_RE = /^[A-Za-z0-9_.:-]{1,128}$/;

function normalize(w) {
  if (!w.homefronts || typeof w.homefronts !== 'object' || Array.isArray(w.homefronts)) w.homefronts = Object.create(null);
  else { const clean = Object.create(null); for (const [k, v] of Object.entries(w.homefronts)) if (v && typeof v === 'object' && ACCT_RE.test(k)) clean[k] = v; w.homefronts = clean; }
  for (const [acct, h] of Object.entries(w.homefronts)) {
    h.host = typeof h.host === 'string' && ACCT_RE.test(h.host) ? h.host : acct;
    h.partyCode = typeof h.partyCode === 'string' && w.parties?.[h.partyCode]?.members?.includes(acct) ? h.partyCode : null;
    h.lastSeen = Number.isFinite(h.lastSeen) ? h.lastSeen : 0;
    h.since = Number.isFinite(h.since) ? h.since : h.lastSeen;
    h.pendingTravel = h.pendingTravel && typeof h.pendingTravel === 'object' && Number.isFinite(h.pendingTravel.at) && typeof h.pendingTravel.leader === 'string' ? { to: 'world', leader: h.pendingTravel.leader, at: h.pendingTravel.at } : null;
  }
  return w;
}
const fresh = (w, acct, now) => { const h = w.homefronts?.[acct]; return !!h && now - h.lastSeen <= HOME_TTL; };
function prune(w, now) {
  normalize(w);
  for (const [acct, h] of Object.entries(w.homefronts)) if (now - h.lastSeen > HOME_TTL || w.players?.[acct]) delete w.homefronts[acct];
}
// Party code the account belongs to, wherever it is (world or Homefront).
function partyOf(w, acct) {
  const code = w.players?.[acct]?.partyCode || w.homefronts?.[acct]?.partyCode || null;
  return code && w.parties?.[code]?.members?.includes(acct) ? code : null;
}
const sameParty = (w, a, b) => { const c = partyOf(w, a); return !!c && c === partyOf(w, b); };
const where = (w, acct, now) => w.players?.[acct] ? 'world' : fresh(w, acct, now) ? 'homefront' : 'offline';

// Called by World.leave(keepParty): the player walked through their gate home (or to a friend's).
function arriveHome(w, acct, { host = acct, partyCode = null, now = Date.now() } = {}) {
  normalize(w);
  const code = partyCode && w.parties?.[partyCode]?.members?.includes(acct) ? partyCode : null;
  w.homefronts[acct] = { host, partyCode: code, lastSeen: now, since: now, pendingTravel: null };
  return w.homefronts[acct];
}
function touch(w, acct, now = Date.now()) {
  normalize(w);
  if (w.players?.[acct]) return null;
  const h = w.homefronts[acct] || arriveHome(w, acct, { now });
  h.lastSeen = now;
  if (h.pendingTravel && now - h.pendingTravel.at > PENDING_TTL) h.pendingTravel = null;
  return h;
}
// After World.enter: carry a Homefront-held party into the world and regroup beside the leader if it is out there.
function rejoinOnEnter(w, acct, { Collision, bounds = 100, now = Date.now() } = {}) {
  normalize(w);
  const h = w.homefronts[acct];
  const p = w.players?.[acct];
  delete w.homefronts[acct];
  if (!p || !h?.partyCode) return null;
  const party = w.parties?.[h.partyCode];
  if (!party || !party.members.includes(acct)) return null;
  p.partyCode = h.partyCode;
  const leader = w.players[party.leader];
  if (party.leader !== acct && leader) {
    const spot = Collision.findSafePosition(leader.x + (hash(acct) % 5) - 2, leader.z + (hash(acct + 'z') % 5) - 2, { bounds });
    if (spot) { p.x = spot.x; p.z = spot.z; p.spawn = leader.spawn; }
  } else if (party.leader !== acct) {
    // The leader is still at home: whoever reaches the world first leads until they return.
    party.leader = acct;
  }
  p.lastSeen = now;
  return h.partyCode;
}
// Party management while at home (parties can be formed before anyone leaves the gate).
function createPartyAtHome(w, acct, now = Date.now()) {
  const h = touch(w, acct, now);
  if (!h) throw new Error('use_world_party_controls');
  if (partyOf(w, acct)) throw new Error('already_in_party');
  let code = crypto.randomBytes(3).toString('hex').toUpperCase();
  while (w.parties[code]) code = crypto.randomBytes(3).toString('hex').toUpperCase();
  w.parties[code] = { leader: acct, members: [acct], createdAt: now };
  h.partyCode = code;
  return code;
}
function joinPartyAtHome(w, acct, code, now = Date.now()) {
  const h = touch(w, acct, now);
  if (!h) throw new Error('use_world_party_controls');
  const key = typeof code === 'string' ? code.trim().toUpperCase() : '';
  const party = /^[0-9A-F]{6}$/.test(key) ? w.parties[key] : null;
  if (!party) throw new Error('party_not_found');
  if (partyOf(w, acct)) throw new Error('already_in_party');
  if (party.members.length >= MAX_PARTY) throw new Error('party_full');
  party.members.push(acct); h.partyCode = key;
  return key;
}
function leavePartyAtHome(w, acct, now = Date.now()) {
  const h = touch(w, acct, now);
  if (!h) throw new Error('use_world_party_controls');
  const code = partyOf(w, acct);
  if (!code) throw new Error('not_in_party');
  const party = w.parties[code];
  party.members = party.members.filter(a => a !== acct);
  if (!party.members.length) delete w.parties[code];
  else if (party.leader === acct) party.leader = party.members[0];
  h.partyCode = null;
}
// Resolve a party member's public id (survivor-xxxxxxx) to their account; only fellow members resolve.
function resolveMember(w, acct, memberPublicId) {
  const code = partyOf(w, acct);
  if (!code || typeof memberPublicId !== 'string') return null;
  return w.parties[code].members.find(m => publicId(m) === memberPublicId) || null;
}
// "Join friend's Homefront": move this player's Homefront presence to a party member's refuge.
function visitFriend(w, acct, memberPublicId, now = Date.now()) {
  if (w.players?.[acct]) throw new Error('return_home_first');
  const host = memberPublicId === 'self' ? acct : resolveMember(w, acct, memberPublicId);
  if (!host) throw new Error('refuge_private_or_not_found');
  const h = touch(w, acct, now);
  h.host = host; h.lastSeen = now;
  return host;
}
// "Travel with party": the leader (at home) summons every member who is in the same Homefront instance
// (their own refuge or the leader's) into the world; their own clients complete the trip via /world/enter.
function summonParty(w, leader, now = Date.now()) {
  const code = partyOf(w, leader);
  if (!code) throw new Error('not_in_party');
  const party = w.parties[code];
  if (party.leader !== leader) throw new Error('party_leader_controls_movement');
  const instance = w.homefronts?.[leader]?.host || leader;
  const summoned = [];
  for (const m of party.members) {
    if (m === leader || !fresh(w, m, now)) continue;
    const h = w.homefronts[m];
    if (h.host === instance || h.host === leader || h.host === m) { h.pendingTravel = { to: 'world', leader, at: now }; summoned.push(publicId(m)); }
  }
  return summoned;
}
// Who may see a refuge: its owner, a member of the owner's party (world or home), or anyone if it is public.
// Everyone else gets the same 404 as the public visit route.
function canViewRefuge(w, viewer, owner, savedBase) {
  if (!savedBase) return false;
  if (viewer === owner) return true;
  if (savedBase.visibility === 'public') return true;
  return sameParty(w, viewer, owner);
}
function publicState(w, acct, now = Date.now()) {
  const code = partyOf(w, acct);
  const party = code ? w.parties[code] : null;
  const h = w.homefronts?.[acct] || null;
  const instanceHost = h?.host || acct;
  return {
    space: w.players?.[acct] ? 'world' : 'homefront',
    instance: instanceHost === acct ? 'own' : 'friend',
    instanceHostId: publicId(instanceHost),
    pendingTravel: h?.pendingTravel && now - h.pendingTravel.at <= PENDING_TTL ? { to: 'world', leaderId: publicId(h.pendingTravel.leader) } : null,
    party: party ? {
      code, leader: party.leader === acct,
      members: party.members.map(m => ({ id: publicId(m), you: m === acct, leader: party.leader === m, where: where(w, m, now), inYourInstance: m !== acct && fresh(w, m, now) && (w.homefronts[m].host === instanceHost) }))
    } : null
  };
}
module.exports = { HOME_TTL, PENDING_TTL, normalize, prune, fresh, partyOf, sameParty, where, arriveHome, touch, rejoinOnEnter, createPartyAtHome, joinPartyAtHome, leavePartyAtHome, resolveMember, visitFriend, summonParty, canViewRefuge, publicState, publicId };
