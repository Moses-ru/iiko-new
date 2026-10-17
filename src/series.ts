// Ряды для графиков строятся из уже загруженных накладных —
// ни одного дополнительного запроса в iiko.

export type SeriesPoint = { date: string; value: number; count: number };

const isoDay = (value: string) => String(value || "").slice(0, 10);

const DAY = 86400000;

/** Все дни от from до to включительно, чтобы в графике не схлопывались пропуски. */
export function daySpan(from: string, to: string, limit = 400): string[] {
  const start = Date.parse(`${isoDay(from)}T00:00:00Z`);
  const end = Date.parse(`${isoDay(to)}T00:00:00Z`);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return [];
  const days: string[] = [];
  for (let time = start; time <= end && days.length < limit; time += DAY) {
    days.push(new Date(time).toISOString().slice(0, 10));
  }
  return days;
}

/**
 * Суммы по дням. Дни без закупок остаются нулями: провал в середине недели —
 * это информация, а не повод сдвинуть соседние столбцы друг к другу.
 */
export function dailyTotals(
  rows: readonly { date: string; sum?: number }[],
  from: string,
  to: string,
): SeriesPoint[] {
  const totals = new Map<string, { value: number; count: number }>();

  for (const row of rows) {
    const day = isoDay(row.date);
    if (!day) continue;
    const value = Number(row.sum ?? 0);
    const slot = totals.get(day) ?? { value: 0, count: 0 };
    slot.value += Number.isFinite(value) ? value : 0;
    slot.count += 1;
    totals.set(day, slot);
  }

  const span = daySpan(from, to);
  // Период не задан или данные вне него — показываем то, что есть.
  const days = span.length ? span : [...totals.keys()].sort();

  return days.map((date) => ({ date, value: totals.get(date)?.value ?? 0, count: totals.get(date)?.count ?? 0 }));
}

/** Если дней слишком много, суммируем по неделям — иначе столбцы в волос толщиной. */
export function groupByWeek(points: readonly SeriesPoint[]): SeriesPoint[] {
  const weeks = new Map<string, SeriesPoint>();

  for (const point of points) {
    const time = Date.parse(`${point.date}T00:00:00Z`);
    if (!Number.isFinite(time)) continue;
    // Понедельник недели, к которой относится день.
    const weekday = (new Date(time).getUTCDay() + 6) % 7;
    const monday = new Date(time - weekday * DAY).toISOString().slice(0, 10);
    const slot = weeks.get(monday) ?? { date: monday, value: 0, count: 0 };
    slot.value += point.value;
    slot.count += point.count;
    weeks.set(monday, slot);
  }

  return [...weeks.values()].sort((a, b) => a.date.localeCompare(b.date));
}

/** Больше 45 точек на ширину телефона не читается — переходим на недели. */
export function fitSeries(points: readonly SeriesPoint[], maxPoints = 45) {
  if (points.length <= maxPoints) return { points: [...points], step: "day" as const };
  return { points: groupByWeek(points), step: "week" as const };
}

export type PricePoint = { date: string; price: number; supplierName?: string };

/**
 * Динамика цены одной позиции: одна точка на дату закупки.
 * В один день бывает несколько накладных — берём среднюю цену дня,
 * иначе график дрожит от порядка документов.
 */
export function pricePoints(
  lines: readonly { date: string; price: number; supplierName?: string }[],
): PricePoint[] {
  const byDay = new Map<string, { total: number; count: number; supplierName?: string }>();

  for (const line of lines) {
    const day = isoDay(line.date);
    const price = Number(line.price);
    if (!day || !Number.isFinite(price)) continue;
    const slot = byDay.get(day) ?? { total: 0, count: 0, supplierName: line.supplierName };
    slot.total += price;
    slot.count += 1;
    byDay.set(day, slot);
  }

  return [...byDay.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, slot]) => ({ date, price: slot.total / slot.count, supplierName: slot.supplierName }));
}

/** Верхняя граница оси: ближайшее «круглое» число над максимумом. */
export function axisMax(values: readonly number[]) {
  const peak = Math.max(0, ...values.map((value) => (Number.isFinite(value) ? value : 0)));
  if (peak <= 0) return 1;
  const magnitude = 10 ** Math.floor(Math.log10(peak));
  for (const step of [1, 2, 2.5, 5, 10]) {
    const candidate = step * magnitude;
    if (candidate >= peak) return candidate;
  }
  return 10 * magnitude;
}
