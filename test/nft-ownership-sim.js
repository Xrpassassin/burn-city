// NFT avatar ownership lock: only the wallet that currently holds a token on the ledger can wear it.
// Pure simulation: mock ledger (account_nfts), temp data dir, cached metadata (no network).
const os = require('os'), fs = require('fs'), path = require('path'), assert = require('assert');
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'bc-nft-own-'));
const Nft = require('../server/nft'), S = require('../server/store');
let n = 0; const t = async (name, fn) => { await fn(); n++; console.log('ok', name); };
const ISS = 'rKZmQq3gMCNmV6th3wZPhfqgZ3815vUmiV', A = 'r' + 'A'.repeat(32), B = 'r' + 'B'.repeat(32);
const ID1 = 'A'.repeat(60) + '0001', ID2 = 'B'.repeat(60) + '0002';
const holders = {};   // acct -> [NFTokenID]
let calls = 0;
const ledger = async () => ({ request: async ({ account }) => { calls++; return { result: { account_nfts: (holders[account] || []).map(id => ({ NFTokenID: id, Issuer: ISS, NFTokenTaxon: 589, URI: '', nft_serial: 1 })) } }; } });
for (const id of [ID1, ID2]) fs.writeFileSync(path.join(S.file('nft'), id + '.json'), JSON.stringify({ schema: 2, id, key: '589', col: '589 Protocol', name: 'T', num: '1', traits: [['Head', 'MoHawk']], img: null, pal: null }));
Nft._test.setLedger(ledger);
(async () => {
  await t('owner can select and wear their token', async () => {
    holders[A] = [ID1];
    assert.equal((await Nft.select(A, ID1, ledger)).ok, true);
    assert.equal(Nft.charFor(A)?.id, ID1);
  });
  await t('spoofing someone else\'s token id is rejected', async () => {
    const r = await Nft.select(B, ID1, ledger);
    assert.equal(r.error, 'not_owner'); assert.equal(Nft.charFor(B), null);
    assert.equal((await Nft.select(B, 'not-an-id', ledger)).error, 'bad_id');
    assert.equal(Nft.charFor(A)?.id, ID1, 'the real owner is unaffected');
  });
  await t('peers only get the server-side verified selection (charFor ignores client input)', async () => {
    assert.equal(Nft.charFor.length, 1, 'charFor takes only the signed-in account, never a client token id');
    assert.equal(Nft.charFor(null), null); assert.equal(Nft.charFor(B), null);
  });
  await t('sold NFT: buyer verifying voids the seller immediately', async () => {
    holders[A] = []; holders[B] = [ID1];
    assert.equal((await Nft.select(B, ID1, ledger)).ok, true);
    assert.equal(Nft.charFor(B)?.id, ID1);
    assert.equal(Nft.charFor(A), null, 'seller can no longer wear the sold token');
  });
  await t('sold NFT: stale proof is re-checked on reconnect (verify) and the selection is dropped', async () => {
    Nft._test.reset(); holders[A] = [ID2]; holders[B] = [];
    assert.equal((await Nft.select(A, ID2, ledger)).ok, true);
    holders[A] = []; holders[B] = [ID2];              // sold on the ledger; buyer never opens the picker
    assert.equal((await Nft.verify(A, ledger)).id, ID2, 'fresh proof is reused within the TTL');
    Nft._test.age(A, Nft.TTL + 1);
    assert.equal(await Nft.verify(A, ledger), null, 'stale proof triggers a ledger re-scan that drops the sold token');
    assert.equal(await Nft.verify(A, ledger), null, 'stays dropped');
  });
  await t('fails closed when the ledger cannot be reached and the proof is old', async () => {
    Nft._test.reset(); holders[A] = [ID2];
    assert.equal((await Nft.select(A, ID2, ledger)).ok, true);
    Nft._test.age(A, 3 * Nft.TTL + 1);
    assert.equal(Nft.charFor(A), null, 'no avatar from a proof older than 3*TTL');
    const down = async () => { throw new Error('ledger down'); };
    assert.equal(await Nft.verify(A, down), null);
  });
  await t('periodic recheck strips transferred selections', async () => {
    Nft._test.reset(); holders[A] = [ID1]; holders[B] = [];
    assert.equal((await Nft.select(A, ID1, ledger)).ok, true);
    holders[A] = [];
    await Nft.recheck();
    assert.equal(Nft.charFor(A), null);
  });
  await t('city/game relays never take an NFT from the client message', async () => {
    const city = fs.readFileSync(path.join(__dirname, '../server/city.js'), 'utf8'), srv = fs.readFileSync(path.join(__dirname, '../server/server.js'), 'utf8');
    const branch = city.match(/else if \(m\.t === 'nft'\) \{[^\n]*/)[0];
    assert(!/m\.(id|nft|n|tok|token)\b/.test(branch), 'city nft refresh ignores client-supplied ids');
    for (const line of city.split('\n').filter(l => /c\.nft =/.test(l))) assert(/Nft\.(charFor|verify)|= n;/.test(line), 'c.nft only comes from the verified lookup: ' + line.trim().slice(0, 80));
    assert(/look\.nft = n/.test(srv) && /const n = Nft\.charFor\(pass\.acct\)/.test(srv), 'game rooms only attach the verified character');
    assert(!/searchParams\.get\('nft'\)\s*\)\s*[;,]/.test(srv), 'the nft query flag is only an opt-out, never a token id');
  });
  console.log(n, 'nft ownership tests passed');
  fs.rmSync(process.env.DATA_DIR, { recursive: true, force: true });
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
