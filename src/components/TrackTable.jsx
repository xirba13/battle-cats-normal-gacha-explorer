import React, { forwardRef, memo, useCallback, useEffect, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState } from "react";
import { ITEMS, TICKETS, itemName } from "../engine/banners.js";
import { cellReach, positionLabel } from "../engine/track.js";
import { DEPTHS } from "../urlstate.js";

// godfat/ampuri-style tracks: A on the left, B on the right, B half a roll
// lower. Built as ONE table of half-rows: every position spans two half-rows,
// A positions start on even half-rows and B positions on odd ones, so the two
// tracks interleave (1A, 1B, 2A, 2B…) and always stay aligned.
//
// Every half-row is exactly HALF_ROW px tall (styles.css reads it from the
// --half-row variable), so the table can be thousands of rows deep: only the
// half-rows near the visible part are drawn and spacer rows stand in for the
// rest. Columns have fixed widths so they don't jump while scrolling.
const HALF_ROW = 19;
const BUFFER = 40; // half-rows drawn above and below the visible part
const POS_WIDTH = 64;

const colWidth = (banner) => {
  const longest = Math.max(...banner.tiers.flatMap((t) => t.items.map((id) => ITEMS[id].name.length)));
  return Math.round(Math.min(210, Math.max(100, longest * 7.4 + 28)));
};

const TrackTable = forwardRef(function TrackTable({ derived, targets, path, onRollTo, depth, setDepth }, ref) {
  const { track, reach, banners, usable, rows, autoRows, T } = derived;
  const n = banners.length;
  const total = 2 * rows; // half-rows that start a position
  const wrapRef = useRef(null);
  const headRef = useRef(null);
  const [win, setWin] = useState([0, Math.min(total, 120)]);

  // Per cell: whether its dupe result can happen, where that jumps, and
  // whether your tickets reach it. Computed only for rows actually drawn.
  const rowView = useMemo(() => {
    const cache = new Map();
    return (m) => {
      let view = cache.get(m);
      if (!view) {
        view = track.cells[m].map((cell, j) => {
          const r = cellReach(track, reach, m, j);
          let jump = null;
          if (cell.reroll && Number.isFinite(r.rerolled)) {
            const m2 = m + 2 + cell.reroll.extra;
            const dest = track.cells[m2]?.[j];
            jump = positionLabel(m2, Boolean(dest?.reroll) && dest.item === cell.reroll.item);
          }
          return { cell, jump, inReach: usable[j] && Math.min(r.canonical, r.rerolled) <= T - 1 };
        });
        cache.set(m, view);
      }
      return view;
    };
  }, [track, reach, usable, T]);

  // Which half-rows to draw: the visible ones plus a buffer, starting on an A
  // position and ending after a B position so row spans stay intact.
  const updateWindow = useCallback(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const top = wrap.scrollTop - (headRef.current?.offsetHeight ?? 0);
    let start = Math.max(0, Math.floor(top / HALF_ROW) - BUFFER);
    start -= start % 2;
    let end = Math.ceil((top + wrap.clientHeight) / HALF_ROW) + BUFFER;
    end = Math.min(total, Math.max(start + 2, end + (end % 2)));
    setWin((w) => (w[0] === start && w[1] === end ? w : [start, end]));
  }, [total]);
  useLayoutEffect(updateWindow, [updateWindow]);
  useEffect(() => {
    // Scroll events already fire at most once per frame; setWin skips no-op
    // updates. (No requestAnimationFrame: it pauses in background tabs.)
    const wrap = wrapRef.current;
    wrap.addEventListener("scroll", updateWindow, { passive: true });
    window.addEventListener("resize", updateWindow);
    return () => {
      wrap.removeEventListener("scroll", updateWindow);
      window.removeEventListener("resize", updateWindow);
    };
  }, [updateWindow]);

  useImperativeHandle(ref, () => ({
    // Scroll the table so seed state m sits in the middle, and bring the table on screen.
    scrollToState(m) {
      const wrap = wrapRef.current;
      if (!wrap) return;
      const head = headRef.current?.offsetHeight ?? 0;
      wrap.scrollTop = Math.max(0, head + m * HALF_ROW - (wrap.clientHeight - head) / 2);
      updateWindow(); // don't wait for the scroll event
      wrap.closest(".table-panel")?.scrollIntoView({ block: "start", behavior: "smooth" });
    },
  }), [updateWindow]);

  // Selected path -> per position, which cells it rolls ("|j|" or "|jR|").
  const onPath = useMemo(() => {
    const map = new Map();
    if (path) {
      for (const s of path.steps) {
        const j = banners.findIndex((b) => b.id === s.banner);
        map.set(s.m, `${map.get(s.m) || ""}|${j}${s.rerolled ? "R" : ""}|`);
      }
    }
    return map;
  }, [path, banners]);
  const endM = path ? path.end.m : -1;
  const targetsKey = [...targets].join(",");

  const start = Math.min(win[0], Math.max(0, total - 2));
  const end = Math.min(win[1], total);
  const body = [];
  if (start > 0) body.push(<tr key="top" className="filler"><td colSpan={2 * n + 2} style={{ height: start * HALF_ROW }} /></tr>);
  for (let m = start; m < end; m++) {
    body.push(
      <TrackRow
        key={m}
        m={m}
        cells={rowView(m)}
        marks={onPath.get(m) || ""}
        isNext={m === endM}
        targets={targets}
        targetsKey={targetsKey}
        banners={banners}
        onRollTo={onRollTo}
        spacerB={m === start ? n + 1 : 0}
      />
    );
  }
  // One half-row closes track A under the last drawn B position.
  body.push(<tr key="close"><td className="spacer" colSpan={n + 1} /></tr>);
  if (end < total) body.push(<tr key="bottom" className="filler"><td colSpan={2 * n + 2} style={{ height: (total - end) * HALF_ROW }} /></tr>);

  const widths = banners.map(colWidth);
  const tableWidth = 2 * (POS_WIDTH + widths.reduce((a, b) => a + b, 0));

  return (
    <section className="panel table-panel">
      <div className="table-head">
        <h3><span className="step">4</span> Track table</h3>
        <label className="depth">
          Rows
          <select value={depth} onChange={(e) => setDepth(e.target.value === "auto" ? "auto" : Number(e.target.value))}>
            {DEPTHS.map((d) => (
              <option key={d} value={d}>{d === "auto" ? `All my tickets (${autoRows.toLocaleString()})` : d}</option>
            ))}
          </select>
        </label>
        <span className="legend small">
          <span className="lg target">item you want</span>
          <span className="lg on-path">selected path</span>
          <span className="lg next">next roll after the path</span>
          <span className="lg dim">out of reach</span>
        </span>
      </div>
      <p className="muted small">
        Click an item name to say "I rolled up to here" (your seed and last item update; Back undoes it).
        A <b>dupe</b> line is what that cell gives instead when your previous item was the same, and where you jump.
      </p>
      <div className="table-wrap" ref={wrapRef}>
        <table className="track" style={{ width: tableWidth, "--half-row": `${HALF_ROW}px` }}>
          <colgroup>
            {[0, 1].map((side) => (
              <React.Fragment key={side}>
                <col style={{ width: POS_WIDTH }} />
                {banners.map((b, j) => <col key={b.id} style={{ width: widths[j] }} />)}
              </React.Fragment>
            ))}
          </colgroup>
          <thead ref={headRef}>
            <tr>
              {["A", "B"].map((side) => (
                <React.Fragment key={side}>
                  <th className="pos" title={`Track ${side}`}>{side}</th>
                  {banners.map((b) => (
                    <th key={b.id} title={`${b.name} — uses ${TICKETS[b.ticket].label.toLowerCase()}`}>{b.name}</th>
                  ))}
                </React.Fragment>
              ))}
            </tr>
          </thead>
          <tbody>{body}</tbody>
        </table>
      </div>
    </section>
  );
});

export default TrackTable;

const TrackRow = memo(function TrackRow({ m, cells, marks, isNext, targets, banners, onRollTo, spacerB }) {
  return (
    <tr>
      <th className={`pos ${isNext ? "next" : ""}`} rowSpan={2}>{positionLabel(m)}</th>
      {cells.map((v, j) => (
        <Cell
          key={j}
          m={m}
          j={j}
          v={v}
          banner={banners[j]}
          canonOnPath={marks.includes(`|${j}|`)}
          dupeOnPath={marks.includes(`|${j}R|`)}
          targets={targets}
          onRollTo={onRollTo}
        />
      ))}
      {spacerB > 0 && <td className="spacer" colSpan={spacerB} />}
    </tr>
  );
}, (a, b) =>
  a.cells === b.cells && a.marks === b.marks && a.isNext === b.isNext && a.targetsKey === b.targetsKey &&
  a.onRollTo === b.onRollTo && a.spacerB === b.spacerB);

function Cell({ m, j, v, banner, canonOnPath, dupeOnPath, targets, onRollTo }) {
  const { cell, jump, inReach } = v;
  const pos = positionLabel(m);
  const upgrade = ITEMS[cell.item]?.kind === "upgrade";
  const cls = ["cell", `r-${cell.rarity}`, upgrade ? "upgrade" : "", inReach ? "" : "dim", canonOnPath ? "on-path" : ""];
  const title = `${pos} ${banner.name}: ${itemName(cell.item)}` +
    (jump ? ` — if your previous item was ${itemName(cell.item)}, you get ${itemName(cell.reroll.item)} instead and jump to ${jump}` : "");
  return (
    <td className={cls.join(" ")} rowSpan={2} title={title}>
      <button className={`item ${targets.has(cell.item) ? "target" : ""}`} onClick={() => onRollTo(m, j, false)}>
        {itemName(cell.item)}
      </button>
      {jump && (
        <div className={`dupe ${dupeOnPath ? "on-path" : ""}`}>
          <span className="dupe-tag">dupe</span>
          <button className={`item ${targets.has(cell.reroll.item) ? "target" : ""}`} onClick={() => onRollTo(m, j, true)}>
            {itemName(cell.reroll.item)}
          </button>
          <span className="jump">→ {jump}</span>
        </div>
      )}
    </td>
  );
}
