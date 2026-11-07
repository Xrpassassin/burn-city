// Guest credentials are deliberately memory-only: a page reload starts over.
// Wallet sessions remain owned by the existing BURN City Xaman authentication.
let guestToken = '';
let sharedWorld = false;
// In the isolated password-gated Fly preview, this *preview-only* flag
// allows the access cookie. Production guest requests still send no cookies.
const previewAccess = () => typeof window !== 'undefined' &&
  window.__BURN_CITY_ISOLATED_PREVIEW__ === true;

export const isGuest = () => !!guestToken;
export const isSharedGuest = () => !!guestToken && sharedWorld;
export const getGuestToken = () => guestToken;
export const hasHomefrontPlayer = () =>
  isGuest() || (typeof localStorage !== 'undefined' && !!localStorage.getItem('bcToken'));
export const endGuest = () => { guestToken = ''; sharedWorld = false; };

let starting = null;
// Concurrent callers share one start. Credentials stay memory-only; the server
// caps live sessions per caller, so a reload replaces rather than accumulates.
export function startGuest(api) {
  if (guestToken) return Promise.resolve();
  if (starting) return starting;
  starting = fetch(api + '/api/homefront/guest/start', {
    method: 'POST', cache: 'no-store',
    credentials: previewAccess() ? 'same-origin' : 'omit'
  }).then(async response => {
    let data = {};
    try { data = await response.json(); } catch {}
    if (!response.ok || !/^[a-f0-9]{64}$/.test(data.token || '')) {
      throw new Error(data.error || 'guest_unavailable');
    }
    guestToken = data.token;
    sharedWorld = data.multiplayer === true;
  }).finally(() => { starting = null; });
  return starting;
}

export function fetchHomefront(api, path, options = {}) {
  if (!guestToken || !path.startsWith('/api/homefront')) return fetch(api + path, options);
  const guestPath = '/api/homefront/guest' + path.slice('/api/homefront'.length);
  // A guest is never a wallet session. Drop stale bearer credentials and
  // browser cookies, even if the calling world client supplied them.
  const headers = new Headers(options.headers || {});
  headers.delete('authorization');
  const sent = guestToken;
  headers.set('x-homefront-guest', sent);
  return fetch(api + guestPath, {
    ...options, cache: 'no-store',
    credentials: previewAccess() ? 'same-origin' : 'omit', headers
  }).then(async response => {
    // A server restart or idle timeout can invalidate an otherwise healthy
    // WebGL session. Never retry mutations or quietly replace a player's
    // in-memory refuge: let the UI offer an explicit fresh start.
    if (response.status === 401 && guestToken === sent) {
      const data = await response.clone().json().catch(() => ({}));
      // Re-check after parsing: a newer guest may have started meanwhile.
      if (data?.error === 'guest_session_expired' && guestToken === sent) {
        endGuest();
        if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function')
          window.dispatchEvent(new Event('homefront-guest-expired'));
      }
    }
    return response;
  });
}
