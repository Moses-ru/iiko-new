// Что показывать в раскрытой карточке остатка.
// Управленца интересуют приход, продажи и списания; остальные одиннадцать
// видов проводок сворачиваются в одну строку, чтобы не прятать главное.

export const PRIMARY_MOVEMENTS = [
  { label: "Приход", field: "purchaseQty", tone: "in" },
  { label: "Продажи", field: "salesQty", tone: "out" },
  { label: "Списания", field: "writeoffQty", tone: "out" },
] as const;

export const OTHER_MOVEMENTS = [
  { label: "перемещения", field: "transferQty" },
  { label: "инвентаризация", field: "inventoryQty" },
  { label: "производство", field: "productionQty" },
  { label: "преобразование", field: "transformationQty" },
  { label: "расходные накладные", field: "outgoingInvoiceQty" },
  { label: "возвраты", field: "returnedQty" },
  { label: "возврат прихода", field: "incomingReturnedQty" },
  { label: "разборка", field: "disassembleQty" },
] as const;

const EPSILON = 0.000001;

type Turnover = Record<string, unknown> | undefined;

const amount = (turnover: Turnover, field: string) => {
  const value = Number(turnover?.[field] ?? 0);
  return Number.isFinite(value) ? value : 0;
};

export type MovementLine = { label: string; field: string; value: number; tone: "in" | "out" | "net" };

/**
 * Приход, продажи и списания — всегда модулем: знак в iiko зависит от типа
 * проводки, а «Продажи −12 кг» читается хуже, чем «Продажи 12 кг».
 * Прочее складывается со знаком, потому что там есть движение в обе стороны.
 */
export function movementLines(turnover: Turnover): { primary: MovementLine[]; other: MovementLine | null } {
  const primary: MovementLine[] = [];
  for (const line of PRIMARY_MOVEMENTS) {
    const value = Math.abs(amount(turnover, line.field));
    if (value > EPSILON) primary.push({ label: line.label, field: line.field, value, tone: line.tone });
  }

  let net = 0;
  const kinds: string[] = [];
  for (const line of OTHER_MOVEMENTS) {
    const value = amount(turnover, line.field);
    if (Math.abs(value) <= EPSILON) continue;
    net += value;
    kinds.push(line.label);
  }

  const other = kinds.length
    ? { label: `Прочее: ${kinds.join(", ")}`, field: "otherQty", value: net, tone: "net" as const }
    : null;

  return { primary, other };
}
