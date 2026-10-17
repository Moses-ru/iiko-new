// Пережидает перезагрузку страницы: ответы воркера лежат в localStorage с TTL.
// Память чистится сама — крупные ответы не сохраняются, при нехватке места
// вытесняются самые старые записи.

const PREFIX = "iiko-api-cache-v1:";
const MAX_ENTRY_BYTES = 512 * 1024;
const MAX_TOTAL_BYTES = 3 * 1024 * 1024;

export type PersistentStore = Pick<Storage, "getItem" | "setItem" | "removeItem" | "key" | "length">;

type Record_ = { key: string; storedAt: number; expires: number; value: unknown };

/** FNV-1a: короткий ключ для localStorage вместо длинного JSON. */
export function hashKey(input: string) {
  let hash = 0x811c9dc5;
  for (let index = 0; index < input.length; index++) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(36) + input.length.toString(36);
}

function browserStore(): PersistentStore | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

function ownKeys(store: PersistentStore) {
  const keys: string[] = [];
  for (let index = 0; index < store.length; index++) {
    const key = store.key(index);
    if (key && key.startsWith(PREFIX)) keys.push(key);
  }
  return keys;
}

export function createPersistentCache(store: PersistentStore | null = browserStore(), now = Date.now) {
  return {
    /** Свежее значение или null. Просроченные и чужие записи удаляются на месте. */
    read<T>(key: string): T | null {
      if (!store) return null;
      const slot = PREFIX + hashKey(key);
      try {
        const raw = store.getItem(slot);
        if (!raw) return null;
        const record = JSON.parse(raw) as Record_;
        // Хеш может совпасть у разных ключей — сверяем исходный.
        if (!record || record.key !== key) {
          store.removeItem(slot);
          return null;
        }
        if (record.expires <= now()) {
          store.removeItem(slot);
          return null;
        }
        return record.value as T;
      } catch {
        try {
          store.removeItem(slot);
        } catch {
          /* хранилище недоступно — молча работаем без него */
        }
        return null;
      }
    },

    /** Сохраняет значение, если оно не слишком большое. Любая ошибка — не беда. */
    write(key: string, value: unknown, ttl: number) {
      if (!store || ttl <= 0) return;
      let payload: string;
      try {
        payload = JSON.stringify({ key, storedAt: now(), expires: now() + ttl, value } satisfies Record_);
      } catch {
        return;
      }
      if (payload.length > MAX_ENTRY_BYTES) return;

      const slot = PREFIX + hashKey(key);
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          store.setItem(slot, payload);
          this.trim();
          return;
        } catch {
          // Места нет: выкидываем самые старые записи и пробуем снова.
          if (!this.evictOldest()) return;
        }
      }
    },

    /** Удаляет самую старую запись. false — удалять больше нечего. */
    evictOldest() {
      if (!store) return false;
      let oldestKey: string | null = null;
      let oldestAt = Infinity;
      for (const key of ownKeys(store)) {
        try {
          const record = JSON.parse(store.getItem(key) || "null") as Record_ | null;
          const storedAt = record?.storedAt ?? 0;
          if (storedAt < oldestAt) {
            oldestAt = storedAt;
            oldestKey = key;
          }
        } catch {
          oldestKey = key;
          break;
        }
      }
      if (!oldestKey) return false;
      try {
        store.removeItem(oldestKey);
      } catch {
        return false;
      }
      return true;
    },

    /** Держит общий объём в рамках и выбрасывает просроченное. */
    trim() {
      if (!store) return;
      let total = 0;
      const live: { key: string; storedAt: number; size: number }[] = [];
      for (const key of ownKeys(store)) {
        let raw: string | null = null;
        try {
          raw = store.getItem(key);
        } catch {
          continue;
        }
        if (!raw) continue;
        let record: Record_ | null = null;
        try {
          record = JSON.parse(raw) as Record_;
        } catch {
          record = null;
        }
        if (!record || record.expires <= now()) {
          try {
            store.removeItem(key);
          } catch {
            /* пусто */
          }
          continue;
        }
        total += raw.length;
        live.push({ key, storedAt: record.storedAt ?? 0, size: raw.length });
      }
      if (total <= MAX_TOTAL_BYTES) return;
      live.sort((a, b) => a.storedAt - b.storedAt);
      for (const entry of live) {
        if (total <= MAX_TOTAL_BYTES) return;
        try {
          store.removeItem(entry.key);
          total -= entry.size;
        } catch {
          return;
        }
      }
    },

    clear() {
      if (!store) return;
      for (const key of ownKeys(store)) {
        try {
          store.removeItem(key);
        } catch {
          /* пусто */
        }
      }
    },
  };
}
