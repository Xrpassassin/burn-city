// Anonymous city visit/session counts + peak concurrency. No wallets, IPs, or raw visitor ids are stored.
// Client sends a random localStorage id once per tab session; we hash it and roll up daily/hourly totals.
const crypto = require('crypto');

const TZ = 'America/New_York';
const RETAIN_DAYS = 90;
const VID_RE = /^[A-Za-z0-9_-]{16,64}$/;
const HASH_PREFIX = 'bc-visit-v1\0';
const NEW_UNIQUES_PER_IP_DAY = 30;
const SESSIONS_PER_IP_DAY = 80;

const etParts = (ms, nowFn) => {
  const t = typeof ms === 'number' ? ms : (nowFn || Date.now)();
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', hourCycle: 'h23'
  }).formatToParts(new Date(t));
  const g = t => parts.find(p => p.type === t).value;
  return { day: `${g('year')}-${g('month')}-${g('day')}`, hour: g('hour') };
};
const etDay = (ms, nowFn) => etParts(ms, nowFn).day;
const etHourKey = (ms, nowFn) => { const p = etParts(ms, nowFn); return p.day + 'T' + p.hour; };

const hashVid = id => crypto.createHash('sha256').update(HASH_PREFIX + String(id)).digest('hex');
const hashIp = ip => crypto.createHash('sha256').update('bc-visit-ip\0' + String(ip || '')).digest('hex').slice(0, 16);

function addDays(day, n) {
  // day is YYYY-MM-DD interpreted as a calendar date; shift by n midnights in UTC then re-format is wrong for ET.
  // Parse as UTC noon and add days, then the YYYY-MM-DD string still shifts correctly as a calendar date.
  const [y, m, d] = day.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + n, 12));
  return dt.toISOString().slice(0, 10);
}

function createVisitStats({ db, cityCount = () => 0, now = Date.now, sampleMs = 60e3, start = true } = {}) {
  if (!db) throw new Error('visit_stats_db_required');
  db.exec(`CREATE TABLE IF NOT EXISTS visit_days (
      day TEXT NOT NULL,
      vid_hash TEXT NOT NULL,
      signed INTEGER NOT NULL DEFAULT 0,
      first_ts INTEGER NOT NULL,
      PRIMARY KEY (day, vid_hash)
    );
    CREATE TABLE IF NOT EXISTS visit_daily (
      day TEXT PRIMARY KEY,
      sessions INTEGER NOT NULL DEFAULT 0,
      unique_visitors INTEGER NOT NULL DEFAULT 0,
      unique_signed INTEGER NOT NULL DEFAULT 0,
      unique_guest INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS visit_peak_daily (
      day TEXT PRIMARY KEY,
      peak INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS visit_peak_hourly (
      hour TEXT PRIMARY KEY,
      peak INTEGER NOT NULL DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS visit_days_day_idx ON visit_days(day);`);

  const st = {
    getDay: db.prepare('SELECT signed FROM visit_days WHERE day=? AND vid_hash=?'),
    insDay: db.prepare('INSERT INTO visit_days(day,vid_hash,signed,first_ts) VALUES(?,?,?,?)'),
    upSigned: db.prepare('UPDATE visit_days SET signed=1 WHERE day=? AND vid_hash=? AND signed=0'),
    ensDaily: db.prepare('INSERT INTO visit_daily(day,sessions,unique_visitors,unique_signed,unique_guest) VALUES(?,0,0,0,0) ON CONFLICT(day) DO NOTHING'),
    incSess: db.prepare('UPDATE visit_daily SET sessions=sessions+1 WHERE day=?'),
    incUnique: db.prepare('UPDATE visit_daily SET unique_visitors=unique_visitors+1, unique_signed=unique_signed+?, unique_guest=unique_guest+? WHERE day=?'),
    upgrade: db.prepare('UPDATE visit_daily SET unique_signed=unique_signed+1, unique_guest=unique_guest-1 WHERE day=? AND unique_guest>0'),
    daily: db.prepare('SELECT day,sessions,unique_visitors,unique_signed,unique_guest FROM visit_daily WHERE day>=? AND day<=? ORDER BY day'),
    windowUniques: db.prepare('SELECT COUNT(DISTINCT vid_hash) n FROM visit_days WHERE day>=? AND day<=?'),
    windowSigned: db.prepare('SELECT COUNT(DISTINCT vid_hash) n FROM visit_days WHERE day>=? AND day<=? AND signed=1'),
    windowGuest: db.prepare('SELECT COUNT(DISTINCT vid_hash) n FROM visit_days WHERE day>=? AND day<=? AND signed=0'),
    windowSess: db.prepare('SELECT COALESCE(SUM(sessions),0) n FROM visit_daily WHERE day>=? AND day<=?'),
    peakDay: db.prepare('SELECT peak FROM visit_peak_daily WHERE day=?'),
    peakDays: db.prepare('SELECT day,peak FROM visit_peak_daily WHERE day>=? AND day<=? ORDER BY day'),
    peakMax: db.prepare('SELECT COALESCE(MAX(peak),0) n FROM visit_peak_daily WHERE day>=? AND day<=?'),
    ensPeakDay: db.prepare('INSERT INTO visit_peak_daily(day,peak) VALUES(?,?) ON CONFLICT(day) DO UPDATE SET peak=MAX(peak,excluded.peak)'),
    ensPeakHour: db.prepare('INSERT INTO visit_peak_hourly(hour,peak) VALUES(?,?) ON CONFLICT(hour) DO UPDATE SET peak=MAX(peak,excluded.peak)'),
    hours: db.prepare('SELECT hour,peak FROM visit_peak_hourly WHERE hour>=? AND hour<? ORDER BY hour'),
    pruneDays: db.prepare('DELETE FROM visit_days WHERE day<?'),
    pruneDaily: db.prepare('DELETE FROM visit_daily WHERE day<?'),
    prunePeakDay: db.prepare('DELETE FROM visit_peak_daily WHERE day<?'),
    prunePeakHour: db.prepare('DELETE FROM visit_peak_hourly WHERE hour<?')
  };

  // In-memory anti-inflation caps. Keys are hashed; the map is wiped when the ET day rolls.
  let capDay = '';
  const capNew = new Map();
  const capSess = new Map();
  let lastPrune = 0;
  let timer = null;

  const stamp = () => now();
  const cutoffDay = (t) => addDays(etDay(t, stamp), -RETAIN_DAYS);

  function prune(t = stamp()) {
    const cut = cutoffDay(t);
    st.pruneDays.run(cut);
    st.pruneDaily.run(cut);
    st.prunePeakDay.run(cut);
    st.prunePeakHour.run(cut + 'T00');
    lastPrune = t;
  }
  function maybePrune(t) {
    if (t - lastPrune > 6 * 3600e3) prune(t);
  }

  function resetCaps(day) {
    if (capDay === day) return;
    capDay = day;
    capNew.clear();
    capSess.clear();
  }

  function record({ id, signedIn = false, ip } = {}) {
    const t = stamp();
    maybePrune(t);
    if (typeof id !== 'string' || !VID_RE.test(id)) return { ok: false, error: 'invalid_id' };
    const day = etDay(t, stamp);
    const vidHash = hashVid(id);
    const signed = signedIn ? 1 : 0;
    resetCaps(day);
    const ik = hashIp(ip);
    const sessN = (capSess.get(ik) || 0) + 1;
    if (sessN > SESSIONS_PER_IP_DAY) return { ok: true, ignored: 'rate' };
    capSess.set(ik, sessN);

    st.ensDaily.run(day);
    const existing = st.getDay.get(day, vidHash);
    if (!existing) {
      const fresh = (capNew.get(ik) || 0) + 1;
      if (fresh > NEW_UNIQUES_PER_IP_DAY) return { ok: true, ignored: 'rate' };
      capNew.set(ik, fresh);
      st.insDay.run(day, vidHash, signed, t);
      st.incUnique.run(signed, signed ? 0 : 1, day);
    } else if (!existing.signed && signed) {
      st.upSigned.run(day, vidHash);
      st.upgrade.run(day);
    }
    st.incSess.run(day);
    return { ok: true };
  }

  function sample() {
    const t = stamp();
    maybePrune(t);
    let n = 0;
    try { n = Number(cityCount()) || 0; } catch { return { ok: false }; }
    if (!Number.isFinite(n) || n < 0) n = 0;
    n = Math.min(100000, n | 0);
    const day = etDay(t, stamp);
    const hour = etHourKey(t, stamp);
    st.ensPeakDay.run(day, n);
    st.ensPeakHour.run(hour, n);
    return { ok: true, n, day, hour };
  }

  function summary({ days = 30 } = {}) {
    const t = stamp();
    const nDays = Math.max(1, Math.min(RETAIN_DAYS, Number(days) || 30));
    const until = etDay(t, stamp);
    const since = addDays(until, 1 - nDays);
    const dailyRows = st.daily.all(since, until);
    const peaks = new Map(st.peakDays.all(since, until).map(r => [r.day, r.peak]));
    const daily = [];
    // Fill gaps so a quiet day still appears with zeros if we have a peak sample, or skip empty? Include every calendar day in range.
    for (let i = 0; i < nDays; i++) {
      const day = addDays(since, i);
      const row = dailyRows.find(r => r.day === day);
      daily.push({
        day,
        uniqueVisitors: row ? row.unique_visitors : 0,
        sessions: row ? row.sessions : 0,
        uniqueSigned: row ? row.unique_signed : 0,
        uniqueGuest: row ? row.unique_guest : 0,
        peak: peaks.get(day) || 0
      });
    }
    const hourTo = addDays(until, 1) + 'T00';
    const hourly = st.hours.all(since + 'T00', hourTo).map(r => ({ hour: r.hour, peak: r.peak }));
    const uniqueVisitors = st.windowUniques.get(since, until).n;
    const uniqueSigned = st.windowSigned.get(since, until).n;
    const uniqueGuest = st.windowGuest.get(since, until).n;
    return {
      timezone: TZ,
      days: nDays,
      since,
      until,
      totals: {
        uniqueVisitors,
        sessions: st.windowSess.get(since, until).n,
        uniqueSigned,
        uniqueGuest,
        peak: st.peakMax.get(since, until).n
      },
      daily,
      hourly
    };
  }

  if (start && sampleMs > 0) {
    try { sample(); } catch {}
    timer = setInterval(() => { try { sample(); } catch {} }, sampleMs);
    if (timer.unref) timer.unref();
  }

  function stop() { if (timer) { clearInterval(timer); timer = null; } }

  return { record, sample, summary, prune, stop, tz: TZ };
}

module.exports = { createVisitStats, etDay, etHourKey, hashVid, VID_RE, RETAIN_DAYS, TZ };
