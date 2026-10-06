import { useEffect, useMemo, useState, type ReactNode } from "react";

type IconName =
  | "search"
  | "calendar"
  | "inventory"
  | "database"
  | "document"
  | "chart"
  | "chevron"
  | "close"
  | "arrow"
  | "refresh"
  | "settings"
  | "plus"
  | "recipe"
  | "dots"
  | "user"
  | "lock"
  | "logout";

type DateRange = {
  start: Date;
  end: Date;
};

const WORKER_URL = "https://iiko-miniapp-proxy.iiko-miniapp-proxy.workers.dev";

const ALL_WAREHOUSES_LABEL = "Все склады";

const LIVE_STORES: { id: string; name: string }[] = [
  { id: "4ba256dc-ac44-4df2-9e92-3746549c5b4b", name: "Бар Сургут" },
  { id: "73a57aee-1b68-4a18-bc7c-a308d61c92c2", name: "Кухня Сургут" },
  { id: "c8d5ad09-4cf9-4f8c-9273-fd4b25b40446", name: "Хоз.склад Сургут" },
  { id: "6f84bcad-19e0-40ef-82b6-7ce463d64fe5", name: "Сыроварня Сургут" },
  { id: "8901986b-b0c5-4ac5-becd-9c746e90dd21", name: "Бар Лиличка NEW" },
  { id: "3378ac9f-e453-42dc-b930-9293d7030fce", name: "Кухня Лиличка NEW" },
  { id: "5554ba08-e6cb-4f43-b394-9b23eaec3b5a", name: "Хозы Лиличка NEW" },
];

const warehouseNames = [ALL_WAREHOUSES_LABEL, ...LIVE_STORES.map((store) => store.name)];

type StockApiItem = {
  id: string;
  productNum: string;
  productName: string;
  unit: string;
  quantity: number | null;
  startQuantity: number | null;
  endSum: number | null;
  balanceStatus: string;
  group: string;
  secondGroup: string;
  thirdGroup: string;
};

type StockApiResponse = {
  ok: boolean;
  error?: string;
  storeName: string;
  time: string;
  pagination: { total: number; returned: number };
  items: StockApiItem[];
};

const numberFormatter = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 3 });
const moneyFormatter = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 });

function formatQuantity(value: number | null, unit: string) {
  if (value === null || Number.isNaN(value)) return `— ${unit}`.trim();
  return `${numberFormatter.format(value)} ${unit}`.trim();
}

function formatMoney(value: number | null) {
  if (value === null || Number.isNaN(value)) return "—";
  return `${moneyFormatter.format(value)} ₽`;
}

function isoDateLocal(date: Date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

async function apiFetchJson(path: string, init: RequestInit = {}) {
  const response = await fetch(`${WORKER_URL}${path}`, {
    cache: "no-store",
    ...init,
    headers: {
      Accept: "application/json",
      ...(init.headers || {}),
    },
  });

  const payload = await response.json().catch(() => ({
    ok: false,
    error: `HTTP ${response.status}`,
  }));

  if (!response.ok || payload.ok === false) {
    throw new Error(payload.error || `HTTP ${response.status}`);
  }

  return payload;
}

async function fetchLiveStockForStore(storeName: string, signal?: AbortSignal): Promise<StockApiResponse> {
  const params = new URLSearchParams({ store: storeName, q: "", limit: "5000", offset: "0" });
  const response = await fetch(`${WORKER_URL}/api/stock-live?${params.toString()}`, {
    cache: "no-store",
    signal,
    headers: { Accept: "application/json" },
  });
  const payload = (await response.json()) as StockApiResponse;
  if (!response.ok || payload.ok === false) {
    throw new Error(payload.error || `HTTP ${response.status}`);
  }
  return payload;
}

async function fetchLiveStockMerged(signal?: AbortSignal): Promise<StockApiResponse> {
  const payloads = await Promise.all(LIVE_STORES.map((store) => fetchLiveStockForStore(store.name, signal)));
  const merged = new Map<string, StockApiItem>();

  for (const payload of payloads) {
    for (const item of payload.items) {
      const key = String(item.id || item.productNum || item.productName || "");
      if (!key) continue;

      const existing = merged.get(key);
      if (!existing) {
        merged.set(key, {
          ...item,
          quantity: item.quantity ?? 0,
          startQuantity: item.startQuantity ?? 0,
          endSum: item.endSum ?? 0,
        });
      } else {
        existing.quantity = (existing.quantity ?? 0) + (item.quantity ?? 0);
        existing.startQuantity = (existing.startQuantity ?? 0) + (item.startQuantity ?? 0);
        existing.endSum = (existing.endSum ?? 0) + (item.endSum ?? 0);
      }
    }
  }

  const items = [...merged.values()].sort((a, b) =>
    a.productName.localeCompare(b.productName, "ru", { sensitivity: "base", numeric: true }),
  );

  return {
    ok: true,
    storeName: ALL_WAREHOUSES_LABEL,
    time: new Date().toISOString(),
    pagination: { total: items.length, returned: items.length },
    items,
  };
}

async function fetchDocumentsForPeriod(from: string, to: string, warehouse: string) {
  const selectedStore =
    LIVE_STORES.find((store) => store.name === warehouse) || LIVE_STORES[0];

  const params = new URLSearchParams({
    from,
    to,
    storeId: String(selectedStore.id),
  });

  return apiFetchJson(`/api/documents/incoming?${params.toString()}`);
}

async function fetchNomenclature() {
  return apiFetchJson("/api/nomenclature");
}

async function fetchDashboard(from: string, to: string, warehouse: string) {
  const selectedStore =
    warehouse === ALL_WAREHOUSES_LABEL
      ? undefined
      : LIVE_STORES.find((store) => store.name === warehouse);

  const params = new URLSearchParams({
    from,
    to,
    scope: selectedStore ? "store" : "all",
  });

  if (selectedStore) {
    params.set("storeId", String(selectedStore.id));
  }

  return apiFetchJson(`/api/dashboard?${params.toString()}`);
}

async function fetchTurnover(from: string, to: string, warehouse: string) {
  const selectedStore =
    warehouse === ALL_WAREHOUSES_LABEL
      ? undefined
      : LIVE_STORES.find((store) => store.name === warehouse);

  if (selectedStore) {
    const params = new URLSearchParams({
      store: selectedStore.name,
      from,
      to,
    });
    const response = await fetch(`${WORKER_URL}/api/turnover?${params.toString()}`, {
      cache: "no-store",
      headers: { Accept: "application/json" },
    });

    const payload = await response.json();
    if (!response.ok || payload.ok === false) {
      throw new Error(payload.error || `HTTP ${response.status}`);
    }
    return payload;
  }

  // Fetch all stores and merge
  const payloads = await Promise.all(
    LIVE_STORES.map(async (store) => {
      const params = new URLSearchParams({
        store: store.name,
        from,
        to,
      });
      const response = await fetch(`${WORKER_URL}/api/turnover?${params.toString()}`, {
        cache: "no-store",
        headers: { Accept: "application/json" },
      });
      const payload = await response.json();
      if (!response.ok || payload.ok === false) {
        throw new Error(payload.error || `HTTP ${response.status}`);
      }
      return payload;
    }),
  );

  const map = new Map();
  const numericFields = [
    "openQty",
    "openAmt",
    "purchaseQty",
    "purchaseAmt",
    "salesQty",
    "salesAmt",
    "transferQty",
    "transferAmt",
    "writeoffQty",
    "writeoffAmt",
    "inventoryQty",
    "inventoryAmt",
    "outgoingInvoiceQty",
    "outgoingInvoiceAmt",
    "productionQty",
    "productionAmt",
    "transformationQty",
    "transformationAmt",
    "returnedQty",
    "returnedAmt",
    "incomingReturnedQty",
    "incomingReturnedAmt",
    "disassembleQty",
    "disassembleAmt",
    "costCorrection",
    "otherQty",
    "otherAmt",
    "closeQty",
    "closeAmt",
  ];

  for (const payload of payloads) {
    for (const row of payload.rows || []) {
      const key = String(row.id || row.code || row.name || "");
      if (!key) continue;

      if (!map.has(key)) {
        map.set(key, { ...row });
        continue;
      }

      const target = map.get(key);
      for (const field of numericFields) {
        target[field] = Number(target[field] || 0) + Number(row[field] || 0);
      }
    }
  }

  return {
    ok: true,
    storeName: "Все склады",
    period: { from, to },
    rows: [...map.values()],
  };
}

function Icon({ name }: { name: IconName }) {
  const paths: Record<IconName, ReactNode> = {
    search: (
      <>
        <circle cx="11" cy="11" r="6" />
        <path d="m16 16 4 4" />
      </>
    ),
    calendar: (
      <>
        <rect x="3" y="5" width="18" height="16" rx="3" />
        <path d="M8 3v4M16 3v4M3 10h18" />
      </>
    ),
    inventory: (
      <>
        <rect x="4" y="3" width="16" height="18" rx="3" />
        <path d="M8 3v18M12 9h5M12 13h5" />
      </>
    ),
    database: (
      <>
        <ellipse cx="12" cy="5" rx="8" ry="3" />
        <path d="M4 5v6c0 1.7 3.6 3 8 3s8-1.3 8-3V5M4 11v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6" />
      </>
    ),
    document: (
      <>
        <path d="M6 3h8l4 4v14H6zM14 3v5h5M9 13h6M9 17h6" />
      </>
    ),
    chart: (
      <>
        <rect x="3" y="3" width="18" height="18" rx="3" />
        <path d="M7 17v-4h3v4M12 17V8h3v9M17 17v-7h2v7" />
      </>
    ),
    chevron: <path d="m8 10 4 4 4-4" />,
    close: <path d="m7 7 10 10M17 7 7 17" />,
    arrow: <path d="m15 18-6-6 6-6" />,
    refresh: (
      <>
        <path d="M20 7v5h-5" />
        <path d="M18.5 15a7 7 0 1 1 .5-6l1 3" />
      </>
    ),
    settings: (
      <>
        <circle cx="12" cy="12" r="3" />
        <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.2h-4V21a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1L4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9A1.7 1.7 0 0 0 3 14H2.8v-4H3a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9L4.2 7 7 4.2l.1.1a1.7 1.7 0 0 0 1.9.3A1.7 1.7 0 0 0 10 3V2.8h4V3a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9A1.7 1.7 0 0 0 21 10h.2v4H21a1.7 1.7 0 0 0-1.6 1Z" />
      </>
    ),
    plus: <path d="M12 5v14M5 12h14" />,
    recipe: (
      <>
        <path d="M7 3h10v4H7zM5 7h14l-1 14H6z" />
        <path d="M9 11h6M9 15h6" />
      </>
    ),
    dots: (
      <>
        <circle cx="5" cy="12" r="1" fill="currentColor" stroke="none" />
        <circle cx="12" cy="12" r="1" fill="currentColor" stroke="none" />
        <circle cx="19" cy="12" r="1" fill="currentColor" stroke="none" />
      </>
    ),
    user: (
      <>
        <circle cx="12" cy="8" r="4" />
        <path d="M4 21c.7-4 3.4-6 8-6s7.3 2 8 6" />
      </>
    ),
    lock: (
      <>
        <rect x="5" y="10" width="14" height="11" rx="3" />
        <path d="M8 10V7a4 4 0 0 1 8 0v3M12 14v3" />
      </>
    ),
    logout: <path d="M10 5H5v14h5M14 8l4 4-4 4M9 12h9" />,
  };

  return (
    <svg aria-hidden="true" className={`icon icon-${name}`} viewBox="0 0 24 24">
      {paths[name]}
    </svg>
  );
}

const monthNames = [
  "Январь",
  "Февраль",
  "Март",
  "Апрель",
  "Май",
  "Июнь",
  "Июль",
  "Август",
  "Сентябрь",
  "Октябрь",
  "Ноябрь",
  "Декабрь",
];

const shortMonthNames = [
  "янв.",
  "февр.",
  "марта",
  "апр.",
  "мая",
  "июня",
  "июля",
  "авг.",
  "сент.",
  "окт.",
  "нояб.",
  "дек.",
];

function sameDay(first: Date, second: Date) {
  return (
    first.getFullYear() === second.getFullYear() &&
    first.getMonth() === second.getMonth() &&
    first.getDate() === second.getDate()
  );
}

function formatRange(range: DateRange) {
  if (range.start.getMonth() === range.end.getMonth()) {
    return `${String(range.start.getDate()).padStart(2, "0")}–${String(range.end.getDate()).padStart(2, "0")} ${shortMonthNames[range.end.getMonth()]}`;
  }

  return `${range.start.getDate()} ${shortMonthNames[range.start.getMonth()]} – ${range.end.getDate()} ${shortMonthNames[range.end.getMonth()]}`;
}

function DateRangePicker({
  value,
  onApply,
  onClose,
}: {
  value: DateRange;
  onApply: (range: DateRange) => void;
  onClose: () => void;
}) {
  const [month, setMonth] = useState(new Date(value.start.getFullYear(), value.start.getMonth(), 1));
  const [draftStart, setDraftStart] = useState<Date | null>(value.start);
  const [draftEnd, setDraftEnd] = useState<Date | null>(value.end);

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [onClose]);

  const firstWeekday = (new Date(month.getFullYear(), month.getMonth(), 1).getDay() + 6) % 7;
  const cells = Array.from({ length: 42 }, (_, index) => {
    const day = index - firstWeekday + 1;
    return new Date(month.getFullYear(), month.getMonth(), day);
  });

  const selectDate = (date: Date) => {
    if (!draftStart || draftEnd) {
      setDraftStart(date);
      setDraftEnd(null);
      return;
    }

    if (date < draftStart) {
      setDraftEnd(draftStart);
      setDraftStart(date);
    } else {
      setDraftEnd(date);
    }
  };

  return (
    <div
      className="calendar-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section className="calendar-dialog" role="dialog" aria-modal="true" aria-label="Выбор периода">
        <div className="calendar-heading">
          <div>
            <span>Выберите период</span>
            <strong>
              {draftStart ? draftStart.toLocaleDateString("ru-RU", { day: "numeric", month: "short" }) : "Начало"}
              <i>—</i>
              {draftEnd ? draftEnd.toLocaleDateString("ru-RU", { day: "numeric", month: "short" }) : "Конец"}
            </strong>
          </div>
          <button aria-label="Закрыть календарь" className="calendar-close" onClick={onClose} type="button">
            <Icon name="close" />
          </button>
        </div>

        <div className="month-nav">
          <button
            aria-label="Предыдущий месяц"
            onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}
            type="button"
          >
            <Icon name="arrow" />
          </button>
          <strong>
            {monthNames[month.getMonth()]} {month.getFullYear()}
          </strong>
          <button
            aria-label="Следующий месяц"
            onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}
            type="button"
          >
            <span className="next-arrow">
              <Icon name="arrow" />
            </span>
          </button>
        </div>

        <div className="weekdays" aria-hidden="true">
          {["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"].map((day) => (
            <span key={day}>{day}</span>
          ))}
        </div>

        <div className="calendar-grid">
          {cells.map((date) => {
            const outside = date.getMonth() !== month.getMonth();
            const isStart = draftStart ? sameDay(date, draftStart) : false;
            const isEnd = draftEnd ? sameDay(date, draftEnd) : false;
            const inRange = draftStart && draftEnd && date > draftStart && date < draftEnd;

            return (
              <button
                aria-label={date.toLocaleDateString("ru-RU", {
                  day: "numeric",
                  month: "long",
                  year: "numeric",
                })}
                className={`${outside ? "outside" : ""} ${isStart || isEnd ? "selected" : ""} ${inRange ? "in-range" : ""}`}
                key={date.toISOString()}
                onClick={() => selectDate(date)}
                type="button"
              >
                {date.getDate()}
              </button>
            );
          })}
        </div>

        <div className="calendar-actions">
          <button className="secondary-action" onClick={onClose} type="button">
            Отмена
          </button>
          <button
            className="primary-action"
            disabled={!draftStart || !draftEnd}
            onClick={() => draftStart && draftEnd && onApply({ start: draftStart, end: draftEnd })}
            type="button"
          >
            Применить
          </button>
        </div>
      </section>
    </div>
  );
}

function WorkspaceActions({
  warehouse,
  onWarehouseChange,
}: {
  warehouse: string;
  onWarehouseChange: (warehouse: string) => void;
}) {
  const [warehouseOpen, setWarehouseOpen] = useState(false);

  return (
    <section className="workspace-actions" aria-label="Управление данными">
      <div className="warehouse-wrap">
        <button
          aria-expanded={warehouseOpen}
          className={`warehouse-button ${warehouseOpen ? "active" : ""}`}
          onClick={() => setWarehouseOpen((current) => !current)}
          type="button"
        >
          <Icon name="database" />
          <span>
            <small>Склад</small>
            <strong>{warehouse}</strong>
          </span>
          <Icon name="chevron" />
        </button>

        {warehouseOpen && (
          <div className="warehouse-popover">
            <strong>Выберите склад</strong>
            {warehouseNames.map((item) => (
              <button
                className={warehouse === item ? "selected" : ""}
                key={item}
                onClick={() => {
                  onWarehouseChange(item);
                  setWarehouseOpen(false);
                }}
                type="button"
              >
                <span>{item}</span>
                <i />
              </button>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

function ProductCard({
  product,
  expanded,
  onToggle,
  showPrices,
  compact,
  turnoverData,
}: {
  product: StockApiItem;
  expanded: boolean;
  onToggle: () => void;
  showPrices: boolean;
  compact: boolean;
  turnoverData?: any;
}) {
  const start = product.startQuantity ?? 0;
  const end = product.quantity ?? 0;
  const delta = end - start;
  const deltaSign = delta > 0 ? "+" : delta < 0 ? "−" : "";
  const deltaLabel = `${deltaSign}${numberFormatter.format(Math.abs(delta))} ${product.unit}`.trim();

  const turnover = turnoverData?.find((row: any) => String(row.id || row.code || row.name || "") === String(product.id || product.productNum || product.productName || ""));
  const sales = Number(turnover?.salesQty || 0);
  const purchase = Number(turnover?.purchaseQty || 0);

  return (
    <article className={`product-card ${expanded ? "is-expanded" : ""} ${compact ? "is-compact" : ""}`}>
      <button className="card-trigger" onClick={onToggle} type="button" aria-expanded={expanded}>
        <span className="card-title">{product.productName}</span>
        <span className="chevron">
          <Icon name="chevron" />
        </span>
      </button>

      <div className="comparison">
        <div className="metric">
          <span className="metric-label">Начало периода</span>
          <strong>{formatQuantity(product.startQuantity, product.unit)}</strong>
        </div>
        <div className="flow-arrow" aria-hidden="true">
          <span />
          <b>›</b>
        </div>
        <div className="metric metric-right">
          <span className="metric-label">Конец периода</span>
          <strong>{formatQuantity(product.quantity, product.unit)}</strong>
          {showPrices && <span className="metric-cost">{formatMoney(product.endSum)}</span>}
        </div>
      </div>

      <div className="change">
        <span>Изменение</span>
        <b>{deltaLabel || "0"}</b>
        {product.balanceStatus !== "ok" && (
          <>
            <span>·</span>
            <span>нет остатка на складе</span>
          </>
        )}
      </div>

      {expanded && (
        <div className="details">
          <div>
            <span>Группа</span>
            <b>{product.group || "—"}</b>
            <small>{product.secondGroup || ""}</small>
          </div>
          {purchase > 0 && (
            <div>
              <span>Приход за период</span>
              <b>{formatQuantity(purchase, product.unit)}</b>
            </div>
          )}
          {sales > 0 && (
            <div>
              <span>Продажи за период</span>
              <b>{formatQuantity(sales, product.unit)}</b>
            </div>
          )}
          {showPrices && (
            <div>
              <span>Сумма на конец</span>
              <b>{formatMoney(product.endSum)}</b>
            </div>
          )}
        </div>
      )}
    </article>
  );
}

function NomenclaturePage({
  warehouse,
  onWarehouseChange,
  recipes,
}: {
  warehouse: string;
  onWarehouseChange: (warehouse: string) => void;
  recipes: any[];
}) {
  const [query, setQuery] = useState("");
  const [openRecipe, setOpenRecipe] = useState<number | null>(0);

  const visibleRecipes = (recipes || []).filter((recipe) =>
    String(recipe.name || recipe.productName || "").toLocaleLowerCase("ru-RU").includes(query.toLocaleLowerCase("ru-RU")),
  );

  return (
    <>
      <header className="section-topbar">
        <div>
          <p className="eyebrow">Меню и технологические карты</p>
          <p className="page-title">Номенклатура</p>
        </div>
        <button className="primary-page-action" type="button">
          <Icon name="plus" />
          <span>Новый рецепт</span>
        </button>
      </header>

      <WorkspaceActions warehouse={warehouse} onWarehouseChange={onWarehouseChange} />

      <section className="toolbar page-toolbar" aria-label="Поиск рецептов">
        <label className="search-field">
          <Icon name="search" />
          <input
            aria-label="Поиск по номенклатуре"
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Найти позицию"
            value={query}
          />
          {query && (
            <button aria-label="Очистить поиск" onClick={() => setQuery("")} type="button">
              <Icon name="close" />
            </button>
          )}
        </label>
        <span className="results-count">{visibleRecipes.length} позиций</span>
      </section>

      <section className="catalog-stats" aria-label="Сводка по номенклатуре">
        <div>
          <span>Всего позиций</span>
          <strong>{recipes.length}</strong>
        </div>
        <div>
          <span>Блюд</span>
          <strong>{(recipes || []).filter((x) => x.type === "DISH").length}</strong>
        </div>
        <div>
          <span>Товаров</span>
          <strong>{(recipes || []).filter((x) => x.type === "GOODS").length}</strong>
        </div>
      </section>

      <section className="recipe-list" aria-label="Номенклатура">
        {visibleRecipes.length ? (
          visibleRecipes.map((recipe, index) => {
            const ingredients = recipe.ingredients || [];
            return (
              <article className={`recipe-card ${openRecipe === index ? "is-expanded" : ""}`} key={recipe.id || recipe.name || index}>
                <button className="recipe-trigger" onClick={() => setOpenRecipe(openRecipe === index ? null : index)} type="button">
                  <span className="recipe-icon">
                    <Icon name="recipe" />
                  </span>
                  <span className="recipe-name">
                    <small>{recipe.category || recipe.type || "Номенклатура"}</small>
                    <strong>{recipe.name || recipe.productName || "Без названия"}</strong>
                  </span>
                  <span className="recipe-yield">
                    <small>Выход</small>
                    <strong>{recipe.unit || "шт"}</strong>
                  </span>
                  <span className="recipe-cost">
                    <small>Цена</small>
                    <strong>{recipe.menuPrice ? `${moneyFormatter.format(recipe.menuPrice)} ₽` : "—"}</strong>
                  </span>
                  <span className="chevron">
                    <Icon name="chevron" />
                  </span>
                </button>

                {openRecipe === index && (
                  <div className="recipe-details">
                    {ingredients.length > 0 ? (
                      <>
                        <span>Состав · {ingredients.length} ингредиентов</span>
                        <div>
                          {ingredients.map((ing, idx) => (
                            <b key={idx}>
                              {ing.name || ing.productId || "Ингредиент"} — {ing.gross || ing.amount || 0}{" "}
                              {ing.unit || ""}
                            </b>
                          ))}
                        </div>
                      </>
                    ) : (
                      <>
                        <span>Информация</span>
                        <div>
                          <b>Себестоимость: {recipe.costPrice ? `${moneyFormatter.format(recipe.costPrice)} ₽` : "—"}</b>
                          <b>Тип: {recipe.type || "GOODS"}</b>
                        </div>
                      </>
                    )}
                    <button type="button">
                      Открыть карточку <span>→</span>
                    </button>
                  </div>
                )}
              </article>
            );
          })
        ) : (
          <div className="empty-state">
            <strong>Ничего не найдено</strong>
            <span>Измените поисковый запрос</span>
          </div>
        )}
      </section>
    </>
  );
}

function DocumentsPage({
  warehouse,
  onWarehouseChange,
  period,
  onOpenCalendar,
  documents,
}: {
  warehouse: string;
  onWarehouseChange: (warehouse: string) => void;
  period: DateRange;
  onOpenCalendar: () => void;
  documents: any[];
}) {
  const [filter, setFilter] = useState("Все");
  const [expandedDoc, setExpandedDoc] = useState<number | null>(null);

  const filtered =
    filter === "Все"
      ? documents
      : documents.filter((document) => String(document.type || "").includes(filter));

  return (
    <>
      <header className="section-topbar">
        <div>
          <p className="eyebrow">Складской учёт</p>
          <p className="page-title">Документы</p>
        </div>
        <div className="header-actions">
          <button className="period-button" onClick={onOpenCalendar} type="button">
            <Icon name="calendar" />
            <span>{formatRange(period)}</span>
          </button>
          <button className="primary-page-action" type="button">
            <Icon name="plus" />
            <span>Создать</span>
          </button>
        </div>
      </header>

      <WorkspaceActions warehouse={warehouse} onWarehouseChange={onWarehouseChange} />

      <section className="document-summary" aria-label="Сводка документов">
        <div>
          <span>Документов</span>
          <strong>{documents.length}</strong>
          <small>за период</small>
        </div>
        <div>
          <span>Сумма</span>
          <strong>{formatMoney(documents.reduce((sum, item) => sum + (Number(item.sum) || 0), 0))}</strong>
          <small>по документам</small>
        </div>
      </section>

      <div className="filter-chips" role="group" aria-label="Фильтр документов">
        {["Все", "Приход", "Списание", "Инвентаризация"].map((item) => (
          <button className={filter === item ? "active" : ""} key={item} onClick={() => setFilter(item)} type="button">
            {item}
          </button>
        ))}
      </div>

      <section className="document-list" aria-label="Документы">
        <div className="list-heading">
          <span>Последние операции</span>
          <small>{filtered.length} документов</small>
        </div>

        {filtered.length ? (
          filtered.map((document, index) => {
            const items = document.items || [];
            return (
              <article key={document.id || document.number || index}>
                <div className="document-card">
                  <div className="document-mark">
                    <Icon name="document" />
                  </div>

                  <div className="document-main">
                    <small>
                      {document.number || "—"} ·{" "}
                      {document.dateIncoming
                        ? new Date(document.dateIncoming).toLocaleDateString("ru-RU")
                        : document.date
                          ? new Date(document.date).toLocaleDateString("ru-RU")
                          : "—"}
                    </small>
                    <strong>{document.type || "Приходная накладная"}</strong>
                    <span>{document.counterparty || document.supplierName || "—"}</span>
                  </div>

                  <div className="document-meta">
                    <strong>{formatMoney(document.sum || 0)}</strong>
                    <span className={`status ${document.status === "Черновик" ? "draft" : "positive"}`}>
                      {document.status || "Проведён"}
                    </span>
                  </div>

                  <button
                    aria-label={`Развернуть документ ${document.number || index}`}
                    className="document-menu"
                    type="button"
                    onClick={() => setExpandedDoc(expandedDoc === index ? null : index)}
                  >
                    <Icon name={expandedDoc === index ? "chevron" : "dots"} />
                  </button>
                </div>

                {expandedDoc === index && items.length > 0 && (
                  <div className="document-detail">
                    <div className="document-items-title">Позиции · {items.length}</div>
                    <div className="document-items">
                      {items.map((item, idx) => (
                        <div className="document-item" key={idx}>
                          <div className="document-item__name">
                            <strong>{item.name || item.productId || "Позиция"}</strong>
                            <span>{item.code || ""}</span>
                          </div>
                          <div className="document-item__qty">
                            <strong>{numberFormatter.format(item.amount || 0)}</strong>
                            <span>{item.unitName || "шт"}</span>
                          </div>
                          <div className="document-item__cost">
                            <strong>{formatMoney(item.costPrice || 0)}</strong>
                            <span>за единицу</span>
                          </div>
                          <div className="document-item__sum">
                            {formatMoney((Number(item.amount || 0) * Number(item.costPrice || 0)) || 0)}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </article>
            );
          })
        ) : (
          <div className="empty-state">
            <strong>Документов не найдено</strong>
            <span>Попробуйте изменить период или склад</span>
          </div>
        )}
      </section>
    </>
  );
}

function AnalyticsPage({
  period,
  onOpenCalendar,
  warehouse,
  onWarehouseChange,
  dashboard,
}: {
  period: DateRange;
  onOpenCalendar: () => void;
  warehouse: string;
  onWarehouseChange: (warehouse: string) => void;
  dashboard: any;
}) {
  const summary = dashboard?.summary || {};
  const stores = dashboard?.stores || [];
  const topDecrease = dashboard?.topDecrease || [];
  const topWriteoff = dashboard?.topWriteoff || [];
  const topStock = dashboard?.topStock || [];

  return (
    <>
      <header className="section-topbar">
        <div>
          <p className="eyebrow">Ключевые показатели</p>
          <p className="page-title">Аналитика</p>
        </div>
        <button className="period-button" onClick={onOpenCalendar} type="button">
          <Icon name="calendar" />
          <span>{formatRange(period)}</span>
        </button>
      </header>

      <WorkspaceActions warehouse={warehouse} onWarehouseChange={onWarehouseChange} />

      <section className="analytics-kpis" aria-label="Ключевые показатели">
        <article>
          <span>Запасы сейчас</span>
          <strong>{formatMoney(summary.closeValue || 0)}</strong>
          <small>{summary.storesCount || stores.length || 0} склад(а)</small>
        </article>
        <article>
          <span>Изменение запасов</span>
          <strong>
            {summary.deltaValue ? `${summary.deltaValue > 0 ? "+" : ""}${formatMoney(summary.deltaValue)}` : "0 ₽"}
          </strong>
          <small>по себестоимости</small>
        </article>
        <article>
          <span>Приход</span>
          <strong>{formatMoney(Math.abs(Number(summary.incomingValue || 0)))}</strong>
          <small>по себестоимости</small>
        </article>
        <article>
          <span>Расход по продажам</span>
          <strong>{formatMoney(Math.abs(Number(summary.salesCost || 0)))}</strong>
          <small>по себестоимости</small>
        </article>
        <article>
          <span>Списания</span>
          <strong>{formatMoney(summary.writeoffCost || 0)}</strong>
          <small>по себестоимости</small>
        </article>
        <article>
          <span>Проблем</span>
          <strong>{(summary.negativeCount || 0) + (summary.ranOutCount || 0)}</strong>
          <small>требуют внимания</small>
        </article>
      </section>

      {stores.length > 0 && (
        <section className="revenue-chart" aria-label="Данные по складам">
          <div className="analytics-heading">
            <div>
              <span>Склады</span>
              <strong>Стоимость запасов</strong>
            </div>
            <b>{formatMoney(summary.closeValue || 0)}</b>
          </div>

          <div className="chart-area">
            {stores.map((store, index) => {
              const maxValue = Math.max(
                1,
                ...stores.map((item) => Math.abs(Number(item.closeValue || 0))),
              );
              const width = Math.max(
                10,
                Math.min(100, (Math.abs(Number(store.closeValue || 0)) / maxValue) * 100),
              );

              return (
                <div className="chart-column" key={store.name || index}>
                  <span className={`bar-${Math.min(100, Math.max(10, Math.round(width)))}`} />
                  <small>{store.name || "Склад"}</small>
                </div>
              );
            })}
          </div>
        </section>
      )}

      <div className="analytics-grid">
        <section className="top-products" aria-label="Ключевые проблемы">
          <div className="analytics-heading">
            <div>
              <span>Требует внимания</span>
              <strong>Сводка</strong>
            </div>
          </div>

          <div className="product-ranking">
            <div>
              <b>1</b>
              <span>
                <strong>Отрицательные остатки</strong>
              </span>
              <small>{summary.negativeCount || 0}</small>
            </div>
            <div>
              <b>2</b>
              <span>
                <strong>Закончились</strong>
              </span>
              <small>{summary.ranOutCount || 0}</small>
            </div>
            <div>
              <b>3</b>
              <span>
                <strong>Продано за период</strong>
              </span>
              <small>{formatMoney(summary.salesCost || 0)}</small>
            </div>
          </div>
        </section>

        <section className="stock-health" aria-label="Состояние остатков">
          <div className="analytics-heading">
            <div>
              <span>Состояние остатков</span>
              <strong>{summary.negativeCount || 0} проблем</strong>
            </div>
          </div>

          <div className="health-ring">
            <strong>{Math.max(0, 100 - ((summary.negativeCount || 0) + (summary.ranOutCount || 0)) * 5)}%</strong>
            <span>в норме</span>
          </div>

          <div className="health-legend">
            <div>
              <i className="healthy" />
              <span>В норме</span>
              <b>{Math.max(0, 100 - ((summary.negativeCount || 0) + (summary.ranOutCount || 0)) * 5)}</b>
            </div>
            <div>
              <i className="low" />
              <span>Заканчиваются</span>
              <b>{summary.ranOutCount || 0}</b>
            </div>
            <div>
              <i className="critical" />
              <span>Нет в наличии</span>
              <b>{summary.negativeCount || 0}</b>
            </div>
          </div>
        </section>
      </div>

      {topDecrease.length > 0 && (
        <section className="top-products" aria-label="Наибольшее снижение запасов">
          <div className="analytics-heading">
            <div>
              <span>Наибольшее снижение запасов</span>
              <strong>По себестоимости</strong>
            </div>
          </div>

          <div className="product-ranking">
            {topDecrease.slice(0, 5).map((item, idx) => (
              <div key={idx}>
                <b>{idx + 1}</b>
                <span>
                  <strong>{item.name || "Товар"}</strong>
                  <i>
                    <em className={`share-${Math.min(100, Math.max(10, Math.round((item.rankValue || 0) / 10)))}`} />
                  </i>
                </span>
                <small>{formatMoney(item.rankValue || 0)}</small>
              </div>
            ))}
          </div>
        </section>
      )}

      {topWriteoff.length > 0 && (
        <section className="top-products" aria-label="Больше всего списали">
          <div className="analytics-heading">
            <div>
              <span>Больше всего списали</span>
              <strong>По себестоимости</strong>
            </div>
          </div>

          <div className="product-ranking">
            {topWriteoff.slice(0, 5).map((item, idx) => (
              <div key={idx}>
                <b>{idx + 1}</b>
                <span>
                  <strong>{item.name || "Товар"}</strong>
                  <i>
                    <em className={`share-${Math.min(100, Math.max(10, Math.round((item.rankValue || 0) / 10)))}`} />
                  </i>
                </span>
                <small>{formatMoney(item.rankValue || 0)}</small>
              </div>
            ))}
          </div>
        </section>
      )}

      {topStock.length > 0 && (
        <section className="top-products" aria-label="Самые дорогие остатки">
          <div className="analytics-heading">
            <div>
              <span>Самые дорогие остатки</span>
              <strong>Стоимость</strong>
            </div>
          </div>

          <div className="product-ranking">
            {topStock.slice(0, 5).map((item, idx) => (
              <div key={idx}>
                <b>{idx + 1}</b>
                <span>
                  <strong>{item.name || "Товар"}</strong>
                  <i>
                    <em className={`share-${Math.min(100, Math.max(10, Math.round((item.rankValue || 0) / 10)))}`} />
                  </i>
                </span>
                <small>{formatMoney(item.rankValue || 0)}</small>
              </div>
            ))}
          </div>
        </section>
      )}
    </>
  );
}

function AuthPage({ onLogin }: { onLogin: () => void }) {
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");

  return (
    <main className="auth-page">
      <section className="auth-card" aria-label="Авторизация">
        <div className="auth-brand">
          <span className="auth-logo">
            <Icon name="database" />
          </span>
          <div>
            <small>Складской учёт</small>
            <strong>Остатки</strong>
          </div>
        </div>

        <div className="auth-heading">
          <span>Добро пожаловать</span>
          <strong>Войдите в аккаунт</strong>
          <p>Управляйте остатками, документами и аналитикой в одном месте.</p>
        </div>

        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (login.trim() && password.trim()) onLogin();
          }}
        >
          <label className="auth-field">
            <span>Логин</span>
            <div>
              <Icon name="user" />
              <input
                autoComplete="username"
                onChange={(event) => setLogin(event.target.value)}
                placeholder="Введите логин"
                required
                value={login}
              />
            </div>
          </label>

          <label className="auth-field">
            <span>Пароль</span>
            <div>
              <Icon name="lock" />
              <input
                autoComplete="current-password"
                onChange={(event) => setPassword(event.target.value)}
                placeholder="Введите пароль"
                required
                type="password"
                value={password}
              />
            </div>
          </label>

          <div className="auth-meta">
            <label>
              <input type="checkbox" />
              <span>Запомнить меня</span>
            </label>
            <button type="button">Забыли пароль?</button>
          </div>

          <button className="login-button" type="submit">
            Войти
          </button>
        </form>

        <p className="auth-help">Нет доступа? Обратитесь к администратору организации.</p>
      </section>

      <div className="auth-aside">
        <span>Единое пространство для контроля бизнеса</span>
        <strong>Данные склада всегда под рукой</strong>
        <div>
          <p>
            <b>48</b>
            <small>позиций</small>
          </p>
          <p>
            <b>4</b>
            <small>раздела</small>
          </p>
          <p>
            <b>24/7</b>
            <small>контроль</small>
          </p>
        </div>
      </div>
    </main>
  );
}

export default function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [activePage, setActivePage] = useState<"catalog" | "stock" | "documents" | "reports">("stock");
  const [warehouse, setWarehouse] = useState(ALL_WAREHOUSES_LABEL);
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState<number | null>(0);

  // Дата подгружается сегодняшняя
  const today = new Date();
  const [period, setPeriod] = useState<DateRange>({
    start: today,
    end: today,
  });

  const [calendarOpen, setCalendarOpen] = useState(false);
  const [showPrices, setShowPrices] = useState(true);
  const [compactCards, setCompactCards] = useState(false);
  const [dockSettingsOpen, setDockSettingsOpen] = useState(false);

  const [stockItems, setStockItems] = useState<StockApiItem[]>([]);
  const [stockMeta, setStockMeta] = useState<{ time: string } | null>(null);
  const [stockLoading, setStockLoading] = useState(false);
  const [stockError, setStockError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);
  const [turnoverData, setTurnoverData] = useState<any[]>([]);

  const [documentsData, setDocumentsData] = useState<any[]>([]);
  const [documentsLoading, setDocumentsLoading] = useState(false);
  const [documentsError, setDocumentsError] = useState<string | null>(null);

  const [nomenclatureItems, setNomenclatureItems] = useState<any[]>([]);
  const [nomenclatureLoading, setNomenclatureLoading] = useState(false);
  const [nomenclatureError, setNomenclatureError] = useState<string | null>(null);

  const [dashboardData, setDashboardData] = useState<any>(null);
  const [dashboardLoading, setDashboardLoading] = useState(false);
  const [dashboardError, setDashboardError] = useState<string | null>(null);

  const refreshing = stockLoading;

  useEffect(() => {
    if (activePage !== "stock") return;

    const controller = new AbortController();
    setStockLoading(true);
    setStockError(null);

    const request =
      warehouse === ALL_WAREHOUSES_LABEL
        ? fetchLiveStockMerged(controller.signal)
        : fetchLiveStockForStore(warehouse, controller.signal);

    request
      .then((payload) => {
        setStockItems(payload.items);
        setStockMeta({ time: payload.time });
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setStockError(error instanceof Error ? error.message : String(error));
      })
      .finally(() => {
        if (!controller.signal.aborted) setStockLoading(false);
      });

    return () => controller.abort();
  }, [activePage, warehouse, reloadToken]);

  useEffect(() => {
    if (activePage !== "stock") return;

    (async () => {
      try {
        const from = isoDateLocal(period.start);
        const to = isoDateLocal(period.end);
        const payload = await fetchTurnover(from, to, warehouse);
        setTurnoverData(payload.rows || []);
      } catch (error) {
        console.error("Turnover error:", error);
      }
    })();
  }, [activePage, warehouse, period.start, period.end]);

  useEffect(() => {
    if (activePage !== "documents") return;

    (async () => {
      try {
        setDocumentsLoading(true);
        setDocumentsError(null);

        const from = isoDateLocal(period.start);
        const to = isoDateLocal(period.end);

        const payload = await fetchDocumentsForPeriod(from, to, warehouse);
        setDocumentsData(payload.documents || payload.items || []);
      } catch (error) {
        setDocumentsError(error instanceof Error ? error.message : String(error));
      } finally {
        setDocumentsLoading(false);
      }
    })();
  }, [activePage, warehouse, period.start, period.end]);

  useEffect(() => {
    if (activePage !== "catalog") return;

    (async () => {
      try {
        setNomenclatureLoading(true);
        setNomenclatureError(null);

        const payload = await fetchNomenclature();
        setNomenclatureItems(payload.items || payload.dishes || []);
      } catch (error) {
        setNomenclatureError(error instanceof Error ? error.message : String(error));
      } finally {
        setNomenclatureLoading(false);
      }
    })();
  }, [activePage]);

  useEffect(() => {
    if (activePage !== "reports") return;

    (async () => {
      try {
        setDashboardLoading(true);
        setDashboardError(null);

        const from = isoDateLocal(period.start);
        const to = isoDateLocal(period.end);

        const payload = await fetchDashboard(from, to, warehouse);
        setDashboardData(payload);
      } catch (error) {
        setDashboardError(error instanceof Error ? error.message : String(error));
      } finally {
        setDashboardLoading(false);
      }
    })();
  }, [activePage, warehouse, period.start, period.end]);

  const filteredProducts = useMemo(
    () =>
      stockItems.filter((item) =>
        item.productName.toLocaleLowerCase("ru-RU").includes(query.toLocaleLowerCase("ru-RU")),
      ),
    [stockItems, query],
  );

  const stockTotals = useMemo(
    () =>
      stockItems.reduce(
        (acc, item) => {
          acc.endSum += item.endSum ?? 0;
          return acc;
        },
        { endSum: 0 },
      ),
    [stockItems],
  );

  const refreshData = () => {
    if (refreshing) return;
    setReloadToken((token) => token + 1);
  };

  if (!isAuthenticated) {
    return <AuthPage onLogin={() => setIsAuthenticated(true)} />;
  }

  return (
    <main className="app-shell">
      <div className="page">
        {activePage === "catalog" && (
          <>
            {nomenclatureLoading && (
              <div className="empty-state">
                <strong>Загрузка номенклатуры…</strong>
              </div>
            )}
            {nomenclatureError && (
              <div className="empty-state">
                <strong>Не удалось загрузить номенклатуру</strong>
                <span>{nomenclatureError}</span>
              </div>
            )}
            {!nomenclatureLoading && !nomenclatureError && (
              <NomenclaturePage
                warehouse={warehouse}
                onWarehouseChange={setWarehouse}
                recipes={nomenclatureItems}
              />
            )}
          </>
        )}

        {activePage === "documents" && (
          <>
            {documentsLoading && (
              <div className="empty-state">
                <strong>Загрузка документов…</strong>
              </div>
            )}
            {documentsError && (
              <div className="empty-state">
                <strong>Не удалось загрузить документы</strong>
                <span>{documentsError}</span>
              </div>
            )}
            {!documentsLoading && !documentsError && (
              <DocumentsPage
                warehouse={warehouse}
                onWarehouseChange={setWarehouse}
                period={period}
                onOpenCalendar={() => setCalendarOpen(true)}
                documents={documentsData}
              />
            )}
          </>
        )}

        {activePage === "reports" && (
          <>
            {dashboardLoading && (
              <div className="empty-state">
                <strong>Собираем дашборд…</strong>
              </div>
            )}
            {dashboardError && (
              <div className="empty-state">
                <strong>Не удалось загрузить дашборд</strong>
                <span>{dashboardError}</span>
              </div>
            )}
            {!dashboardLoading && !dashboardError && (
              <AnalyticsPage
                period={period}
                onOpenCalendar={() => setCalendarOpen(true)}
                warehouse={warehouse}
                onWarehouseChange={setWarehouse}
                dashboard={dashboardData}
              />
            )}
          </>
        )}

        {activePage === "stock" && (
          <>
            <header className="topbar">
              <div>
                <p className="eyebrow">Оборотно-сальдовая ведомость</p>
                <p className="page-title">Остатки</p>
              </div>
              <button
                className="period-button"
                onClick={() => setCalendarOpen(true)}
                type="button"
                aria-expanded={calendarOpen}
              >
                <Icon name="calendar" />
                <span>{formatRange(period)}</span>
              </button>
            </header>

            <WorkspaceActions warehouse={warehouse} onWarehouseChange={setWarehouse} />

            <section className="toolbar" aria-label="Фильтры">
              <label className="search-field">
                <Icon name="search" />
                <input
                  aria-label="Поиск по товару"
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Поиск по товару"
                  value={query}
                />
                {query && (
                  <button aria-label="Очистить поиск" onClick={() => setQuery("")} type="button">
                    <Icon name="close" />
                  </button>
                )}
              </label>
              <span className="results-count">
                {stockLoading ? "Загрузка…" : `${filteredProducts.length} позиций`}
              </span>
            </section>

            {stockError && (
              <div className="empty-state" role="alert">
                <strong>Не удалось загрузить остатки</strong>
                <span>{stockError}</span>
              </div>
            )}

            {showPrices && !stockError && (
              <section className="summary" aria-label="Стоимость за период">
                <div>
                  <span>Склад</span>
                  <strong>{warehouse}</strong>
                </div>
                <div className="summary-change">
                  <span>Обновлено</span>
                  <b>
                    {stockMeta
                      ? new Date(stockMeta.time).toLocaleTimeString("ru-RU", {
                          hour: "2-digit",
                          minute: "2-digit",
                        })
                      : "—"}
                  </b>
                </div>
                <div className="summary-end">
                  <span>Сумма остатка</span>
                  <strong>{formatMoney(stockTotals.endSum)}</strong>
                </div>
              </section>
            )}

            {!stockError && (
              <section className="list" aria-label="Остатки товаров">
                {filteredProducts.map((product, index) => (
                  <ProductCard
                    expanded={expanded === index}
                    key={`${product.id}-${index}`}
                    onToggle={() => setExpanded(expanded === index ? null : index)}
                    product={product}
                    showPrices={showPrices}
                    compact={compactCards}
                    turnoverData={turnoverData}
                  />
                ))}

                {!stockLoading && filteredProducts.length === 0 && (
                  <div className="empty-state">
                    <strong>Ничего не найдено</strong>
                    <span>Попробуйте изменить поисковый запрос или склад</span>
                  </div>
                )}
              </section>
            )}
          </>
        )}
      </div>

      <nav className="bottom-nav" aria-label="Основная навигация">
        <div className="dock-brand" aria-hidden="true">
          <span>
            <Icon name="database" />
          </span>
          <div>
            <strong>Склад</strong>
            <small>Управление</small>
          </div>
        </div>

        <button
          className={activePage === "catalog" ? "active" : ""}
          onClick={() => setActivePage("catalog")}
          type="button"
        >
          <Icon name="inventory" />
          <span className="nav-label">Номенклатура</span>
        </button>

        <button
          className={activePage === "stock" ? "active" : ""}
          onClick={() => setActivePage("stock")}
          type="button"
        >
          <Icon name="database" />
          <span className="nav-label">Остатки</span>
        </button>

        <button
          className={activePage === "documents" ? "active" : ""}
          onClick={() => setActivePage("documents")}
          type="button"
        >
          <Icon name="document" />
          <span className="nav-label">Документы</span>
        </button>

        <button
          className={activePage === "reports" ? "active" : ""}
          onClick={() => setActivePage("reports")}
          type="button"
        >
          <Icon name="chart" />
          <span className="nav-label">Аналитика</span>
        </button>

        <span className="dock-divider" aria-hidden="true" />

        <button
          aria-label="Обновить данные"
          className="dock-action"
          disabled={refreshing}
          onClick={refreshData}
          title="Обновить данные"
          type="button"
        >
          <span className={refreshing ? "is-spinning" : ""}>
            <Icon name="refresh" />
          </span>
        </button>

        <button
          aria-expanded={dockSettingsOpen}
          aria-label="Настройки"
          className={`dock-action ${dockSettingsOpen ? "active" : ""}`}
          onClick={() => setDockSettingsOpen((current) => !current)}
          title="Настройки"
          type="button"
        >
          <Icon name="settings" />
        </button>

        {dockSettingsOpen && (
          <div className="dock-settings">
            <strong>Настройки отображения</strong>

            <button onClick={() => setShowPrices((current) => !current)} type="button">
              <span>Показывать стоимость</span>
              <i className={showPrices ? "enabled" : ""}>
                <b />
              </i>
            </button>

            <button onClick={() => setCompactCards((current) => !current)} type="button">
              <span>Компактные карточки</span>
              <i className={compactCards ? "enabled" : ""}>
                <b />
              </i>
            </button>

            <button
              className="logout-button"
              onClick={() => {
                setDockSettingsOpen(false);
                setIsAuthenticated(false);
              }}
              type="button"
            >
              <span>
                <Icon name="logout" />
                Выйти из аккаунта
              </span>
            </button>
          </div>
        )}
      </nav>

      {calendarOpen && (
        <DateRangePicker
          onApply={(range) => {
            setPeriod(range);
            setCalendarOpen(false);
          }}
          onClose={() => setCalendarOpen(false)}
          value={period}
        />
      )}
    </main>
  );
}
