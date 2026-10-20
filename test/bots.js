// Headless load test: N bots per mode against a running server. Usage: node test/bots.js [url] [bots] [seconds]
const WebSocket = require('ws');
const URL0 = process.argv[2] || 'ws://localhost:8080', N = +(process.argv[3] || 8), SECS = +(process.argv[4] || 30);
const res = {};
function bot(mode, i) {
  const ws = new WebSocket(`${URL0}/?mode=${mode}&name=bot${i}`), st = { rx: 0, msgs: 0, me: 0, ev: {}, gaps: [], last: 0, wave: 0, score: 0 };
  (res[mode] = res[mode] || []).push(st);
  ws.on('message', d => {
    st.rx += d.length; st.msgs++; const m = JSON.parse(d), now = Date.now();
    if (m.t === 'init') st.me = m.me;
    if (m.t !== 's') return; if (st.last) st.gaps.push(now - st.last); st.last = now;
    for (const e of m.ev || []) st.ev[e.e] = (st.ev[e.e] || 0) + 1;
    if (mode === 'zombie') { st.wave = Math.max(st.wave, m.w); st.score = Math.max(st.score, m.sc);
      const me = m.p.find(p => p[0] === st.me); if (!me) return;
      let best, bd = 1e9; for (const z of m.z) { const d = Math.hypot(z[1] - me[1], z[2] - me[2]); if (d < bd) { bd = d; best = z; } }
      const yaw = best ? Math.atan2(best[1] - me[1], best[2] - me[2]) : 0;
      ws.send(JSON.stringify({ t: 'i', yaw, mz: bd < 4 ? -1 : 0, mx: Math.random() - .5, fire: bd < 9 }));
    } else if (Math.random() < 0.06) ws.send(JSON.stringify({ t: 'i', turn: Math.random() < .5 ? -1 : 1 }));
  });
  return ws;
}
const all = []; for (const m of ['tron', 'zombie']) for (let i = 0; i < N; i++) all.push(bot(m, i));
setTimeout(async () => {
  const http = URL0.replace('ws', 'http'), s = await (await fetch(http + '/stats')).json();
  for (const [m, a] of Object.entries(res)) {
    const kbps = a.reduce((x, b) => x + b.rx, 0) / a.length / SECS / 1024, g = a.flatMap(b => b.gaps).sort((x, y) => x - y);
    console.log(m, { bots: a.length, KBps_per_client: +kbps.toFixed(2), MB_per_hour: +(kbps * 3.6).toFixed(1), snapHz: +(1000 / (g.reduce((x, y) => x + y, 0) / g.length)).toFixed(1), gapP99ms: g[Math.floor(g.length * .99)], events: a[0].ev, wave: a[0].wave, score: a[0].score });
  }
  console.log('server', s); all.forEach(w => w.close()); setTimeout(() => process.exit(0), 300);
}, SECS * 1000);
