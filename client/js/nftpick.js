// NFT character picker: signed-in XAMAN holders of RACC / Firekeepers / 589 Protocol pick one NFT to play as.
// Ownership is checked on the game server against the XRPL ledger (account_nfts) at sign-in, on open, and every 10 min.
// localStorage.bcNft holds the chosen character's public look so the city / arena can render it; it is cleared if ownership lapses.
const css = `#nftPick{position:fixed;inset:0;z-index:60;background:#000b;display:flex;align-items:center;justify-content:center;font:14px system-ui;color:#ffd9a0}
#nftPick .np{background:#140804;border:1px solid #f60;border-radius:14px;max-width:560px;width:calc(100% - 24px);max-height:84vh;display:flex;flex-direction:column;box-shadow:0 0 30px #f604}
#nftPick header{display:flex;align-items:center;gap:8px;padding:12px 14px;border-bottom:1px solid #f603}#nftPick header b{flex:1;font-size:16px}
#nftPick .x{background:none;border:0;color:#ffb060;font-size:22px;cursor:pointer;padding:2px 8px}
#nftPick .grid{overflow:auto;-webkit-overflow-scrolling:touch;padding:12px;display:grid;grid-template-columns:repeat(auto-fill,minmax(118px,1fr));gap:10px}
#nftPick .c{background:#2a0d00;border:2px solid #f604;border-radius:10px;padding:6px;cursor:pointer;color:inherit;text-align:center;font:inherit}
#nftPick .c.on{border-color:#ffd24a;box-shadow:0 0 12px #ffd24a88}#nftPick .c img{width:100%;aspect-ratio:1;object-fit:cover;border-radius:6px;display:block;background:#0006}
#nftPick .c small{display:block;opacity:.7;font-size:11px}#nftPick .c b{display:block;font-size:12px;margin-top:4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
#nftPick .ft{padding:10px 14px;border-top:1px solid #f603;font-size:12px;opacity:.85;display:flex;gap:8px;align-items:center;flex-wrap:wrap}
#nftPick .ft button{background:#2a0d00;color:#ffb060;border:1px solid #f60;border-radius:8px;padding:6px 12px;font:inherit;cursor:pointer}`;
const COL = { racc: 'RACC', fk: 'Firekeepers', '589': '589 Protocol' };
const tok = () => { try { return localStorage.bcToken || ''; } catch (e) { return ''; } };
const get = () => { try { return JSON.parse(localStorage.bcNft || 'null'); } catch (e) { return null; } };
const set = v => { try { v ? localStorage.bcNft = JSON.stringify(v) : localStorage.removeItem('bcNft'); } catch (e) {} dispatchEvent(new CustomEvent('bc-nft', { detail: v })); };
let last = null;
async function api(srv, path, body) {
  const r = await fetch(srv + path, { method: body ? 'POST' : 'GET', headers: { authorization: 'Bearer ' + tok(), 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  if (r.status === 401) { set(null); return { error: 'signin' }; } return r.json();
}
const look = n => n && { id: n.id, key: n.key, name: n.name, num: n.num, img: n.img, pal: n.pal, t: (n.traits || []).filter(a => !/background/i.test(a[0])).map(a => a[1]).slice(0, 16) };
export async function refresh(srv) {        // re-verify ownership; drops the character if it was transferred
  if (!tok()) { if (get()) set(null); return null; }
  const d = await api(srv, '/api/nft/mine'); if (d.error) return d.error === 'signin' ? null : last; last = d;
  const cur = get(), sel = d.selected && d.nfts.find(n => n.id === d.selected);
  if (!sel || sel.pending) { if (cur && !d.selected) set(null); } else if (!cur || cur.id !== sel.id || !cur.pal) set(look(sel));
  return d;
}
export const current = get;
export function mount(srv, { button } = {}) {
  if (!document.getElementById('nftPickCss')) { const s = document.createElement('style'); s.id = 'nftPickCss'; s.textContent = css; document.head.append(s); }
  const upd = () => { if (button) { button.hidden = !tok() || !(last && last.nfts && last.nfts.length); const c = get(); button.textContent = c ? '🎭 ' + (c.name || 'My NFT') : '🎭 Play as my NFT'; } };
  addEventListener('bc-nft', upd);
  const go = () => refresh(srv).then(upd, upd); go(); setInterval(() => { if (!document.hidden) go(); }, 10 * 60e3);
  addEventListener('storage', e => { if (e.key === 'bcToken') go(); });
  if (button) button.onclick = () => open(srv);
  return { refresh: go };
}
export async function open(srv) {
  document.getElementById('nftPick')?.remove();
  const w = document.createElement('div'); w.id = 'nftPick'; w.innerHTML = '<div class="np" role="dialog" aria-label="Choose your NFT character"><header><b>🎭 Play as your NFT</b><button class="x" aria-label="Close">✕</button></header><div class="grid"><div style="grid-column:1/-1;opacity:.7">Checking your wallet on the XRPL…</div></div><div class="ft"></div></div>';
  document.body.append(w); const grid = w.querySelector('.grid'), ft = w.querySelector('.ft');
  const close = () => { w.remove(); removeEventListener('keydown', esc); }, esc = e => { if (e.key === 'Escape') close(); };
  w.querySelector('.x').onclick = close; w.onclick = e => { if (e.target === w) close(); }; addEventListener('keydown', esc);
  if (!tok()) { grid.innerHTML = '<div style="grid-column:1/-1">Sign in with XAMAN first. Holders of RACC, Firekeepers or 589 Protocol NFTs can play as them.</div>'; return; }
  const draw = d => {
    grid.replaceChildren(); const cur = get();
    if (!d || !d.nfts || !d.nfts.length) { grid.innerHTML = '<div style="grid-column:1/-1">No RACC, Firekeepers or 589 Protocol NFTs in this wallet. You keep the default character.</div>'; return; }
    for (const n of d.nfts) { const b = document.createElement('button'); b.className = 'c' + (cur && cur.id === n.id ? ' on' : '');
      if (n.pending) { b.disabled = true; b.innerHTML = '<img alt=""><small>' + COL[n.key] + '</small><b>loading…</b>'; grid.append(b); continue; }
      const im = document.createElement('img'); im.alt = n.name; im.loading = 'lazy'; im.src = srv + n.img.replace(/\.webp$/, '.jpg');
      const sm = document.createElement('small'), nb = document.createElement('b'); sm.textContent = COL[n.key] + (n.num ? ' · #' + n.num.replace(/^#/, '') : ''); nb.textContent = n.name;
      b.append(im, sm, nb); b.title = (n.traits || []).map(a => a[0] + ': ' + a[1]).join('\n');
      b.onclick = async () => { b.disabled = true; const r = await api(srv, '/api/nft/select', { id: n.id }); b.disabled = false;
        if (r.ok) { set(look(r.nft)); draw(last); ft.firstChild.textContent = 'Now playing as ' + n.name + '. Used in the city, Zombie Survival and Light Cycles.'; }
        else ft.firstChild.textContent = r.error === 'not_owner' ? 'That NFT is no longer in your wallet.' : 'Could not select it right now, try again.'; };
      grid.append(b); }
  };
  ft.innerHTML = '<span>Only NFTs your signed-in wallet holds are shown. Checked on the XRPL ledger.</span>';
  const def = document.createElement('button'); def.textContent = 'Use default character'; def.onclick = async () => { await api(srv, '/api/nft/select', { id: null }); set(null); draw(last); }; ft.append(def);
  let d = await refresh(srv); draw(d);
  for (let i = 0; i < 12 && d && d.pending && w.isConnected; i++) { await new Promise(r => setTimeout(r, 5000)); d = await refresh(srv); if (w.isConnected) draw(d); }
}
