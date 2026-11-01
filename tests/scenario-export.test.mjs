import test from 'node:test';
import assert from 'node:assert/strict';
import { exportScenarioComparisons } from '../src/scenario-export.ts';
import { modelRevenueScenario } from '../src/prediction.ts';
const result=modelRevenueScenario({days:[{date:'2026-10-01',revenue:100},{date:'2026-10-03',revenue:200}],horizonDays:30,changePercent:10});
test('comparison export retains assumptions, missing margins and reporting gaps',()=>{
  const csv=exportScenarioComparisons([{name:'Product mix',horizon:30,change:10,margin:null,result}],'Actual report');
  assert.ok(csv.startsWith('\uFEFF'));
  assert.ok(csv.includes('"Product mix","Actual report","2026-10-01","2026-10-03","2","1","30","10","Unknown"'));
  assert.ok(csv.includes('"4500","4950","450","Unknown"'));
  assert.ok(csv.includes('not a validated prediction'));
});
test('comparison export quotes labels and neutralizes spreadsheet formulas',()=>{
  const csv=exportScenarioComparisons([{name:'=HYPERLINK("bad")',horizon:30,change:-10,margin:null,result}],' @SUM(1)');
  assert.ok(csv.includes('"\'=HYPERLINK(""bad"")"'));
  assert.ok(csv.includes('"\' @SUM(1)"'));
  assert.ok(csv.includes('"-10"'));
});
