import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequestCache } from '../src/request-cache.ts';

test('shares concurrent requests and reuses fresh results', async () => {
  const cache = createRequestCache(); let calls = 0;
  const load = async () => { calls++; return { ok: true }; };
  const [a,b] = await Promise.all([cache.get('a',load), cache.get('a',load)]);
  assert.equal(calls,1); assert.equal(a,b);
  await cache.get('a',load); assert.equal(calls,1);
});
test('caller cancellation does not cancel another subscriber', async () => {
  const cache=createRequestCache(); const controller=new AbortController();
  let finish; const load=()=>new Promise(resolve=>{finish=resolve;});
  const first=cache.get('a',load,controller.signal);
  const second=cache.get('a',load);
  controller.abort(); await assert.rejects(first,{name:'AbortError'});
  finish(42); assert.equal(await second,42);
});
test('failures are retried instead of cached', async () => {
  const cache=createRequestCache();
  await assert.rejects(cache.get('a',async()=>{throw Error('offline');}));
  assert.equal(await cache.get('a',async()=>42),42);
});
test('clear prevents an older request from overwriting fresh data', async () => {
  const cache=createRequestCache(); let finish;
  const old=cache.get('a',()=>new Promise(resolve=>{finish=resolve;}));
  cache.clear(); await cache.get('a',async()=>2); finish(1); await old;
  assert.equal(await cache.get('a',async()=>3),2);
});
test('expired results and evicted entries load again', async () => {
  const cache=createRequestCache(0,1); let calls=0;
  const load=async()=>++calls;
  await cache.get('a',load); await cache.get('a',load); assert.equal(calls,2);
  const bounded=createRequestCache(30000,1);
  await bounded.get('a',load); await bounded.get('b',load); await bounded.get('a',load);
  assert.equal(calls,5);
});
test('pre-aborted requests do not start loading', async () => {
  const cache=createRequestCache(); let calls=0;
  await assert.rejects(cache.get('a',async()=>++calls,AbortSignal.abort()),{name:'AbortError'});
  assert.equal(calls,0);
});

test('endpoint freshness can outlive the default without persisting data', async () => {
  const cache=createRequestCache(0); let calls=0;
  const load=async()=>++calls;
  assert.equal(await cache.get('catalog',load,undefined,300000),1);
  assert.equal(await cache.get('catalog',load,undefined,300000),1);
  await cache.get('stock',load); await cache.get('stock',load);
  assert.equal(calls,3);
});
