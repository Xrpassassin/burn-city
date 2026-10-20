// Verifies pay-to-play logic end-to-end on XRPL TESTNET ONLY (faucet-funded wallets), plus a real
// testnet burn through an AMM built on testnet to mirror BURN/XRP. Never touches mainnet.
process.env.XRPL_WSS = 'wss://testnet.xrpl-labs.com'; process.env.XRPL_NETWORK = 'testnet';
process.env.DATA_DIR = '/tmp/bcg-testnet-' + Date.now(); process.env.PRICE_SKIN_EMBER = '1000000'; process.env.ADMIN_TOKEN = 't';
const xrpl = require('xrpl'), assert = require('assert');
(async () => {
  const c = new xrpl.Client(process.env.XRPL_WSS); await c.connect();
  const [{ wallet: treasury }, { wallet: player }, { wallet: issuer }] = await Promise.all([c.fundWallet(), c.fundWallet(), c.fundWallet()]);
  process.env.TREASURY_ADDRESS = treasury.classicAddress; process.env.TREASURY_SEED = treasury.seed;
  process.env.BURN_ISSUER = issuer.classicAddress; process.env.BURN_CURRENCY = 'BURN';
  const Pay = require('../server/payments'), S = require('../server/store');
  const memo = s => [{ Memo: { MemoType: Buffer.from('burncity/session').toString('hex'), MemoData: Buffer.from(s).toString('hex') } }];
  const pay = async (o) => (await c.submitAndWait({ TransactionType: 'Payment', Account: player.classicAddress, ...o }, { wallet: player })).result.hash;
  const R = [];
  const check = async (name, sid, hash, expectOk, reason) => { const v = await Pay.verify(sid, hash); assert.equal(v.ok, expectOk, name + ' ' + JSON.stringify(v)); if (reason) assert.equal(v.reason, reason); R.push(`PASS ${name} -> ${v.ok ? 'granted' : v.reason}`); return v; };

  const A = player.classicAddress, P1 = 1000000;
  const s1 = Pay.newPurchase(A, 'skin_ember'); const h1 = await pay(Pay.txJsonFor(s1));
  await check('valid 1 XRP skin purchase', s1, h1, true); assert(Pay.owned(A).includes('skin_ember')); R.push('PASS ownership stored for ' + A);
  await check('replay same tx on new session', Pay.newPurchase(A, 'trail_gold'), h1, false, 'replay');
  const s3 = Pay.newPurchase(A, 'trail_gold'); await check('underpaid', s3, await pay({ Destination: treasury.classicAddress, Amount: '1000', Memos: memo(s3) }), false, 'wrong_amount');
  const s4 = Pay.newPurchase(A, 'trail_gold'); await check('wrong memo', s4, await pay({ Destination: treasury.classicAddress, Amount: '2000000', Memos: memo('BCnotmine') }), false, 'memo_mismatch');
  const s5 = Pay.newPurchase(A, 'trail_gold'); await check('wrong destination', s5, await pay({ Destination: issuer.classicAddress, Amount: '2000000', Memos: memo(s5) }), false, 'wrong_destination');
  const s6 = Pay.newPurchase(issuer.classicAddress, 'trail_gold'); await check('paid by a different account than signed in', s6, await pay({ ...Pay.txJsonFor(s6) }), false, 'wrong_sender');
  const s7 = Pay.newPurchase(A, 'trail_gold'); await check('partial payment trick (Amount ok, delivered 0.001)', s7, await pay({ Destination: treasury.classicAddress, Amount: '2000000', SendMax: '1000', DeliverMin: '1000', Flags: 0x20000, Memos: memo(s7) }).catch(() => 'A'.repeat(64)), false);
  await check('unknown session', 'BCfake', h1, false, 'unknown_or_expired_session');
  await check('fake hash', Pay.newPurchase(A, 'trail_gold'), 'A'.repeat(64), false, 'tx_not_found');
  const tok = Pay.sign({ acct: A, exp: Date.now() + 1e6 }); assert.equal(Pay.checkToken(tok.slice(0, -2) + 'xx'), null); R.push('PASS tampered sign-in token rejected');
  const owed = S.load('burn_owed.json', {}); assert.equal(owed.drops, Math.floor(P1 * 0.322)); R.push(`PASS burn share accrued: ${owed.drops} drops (32.2% of 1 XRP)`);
  // ---- testnet mirror of BURN/XRP AMM, then run the real batch burn (DRY_RUN then live, testnet) ----
  const BURN = { currency: require('../server/burn').curHex('BURN'), issuer: issuer.classicAddress };
  await c.submitAndWait({ TransactionType: 'AccountSet', Account: issuer.classicAddress, SetFlag: 8 }, { wallet: issuer });
  await c.submitAndWait({ TransactionType: 'TrustSet', Account: player.classicAddress, LimitAmount: { ...BURN, value: '1e9' } }, { wallet: player });
  await c.submitAndWait({ TransactionType: 'Payment', Account: issuer.classicAddress, Destination: player.classicAddress, Amount: { ...BURN, value: '1000000' } }, { wallet: issuer });
  await c.submitAndWait({ TransactionType: 'AMMCreate', Account: player.classicAddress, Amount: '20000000', Amount2: { ...BURN, value: '1000000' }, TradingFee: 52, Fee: (await c.request({ command: 'server_state' })).result.state.validated_ledger.reserve_inc.toString() }, { wallet: player });
  R.push('setup testnet BURN/XRP AMM (20 XRP : 1,000,000 BURN)');
  S.save('burn_owed.json', { drops: 1000000 });   // simulate ~67 entries accrued
  process.env.DRY_RUN = 'true'; delete require.cache[require.resolve('../server/config')]; delete require.cache[require.resolve('../server/burn')];
  const dry = await require('../server/burn').run(); assert(dry.dryRun && !dry.hash); R.push(`PASS DRY_RUN built tx, nothing submitted (expected ${dry.expectedBurn.toFixed(0)} BURN)`);
  process.env.DRY_RUN = 'false'; delete require.cache[require.resolve('../server/config')]; delete require.cache[require.resolve('../server/burn')];
  const before = (await c.request({ command: 'gateway_balances', account: issuer.classicAddress })).result.obligations;
  const live = await require('../server/burn').run();
  const after = (await c.request({ command: 'gateway_balances', account: issuer.classicAddress })).result.obligations;
  assert.equal(live.result, 'tesSUCCESS'); R.push(`PASS testnet burn ${live.hash}: delivered ${live.delivered.value} BURN to issuer; supply ${JSON.stringify(before)} -> ${JSON.stringify(after)}; owed now ${S.load('burn_owed.json').drops}`);
  process.env.IMG_ISSUER = issuer.classicAddress; process.env.PRIZES = '100,50'; process.env.PRIZE_WALLET_ADDRESS = issuer.classicAddress;
  for (const k of ['config', 'leaderboard']) delete require.cache[require.resolve('../server/' + k)];
  const LB = require('../server/leaderboard'), IMG = { currency: 'IMG', issuer: issuer.classicAddress };
  await c.submitAndWait({ TransactionType: 'TrustSet', Account: A, LimitAmount: { ...IMG, value: '1e9' } }, { wallet: player });
  LB.record({ acct: A, kills: 40, wave: 5, secs: 300 }); LB.record({ acct: treasury.classicAddress, kills: 30, wave: 4, secs: 240 });
  LB.record({ acct: 'rCheaterXXXXXXXXXXXXXXXXXXXXXXXXX', kills: 900, wave: 2, secs: 60 });
  const po = await LB.payoutList(c);
  assert.equal(po.payouts[0].acct, A); assert(po.payouts[0].trustline); assert(!po.payouts[1].trustline); assert(po.flaggedForReview.some(f => f.acct.startsWith('rCheater')));
  R.push('PASS payout list: #1 ready (trustline ok), #2 HOLD (no IMG trustline), cheater flagged+excluded; nothing sent');
  console.log(JSON.stringify(po.payouts.map(({ unsignedTx, ...p }) => p)));
  console.log(R.join('\n')); await c.disconnect(); process.exit(0);
})().catch(e => { console.error('FAIL', e); process.exit(1); });
