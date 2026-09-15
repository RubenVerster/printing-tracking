-- Adds the "necessary quantity" target to existing databases.
-- Idempotent: a no-op on a database created from 001_schema.sql.

ALTER TABLE items
    ADD COLUMN IF NOT EXISTS necessary_qty INTEGER NOT NULL DEFAULT 0;

-- Backfill anything still unset with half the submitted print quantity,
-- rounded up so we never aim short.
UPDATE items
   SET necessary_qty = CEIL(print_qty / 2.0)
 WHERE necessary_qty = 0
   AND print_qty > 0;
