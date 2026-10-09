const finite = (value: unknown): number | null => value == null || !Number.isFinite(Number(value)) ? null : Number(value);

export function inventoryMetrics(summary: Record<string, number>, from: string, to: string) {
  const open = finite(summary.openValue), close = finite(summary.closeValue), sales = finite(summary.salesCost);
  const days = Math.max(1, Math.round((Date.parse(to) - Date.parse(from)) / 86400000) + 1);
  const average = open !== null && close !== null ? (open + close) / 2 : null;
  const turns = average !== null && average > 0 && sales !== null ? Math.abs(sales) / average : null;
  return {
    days,
    changePercent: open !== null && open !== 0 && close !== null ? (close - open) / Math.abs(open) * 100 : null,
    turns,
    coverageDays: close !== null && close >= 0 && sales !== null && Math.abs(sales) > 0 ? close / (Math.abs(sales) / days) : null,
    writeoffPercent: sales !== null && finite(summary.writeoffCost) !== null && Math.abs(sales) + Math.abs(summary.writeoffCost) > 0
      ? Math.abs(summary.writeoffCost) / (Math.abs(sales) + Math.abs(summary.writeoffCost)) * 100 : null,
  };
}

export function warehouseShares<T extends { name?: string; closeValue?: number }>(stores: T[]) {
  const positiveTotal = stores.reduce((sum, store) => sum + Math.max(0, finite(store.closeValue) ?? 0), 0);
  return stores.map(store => ({ ...store, share: positiveTotal > 0 ? Math.max(0, finite(store.closeValue) ?? 0) / positiveTotal * 100 : null }));
}
