// AEGIS live cams: /api/cams shape + fallback, YouTube refresh (stubbed fetch, no network), comments (length, rate limit, escaping, URL/profanity filter).
const fs = require('fs'), path = require('path'), os = require('os');
const DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'bccams-'));
Object.assign(process.env, { DATA_DIR: DIR, PORT: '0', TOKEN_SECRET: 'simsecret', XRPL_WSS: 'ws://127.0.0.1:1', DRY_RUN: 'true', BURN_JOB_IN_SERVER: 'false' });
delete process.env.YT_API_KEY; delete process.env.Youtube_API;
const Cams = require('../server/cams'), Srv = require('../server/server');
let pass = 0, fail = 0; const ok = (c, m) => { c ? pass++ : fail++; console.log((c ? '  PASS ' : '  FAIL ') + m); };
(async () => {
  const port = await new Promise(r => Srv.server.listening ? r(Srv.server.address().port) : Srv.server.on('listening', () => r(Srv.server.address().port)));
  const H = 'http://127.0.0.1:' + port;
  console.log('Cams list');
  let r = await fetch(H + '/api/cams'), d = await r.json();
  ok(r.status === 200 && d.source === 'fallback' && d.categories.length === 6, 'no key: fallback with 6 categories');
  ok(d.categories.every(c => c.streams.length && c.streams.every(s => /^[A-Za-z0-9_-]{11}$/.test(s.id) && typeof s.viewers === 'number')), 'every stream has an id + viewers');
  ok(!JSON.stringify(d).includes('key='), 'no API key in the payload');
  // stubbed YouTube API: search -> ids, videos -> viewers; one not embeddable, one ended
  process.env.Youtube_API = 'TESTKEY'; let urls = [];
  const fake = async u => { urls.push(String(u)); const ep = new URL(u).pathname.split('/').pop();
    const j = ep === 'search' ? { items: [{ id: { videoId: 'aaaaaaaaaaa' } }, { id: { videoId: 'bbbbbbbbbbb' } }, { id: { videoId: 'ccccccccccc' } }, { id: { videoId: 'ddddddddddd' } }] }
      : { items: [
        { id: 'aaaaaaaaaaa', snippet: { title: 'Low <b>cam</b>', channelTitle: 'A', liveBroadcastContent: 'live' }, liveStreamingDetails: { concurrentViewers: '12' }, status: { embeddable: true, privacyStatus: 'public' } },
        { id: 'bbbbbbbbbbb', snippet: { title: 'Top cam', channelTitle: 'B', liveBroadcastContent: 'live' }, liveStreamingDetails: { concurrentViewers: '9001' }, status: { embeddable: true, privacyStatus: 'public' } },
        { id: 'ccccccccccc', snippet: { title: 'No embed', channelTitle: 'C', liveBroadcastContent: 'live' }, liveStreamingDetails: { concurrentViewers: '50000' }, status: { embeddable: false, privacyStatus: 'public' } },
        { id: 'ddddddddddd', snippet: { title: 'Ended', channelTitle: 'D', liveBroadcastContent: 'none' }, liveStreamingDetails: { concurrentViewers: '1', actualEndTime: 'x' }, status: { embeddable: true, privacyStatus: 'public' } }] };
    return { ok: true, json: async () => j }; };
  ok(await Cams.tick(fake), 'tick with Youtube_API env (stubbed) succeeds');
  ok(urls.filter(u => u.includes('/search')).length === 6 && urls.filter(u => u.includes('/videos')).length === 1, 'cold start: 6 searches + 1 videos call');
  ok(urls.every(u => u.includes('eventType=live') || u.includes('/videos')), 'search asks for live only');
  r = await fetch(H + '/api/cams'); d = await r.json(); const c0 = d.categories[0];
  ok(d.source === 'youtube' && c0.streams.map(s => s.id).join() === 'bbbbbbbbbbb,aaaaaaaaaaa', 'sorted by viewers desc, non-embeddable + ended dropped');
  ok(c0.streams[1].title === 'Low bcam/b' && !/[<>]/.test(JSON.stringify(d)), 'titles stripped of < >');
  urls = []; await Cams.tick(fake); ok(urls.filter(u => u.includes('/search')).length === 1, 'warm tick: one search (quota round-robin)');
  ok(fs.existsSync(path.join(DIR, 'cams.json')), 'cache written to DATA_DIR/cams.json');
  ok(!JSON.stringify(await (await fetch(H + '/api/cams')).json()).includes('TESTKEY'), 'key never sent to the client');
  const bad = async () => ({ ok: false, status: 403, json: async () => ({}) }); ok(!(await Cams.tick(bad)) && (await (await fetch(H + '/api/cams')).json()).categories.length === 6, 'API error: keeps serving the last good list');
  delete process.env.Youtube_API;

  console.log('Comments');
  const P = (id, b, h = {}) => fetch(H + '/api/cams/' + id + '/comments', { method: 'POST', headers: { 'content-type': 'application/json', ...h }, body: JSON.stringify(b) });
  r = await P('1EiC9bvVGnk', { text: 'x'.repeat(201), name: 'a', pid: 'tester01' }); ok(r.status === 400 && (await r.json()).error === 'too_long', 'over 200 chars rejected');
  r = await P('1EiC9bvVGnk', { text: '   ', pid: 'tester01' }); ok(r.status === 400, 'empty rejected');
  r = await P('not-an-id', { text: 'hi' }); ok(r.status === 400, 'bad stream id rejected');
  r = await P('1EiC9bvVGnk', { text: '<script>alert(1)</script> nice cam, see www.evil.com and scam.io fuck', name: '<img src=x>Bob', pid: 'tester01' }); const j = await r.json();
  ok(r.status === 200 && !/[<>]/.test(j.comment.text + j.comment.name), 'HTML < > never stored raw: ' + j.comment.text);
  ok(!/evil\.com|scam\.io/.test(j.comment.text) && /link removed/.test(j.comment.text), 'URLs removed');
  ok(!/fuck/i.test(j.comment.text), 'profanity masked');
  r = await P('1EiC9bvVGnk', { text: 'again', pid: 'tester01' }); ok(r.status === 429, 'second post within 5 s: 429 (same IP)');
  r = await P('xAieE-QtOeM', { text: 'other stream', pid: 'tester02' }); ok(r.status === 429, 'rate limit is per player/IP, across streams');
  const pr = Cams.postComment('xAieE-QtOeM', { text: 'unit' }, ['ip:9.9.9.9']); ok(pr.code === 200, 'another IP can post');
  ok(Cams.postComment('xAieE-QtOeM', { text: 'x' }, ['ip:8.8.8.8', 'p:tester01']).code === 429, 'same player id from another IP still limited');
  for (let i = 0; i < 105; i++) Cams.postComment('fO9e9jnhYK8', { text: 'n' + i }, ['ip:t' + i]);
  d = await (await fetch(H + '/api/cams/fO9e9jnhYK8/comments')).json(); ok(d.comments.length === 100 && d.comments[99].text === 'n104', 'keeps the last 100 per stream');
  d = await (await fetch(H + '/api/cams/1EiC9bvVGnk/comments')).json(); ok(d.comments.length === 1 && d.comments[0].name.length <= 24, 'GET returns stream comments');
  await new Promise(r => setTimeout(r, 2300)); ok(fs.existsSync(path.join(DIR, 'cam-comments.json')), 'comments persisted to DATA_DIR/cam-comments.json');
  let codes = []; for (let i = 0; i < 32; i++) codes.push((await fetch(H + '/api/cams')).status); ok(codes.includes(429), '/api/cams rate-limited per IP');
  console.log(`\ncams: ${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
