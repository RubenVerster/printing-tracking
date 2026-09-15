import Link from "next/link";
import { saveProgress } from "./actions";
import LiveRefresh from "./live-refresh";
import { getBoard, getLastUpdated, getMarketBoxes, getMarkets } from "@/lib/data";

export const dynamic = "force-dynamic";

const pct = (value: number, target: number) =>
  target > 0 ? Math.round((value / target) * 100) : 0;

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string }>;
}) {
  const params = await searchParams;
  const [markets, rows, boxes, lastUpdated] = await Promise.all([
    getMarkets(),
    getBoard(),
    getMarketBoxes(),
    getLastUpdated(),
  ]);

  const sum = (pick: (r: (typeof rows)[number]) => number) =>
    rows.reduce((total, r) => total + pick(r), 0);
  const across = (m: Map<number, number>) =>
    [...m.values()].reduce((a, b) => a + b, 0);

  const needed = sum((r) => r.necessary_qty);
  const printed = sum((r) => r.printed);
  const packed = sum((r) => across(r.packed));

  return (
    <>
      <LiveRefresh formId="board-form" />

      {params.saved ? <div className="flash">Saved.</div> : null}

      <div className="headline">
        <div className="headline-main">
          <div className="k">Packed across all three markets</div>
          <div className="headline-v">
            {packed}
            <span className="of"> / {needed}</span>
          </div>
          <div className={`bar big${packed >= needed && needed > 0 ? " over" : ""}`}>
            <span style={{ width: `${Math.min(100, pct(packed, needed))}%` }} />
          </div>
          <div className="of">
            {pct(packed, needed)}% packed · {Math.max(0, needed - packed)} still
            to go
          </div>
        </div>
        <div className="headline-side">
          <div className="k">Printed</div>
          <div className="headline-v small">
            {printed}
            <span className="of"> / {needed}</span>
          </div>
          <div className="bar">
            <span style={{ width: `${Math.min(100, pct(printed, needed))}%` }} />
          </div>
          <div className="of">
            {pct(printed, needed)}% · {Math.max(0, needed - printed)} still to
            print
          </div>
        </div>
      </div>

      <div className="stats">
        {boxes.map((box) => {
          const full = box.target > 0 && box.packed >= box.target;
          return (
            <div className={`stat box${full ? " full" : ""}`} key={box.id}>
              <div className="k">{box.name} box</div>
              <div className="v">
                {box.packed}
                <span className="of"> / {box.target}</span>
              </div>
              <div className={`bar${full ? " over" : ""}`} style={{ marginTop: 8 }}>
                <span style={{ width: `${Math.min(100, pct(box.packed, box.target))}%` }} />
              </div>
              <div className="of">
                {full ? "box complete" : `${Math.max(0, box.target - box.packed)} to go`}
              </div>
            </div>
          );
        })}
      </div>

      <form action={saveProgress} id="board-form">
        {markets.map((m) => (
          <input key={m.id} type="hidden" name="marketId" value={m.id} />
        ))}

        <div className="panel">
          <h2>Fulfillment</h2>
          <p className="sub">
            Running totals — type what has been done in total, not what was added
            today. Printing is one bulk number per item; packing is what is
            physically in each market&apos;s box.
          </p>

          {rows.length === 0 ? (
            <p className="empty">
              No items yet — <Link href="/items">add some items</Link> to start.
            </p>
          ) : (
            <>
              <div className="table-wrap">
                <table className="log-table">
                  <thead>
                    <tr>
                      <th>Item</th>
                      <th className="num">Submitted</th>
                      <th className="num">Necessary</th>
                      <th className="num">Printed</th>
                      {markets.map((m) => (
                        <th key={m.id} className="num">
                          {m.name}
                        </th>
                      ))}
                      <th>Notes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row) => {
                      const target = row.necessary_qty || 0;
                      const printedDone = target > 0 && row.printed >= target;
                      return (
                        <tr key={row.id}>
                          <td className="name-cell">
                            <input type="hidden" name="itemId" value={row.id} />
                            {/* Baselines, so the save can tell an untouched
                                field from an edited one. */}
                            <input
                              type="hidden"
                              name={`was-printed-${row.id}`}
                              value={row.printed}
                            />
                            <input
                              type="hidden"
                              name={`was-notes-${row.id}`}
                              value={row.notes}
                            />
                            <span className="item-name">{row.description}</span>
                          </td>
                          <td className="num muted" data-label="Submitted">
                            {row.print_qty || "—"}
                          </td>
                          <td className="num target" data-label="Necessary">
                            {target || "—"}
                          </td>
                          <td className="num" data-label="Printed">
                            <input
                              className="qty"
                              type="number"
                              inputMode="numeric"
                              min="0"
                              step="1"
                              name={`printed-${row.id}`}
                              defaultValue={row.printed || ""}
                              placeholder="0"
                            />
                            <small className={printedDone ? "met" : "muted"}>
                              of {target}
                            </small>
                          </td>
                          {markets.map((m) => {
                            const mTarget = row.targets.get(m.id) ?? 0;
                            const mPacked = row.packed.get(m.id) ?? 0;
                            const met = mTarget > 0 && mPacked >= mTarget;
                            return (
                              <td key={m.id} className="num" data-label={m.name}>
                                <input
                                  type="hidden"
                                  name={`was-packed-${row.id}-${m.id}`}
                                  value={mPacked}
                                />
                                <input
                                  className="qty"
                                  type="number"
                                  inputMode="numeric"
                                  min="0"
                                  step="1"
                                  name={`packed-${row.id}-${m.id}`}
                                  defaultValue={mPacked || ""}
                                  placeholder="0"
                                />
                                <small className={met ? "met" : "muted"}>
                                  of {mTarget}
                                </small>
                              </td>
                            );
                          })}
                          <td data-label="Notes">
                            <input
                              type="text"
                              name={`notes-${row.id}`}
                              defaultValue={row.notes}
                              placeholder="optional"
                            />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div className="actions">
                <button className="btn primary" type="submit">
                  Save
                </button>
                <span className="muted" style={{ fontSize: 13 }}>
                  Only the numbers you change are saved, so two phones can update
                  at the same time.
                </span>
              </div>
            </>
          )}
        </div>
      </form>

      {lastUpdated ? (
        <p className="muted" style={{ fontSize: 13, textAlign: "center" }}>
          Last updated {new Date(lastUpdated).toLocaleString("en-GB", {
            day: "numeric",
            month: "short",
            hour: "2-digit",
            minute: "2-digit",
          })}
        </p>
      ) : null}
    </>
  );
}
