import { query } from "./db";

export type Market = { id: number; name: string; sort_order: number };

export type ItemRow = {
  id: number;
  description: string;
  price: string;
  print_qty: number;
  necessary_qty: number;
  sort_order: number;
  archived: boolean;
  /** Set on a sub-item; null on a top-level item. */
  parent_id: number | null;
};

/** market id -> quantity */
export type ByMarket = Map<number, number>;

export async function getMarkets(): Promise<Market[]> {
  return query<Market>(
    `SELECT id, name, sort_order FROM markets ORDER BY sort_order, id`
  );
}

export async function getAllItems(): Promise<ItemRow[]> {
  return query<ItemRow>(
    `SELECT id, description, price, print_qty, necessary_qty, sort_order,
            archived, parent_id
       FROM items
      ORDER BY archived, sort_order, id`
  );
}

type MarketQtyRow = { item_id: number; market_id: number; qty: number };

/** Groups flat (item, market, qty) rows into item id -> market id -> qty. */
function groupByItem(rows: MarketQtyRow[]): Map<number, ByMarket> {
  const byItem = new Map<number, ByMarket>();
  for (const row of rows) {
    const inner = byItem.get(row.item_id) ?? new Map<number, number>();
    inner.set(row.market_id, row.qty);
    byItem.set(row.item_id, inner);
  }
  return byItem;
}

export async function getTargetsByItem(): Promise<Map<number, ByMarket>> {
  return groupByItem(
    await query<MarketQtyRow>(
      `SELECT item_id, market_id, qty FROM item_market_targets`
    )
  );
}

export type BoardItem = ItemRow & {
  /** Printing is bulk: one running total per item, shared by all markets. */
  printed: number;
  notes: string;
  /** What is in each market's box. */
  packed: ByMarket;
  targets: ByMarket;
  /** Variants under this item. A parent's own figures are the sum of these. */
  children: BoardItem[];
  /** True when this row aggregates children rather than being typed into. */
  rollup: boolean;
};

/** Everything the dashboard needs, in one shot. */
export async function getBoard(): Promise<BoardItem[]> {
  const [items, packed, targets] = await Promise.all([
    query<ItemRow & { printed: number; notes: string }>(
      `SELECT i.id,
              i.description,
              i.price,
              i.print_qty,
              i.necessary_qty,
              i.sort_order,
              i.archived,
              i.parent_id,
              COALESCE(p.printed, 0) AS printed,
              COALESCE(p.notes, '')  AS notes
         FROM items i
         LEFT JOIN item_progress p ON p.item_id = i.id
        WHERE i.archived = FALSE
        ORDER BY i.sort_order, i.id`
    ),
    query<MarketQtyRow>(
      `SELECT item_id, market_id, packaged AS qty FROM market_progress`
    ),
    getTargetsByItem(),
  ]);

  const packedByItem = groupByItem(packed);
  const empty = (): ByMarket => new Map<number, number>();

  const build = (row: (typeof items)[number]): BoardItem => ({
    ...row,
    packed: packedByItem.get(row.id) ?? empty(),
    targets: targets.get(row.id) ?? empty(),
    children: [],
    rollup: false,
  });

  const byId = new Map(items.map((r) => [r.id, build(r)]));
  const top: BoardItem[] = [];

  for (const row of items) {
    const item = byId.get(row.id)!;
    const parent = row.parent_id ? byId.get(row.parent_id) : undefined;
    if (parent) parent.children.push(item);
    else top.push(item);
  }

  // A parent with children is not typed into — its figures are the sum of them.
  for (const item of top) {
    if (item.children.length === 0) continue;
    item.rollup = true;
    item.printed = item.children.reduce((t, c) => t + c.printed, 0);
    const packedTotals = empty();
    for (const child of item.children) {
      for (const [marketId, qty] of child.packed) {
        packedTotals.set(marketId, (packedTotals.get(marketId) ?? 0) + qty);
      }
    }
    item.packed = packedTotals;
  }

  return top;
}

export type MarketBox = {
  id: number;
  name: string;
  target: number;
  packed: number;
};

/** One row per market: how much its box needs, and how much is in it. */
export async function getMarketBoxes(): Promise<MarketBox[]> {
  return query<MarketBox>(
    `SELECT m.id,
            m.name,
            COALESCE(t.target, 0)::int AS target,
            COALESCE(p.packed, 0)::int AS packed
       FROM markets m
       LEFT JOIN (
            -- Targets live on top-level items only.
            SELECT t.market_id, SUM(t.qty) AS target
              FROM item_market_targets t
              JOIN items i ON i.id = t.item_id
                          AND i.archived = FALSE
                          AND i.parent_id IS NULL
             GROUP BY t.market_id
       ) t ON t.market_id = m.id
       LEFT JOIN (
            -- Only leaves count: a category's own row would double up with the
            -- sub-items that make it up.
            SELECT p.market_id, SUM(p.packaged) AS packed
              FROM market_progress p
              JOIN items i ON i.id = p.item_id AND i.archived = FALSE
              LEFT JOIN items parent ON parent.id = i.parent_id
             WHERE NOT EXISTS (SELECT 1 FROM items c WHERE c.parent_id = i.id)
               AND (i.parent_id IS NULL OR parent.archived = FALSE)
             GROUP BY p.market_id
       ) p ON p.market_id = m.id
      ORDER BY m.sort_order, m.id`
  );
}

/** When anything was last touched, for the "updated" line on the dashboard. */
export async function getLastUpdated(): Promise<string | null> {
  const rows = await query<{ last: string | null }>(
    `SELECT MAX(t)::text AS last FROM (
        SELECT MAX(updated_at) AS t FROM item_progress
         UNION ALL
        SELECT MAX(updated_at) FROM market_progress
     ) x`
  );
  return rows[0]?.last ?? null;
}

export type Filament = {
  id: number;
  brand: string;
  type: string;
  color: string;
  quantity: number;
  price: string;
};

/** Whitelisted sort columns — the key comes from the URL, the value does not. */
const FILAMENT_SORTS: Record<string, string> = {
  brand: "brand",
  type: "type",
  color: "color",
  quantity: "quantity",
  price: "price",
  value: "quantity * price",
};

export type FilamentFilter = {
  brand?: string;
  type?: string;
  q?: string;
  sort?: string;
  dir?: string;
};

export function filamentSortColumn(sort?: string): string {
  return sort && sort in FILAMENT_SORTS ? sort : "brand";
}

export async function getFilaments(
  filter: FilamentFilter = {}
): Promise<Filament[]> {
  const where: string[] = [];
  const params: unknown[] = [];

  if (filter.brand) {
    params.push(filter.brand);
    where.push(`brand = $${params.length}`);
  }
  if (filter.type) {
    params.push(filter.type);
    where.push(`type = $${params.length}`);
  }
  if (filter.q) {
    params.push(`%${filter.q}%`);
    where.push(`(brand ILIKE $${params.length} OR type ILIKE $${params.length})`);
  }

  const column = FILAMENT_SORTS[filamentSortColumn(filter.sort)];
  const direction = filter.dir === "desc" ? "DESC" : "ASC";

  return query<Filament>(
    `SELECT id, brand, type, color, quantity, price
       FROM filaments
      ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
      ORDER BY ${column} ${direction}, id`,
    params
  );
}

/** Distinct values for the filter dropdowns, ignoring any active filter. */
export async function getFilamentFacets(): Promise<{
  brands: string[];
  types: string[];
}> {
  const [brands, types] = await Promise.all([
    query<{ v: string }>(
      `SELECT DISTINCT brand AS v FROM filaments WHERE brand <> '' ORDER BY v`
    ),
    query<{ v: string }>(
      `SELECT DISTINCT type AS v FROM filaments WHERE type <> '' ORDER BY v`
    ),
  ]);
  return { brands: brands.map((r) => r.v), types: types.map((r) => r.v) };
}
