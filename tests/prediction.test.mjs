import test from 'node:test';
import assert from 'node:assert/strict';
import { modelRevenueScenario } from '../src/prediction.ts';
const days=[{date:'2026-10-01',revenue:100},{date:'2026-10-02',revenue:200}];

test('scenario is arithmetic on observed days and declared assumptions',()=>{
  const m=modelRevenueScenario({days,horizonDays:10,changePercent:20,grossMarginPercent:40});
  assert.ok(m);
  assert.equal(m.baselinePerDay,150);
  assert.equal(m.baselineRevenue,1500);
  assert.equal(m.scenarioRevenue,1800);
  assert.equal(m.revenueDifference,300);
  assert.equal(m.scenarioGrossProfit,720);
});

test('missing margin remains unknown rather than imagined',()=>{
  const m=modelRevenueScenario({days,horizonDays:30,changePercent:0});
  assert.equal(m?.scenarioGrossProfit,null);
});

test('reporting gaps are visible instead of imputed as zero revenue',()=>{
  const m=modelRevenueScenario({days:[days[0],{date:'2026-10-04',revenue:200}],horizonDays:10,changePercent:0});
  assert.equal(m?.calendarGaps,2);
  assert.equal(m?.baselinePerDay,150);
});

test('invalid assumptions and missing data cannot generate forecasts',()=>{
  assert.equal(modelRevenueScenario({days:[],horizonDays:30,changePercent:20}),null);
  assert.equal(modelRevenueScenario({days,horizonDays:0,changePercent:20}),null);
  assert.equal(modelRevenueScenario({days,horizonDays:30,changePercent:-120}),null);
  assert.equal(modelRevenueScenario({days,horizonDays:30,changePercent:10,grossMarginPercent:180}),null);
  assert.equal(modelRevenueScenario({days:[days[0],days[0]],horizonDays:30,changePercent:0}),null);
});
