// Jetpack purchase sheet shared by the city and Homefront. Presentation only: the server makes the invoice
// (price, treasury, DestinationTag, memo, Xaman payload) and verifies the payment on the ledger
// (server/jetpack.js). The client sends only the jetpack kind and, at most, the tx hash Xaman returned.
const token = () => { try { return localStorage.bcToken || ''; } catch { return ''; } };
export async function api(path, method = 'GET', body) {
  const r = await fetch(path, { method, headers: { 'content-type': 'application/json', ...(token() ? { authorization: 'Bearer ' + token() } : {}) }, body: body ? JSON.stringify(body) : undefined });
  let data = null; try { data = await r.json(); } catch {}
  return { status: r.status, data: data || {} };
}
export const jetpackStatus = async () => { if (!token()) return null; const r = await api('/api/jetpack'); return r.status === 200 ? r.data : null; };
const LABEL = { city: 'City jetpack', homefront: 'Homefront jetpack' };
const css = 'position:fixed;inset:0;z-index:2000;display:grid;place-items:center;background:#050403d9;padding:calc(12px + env(safe-area-inset-top)) 12px calc(12px + env(safe-area-inset-bottom));font:14px system-ui;color:#f5e6d8';
// Opens the sheet and resolves true once the server grants the jetpack (false if closed first).
export function openJetpackPurchase(kind, { onGranted } = {}) {
  return new Promise(resolve => {
    const wrap = document.createElement('div'); wrap.style.cssText = css; wrap.setAttribute('role', 'dialog'); wrap.setAttribute('aria-modal', 'true'); wrap.className = 'jp-sheet';
    const card = document.createElement('div'); card.style.cssText = 'width:min(100%,420px);max-height:100%;overflow:auto;background:linear-gradient(155deg,#2a1a12,#100b09);border:1px solid #ff8b3d99;border-radius:16px;padding:16px';
    const h = document.createElement('h3'); h.style.cssText = 'margin:0 0 8px;color:#ffc18e'; h.textContent = '🚀 ' + LABEL[kind];
    const msg = document.createElement('p'); msg.style.cssText = 'margin:6px 0;line-height:1.4'; msg.textContent = 'Preparing your invoice…';
    const box = document.createElement('div');
    const close = document.createElement('button'); close.type = 'button'; close.textContent = 'Close'; close.style.cssText = 'margin-top:12px;min-height:40px;padding:6px 16px;border-radius:10px;border:1px solid #8e5235;background:#24140d;color:#ffe0c4;font:700 14px system-ui';
    card.append(h, msg, box, close); wrap.append(card); document.body.append(wrap);
    let done = false, timer = null, invoice = null;
    const finish = ok => { if (done) return; done = true; clearTimeout(timer); wrap.remove(); resolve(ok); };
    close.onclick = () => finish(false);
    const say = t => { msg.textContent = t; };
    const poll = async (tries = 0) => {
      if (done) return;
      const r = await api('/api/jetpack/claim', 'POST', { invoice: invoice.id }).catch(() => ({ status: 0, data: {} }));
      if (r.status === 200 && r.data.granted) { say('Payment verified on the XRP Ledger. Your ' + LABEL[kind] + ' is ready.'); onGranted && onGranted(); close.textContent = 'Done'; done = true; clearTimeout(timer); setTimeout(() => { wrap.remove(); resolve(true); }, 1600); return; }
      if (r.status === 202 || r.status === 404 && r.data.error === 'tx_not_found') { if (tries < 150) timer = setTimeout(() => poll(tries + 1), 4000); else say('Still waiting for the payment. You can close this and claim later from the same invoice.'); return; }
      say(r.data.error === 'payments_disabled' ? 'Jetpack purchases are not open yet.' : 'Payment not accepted: ' + (r.data.error || 'error ' + r.status) + '.');
    };
    (async () => {
      const r = await api('/api/jetpack/invoice', 'POST', { kind });
      if (r.status === 401) { say('Sign in with Xaman first.'); return; }
      if (r.status === 409) { say('Jetpack purchases are not open yet.'); return; }
      if (r.status !== 200) { say('Could not create an invoice (' + (r.data.error || r.status) + ').'); return; }
      if (r.data.owned) { say('You already own the ' + LABEL[kind] + '.'); onGranted && onGranted(); return; }
      invoice = r.data.invoice; const x = r.data.xaman;
      say('Pay exactly ' + invoice.xrp + ' XRP in Xaman. The jetpack unlocks once the payment validates on the ledger.');
      if (x?.deeplink) { const a = document.createElement('a'); a.href = x.deeplink; a.target = '_blank'; a.rel = 'noopener'; a.textContent = 'Open in Xaman'; a.style.cssText = 'display:inline-block;margin:8px 0;padding:10px 16px;border-radius:10px;background:linear-gradient(120deg,#a63f16,#63250f);color:#ffe0c4;font-weight:800;text-decoration:none'; box.append(a); }
      if (x?.qr) { const img = document.createElement('img'); img.src = x.qr; img.alt = 'Xaman QR code'; img.style.cssText = 'display:block;width:180px;height:180px;margin:8px 0;border-radius:8px;background:#fff'; box.append(img); }
      if (!x) { const pre = document.createElement('p'); pre.style.cssText = 'font:12px ui-monospace,monospace;word-break:break-all;color:#e8cdb6'; pre.textContent = 'To ' + invoice.destination + ' · Destination tag ' + invoice.destinationTag + ' · Memo ' + invoice.memo; box.append(pre); }
      timer = setTimeout(() => poll(0), 5000);
    })().catch(() => say('Could not reach the server.'));
  });
}
