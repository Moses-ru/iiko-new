// Bounds bursts from this browser; the Worker must also coordinate all clients.
export function createRequestGate(limit = 2, recoveryMs = 5 * 60_000, now = Date.now) {
  let active = 0;
  const queue: (() => void)[] = [];
  const paused = new Map<string, number>();
  const pump = () => { while (active < limit && queue.length) queue.shift()!(); };
  return {
    async run<T>(scope: string, load: () => Promise<T>): Promise<T> {
      return new Promise<T>((resolve, reject) => {
        queue.push(() => {
          const until = paused.get(scope) || 0;
          if (until > now()) {
            reject(new Error(`iiko временно не выдаёт токен. Следующая попытка доступна через ${Math.ceil((until - now()) / 60_000)} мин.`));
            return;
          }
          paused.delete(scope);
          active++;
          Promise.resolve().then(load).then(resolve, (error) => {
            if (/iikoServer API auth did not return an access token/i.test(String(error?.message || error))) {
              paused.set(scope, now() + recoveryMs);
            }
            reject(error);
          }).finally(() => { active--; pump(); });
        });
        pump();
      });
    },
  };
}

export async function mapSequential<T, R>(items: readonly T[], load: (item: T) => Promise<R>, signal?: AbortSignal) {
  const results: R[] = [];
  for (const item of items) {
    signal?.throwIfAborted();
    results.push(await load(item));
  }
  return results;
}
