// City jetpack purchase button (server/jetpack.js). Shown next to 🚀 Jet only for signed-in players who do not
// have the jetpack yet, while purchases are open (JETPACK_PAYMENTS=1). Exempt wallets and buyers get the
// existing city jetpack (infinite fuel) via the welcome message's `jet` flag (server/city.js hasJet).
import { jetpackStatus, openJetpackPurchase } from './jetpack-shop.mjs';
let st = null, btn = null;
async function refresh() { try { st = await jetpackStatus(); } catch { st = null; } }
function ensure() {
  const jet = document.getElementById('jetBtn'), web = document.getElementById('webBtn');
  if (!jet || !web) return;
  if (!btn) {
    btn = document.createElement('button'); btn.id = 'jetBuyBtn'; btn.type = 'button';
    btn.style.cssText = jet.style.cssText; btn.className = jet.className; btn.style.display = 'none';
    btn.title = 'Buy the city jetpack (paid in XRP through Xaman)';
    btn.onclick = async e => { e.stopPropagation(); if (await openJetpackPurchase('city', { onGranted: () => { window.__jetOK = true; } })) { window.__jetOK = true; await refresh(); } };
    jet.after(btn);
  }
  const webShown = web.offsetParent !== null && getComputedStyle(web).display !== 'none';
  const show = !!st && st.payments && !st.owned?.city && !window.__jetOK && webShown;
  btn.textContent = st ? '🚀 ' + st.prices.city.xrp + ' XRP' : '🚀';
  btn.style.display = show ? '' : 'none';
}
refresh().then(() => setInterval(ensure, 500));
setInterval(refresh, 120e3);
