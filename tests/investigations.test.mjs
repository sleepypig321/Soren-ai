import test from 'node:test';
import assert from 'node:assert/strict';
import { investigateRetail } from '../src/investigations.ts';

const day = (date, revenue, transactions, cogs) => ({ date, revenue, transactions, cogs });
const findings = (rows, costs=0) => Object.fromEntries(investigateRetail(rows, costs).map(x => [x.id,x]));

test('gross profit and modeled break-even use supplied costs, not revenue alone', () => {
  const result = findings([day('2026-10-01',100,5,60),day('2026-10-02',200,10,120)],60);
  assert.match(result.profit.observation,/Gross profit is \$120\.00/);
  assert.equal(result.profit.metric,'$60.00');
  assert.equal(result.breakeven.metric,'$150.00');
  assert.equal(result.basket.metric,'$20.00');
});

test('a zero-transaction report never invents an average ticket', () => {
  const result = findings([day('2026-10-01',0,0,0)]);
  assert.equal(result.basket.metric,'N/A');
  assert.match(result.basket.calculation,/undefined/);
  assert.equal(result.breakeven.metric,'N/A');
});

test('missing calendar dates are flagged without pretending the store was open', () => {
  const result = findings([day('2026-10-01',100,5,60),day('2026-10-03',80,4,40)]);
  assert.equal(result.coverage.metric,'1 MISSING DAY');
  assert.match(result.coverage.limitation,/legitimate closures/);
});

test('sales fluctuations do not get presented as proven causes', () => {
  const result = findings([
    day('2026-10-01',50,2,25),day('2026-10-02',75,3,40),
    day('2026-10-03',100,4,50),day('2026-10-04',150,5,70)
  ]);
  assert.match(result.trend.limitation,/does not establish why/);
  assert.match(result.range.limitation,/not proof of seasonality/);
});
