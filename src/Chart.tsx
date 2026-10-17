import { useId, useState } from "react";
import { axisMax, type PricePoint, type SeriesPoint } from "./series";

/**
 * Графики нарисованы самим SVG, без библиотек: сборка остаётся лёгкой,
 * а цвета берутся из тех же переменных темы, что и остальной интерфейс.
 */

const PAD = { left: 8, right: 8, top: 14, bottom: 22 };

const dayLabel = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString("ru-RU", { day: "numeric", month: "short", timeZone: "UTC" });

const compactMoney = new Intl.NumberFormat("ru-RU", { notation: "compact", maximumFractionDigits: 1 });
const fullMoney = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 });

/** Подписи оси X: только столько, сколько поместится без наложения. */
function tickIndexes(count: number, maxTicks: number) {
  if (count <= 1) return [0];
  const step = Math.max(1, Math.ceil(count / maxTicks));
  const ticks: number[] = [];
  for (let index = 0; index < count; index += step) ticks.push(index);
  if (ticks[ticks.length - 1] !== count - 1) ticks.push(count - 1);
  return ticks;
}

export function BarChart({
  points,
  step,
  title,
  caption,
  formatValue = (value: number) => fullMoney.format(value),
}: {
  points: SeriesPoint[];
  step: "day" | "week";
  title: string;
  caption?: string;
  formatValue?: (value: number) => string;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const clipId = useId();

  if (!points.length) return null;

  const width = 720;
  const height = 190;
  const plotWidth = width - PAD.left - PAD.right;
  const plotHeight = height - PAD.top - PAD.bottom;
  const top = axisMax(points.map((point) => point.value));
  const band = plotWidth / points.length;
  const barWidth = Math.max(1.5, Math.min(band - 2, 26));

  const total = points.reduce((sum, point) => sum + point.value, 0);
  const peak = points.reduce((best, point) => (point.value > best.value ? point : best), points[0]);
  const active = hover === null ? null : points[hover];
  const ticks = tickIndexes(points.length, Math.min(7, points.length));

  return (
    <section className="chart-card" aria-label={title}>
      <div className="chart-head">
        <div>
          <span>{title}</span>
          <strong>{formatValue(total)}</strong>
        </div>
        <small>
          {active
            ? `${dayLabel(active.date)}${step === "week" ? " + неделя" : ""} · ${formatValue(active.value)}`
            : caption || `пик ${dayLabel(peak.date)} · ${formatValue(peak.value)}`}
        </small>
      </div>

      <svg
        className="chart-svg"
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="none"
        role="img"
        aria-label={`${title}: всего ${formatValue(total)}, максимум ${dayLabel(peak.date)}`}
        onMouseLeave={() => setHover(null)}
      >
        <defs>
          <clipPath id={clipId}>
            <rect x={PAD.left} y={PAD.top} width={plotWidth} height={plotHeight} />
          </clipPath>
        </defs>

        {[0, 0.5, 1].map((fraction) => (
          <line
            key={fraction}
            className="chart-grid"
            x1={PAD.left}
            x2={width - PAD.right}
            y1={PAD.top + plotHeight * fraction}
            y2={PAD.top + plotHeight * fraction}
          />
        ))}

        <g clipPath={`url(#${clipId})`}>
          {points.map((point, index) => {
            const barHeight = top > 0 ? (point.value / top) * plotHeight : 0;
            return (
              <rect
                key={point.date}
                className={`chart-bar ${hover === index ? "is-active" : ""} ${point.value === 0 ? "is-empty" : ""}`}
                x={PAD.left + index * band + (band - barWidth) / 2}
                y={PAD.top + plotHeight - barHeight}
                width={barWidth}
                height={Math.max(point.value > 0 ? 1.5 : 0, barHeight)}
                rx={Math.min(3, barWidth / 2)}
                onMouseEnter={() => setHover(index)}
              >
                <title>{`${dayLabel(point.date)}: ${formatValue(point.value)}`}</title>
              </rect>
            );
          })}
        </g>

        {ticks.map((index) => (
          <text key={index} className="chart-tick" x={PAD.left + index * band + band / 2} y={height - 6} textAnchor="middle">
            {dayLabel(points[index].date)}
          </text>
        ))}

        <text className="chart-tick chart-tick-value" x={PAD.left} y={PAD.top - 4}>
          {compactMoney.format(top)}
        </text>
      </svg>
    </section>
  );
}

export function PriceChart({ points, unit, title }: { points: PricePoint[]; unit?: string; title: string }) {
  const [hover, setHover] = useState<number | null>(null);

  if (points.length < 2) return null;

  const width = 720;
  const height = 160;
  const plotWidth = width - PAD.left - PAD.right;
  const plotHeight = height - PAD.top - PAD.bottom;

  const prices = points.map((point) => point.price);
  const low = Math.min(...prices);
  const high = Math.max(...prices);
  // Ровная цена не должна превращаться в линию по центру с нулевым размахом.
  const spread = high - low || Math.max(high * 0.1, 1);
  const base = high === low ? low - spread / 2 : low;

  const x = (index: number) => PAD.left + (points.length === 1 ? plotWidth / 2 : (index / (points.length - 1)) * plotWidth);
  const y = (price: number) => PAD.top + plotHeight - ((price - base) / spread) * plotHeight;

  const path = points.map((point, index) => `${index === 0 ? "M" : "L"}${x(index).toFixed(1)} ${y(point.price).toFixed(1)}`).join(" ");
  const active = hover === null ? null : points[hover];
  const change = points[points.length - 1].price - points[0].price;
  const changePct = points[0].price ? (change / points[0].price) * 100 : 0;

  const money = new Intl.NumberFormat("ru-RU", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  return (
    <section className="chart-card" aria-label={title}>
      <div className="chart-head">
        <div>
          <span>{title}</span>
          <strong>
            {money.format(points[points.length - 1].price)}
            {unit ? ` ₽/${unit}` : " ₽"}
          </strong>
        </div>
        <small className={change > 0 ? "chart-up" : change < 0 ? "chart-down" : ""}>
          {active
            ? `${dayLabel(active.date)} · ${money.format(active.price)}`
            : `${change > 0 ? "+" : ""}${money.format(changePct)}% за период`}
        </small>
      </div>

      <svg
        className="chart-svg"
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="none"
        role="img"
        aria-label={`${title}: от ${money.format(points[0].price)} до ${money.format(points[points.length - 1].price)}`}
        onMouseLeave={() => setHover(null)}
      >
        {[0, 0.5, 1].map((fraction) => (
          <line
            key={fraction}
            className="chart-grid"
            x1={PAD.left}
            x2={width - PAD.right}
            y1={PAD.top + plotHeight * fraction}
            y2={PAD.top + plotHeight * fraction}
          />
        ))}

        <path className={`chart-line ${change > 0 ? "is-up" : change < 0 ? "is-down" : ""}`} d={path} />

        {points.map((point, index) => (
          <circle
            key={point.date}
            className={`chart-dot ${hover === index ? "is-active" : ""}`}
            cx={x(index)}
            cy={y(point.price)}
            r={hover === index ? 4.5 : 2.5}
            onMouseEnter={() => setHover(index)}
          >
            <title>{`${dayLabel(point.date)}: ${money.format(point.price)}${point.supplierName ? ` · ${point.supplierName}` : ""}`}</title>
          </circle>
        ))}

        {tickIndexes(points.length, Math.min(5, points.length)).map((index) => (
          <text key={index} className="chart-tick" x={x(index)} y={height - 6} textAnchor="middle">
            {dayLabel(points[index].date)}
          </text>
        ))}
      </svg>
    </section>
  );
}
