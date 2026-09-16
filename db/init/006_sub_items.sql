-- Sub-items: Minis and Biggies are categories holding several variants
-- (Mini Muelo, Turtle, Octopus...).
--
-- A sub-item is an ordinary item row with parent_id set. The parent keeps the
-- necessary quantity and the per-market split; the sub-items are where work is
-- actually logged, and the parent's figures are the sum of its children.
--
-- Idempotent: safe to re-run.

ALTER TABLE items
    ADD COLUMN IF NOT EXISTS parent_id INTEGER REFERENCES items (id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS items_parent_idx ON items (parent_id);

-- Starting variants under Minis, to work from.
INSERT INTO items (description, price, print_qty, necessary_qty, sort_order, parent_id)
SELECT v.description, p.price, 0, 0, v.sort_order, p.id
  FROM items p
  CROSS JOIN (VALUES
      ('Mini Muelo',       1),
      ('Mini Light Muelo', 2)
  ) AS v (description, sort_order)
 WHERE p.description = 'Minis'
   AND p.parent_id IS NULL
   AND NOT EXISTS (
       SELECT 1 FROM items c
        WHERE c.parent_id = p.id AND c.description = v.description
   );
