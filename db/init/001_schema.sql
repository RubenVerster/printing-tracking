-- Christmas Market fulfillment tracker
--
-- One running total per item, and one per item per market. No time dimension:
-- this is a standing overview of how full the three market boxes are.

CREATE TABLE IF NOT EXISTS items (
    id            SERIAL PRIMARY KEY,
    description   TEXT           NOT NULL,
    price         NUMERIC(10, 2) NOT NULL DEFAULT 0,
    -- What we submitted to the printer.
    print_qty     INTEGER        NOT NULL DEFAULT 0,
    -- What we actually need across all three markets combined; defaults to
    -- half the submitted quantity, rounded up.
    necessary_qty INTEGER        NOT NULL DEFAULT 0,
    sort_order    INTEGER        NOT NULL DEFAULT 0,
    archived      BOOLEAN        NOT NULL DEFAULT FALSE,
    created_at    TIMESTAMPTZ    NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS markets (
    id         SERIAL PRIMARY KEY,
    name       TEXT    NOT NULL UNIQUE,
    sort_order INTEGER NOT NULL DEFAULT 0
);

-- How each item's necessary quantity is divided between the markets. The three
-- rows for an item are expected to sum to items.necessary_qty.
CREATE TABLE IF NOT EXISTS item_market_targets (
    item_id   INTEGER NOT NULL REFERENCES items (id)   ON DELETE CASCADE,
    market_id INTEGER NOT NULL REFERENCES markets (id) ON DELETE CASCADE,
    qty       INTEGER NOT NULL DEFAULT 0 CHECK (qty >= 0),
    PRIMARY KEY (item_id, market_id)
);

-- Printing is bulk for all markets at once: one running total per item.
CREATE TABLE IF NOT EXISTS item_progress (
    item_id    INTEGER PRIMARY KEY REFERENCES items (id) ON DELETE CASCADE,
    printed    INTEGER     NOT NULL DEFAULT 0 CHECK (printed >= 0),
    notes      TEXT        NOT NULL DEFAULT '',
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- What is actually in each market's box: one running total per item per market.
CREATE TABLE IF NOT EXISTS market_progress (
    item_id    INTEGER     NOT NULL REFERENCES items (id)   ON DELETE CASCADE,
    market_id  INTEGER     NOT NULL REFERENCES markets (id) ON DELETE CASCADE,
    packaged   INTEGER     NOT NULL DEFAULT 0 CHECK (packaged >= 0),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (item_id, market_id)
);

-- Filament stock on hand: what we have to print with.
-- Independent of the market fulfillment tables.
CREATE TABLE IF NOT EXISTS filaments (
    id         SERIAL PRIMARY KEY,
    brand      TEXT          NOT NULL DEFAULT '',
    type       TEXT          NOT NULL DEFAULT '',
    -- Hex from the browser's colour picker, e.g. "#1a7f3c".
    color      TEXT          NOT NULL DEFAULT '#cccccc',
    quantity   INTEGER       NOT NULL DEFAULT 0 CHECK (quantity >= 0),
    price      NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (price >= 0),
    created_at TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS filaments_sort_idx ON filaments (brand, type, id);

INSERT INTO markets (name, sort_order)
SELECT * FROM (VALUES
    ('Edgemead',    1),
    ('Tygervalley', 2),
    ('Capegate',    3)
) AS seed (name, sort_order)
WHERE NOT EXISTS (SELECT 1 FROM markets);

INSERT INTO items (description, price, print_qty, necessary_qty, sort_order)
SELECT * FROM (VALUES
    ('Lucky',          249, 130,  65, 1),
    ('Lucky K9',       179, 130,  65, 2),
    ('Minis',           65, 195,  98, 3),
    ('Biggies',         85, 195,  98, 4),
    ('Sheepie',         79,  65,  33, 5),
    ('Chimuelo',       299,  65,  33, 6),
    ('Mini Dragon',    149, 195,  98, 7),
    ('Generous Print', 199, 130,  65, 8)
) AS seed (description, price, print_qty, necessary_qty, sort_order)
WHERE NOT EXISTS (SELECT 1 FROM items);

-- Even three-way split. The first (necessary_qty % 3) markets take one extra so
-- the three targets always add back up to the necessary quantity.
INSERT INTO item_market_targets (item_id, market_id, qty)
SELECT i.id,
       m.id,
       (i.necessary_qty / 3)
         + CASE WHEN (m.sort_order - 1) < (i.necessary_qty % 3) THEN 1 ELSE 0 END
  FROM items i
 CROSS JOIN markets m
    ON CONFLICT (item_id, market_id) DO NOTHING;
