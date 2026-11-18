// Shared, server-verified Xaman sign-in surface for Estates.
// Reuses the same /api/signin -> /api/signin/finish protocol and bcToken/bcAcct
// credentials as BURN City Arena. This is identity authentication, NOT a payment.
let active = null;
const WALLET_HOST = /^(?:[a-z0-9-]+\.)*(?:xumm\.app|xaman\.app)$/i;
const ACCOUNT = /^r[1-9A-HJ-NP-Za-km-z]{24,34}$/;
const LIMIT_MS = 5 * 60_000;
function safeUrl(source) {
  try {
    const u = new URL(source);
    return u.protocol === 'https:' && WALLET_HOST.test(u.hostname) ? u.href : null;
  } catch { return null; }
}
function element(doc, tag, cls, text) {
  const el = doc.createElement(tag);
  if (cls) el.className = cls;
  if (text != null) el.textContent = text;
  return el;
}
export function openEstateXamanSignIn({
  api = location.origin, doc = document, fetcher = fetch, storage = localStorage,
  onAuthenticated = () => {}, opener = doc.activeElement
} = {}) {
  // One identity request at a time; opening the same dialog twice must not
  // generate additional Xaman sessions or leak multiple background pollers.
  if (active && active.root.isConnected) { active.root.querySelector('.bc-xaman-close')?.focus(); return active.promise; }
  const host = new URL(api, doc.defaultView?.location?.href || location.href);
  const pageOrigin = doc.defaultView?.location?.origin || location.origin;
  // An untrusted ?citysrv= override must never mint/replace the wallet session.
  if (![pageOrigin,'https://burn-city-game.fly.dev'].includes(host.origin) ||
      (host.protocol !== 'https:' && !(host.protocol === 'http:' && ['localhost','127.0.0.1','[::1]'].includes(host.hostname))))
    return Promise.reject(new Error('Trusted BURN City Xaman sign-in endpoint required.'));
  const root = element(doc, 'div', 'bc-xaman-backdrop');
  root.id = 'bcEstatesXaman';
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-modal', 'true');
  root.setAttribute('aria-labelledby', 'bcEstatesXamanTitle');
  const card = element(doc, 'div', 'bc-xaman-card');
  const head = element(doc, 'div', 'bc-xaman-head');
  const title = element(doc, 'h2', null, 'Connect Xaman');
  title.id = 'bcEstatesXamanTitle';
  const closeButton = element(doc, 'button', 'bc-xaman-close', '×');
  closeButton.type = 'button'; closeButton.setAttribute('aria-label','Cancel Xaman sign-in');
  head.append(title, closeButton);
  const intro = element(doc, 'p', null, 'Sign in with your XRPL wallet to check live Estates prices and purchase availability. This does not authorize a purchase or payment.');
  const status = element(doc, 'p', 'bc-xaman-status', 'Preparing secure Xaman sign-in…');
  status.setAttribute('role','status'); status.setAttribute('aria-live','polite');
  const qr = element(doc, 'div', 'bc-xaman-qr');
  const openLink = element(doc, 'a', 'bc-xaman-open', 'Open Xaman');
  openLink.target = '_blank'; openLink.rel = 'noopener noreferrer';
  openLink.hidden = true;
  const hint = element(doc, 'p', 'bc-xaman-hint', 'Scan the QR code with Xaman on another device, or open Xaman here. Return to BURN City after approving the sign-in request.');
  card.append(head, intro, status, qr, openLink, hint); root.append(card);
  const view = doc.defaultView || window;
  let stopped = false, pollTimer = 0, started = Date.now(), resolvePromise, rejectPromise;
  const controller = new AbortController();
  const promise = new Promise((resolve,reject)=>{resolvePromise=resolve;rejectPromise=reject;});
  active = {root,promise};
  const stop = () => {
    if (stopped) return false;
    stopped = true; clearTimeout(pollTimer); controller.abort();
    root.remove(); doc.body.classList.remove('bcXamanOpen');
    doc.removeEventListener('keydown', onKey, true);
    view.removeEventListener('pagehide', onLeave);
    if (active?.root === root) active = null;
    if (opener?.isConnected && typeof opener.focus === 'function') opener.focus({preventScroll:true});
    return true;
  };
  const cancel = () => {if (stop()) { const e = new Error('Xaman sign-in cancelled.'); e.code='sign_in_cancelled'; rejectPromise(e); }};
  const onLeave = () => cancel();
  const onKey = event => {
    if (!root.isConnected) return;
    if (event.key === 'Escape') {event.preventDefault();event.stopImmediatePropagation();cancel();return;}
    if (event.key === 'Tab') {
      const focus = [...root.querySelectorAll('button:not([disabled]),a[href]:not([hidden])')].filter(el=>el.getClientRects().length);
      if (focus.length) {
        const pos = focus.indexOf(doc.activeElement);
        const next = event.shiftKey ? (pos<=0?focus.length-1:pos-1) : (pos<0||pos===focus.length-1?0:pos+1);
        event.preventDefault(); focus[next].focus();
      }
    }
    // Do not let WASD/E or other gameplay shortcuts act while approving identity.
    event.stopImmediatePropagation();
  };
  doc.addEventListener('keydown',onKey,true);
  view.addEventListener('pagehide',onLeave);
  closeButton.addEventListener('click',cancel);
  root.addEventListener('pointerdown',event=>{if(event.target===root)cancel();});
  doc.body.append(root);
  doc.body.classList.add('bcXamanOpen');
  try {
    const keys = view.__city?.input?.keys;
    if (keys) for (const key of Object.keys(keys)) keys[key] = 0;
  } catch {}
  closeButton.focus({preventScroll:true});
  const request = async (url, opts) => {
    const response = await fetcher(url,{method:'POST',credentials:'omit',cache:'no-store',signal:controller.signal,...opts});
    if (!response.ok) throw new Error(response.status===429?'Too many sign-in attempts. Try again later.':'Xaman sign-in service is unavailable.');
    return response.json();
  };
  const schedule = sid => {
    if (stopped) return;
    if (Date.now()-started>=LIMIT_MS) {status.textContent='Sign-in expired. Close and try again.';return;}
    pollTimer = setTimeout(async()=>{
      if (stopped) return;
      try {
        const result = await request(host.origin+'/api/signin/finish',{
          headers:{'content-type':'application/json'},
          body:JSON.stringify({sid})
        });
        if (stopped) return;
        if (result.ok === true) {
          if (!ACCOUNT.test(result.account||'')||typeof result.token!=='string'||!result.token||result.token.length>4096)
            throw new Error('Invalid sign-in confirmation from the server.');
          storage.setItem('bcToken',result.token);
          storage.setItem('bcAcct',result.account);
          const account = result.account;
          if (!stop()) return;
          view.dispatchEvent(new Event('bc:wallet-changed'));
          try { await onAuthenticated({account,token:result.token}); }
          catch (error) { console.warn('Estates post-sign-in refresh',error); }
          resolvePromise({account,token:result.token});
          return;
        }
        if (result.reason && !['not_signed','not_validated_yet'].includes(result.reason)) {
          status.textContent='Sign-in session expired or unavailable. Close and retry.';
          return;
        }
      } catch (error) {
        if (stopped) return;
        if (error.message==='Invalid sign-in confirmation from the server.') {status.textContent=error.message;return;}
        status.textContent='Waiting for Xaman approval; reconnecting to BURN City…';
      }
      schedule(sid);
    },3000);
  };
  void (async()=>{
    try {
      const result=await request(host.origin+'/api/signin');
      if (stopped) return;
      const qrUrl=safeUrl(result.xaman?.qr);
      const deeplink=safeUrl(result.xaman?.deeplink);
      if (typeof result.sid!=='string'||!/^SI[0-9a-f]{24}$/i.test(result.sid)||!qrUrl||!deeplink)
        throw new Error('Xaman sign-in is not configured on the game server.');
      const img=element(doc,'img');
      img.src=qrUrl; img.alt='Xaman wallet sign-in QR code';img.width=224;img.height=224;
      qr.replaceChildren(img);
      openLink.href=deeplink;openLink.hidden=false;
      status.textContent='Waiting for you to approve SignIn in Xaman…';
      schedule(result.sid);
    } catch(error) {
      if (!stopped) {status.textContent=error.name==='AbortError'?'Sign-in cancelled.':error.message;qr.replaceChildren();}
    }
  })();
  return promise;
}
