"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { query, withTransaction, type Run } from "@/lib/db";

function toInt(value: FormDataEntryValue | string | null): number {
  const n = Number.parseInt(String(value ?? "0").trim() || "0", 10);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function ids(formData: FormData, field: string): number[] {
  return formData
    .getAll(field)
    .map((v) => Number.parseInt(String(v), 10))
    .filter((n) => Number.isInteger(n));
}

/**
 * Saves the dashboard, writing only the fields this person actually changed.
 *
 * Each field is submitted alongside the value the page was rendered with. A
 * field still matching that baseline was not touched here, so it is left alone
 * and a phone sitting on a stale page cannot revert someone else's entry.
 */
export async function saveProgress(formData: FormData) {
  const itemIds = ids(formData, "itemId");
  const marketIds = ids(formData, "marketId");

  const text = (key: string) =>
    String(formData.get(key) ?? "").trim().slice(0, 500);

  await withTransaction(async (run) => {
    for (const id of itemIds) {
      // Printing is bulk - one total per item, covering all three markets.
      const printed = toInt(formData.get(`printed-${id}`));
      const notes = text(`notes-${id}`);
      const printedChanged =
        printed !== toInt(formData.get(`was-printed-${id}`));
      const notesChanged = notes !== text(`was-notes-${id}`);

      if (printedChanged || notesChanged) {
        await run(
          `INSERT INTO item_progress (item_id, printed, notes)
           VALUES ($1, $2, $3)
           ON CONFLICT (item_id)
           DO UPDATE SET
                printed    = CASE WHEN $4 THEN EXCLUDED.printed
                                  ELSE item_progress.printed END,
                notes      = CASE WHEN $5 THEN EXCLUDED.notes
                                  ELSE item_progress.notes END,
                updated_at = NOW()`,
          [id, printed, notes, printedChanged, notesChanged]
        );
      }

      // Packing is per market - what is physically in each box.
      for (const marketId of marketIds) {
        const key = `${id}-${marketId}`;
        const packed = toInt(formData.get(`packed-${key}`));
        if (packed === toInt(formData.get(`was-packed-${key}`))) continue;

        await run(
          `INSERT INTO market_progress (item_id, market_id, packaged)
           VALUES ($1, $2, $3)
           ON CONFLICT (item_id, market_id)
           DO UPDATE SET packaged = EXCLUDED.packaged, updated_at = NOW()`,
          [id, marketId, packed]
        );
      }
    }
  });

  revalidatePath("/");
  redirect("/?saved=1");
}

/** Left blank, the necessary quantity is half the submitted print run. */
function defaultNecessary(printQty: number): number {
  return Math.ceil(printQty / 2);
}

/**
 * Splits `total` across `count` markets as evenly as possible, giving the
 * remainder to the earliest markets so the parts always sum back to the total.
 */
function evenSplit(total: number, count: number): number[] {
  if (count <= 0) return [];
  const base = Math.floor(total / count);
  const remainder = total % count;
  return Array.from({ length: count }, (_, i) => base + (i < remainder ? 1 : 0));
}

async function reallocate(run: Run, itemId: number, necessaryQty: number) {
  const markets = await run<{ id: number }>(
    `SELECT id FROM markets ORDER BY sort_order, id`
  );
  const split = evenSplit(necessaryQty, markets.length);
  for (const [i, market] of markets.entries()) {
    await run(
      `INSERT INTO item_market_targets (item_id, market_id, qty)
       VALUES ($1, $2, $3)
       ON CONFLICT (item_id, market_id) DO UPDATE SET qty = EXCLUDED.qty`,
      [itemId, market.id, split[i]]
    );
  }
}

export async function addItem(formData: FormData) {
  const description = String(formData.get("description") ?? "").trim();
  if (!description) redirect("/items?error=description");

  const price = Number.parseFloat(String(formData.get("price") ?? "0")) || 0;
  const printQty = toInt(formData.get("printQty"));
  const necessaryRaw = String(formData.get("necessaryQty") ?? "").trim();
  const necessaryQty = necessaryRaw
    ? toInt(necessaryRaw)
    : defaultNecessary(printQty);

  await withTransaction(async (run) => {
    const rows = await run<{ id: number }>(
      `INSERT INTO items (description, price, print_qty, necessary_qty, sort_order)
       VALUES ($1, $2, $3, $4,
               COALESCE((SELECT MAX(sort_order) + 1 FROM items), 1))
       RETURNING id`,
      [description.slice(0, 120), price, printQty, necessaryQty]
    );
    await reallocate(run, rows[0].id, necessaryQty);
  });

  revalidatePath("/");
  redirect("/items");
}

export async function updateItem(formData: FormData) {
  const id = Number.parseInt(String(formData.get("id") ?? ""), 10);
  const description = String(formData.get("description") ?? "").trim();
  if (!Number.isInteger(id) || !description) redirect("/items?error=description");

  const price = Number.parseFloat(String(formData.get("price") ?? "0")) || 0;
  const printQty = toInt(formData.get("printQty"));
  const necessaryRaw = String(formData.get("necessaryQty") ?? "").trim();
  const necessaryQty = necessaryRaw
    ? toInt(necessaryRaw)
    : defaultNecessary(printQty);
  const wasNecessary = toInt(formData.get("wasNecessaryQty"));

  await withTransaction(async (run) => {
    await run(
      `UPDATE items
          SET description = $2, price = $3, print_qty = $4, necessary_qty = $5
        WHERE id = $1`,
      [id, description.slice(0, 120), price, printQty, necessaryQty]
    );
    // Changing the total invalidates any existing split, so redistribute it.
    if (necessaryQty !== wasNecessary) {
      await reallocate(run, id, necessaryQty);
    }
  });

  revalidatePath("/");
  redirect("/items");
}

/** Sets one item's per-market targets by hand. */
export async function saveTargets(formData: FormData) {
  const itemId = Number.parseInt(String(formData.get("itemId") ?? ""), 10);
  if (!Number.isInteger(itemId)) redirect("/items");
  const marketIds = ids(formData, "marketId");

  await withTransaction(async (run) => {
    for (const marketId of marketIds) {
      await run(
        `INSERT INTO item_market_targets (item_id, market_id, qty)
         VALUES ($1, $2, $3)
         ON CONFLICT (item_id, market_id) DO UPDATE SET qty = EXCLUDED.qty`,
        [itemId, marketId, toInt(formData.get(`target-${marketId}`))]
      );
    }
  });

  revalidatePath("/");
  redirect("/items#allocation");
}

/** Puts one item's markets back to an even three-way split. */
export async function resetTargets(formData: FormData) {
  const itemId = Number.parseInt(String(formData.get("itemId") ?? ""), 10);
  if (!Number.isInteger(itemId)) redirect("/items");

  await withTransaction(async (run) => {
    const rows = await run<{ necessary_qty: number }>(
      `SELECT necessary_qty FROM items WHERE id = $1`,
      [itemId]
    );
    if (rows.length) await reallocate(run, itemId, rows[0].necessary_qty);
  });

  revalidatePath("/");
  redirect("/items#allocation");
}

/** Adds a variant under an existing item, e.g. Mini Muelo under Minis. */
export async function addSubItem(formData: FormData) {
  const parentId = Number.parseInt(String(formData.get("parentId") ?? ""), 10);
  const description = String(formData.get("description") ?? "").trim();
  if (!Number.isInteger(parentId) || !description) {
    redirect("/items?error=subitem#sub-items");
  }

  await withTransaction(async (run) => {
    const existing = await run<{ n: string }>(
      `SELECT COUNT(*)::text AS n FROM items WHERE parent_id = $1`,
      [parentId]
    );
    const isFirst = existing[0]?.n === "0";

    const created = await run<{ id: number }>(
      `INSERT INTO items (description, price, print_qty, necessary_qty,
                          sort_order, parent_id)
       SELECT $2, p.price, 0, 0,
              COALESCE((SELECT MAX(sort_order) + 1
                          FROM items WHERE parent_id = $1), 1),
              p.id
         FROM items p
        WHERE p.id = $1 AND p.parent_id IS NULL
       RETURNING id`,
      [parentId, description.slice(0, 120)]
    );
    if (created.length === 0) return;

    // Once a category has sub-items its own figures stop counting, so anything
    // already logged against it would silently vanish from the totals. Move it
    // onto this first sub-item instead; re-attribute it there if it belonged
    // elsewhere.
    if (isFirst) {
      const childId = created[0].id;
      await run(`UPDATE item_progress SET item_id = $2 WHERE item_id = $1`, [
        parentId,
        childId,
      ]);
      await run(`UPDATE market_progress SET item_id = $2 WHERE item_id = $1`, [
        parentId,
        childId,
      ]);
    }
  });

  revalidatePath("/");
  redirect("/items#sub-items");
}

export async function deleteSubItem(formData: FormData) {
  const id = Number.parseInt(String(formData.get("id") ?? ""), 10);
  if (!Number.isInteger(id)) redirect("/items#sub-items");

  // Guarded to parent_id so this can never remove a top-level item.
  await query(`DELETE FROM items WHERE id = $1 AND parent_id IS NOT NULL`, [id]);

  revalidatePath("/");
  redirect("/items#sub-items");
}

/** Archived items drop off the dashboard but keep their numbers. */
export async function setArchived(formData: FormData) {
  const id = Number.parseInt(String(formData.get("id") ?? ""), 10);
  const archived = String(formData.get("archived")) === "true";
  if (!Number.isInteger(id)) redirect("/items");

  await query(`UPDATE items SET archived = $2 WHERE id = $1`, [id, archived]);

  revalidatePath("/");
  redirect("/items");
}

/* ---------------------------------------------------------------- filaments */

const HEX = /^#[0-9a-fA-F]{6}$/;

/**
 * Rebuilds the filter query string a row was edited under, so saving or
 * deleting returns you to the same filtered view instead of the full list.
 * Only known keys survive, so nothing arbitrary reaches the redirect.
 */
const FILTER_KEYS = ["brand", "type", "q", "sort", "dir"] as const;

function filterQuery(formData: FormData, flag: string): string {
  const raw = new URLSearchParams(String(formData.get("qs") ?? ""));
  const out = new URLSearchParams();
  for (const key of FILTER_KEYS) {
    const value = raw.get(key);
    if (value) out.set(key, value.slice(0, 80));
  }
  out.set(flag, "1");
  return `?${out.toString()}`;
}

function filamentFields(formData: FormData) {
  const color = String(formData.get("color") ?? "").trim();
  return {
    brand: String(formData.get("brand") ?? "").trim().slice(0, 80),
    type: String(formData.get("type") ?? "").trim().slice(0, 80),
    // The colour input always posts valid hex, but a hand-made request need not.
    color: HEX.test(color) ? color.toLowerCase() : "#cccccc",
    quantity: toInt(formData.get("quantity")),
    price: Math.max(
      0,
      Number.parseFloat(String(formData.get("price") ?? "0")) || 0
    ),
  };
}

export async function addFilament(formData: FormData) {
  const f = filamentFields(formData);
  if (!f.type && !f.brand) redirect(`/filaments${filterQuery(formData, "error")}`);

  await query(
    `INSERT INTO filaments (brand, type, color, quantity, price)
     VALUES ($1, $2, $3, $4, $5)`,
    [f.brand, f.type, f.color, f.quantity, f.price]
  );

  revalidatePath("/filaments");
  redirect(`/filaments${filterQuery(formData, "added")}`);
}

export async function updateFilament(formData: FormData) {
  const id = Number.parseInt(String(formData.get("id") ?? ""), 10);
  if (!Number.isInteger(id)) redirect("/filaments");
  const f = filamentFields(formData);

  await query(
    `UPDATE filaments
        SET brand = $2, type = $3, color = $4, quantity = $5, price = $6,
            updated_at = NOW()
      WHERE id = $1`,
    [id, f.brand, f.type, f.color, f.quantity, f.price]
  );

  revalidatePath("/filaments");
  redirect(`/filaments${filterQuery(formData, "saved")}`);
}

export async function deleteFilament(formData: FormData) {
  const id = Number.parseInt(String(formData.get("id") ?? ""), 10);
  if (!Number.isInteger(id)) redirect("/filaments");

  await query(`DELETE FROM filaments WHERE id = $1`, [id]);

  revalidatePath("/filaments");
  redirect(`/filaments${filterQuery(formData, "deleted")}`);
}
