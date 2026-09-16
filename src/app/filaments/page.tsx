import Link from "next/link";
import { addFilament, deleteFilament, updateFilament } from "../actions";
import {
  getFilamentFacets,
  getFilaments,
  filamentSortColumn,
  type FilamentFilter,
} from "@/lib/data";

export const dynamic = "force-dynamic";

/** Suggestions only — the field stays free text. */
const TYPES = [
  "PLA", "PLA+", "Silk PLA", "PETG", "ABS", "ASA",
  "TPU", "Nylon", "PC", "HIPS", "PVA", "Wood PLA", "Carbon Fibre",
];

const COLUMNS: { key: string; label: string; num?: boolean }[] = [
  { key: "color", label: "Colour" },
  { key: "brand", label: "Brand" },
  { key: "type", label: "Type" },
  { key: "quantity", label: "Qty", num: true },
  { key: "price", label: "Price", num: true },
  { key: "value", label: "Value", num: true },
];

type Params = FilamentFilter & {
  added?: string;
  saved?: string;
  deleted?: string;
  error?: string;
  confirm?: string;
};

export default async function FilamentsPage({
  searchParams,
}: {
  searchParams: Promise<Params>;
}) {
  const params = await searchParams;

  const filter: FilamentFilter = {
    brand: params.brand?.trim() || undefined,
    type: params.type?.trim() || undefined,
    q: params.q?.trim() || undefined,
    sort: params.sort,
    dir: params.dir === "desc" ? "desc" : "asc",
  };

  const [filaments, facets] = await Promise.all([
    getFilaments(filter),
    getFilamentFacets(),
  ]);

  const sortKey = filamentSortColumn(filter.sort);
  const filtering = Boolean(filter.brand || filter.type || filter.q);

  /** The active filter as a query string, carried through edits and links. */
  const queryString = (() => {
    const p = new URLSearchParams();
    if (filter.brand) p.set("brand", filter.brand);
    if (filter.type) p.set("type", filter.type);
    if (filter.q) p.set("q", filter.q);
    p.set("sort", sortKey);
    p.set("dir", filter.dir === "desc" ? "desc" : "asc");
    return p.toString();
  })();

  const hrefWith = (extra: Record<string, string> = {}) => {
    const p = new URLSearchParams(queryString);
    for (const [k, v] of Object.entries(extra)) p.set(k, v);
    return `/filaments?${p.toString()}`;
  };

  const spools = filaments.reduce((t, f) => t + f.quantity, 0);
  const value = filaments.reduce((t, f) => t + f.quantity * Number(f.price), 0);
  const kinds = new Set(filaments.map((f) => f.type).filter(Boolean)).size;

  const confirmingId = Number.parseInt(String(params.confirm ?? ""), 10);

  const flash = params.added
    ? "Filament added."
    : params.saved
      ? "Saved."
      : params.deleted
        ? "Filament deleted."
        : null;

  return (
    <>
      {flash ? <div className="flash">{flash}</div> : null}
      {params.error ? (
        <div className="flash error">
          Give the filament at least a brand or a type.
        </div>
      ) : null}

      <div className="stats">
        <div className="stat">
          <div className="k">{filtering ? "Spools shown" : "Spools in stock"}</div>
          <div className="v">{spools}</div>
        </div>
        <div className="stat">
          <div className="k">{filtering ? "Value shown" : "Stock value"}</div>
          <div className="v">R{value.toFixed(0)}</div>
        </div>
        <div className="stat">
          <div className="k">Types</div>
          <div className="v">{kinds}</div>
        </div>
      </div>

      <div className="panel">
        <h2>Add filament</h2>
        <p className="sub">
          Brand and type are free text; the list is only suggestions. Price
          defaults to 300 a roll.
        </p>
        <form action={addFilament} className="filament-form">
          <input type="hidden" name="qs" value={queryString} />
          <div className="field">
            <label htmlFor="brand-new">Brand</label>
            <input id="brand-new" name="brand" type="text" placeholder="e.g. Sunlu" />
          </div>
          <div className="field">
            <label htmlFor="type-new">Type</label>
            <input id="type-new" name="type" type="text" list="filament-types" placeholder="e.g. PLA" />
          </div>
          <div className="field">
            <label htmlFor="color-new">Colour</label>
            <input id="color-new" name="color" type="color" defaultValue="#c1121f" />
          </div>
          <div className="field">
            <label htmlFor="qty-new">Quantity</label>
            <input id="qty-new" name="quantity" type="number" inputMode="numeric" min="0" step="1" defaultValue="1" />
          </div>
          <div className="field">
            <label htmlFor="price-new">Price</label>
            {/* A roll is 300 as a rule; override it when it isn't. */}
            <input id="price-new" name="price" type="number" inputMode="decimal" min="0" step="0.01" defaultValue="300" />
          </div>
          <button className="btn primary" type="submit">Add</button>
        </form>
        <datalist id="filament-types">
          {TYPES.map((t) => <option key={t} value={t} />)}
        </datalist>
      </div>

      <div className="panel">
        <h2>Stock</h2>
        <p className="sub">
          Filter the list, or sort it by tapping a column heading. Edit any row
          and save it.
        </p>

        <form method="get" className="filterbar">
          {/* Keep the current sort when the filter changes. */}
          <input type="hidden" name="sort" value={sortKey} />
          <input type="hidden" name="dir" value={filter.dir === "desc" ? "desc" : "asc"} />
          <div className="field">
            <label htmlFor="f-brand">Brand</label>
            <select id="f-brand" name="brand" defaultValue={filter.brand ?? ""}>
              <option value="">Any</option>
              {facets.brands.map((b) => <option key={b} value={b}>{b}</option>)}
            </select>
          </div>
          <div className="field">
            <label htmlFor="f-type">Type</label>
            <select id="f-type" name="type" defaultValue={filter.type ?? ""}>
              <option value="">Any</option>
              {facets.types.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div className="field">
            <label htmlFor="f-q">Search</label>
            <input id="f-q" name="q" type="search" defaultValue={filter.q ?? ""} placeholder="brand or type" />
          </div>
          <button className="btn" type="submit">Filter</button>
          {filtering ? (
            <Link className="btn" href="/filaments">Clear</Link>
          ) : null}
        </form>

        {filaments.length === 0 ? (
          <p className="empty">
            {filtering ? "No filament matches this filter." : "No filament recorded yet."}
          </p>
        ) : (
          <>
            <div className="table-wrap">
              <table className="stock-table">
                <thead>
                  <tr>
                    {COLUMNS.map((c) => {
                      const active = sortKey === c.key;
                      const nextDir = active && filter.dir !== "desc" ? "desc" : "asc";
                      return (
                        <th key={c.key} className={c.num ? "num" : undefined}>
                          <Link
                            className={`sort${active ? " active" : ""}`}
                            href={hrefWith({ sort: c.key, dir: nextDir })}
                          >
                            {c.label}
                            <span className="arrow">
                              {active ? (filter.dir === "desc" ? "▼" : "▲") : ""}
                            </span>
                          </Link>
                        </th>
                      );
                    })}
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {filaments.map((f) => {
                    const fid = `filament-${f.id}`;
                    const confirming = f.id === confirmingId;
                    const label = [f.brand, f.type].filter(Boolean).join(" ") || "this filament";
                    return (
                      <tr key={f.id} id={`f-${f.id}`} className={confirming ? "confirming" : undefined}>
                        <td>
                          <span className="swatch-wrap">
                            <span className="swatch" style={{ background: f.color }} />
                            <input form={fid} type="color" name="color" defaultValue={f.color} disabled={confirming} />
                          </span>
                        </td>
                        <td>
                          <input form={fid} type="text" name="brand" defaultValue={f.brand} placeholder="Brand" disabled={confirming} />
                        </td>
                        <td>
                          <input form={fid} type="text" name="type" defaultValue={f.type} list="filament-types" placeholder="Type" disabled={confirming} />
                        </td>
                        <td className="num">
                          <input form={fid} className="qty" type="number" inputMode="numeric" min="0" step="1" name="quantity" defaultValue={f.quantity} disabled={confirming} />
                        </td>
                        <td className="num">
                          <input form={fid} className="qty" type="number" inputMode="decimal" min="0" step="0.01" name="price" defaultValue={Number(f.price).toFixed(2)} disabled={confirming} />
                        </td>
                        <td className="num muted">
                          R{(f.quantity * Number(f.price)).toFixed(0)}
                        </td>
                        <td className="row-actions">
                          {confirming ? (
                            <>
                              <span className="confirm-text">Delete {label}?</span>
                              <button form={fid} className="btn small danger solid" type="submit" formAction={deleteFilament}>
                                Yes, delete
                              </button>
                              <Link className="btn small" href={hrefWith()}>Cancel</Link>
                            </>
                          ) : (
                            <>
                              <button form={fid} className="btn small" type="submit">Save</button>
                              <Link
                                className="btn small danger"
                                href={`${hrefWith({ confirm: String(f.id) })}#f-${f.id}`}
                              >
                                Delete
                              </Link>
                            </>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/*
              One form per row, living outside the table so the cells above can
              stay real <td>s and line up with the headings. Each input points
              at its form by id, which is what the form attribute is for.
            */}
            {filaments.map((f) => (
              <form key={f.id} id={`filament-${f.id}`} action={updateFilament} className="row-form">
                <input type="hidden" name="id" value={f.id} />
                <input type="hidden" name="qs" value={queryString} />
              </form>
            ))}
          </>
        )}
      </div>
    </>
  );
}
