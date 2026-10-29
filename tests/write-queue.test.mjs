import test from 'node:test';
import assert from 'node:assert/strict';
import { createScopedWriteQueue } from '../src/write-queue.ts';

const deferred=()=>{
  let resolve;
  const promise=new Promise(done=>{resolve=done;});
  return {promise,resolve};
};

test('successive writes to one import are processed in order',async()=>{
  const queue=createScopedWriteQueue();
  const gate=deferred();
  const events=[];
  const first=queue.run('owner:business:clover',async()=>{events.push('first-start');await gate.promise;events.push('first-finish');});
  const second=queue.run('owner:business:clover',async()=>{events.push('second-start');});
  await Promise.resolve();await Promise.resolve();
  assert.deepEqual(events,['first-start']);
  gate.resolve();
  await Promise.all([first,second]);
  assert.deepEqual(events,['first-start','first-finish','second-start']);
});

test('a failed write does not prevent the next save',async()=>{
  const queue=createScopedWriteQueue();
  const first=queue.run('key',async()=>{throw new Error('network offline');});
  const second=queue.run('key',async()=>42);
  await assert.rejects(first,/network offline/);
  assert.equal(await second,42);
});

test('separate business scopes are not mutually blocked',async()=>{
  const queue=createScopedWriteQueue();
  const gate=deferred();
  const first=queue.run('business-A',async()=>{await gate.promise;});
  const second=queue.run('business-B',async()=> 'ready');
  assert.equal(await second,'ready');
  gate.resolve();
  await first;
});
