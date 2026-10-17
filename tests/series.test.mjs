import { test } from 'node:test';
import assert from 'node:assert/strict';
import { axisMax, daySpan, dailyTotals, fitSeries, groupByWeek, pricePoints } from '../src/series.ts';

test('дни периода идут подряд, включая границы', () => {
  assert.deepEqual(daySpan('2026-10-01', '2026-10-04'), ['2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04']);
});

test('перевёрнутый или пустой период даёт пустой ряд', () => {
  assert.deepEqual(daySpan('2026-10-04', '2026-10-01'), []);
  assert.deepEqual(daySpan('', ''), []);
});

test('суммы складываются по дням, пустые дни остаются нулями', () => {
  const rows = [
    { date: '2026-10-01T12:00:00', sum: 1000 },
    { date: '2026-10-01', sum: 500 },
    { date: '2026-10-03', sum: 700 },
  ];
  assert.deepEqual(dailyTotals(rows, '2026-10-01', '2026-10-03'), [
    { date: '2026-10-01', value: 1500, count: 2 },
    { date: '2026-10-02', value: 0, count: 0 },
    { date: '2026-10-03', value: 700, count: 1 },
  ]);
});

test('накладные вне периода не попадают в ряд', () => {
  const rows = [{ date: '2026-09-30', sum: 999 }, { date: '2026-10-01', sum: 10 }];
  const series = dailyTotals(rows, '2026-10-01', '2026-10-01');
  assert.deepEqual(series, [{ date: '2026-10-01', value: 10, count: 1 }]);
});

test('без периода ряд строится по датам самих накладных', () => {
  const series = dailyTotals([{ date: '2026-10-05', sum: 3 }, { date: '2026-10-01', sum: 1 }], '', '');
  assert.deepEqual(series.map((point) => point.date), ['2026-10-01', '2026-10-05']);
});

test('нечисловые суммы считаются нулём', () => {
  const series = dailyTotals([{ date: '2026-10-01', sum: Number.NaN }, { date: '2026-10-01' }], '2026-10-01', '2026-10-01');
  assert.deepEqual(series, [{ date: '2026-10-01', value: 0, count: 2 }]);
});

test('недели начинаются с понедельника', () => {
  // 2026-10-01 — четверг, 2026-10-05 — понедельник следующей недели.
  const weeks = groupByWeek(dailyTotals(
    [{ date: '2026-10-01', sum: 100 }, { date: '2026-10-04', sum: 50 }, { date: '2026-10-05', sum: 7 }],
    '2026-10-01',
    '2026-10-05',
  ));
  assert.deepEqual(weeks, [
    { date: '2026-09-28', value: 150, count: 2 },
    { date: '2026-10-05', value: 7, count: 1 },
  ]);
});

test('длинный период сворачивается в недели, короткий остаётся по дням', () => {
  const long = dailyTotals([], '2026-01-01', '2026-06-30');
  assert.equal(fitSeries(long).step, 'week');
  const short = dailyTotals([], '2026-10-01', '2026-10-14');
  assert.equal(fitSeries(short).step, 'day');
  assert.equal(fitSeries(short).points.length, 14);
});

test('сумма при сворачивании в недели не теряется', () => {
  const daily = dailyTotals(
    Array.from({ length: 120 }, (_, index) => ({ date: daySpan('2026-01-01', '2026-04-30')[index], sum: 10 })),
    '2026-01-01',
    '2026-04-30',
  );
  const fitted = fitSeries(daily);
  const total = (points) => points.reduce((sum, point) => sum + point.value, 0);
  assert.equal(fitted.step, 'week');
  assert.equal(total(fitted.points), total(daily));
});

test('цена за день усредняется по накладным', () => {
  const points = pricePoints([
    { date: '2026-10-01', price: 100 },
    { date: '2026-10-01', price: 120 },
    { date: '2026-10-03', price: 130 },
  ]);
  assert.deepEqual(points.map((point) => [point.date, point.price]), [['2026-10-01', 110], ['2026-10-03', 130]]);
});

test('точки цены идут по возрастанию даты', () => {
  const points = pricePoints([{ date: '2026-10-09', price: 2 }, { date: '2026-10-02', price: 1 }]);
  assert.deepEqual(points.map((point) => point.date), ['2026-10-02', '2026-10-09']);
});

test('битые строки цен отбрасываются', () => {
  assert.deepEqual(pricePoints([{ date: '', price: 5 }, { date: '2026-10-01', price: Number.NaN }]), []);
});

test('верхняя граница оси округляется вверх', () => {
  assert.equal(axisMax([0]), 1);
  assert.equal(axisMax([7]), 10);
  assert.equal(axisMax([1200]), 2000);
  assert.equal(axisMax([34500]), 50000);
  assert.equal(axisMax([]), 1);
});
