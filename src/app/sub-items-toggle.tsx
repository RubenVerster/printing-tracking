"use client";

import { useState } from "react";

/**
 * Shows or hides an item's sub-item rows.
 *
 * Done in the browser rather than through a URL so that expanding a category
 * never reloads the page — half-typed numbers elsewhere in the form survive.
 */
export default function SubItemsToggle({
  parentId,
  count,
}: {
  parentId: number;
  count: number;
}) {
  const [open, setOpen] = useState(false);

  const toggle = () => {
    const next = !open;
    setOpen(next);
    document
      .querySelectorAll<HTMLElement>(`tr[data-parent="${parentId}"]`)
      .forEach((row) => {
        row.hidden = !next;
      });
  };

  return (
    <button
      type="button"
      className="disclosure"
      onClick={toggle}
      aria-expanded={open}
    >
      <span className="caret">{open ? "▾" : "▸"}</span>
      {count} sub-item{count === 1 ? "" : "s"}
    </button>
  );
}
