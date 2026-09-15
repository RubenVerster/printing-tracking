-- Splits fulfillment across the three markets.
--
-- Printing stays bulk (one number per item per week) and moves to print_log.
-- Packing becomes per-market and moves to pack_log, with a target per
-- (item, market) in item_market_targets.
--
-- Idempotent: a no-op on a database created from 001_schema.sql.

CREATE TABLE IF NOT EXISTS markets (
    id         SERIAL PRIMARY KEY,
    name       TEXT    NOT NULL UNIQUE,
    sort_order INTEGER NOT NULL DEFAULT 0
);

INSERT INTO markets (name, sort_order)
SELECT * FROM (VALUES
    ('Edgemead',    1),
    ('Tygervalley', 2),
    ('Capegate',    3)
) AS seed (name, sort_order)
WHERE NOT EXISTS (SELECT 1 FROM markets);

CREATE TABLE IF NOT EXISTS item_market_targets (
    item_id   INTEGER NOT NULL REFERENCES items (id)   ON DELETE CASCADE,
    market_id INTEGER NOT NULL REFERENCES markets (id) ON DELETE CASCADE,
    qty       INTEGER NOT NULL DEFAULT 0 CHECK (qty >= 0),
    PRIMARY KEY (item_id, market_id)
);

CREATE TABLE IF NOT EXISTS print_log (
    id         SERIAL PRIMARY KEY,
    item_id    INTEGER     NOT NULL REFERENCES items (id) ON DELETE CASCADE,
    week_start DATE        NOT NULL,
    printed    INTEGER     NOT NULL DEFAULT 0 CHECK (printed >= 0),
    notes      TEXT        NOT NULL DEFAULT '',
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (item_id, week_start)
);

CREATE TABLE IF NOT EXISTS pack_log (
    id         SERIAL PRIMARY KEY,
    item_id    INTEGER     NOT NULL REFERENCES items (id)   ON DELETE CASCADE,
    market_id  INTEGER     NOT NULL REFERENCES markets (id) ON DELETE CASCADE,
    week_start DATE        NOT NULL,
    packaged   INTEGER     NOT NULL DEFAULT 0 CHECK (packaged >= 0),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (item_id, market_id, week_start)
);

CREATE INDEX IF NOT EXISTS print_log_week_idx ON print_log (week_start);
CREATE INDEX IF NOT EXISTS pack_log_week_idx  ON pack_log (week_start);

-- Seed any item that has no allocation yet with an even three-way split.
INSERT INTO item_market_targets (item_id, market_id, qty)
SELECT i.id,
       m.id,
       (i.necessary_qty / 3)
         + CASE WHEN (m.sort_order - 1) < (i.necessary_qty % 3) THEN 1 ELSE 0 END
  FROM items i
 CROSS JOIN markets m
 WHERE NOT EXISTS (
       SELECT 1 FROM item_market_targets t WHERE t.item_id = i.id
 )
    ON CONFLICT (item_id, market_id) DO NOTHING;

-- Carry across anything already logged in the old single table.
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables
                WHERE table_name = 'fulfillments') THEN

        INSERT INTO print_log (item_id, week_start, printed, notes)
        SELECT item_id, week_start, printed, notes
          FROM fulfillments
         WHERE printed > 0 OR notes <> ''
            ON CONFLICT (item_id, week_start) DO NOTHING;

        -- Old rows predate markets, so packed stock cannot be attributed. It
        -- lands on the first market rather than being dropped; move it by hand
        -- if that is wrong.
        INSERT INTO pack_log (item_id, market_id, week_start, packaged)
        SELECT f.item_id,
               (SELECT id FROM markets ORDER BY sort_order LIMIT 1),
               f.week_start,
               f.packaged
          FROM fulfillments f
         WHERE f.packaged > 0
            ON CONFLICT (item_id, market_id, week_start) DO NOTHING;

        DROP TABLE fulfillments;
    END IF;
END $$;
