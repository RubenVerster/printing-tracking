# Christmas Market Fulfillment

A standing dashboard of how much has been printed and how full each of the three
market boxes is, for the December markets. Next.js (App Router) + PostgreSQL,
both in Docker.

There is no time dimension — no weeks, no daily logs. Every number is a running
total: type what has been done in total, not what was added today.

Each item carries two numbers:

- **Submitted qty** — what was sent to the printer.
- **Necessary qty** — what the three markets actually need, which is half the
  submitted quantity (rounded up). All progress is measured against this.

The necessary quantity is split across three boxes — **Edgemead**,
**Tygervalley** and **Capegate** — evenly by default, with the remainder going
to the earlier markets so the three shares always add back up to the total
(65 becomes 22 / 22 / 21). Override any share by hand on the Items page.

The two halves of the work are tracked differently:

- **Printing is bulk.** One running total per item, covering all markets.
- **Packing is per market.** One running total per item per box.

## Run it

```bash
docker compose up -d --build
```

Then open <http://localhost:3000>.

### Logging from phones

Any phone on the same Wi-Fi can use the app — no install, no app store. Point
the phone's browser at this machine's LAN address:

```
http://192.168.1.124:3000
```

Find the address again if it ever changes:

```bash
ip -4 -o addr show scope global | awk '{print $2, $4}'
```

Notes:

- This machine has to be awake with `docker compose up` running; the phones are
  just browsers talking to it.
- It's plain HTTP on your LAN, so browsers may warn it is "not secure" — fine
  here, but don't forward port 3000 through your router. There is no login.
- Add it to the home screen (Share → Add to Home Screen) to get an app icon.
- Two phones can update at once. A save only writes the numbers that person
  actually changed, so whoever saves second will not revert the other's
  entries.
- Phones keep themselves in step: they refresh when brought back to the
  foreground, and again every 15 seconds while left open. Both are skipped while
  there are unsaved edits on screen, so nothing disturbs someone part-way
  through counting — save first, and it resumes. A backgrounded phone makes no
  requests at all.
- The poll interval is `POLL_MS` at the top of `src/app/live-refresh.tsx`.

- App: `localhost:3000`
- Postgres: `127.0.0.1:55433` (user `xmas`, password `xmas`, database `xmas`)

Both host ports are configurable in `.env` (`APP_PORT`, `DB_PORT`) — the
containers themselves always use 3000 and 5432 internally, so changing these
cannot break anything.

Postgres is bound to loopback only and sits on an unusual port so it cannot
collide with another project's database or be reached from the LAN. The app
never uses that mapping; it reaches the database as `db:5432` over the compose
network, so you can delete the mapping entirely and everything still works.

Stop with `docker compose down`. Data lives in the `db_data` volume and survives
restarts — `docker compose down -v` wipes it.

## Pages

| Page | What it does |
| --- | --- |
| **Dashboard** (`/`) | Overall packed and printed against the 555 needed, a fill card per market box, and one editable table: printed per item plus what is in each box. |
| **Filament** (`/filaments`) | Filament stock: brand, type, colour, quantity and price, with full add / edit / delete (deleting asks to confirm first). Shows spools on hand, total stock value and how many types you carry. |
| **Items** (`/items`) | Add, edit and archive items. Changing an item's necessary quantity re-splits it evenly across the markets. The *Market allocation* panel edits each market's share by hand and flags when the three no longer sum to the necessary quantity; **Even split** puts one back to thirds. |


## Data model

`db/init/001_schema.sql` creates the schema and seeds the eight starting items.
Scripts in `db/init/` only run when the database volume is empty; each is
idempotent, so to apply one to a database that already has data, pipe it in:

```bash
docker compose exec -T db psql -U xmas -d xmas -v ON_ERROR_STOP=1 < db/init/004_drop_weekly.sql
```

- `items` — description, price, print_qty (submitted), necessary_qty (the
  target progress is measured against), sort_order, archived
- `markets` — Edgemead, Tygervalley, Capegate
- `item_market_targets` — each market's share of an item, unique on
  `(item_id, market_id)`; the three rows are expected to sum to necessary_qty
- `filaments` — filament stock: brand, type, colour (hex), quantity, price
- `item_progress` — bulk printing, one row per item
- `market_progress` — what is in each box, one row per `(item_id, market_id)`

Saving runs in a single transaction, so a save either lands completely or
not at all.

## Developing outside Docker

```bash
docker compose up -d db          # database only
cp .env.example .env
npm install
npm run dev
```

## Backing up

```bash
docker compose exec db pg_dump -U xmas xmas > backup.sql
```
