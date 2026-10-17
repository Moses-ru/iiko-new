// Фудкост по карте и ABC по расходу.
// Оба расчёта работают на данных, которые экран уже загрузил.

const numeric = (value: unknown): number | null => {
  if (value == null || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

export type FoodcostInput = {
  id?: string;
  name?: unknown;
  code?: string;
  category?: string;
  type?: string;
  unit?: string;
  menuPrice?: number | null;
  menuPriceStatus?: string;
  costPrice?: number | null;
};

export type FoodcostRow = {
  id: string;
  name: string;
  code: string;
  category: string;
  unit: string;
  menuPrice: number;
  costPrice: number;
  /** Доля себестоимости в цене меню, в процентах. */
  foodcost: number;
  /** Сколько рублей остаётся с одной порции до прочих затрат. */
  margin: number;
};

/** Порог, выше которого блюдо считается проблемным. Классика общепита — 30%. */
export const FOODCOST_TARGET = 30;

/**
 * Считаем только там, где есть и цена меню, и себестоимость: фудкост без
 * одной из них — выдумка, а выдуманные проценты в отчёте хуже их отсутствия.
 */
export function foodcostRows(items: readonly FoodcostInput[]): FoodcostRow[] {
  const rows: FoodcostRow[] = [];

  for (const item of items) {
    if (item.menuPriceStatus === "unavailable") continue;
    const menuPrice = numeric(item.menuPrice);
    const costPrice = numeric(item.costPrice);
    if (menuPrice === null || costPrice === null) continue;
    if (menuPrice <= 0 || costPrice < 0) continue;

    rows.push({
      id: String(item.id ?? ""),
      name: String(item.name ?? ""),
      code: String(item.code ?? ""),
      category: String(item.category || "Без категории"),
      unit: String(item.unit || ""),
      menuPrice,
      costPrice,
      foodcost: (costPrice / menuPrice) * 100,
      margin: menuPrice - costPrice,
    });
  }

  // Худший фудкост сверху: экран существует ради этих позиций.
  return rows.sort((a, b) => b.foodcost - a.foodcost);
}

export function foodcostSummary(rows: readonly FoodcostRow[], target = FOODCOST_TARGET) {
  if (!rows.length) return { count: 0, average: null, aboveTarget: 0, worst: null };

  // Средний фудкост взвешиваем по цене меню, а не по позициям: иначе
  // десяток дешёвых соусов перевешивает всё основное меню.
  const revenue = rows.reduce((sum, row) => sum + row.menuPrice, 0);
  const cost = rows.reduce((sum, row) => sum + row.costPrice, 0);

  return {
    count: rows.length,
    average: revenue > 0 ? (cost / revenue) * 100 : null,
    aboveTarget: rows.filter((row) => row.foodcost > target).length,
    worst: rows[0] ?? null,
  };
}

export type AbcInput = { id?: string; code?: string; name?: string; unit?: string; value: number };

export type AbcRow = {
  id: string;
  name: string;
  code: string;
  unit: string;
  value: number;
  share: number;
  cumulativeShare: number;
  group: "A" | "B" | "C";
};

/**
 * Классическое ABC: позиции по убыванию вклада, A — первые 80% стоимости,
 * B — следующие 15%, C — остальное. Позиция, перешагнувшая границу, попадает
 * в верхнюю группу: иначе товар с вкладом в 79,9% оказался бы в B.
 */
export function abcRows(items: readonly AbcInput[]): AbcRow[] {
  const positive = items
    .map((item) => ({ ...item, value: Math.abs(Number(item.value) || 0) }))
    .filter((item) => item.value > 0)
    .sort((a, b) => b.value - a.value);

  const total = positive.reduce((sum, item) => sum + item.value, 0);
  if (total <= 0) return [];

  let running = 0;
  return positive.map((item) => {
    const share = (item.value / total) * 100;
    const previous = running;
    running += share;
    const group: AbcRow["group"] = previous < 80 ? "A" : previous < 95 ? "B" : "C";

    return {
      id: String(item.id ?? ""),
      name: String(item.name ?? ""),
      code: String(item.code ?? ""),
      unit: String(item.unit ?? ""),
      value: item.value,
      share,
      cumulativeShare: running,
      group,
    };
  });
}

export function abcSummary(rows: readonly AbcRow[]) {
  const bucket = (group: AbcRow["group"]) => {
    const inGroup = rows.filter((row) => row.group === group);
    return {
      group,
      count: inGroup.length,
      value: inGroup.reduce((sum, row) => sum + row.value, 0),
      share: inGroup.reduce((sum, row) => sum + row.share, 0),
    };
  };
  return [bucket("A"), bucket("B"), bucket("C")];
}
