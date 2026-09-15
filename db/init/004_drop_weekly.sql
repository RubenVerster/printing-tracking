-- Collapses the weekly logs into single running totals.
--
-- The markets run once in December, so there is nothing to compare week on
-- week: what matters is how full each box is right now. Any weekly rows are
-- summed into the new totals before the old tables go.
--
-- Idempotent: a no-op on a database created from 001_schema.sql.

CREATE TABLE IF NOT EXISTS item_progress (
    item_id    INTEGER PRIMARY KEY REFERENCES items (id) ON DELETE CASCADE,
    printed    INTEGER     NOT NULL DEFAULT 0 CHECK (printed >= 0),
    notes      TEXT        NOT NULL DEFAULT '',
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS market_progress (
    item_id    INTEGER     NOT NULL REFERENCES items (id)   ON DELETE CASCADE,
    market_id  INTEGER     NOT NULL REFERENCES markets (id) ON DELETE CASCADE,
    packaged   INTEGER     NOT NULL DEFAULT 0 CHECK (packaged >= 0),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (item_id, market_id)
);

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables
                WHERE table_name = 'print_log') THEN
        INSERT INTO item_progress (item_id, printed, notes)
        SELECT item_id,
               SUM(printed),
               COALESCE(MAX(NULLIF(notes, '')), '')
          FROM print_log
         GROUP BY item_id
            ON CONFLICT (item_id) DO UPDATE
               SET printed = item_progress.printed + EXCLUDED.printed;
        DROP TABLE print_log;
    END IF;

    IF EXISTS (SELECT 1 FROM information_schema.tables
                WHERE table_name = 'pack_log') THEN
        INSERT INTO market_progress (item_id, market_id, packaged)
        SELECT item_id, market_id, SUM(packaged)
          FROM pack_log
         GROUP BY item_id, market_id
            ON CONFLICT (item_id, market_id) DO UPDATE
               SET packaged = market_progress.packaged + EXCLUDED.packaged;
        DROP TABLE pack_log;
    END IF;
END $$;
