'use strict';
const assert = require('node:assert/strict');
const { DatabaseSync } = require('node:sqlite');
const { createVisitStats, hashVid, etDay, etHourKey, TZ } = require('./visit-stats');

const db = new DatabaseSync(':memory:');
let now = Date.parse('2026-11-25T18:30:00-05:00'); // 6:30 PM ET
let online = 2;
const vs = createVisitStats({ db, cityCount: () => online, now: () => now, start: false });

assert.equal(TZ, 'America/New_York');
assert.equal(etDay(now), '2026-11-25');
assert.equal(etHourKey(now), '2026-11-25T18');

const a = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const b = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
assert.match(hashVid(a), /^[0-9a-f]{64}$/);
assert.notEqual(hashVid(a), hashVid(b));

assert.deepEqual(vs.record({ id: 'short' }), { ok: false, error: 'invalid_id' });
assert.equal(vs.record({ id: a, signedIn: false, ip: '1.1.1.1' }).ok, true);
assert.equal(vs.record({ id: a, signedIn: false, ip: '1.1.1.1' }).ok, true); // second session, same visitor
assert.equal(vs.record({ id: b, signedIn: true, ip: '2.2.2.2' }).ok, true);

let s = vs.summary({ days: 1 });
assert.equal(s.daily.length, 1);
assert.equal(s.daily[0].day, '2026-11-25');
assert.equal(s.daily[0].uniqueVisitors, 2);
assert.equal(s.daily[0].sessions, 3);
assert.equal(s.daily[0].uniqueGuest, 1);
assert.equal(s.daily[0].uniqueSigned, 1);
assert.equal(s.totals.uniqueVisitors, 2);
assert.equal(s.totals.sessions, 3);

// Same visitor signs in later the same day: counts as signed, not double unique
assert.equal(vs.record({ id: a, signedIn: true, ip: '1.1.1.1' }).ok, true);
s = vs.summary({ days: 1 });
assert.equal(s.daily[0].uniqueVisitors, 2);
assert.equal(s.daily[0].uniqueSigned, 2);
assert.equal(s.daily[0].uniqueGuest, 0);
assert.equal(s.daily[0].sessions, 4);

// Raw id must not appear in the database
const blob = db.prepare("SELECT group_concat(vid_hash,' ') h FROM visit_days").get().h;
assert.ok(!blob.includes(a) && !blob.includes(b), 'raw visitor id was stored');

online = 5;
assert.equal(vs.sample().n, 5);
s = vs.summary({ days: 1 });
assert.equal(s.daily[0].peak, 5);
assert.equal(s.totals.peak, 5);
assert.ok(s.hourly.some(h => h.hour === '2026-11-25T18' && h.peak === 5));
online = 3;
vs.sample();
assert.equal(vs.summary({ days: 1 }).daily[0].peak, 5, 'peak should be a max, not the last sample');

// Next ET day: new uniques, window unique stays 2 if same people
now = Date.parse('2026-11-26T09:00:00-05:00');
vs.record({ id: a, signedIn: true, ip: '1.1.1.1' });
online = 7;
vs.sample();
s = vs.summary({ days: 2 });
assert.equal(s.since, '2026-11-25');
assert.equal(s.until, '2026-11-26');
assert.equal(s.daily[0].uniqueVisitors, 2);
assert.equal(s.daily[1].uniqueVisitors, 1);
assert.equal(s.daily[1].peak, 7);
assert.equal(s.totals.uniqueVisitors, 2, 'same visitor on two days is one window unique');
assert.equal(s.totals.peak, 7);

// Prune rows older than ~90 days
now = Date.parse('2027-03-01T12:00:00-05:00');
db.prepare('INSERT INTO visit_days VALUES(?,?,?,?)').run('2026-11-01', hashVid('oldoldoldoldoldoldoldoldoldoldoo'), 0, 1);
db.prepare('INSERT INTO visit_daily VALUES(?,?,?,?,?)').run('2026-11-01', 1, 1, 0, 1);
vs.prune();
assert.equal(db.prepare("SELECT count(*) n FROM visit_days WHERE day='2026-11-01'").get().n, 0);
assert.equal(db.prepare("SELECT count(*) n FROM visit_daily WHERE day='2026-11-01'").get().n, 0);

// In-memory unique cap does not store the IP
const capIp = '9.9.9.9';
now = Date.parse('2027-03-01T12:00:00-05:00');
let accepted = 0, ignored = 0;
for (let i = 0; i < 40; i++) {
  const id = ('u' + i).padEnd(16, 'x');
  const r = vs.record({ id, ip: capIp });
  if (r.ignored) ignored++; else if (r.ok) accepted++;
}
assert.equal(accepted, 30);
assert.equal(ignored, 10);
const storedIps = db.prepare("SELECT sql FROM sqlite_master WHERE sql LIKE '%ip%'").all();
assert.equal(storedIps.length, 0, 'no ip column should exist');

vs.stop();
console.log('visit-stats ok');
