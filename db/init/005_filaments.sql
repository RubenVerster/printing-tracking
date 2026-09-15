-- Filament stock on hand: what we have to print with.
-- Independent of the market fulfillment tables.
-- Idempotent: safe to re-run.

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
