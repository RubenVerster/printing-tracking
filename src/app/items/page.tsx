import {
  addItem,
  addSubItem,
  deleteSubItem,
  resetTargets,
  saveTargets,
  setArchived,
  updateItem,
} from "../actions";
import { getAllItems, getMarkets, getTargetsByItem } from "@/lib/data";

export const dynamic = "force-dynamic";

export default async function ItemsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const params = await searchParams;
  const [items, markets, targets] = await Promise.all([
    getAllItems(),
    getMarkets(),
    getTargetsByItem(),
  ]);
  const active = items.filter((i) => !i.archived && i.parent_id === null);
  const archived = items.filter((i) => i.archived && i.parent_id === null);
  const subItems = items.filter((i) => i.parent_id !== null);
  const childrenOf = (parentId: number) =>
    subItems.filter((i) => i.parent_id === parentId);

  return (
    <>
      <div className="panel">
        <h2>Add an item</h2>
        <p className="sub">
          New items appear on the weekly log straight away. Leave the necessary
          quantity blank and it defaults to half the submitted quantity, then
          splits evenly across the {markets.length} markets.
        </p>
        {params.error === "description" ? (
          <div className="flash error">A description is required.</div>
        ) : null}
        <form action={addItem} className="grid-form">
          <div className="field">
            <label htmlFor="description">Description *</label>
            <input id="description" name="description" type="text" required />
          </div>
          <div className="field">
            <label htmlFor="price">Price</label>
            <input id="price" name="price" type="number" min="0" step="1" />
          </div>
          <div className="field">
            <label htmlFor="printQty">Submitted qty</label>
            <input id="printQty" name="printQty" type="number" min="0" step="1" />
          </div>
          <div className="field">
            <label htmlFor="necessaryQty">Necessary qty</label>
            <input
              id="necessaryQty"
              name="necessaryQty"
              type="number"
              min="0"
              step="1"
              placeholder="half"
            />
          </div>
          <button className="btn primary" type="submit">
            Add item
          </button>
        </form>
      </div>

      <div className="panel">
        <h2>Items</h2>
        <p className="sub">
          Changing an item&apos;s necessary quantity re-splits it evenly across
          the markets.
        </p>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Description</th>
                <th>Price</th>
                <th>Submitted</th>
                <th>Necessary</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {active.map((item) => (
                <tr key={item.id}>
                  <td colSpan={5} style={{ padding: 0 }}>
                    <form action={updateItem} className="grid-form" style={{ padding: 10 }}>
                      <input type="hidden" name="id" value={item.id} />
                      <input
                        type="hidden"
                        name="wasNecessaryQty"
                        value={item.necessary_qty}
                      />
                      <input
                        type="text"
                        name="description"
                        defaultValue={item.description}
                        required
                      />
                      <input
                        type="number"
                        name="price"
                        min="0"
                        step="1"
                        defaultValue={Number(item.price).toFixed(0)}
                      />
                      <input
                        type="number"
                        name="printQty"
                        min="0"
                        step="1"
                        defaultValue={item.print_qty}
                      />
                      <input
                        type="number"
                        name="necessaryQty"
                        min="0"
                        step="1"
                        defaultValue={item.necessary_qty}
                      />
                      <button className="btn small" type="submit">
                        Save
                      </button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {active.length === 0 ? <p className="empty">No active items.</p> : null}
      </div>

      <div className="panel" id="sub-items">
        <h2>Sub-items</h2>
        <p className="sub">
          Variants that live inside an item — Mini Muelo under Minis, and so on.
          A category with sub-items is no longer typed into directly on the
          dashboard: its printed and packed figures become the sum of its
          sub-items, counting towards the same market targets.
        </p>
        {params.error === "subitem" ? (
          <div className="flash error">Pick a parent and give the sub-item a name.</div>
        ) : null}
        <form action={addSubItem} className="filament-form">
          <div className="field">
            <label htmlFor="parentId">Belongs to</label>
            <select id="parentId" name="parentId" defaultValue="">
              <option value="" disabled>Choose an item</option>
              {active.map((i) => (
                <option key={i.id} value={i.id}>{i.description}</option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="sub-description">Sub-item</label>
            <input id="sub-description" name="description" type="text" placeholder="e.g. Turtle" required />
          </div>
          <button className="btn primary" type="submit">Add sub-item</button>
        </form>

        {subItems.length === 0 ? (
          <p className="empty">No sub-items yet.</p>
        ) : (
          active
            .filter((parent) => childrenOf(parent.id).length > 0)
            .map((parent) => (
              <div className="sub-group" key={parent.id}>
                <h3>{parent.description}</h3>
                <ul className="sub-list">
                  {childrenOf(parent.id).map((child) => (
                    <li key={child.id}>
                      <span>{child.description}</span>
                      <form action={deleteSubItem}>
                        <input type="hidden" name="id" value={child.id} />
                        <button className="btn small danger" type="submit">Remove</button>
                      </form>
                    </li>
                  ))}
                </ul>
              </div>
            ))
        )}
      </div>

      <div className="panel" id="allocation">
        <h2>Market allocation</h2>
        <p className="sub">
          How each item&apos;s necessary quantity is divided between the markets.
          The three should add up to the necessary quantity — a mismatch is
          flagged, not blocked, in case you want it that way.
        </p>
        {active.map((item) => {
          const itemTargets = targets.get(item.id);
          const allocated = markets.reduce(
            (total, m) => total + (itemTargets?.get(m.id) ?? 0),
            0
          );
          const balanced = allocated === item.necessary_qty;
          return (
            <form
              action={saveTargets}
              key={item.id}
              className="alloc-row"
            >
              <input type="hidden" name="itemId" value={item.id} />
              <span className="item-name alloc-name">{item.description}</span>
              {markets.map((m) => (
                <span className="field alloc-field" key={m.id}>
                  <input type="hidden" name="marketId" value={m.id} />
                  <label htmlFor={`t-${item.id}-${m.id}`}>{m.name}</label>
                  <input
                    id={`t-${item.id}-${m.id}`}
                    type="number"
                    name={`target-${m.id}`}
                    min="0"
                    step="1"
                    defaultValue={itemTargets?.get(m.id) ?? 0}
                  />
                </span>
              ))}
              <span className={`alloc-sum${balanced ? "" : " off"}`}>
                {allocated} / {item.necessary_qty}
                {balanced ? " ✓" : " ✕"}
              </span>
              <button className="btn small" type="submit">
                Save
              </button>
              <button
                className="btn small"
                type="submit"
                formAction={resetTargets}
              >
                Even split
              </button>
            </form>
          );
        })}
      </div>

      <div className="panel">
        <h2>Archive</h2>
        <p className="sub">
          Archiving hides an item from the weekly log but keeps its history.
        </p>
        <div className="table-wrap">
          <table>
            <tbody>
              {active.map((item) => (
                <tr key={item.id}>
                  <td className="item-name">{item.description}</td>
                  <td className="num">
                    <form action={setArchived}>
                      <input type="hidden" name="id" value={item.id} />
                      <input type="hidden" name="archived" value="true" />
                      <button className="btn small" type="submit">
                        Archive
                      </button>
                    </form>
                  </td>
                </tr>
              ))}
              {archived.map((item) => (
                <tr key={item.id}>
                  <td className="muted">
                    {item.description} <span className="pill">archived</span>
                  </td>
                  <td className="num">
                    <form action={setArchived}>
                      <input type="hidden" name="id" value={item.id} />
                      <input type="hidden" name="archived" value="false" />
                      <button className="btn small" type="submit">
                        Restore
                      </button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
