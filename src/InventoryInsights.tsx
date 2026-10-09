import { inventoryMetrics } from "./analytics-model";

const decimal = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 1 });
const money = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 });

export function InventoryInsights({ summary, from, to }: { summary: Record<string, number>; from: string; to: string }) {
  const metrics = inventoryMetrics(summary, from, to);
  const movement = [
    { label: "Приход", value: summary.incomingValue, className: "incoming" },
    { label: "Расход по продажам", value: summary.salesCost, className: "sales" },
    { label: "Списания", value: summary.writeoffCost, className: "writeoff" },
  ];
  const max = Math.max(1, ...movement.map(item => Math.abs(item.value || 0)));
  return <section className="inventory-insights" aria-label="Оборот и движение склада">
    <div className="movement-chart"><div className="analytics-heading"><div><span>За выбранный период</span><strong>Движение запасов</strong></div></div>
      {movement.map(item => <div className="movement-row" key={item.label}><div><span>{item.label}</span><b>{item.value == null ? "Нет данных" : `${money.format(Math.abs(item.value))} ₽`}</b></div><div className="movement-track" role="img" aria-label={`${item.label}: ${item.value == null ? "нет данных" : money.format(Math.abs(item.value)) + " рублей"}`}><i className={item.className} style={{ width: `${Math.abs(item.value || 0) / max * 100}%` }} /></div></div>)}
      <p className="chart-footnote">Сравнение по себестоимости. Это движение запасов, а не выручка.</p>
    </div>
    <div className="inventory-metrics">
      <article><span>Оборот запасов</span><strong>{metrics.turns === null ? "—" : `${decimal.format(metrics.turns)}×`}</strong><small>за {metrics.days} дн. · по себестоимости</small></article>
      <article><span>Запаса хватит на</span><strong>{metrics.coverageDays === null ? "—" : `${decimal.format(metrics.coverageDays)} дн.`}</strong><small>при темпе расхода этого периода</small></article>
      <article><span>Доля списаний</span><strong>{metrics.writeoffPercent === null ? "—" : `${decimal.format(metrics.writeoffPercent)}%`}</strong><small>в расходе по продажам и списаниям</small></article>
    </div>
  </section>;
}
