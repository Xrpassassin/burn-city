// Anonymous city visit ping. Stores only a random id in localStorage; the server never gets a wallet or IP in the payload.
// Opt out: ?notrack=1 (persisted), localStorage bc_notrack=1, Do Not Track, or Global Privacy Control.
const VID_KEY = 'bc_vid';
const FLAG_KEY = 'bc_visit_pinged';
const OPT_OUT = 'bc_notrack';
const VID_RE = /^[A-Za-z0-9_-]{16,64}$/;

export function trackingAllowed() {
  try {
    const q = new URLSearchParams(location.search);
    if (q.get('notrack') === '1') { localStorage.setItem(OPT_OUT, '1'); return false; }
    if (q.get('notrack') === '0') localStorage.removeItem(OPT_OUT);
    if (localStorage.getItem(OPT_OUT) === '1') return false;
    const dnt = navigator.doNotTrack || navigator.msDoNotTrack || (typeof window !== 'undefined' && window.doNotTrack);
    if (dnt === '1' || dnt === 'yes') return false;
    if (navigator.globalPrivacyControl === true) return false;
  } catch {}
  return true;
}

function visitorId() {
  try {
    let id = localStorage.getItem(VID_KEY);
    if (typeof id === 'string' && VID_RE.test(id)) return id;
    id = (crypto.randomUUID() + crypto.randomUUID()).replace(/-/g, '').slice(0, 32);
    localStorage.setItem(VID_KEY, id);
    return id;
  } catch { return ''; }
}

export function pingCityVisit({ server = '', token = '' } = {}) {
  if (!trackingAllowed()) return false;
  try {
    if (sessionStorage.getItem(FLAG_KEY) === '1') return false;
    const id = visitorId();
    if (!id) return false;
    sessionStorage.setItem(FLAG_KEY, '1');
    const headers = { 'content-type': 'application/json' };
    if (token) headers.authorization = 'Bearer ' + token;
    fetch(String(server || '') + '/api/stats/visit', {
      method: 'POST', headers, body: JSON.stringify({ id }),
      keepalive: true, credentials: 'omit', mode: 'cors'
    }).catch(() => {});
    return true;
  } catch { return false; }
}
