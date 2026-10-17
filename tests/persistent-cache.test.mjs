import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createPersistentCache, hashKey } from '../src/persistent-cache.ts';

/** Минимальный localStorage с настраиваемым лимитом по объёму. */
function memoryStore(limitBytes = Infinity) {
  const map = new Map();
  const used = () => [...map.entries()].reduce((sum, [key, value]) => sum + key.length + value.length, 0);
  return {
    map,
    get length() { return map.size; },
    key(index) { return [...map.keys()][index] ?? null; },
    getItem(key) { return map.has(key) ? map.get(key) : null; },
    removeItem(key) { map.delete(key); },
    setItem(key, value) {
      const next = used() - (map.get(key)?.length ?? 0) - (map.has(key) ? key.length : 0) + key.length + value.length;
      if (next > limitBytes) throw new Error('QuotaExceededError');
      map.set(key, value);
    },
  };
}

test('возвращает сохранённое значение до истечения TTL', () => {
  let clock = 1000;
  const cache = createPersistentCache(memoryStore(), () => clock);
  cache.write('/api/dashboard', { ok: true, total: 42 }, 60_000);
  assert.deepEqual(cache.read('/api/dashboard'), { ok: true, total: 42 });
  clock += 59_000;
  assert.deepEqual(cache.read('/api/dashboard'), { ok: true, total: 42 });
});

test('просроченное значение не возвращается и удаляется', () => {
  let clock = 1000;
  const store = memoryStore();
  const cache = createPersistentCache(store, () => clock);
  cache.write('/api/stock-live', { items: [1, 2] }, 30_000);
  clock += 30_001;
  assert.equal(cache.read('/api/stock-live'), null);
  assert.equal(store.length, 0);
});

test('промах по несохранённому ключу', () => {
  const cache = createPersistentCache(memoryStore());
  assert.equal(cache.read('/api/nomenclature'), null);
});

test('совпадение хешей не выдаёт чужое значение', () => {
  const store = memoryStore();
  const cache = createPersistentCache(store, () => 1000);
  cache.write('/api/a', 'значение A', 60_000);
  // Подменяем исходный ключ в записи, имитируя коллизию хеша.
  const slot = [...store.map.keys()][0];
  store.map.set(slot, JSON.stringify({ key: '/api/другой', storedAt: 1000, expires: 61_000, value: 'значение A' }));
  assert.equal(cache.read('/api/a'), null);
});

test('слишком большой ответ не сохраняется', () => {
  const store = memoryStore();
  const cache = createPersistentCache(store, () => 1000);
  cache.write('/api/huge', { blob: 'x'.repeat(600 * 1024) }, 60_000);
  assert.equal(store.length, 0);
});

test('при нехватке места вытесняется самая старая запись', () => {
  let clock = 1000;
  const store = memoryStore(300);
  const cache = createPersistentCache(store, () => clock);
  const chunk = (label) => ({ blob: label.repeat(60) });

  cache.write('/api/first', chunk('a'), 60_000);
  clock += 10;
  cache.write('/api/second', chunk('b'), 60_000);
  clock += 10;
  cache.write('/api/third', chunk('c'), 60_000);

  assert.equal(cache.read('/api/first'), null, 'самая старая запись вытеснена');
  assert.deepEqual(cache.read('/api/third'), chunk('c'), 'новая запись сохранена');
});

test('отсутствие хранилища не ломает работу', () => {
  const cache = createPersistentCache(null);
  cache.write('/api/dashboard', { ok: true }, 60_000);
  assert.equal(cache.read('/api/dashboard'), null);
  cache.clear();
});

test('сломанная запись не роняет чтение', () => {
  const store = memoryStore();
  const cache = createPersistentCache(store, () => 1000);
  store.setItem('iiko-api-cache-v1:' + hashKey('/api/broken'), '{не json');
  assert.equal(cache.read('/api/broken'), null);
  assert.equal(store.length, 0);
});

test('clear убирает только свои ключи', () => {
  const store = memoryStore();
  const cache = createPersistentCache(store, () => 1000);
  cache.write('/api/dashboard', { ok: true }, 60_000);
  store.setItem('iiko-display-theme', 'dark');
  cache.clear();
  assert.equal(store.getItem('iiko-display-theme'), 'dark');
  assert.equal(cache.read('/api/dashboard'), null);
});
