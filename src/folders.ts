// Дерево папок номенклатуры, как в iikoOffice.
// Строится из полей, которые уже приходят с каждой позицией:
// thirdGroup → secondGroup → group, от корня к листу.

export type FolderNode<T> = {
  name: string;
  /** Путь от корня до этой папки включительно. */
  path: string[];
  children: FolderNode<T>[];
  /** Позиции, лежащие прямо в этой папке, без вложенных. */
  items: T[];
  /** Сколько позиций внутри вместе со всеми вложенными папками. */
  count: number;
  /** Сумма по позициям внутри вместе со всеми вложенными папками. */
  value: number;
};

export type FolderTree<T> = {
  /** Папки верхнего уровня. */
  folders: FolderNode<T>[];
  /** Позиции вне папок — в офисе они тоже лежат в корне списка. */
  items: T[];
  count: number;
  value: number;
};

const EMPTY_PATH: string[] = [];

/**
 * Заглушка, которой iiko добивает путь до трёх уровней у позиций, лежащих
 * выше третьего. Это не папка: если её оставить, «Товары» из двухуровневой
 * ветки и «Товары» из трёхуровневой окажутся разными корнями.
 */
const ROOT_PLACEHOLDERS = new Set(["группа самого высокого уровня"]);

const isPlaceholder = (name: string) => ROOT_PLACEHOLDERS.has(name.toLocaleLowerCase("ru-RU"));

/**
 * Путь из трёх полей остатков. Пустые уровни выбрасываются, а не превращаются
 * в папку с пустым именем: у части позиций заполнен только верхний уровень.
 */
export function stockPath(item: { group?: unknown; secondGroup?: unknown; thirdGroup?: unknown }): string[] {
  const path = [item.thirdGroup, item.secondGroup, item.group]
    .map((level) => String(level ?? "").trim())
    .filter((level) => level && !isPlaceholder(level));
  return path.length ? path : EMPTY_PATH;
}

type Builder<T> = { node: FolderNode<T>; children: Map<string, Builder<T>> };

function makeBuilder<T>(name: string, path: string[]): Builder<T> {
  return { node: { name, path, children: [], items: [], count: 0, value: 0 }, children: new Map() };
}

function finish<T>(builder: Builder<T>, sort: (a: FolderNode<T>, b: FolderNode<T>) => number): FolderNode<T> {
  builder.node.children = [...builder.children.values()].map((child) => finish(child, sort)).sort(sort);
  return builder.node;
}

const byName = (a: { name: string }, b: { name: string }) =>
  a.name.localeCompare(b.name, "ru", { sensitivity: "base", numeric: true });

/**
 * Собирает дерево за один проход. Счётчики и суммы накапливаются по дороге
 * вниз, поэтому у каждой папки они включают всё вложенное — это то число,
 * которое человек ожидает увидеть на закрытой папке.
 */
export function buildFolderTree<T>(
  items: readonly T[],
  getPath: (item: T) => readonly string[],
  getValue: (item: T) => number = () => 0,
): FolderTree<T> {
  const roots = new Map<string, Builder<T>>();
  const loose: T[] = [];
  let total = 0;
  let totalValue = 0;

  for (const item of items) {
    const value = Number(getValue(item));
    const amount = Number.isFinite(value) ? value : 0;
    total += 1;
    totalValue += amount;

    const path = getPath(item).map((level) => String(level ?? "").trim()).filter(Boolean);
    if (!path.length) {
      loose.push(item);
      continue;
    }

    let level = roots;
    let builder: Builder<T> | undefined;
    const walked: string[] = [];

    for (const name of path) {
      walked.push(name);
      let next = level.get(name);
      if (!next) {
        next = makeBuilder<T>(name, [...walked]);
        level.set(name, next);
      }
      next.node.count += 1;
      next.node.value += amount;
      builder = next;
      level = next.children;
    }

    builder!.node.items.push(item);
  }

  return {
    folders: [...roots.values()].map((builder) => finish(builder, byName)).sort(byName),
    items: loose,
    count: total,
    value: totalValue,
  };
}

/**
 * Спуск по пути. Возвращает null, если такой папки нет — путь мог устареть
 * после смены склада или периода, и тогда экран возвращается к корню.
 */
export function folderAt<T>(tree: FolderTree<T>, path: readonly string[]): FolderTree<T> | null {
  if (!path.length) return tree;

  let folders = tree.folders;
  let node: FolderNode<T> | undefined;

  for (const name of path) {
    node = folders.find((folder) => folder.name === name);
    if (!node) return null;
    folders = node.children;
  }

  return { folders: node!.children, items: node!.items, count: node!.count, value: node!.value };
}
