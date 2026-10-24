// Homefront RPG travel sheet: Homefront instance <-> shared open world, with parties.
// Presentation only; every rule is server-side (server/homefront-travel.js, /api/homefront/world/travel).
// Hooks are passed in by homefront.html so this module stays dependency-free and testable.
export const TRAVEL_POLL_MS = 15000;
export const WHERE_LABEL = Object.freeze({ world: 'out in the Wastes', homefront: 'at a Homefront', offline: 'offline' });

// Pure: which travel options the sheet shows for a server travel state.
export function travelOptions(travel, { inWorld = false, visiting = false } = {}) {
  const party = travel?.party || null;
  const opts = [];
  if (inWorld) { opts.push({ id: 'return', label: '🏚 Return to Homefront', primary: true }); return opts; }
  opts.push({ id: 'solo', label: party ? '🧭 Travel ahead alone' : '🧭 Travel to the Wastes', primary: !party || !party.leader });
  if (party?.leader) opts.push({ id: 'party', label: '👥 Travel with party', primary: true });
  if (party) for (const m of party.members) if (!m.you && m.where === 'homefront' && !m.inYourInstance) opts.push({ id: 'visit:' + m.id, label: '🏠 Join ' + (m.leader ? 'leader' : 'friend') + '’s Homefront', member: m.id });
  if (visiting || travel?.instance === 'friend') opts.push({ id: 'home', label: '↩ Back to my Homefront' });
  if (!party) opts.push({ id: 'party_create', label: '➕ Start a party' }, { id: 'party_join', label: '🔑 Join with code' });
  else opts.push({ id: 'party_leave', label: 'Leave party' });
  return opts;
}

export function createTravel({ request, signedIn, visiting, inWorld, enterWorld, leaveWorld, message, modal, onVisit, onHome }) {
  let state = null, timer = null, autoTravelled = false;
  const poll = async () => {
    if (!signedIn() || inWorld()) return state;
    try { const v = await request('/api/homefront/world/travel'); state = v.travel; } catch { return state; }
    // A party leader chose "Travel with party": complete the trip with this player's own request.
    if (state?.pendingTravel && !autoTravelled && !inWorld()) { autoTravelled = true; message('Your party leader is heading out. Travelling with the party…', 'ok'); await enterWorld({ withParty: false }); setTimeout(() => { autoTravelled = false; }, 5000); }
    return state;
  };
  const start = () => { if (timer) clearInterval(timer); poll(); timer = setInterval(poll, TRAVEL_POLL_MS); };
  const post = async payload => { const v = await request('/api/homefront/world/travel', 'POST', payload); state = v.travel; return v; };
  async function choose(opt) {
    try {
      if (opt.id === 'return') { modal.close(); await leaveWorld(); return; }
      if (opt.id === 'solo') { modal.close(); if (visiting()) { await post({ action: 'home' }); onHome(); return; } await enterWorld({ withParty: false }); return; }
      if (opt.id === 'party') { modal.close(); await enterWorld({ withParty: true }); return; }
      if (opt.id === 'home') { await post({ action: 'home' }); modal.close(); onHome(); return; }
      if (opt.member) { const v = await post({ action: 'visit', member: opt.member }); modal.close(); onVisit(v.host); return; }
      if (opt.id === 'party_create') { const v = await post({ action: 'party_create' }); message('Party code ' + v.code + ' · share it with up to three friends.', 'ok'); }
      else if (opt.id === 'party_join') { const code = modal.ask('Party code (6 characters)'); if (!code) return; await post({ action: 'party_join', code }); message('Joined the party.', 'ok'); }
      else if (opt.id === 'party_leave') { await post({ action: 'party_leave' }); message('You left the party.', 'ok'); }
      open();
    } catch (e) { message(e.message === 'party_not_found' ? 'No party with that code.' : e.message === 'party_full' ? 'That party is full (4).' : e.message === 'refuge_private_or_not_found' ? 'That Homefront is not open to you.' : e.message, 'danger'); }
  }
  async function open() {
    await poll();
    const party = state?.party;
    const lines = [];
    lines.push(inWorld() ? 'You are out in the shared Wastes. Other survivors can see you nearby; only your party shows on the map.' : (state?.instance === 'friend' || visiting()) ? 'You are in a friend’s Homefront (PvP is off here).' : 'You are in your private Homefront (PvP is off here).');
    if (party) lines.push('Party ' + party.code + ' · ' + party.members.map(m => (m.you ? 'You' : m.id.slice(9, 14)) + (m.leader ? ' ★' : '') + ' ' + WHERE_LABEL[m.where]).join(' · '));
    modal.show('🧭 Travel', lines, travelOptions(state, { inWorld: inWorld(), visiting: visiting() }), choose);
  }
  return { start, poll, open, get state() { return state; } };
}
