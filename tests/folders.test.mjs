import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildFolderTree, folderAt, stockPath } from '../src/folders.ts';

// Поля остатков идут от листа к корню, путь — наоборот.
const wine = { productName: 'Вино Карменер', group: 'Вино', secondGroup: 'Алкоголь', thirdGroup: 'Товары', endSum: 8901.67 };
const whisky = { productName: 'Виски Чивас', group: 'Виски', secondGroup: 'Алкоголь', thirdGroup: 'Товары', endSum: 5000 };
const flour = { productName: 'Мука', group: 'Бакалея', secondGroup: 'Кухня', thirdGroup: 'Товары', endSum: 1000 };
const loose = { productName: 'Аренда', endSum: 0 };

const tree = () => buildFolderTree([wine, whisky, flour, loose], stockPath, (item) => item.endSum);

test('путь строится от корня к листу', () => {
  assert.deepEqual(stockPath(wine), ['Товары', 'Алкоголь', 'Вино']);
});

test('пустые уровни выбрасываются, а не дают папку без имени', () => {
  assert.deepEqual(stockPath({ group: 'Вино', secondGroup: '', thirdGroup: '  ' }), ['Вино']);
  assert.deepEqual(stockPath({}), []);
});

test('дерево собирается по уровням', () => {
  const root = tree();
  assert.deepEqual(root.folders.map((folder) => folder.name), ['Товары']);
  const goods = root.folders[0];
  assert.deepEqual(goods.children.map((folder) => folder.name), ['Алкоголь', 'Кухня']);
  const alcohol = goods.children[0];
  assert.deepEqual(alcohol.children.map((folder) => folder.name), ['Вино', 'Виски']);
});

test('счётчик папки включает всё вложенное', () => {
  const root = tree();
  const goods = root.folders[0];
  assert.equal(goods.count, 3);
  assert.equal(goods.children[0].count, 2);
  assert.equal(goods.children[0].children[0].count, 1);
});

test('сумма папки включает всё вложенное', () => {
  const root = tree();
  assert.equal(root.folders[0].value, 14901.67);
  assert.equal(root.folders[0].children[0].value, 13901.67);
});

test('позиции без папок остаются в корне', () => {
  const root = tree();
  assert.deepEqual(root.items.map((item) => item.productName), ['Аренда']);
  assert.equal(root.count, 4);
});

test('позиции лежат в своей папке, а не в родительской', () => {
  const root = tree();
  const alcohol = root.folders[0].children[0];
  assert.deepEqual(alcohol.items, []);
  assert.deepEqual(alcohol.children[0].items.map((item) => item.productName), ['Вино Карменер']);
});

test('папки отсортированы по-русски, без учёта регистра', () => {
  const sorted = buildFolderTree(
    [{ g: 'яБракераж' }, { g: 'Алкоголь' }, { g: 'бакалея' }],
    (item) => [item.g],
  );
  assert.deepEqual(sorted.folders.map((folder) => folder.name), ['Алкоголь', 'бакалея', 'яБракераж']);
});

test('спуск по пути отдаёт содержимое папки', () => {
  const root = tree();
  const alcohol = folderAt(root, ['Товары', 'Алкоголь']);
  assert.deepEqual(alcohol.folders.map((folder) => folder.name), ['Вино', 'Виски']);
  assert.equal(alcohol.count, 2);
  const leaf = folderAt(root, ['Товары', 'Алкоголь', 'Вино']);
  assert.deepEqual(leaf.items.map((item) => item.productName), ['Вино Карменер']);
  assert.deepEqual(leaf.folders, []);
});

test('пустой путь возвращает корень', () => {
  const root = tree();
  assert.equal(folderAt(root, []), root);
});

test('несуществующий путь даёт null, а не падение', () => {
  const root = tree();
  assert.equal(folderAt(root, ['Нет такой']), null);
  assert.equal(folderAt(root, ['Товары', 'Нет такой']), null);
});

test('одинаковые имена на разных ветках не смешиваются', () => {
  const root = buildFolderTree(
    [
      { name: 'а', path: ['Бар', 'Вино'] },
      { name: 'б', path: ['Кухня', 'Вино'] },
    ],
    (item) => item.path,
  );
  assert.equal(folderAt(root, ['Бар', 'Вино']).items.length, 1);
  assert.equal(folderAt(root, ['Кухня', 'Вино']).items.length, 1);
});

test('пустой список даёт пустое дерево', () => {
  const root = buildFolderTree([], stockPath);
  assert.deepEqual(root, { folders: [], items: [], count: 0, value: 0 });
});

test('нечисловая сумма не превращается в NaN', () => {
  const root = buildFolderTree([{ g: 'Вино', endSum: null }, { g: 'Вино', endSum: 10 }], (item) => [item.g], (item) => item.endSum);
  assert.equal(root.folders[0].value, 10);
  assert.equal(root.value, 10);
});

test('заглушка верхнего уровня не становится папкой', () => {
  // iiko добивает путь до трёх уровней этим литералом.
  assert.deepEqual(
    stockPath({ group: 'Инвентарь', secondGroup: 'Товары', thirdGroup: 'Группа самого высокого уровня' }),
    ['Товары', 'Инвентарь'],
  );
});

test('двух- и трёхуровневые ветки сходятся в одну папку', () => {
  const root = buildFolderTree(
    [
      { n: 'Инвентарь', group: 'Инвентарь', secondGroup: 'Товары', thirdGroup: 'Группа самого высокого уровня' },
      { n: 'Вино', group: 'Вино', secondGroup: 'Алкоголь', thirdGroup: 'Товары' },
    ],
    stockPath,
  );
  assert.deepEqual(root.folders.map((folder) => folder.name), ['Товары']);
  assert.equal(root.folders[0].count, 2);
  assert.deepEqual(root.folders[0].children.map((folder) => folder.name), ['Алкоголь', 'Инвентарь']);
});
