import { NavigationIcon } from "./NavigationIcon";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import "./App.additions.css";
import { createRequestCache } from "./request-cache";
import { createRequestGate, mapSequential } from "./request-gate";
import { catalogPrice } from "./catalog-price";

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

const WORKER_URL = import.meta.env.DEV ? "/worker" : "https://iiko-miniapp-proxy.iiko-miniapp-proxy.workers.dev";

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

const TURNOVER_FIELDS = [
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
] as const;

type TurnoverField = (typeof TURNOVER_FIELDS)[number];

type TurnoverRow = {
  id?: string;
  code?: string;
  name?: string;
  unit?: string;
  category?: string;
} & Partial<Record<TurnoverField, number>>;

type TurnoverResponse = {
  ok: boolean;
  storeName: string;
  period: { from: string; to: string };
  rows: TurnoverRow[];
};

type IncomingStoreRef = { id?: string; name: string };

type IncomingDocument = {
  id: string;
  number?: string;
  invoiceIncomingNumber?: string;
  date: string;
  supplierId?: string;
  supplierName?: string;
  summary?: string;
  stores?: IncomingStoreRef[];
  sum: number;
  hasDifference?: boolean;
};

type IncomingListResponse = {
  ok: boolean;
  documents: IncomingDocument[];
  summary?: { sum?: number };
};

type IncomingItem = {
  productId?: string;
  productName?: string;
  productNum?: string;
  code?: string;
  unit?: string;
  amount?: number;
  price?: number;
  sum?: number;
  ndsPercent?: number;
};

type IncomingDetail = {
  id?: string;
  number?: string;
  date: string;
  invoice?: string;
  total?: number;
  storeName?: string;
  supplierId?: string;
  supplierName?: string;
  status?: string;
  items?: IncomingItem[];
};

type NomenclatureIngredient = {
  productId?: string;
  name?: unknown;
  unit?: string;
  amount?: number;
  gross?: number;
  net?: number;
  out?: number;
};

type NomenclatureItem = {
  id: string;
  name?: unknown;
  code?: string;
  num?: string;
  category?: string;
  type?: string;
  unit?: string;
  menuPrice?: number;
  menuPriceStatus?: string;
  costPrice?: number;
  assembledAmount?: number;
  warning?: string;
  priceWarning?: string;
  technology?: string;
  recipeDateFrom?: string;
  recipeDateTo?: string;
  ingredients?: NomenclatureIngredient[];
};

type DashboardRow = {
  name?: string;
  storeName?: string;
  productNum?: string;
  unit?: string;
  openQty?: number;
  closeQty?: number;
  closeAmt?: number;
  writeoffQty?: number;
  salesQty?: number;
  rankValue?: number;
};

type DashboardData = {
  summary?: Record<string, number>;
  stores?: {
    name?: string;
    closeValue?: number;
    deltaValue?: number;
    negativeCount?: number;
    ranOutCount?: number;
  }[];
  topDecrease?: DashboardRow[];
  topWriteoff?: DashboardRow[];
  topSalesUsage?: DashboardRow[];
  topStock?: DashboardRow[];
  negatives?: DashboardRow[];
  ranOut?: DashboardRow[];
  reconciliation?: DashboardRow[];
  failedStores?: unknown[];
  cache?: { cached?: boolean };
  performance?: { totalMs?: number };
};

type RequestOptions = { signal?: AbortSignal; forceRefresh?: boolean };

const numberFormatter = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 3 });
const moneyFormatter = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 });
const priceFormatter = new Intl.NumberFormat("ru-RU", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function formatQuantity(value: number | null, unit: string) {
  if (value === null || Number.isNaN(value)) return `— ${unit}`.trim();
  return `${numberFormatter.format(value)} ${unit}`.trim();
}

function formatMoney(value: number | null | undefined) {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  return `${moneyFormatter.format(value)} ₽`;
}

function formatPrice(value: number | null | undefined) {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  return `${priceFormatter.format(value)} ₽`;
}

function formatSignedMoney(value: number | null | undefined) {
  const n = Number(value || 0);
  if (Math.abs(n) < 0.5) return "0 ₽";
  return `${n > 0 ? "+" : "−"}${moneyFormatter.format(Math.abs(n))} ₽`;
}

function formatTime(value?: string) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
}

function isoDateLocal(date: Date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function isoDate(value: unknown) {
  return String(value || "").slice(0, 10);
}

function daysBefore(value: string, days: number) {
  const date = new Date(`${value}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() - days);
  return date.toISOString().slice(0, 10);
}

function formatDocDate(value: unknown) {
  const date = new Date(String(value || ""));
  if (Number.isNaN(date.getTime())) return String(value || "").slice(0, 10) || "—";
  return new Intl.DateTimeFormat("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric" }).format(date);
}

function shortUuid(value: unknown) {
  const text = String(value || "");
  return text ? `${text.slice(0, 8)}…${text.slice(-4)}` : "—";
}

function errorMessage(error: unknown) {
  if (error instanceof DOMException && error.name === "TimeoutError") return "Сервер не ответил за минуту. Повторите загрузку.";
  return error instanceof Error ? error.message : String(error);
}

/* ------------------------------------------------------------------ */
/*  Низкоуровневый запрос к воркеру (токен и подключение — из storage)  */
/* ------------------------------------------------------------------ */

const AUTH_TOKEN_KEY = "iiko-office-auth-v59";
const CONNECTION_KEY = "iiko-office-connection-v59";

function readStorage(key: string) {
  try {
    return localStorage.getItem(key) || "";
  } catch {
    return "";
  }
}

const responseCache = createRequestCache();
const requestGate = createRequestGate();

async function apiFetch<T = any>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers || {});
  if (!headers.has("Accept")) headers.set("Accept", "application/json");
  if (init.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");

  const token = readStorage(AUTH_TOKEN_KEY);
  if (token) headers.set("Authorization", `Bearer ${token}`);

  const connectionId = readStorage(CONNECTION_KEY);
  if (connectionId) headers.set("X-Connection-ID", connectionId);

  const load = () => requestGate.run(JSON.stringify([token, connectionId]), async () => {
    const timeout = AbortSignal.timeout(60_000);
    const response = await fetch(`${WORKER_URL}${path}`, { cache: "no-store", ...init, signal: timeout, headers });
    const payload = await response.json().catch(() => ({ ok: false, error: `HTTP ${response.status}` }));
    if (response.status === 401) throw new Error(payload?.error || "Сессия закончилась. Войдите снова.");
    if (!response.ok || payload?.ok === false) throw new Error(payload?.error || `HTTP ${response.status}`);
    return payload as T;
  });
  const key = JSON.stringify([path, token, connectionId]);
  if ((init.method || "GET") !== "GET") return load();
  return responseCache.get<T>(key, load, init.signal);
}

function findStore(warehouse: string) {
  return warehouse === ALL_WAREHOUSES_LABEL ? undefined : LIVE_STORES.find((store) => store.name === warehouse);
}

/* ------------------------------------------------------------------ */
/*  Остатки                                                            */
/* ------------------------------------------------------------------ */

async function fetchLiveStockForStore(storeName: string, options: RequestOptions = {}): Promise<StockApiResponse> {
  const params = new URLSearchParams({ store: storeName, q: "", limit: "5000", offset: "0" });
  if (options.forceRefresh) params.set("_", String(Date.now()));
  return apiFetch<StockApiResponse>(`/api/stock-live?${params.toString()}`, { signal: options.signal });
}

async function fetchLiveStockMerged(options: RequestOptions = {}): Promise<StockApiResponse> {
  const payloads = await mapSequential(LIVE_STORES, (store) => fetchLiveStockForStore(store.name, options), options.signal);
  const merged = new Map<string, StockApiItem>();

  for (const payload of payloads) {
    for (const item of payload.items || []) {
      const key = String(item.id || item.productNum || item.productName || "");
      if (!key) continue;

      const existing = merged.get(key);
      if (!existing) {
        merged.set(key, {
          ...item,
          quantity: Number(item.quantity || 0),
          startQuantity: Number(item.startQuantity || 0),
          endSum: Number(item.endSum || 0),
          balanceStatus: "ok",
        });
      } else {
        existing.quantity = (existing.quantity ?? 0) + Number(item.quantity || 0);
        existing.startQuantity = (existing.startQuantity ?? 0) + Number(item.startQuantity || 0);
        existing.endSum = (existing.endSum ?? 0) + Number(item.endSum || 0);
      }
    }
  }

  const items = [...merged.values()].sort((a, b) =>
    String(a.productName || "").localeCompare(String(b.productName || ""), "ru", {
      sensitivity: "base",
      numeric: true,
    }),
  );

  return {
    ok: true,
    storeName: ALL_WAREHOUSES_LABEL,
    time: new Date().toISOString(),
    pagination: { total: items.length, returned: items.length },
    items,
  };
}

function fetchLiveStock(warehouse: string, options: RequestOptions = {}) {
  return warehouse === ALL_WAREHOUSES_LABEL
    ? fetchLiveStockMerged(options)
    : fetchLiveStockForStore(warehouse, options);
}

/* Кэш для мгновенного показа прошлых остатков, пока грузятся свежие */
const STOCK_CACHE_PREFIX = "iiko-live-stock-ui-v45:";

type StockCache = { time: string; items: StockApiItem[] };

function readStockCache(warehouse: string): StockCache | null {
  try {
    const raw = localStorage.getItem(`${STOCK_CACHE_PREFIX}${warehouse}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.items)) return null;
    return { time: String(parsed.time || ""), items: parsed.items };
  } catch {
    return null;
  }
}

function saveStockCache(warehouse: string, payload: StockApiResponse) {
  try {
    localStorage.setItem(
      `${STOCK_CACHE_PREFIX}${warehouse}`,
      JSON.stringify({ time: payload.time, items: payload.items }),
    );
  } catch {
    // localStorage может быть недоступен или переполнен — это не критично
  }
}

/* ------------------------------------------------------------------ */
/*  ОСВ                                                                */
/* ------------------------------------------------------------------ */

function mergeTurnoverRows(payloads: { rows?: TurnoverRow[] }[]): TurnoverRow[] {
  const map = new Map<string, TurnoverRow>();

  for (const payload of payloads) {
    for (const row of payload.rows || []) {
      const key = String(row.id || row.code || row.name || "");
      if (!key) continue;

      const target = map.get(key);
      if (!target) {
        map.set(key, { ...row });
        continue;
      }

      for (const field of TURNOVER_FIELDS) {
        target[field] = Number(target[field] || 0) + Number(row[field] || 0);
      }
    }
  }

  return [...map.values()];
}

function fetchTurnoverForStore(storeName: string, from: string, to: string, options: RequestOptions = {}) {
  const params = new URLSearchParams({ store: storeName, from, to });
  if (options.forceRefresh) params.set("_", String(Date.now()));
  return apiFetch<TurnoverResponse>(`/api/turnover?${params.toString()}`, { signal: options.signal });
}

async function fetchTurnover(
  from: string,
  to: string,
  warehouse: string,
  options: RequestOptions = {},
): Promise<TurnoverResponse> {
  const store = findStore(warehouse);
  if (store) return fetchTurnoverForStore(store.name, from, to, options);

  const payloads = await mapSequential(LIVE_STORES, (item) => fetchTurnoverForStore(item.name, from, to, options), options.signal);

  return {
    ok: true,
    storeName: ALL_WAREHOUSES_LABEL,
    period: { from, to },
    rows: mergeTurnoverRows(payloads),
  };
}

/* ------------------------------------------------------------------ */
/*  Приходные накладные                                                */
/* ------------------------------------------------------------------ */

function fetchIncomingDocuments(from: string, to: string, warehouse: string, options: RequestOptions = {}) {
  const params = new URLSearchParams({
    from,
    to,
    storeId: findStore(warehouse)?.id || "__ALL__",
  });
  return apiFetch<IncomingListResponse>(`/api/documents/incoming?${params.toString()}`, {
    signal: options.signal,
  });
}

function fetchIncomingDocumentDetail(id: string, options: RequestOptions = {}) {
  return apiFetch<{ ok: boolean; document: IncomingDetail }>(
    `/api/documents/incoming/${encodeURIComponent(id)}`,
    { signal: options.signal },
  );
}

function fetchIncomingBatch(ids: string[], options: RequestOptions = {}) {
  const params = new URLSearchParams({ ids: ids.join(",") });
  return apiFetch<{ ok: boolean; documents?: IncomingDetail[]; failed?: unknown[] }>(
    `/api/documents/incoming-batch?${params.toString()}`,
    { signal: options.signal },
  );
}

/* Детали накладных пачками по 20 штук, две пачки параллельно */
async function fetchDetailsInBatches(rows: { id: string }[], signal?: AbortSignal) {
  const documents: IncomingDetail[] = [];
  const failed: unknown[] = [];

  const chunks: string[][] = [];
  for (let i = 0; i < rows.length; i += 20) {
    chunks.push(rows.slice(i, i + 20).map((row) => row.id));
  }

  for (let i = 0; i < chunks.length; i += 2) {
    const results = await Promise.all(
      chunks.slice(i, i + 2).map(async (ids) => {
        try {
          return await fetchIncomingBatch(ids, { signal });
        } catch (error) {
          if (signal?.aborted) throw error;
          return { ok: false, documents: [], failed: ids };
        }
      }),
    );

    for (const result of results) {
      documents.push(...(result.documents || []));
      failed.push(...(result.failed || []));
    }
  }

  return { documents, failed };
}

/* ------------------------------------------------------------------ */
/*  Аналитика закупочных цен                                           */
/* ------------------------------------------------------------------ */

type PurchaseLine = {
  documentNumber: string;
  date: string;
  supplierId: string;
  supplierName: string;
  productId: string;
  code: string;
  name: string;
  unit: string;
  amount: number;
  price: number;
  sum: number;
};

type PriceProduct = {
  name: string;
  code: string;
  unit: string;
  lastPrice: number;
  previousPrice: number | null;
  changePct: number | null;
  weightedAveragePrice: number | null;
  minPrice: number;
  maxPrice: number;
  lastDate: string;
  lastSupplierName: string;
  purchaseValue: number;
};

type PriceAnalytics = { products: PriceProduct[]; failed: number };

type MatrixSupplier = {
  supplierId: string;
  supplierName: string;
  price: number;
  date: string;
  ageDays: number;
  documentNumber: string;
};

type MatrixRow = {
  name: string;
  code: string;
  unit: string;
  suppliers: MatrixSupplier[];
  supplierCount: number;
  bestPrice: number | null;
  bestSupplierName: string;
};

type SupplierMatrix = { rows: MatrixRow[]; asOf: string; from: string; supplierCount: number; failed: number };

function purchaseLinesFromDocuments(documents: IncomingDetail[]): PurchaseLine[] {
  const lines: PurchaseLine[] = [];

  for (const doc of documents) {
    for (const item of doc.items || []) {
      lines.push({
        documentNumber: String(doc.number || ""),
        date: isoDate(doc.date),
        supplierId: String(doc.supplierId || ""),
        supplierName: doc.supplierName || `ID ${shortUuid(doc.supplierId)}`,
        productId: String(item.productId || ""),
        code: String(item.productNum || item.code || ""),
        name: String(item.productName || item.productId || ""),
        unit: item.unit || "—",
        amount: Number(item.amount || 0),
        price: Number(item.price || 0),
        sum: Number(item.sum || 0),
      });
    }
  }

  return lines;
}

function lineSortKey(line: PurchaseLine) {
  return `${line.date}|${line.documentNumber}`;
}

function buildPriceAnalytics(lines: PurchaseLine[], failed: number): PriceAnalytics {
  const groups = new Map<string, PurchaseLine[]>();

  for (const line of lines) {
    const key = line.productId || line.code || line.name;
    const group = groups.get(key);
    if (group) group.push(line);
    else groups.set(key, [line]);
  }

  const products: PriceProduct[] = [];

  for (const rows of groups.values()) {
    rows.sort((a, b) => lineSortKey(a).localeCompare(lineSortKey(b)));

    const last = rows[rows.length - 1];
    const previous = rows.length > 1 ? rows[rows.length - 2] : undefined;
    const prices = rows.map((row) => row.price);
    const quantity = rows.reduce((total, row) => total + Math.abs(row.amount), 0);
    const absSum = rows.reduce((total, row) => total + Math.abs(row.sum), 0);

    products.push({
      name: last.name,
      code: last.code,
      unit: last.unit,
      lastPrice: last.price,
      previousPrice: previous ? previous.price : null,
      changePct:
        previous && Math.abs(previous.price) > 1e-9
          ? ((last.price - previous.price) / previous.price) * 100
          : null,
      weightedAveragePrice: quantity ? absSum / quantity : null,
      minPrice: Math.min(...prices),
      maxPrice: Math.max(...prices),
      lastDate: last.date,
      lastSupplierName: last.supplierName,
      purchaseValue: rows.reduce((total, row) => total + row.sum, 0),
    });
  }

  products.sort((a, b) => b.purchaseValue - a.purchaseValue);
  return { products, failed };
}

function buildSupplierMatrix(lines: PurchaseLine[], asOf: string, from: string, failed: number): SupplierMatrix {
  // Последняя цена каждого поставщика по каждому товару в окне [from; asOf]
  const latest = new Map<string, PurchaseLine>();

  for (const line of lines) {
    if (line.date > asOf || line.date < from || !line.supplierId) continue;

    const key = `${line.productId || line.code || line.name}|${line.supplierId}`;
    const current = latest.get(key);
    if (!current || lineSortKey(line) > lineSortKey(current)) latest.set(key, line);
  }

  const products = new Map<string, { name: string; code: string; unit: string; suppliers: MatrixSupplier[] }>();

  for (const line of latest.values()) {
    const key = line.productId || line.code || line.name;
    let product = products.get(key);
    if (!product) {
      product = { name: line.name, code: line.code, unit: line.unit, suppliers: [] };
      products.set(key, product);
    }

    const ageDays = Math.max(
      0,
      Math.floor((new Date(`${asOf}T00:00:00Z`).getTime() - new Date(`${line.date}T00:00:00Z`).getTime()) / 86400000),
    );

    product.suppliers.push({
      supplierId: line.supplierId,
      supplierName: line.supplierName,
      price: line.price,
      date: line.date,
      ageDays,
      documentNumber: line.documentNumber,
    });
  }

  const rows: MatrixRow[] = [...products.values()]
    .map((product) => {
      product.suppliers.sort((a, b) => a.price - b.price);
      return {
        ...product,
        supplierCount: product.suppliers.length,
        bestPrice: product.suppliers[0]?.price ?? null,
        bestSupplierName: product.suppliers[0]?.supplierName || "",
      };
    })
    .sort((a, b) => b.supplierCount - a.supplierCount || a.name.localeCompare(b.name, "ru"));

  return {
    rows,
    asOf,
    from,
    supplierCount: new Set(lines.map((line) => line.supplierId).filter(Boolean)).size,
    failed,
  };
}

async function fetchPriceAnalytics(documents: IncomingDocument[], signal?: AbortSignal): Promise<PriceAnalytics> {
  const details = await fetchDetailsInBatches(documents, signal);
  return buildPriceAnalytics(purchaseLinesFromDocuments(details.documents), details.failed.length);
}

async function fetchSupplierMatrix(
  to: string,
  warehouse: string,
  historyDays: number,
  signal?: AbortSignal,
): Promise<SupplierMatrix> {
  const from = daysBefore(to, historyDays);
  const list = await fetchIncomingDocuments(from, to, warehouse, { signal });
  const details = await fetchDetailsInBatches(list.documents || [], signal);
  return buildSupplierMatrix(purchaseLinesFromDocuments(details.documents), to, from, details.failed.length);
}

/* ------------------------------------------------------------------ */
/*  Номенклатура и техкарты                                            */
/* ------------------------------------------------------------------ */

async function fetchNomenclature(options: RequestOptions = {}): Promise<NomenclatureItem[]> {
  const suffix = options.forceRefresh ? "?refresh=1" : "";
  const payload = await apiFetch<{ items?: NomenclatureItem[]; dishes?: NomenclatureItem[] }>(
    `/api/nomenclature${suffix}`,
    { signal: options.signal },
  );
  return payload.items || payload.dishes || [];
}

async function fetchNomenclatureDetail(productId: string, options: RequestOptions = {}): Promise<NomenclatureItem> {
  const payload = await apiFetch<{ item: NomenclatureItem }>(
    `/api/nomenclature/${encodeURIComponent(productId)}`,
    { signal: options.signal },
  );
  return payload.item;
}

function displayText(value: unknown, fallback = ""): string {
  if (value === null || value === undefined || value === "") return fallback;
  if (typeof value === "string" || typeof value === "number") return String(value);

  if (typeof value === "object") {
    const source = value as Record<string, unknown>;
    const candidate = source.name ?? source.displayName ?? source.title ?? source.value ?? source.text ?? source.code;
    if (candidate !== "" && candidate !== null && candidate !== undefined) return String(candidate);
  }

  return fallback || String(value);
}

/* Количества в техкарте приходят в основной единице: кг → г, л → мл */
function recipeMeasure(value: unknown, unit?: string) {
  if (value == null || value === "") return "—";
  const n = Number(value ?? 0);
  const rawUnit = String(unit || "").trim();
  const u = rawUnit.toLocaleLowerCase("ru-RU").replace(/\./g, "").replace(/\s+/g, " ").trim();

  if (!Number.isFinite(n)) return `${displayText(value, "0")} ${rawUnit}`.trim();

  if (["кг", "kg", "килограмм", "килограммы"].includes(u)) return `${numberFormatter.format(n * 1000)} г`;
  if (["л", "l", "литр", "литры", "литров"].includes(u)) return `${numberFormatter.format(n * 1000)} мл`;
  if (["г", "гр", "g", "грамм", "граммы"].includes(u)) return `${numberFormatter.format(n)} г`;
  if (["мл", "ml", "миллилитр", "миллилитры"].includes(u)) return `${numberFormatter.format(n)} мл`;
  if (["шт", "штука", "штуки", "pcs", "pc"].includes(u)) return `${numberFormatter.format(n)} шт`;
  if (["порц", "порция", "порции"].includes(u)) return `${numberFormatter.format(n)} порц`;

  return `${numberFormatter.format(n)}${rawUnit ? ` ${rawUnit}` : ""}`;
}

function shortRecipeDate(value: unknown) {
  const text = String(value || "").trim();
  const match = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return text || "—";
  if (Number(match[1]) >= 2100) return "Бессрочно";
  return `${match[3]}.${match[2]}.${match[1]}`;
}

function ruProductType(type: unknown) {
  const value = String(type || "").toUpperCase();
  if (value === "DISH") return "Блюдо";
  if (value === "GOODS") return "Товар";
  if (value === "PREPARED") return "Полуфабрикат";
  return String(type || "") || "Номенклатура";
}

/* ------------------------------------------------------------------ */
/*  Дашборд                                                            */
/* ------------------------------------------------------------------ */

function fetchDashboard(from: string, to: string, warehouse: string, options: RequestOptions = {}) {
  const store = findStore(warehouse);
  const params = new URLSearchParams({ from, to, scope: store ? "store" : "all" });

  if (store) params.set("storeId", String(store.id));
  if (options.forceRefresh) params.set("_", String(Date.now()));

  return apiFetch<DashboardData & { ok: boolean }>(`/api/dashboard?${params.toString()}`, {
    signal: options.signal,
  });
}

function sharePercent(value: number | undefined, max: number) {
  if (!max) return 10;
  return Math.min(100, Math.max(10, Math.round((Math.abs(Number(value || 0)) / max) * 100)));
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

const MOVEMENT_LINES: { label: string; field: TurnoverField; absolute: boolean }[] = [
  { label: "Приход за период", field: "purchaseQty", absolute: true },
  { label: "Продажи за период", field: "salesQty", absolute: true },
  { label: "Списания за период", field: "writeoffQty", absolute: true },
  { label: "Перемещения", field: "transferQty", absolute: false },
  { label: "Инвентаризация", field: "inventoryQty", absolute: false },
  { label: "Производство", field: "productionQty", absolute: false },
  { label: "Преобразование", field: "transformationQty", absolute: false },
  { label: "Расходные накладные", field: "outgoingInvoiceQty", absolute: true },
  { label: "Возвраты", field: "returnedQty", absolute: true },
  { label: "Возврат прихода", field: "incomingReturnedQty", absolute: true },
  { label: "Разборка", field: "disassembleQty", absolute: false },
];

function ProductCard({
  product,
  expanded,
  onToggle,
  showPrices,
  compact,
  turnover,
  historical = false,
}: {
  product: StockApiItem;
  expanded: boolean;
  onToggle: () => void;
  showPrices: boolean;
  compact: boolean;
  turnover?: TurnoverRow;
  historical?: boolean;
}) {
  const start = product.startQuantity ?? 0;
  const end = product.quantity ?? 0;
  const rawDelta = end - start;
  const delta = Math.abs(rawDelta) < 0.0005 ? 0 : rawDelta;
  const deltaSign = delta > 0 ? "+" : delta < 0 ? "−" : "";
  const deltaLabel = `${deltaSign}${numberFormatter.format(Math.abs(delta))} ${product.unit}`.trim();

  const movements = expanded
    ? MOVEMENT_LINES.map((line) => {
        const raw = Number(turnover?.[line.field] || 0);
        return { ...line, value: line.absolute ? Math.abs(raw) : raw };
      }).filter((line) => Math.abs(line.value) > 0.000001)
    : [];

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
          <span className="metric-label">{historical ? "Начало периода" : "Начало дня"}</span>
          <strong>{formatQuantity(product.startQuantity, product.unit)}</strong>
        </div>
        <div className="flow-arrow" aria-hidden="true">
          <svg viewBox="0 0 48 24"><path d="M4 12h38m-6-6 6 6-6 6" /></svg>
        </div>
        <div className="metric metric-right">
          <span className="metric-label">{historical ? "Конец периода" : "Сейчас"}</span>
          <strong>{formatQuantity(product.quantity, product.unit)}</strong>
          {showPrices && <span className="metric-cost">{formatMoney(product.endSum)}</span>}
        </div>
      </div>

      <div className="change">
        <span>Изменение</span>
        <b className={delta < 0 ? "delta-negative" : delta > 0 ? "delta-positive" : "delta-neutral"}>{deltaLabel || "0"}</b>
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
          {product.productNum && (
            <div>
              <span>Артикул</span>
              <b>{product.productNum}</b>
            </div>
          )}
          {movements.map((line) => (
            <div key={line.field}>
              <span>{line.label}</span>
              <b>
                {!line.absolute && line.value > 0 ? "+" : ""}
                {formatQuantity(line.value, product.unit)}
              </b>
            </div>
          ))}
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

function LoadMore({ count, total, onMore }: { count: number; total: number; onMore: () => void }) {
  if (count >= total) return null;
  return <button className="primary-page-action x-more" type="button" onClick={onMore}>Показать ещё · {Math.min(count, total)} из {total}</button>;
}

const NOMENCLATURE_FILTERS: [string, string][] = [
  ["all", "Все"],
  ["DISH", "Блюда"],
  ["GOODS", "Товары"],
  ["PREPARED", "Полуфабрикаты"],
];

const NOMENCLATURE_RENDER_LIMIT = 300;

type NomenclatureDetailState = { loading?: boolean; error?: string; item?: NomenclatureItem };

function NomenclaturePage({
  recipes,
  loading,
  error,
  reloadToken,
}: {
  recipes: NomenclatureItem[];
  loading: boolean;
  error: string | null;
  reloadToken: number;
}) {
  const [query, setQuery] = useState("");
  const [catalogCount, setCatalogCount] = useState(NOMENCLATURE_RENDER_LIMIT);
  const [typeFilter, setTypeFilter] = useState("all");
  const [openId, setOpenId] = useState<string | null>(null);
  const [recipeFactor, setRecipeFactor] = useState(1);
  const [details, setDetails] = useState<Record<string, NomenclatureDetailState>>({});

  // После ручного обновления карточки подгружаются заново
  useEffect(() => {
    setDetails({});
    setOpenId(null);
  }, [reloadToken]);

  const visibleRecipes = useMemo(() => {
    const q = query.trim().toLocaleLowerCase("ru-RU");

    return recipes
      .filter((item) => {
        if (typeFilter !== "all" && item.type !== typeFilter) return false;
        if (!q) return true;

        return [displayText(item.name), item.code, item.num, item.category, ruProductType(item.type)].some((value) =>
          String(value || "")
            .toLocaleLowerCase("ru-RU")
            .includes(q),
        );
      })
      .sort((a, b) => displayText(a.name).localeCompare(displayText(b.name), "ru"));
  }, [recipes, query, typeFilter]);

  useEffect(() => { setCatalogCount(NOMENCLATURE_RENDER_LIMIT); }, [query, typeFilter]);

  const toggleRecipe = (id: string) => {
    if (openId === id) {
      setOpenId(null);
      return;
    }

    setOpenId(id);
    setRecipeFactor(1);
    if (details[id]?.item || details[id]?.loading) return;

    setDetails((prev) => ({ ...prev, [id]: { loading: true } }));
    fetchNomenclatureDetail(id)
      .then((item) => setDetails((prev) => ({ ...prev, [id]: { item } })))
      .catch((err: unknown) => setDetails((prev) => ({ ...prev, [id]: { error: errorMessage(err) } })));
  };

  const showList = !error && !(loading && recipes.length === 0);

  return (
    <>
      <header className="section-topbar">
        <div>
          <p className="eyebrow">Меню и технологические карты</p>
          <p className="page-title">Номенклатура</p>
        </div>
        <button className="primary-page-action" type="button" disabled title="Создание рецептов пока доступно в iikoOffice">
          <Icon name="plus" />
          <span>Новый рецепт</span>
        </button>
      </header>

      <section className="toolbar page-toolbar" aria-label="Поиск рецептов">
        <label className="search-field">
          <Icon name="search" />
          <input
            aria-label="Поиск по номенклатуре"
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Блюдо, товар, код, категория"
            value={query}
          />
          {query && (
            <button aria-label="Очистить поиск" onClick={() => setQuery("")} type="button">
              <Icon name="close" />
            </button>
          )}
        </label>
        <span className="results-count">{loading ? "Загрузка…" : `${visibleRecipes.length} позиций`}</span>
      </section>

      <div className="filter-chips" role="group" aria-label="Тип номенклатуры">
        {NOMENCLATURE_FILTERS.map(([value, label]) => (
          <button
            className={typeFilter === value ? "active" : ""}
            key={value}
            onClick={() => setTypeFilter(value)}
            type="button"
          >
            {label}
          </button>
        ))}
      </div>

      <section className="catalog-stats" aria-label="Сводка по номенклатуре">
        <div>
          <span>Всего позиций</span>
          <strong>{recipes.length}</strong>
        </div>
        <div>
          <span>Блюд</span>
          <strong>{recipes.filter((x) => x.type === "DISH").length}</strong>
        </div>
        <div>
          <span>Товаров</span>
          <strong>{recipes.filter((x) => x.type === "GOODS").length}</strong>
        </div>
      </section>

      {loading && recipes.length === 0 && (
        <div className="empty-state">
          <strong>Загрузка номенклатуры…</strong>
        </div>
      )}

      {error && (
        <div className="empty-state" role="alert">
          <strong>Не удалось загрузить номенклатуру</strong>
          <span>{error}</span>
        </div>
      )}

      {showList && (
        <section className="recipe-list" aria-label="Номенклатура">
          {visibleRecipes.length ? (
            <>
              {visibleRecipes.slice(0, catalogCount).map((recipe) => {
                const isOpen = openId === recipe.id;
                const state = details[recipe.id];
                const full: NomenclatureItem = { ...recipe, ...(state?.item || {}) };
                const ingredients = full.ingredients || [];
                const isGoods = full.type === "GOODS";
                const price = catalogPrice(full);

                return (
                  <article className={`recipe-card ${isOpen ? "is-expanded" : ""}`} key={recipe.id}>
                    <button className="recipe-trigger" aria-expanded={isOpen} onClick={() => toggleRecipe(recipe.id)} type="button">
                      <span className="recipe-icon">
                        <Icon name="recipe" />
                      </span>
                      <span className="recipe-name">
                        <small className="recipe-type">{recipe.category || ruProductType(recipe.type)}</small>
                        <strong>{displayText(recipe.name, "Без названия")}</strong>
                        <span className="recipe-price"><span>{price.label}</span><b>{price.value === null ? "Нет данных" : formatPrice(price.value)}</b></span>
                      </span>
                      <span className="chevron">
                        <Icon name="chevron" />
                      </span>
                    </button>

                    {isOpen && (
                      <div className="recipe-details">
                        {state?.loading && <p className="recipe-status" role="status">Открываем техкарту…</p>}
                        {state?.error && <p className="recipe-status" role="alert">Не удалось загрузить карточку: {state.error}</p>}

                        {state?.item && (
                          <>
                            <div className="recipe-facts">
                              <div><span>Себестоимость</span><strong>
                                {Number.isFinite(Number(full.costPrice)) && full.costPrice != null
                                  ? formatPrice(Number(full.costPrice))
                                  : "Нет данных"}
                              </strong></div>
                              <div><span>Цена меню</span><strong>{catalogPrice({ menuPrice: full.menuPrice, menuPriceStatus: full.menuPriceStatus }).value === null ? "Нет данных" : formatPrice(full.menuPrice)}</strong></div>
                              {!isGoods && <div><span>Базовый выход</span><strong>{recipeMeasure(full.assembledAmount, full.unit)}</strong></div>}
                            </div>
                            <div className="recipe-caption">
                              <span>{ruProductType(full.type)} · {full.code || full.num || full.id}</span>
                              {(full.recipeDateFrom || full.recipeDateTo) && (
                                <span>Действует: {shortRecipeDate(full.recipeDateFrom)} — {shortRecipeDate(full.recipeDateTo)}</span>
                              )}
                            </div>
                            {(full.warning || full.priceWarning) && <p className="recipe-status" role="status">{full.warning || full.priceWarning}</p>}

                            {ingredients.length > 0 ? (
                              <>
                                <div className="recipe-section-heading">
                                  <div><h2>Состав рецепта</h2><span>Ингредиентов: {ingredients.length}</span></div>
                                  <label className="recipe-scale">Количество рецептов<select aria-label="Количество рецептов" value={recipeFactor} onChange={(event) => setRecipeFactor(Number(event.target.value))}><option value={1}>× 1</option><option value={2}>× 2</option><option value={5}>× 5</option><option value={10}>× 10</option></select></label>
                                </div>
                                <div className="ingredient-table" role="table" aria-label="Состав техкарты">
                                  <div className="ingredient-head" role="row"><span role="columnheader">Ингредиент</span><span role="columnheader">Брутто</span><span role="columnheader">Нетто</span><span role="columnheader">Выход</span></div>
                                  {ingredients.map((ing, idx) => (
                                    <div className="ingredient-row" role="row" key={`${ing.productId || "ing"}-${idx}`}>
                                      <span role="cell" className="ingredient-name"><i>{idx + 1}</i><strong>{displayText(ing.name, ing.productId || "Ингредиент")}</strong></span>
                                      {[ing.gross ?? ing.amount, ing.net, ing.out].map((value, index) => <span role="cell" className="ingredient-quantity" key={index}><small>{["Брутто", "Нетто", "Выход"][index]}</small><b>{recipeMeasure(value == null ? undefined : value * recipeFactor, ing.unit)}</b></span>)}
                                    </div>
                                  ))}
                                </div>
                                {recipeFactor > 1 && <p className="recipe-caption">Выход для × {recipeFactor}: {recipeMeasure(full.assembledAmount == null ? undefined : full.assembledAmount * recipeFactor, full.unit)}. Цены выше указаны для базового рецепта.</p>}
                              </>
                            ) : (
                              <>
                                <div className="recipe-status">
                                  <strong>{isGoods ? "Техкарта не требуется" : "Состав не найден"}</strong><p>
                                    {isGoods
                                      ? "Это товар: показываются карточка номенклатуры и себестоимость."
                                      : "iikoOffice не вернул строки действующей техкарты."}
                                  </p>
                                </div>
                              </>
                            )}

                            {full.technology && (
                              <>
                                <section className="recipe-technology"><h2>Технология приготовления</h2><p>{full.technology}</p></section>
                              </>
                            )}
                          </>
                        )}
                      </div>
                    )}
                  </article>
                );
              })}

              <LoadMore count={catalogCount} total={visibleRecipes.length} onMore={() => setCatalogCount((count) => count + NOMENCLATURE_RENDER_LIMIT)} />
            </>
          ) : (
            <div className="empty-state">
              <strong>Ничего не найдено</strong>
              <span>Измените поиск или тип номенклатуры</span>
            </div>
          )}
        </section>
      )}
    </>
  );
}

type DocumentsTab = "documents" | "overview" | "prices" | "suppliers" | "matrix";

const DOCUMENT_TABS: [DocumentsTab, string][] = [
  ["documents", "Приходные"],
  ["overview", "Обзор"],
  ["prices", "Цены"],
  ["suppliers", "Поставщики"],
  ["matrix", "Матрица"],
];

const MATRIX_HISTORY_DAYS = 7;
const ANALYTICS_RENDER_LIMIT = 200;

type AsyncState<T> = { key: string; loading: boolean; data?: T; error?: string };
type DocumentDetailState = { loading?: boolean; error?: string; doc?: IncomingDetail };

function matchesText(query: string, ...values: unknown[]) {
  if (!query) return true;
  return values.some((value) =>
    String(value ?? "")
      .toLocaleLowerCase("ru-RU")
      .includes(query),
  );
}

function DocumentsPage({
  warehouse,
  onWarehouseChange,
  period,
  onOpenCalendar,
  data,
  loading,
  error,
  reloadToken,
}: {
  warehouse: string;
  onWarehouseChange: (warehouse: string) => void;
  period: DateRange;
  onOpenCalendar: () => void;
  data: IncomingListResponse | null;
  loading: boolean;
  error: string | null;
  reloadToken: number;
}) {
  const [tab, setTab] = useState<DocumentsTab>("documents");
  const [purchaseCount, setPurchaseCount] = useState(ANALYTICS_RENDER_LIMIT);
  useEffect(() => { setPurchaseCount(ANALYTICS_RENDER_LIMIT); }, [tab, warehouse, period, reloadToken]);
  const [query, setQuery] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [details, setDetails] = useState<Record<string, DocumentDetailState>>({});
  const [prices, setPrices] = useState<AsyncState<PriceAnalytics> | null>(null);
  const [matrix, setMatrix] = useState<AsyncState<SupplierMatrix> | null>(null);
  const requested = useRef({ prices: "", matrix: "" });

  const from = isoDateLocal(period.start);
  const to = isoDateLocal(period.end);
  const analyticsKey = `${from}|${to}|${warehouse}|${reloadToken}`;

  useEffect(() => {
    setDetails({});
    setExpandedId(null);
  }, [reloadToken]);

  // Цены считаются по деталям всех накладных периода — грузим только когда открыта вкладка
  useEffect(() => {
    if (tab !== "prices" || !data) return;
    if (requested.current.prices === analyticsKey) return;

    requested.current.prices = analyticsKey;
    setPrices({ key: analyticsKey, loading: true });

    const controller = new AbortController();
    let finished = false;

    fetchPriceAnalytics(data.documents || [], controller.signal)
      .then((result) => {
        finished = true;
        setPrices({ key: analyticsKey, loading: false, data: result });
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        finished = true;
        setPrices({ key: analyticsKey, loading: false, error: errorMessage(err) });
      });

    return () => {
      if (!finished) {
        controller.abort();
        requested.current.prices = "";
      }
    };
  }, [tab, data, analyticsKey]);

  useEffect(() => {
    if (tab !== "matrix") return;
    if (requested.current.matrix === analyticsKey) return;

    requested.current.matrix = analyticsKey;
    setMatrix({ key: analyticsKey, loading: true });

    const controller = new AbortController();
    let finished = false;

    fetchSupplierMatrix(to, warehouse, MATRIX_HISTORY_DAYS, controller.signal)
      .then((result) => {
        finished = true;
        setMatrix({ key: analyticsKey, loading: false, data: result });
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        finished = true;
        setMatrix({ key: analyticsKey, loading: false, error: errorMessage(err) });
      });

    return () => {
      if (!finished) {
        controller.abort();
        requested.current.matrix = "";
      }
    };
  }, [tab, analyticsKey, to, warehouse]);

  const q = query.trim().toLocaleLowerCase("ru-RU");

  const rows = useMemo(
    () =>
      (data?.documents || []).filter((doc) =>
        matchesText(
          q,
          doc.number,
          doc.invoiceIncomingNumber,
          doc.supplierName,
          doc.summary,
          ...(doc.stores || []).map((store) => store.name),
        ),
      ),
    [data, q],
  );

  const totalSum = useMemo(() => rows.reduce((sum, doc) => sum + (Number(doc.sum) || 0), 0), [rows]);

  const suppliers = useMemo(() => {
    const map = new Map<string, { name: string; sum: number; count: number }>();

    for (const doc of rows) {
      if (!doc.supplierId) continue;
      const entry = map.get(doc.supplierId) || {
        name: doc.supplierName || `ID ${shortUuid(doc.supplierId)}`,
        sum: 0,
        count: 0,
      };
      entry.sum += Number(doc.sum) || 0;
      entry.count += 1;
      map.set(doc.supplierId, entry);
    }

    return [...map.entries()].map(([id, entry]) => ({ id, ...entry })).sort((a, b) => b.sum - a.sum);
  }, [rows]);

  const toggleDocument = (id: string) => {
    if (expandedId === id) {
      setExpandedId(null);
      return;
    }

    setExpandedId(id);
    if (details[id]?.doc) return;

    setDetails((prev) => ({ ...prev, [id]: { loading: true } }));
    fetchIncomingDocumentDetail(id)
      .then((payload) => setDetails((prev) => ({ ...prev, [id]: { doc: payload.document } })))
      .catch((err: unknown) => setDetails((prev) => ({ ...prev, [id]: { error: errorMessage(err) } })));
  };

  const renderDocumentList = () => {
    if (!rows.length) {
      return (
        <div className="empty-state">
          <strong>Документов не найдено</strong>
          <span>Попробуйте изменить период, склад или поиск</span>
        </div>
      );
    }

    return rows.slice(0, purchaseCount).map((doc) => {
      const isOpen = expandedId === doc.id;
      const state = details[doc.id];
      const detail = state?.doc;
      const storeNames = (doc.stores || []).map((store) => store.name).join(", ");

      return (
        <article key={doc.id}>
          <div
            className="document-card"
            onClick={() => toggleDocument(doc.id)}
            onKeyDown={(event) => {
              if (event.target === event.currentTarget && (event.key === "Enter" || event.key === " ")) {
                event.preventDefault();
                toggleDocument(doc.id);
              }
            }}
            role="button"
            tabIndex={0}
            aria-expanded={isOpen}
          >
            <div className="document-mark">
              <Icon name="document" />
            </div>

            <div className="document-main">
              <small>
                {doc.number || "—"} · {formatDocDate(doc.date)}
                {doc.invoiceIncomingNumber ? ` · ${doc.invoiceIncomingNumber}` : ""}
              </small>
              <strong>{doc.supplierName || `ID ${shortUuid(doc.supplierId)}`}</strong>
              <span>{storeNames || "Склад не указан"}</span>
            </div>

            <div className="document-meta">
              <strong>{formatMoney(doc.sum)}</strong>
              {doc.hasDifference && <span className="status draft">Есть расхождения</span>}
            </div>

            <button
              aria-label={`${isOpen ? "Свернуть" : "Развернуть"} накладную ${doc.number || ""}`}
              className="document-menu"
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                toggleDocument(doc.id);
              }}
            >
              <Icon name={isOpen ? "chevron" : "dots"} />
            </button>
          </div>

          {isOpen && (
            <div className="document-detail">
              {state?.loading && <div className="x-note">Открываем накладную…</div>}
              {state?.error && <div className="x-note">{state.error}</div>}

              {detail && (
                <>
                  <div className="x-meta-grid">
                    <div>
                      <span>Склад</span>
                      <strong>{detail.storeName || storeNames || "—"}</strong>
                    </div>
                    <div>
                      <span>Поставщик</span>
                      <strong>{detail.supplierName || `ID ${shortUuid(detail.supplierId)}`}</strong>
                    </div>
                    <div>
                      <span>Статус</span>
                      <strong>{detail.status || "—"}</strong>
                    </div>
                    <div>
                      <span>Входящий номер</span>
                      <strong>{detail.invoice || "—"}</strong>
                    </div>
                  </div>

                  <div className="document-items-title">
                    Позиции · {(detail.items || []).length} · итого {formatPrice(detail.total ?? doc.sum)}
                  </div>

                  <div className="document-items">
                    {(detail.items || []).map((item, idx) => (
                      <div className="document-item" key={`${item.productId || "item"}-${idx}`}>
                        <div className="document-item__name">
                          <strong>{item.productName || item.productId || "Позиция"}</strong>
                          <span>{item.productNum || item.code || ""}</span>
                        </div>
                        <div className="document-item__qty">
                          <strong>{numberFormatter.format(item.amount || 0)}</strong>
                          <span>{item.unit || "—"}</span>
                        </div>
                        <div className="document-item__cost">
                          <strong>{formatPrice(item.price || 0)}</strong>
                          <span>
                            за ед.
                            {item.ndsPercent ? ` · НДС ${numberFormatter.format(item.ndsPercent)}%` : ""}
                          </span>
                        </div>
                        <div className="document-item__sum">{formatPrice(item.sum || 0)}</div>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}
        </article>
      );
    });
  };

  const renderOverview = () => (
    <section className="analytics-kpis" aria-label="Обзор закупок">
      <article>
        <span>Закупки</span>
        <strong>{formatMoney(totalSum)}</strong>
        <small>за период</small>
      </article>
      <article>
        <span>Накладных</span>
        <strong>{rows.length}</strong>
        <small>приходных</small>
      </article>
      <article>
        <span>Поставщиков</span>
        <strong>{suppliers.length}</strong>
        <small>активных</small>
      </article>
      <article>
        <span>Расхождения</span>
        <strong>{rows.filter((doc) => doc.hasDifference).length}</strong>
        <small>накладных</small>
      </article>
    </section>
  );

  const renderSuppliers = () =>
    suppliers.length ? (
      <section className="top-products" aria-label="Поставщики">
        <div className="analytics-heading">
          <div>
            <span>Поставщики</span>
            <strong>По сумме закупок</strong>
          </div>
          <b>{formatMoney(totalSum)}</b>
        </div>
        <div className="product-ranking">
          {suppliers.map((supplier, index) => (
            <div key={supplier.id}>
              <b>{index + 1}</b>
              <span>
                <strong>{supplier.name}</strong>
              </span>
              <small>
                {formatMoney(supplier.sum)} · {supplier.count} накл.
              </small>
            </div>
          ))}
        </div>
      </section>
    ) : (
      <div className="empty-state">
        <strong>Поставщиков не найдено</strong>
        <span>Измените период, склад или поиск</span>
      </div>
    );

  const renderPrices = () => {
    const state = prices?.key === analyticsKey ? prices : null;

    if (!state || state.loading) return <div className="x-note">Собираем историю цен по накладным периода…</div>;
    if (state.error)
      return (
        <div className="empty-state" role="alert">
          <strong>Не удалось собрать цены</strong>
          <span>{state.error}</span>
        </div>
      );

    const products = (state.data?.products || []).filter((product) => matchesText(q, product.name, product.code));

    return (
      <>
        {!!state.data?.failed && (
          <div className="x-note">Не удалось получить {state.data.failed} накладных — данные могут быть неполными.</div>
        )}

        {products.length ? (
          <div className="x-cards">
            {products.slice(0, purchaseCount).map((product, index) => (
              <article className="x-card" key={`${product.code}-${product.name}-${index}`}>
                <div className="x-card-head">
                  <strong>{product.name}</strong>
                  <small>
                    {product.code} · {product.unit} · {formatDocDate(product.lastDate)}
                  </small>
                  <small>{product.lastSupplierName}</small>
                </div>
                <div className="x-card-grid">
                  <div>
                    <span>Последняя</span>
                    <strong>{formatPrice(product.lastPrice)}</strong>
                  </div>
                  <div>
                    <span>Изменение</span>
                    <strong
                      className={product.changePct && product.changePct > 0 ? "x-up" : product.changePct && product.changePct < 0 ? "x-down" : ""}
                    >
                      {product.changePct === null
                        ? "—"
                        : `${product.changePct > 0 ? "+" : ""}${product.changePct.toFixed(1)}%`}
                    </strong>
                  </div>
                  <div>
                    <span>Средняя</span>
                    <strong>{formatPrice(product.weightedAveragePrice)}</strong>
                  </div>
                  <div>
                    <span>Мин / Макс</span>
                    <strong>
                      {formatPrice(product.minPrice)} / {formatPrice(product.maxPrice)}
                    </strong>
                  </div>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="empty-state">
            <strong>Цен не найдено</strong>
            <span>За выбранный период нет закупок или поиск ничего не нашёл</span>
          </div>
        )}

        <LoadMore count={purchaseCount} total={products.length} onMore={() => setPurchaseCount((count) => count + ANALYTICS_RENDER_LIMIT)} />
      </>
    );
  };

  const renderMatrix = () => {
    const state = matrix?.key === analyticsKey ? matrix : null;

    if (!state || state.loading)
      return <div className="x-note">Строим матрицу цен за последние {MATRIX_HISTORY_DAYS} дней…</div>;
    if (state.error)
      return (
        <div className="empty-state" role="alert">
          <strong>Не удалось построить матрицу</strong>
          <span>{state.error}</span>
        </div>
      );

    const matrixRows = (state.data?.rows || []).filter((row) => matchesText(q, row.name, row.code));

    return (
      <>
        <div className="x-note">
          Последняя фактическая цена каждого поставщика за {MATRIX_HISTORY_DAYS} дней до{" "}
          {formatDocDate(state.data?.asOf)}. Лучшая цена выделена.
        </div>

        {!!state.data?.failed && (
          <div className="x-note">Не удалось получить {state.data.failed} накладных — данные могут быть неполными.</div>
        )}

        {matrixRows.length ? (
          <div className="x-cards">
            {matrixRows.slice(0, purchaseCount).map((row, index) => (
              <details className="x-card x-matrix" key={`${row.code}-${row.name}-${index}`}>
                <summary>
                  <div className="x-card-head">
                    <strong>{row.name}</strong>
                    <small>
                      {row.code} · {row.unit} · поставщиков: {row.supplierCount}
                    </small>
                  </div>
                  <div className="x-matrix-best">
                    <span>Лучшая</span>
                    <strong>{formatPrice(row.bestPrice)}</strong>
                    <small>{row.bestSupplierName}</small>
                  </div>
                </summary>
                <div className="x-matrix-suppliers">
                  {row.suppliers.map((supplier, idx) => (
                    <div className={idx === 0 ? "best" : ""} key={`${supplier.supplierId}-${idx}`}>
                      <span>
                        <strong>{supplier.supplierName}</strong>
                        <small>
                          {formatDocDate(supplier.date)} · {supplier.ageDays} дн. назад
                        </small>
                      </span>
                      <strong>{formatPrice(supplier.price)}</strong>
                    </div>
                  ))}
                </div>
              </details>
            ))}
          </div>
        ) : (
          <div className="empty-state">
            <strong>Нет данных для матрицы</strong>
            <span>За последние {MATRIX_HISTORY_DAYS} дней закупок не найдено</span>
          </div>
        )}

        <LoadMore count={purchaseCount} total={matrixRows.length} onMore={() => setPurchaseCount((count) => count + ANALYTICS_RENDER_LIMIT)} />
      </>
    );
  };

  const showBody = !error && data !== null;

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
          <button className="primary-page-action" type="button" disabled title="Создание документов пока доступно в iikoOffice">
            <Icon name="plus" />
            <span>Создать</span>
          </button>
        </div>
      </header>

      <WorkspaceActions warehouse={warehouse} onWarehouseChange={onWarehouseChange} />

      <section className="document-summary" aria-label="Сводка документов">
        <div>
          <span>Накладных</span>
          <strong>{rows.length}</strong>
          <small>за период</small>
        </div>
        <div>
          <span>Сумма</span>
          <strong>{formatMoney(totalSum)}</strong>
          <small>по накладным</small>
        </div>
      </section>

      <div className="filter-chips" role="group" aria-label="Разделы закупок">
        {DOCUMENT_TABS.map(([value, label]) => (
          <button className={tab === value ? "active" : ""} key={value} onClick={() => setTab(value)} type="button">
            {label}
          </button>
        ))}
      </div>

      <section className="toolbar page-toolbar" aria-label="Поиск по закупкам">
        <label className="search-field">
          <Icon name="search" />
          <input
            aria-label="Поиск по закупкам"
            onChange={(event) => setQuery(event.target.value)}
            placeholder={
              tab === "prices" || tab === "matrix" ? "Товар или код" : "Номер, поставщик, склад"
            }
            value={query}
          />
          {query && (
            <button aria-label="Очистить поиск" onClick={() => setQuery("")} type="button">
              <Icon name="close" />
            </button>
          )}
        </label>
        <span className="results-count">{loading ? "Загрузка…" : `${rows.length} накладных`}</span>
      </section>

      {error && (
        <div className="empty-state" role="alert">
          <strong>Не удалось загрузить документы</strong>
          <span>{error}</span>
        </div>
      )}

      {loading && data === null && !error && tab !== "matrix" && (
        <div className="empty-state">
          <strong>Загружаем приходные накладные…</strong>
        </div>
      )}

      {showBody && tab === "documents" && (
        <section className="document-list" aria-label="Приходные накладные">
          <div className="list-heading">
            <span>Приходные накладные</span>
            <small>{rows.length} документов</small>
          </div>
          {renderDocumentList()}
          <LoadMore count={purchaseCount} total={rows.length} onMore={() => setPurchaseCount((count) => count + ANALYTICS_RENDER_LIMIT)} />
        </section>
      )}

      {showBody && tab === "overview" && renderOverview()}
      {showBody && tab === "suppliers" && renderSuppliers()}
      {showBody && tab === "prices" && renderPrices()}
      {tab === "matrix" && !error && renderMatrix()}
    </>
  );
}

type AttentionKind = "negative" | "ranout" | "reconciliation";

const ATTENTION_TITLES: Record<AttentionKind, string> = {
  negative: "Отрицательные остатки",
  ranout: "Закончились за период",
  reconciliation: "Контрольные расхождения ОСВ",
};

function RankingSection({
  label,
  title,
  rows,
}: {
  label: string;
  title: string;
  rows: DashboardRow[];
}) {
  if (!rows.length) return null;

  const top = rows.slice(0, 5);
  const max = Math.max(1, ...top.map((item) => Math.abs(Number(item.rankValue || 0))));

  return (
    <section className="top-products" aria-label={label}>
      <div className="analytics-heading">
        <div>
          <span>{label}</span>
          <strong>{title}</strong>
        </div>
      </div>

      <div className="product-ranking">
        {top.map((item, idx) => (
          <div key={`${item.name}-${item.storeName}-${idx}`}>
            <b>{idx + 1}</b>
            <span>
              <strong>{item.name || "Товар"}</strong>
              <i>
                <em className={`share-${sharePercent(item.rankValue, max)}`} />
              </i>
            </span>
            <small>{formatMoney(item.rankValue || 0)}</small>
          </div>
        ))}
      </div>
    </section>
  );
}

function AnalyticsPage({
  period,
  onOpenCalendar,
  warehouse,
  onWarehouseChange,
  dashboard,
  loading,
  error,
}: {
  period: DateRange;
  onOpenCalendar: () => void;
  warehouse: string;
  onWarehouseChange: (warehouse: string) => void;
  dashboard: DashboardData | null;
  loading: boolean;
  error: string | null;
}) {
  const [attention, setAttention] = useState<AttentionKind | null>(null);

  const summary = dashboard?.summary || {};
  const stores = dashboard?.stores || [];
  const problemCount =
    Number(summary.negativeCount || 0) + Number(summary.ranOutCount || 0) + Number(summary.reconciliationCount || 0);
  const productRows = Number(summary.productRows || 0);
  const healthPercent = productRows > 0 ? Math.round(100 * Math.max(0, 1 - Number(summary.negativeCount || 0) / productRows)) : null;

  const attentionRows: DashboardRow[] =
    attention === "negative"
      ? dashboard?.negatives || []
      : attention === "ranout"
        ? dashboard?.ranOut || []
        : attention === "reconciliation"
          ? dashboard?.reconciliation || []
          : [];

  const maxStoreValue = Math.max(1, ...stores.map((item) => Math.abs(Number(item.closeValue || 0))));

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

      {loading && (
        <div className="empty-state">
          <strong>Собираем дашборд…</strong>
          <span>ОСВ по складам может занять несколько секунд</span>
        </div>
      )}

      {error && (
        <div className="empty-state" role="alert">
          <strong>Не удалось загрузить дашборд</strong>
          <span>{error}</span>
        </div>
      )}

      {dashboard && !error && (
        <>
          <section className="analytics-kpis" aria-label="Ключевые показатели">
            <article>
              <span>Запасы сейчас</span>
              <strong>{formatMoney(summary.closeValue || 0)}</strong>
              <small>
                {summary.storesCount || stores.length || 0} склад(а) · на начало {formatMoney(summary.openValue || 0)}
              </small>
            </article>
            <article>
              <span>Изменение запасов</span>
              <strong>{formatSignedMoney(summary.deltaValue)}</strong>
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
              <small>это не выручка</small>
            </article>
            <article>
              <span>Списания</span>
              <strong>{formatMoney(Math.abs(Number(summary.writeoffCost || 0)))}</strong>
              <small>по себестоимости</small>
            </article>
            <article>
              <span>Проблем</span>
              <strong>{problemCount}</strong>
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
                  const width = Math.max(
                    10,
                    Math.min(100, (Math.abs(Number(store.closeValue || 0)) / maxStoreValue) * 100),
                  );

                  return (
                    <div className="chart-column" key={store.name || index}>
                      <span className={`bar-${Math.min(100, Math.max(10, Math.round(width)))}`} />
                      <small>{store.name || "Склад"}</small>
                    </div>
                  );
                })}
              </div>

              <div className="x-store-list">
                {stores.map((store, index) => (
                  <div key={`${store.name}-${index}`}>
                    <span>
                      <strong>{store.name || "Склад"}</strong>
                      <small>
                        {formatSignedMoney(store.deltaValue)} · {store.negativeCount || 0} отриц. ·{" "}
                        {store.ranOutCount || 0} законч.
                      </small>
                    </span>
                    <strong>{formatMoney(store.closeValue || 0)}</strong>
                  </div>
                ))}
              </div>
            </section>
          )}

          <div className="analytics-grid">
            <section className="top-products" aria-label="Ключевые проблемы">
              <div className="analytics-heading">
                <div>
                  <span>Требует внимания</span>
                  <strong>Нажмите, чтобы увидеть позиции</strong>
                </div>
              </div>

              <div className="product-ranking">
                {(["negative", "ranout", "reconciliation"] as AttentionKind[]).map((kind, index) => {
                  const count =
                    kind === "negative"
                      ? summary.negativeCount
                      : kind === "ranout"
                        ? summary.ranOutCount
                        : summary.reconciliationCount;

                  return (
                    <div
                      className="x-clickable"
                      key={kind}
                      onClick={() => setAttention(attention === kind ? null : kind)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          setAttention(attention === kind ? null : kind);
                        }
                      }}
                      role="button"
                      tabIndex={0}
                      aria-expanded={attention === kind}
                    >
                      <b>{index + 1}</b>
                      <span>
                        <strong>{ATTENTION_TITLES[kind]}</strong>
                      </span>
                      <small>{count || 0}</small>
                    </div>
                  );
                })}
              </div>
            </section>

            <section className="stock-health" aria-label="Состояние остатков">
              <div className="analytics-heading">
                <div>
                  <span>Состояние остатков</span>
                  <strong>{problemCount} проблем</strong>
                </div>
              </div>

              <div className="health-ring">
                <strong>{healthPercent === null ? "—" : `${healthPercent}%`}</strong>
                <span>без отрицательного остатка</span>
              </div>

              <div className="health-legend">
                <div>
                  <i className="healthy" />
                  <span>Без отрицательного остатка</span>
                  <b>{Math.max(0, productRows - Number(summary.negativeCount || 0))}</b>
                </div>
                <div>
                  <i className="low" />
                  <span>Закончились</span>
                  <b>{summary.ranOutCount || 0}</b>
                </div>
                <div>
                  <i className="critical" />
                  <span>Отрицательные</span>
                  <b>{summary.negativeCount || 0}</b>
                </div>
              </div>
            </section>
          </div>

          {attention && (
            <section className="x-detail" aria-label={ATTENTION_TITLES[attention]}>
              <div className="x-detail-head">
                <strong>{ATTENTION_TITLES[attention]}</strong>
                <button aria-label="Закрыть список" onClick={() => setAttention(null)} type="button">
                  <Icon name="close" />
                </button>
              </div>

              {attentionRows.length ? (
                attentionRows.map((row, idx) => (
                  <div className="x-detail-row" key={`${row.name}-${row.storeName}-${idx}`}>
                    <span>
                      <strong>{row.name || "Товар"}</strong>
                      <small>{row.storeName || ""}</small>
                    </span>
                    <span>
                      <strong>
                        {numberFormatter.format(row.closeQty || 0)} {row.unit || ""}
                      </strong>
                      <small>{formatMoney(row.closeAmt || 0)}</small>
                    </span>
                  </div>
                ))
              ) : (
                <div className="x-note">Нет позиций</div>
              )}
            </section>
          )}

          <RankingSection label="Наибольшее снижение запасов" title="По себестоимости" rows={dashboard.topDecrease || []} />
          <RankingSection label="Больше всего списали" title="По себестоимости" rows={dashboard.topWriteoff || []} />
          <RankingSection
            label="Наибольший складской расход по продажам"
            title="По себестоимости"
            rows={dashboard.topSalesUsage || []}
          />
          <RankingSection label="Самые дорогие остатки" title="Стоимость" rows={dashboard.topStock || []} />

          <section className="analytics-kpis" aria-label="Движение по себестоимости">
            <article>
              <span>Инвентаризация</span>
              <strong>{formatSignedMoney(summary.inventoryEffect)}</strong>
              <small>эффект на запасы</small>
            </article>
            <article>
              <span>Производство</span>
              <strong>{formatSignedMoney(summary.productionEffect)}</strong>
              <small>эффект на запасы</small>
            </article>
            <article>
              <span>Перемещения</span>
              <strong>{formatSignedMoney(summary.transferEffect)}</strong>
              <small>эффект на запасы</small>
            </article>
          </section>

          {(dashboard.failedStores || []).length > 0 && (
            <div className="x-note">
              Не удалось получить данные по складам: {dashboard.failedStores?.length}. Показатели могут быть неполными.
            </div>
          )}

          <div className="x-note">
            iikoOffice ОСВ · {numberFormatter.format(summary.productRows || 0)} строк ·{" "}
            {dashboard.cache?.cached ? "из кэша" : `${numberFormatter.format(dashboard.performance?.totalMs || 0)} мс`}
          </div>
        </>
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

const STOCK_RENDER_STEP = 100;

function stockKey(item: StockApiItem) {
  return String(item.id || item.productNum || item.productName || "");
}

export default function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [activePage, setActivePage] = useState<"catalog" | "stock" | "documents" | "reports">("stock");
  const [warehouse, setWarehouse] = useState(ALL_WAREHOUSES_LABEL);
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [visibleCount, setVisibleCount] = useState(STOCK_RENDER_STEP);

  // Дата подгружается сегодняшняя
  const [period, setPeriod] = useState<DateRange>(() => {
    const today = new Date();
    return { start: today, end: today };
  });

  const [calendarOpen, setCalendarOpen] = useState(false);
  const [showPrices, setShowPrices] = useState(true);
  const [compactCards, setCompactCards] = useState(false);
  const [theme, setTheme] = useState<"dark" | "light">(() => readStorage("iiko-display-theme") === "light" ? "light" : "dark");
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try { localStorage.setItem("iiko-display-theme", theme); } catch { /* Storage is optional. */ }
  }, [theme]);
  const [dockSettingsOpen, setDockSettingsOpen] = useState(false);

  // Каждое нажатие «Обновить» увеличивает токен: данные перезагружаются без кэша
  const [reloadToken, setReloadToken] = useState(0);

  const [stockItems, setStockItems] = useState<StockApiItem[]>([]);
  const [stockMeta, setStockMeta] = useState<{ time: string; cached: boolean } | null>(null);
  const [stockLoading, setStockLoading] = useState(false);
  const [stockError, setStockError] = useState<string | null>(null);
  const [turnoverError, setTurnoverError] = useState<string | null>(null);
  const [turnoverLoading, setTurnoverLoading] = useState(false);
  const [turnoverData, setTurnoverData] = useState<TurnoverRow[]>([]);

  const [documentsData, setDocumentsData] = useState<IncomingListResponse | null>(null);
  const [documentsLoading, setDocumentsLoading] = useState(false);
  const [documentsError, setDocumentsError] = useState<string | null>(null);

  const [nomenclatureItems, setNomenclatureItems] = useState<NomenclatureItem[]>([]);
  const [nomenclatureLoading, setNomenclatureLoading] = useState(false);
  const [nomenclatureError, setNomenclatureError] = useState<string | null>(null);

  const [dashboardData, setDashboardData] = useState<DashboardData | null>(null);
  const [dashboardLoading, setDashboardLoading] = useState(false);
  const [dashboardError, setDashboardError] = useState<string | null>(null);

  // Токен, на котором данные раздела были загружены в последний раз.
  // Если он меньше текущего — это ручное обновление, и кэш воркера нужно обойти.
  const loadedToken = useRef({ stock: 0, turnover: 0, catalog: 0, dashboard: 0 });
  const stockWarehouse = useRef<string | null>(null);

  const from = isoDateLocal(period.start);
  const to = isoDateLocal(period.end);

  const refreshing =
    (activePage === "stock" && stockLoading) ||
    (activePage === "documents" && documentsLoading) ||
    (activePage === "catalog" && nomenclatureLoading) ||
    (activePage === "reports" && dashboardLoading);

  /* ---------- Остатки ---------- */
  useEffect(() => {
    if (activePage !== "stock") return;

    const controller = new AbortController();
    const forceRefresh = reloadToken > loadedToken.current.stock;

    // При смене склада сразу показываем сохранённые остатки (или пустой список), а не данные прошлого склада
    if (stockWarehouse.current !== warehouse) {
      const cached = readStockCache(warehouse);
      setStockItems(cached?.items ?? []);
      setStockMeta(cached ? { time: cached.time, cached: true } : null);
      stockWarehouse.current = warehouse;
    }

    setStockLoading(true);
    setStockError(null);

    fetchLiveStock(warehouse, { signal: controller.signal, forceRefresh })
      .then((payload) => {
        if (controller.signal.aborted) return;
        loadedToken.current.stock = reloadToken;
        setStockItems(payload.items || []);
        setStockMeta({ time: payload.time, cached: false });
        saveStockCache(warehouse, payload);
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setStockError(errorMessage(error));
      })
      .finally(() => {
        if (!controller.signal.aborted) setStockLoading(false);
      });

    return () => controller.abort();
  }, [activePage, warehouse, reloadToken]);

  /* ---------- ОСВ для карточек остатков ---------- */
  useEffect(() => {
    if (activePage !== "stock") return;

    const controller = new AbortController();
    const forceRefresh = reloadToken > loadedToken.current.turnover;

    setTurnoverData([]);
    setTurnoverError(null);
    setTurnoverLoading(true);

    fetchTurnover(from, to, warehouse, { signal: controller.signal, forceRefresh })
      .then((payload) => {
        if (controller.signal.aborted) return;
        loadedToken.current.turnover = reloadToken;
        setTurnoverData(payload.rows || []);
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) setTurnoverError(errorMessage(error));
      })
      .finally(() => { if (!controller.signal.aborted) setTurnoverLoading(false); });

    return () => controller.abort();
  }, [activePage, warehouse, from, to, reloadToken]);

  /* ---------- Приходные накладные ---------- */
  useEffect(() => {
    if (activePage !== "documents") return;

    const controller = new AbortController();

    setDocumentsLoading(true);
    setDocumentsError(null);
    setDocumentsData(null);

    fetchIncomingDocuments(from, to, warehouse, { signal: controller.signal })
      .then((payload) => {
        if (!controller.signal.aborted) setDocumentsData({ ...payload, documents: payload.documents || [] });
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) setDocumentsError(errorMessage(error));
      })
      .finally(() => {
        if (!controller.signal.aborted) setDocumentsLoading(false);
      });

    return () => controller.abort();
  }, [activePage, warehouse, from, to, reloadToken]);

  /* ---------- Номенклатура ---------- */
  useEffect(() => {
    if (activePage !== "catalog") return;

    // Номенклатура не зависит от склада и периода — повторно грузим её только по кнопке «Обновить»
    const manualRefresh = reloadToken > loadedToken.current.catalog;
    if (!manualRefresh && nomenclatureItems.length > 0) return;

    const controller = new AbortController();

    setNomenclatureLoading(true);
    setNomenclatureError(null);

    fetchNomenclature({ signal: controller.signal, forceRefresh: manualRefresh })
      .then((items) => {
        if (controller.signal.aborted) return;
        loadedToken.current.catalog = reloadToken;
        setNomenclatureItems(items);
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) setNomenclatureError(errorMessage(error));
      })
      .finally(() => {
        if (!controller.signal.aborted) setNomenclatureLoading(false);
      });

    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activePage, reloadToken]);

  /* ---------- Дашборд ---------- */
  useEffect(() => {
    if (activePage !== "reports") return;

    const controller = new AbortController();
    const forceRefresh = reloadToken > loadedToken.current.dashboard;

    setDashboardLoading(true);
    setDashboardError(null);
    setDashboardData(null);

    fetchDashboard(from, to, warehouse, { signal: controller.signal, forceRefresh })
      .then((payload) => {
        if (controller.signal.aborted) return;
        loadedToken.current.dashboard = reloadToken;
        setDashboardData(payload);
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) setDashboardError(errorMessage(error));
      })
      .finally(() => {
        if (!controller.signal.aborted) setDashboardLoading(false);
      });

    return () => controller.abort();
  }, [activePage, warehouse, from, to, reloadToken]);

  useEffect(() => {
    setVisibleCount(STOCK_RENDER_STEP);
    setExpanded(null);
  }, [query, warehouse]);

  const filteredProducts = useMemo(() => {
    const q = query.trim().toLocaleLowerCase("ru-RU");
    if (!q) return stockItems;

    return stockItems.filter(
      (item) =>
        String(item.productName || "")
          .toLocaleLowerCase("ru-RU")
          .includes(q) ||
        String(item.productNum || "")
          .toLocaleLowerCase("ru-RU")
          .includes(q),
    );
  }, [stockItems, query]);

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

  // Быстрый поиск строки ОСВ для карточки: сначала по id, затем по артикулу и названию
  const turnoverIndex = useMemo(() => {
    const byId = new Map<string, TurnoverRow>();
    const byCode = new Map<string, TurnoverRow>();
    const byName = new Map<string, TurnoverRow>();

    for (const row of turnoverData) {
      if (row.id) byId.set(String(row.id), row);
      if (row.code) byCode.set(String(row.code), row);
      if (row.name) byName.set(String(row.name), row);
    }

    return (product: StockApiItem) =>
      byId.get(String(product.id)) ??
      (product.productNum ? byCode.get(String(product.productNum)) : undefined) ??
      byName.get(String(product.productName));
  }, [turnoverData]);

  const refreshData = () => {
    if (refreshing) return;
    responseCache.clear();
    setReloadToken((token) => token + 1);
  };

  if (!isAuthenticated) {
    return <AuthPage onLogin={() => setIsAuthenticated(true)} />;
  }

  return (
    <main className="app-shell">
      <div className="page">
        {activePage === "catalog" && (
          <NomenclaturePage
            error={nomenclatureError}
            loading={nomenclatureLoading}
            recipes={nomenclatureItems}
            reloadToken={reloadToken}
          />
        )}

        {activePage === "documents" && (
          <DocumentsPage
            data={documentsData}
            error={documentsError}
            loading={documentsLoading}
            onOpenCalendar={() => setCalendarOpen(true)}
            onWarehouseChange={setWarehouse}
            period={period}
            reloadToken={reloadToken}
            warehouse={warehouse}
          />
        )}

        {activePage === "reports" && (
          <AnalyticsPage
            dashboard={dashboardData}
            error={dashboardError}
            loading={dashboardLoading}
            onOpenCalendar={() => setCalendarOpen(true)}
            onWarehouseChange={setWarehouse}
            period={period}
            warehouse={warehouse}
          />
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
                  placeholder="Товар или артикул"
                  value={query}
                />
                {query && (
                  <button aria-label="Очистить поиск" onClick={() => setQuery("")} type="button">
                    <Icon name="close" />
                  </button>
                )}
              </label>
              <span className="results-count">
                {stockLoading ? "Обновляем…" : `${filteredProducts.length} позиций`}
              </span>
            </section>

            {turnoverLoading && <div className="x-note" role="status">Загружаем движения за выбранный период…</div>}
            {turnoverError && <div className="x-note" role="alert">Движения за период недоступны: {turnoverError}. Повторите загрузку кнопкой «Обновить».</div>}

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
                  <span>{stockMeta?.cached ? "Сохранено в" : "Обновлено"}</span>
                  <b>{formatTime(stockMeta?.time)}</b>
                </div>
                <div className="summary-end">
                  <span>Текущий остаток</span>
                  <strong>{formatMoney(stockTotals.endSum)}</strong>
                </div>
              </section>
            )}

            {!stockError && (
              <section className="list" aria-label="Остатки товаров">
                {filteredProducts.slice(0, visibleCount).map((product, index) => {
                  const key = stockKey(product);
                  const report = turnoverIndex(product);

                  return (
                    <ProductCard
                      compact={compactCards}
                      expanded={expanded === key}
                      key={`${key}-${index}`}
                      onToggle={() => setExpanded(expanded === key ? null : key)}
                      historical={!!report}
                      product={report ? { ...product, startQuantity: report.openQty ?? null, quantity: report.closeQty ?? null, endSum: report.closeAmt ?? null, balanceStatus: "ok" } : product}
                      showPrices={showPrices}
                      turnover={expanded === key ? report : undefined}
                    />
                  );
                })}

                {filteredProducts.length > visibleCount && (
                  <button
                    className="secondary-action x-more"
                    onClick={() => setVisibleCount((count) => count + STOCK_RENDER_STEP)}
                    type="button"
                  >
                    Показать ещё ({filteredProducts.length - visibleCount})
                  </button>
                )}

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
            <NavigationIcon name="stock" />
          </span>
          <div>
            <strong>Склад</strong>
            <small>Управление</small>
          </div>
        </div>

        <button
          aria-label="Номенклатура"
          aria-current={activePage === "catalog" ? "page" : undefined}
          className={activePage === "catalog" ? "active" : ""}
          onClick={() => setActivePage("catalog")}
          type="button"
        >
          <NavigationIcon name="catalog" />
          <span className="nav-label">Каталог</span>
        </button>

        <button
          aria-current={activePage === "stock" ? "page" : undefined}
          className={activePage === "stock" ? "active" : ""}
          onClick={() => setActivePage("stock")}
          type="button"
        >
          <NavigationIcon name="stock" />
          <span className="nav-label">Остатки</span>
        </button>

        <button
          aria-current={activePage === "documents" ? "page" : undefined}
          className={activePage === "documents" ? "active" : ""}
          onClick={() => setActivePage("documents")}
          type="button"
        >
          <NavigationIcon name="documents" />
          <span className="nav-label">Документы</span>
        </button>

        <button
          aria-current={activePage === "reports" ? "page" : undefined}
          className={activePage === "reports" ? "active" : ""}
          onClick={() => setActivePage("reports")}
          type="button"
        >
          <NavigationIcon name="reports" />
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
          <NavigationIcon name="settings" />
          <span className="nav-label nav-settings-label">Настройки</span>
        </button>

        {dockSettingsOpen && (
          <div className="dock-settings">
            <strong>Настройки отображения</strong>

            <div className="theme-picker" role="group" aria-label="Тема оформления">
              <span>Тема оформления</span>
              <div><button type="button" aria-pressed={theme === "dark"} onClick={() => setTheme("dark")}>Тёмная</button><button type="button" aria-pressed={theme === "light"} onClick={() => setTheme("light")}>Светлая</button></div>
            </div>

            <button className="mobile-refresh" disabled={refreshing} onClick={refreshData} type="button">
              <span>Обновить данные</span>
              <Icon name="refresh" />
            </button>

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
