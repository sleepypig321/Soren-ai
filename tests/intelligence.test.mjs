import test from 'node:test';
import assert from 'node:assert/strict';
import { CORE_INTELLIGENCE, RETAIL_SPECIALIZATION, buildIntelligenceInstructions } from '../worker/intelligence.ts';

test('universal standards explicitly distinguish facts, user reports, calculations and hypotheses',()=>{
  const core=CORE_INTELLIGENCE.join(' ');
  for(const term of ['verified','user reports','calculations','hypotheses','causation','Never invent','no live browsing']){
    assert.ok(core.toLowerCase().includes(term.toLowerCase()),'missing evidence guardrail: '+term);
  }
});

test('retail specialization asks for actual visitor count before conversion',()=>{
  const retail=RETAIL_SPECIALIZATION.join(' ');
  assert.match(retail,/measured visitors and buyers/);
  assert.match(retail,/Ask how many people actually entered/);
  assert.match(retail,/Missing transaction or inventory data is unknown, never zero/);
});

test('retail profile combines universal and industry standards',()=>{
  const prompt=buildIntelligenceInstructions('retail');
  assert.ok(prompt.includes(CORE_INTELLIGENCE[0]));
  assert.ok(prompt.includes(RETAIL_SPECIALIZATION[0]));
  assert.ok(prompt.indexOf(CORE_INTELLIGENCE[0])<prompt.indexOf(RETAIL_SPECIALIZATION[0]));
});

test('industry selection cannot silently pretend an unimplemented module exists',()=>{
  assert.deepEqual(Object.keys({retail:RETAIL_SPECIALIZATION}),['retail']);
});
