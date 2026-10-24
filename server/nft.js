// NFT characters: wallet-verified RACC / Firekeepers / 589 Protocol holders can play as their own NFT.
// Read-only ledger (account_nfts). Collections are matched on exact issuer + taxon (verified, see COLS).
// Metadata/images come from IPFS via public gateways, are resized once with sharp and cached on the volume.
const fs = require('fs'), path = require('path'), C = require('./config'), S = require('./store');
let sharp = null; try { sharp = require('sharp'); sharp.cache(false); sharp.concurrency(1); } catch { }
const COLS = {   // sources: xrpl.to collection API + xrpburn.com "Sovereign NFT Vaults" links + ledger NFTokenIDs
  'rKZmQq3gMCNmV6th3wZPhfqgZ3815vUmiV:1': { key: 'fk', name: 'Firekeepers' },          // xrp.cafe/collection/burn-the-sacred-20
  'rKZmQq3gMCNmV6th3wZPhfqgZ3815vUmiV:589': { key: '589', name: '589 Protocol' },      // xrp.cafe/collection/burn-589-protocol
  'rXYdhW4ZHdzt27VuHJgNwbD1aJjcKZJ9M:0': { key: 'racc', name: 'RACC' },                // xrp.cafe/collection/left-hand-savag3 ("Raccoon Guy 123", $RACC)
};
const GW = ['https://gateway.pinata.cloud/ipfs/', 'https://ipfs.filebase.io/ipfs/', 'https://ipfs.io/ipfs/'];
const DIR = S.file('nft'); fs.mkdirSync(DIR, { recursive: true });
const ACCT = /^r[1-9A-HJ-NP-Za-km-z]{24,34}$/, NID = /^[0-9A-F]{64}$/;
let sel = S.load('nft_sel.json', {});              // acct -> NFTokenID (selected character)
const owned = new Map();                           // acct -> { t, list:[{id,key}] }
const metaMem = new Map(), inflight = new Map();
const TTL = 5 * 60e3;

function ipfs(u) { u = String(u || '').trim(); if (u.startsWith('ipfs://')) return u.slice(7).replace(/^ipfs\//, ''); const m = u.match(/\/ipfs\/(.+)$/); return m ? m[1] : null; }
async function get(u, type) {
  const p = ipfs(u), urls = p ? GW.map(g => g + p.split('/').map(s => encodeURIComponent(decodeURIComponent(s))).join('/')) : (/^https:\/\//.test(u) ? [u] : []);
  for (const x of urls) { try { const r = await fetch(x, { signal: AbortSignal.timeout(15000) }); if (!r.ok) continue;
    if (type === 'json') { const t = await r.text(); if (t.length > 200e3) continue; return JSON.parse(t); }
    const b = Buffer.from(await r.arrayBuffer()); if (b.length > 25e6) continue; return b; } catch { } }
  return null;
}
async function scan(acct, ledger) {                 // every collection NFT the account holds right now
  const list = []; let marker;
  const cl = await ledger();
  for (let i = 0; i < 20; i++) { const r = (await cl.request({ command: 'account_nfts', account: acct, limit: 400, marker })).result;
    for (const n of r.account_nfts) { const c = COLS[n.Issuer + ':' + n.NFTokenTaxon]; if (c) list.push({ id: n.NFTokenID.toUpperCase(), key: c.key, uri: n.URI || '', serial: n.nft_serial }); }
    if (!(marker = r.marker)) break; }
  owned.set(acct, { t: Date.now(), list }); return list;
}
async function holdings(acct, ledger, fresh) { const o = owned.get(acct); if (!fresh && o && Date.now() - o.t < TTL) return o.list; return scan(acct, ledger); }

const hex = ([r, g, b]) => '#' + [r, g, b].map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
function region(px, x0, y0, x1, y1) {   // mean colour of a block of the 32x32 thumbnail
  let r = 0, g = 0, b = 0, n = 0; for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) { const i = (y * 32 + x) * 3; r += px[i]; g += px[i + 1]; b += px[i + 2]; n++; }
  return hex([r / n, g / n, b / n]);
}
function accent(px, y0, y1) {            // most saturated bright pixel in the character area (eyes, flames, logos)
  let best = 0, c = [255, 120, 40]; for (let y = y0; y < y1; y++) for (let x = 6; x < 26; x++) { const i = (y * 32 + x) * 3, R = px[i], G = px[i + 1], B = px[i + 2], mx = Math.max(R, G, B), mn = Math.min(R, G, B), sc = (mx - mn) * mx;
    if (sc > best) { best = sc; c = [R, G, B]; } } return hex(c);
}
async function meta(n) {                            // {name,num,col,traits,img,pal} cached forever per NFTokenID (metadata is immutable on IPFS)
  if (metaMem.has(n.id)) return metaMem.get(n.id);
  const f = path.join(DIR, n.id + '.json'); try { const m = JSON.parse(fs.readFileSync(f, 'utf8')); metaMem.set(n.id, m); return m; } catch { }
  if (inflight.has(n.id)) return inflight.get(n.id);
  const job = (async () => {
    const uri = Buffer.from(n.uri, 'hex').toString('utf8'); let j = /\.(png|jpe?g|gif|webp)$/i.test(uri) ? { image: uri } : await get(uri, 'json');
    if (!j) return null;
    const traits = (Array.isArray(j.attributes) ? j.attributes : []).slice(0, 16).map(a => [String(a.trait_type || '').trim().slice(0, 32), String(a.value ?? '').trim().slice(0, 48)]).filter(a => a[0]);
    const name = String(j.name || '').slice(0, 64), num = (name.match(/(\d+)\s*$/) || [, n.key === 'fk' ? '1/1' : ''])[1].replace(/^0+(?=\d)/, '');
    const m = { id: n.id, key: n.key, col: Object.values(COLS).find(c => c.key === n.key).name, name: name || ('#' + num), num: String(num ?? ''), traits, img: null, pal: null };
    const buf = sharp ? await get(j.image || j.image_url, 'bin') : null;
    if (buf) { try {
      const base = sharp(buf, { animated: false, limitInputPixels: 64e6 }).rotate().resize(256, 256, { fit: 'cover' }).removeAlpha();
      await base.clone().webp({ quality: 82 }).toFile(path.join(DIR, n.id + '.webp'));
      await base.clone().jpeg({ quality: 80 }).toFile(path.join(DIR, n.id + '.jpg'));   // fallback for very old Safari
      const px = await base.clone().resize(32, 32, { fit: 'fill' }).raw().toBuffer();
      m.pal = { bg: region(px, 0, 0, 5, 5), top: region(px, 11, 3, 21, 9), face: region(px, 12, 11, 20, 18), body: region(px, 8, 26, 24, 32), acc: accent(px, 4, 30) };
      m.img = '/nftimg/' + n.id + '.webp'; } catch (e) { console.error('nft img', n.id.slice(-8), e.message); } }
    fs.writeFileSync(f, JSON.stringify(m)); metaMem.set(n.id, m); return m;
  })().finally(() => inflight.delete(n.id));
  inflight.set(n.id, job); return job;
}
const pub = m => m && ({ id: m.id, key: m.key, col: m.col, name: m.name, num: m.num, img: m.img, pal: m.pal, traits: m.traits });
async function mine(acct, ledger) {                 // sign-in / picker: fresh ownership check + metadata
  const list = await holdings(acct, ledger, true);
  if (sel[acct] && !list.some(n => n.id === sel[acct])) { delete sel[acct]; S.save('nft_sel.json', sel); }
  const todo = list.filter(n => !metaMem.has(n.id) && !fs.existsSync(path.join(DIR, n.id + '.json')));
  if (todo.length) { const run = (async () => { for (let i = 0; i < todo.length; i += 3) await Promise.all(todo.slice(i, i + 3).map(n => meta(n).catch(() => null))); })();
    await Promise.race([run, new Promise(r => setTimeout(r, 8000))]); }
  const out = []; for (const n of list) out.push(metaMem.has(n.id) || fs.existsSync(path.join(DIR, n.id + '.json')) ? pub(await meta(n)) : { id: n.id, key: n.key, pending: true });
  return { nfts: out.filter(Boolean), pending: out.some(n => n && n.pending), selected: sel[acct] || null, collections: Object.entries(COLS).map(([k, c]) => ({ issuer: k.split(':')[0], taxon: +k.split(':')[1], name: c.name })) };
}
async function select(acct, id, ledger) {
  if (id === null || id === '') { delete sel[acct]; S.save('nft_sel.json', sel); return { ok: true, selected: null }; }
  id = String(id).toUpperCase(); if (!NID.test(id)) return { error: 'bad_id' };
  const n = (await holdings(acct, ledger, true)).find(x => x.id === id); if (!n) return { error: 'not_owner' };
  const m = await meta(n); if (!m) return { error: 'metadata_unavailable' };
  sel[acct] = id; S.save('nft_sel.json', sel); return { ok: true, selected: id, nft: pub(m) };
}
// synchronous lookup used when a player joins a room / the city: only returns a character whose ownership was verified recently
function charFor(acct) {
  if (!acct || !sel[acct]) return null; const o = owned.get(acct);
  if (!o || Date.now() - o.t > 3 * TTL || !o.list.some(n => n.id === sel[acct])) return null;
  const m = metaMem.get(sel[acct]); return m ? { id: m.id, key: m.key, name: m.name, num: m.num, img: m.img, pal: m.pal, t: m.traits.filter(a => !/background/i.test(a[0])).map(a => a[1]).slice(0, 16) } : null;
}
let ledgerFn = null, mainnet = null;   // own read-only mainnet client (NFTs live on mainnet even when payments run on testnet)
const xrpl = require('xrpl');
async function mainLedger() { if (mainnet && mainnet.isConnected()) return mainnet; mainnet = new xrpl.Client(process.env.NFT_WSS || 'wss://xrplcluster.com'); await mainnet.connect(); return mainnet; }
async function recheck() {                          // periodic: re-verify every selected character, drop transferred ones
  if (!ledgerFn) return;
  for (const acct of Object.keys(sel)) { try { const l = await scan(acct, ledgerFn);
      if (!l.some(n => n.id === sel[acct])) { delete sel[acct]; S.save('nft_sel.json', sel); }
      else { const n = l.find(x => x.id === sel[acct]); await meta(n); } } catch { } await new Promise(r => setTimeout(r, 500)); }
}
function start() { ledgerFn = mainLedger; setTimeout(recheck, 5e3).unref?.(); setInterval(recheck, 10 * 60e3).unref(); }
function image(req, res, p) {                       // GET /nftimg/<ID>.webp|jpg (public, immutable)
  const m = p.match(/^\/nftimg\/([0-9A-F]{64})\.(webp|jpg)$/); if (!m) return false;
  const f = path.join(DIR, m[1] + '.' + m[2]);
  if (!fs.existsSync(f)) { res.writeHead(404, { 'access-control-allow-origin': '*' }); res.end(); return true; }
  res.writeHead(200, { 'content-type': m[2] === 'webp' ? 'image/webp' : 'image/jpeg', 'cache-control': 'public, max-age=31536000, immutable', 'access-control-allow-origin': '*', 'cross-origin-resource-policy': 'cross-origin', 'x-content-type-options': 'nosniff' });
  fs.createReadStream(f).pipe(res); return true;
}
module.exports = { mainLedger, COLS, mine, select, charFor, start, image, holdings, ACCT };
