import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {DatabaseSync} from 'node:sqlite';
import ts from 'typescript';

let source=await readFile(new URL('../worker/index.ts',import.meta.url),'utf8');
for(const name of ['intelligence','request-guards'])source=source.replace("'./"+name+"'","'"+new URL('../worker/'+name+'.ts',import.meta.url).href+"'");
const compiled=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText;
const worker=(await import('data:text/javascript;base64,'+Buffer.from(compiled).toString('base64'))).default;
const id='11111111-1111-4111-8111-111111111111';
function ledger(){
  const sqlite=new DatabaseSync(':memory:');
  sqlite.exec('CREATE TABLE ai_budget(id INTEGER PRIMARY KEY,remaining_cents INTEGER,requests_approved INTEGER,updated_at TEXT); INSERT INTO ai_budget VALUES(1,10000,0,NULL)');
  return {sqlite,prepare(sql){const stmt=sqlite.prepare(sql);return {run:async()=>stmt.run(),first:async()=>stmt.get()??null,bind:(...values)=>({first:async()=>stmt.get(...values)??null})};}};
}
const request=(body={question:'Hello',facts:null},token=true)=>new Request('https://soren.example/api/chat',{
  method:'POST',headers:{'content-type':'application/json',...(token?{authorization:'Bearer valid.token'}:{})},body:JSON.stringify(body)
});
test('chat protects provider calls and shared credits end to end',async t=>{
  const original=globalThis.fetch;let providerCalls=0;let identity={id,is_anonymous:false};
  globalThis.fetch=async(url,options)=>{
    if(String(url).includes('/auth/v1/user'))return Response.json(identity);
    assert.equal(String(url),'https://api.meta.ai/v1/chat/completions');
    assert.equal(options.headers.authorization,'Bearer TEST_SERVER_SECRET');
    providerCalls++;
    return Response.json({choices:[{message:{content:'A verified reply'}}]});
  };
  const env=()=>({AI_ENABLED:'true',MODEL_API_KEY:'TEST_SERVER_SECRET',AI_PHASE:'development',AI_BUDGET_DB:ledger(),ASSETS:{fetch:async()=>new Response('app')}});
  try{
    await t.test('missing sign-in, anonymous identities and malformed inputs spend nothing',async()=>{
      const e=env();
      assert.equal((await worker.fetch(request(undefined,false),e)).status,401);
      identity={id,is_anonymous:true};
      assert.equal((await worker.fetch(request(),e)).status,401);
      identity={id,is_anonymous:false};
      assert.equal((await worker.fetch(request({question:'x'.repeat(13000),facts:null}),e)).status,413);
      assert.equal((await worker.fetch(request({question:'',facts:null}),e)).status,400);
      assert.equal(providerCalls,0);
      assert.equal(e.AI_BUDGET_DB.sqlite.prepare('SELECT requests_approved FROM ai_budget').get().requests_approved,0);
    });
    await t.test('three allowed calls reserve shared credits; fourth is blocked before spending',async()=>{
      const e=env();
      for(let i=0;i<3;i++)assert.equal((await worker.fetch(request(),e)).status,200);
      const denied=await worker.fetch(request(),e);
      assert.equal(denied.status,429);assert.ok(Number(denied.headers.get('retry-after'))>=1);
      assert.equal(providerCalls,3);
      assert.equal(e.AI_BUDGET_DB.sqlite.prepare('SELECT requests_approved FROM ai_budget').get().requests_approved,3);
    });
    await t.test('storage errors, development cap and disabled AI all fail closed',async()=>{
      const before=providerCalls,e=env();
      e.AI_BUDGET_DB.sqlite.exec('UPDATE ai_budget SET requests_approved=100');
      assert.equal((await worker.fetch(request(),e)).status,429);
      e.AI_BUDGET_DB={prepare(){throw Error('offline')}};
      assert.equal((await worker.fetch(request(),e)).status,503);
      e.AI_ENABLED='false';
      assert.equal((await worker.fetch(request(),e)).status,503);
      assert.equal(providerCalls,before);
    });
    await t.test('protected routes reject non-POST requests',async()=>{
      assert.equal((await worker.fetch(new Request('https://soren.example/api/chat'),env())).status,405);
    });
  }finally{globalThis.fetch=original;}
});
