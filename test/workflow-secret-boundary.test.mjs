// Every job that receives the Fly credential must be main-only and behind the protected environment.
import fs from 'node:fs'; import assert from 'node:assert';
for (const f of fs.readdirSync('.github/workflows')) {
  if (f === 'deploy.yml') continue;
  const jobs = fs.readFileSync('.github/workflows/' + f, 'utf8').split(/\n  (?=[a-z][\w-]*:\n)/);
  for (const j of jobs.filter(j => /secrets\.FLY_/.test(j))) {
    assert.match(j, /environment: production/, f + ': credential outside protected environment');
    assert.match(j, /github\.ref == 'refs\/heads\/main'/, f + ': credential job not main-only');
  }
}
console.log('workflow secret boundary: ok');
