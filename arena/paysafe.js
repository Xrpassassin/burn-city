// Shared safety UI: official-wallet badge, pre-payment summary, receipt. All text set via textContent (no HTML injection).
export const TREASURY = 'rwfnp2k2jU8VeFbkK85AJqu2NyAjtiaEpb';
export const NOTICE = 'We will never DM you or ask for your seed, secret or recovery words. Only pay the official wallet below.';
const css = `.ps-bg{position:fixed;inset:0;background:#000b;z-index:9999;display:flex;align-items:center;justify-content:center;padding:12px;-webkit-backdrop-filter:blur(3px);backdrop-filter:blur(3px)}
.ps{background:#120a06;color:#fff;border:1px solid #ff7a1a;border-radius:14px;max-width:420px;width:100%;max-height:92vh;overflow:auto;padding:16px;font:14px/1.45 system-ui,-apple-system,sans-serif}
.ps h3{margin:0 0 8px;color:#ffb347;font-size:17px}.ps .row{display:flex;justify-content:space-between;gap:10px;padding:5px 0;border-bottom:1px solid #ffffff14}.ps .row b{text-align:right;word-break:break-all}
.ps .badge{display:inline-flex;align-items:center;gap:6px;background:#0d2a16;border:1px solid #2bd96b;color:#9dffbd;border-radius:999px;padding:3px 9px;font-size:12px;margin:6px 0}
.ps .warn{background:#2a1606;border:1px solid #ff7a1a55;border-radius:8px;padding:8px;margin:8px 0;font-size:12.5px}.ps .note{color:#ffd9a8;font-size:12px;margin-top:6px}
.ps .btns{display:flex;gap:8px;margin-top:12px}.ps button{flex:1;min-height:44px;border-radius:10px;border:1px solid #ff7a1a;background:#2a1606;color:#fff;font-size:15px}.ps button.go{background:#ff7a1a;color:#120a06;font-weight:700}.ps a{color:#7ad0ff}`;
let styled = false; const el = (t, c, txt) => { const e = document.createElement(t); if (c) e.className = c; if (txt != null) e.textContent = txt; return e; };
function sheet() { if (!styled) { const s = el('style'); s.textContent = css; document.head.append(s); styled = true; } }
export function badge(addr = TREASURY) { sheet(); const b = el('span', 'badge'); b.append(el('span', null, '✔'), el('span', null, 'Official Burn City wallet ' + addr.slice(0, 6) + '…' + addr.slice(-4))); b.title = addr; return b; }
function modal(build) { sheet(); return new Promise(res => { const bg = el('div', 'ps-bg'), box = el('div', 'ps'); bg.append(box); build(box, v => { bg.remove(); res(v); }); document.body.append(bg); }); }
// rows: [[label, value]]; returns true when the player taps Continue
export function confirmPay({ title, rows, dest, warn, note }) {
  return modal((box, done) => {
    box.append(el('h3', null, title));
    for (const [k, v] of rows) { const r = el('div', 'row'); r.append(el('span', null, k), el('b', null, v)); box.append(r); }
    const d = el('div', 'row'); d.append(el('span', null, 'Pays to'), el('b', null, dest)); box.append(d);
    if (dest !== TREASURY) { box.append(el('div', 'warn', '⚠ This is NOT the official wallet. Do not pay.')); }
    else box.append(badge(dest));
    if (warn) box.append(el('div', 'warn', warn));
    box.append(el('div', 'note', NOTICE)); if (note) box.append(el('div', 'note', note));
    const bt = el('div', 'btns'), no = el('button', null, 'Cancel'), go = el('button', 'go', 'Continue in XAMAN');
    if (dest !== TREASURY) go.disabled = true;
    no.onclick = () => done(false); go.onclick = () => done(true); bt.append(no, go); box.append(bt);
  });
}
export const txUrl = h => 'https://livenet.xrpl.org/transactions/' + h;
export function receipt({ title, rows, hash }) {
  return modal((box, done) => {
    box.append(el('h3', null, title)); for (const [k, v] of rows) { const r = el('div', 'row'); r.append(el('span', null, k), el('b', null, v)); box.append(r); }
    if (hash) { const a = el('a', null, 'View on the XRP Ledger ↗'); a.href = txUrl(hash); a.target = '_blank'; a.rel = 'noopener'; const r = el('div', 'row'); r.append(el('span', null, 'Ledger tx'), a); box.append(r); }
    box.append(el('div', 'note', 'Your full history: ')); const h = el('a', null, 'My match history'); h.href = 'history.html'; box.lastChild.append(h);
    const ok = el('button', 'go', 'OK'); ok.onclick = () => done(true); const bt = el('div', 'btns'); bt.append(ok); box.append(bt);
  });
}
