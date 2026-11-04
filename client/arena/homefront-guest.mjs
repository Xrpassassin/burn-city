// Guest credentials are deliberately memory-only: a page reload starts over.
// Wallet sessions remain owned by the existing BURN City Xaman authentication.
let guestToken = '';

export const isGuest = () => !!guestToken;
export const getGuestToken = () => guestToken;
export const hasHomefrontPlayer = () =>
  isGuest() || (typeof localStorage !== 'undefined' && !!localStorage.getItem('bcToken'));
export const endGuest = () => { guestToken = ''; };

export async function startGuest(api) {
  if (guestToken) return;
  const response = await fetch(api + '/api/homefront/guest/start', {
    method: 'POST', cache: 'no-store', credentials: 'omit'
  });
  let data = {};
  try { data = await response.json(); } catch {}
  if (!response.ok || !/^[a-f0-9]{64}$/.test(data.token || '')) {
    throw new Error(data.error || 'guest_unavailable');
  }
  guestToken = data.token;
}

export function fetchHomefront(api, path, options = {}) {
  if (!guestToken || !path.startsWith('/api/homefront')) return fetch(api + path, options);
  const guestPath = '/api/homefront/guest' + path.slice('/api/homefront'.length);
  return fetch(api + guestPath, {
    ...options, cache: 'no-store',
    headers: { ...options.headers, 'x-homefront-guest': guestToken }
  });
}
