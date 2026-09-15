import { addFilament, deleteFilament, updateFilament } from "../actions";
import { getFilaments } from "@/lib/data";

export const dynamic = "force-dynamic";

/** Suggestions only — the field stays free text. */
const TYPES = [
  "PLA",
  "PLA+",
  "Silk PLA",
  "PETG",
  "ABS",
  "ASA",
  "TPU",
  "Nylon",
  "PC",
  "HIPS",
  "PVA",
  "Wood PLA",
  "Carbon Fibre",
];

export default async function FilamentsPage({
  searchParams,
}: {
  searchParams: Promise<{ added?: string; saved?: string; deleted?: string; error?: string }>;
}) {
  const params = await searchParams;
  const filaments = await getFilaments();

  const spools = filaments.reduce((t, f) => t + f.quantity, 0);
  const value = filaments.reduce(
    (t, f) => t + f.quantity * Number(f.price),
    0
  );
  const kinds = new Set(filaments.map((f) => f.type).filter(Boolean)).size;

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
      {params.error === "empty" ? (
        <div className="flash error">Give the filament at least a brand or a type.</div>
      ) : null}

      <div className="stats">
        <div className="stat">
          <div className="k">Spools in stock</div>
          <div className="v">{spools}</div>
        </div>
        <div className="stat">
          <div className="k">Stock value</div>
          <div className="v">R{value.toFixed(0)}</div>
        </div>
        <div className="stat">
          <div className="k">Types</div>
          <div className="v">{kinds}</div>
        </div>
      </div>

      <div className="panel">
        <h2>Add filament</h2>
        <p className="sub">Brand and type are free text; the list is only suggestions.</p>
        <form action={addFilament} className="filament-form">
          <div className="field">
            <label htmlFor="brand">Brand</label>
            <input id="brand" name="brand" type="text" placeholder="e.g. Sunlu" />
          </div>
          <div className="field">
            <label htmlFor="type">Type</label>
            <input id="type" name="type" type="text" list="filament-types" placeholder="e.g. PLA" />
          </div>
          <div className="field">
            <label htmlFor="color">Colour</label>
            <input id="color" name="color" type="color" defaultValue="#c1121f" />
          </div>
          <div className="field">
            <label htmlFor="quantity">Quantity</label>
            <input id="quantity" name="quantity" type="number" inputMode="numeric" min="0" step="1" defaultValue="1" />
          </div>
          <div className="field">
            <label htmlFor="price">Price</label>
            <input id="price" name="price" type="number" inputMode="decimal" min="0" step="0.01" placeholder="0" />
          </div>
          <button className="btn primary" type="submit">Add</button>
        </form>
        <datalist id="filament-types">
          {TYPES.map((t) => (
            <option key={t} value={t} />
          ))}
        </datalist>
      </div>

      <div className="panel">
        <h2>Stock</h2>
        <p className="sub">Edit any row and save it, or remove it from stock.</p>
        {filaments.length === 0 ? (
          <p className="empty">No filament recorded yet.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Colour</th>
                  <th>Brand</th>
                  <th>Type</th>
                  <th className="num">Qty</th>
                  <th className="num">Price</th>
                  <th className="num">Value</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {filaments.map((f) => (
                  <tr key={f.id}>
                    <td colSpan={7} style={{ padding: 0 }}>
                      <form action={updateFilament} className="filament-row">
                        <input type="hidden" name="id" value={f.id} />
                        <span className="swatch-wrap">
                          <span className="swatch" style={{ background: f.color }} />
                          <input type="color" name="color" defaultValue={f.color} />
                        </span>
                        <input type="text" name="brand" defaultValue={f.brand} placeholder="Brand" />
                        <input type="text" name="type" defaultValue={f.type} list="filament-types" placeholder="Type" />
                        <input className="qty" type="number" inputMode="numeric" min="0" step="1" name="quantity" defaultValue={f.quantity} />
                        <input className="qty" type="number" inputMode="decimal" min="0" step="0.01" name="price" defaultValue={Number(f.price).toFixed(2)} />
                        <span className="row-value">
                          R{(f.quantity * Number(f.price)).toFixed(0)}
                        </span>
                        <button className="btn small" type="submit">Save</button>
                        <button className="btn small danger" type="submit" formAction={deleteFilament}>
                          Delete
                        </button>
                      </form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
