type CatalogPrices = { menuPrice?: unknown; costPrice?: unknown; menuPriceStatus?: string };
export function catalogPrice(item: CatalogPrices) {
  const numeric = (value: unknown) => value == null || value === "" ? null : Number.isFinite(Number(value)) ? Number(value) : null;
  const menu = numeric(item.menuPrice);
  // Older Workers used zero as a placeholder, rather than a real menu price.
  const menuAvailable = item.menuPriceStatus !== "unavailable" && menu !== null && (menu !== 0 || item.menuPriceStatus === "available");
  const cost = numeric(item.costPrice);
  if (menuAvailable) return { label: "Цена меню", value: menu };
  if (cost !== null) return { label: "Себестоимость", value: cost };
  return { label: "Цена", value: null };
}
