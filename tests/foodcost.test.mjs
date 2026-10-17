import { test } from 'node:test';
import assert from 'node:assert/strict';
import { abcRows, abcSummary, foodcostRows, foodcostSummary } from '../src/foodcost.ts';

test('фудкост считается как доля себестоимости в цене меню', () => {
  const [row] = foodcostRows([{ id: '1', name: 'Бургер', menuPrice: 600, costPrice: 188 }]);
  assert.equal(Math.round(row.foodcost * 10) / 10, 31.3);
  assert.equal(row.margin, 412);
});

test('позиции без цены меню или себестоимости пропускаются', () => {
  const rows = foodcostRows([
    { id: '1', name: 'Есть обе', menuPrice: 100, costPrice: 30 },
    { id: '2', name: 'Нет себестоимости', menuPrice: 100 },
    { id: '3', name: 'Нет цены меню', costPrice: 30 },
    { id: '4', name: 'Пустые', menuPrice: null, costPrice: null },
  ]);
  assert.deepEqual(rows.map((row) => row.name), ['Есть обе']);
});

test('цена меню, помеченная недоступной, не используется', () => {
  const rows = foodcostRows([{ id: '1', name: 'Блюдо', menuPrice: 500, costPrice: 100, menuPriceStatus: 'unavailable' }]);
  assert.deepEqual(rows, []);
});

test('нулевая цена меню не даёт деления на ноль', () => {
  assert.deepEqual(foodcostRows([{ id: '1', name: 'Блюдо', menuPrice: 0, costPrice: 50 }]), []);
});

test('худший фудкост идёт первым', () => {
  const rows = foodcostRows([
    { id: '1', name: 'Хороший', menuPrice: 1000, costPrice: 200 },
    { id: '2', name: 'Плохой', menuPrice: 300, costPrice: 200 },
    { id: '3', name: 'Средний', menuPrice: 500, costPrice: 200 },
  ]);
  assert.deepEqual(rows.map((row) => row.name), ['Плохой', 'Средний', 'Хороший']);
});

test('средний фудкост взвешен по цене, а не по числу позиций', () => {
  const rows = foodcostRows([
    { id: '1', name: 'Дорогое', menuPrice: 1000, costPrice: 300 },
    { id: '2', name: 'Дешёвое', menuPrice: 100, costPrice: 60 },
  ]);
  const summary = foodcostSummary(rows);
  // 360 / 1100 = 32,7%, а не среднее от 30% и 60%.
  assert.equal(Math.round(summary.average * 10) / 10, 32.7);
  assert.equal(summary.aboveTarget, 1);
  assert.equal(summary.worst.name, 'Дешёвое');
});

test('пустой каталог не ломает сводку', () => {
  assert.deepEqual(foodcostSummary([]), { count: 0, average: null, aboveTarget: 0, worst: null });
});

test('ABC делит по накопленной доле 80 и 95 процентов', () => {
  const rows = abcRows([
    { id: 'a', name: 'Говядина', value: 800 },
    { id: 'b', name: 'Сыр', value: 150 },
    { id: 'c', name: 'Соль', value: 50 },
  ]);
  assert.deepEqual(rows.map((row) => [row.name, row.group]), [
    ['Говядина', 'A'],
    ['Сыр', 'B'],
    ['Соль', 'C'],
  ]);
  assert.equal(Math.round(rows[0].share), 80);
  assert.equal(Math.round(rows[2].cumulativeShare), 100);
});

test('позиция, перешагнувшая границу, остаётся в верхней группе', () => {
  // Один товар даёт 99% — он обязан быть в A, а не в C.
  const rows = abcRows([{ id: 'a', name: 'Главный', value: 99 }, { id: 'b', name: 'Мелочь', value: 1 }]);
  assert.equal(rows[0].group, 'A');
  assert.equal(rows[1].group, 'C');
});

test('нулевые и отрицательные значения не попадают в ABC', () => {
  const rows = abcRows([
    { id: 'a', name: 'Есть расход', value: 100 },
    { id: 'b', name: 'Нет расхода', value: 0 },
    { id: 'c', name: 'Возврат', value: -40 },
  ]);
  // Расход в iiko приходит со знаком минус — берём по модулю.
  assert.deepEqual(rows.map((row) => [row.name, row.value]), [['Есть расход', 100], ['Возврат', 40]]);
});

test('пустой расход даёт пустой ABC', () => {
  assert.deepEqual(abcRows([]), []);
  assert.deepEqual(abcRows([{ id: 'a', name: 'Ноль', value: 0 }]), []);
});

test('сводка ABC складывает группы без потерь', () => {
  const rows = abcRows([
    { id: 'a', name: 'Один', value: 800 },
    { id: 'b', name: 'Два', value: 150 },
    { id: 'c', name: 'Три', value: 50 },
  ]);
  const summary = abcSummary(rows);
  assert.deepEqual(summary.map((item) => [item.group, item.count]), [['A', 1], ['B', 1], ['C', 1]]);
  assert.equal(summary.reduce((sum, item) => sum + item.value, 0), 1000);
  assert.equal(Math.round(summary.reduce((sum, item) => sum + item.share, 0)), 100);
});
