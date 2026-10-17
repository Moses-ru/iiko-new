import { test } from 'node:test';
import assert from 'node:assert/strict';
import { movementLines } from '../src/stock-movement.ts';

test('показывает приход, продажи и списания модулем', () => {
  const { primary } = movementLines({ purchaseQty: 50, salesQty: -27.6, writeoffQty: -3 });
  assert.deepEqual(primary.map((line) => [line.label, line.value]), [
    ['Приход', 50],
    ['Продажи', 27.6],
    ['Списания', 3],
  ]);
});

test('нулевые и отсутствующие виды движения не показываются', () => {
  const { primary, other } = movementLines({ purchaseQty: 10, salesQty: 0 });
  assert.deepEqual(primary.map((line) => line.label), ['Приход']);
  assert.equal(other, null);
});

test('прочее движение сворачивается в одну строку со знаком', () => {
  const { other } = movementLines({ transferQty: -5, inventoryQty: 1.5, productionQty: 2 });
  assert.equal(other.value, -1.5);
  assert.equal(other.label, 'Прочее: перемещения, инвентаризация, производство');
});

test('порядок строк не зависит от порядка полей в ответе', () => {
  const { primary } = movementLines({ writeoffQty: 1, salesQty: 2, purchaseQty: 3 });
  assert.deepEqual(primary.map((line) => line.label), ['Приход', 'Продажи', 'Списания']);
});

test('пустая ОСВ не ломает карточку', () => {
  assert.deepEqual(movementLines(undefined), { primary: [], other: null });
  assert.deepEqual(movementLines({}), { primary: [], other: null });
});

test('нечисловые значения считаются нулём', () => {
  const { primary, other } = movementLines({ purchaseQty: Number.NaN, salesQty: 4, transferQty: undefined });
  assert.deepEqual(primary.map((line) => line.label), ['Продажи']);
  assert.equal(other, null);
});

test('микроскопические остатки отбрасываются', () => {
  const { primary } = movementLines({ purchaseQty: 0.0000001, salesQty: 0.5 });
  assert.deepEqual(primary.map((line) => line.label), ['Продажи']);
});
