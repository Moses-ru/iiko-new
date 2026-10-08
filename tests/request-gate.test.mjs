import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRequestGate, mapSequential} from '../src/request-gate.ts';

test('bounds concurrent requests and drains after failure', async()=>{
  const gate=createRequestGate(2);let active=0,max=0;const release=[];
  const jobs=Array.from({length:4},(_,i)=>gate.run('a',async()=>{
    active++;max=Math.max(max,active);await new Promise(r=>release.push(r));active--;
    if(i===1)throw Error('offline');return i;
  }));
  const settled=Promise.allSettled(jobs);await new Promise(r=>setImmediate(r));
  assert.equal(release.length,2);release.splice(0).forEach(r=>r());await new Promise(r=>setImmediate(r));
  assert.equal(release.length,2);release.splice(0).forEach(r=>r());
  const result=await settled;assert.equal(max,2);assert.equal(result[1].status,'rejected');assert.equal(result[3].value,3);
});
test('token failure pauses queued work and manual repeats, isolated by connection',async()=>{
  let time=0,calls=0;const gate=createRequestGate(1,1000,()=>time);
  const first=gate.run('a',async()=>{calls++;throw Error('iikoServer API auth did not return an access token');});
  const queued=gate.run('a',async()=>++calls);
  await Promise.allSettled([first,queued]);assert.equal(calls,1);
  await assert.rejects(gate.run('a',async()=>++calls),/Следующая попытка/);assert.equal(calls,1);
  assert.equal(await gate.run('b',async()=>42),42);
  time=1001;assert.equal(await gate.run('a',async()=>++calls),2);
});
test('sequential store loading stops after an error or cancellation',async()=>{
  const seen=[];await assert.rejects(mapSequential([1,2,3],async i=>{seen.push(i);if(i===2)throw Error('failed');return i;}));
  assert.deepEqual(seen,[1,2]);
  const controller=new AbortController();const visited=[];
  await assert.rejects(mapSequential([1,2,3],async i=>{visited.push(i);controller.abort();return i;},controller.signal),{name:'AbortError'});
  assert.deepEqual(visited,[1]);
});
