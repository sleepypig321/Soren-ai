import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { reserveUserRequest,readChatJSON } from '../worker/request-guards.ts';

const alice='11111111-1111-4111-8111-111111111111',bob='22222222-2222-4222-8222-222222222222';
function database(){
  const sqlite=new DatabaseSync(':memory:');
  return {prepare(sql){
    const stmt=sqlite.prepare(sql);
    return {run:async()=>stmt.run(),first:async()=>stmt.get()??null,
      bind:(...values)=>({first:async()=>stmt.get(...values)??null})};
  }};
}
test('persistent account limiter blocks fourth request and isolates accounts and minute resets',async()=>{
  const db=database(),time=Date.UTC(2026,9,31,12,0,0);
  const results=await Promise.all(Array.from({length:4},()=>reserveUserRequest(db,alice,time)));
  assert.equal(results.filter(r=>r.allowed).length,3);
  assert.equal(results[3].retryAfter,60);
  assert.equal((await reserveUserRequest(db,bob,time)).allowed,true);
  assert.equal((await reserveUserRequest(db,alice,time+60000)).allowed,true);
});
test('daily cap survives new minute buckets and resets at UTC day boundary',async()=>{
  const db=database(),time=Date.UTC(2026,9,31,12);
  for(let i=0;i<20;i++)assert.equal((await reserveUserRequest(db,alice,time+i*60000)).allowed,true);
  const denied=await reserveUserRequest(db,alice,time+20*60000);
  assert.equal(denied.allowed,false);assert.ok(denied.retryAfter>60);
  assert.equal((await reserveUserRequest(db,alice,time+86400000)).allowed,true);
});
test('limiter fails closed on storage failure or unverified identity',async()=>{
  await assert.rejects(reserveUserRequest({prepare(){throw Error('offline')}},alice));
  await assert.rejects(reserveUserRequest(database(),'spoofed-user'));
});
const req=(body,headers={})=>new Request('https://soren.example/api/chat',{method:'POST',headers:{'content-type':'application/json',...headers},body});
test('actual streamed bytes are capped even without Content-Length or with a false header',async()=>{
  const payload=JSON.stringify({question:'x'.repeat(13000)});
  for(const headers of [{},{'content-length':'10'}]){
    await assert.rejects(readChatJSON(req(payload,headers)),error=>error.status===413);
  }
  assert.deepEqual(await readChatJSON(req('{"question":"hello"}')),{question:'hello'});
});
test('invalid JSON and unsupported content types are rejected',async()=>{
  await assert.rejects(readChatJSON(req('{')),error=>error.status===400);
  await assert.rejects(readChatJSON(req('{}',{'content-type':'text/plain'})),error=>error.status===415);
});
