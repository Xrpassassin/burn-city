import test from 'node:test';
import assert from 'node:assert/strict';
import { createContinuousInput } from '../client/arena/homefront-continuous-input.mjs';

const flush = async () => { for (let i = 0; i < 6; i++) await Promise.resolve(); };
const error = message => Promise.reject(new Error(message));
const boot = send => {
  const reasons = [];
  const c = createContinuousInput({ send, onUnavailable: r => reasons.push(r) });
  c.sync({ enabled:true, nextSequence:4, readyInMs:0 }, {x:0,z:0}, 0);
  return {c,reasons};
};

test('server-rejected cooldown retries exact same sequence', async () => {
  const sent = [];
  const {c,reasons} = boot(async cmd => {
    sent.push(cmd.sequence);
    if (sent.length === 1) return error('move_cooldown');
    return {inputAck:{sequence:cmd.sequence,x:1,z:0}, self:{x:1,z:0}};
  });
  c.step({x:1,z:0},false,200,0.016);
  await flush();
  c.step({x:1,z:0},false,450,0.016);
  await flush();
  assert.deepEqual(sent,[4,4]);
  assert.equal(c.enabled,true);
  assert.deepEqual(reasons,[]);
});

test('ambiguous network failure disables speculation and requires fresh handshake', async () => {
  const {c,reasons} = boot(() => error('Failed to fetch'));
  c.step({x:1,z:0},false,200,0.016);
  await flush();
  assert.equal(c.enabled,false);
  assert.deepEqual(reasons,['movement_connection_lost']);
  assert.equal(c.position(),null);
  c.sync({enabled:true,nextSequence:5}, {x:7,z:7},400);
  assert.equal(c.enabled,false);
});

test('authenticated server disabling movement disables local prediction', () => {
  const {c,reasons} = boot(() => Promise.resolve({}));
  c.sync({enabled:false,nextSequence:4},{x:0,z:0},100);
  assert.equal(c.enabled,false);
  assert.deepEqual(reasons,['server_disabled']);
});
