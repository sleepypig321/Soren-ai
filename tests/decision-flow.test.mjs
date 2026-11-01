import test from 'node:test';
import assert from 'node:assert/strict';
import {compareReportingWeeks} from '../src/reporting-weeks.ts';
import {scenarioQuestion} from '../src/scenario-question.ts';
import {modelRevenueScenario} from '../src/prediction.ts';

const days=Array.from({length:14},(_,i)=>({date:'2026-10-'+String(i+1).padStart(2,'0'),revenue:i<7?100:150}));
test('weekly comparison uses adjacent calendar windows regardless of input order',()=>{
  const result=compareReportingWeeks([...days].reverse(),'2026-10-31');
  assert.equal(result.priorTotal,700);assert.equal(result.recentTotal,1050);
  assert.equal(result.changePercent,50);assert.equal(result.recent[0].date,'2026-10-08');
});
test('14 reported records with a missing date cannot become a weekly growth claim',()=>{
  const gap=days.map(day=>({...day}));gap[13].date='2026-10-15';
  assert.equal(compareReportingWeeks(gap,'2026-10-31'),null);
  const duplicate=days.map(day=>({...day}));duplicate[13].date='2026-10-13';
  assert.equal(compareReportingWeeks(duplicate,'2026-10-31'),null);
});
test('current and future dates cannot substitute for complete historical days',()=>{
  assert.equal(compareReportingWeeks(days,'2026-10-14'),null);
  assert.equal(compareReportingWeeks([...days,{date:'2026-11-01',revenue:99999}],'2026-10-31').recentTotal,1050);
});
test('zero or negative prior net sales do not produce misleading growth percentages',()=>{
  const zero=days.map((day,i)=>({...day,revenue:i<7?0:150}));
  assert.equal(compareReportingWeeks(zero,'2026-10-31').changePercent,null);
  zero[0].revenue=-100;
  assert.equal(compareReportingWeeks(zero,'2026-10-31').changePercent,null);
});
test('scenario draft preserves assumptions and limitations within the chat limit',()=>{
  const result=modelRevenueScenario({days,horizonDays:30,changePercent:10});
  const draft=scenarioQuestion({name:'Revised mix',horizon:30,change:10,margin:null,result});
  assert.ok(draft.length<=600);
  for(const text of ['Revised mix','2026-10-01','2026-10-14','30 future reporting days','10% revenue change','gross margin unknown','not predictions','measurable test'])assert.ok(draft.includes(text),text);
});
test('large scenario values and a long name still fit the reviewable chat draft',()=>{
  const result=modelRevenueScenario({days:[{date:'2026-10-01',revenue:1e9}],horizonDays:365,changePercent:500,grossMarginPercent:100});
  const draft=scenarioQuestion({name:'A'.repeat(60),horizon:365,change:500,margin:100,result});
  assert.ok(draft.length<=600,'draft length '+draft.length);
  assert.ok(draft.endsWith('measurable test.'));
});
