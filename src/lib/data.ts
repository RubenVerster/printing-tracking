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
    `SELECT id, description, price, print_qty, necessary_qty, sort_order, archived
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

  return items.map((item) => ({
    ...item,
    packed: packedByItem.get(item.id) ?? empty(),
    targets: targets.get(item.id) ?? empty(),
  }));
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
            SELECT t.market_id, SUM(t.qty) AS target
              FROM item_market_targets t
              JOIN items i ON i.id = t.item_id AND i.archived = FALSE
             GROUP BY t.market_id
       ) t ON t.market_id = m.id
       LEFT JOIN (
            SELECT p.market_id, SUM(p.packaged) AS packed
              FROM market_progress p
              JOIN items i ON i.id = p.item_id AND i.archived = FALSE
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

export async function getFilaments(): Promise<Filament[]> {
  return query<Filament>(
    `SELECT id, brand, type, color, quantity, price
       FROM filaments
      ORDER BY brand, type, id`
  );
}
