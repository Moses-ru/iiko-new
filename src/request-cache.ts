// Memory only: responses never survive a browser session or cross connections.
export function createRequestCache(ttl = 30_000, maxEntries = 80) {
  const cache = new Map<string, { expires: number; value: unknown }>();
  const pending = new Map<string, Promise<unknown>>();
  let generation = 0;

  return {
    clear() {
      generation++;
      cache.clear();
      pending.clear();
    },
    async get<T>(key: string, load: () => Promise<T>, signal?: AbortSignal | null, freshness = ttl): Promise<T> {
      signal?.throwIfAborted();
      const cached = cache.get(key);
      if (cached && cached.expires > Date.now()) return cached.value as T;
      cache.delete(key);
      let request = pending.get(key) as Promise<T> | undefined;
      if (!request) {
        const startedGeneration = generation;
        request = load().then((value) => {
          if (generation === startedGeneration) {
            cache.delete(key);
            cache.set(key, { value, expires: Date.now() + freshness });
            while (cache.size > maxEntries) cache.delete(cache.keys().next().value!);
          }
          return value;
        }).finally(() => {
          if (pending.get(key) === request) pending.delete(key);
        });
        pending.set(key, request);
      }
      if (!signal) return request;
      // A caller leaving a page must not cancel another caller's shared request.
      return new Promise<T>((resolve, reject) => {
        const abort = () => reject(signal.reason ?? new DOMException("Aborted", "AbortError"));
        signal.addEventListener("abort", abort, { once: true });
        request!.then(
          (value) => { signal.removeEventListener("abort", abort); if (!signal.aborted) resolve(value); },
          (error) => { signal.removeEventListener("abort", abort); reject(error); },
        );
        if (signal.aborted) abort();
      });
    },
  };
}
