import { test } from 'node:test';
import assert from 'node:assert/strict';
import { inventoryMetrics, warehouseShares } from '../src/analytics-model.ts';
test('turnover uses average inventory and inclusive period days', () => {
  const result = inventoryMetrics({openValue:100,closeValue:200,salesCost:300,writeoffCost:100},'2026-10-01','2026-10-03');
  assert.equal(result.days,3); assert.equal(result.turns,2); assert.equal(result.coverageDays,1.5);
  assert.equal(result.changePercent,100); assert.equal(result.writeoffPercent,25);
});
test('missing data and zero bases do not create misleading percentages', () => {
  assert.equal(inventoryMetrics({},'2026-10-01','2026-10-01').turns,null);
  const result = inventoryMetrics({openValue:0,closeValue:0,salesCost:0,writeoffCost:0},'2026-10-01','2026-10-01');
  assert.equal(result.changePercent,null); assert.equal(result.coverageDays,null); assert.equal(result.writeoffPercent,null);
});
test('warehouse shares exclude negative balances from the positive total', () => {
  const rows=warehouseShares([{closeValue:300},{closeValue:100},{closeValue:-50}]);
  assert.deepEqual(rows.map(row=>row.share),[75,25,0]);
  assert.equal(warehouseShares([{closeValue:0}])[0].share,null);
});
