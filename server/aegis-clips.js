// AEGIS preview clips (PROTOTYPE, off by default). Gate: env AEGIS_CLIPS=1.
// While players are online, every ~4 min per cam: yt-dlp resolves the live HLS URL of each AEGIS YouTube cam, ffmpeg grabs
// ~10 s from near the live edge and transcodes it to a small silent H.264 mp4 (360p, ~400 kbps, faststart), cached on disk.
// Served at GET /aegis/clip/<id>.mp4 (Range requests supported, needed by iOS Safari) and listed at GET /aegis/clips.
// Needs `yt-dlp` and `ffmpeg` on PATH (the current node:22-alpine image has neither). Jobs run one at a time at low priority.
// Preferred source is a `preview_clip_url` supplied by the AEGIS API itself; this job only exists as a fallback.
// NOTE: downloading/re-serving YouTube streams may conflict with YouTube's Terms of Service; keep this off unless the
// stream owners permit it.
const fs = require('fs'), path = require('path'), os = require('os'), { spawn } = require('child_process');

const ON = process.env.AEGIS_CLIPS === '1';
const API = process.env.AEGIS_API || 'https://api.xrpl.fun/v1/aegis/city';
const EVERY = Math.max(120e3, +(process.env.AEGIS_CLIP_EVERY_MS || 240e3));   // per-cam refresh
const SECS = Math.max(4, Math.min(15, +(process.env.AEGIS_CLIP_SECS || 10)));
const DIR = process.env.AEGIS_CLIP_DIR || (fs.existsSync('/data') ? '/data/aegis-clips' : path.join(os.tmpdir(), 'aegis-clips'));
const MAX_CAMS = 8, JOB_TIMEOUT = 75e3;
const clips = new Map();   // id -> { file, t, bytes, err, fails }
let cams = [], lastFeed = 0, busy = false, lastReq = 0, onlineFn = () => 0, tools = null;

const ID = /^[a-z0-9-]{1,64}$/i, VID = /^[A-Za-z0-9_-]{11}$/;
function ytId(u) { try { const x = new URL(u); if (!/^(www\.)?youtube-nocookie\.com$|^(www\.)?youtube\.com$/.test(x.hostname)) return null; const m = x.pathname.match(/^\/embed\/([A-Za-z0-9_-]{11})$/); return m ? m[1] : null; } catch { return null; } }

function run(cmd, args, ms) {
  return new Promise(res => {
    let out = '', err = '', done = false; const p = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    try { os.setPriority(p.pid, 15); } catch { }
    const k = setTimeout(() => { if (!done) { try { p.kill('SIGKILL'); } catch { } } }, ms);
    p.stdout.on('data', d => { if (out.length < 1e5) out += d; }); p.stderr.on('data', d => { if (err.length < 4e3) err += d; });
    p.on('error', e => { done = true; clearTimeout(k); res({ code: -1, out, err: String(e.message) }); });
    p.on('close', code => { done = true; clearTimeout(k); res({ code, out, err }); });
  });
}
async function haveTools() {
  if (tools !== null) return tools;
  const a = await run('yt-dlp', ['--version'], 15e3), b = await run('ffmpeg', ['-hide_banner', '-version'], 15e3);
  tools = a.code === 0 && b.code === 0; if (!tools) console.warn('[aegis-clips] disabled: yt-dlp/ffmpeg not found'); return tools;
}
async function refreshFeed() {
  if (Date.now() - lastFeed < 5 * 60e3 && cams.length) return;
  try {
    const r = await fetch(API, { signal: AbortSignal.timeout(10e3) }); if (!r.ok) throw new Error('http ' + r.status);
    const d = await r.json(); const list = [];
    for (const b of (Array.isArray(d.billboards) ? d.billboards : []).slice(0, MAX_CAMS)) {
      if (!b || b.source_type !== 'youtube' || !ID.test(String(b.id || ''))) continue; const v = ytId(b.stream_url); if (v && VID.test(v)) list.push({ id: b.id, vid: v });
    }
    cams = list; lastFeed = Date.now();
  } catch (e) { console.warn('[aegis-clips] feed', e.message); }
}
async function grab(cam) {
  const g = await run('yt-dlp', ['-g', '--no-warnings', '--no-playlist', '-f', 'best[height<=480][protocol^=m3u8]/best[height<=480]/best', 'https://www.youtube.com/watch?v=' + cam.vid], 40e3);
  const src = (g.out || '').trim().split('\n')[0];
  if (g.code !== 0 || !/^https:\/\//.test(src)) throw new Error('yt-dlp: ' + (g.err || 'no url').trim().split('\n').pop().slice(0, 160));
  const tmp = path.join(DIR, cam.id + '.tmp.mp4'), out = path.join(DIR, cam.id + '.mp4');
  const f = await run('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-live_start_index', '-4', '-i', src, '-t', String(SECS), '-an',
    '-vf', 'scale=-2:360,fps=24', '-c:v', 'libx264', '-preset', 'veryfast', '-profile:v', 'main', '-pix_fmt', 'yuv420p', '-crf', '30', '-maxrate', '450k', '-bufsize', '900k',
    '-movflags', '+faststart', '-threads', '1', '-y', tmp], JOB_TIMEOUT);
  const st = fs.existsSync(tmp) ? fs.statSync(tmp) : null;
  if (f.code !== 0 || !st || st.size < 20e3) { try { fs.unlinkSync(tmp); } catch { } throw new Error('ffmpeg: ' + (f.err || 'empty').trim().split('\n').pop().slice(0, 160)); }
  fs.renameSync(tmp, out); return { file: out, t: Date.now(), bytes: st.size };
}
async function tick() {
  if (busy) return; const online = onlineFn() > 0 || Date.now() - lastReq < 5 * 60e3; if (!online) return;
  busy = true;
  try {
    if (!(await haveTools())) return; fs.mkdirSync(DIR, { recursive: true }); await refreshFeed();
    const due = cams.map(c => ({ c, k: clips.get(c.id) })).filter(({ k }) => !k || Date.now() - k.t > EVERY * Math.min(8, 1 + (k.fails || 0)))
      .sort((a, b) => ((a.k && a.k.t) || 0) - ((b.k && b.k.t) || 0))[0];
    if (!due) return;
    try { const r = await grab(due.c); clips.set(due.c.id, { ...r, fails: 0 }); }
    catch (e) { const k = clips.get(due.c.id) || { t: 0 }; clips.set(due.c.id, { ...k, t: Date.now(), err: e.message, fails: (k.fails || 0) + 1 }); console.warn('[aegis-clips]', due.c.id, e.message); }
  } finally { busy = false; }
}

function start(opts = {}) {
  if (opts.online) onlineFn = opts.online;
  if (!ON) return false;
  setInterval(() => tick().catch(() => { }), 30e3).unref(); setTimeout(() => tick().catch(() => { }), 5e3).unref();
  return true;
}
// HTTP: returns true when it handled the request
function handle(req, res, url) {
  if (url.pathname === '/aegis/clips') {
    const o = { enabled: ON, clips: {} }; if (ON) { lastReq = Date.now(); for (const [id, k] of clips) if (k.file && fs.existsSync(k.file)) o.clips[id] = { t: k.t, bytes: k.bytes }; }
    res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' }); res.end(JSON.stringify(o)); return true;
  }
  const m = url.pathname.match(/^\/aegis\/clip\/([a-z0-9-]{1,64})\.mp4$/i); if (!m) return false;
  const k = ON && clips.get(m[1]); if (!k || !k.file || !fs.existsSync(k.file)) { res.writeHead(404, { 'content-type': 'text/plain' }); res.end('no clip'); return true; }
  lastReq = Date.now();
  const size = fs.statSync(k.file).size, H = { 'content-type': 'video/mp4', 'accept-ranges': 'bytes', 'cache-control': 'public, max-age=60', 'x-content-type-options': 'nosniff', 'access-control-allow-origin': '*', 'cross-origin-resource-policy': 'cross-origin' };
  const r = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range || '');
  if (r) {
    let a = r[1] === '' ? Math.max(0, size - +r[2]) : +r[1], b = r[1] !== '' && r[2] !== '' ? Math.min(size - 1, +r[2]) : size - 1;
    if (!(a <= b) || a >= size) { res.writeHead(416, { 'content-range': `bytes */${size}` }); res.end(); return true; }
    res.writeHead(206, { ...H, 'content-range': `bytes ${a}-${b}/${size}`, 'content-length': b - a + 1 }); if (req.method === 'HEAD') return res.end(), true; fs.createReadStream(k.file, { start: a, end: b }).pipe(res); return true;
  }
  res.writeHead(200, { ...H, 'content-length': size }); if (req.method === 'HEAD') return res.end(), true; fs.createReadStream(k.file).pipe(res); return true;
}
module.exports = { start, handle, status: () => ({ enabled: ON, dir: DIR, tools, cams: cams.length, clips: [...clips].map(([id, k]) => ({ id, t: k.t, bytes: k.bytes, err: k.err })) }), _grab: grab, _run: run };
