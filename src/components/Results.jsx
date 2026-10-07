import React, { useState } from "react";
import { BANNER_BY_ID, TICKETS, itemName } from "../engine/banners.js";
import { positionLabel } from "../engine/track.js";
import { groupSteps, planRuns, ticketText } from "../derive.js";

// "Dark Catseye ×3: 13A · 56B · 105AR" — green = this path gets it, struck =
// this path passes it without taking it.
export function Appearances({ appearances, banners, chances, path, onJump }) {
  if (!appearances.length) {
    return <p className="muted">None of the items you picked can be reached with your tickets on these banners.</p>;
  }
  const got = new Set(path ? path.steps.filter((s) => s.hit).map((s) => `${s.m}.${s.banner}.${+s.rerolled}`) : []);
  const end = path ? path.end.m : -1;
  const groups = new Map();
  for (const a of appearances) {
    if (!groups.has(a.item)) groups.set(a.item, []);
    groups.get(a.item).push(a);
  }
  const ordered = [...groups].sort((a, b) => (chances.get(a[0]) ?? 100) - (chances.get(b[0]) ?? 100));
  return (
    <div className="appearances">
      {ordered.map(([item, list]) => (
        <AppearanceRow key={item} item={item} list={list} banners={banners} got={got} end={end} onJump={onJump} />
      ))}
    </div>
  );
}

// Long lists (deep ticket counts) show the first ones and a "+N more" button.
const SHOW_FIRST = 60;

function AppearanceRow({ item, list, banners, got, end, onJump }) {
  const [all, setAll] = useState(false);
  const shown = all ? list : list.slice(0, SHOW_FIRST);
  return (
    <div className="app-row">
      <span className="app-item">{itemName(item)} <span className="muted">×{list.length}</span></span>
      <span className="app-chips">
        {shown.map((a) => {
          const banner = banners[a.j];
          const key = `${a.m}.${banner.id}.${+a.rerolled}`;
          const status = got.has(key) ? "got" : a.m < end ? "missed" : "";
          const label = positionLabel(a.m, a.rerolled);
          return (
            <button
              key={key}
              className={`pos-chip ${status}`}
              onClick={() => onJump(a.m)}
              title={`${label} on ${banner.name}${a.rerolled ? " (only if your previous item was the same — dupe reroll)" : ""}. ` +
                `${status === "got" ? "This path gets it." : status === "missed" ? "This path skips it." : ""}`}
            >
              {label}
              {banners.length > 1 && <span className="chip-banner">{banner.name}</span>}
            </button>
          );
        })}
        {list.length > SHOW_FIRST && (
          <button className="small link" onClick={() => setAll((v) => !v)}>
            {all ? "show fewer" : `+${list.length - SHOW_FIRST} more`}
          </button>
        )}
      </span>
    </div>
  );
}

export function PathList({ search, pathIndex, setPathIndex, onFollow, ampuriUrl }) {
  const { status, result, error } = search;
  if (status === "error") return <p className="error">Search failed: {error}</p>;
  if (!result) return <p className="muted">{status === "searching" ? "Searching…" : ""}</p>;
  const { paths, exact, stats } = result;
  const note = status === "searching"
    ? "Quick answer — still looking for better paths…"
    : exact
      ? `Best paths (proven optimal, ${stats.ms} ms).`
      : `Best paths found in ${(stats.ms / 1000).toFixed(1)} s. The search hit its limit, so a better path might exist.`;
  if (!paths.length) return <p className="muted">No path reaches any of your items with these tickets.</p>;
  return (
    <div className="paths">
      <p className={`muted small ${status === "searching" ? "pulse" : ""}`}>{note}</p>
      {paths.map((p, i) => (
        <PathCard
          key={i}
          path={p}
          rank={i + 1}
          selected={i === pathIndex}
          onSelect={() => setPathIndex(i)}
          onFollow={() => onFollow(p)}
          ampuriUrl={ampuriUrl}
        />
      ))}
    </div>
  );
}

// The short plan at the top of a path: how many draws on each banner, in
// order — "10× Normal+ → 1× Lucky Ticket → 9× Normal+ → 1× Catseye 🎯".
const SHOW_RUNS = 12;

function Plan({ path }) {
  const runs = planRuns(path.steps);
  const [all, setAll] = useState(false);
  const shown = all ? runs : runs.slice(0, SHOW_RUNS);
  const range = (r) => (r.count > 1 ? `${r.from.pos}–${r.to.pos}` : r.from.pos);
  return (
    <div className="plan">
      <span className="plan-label">Plan <span className="plan-hint">— roll in this order</span></span>
      {shown.map((r, i) => (
        <React.Fragment key={i}>
          {i > 0 && <span className="plan-arrow" aria-hidden="true">→</span>}
          <span
            className={`run t-${r.ticket}`}
            title={`${r.count} draw${r.count === 1 ? "" : "s"} on ${BANNER_BY_ID[r.banner].name} with ${TICKETS[r.ticket].label.toLowerCase()}, ${range(r)}`}
          >
            <b>{r.count}×</b> {BANNER_BY_ID[r.banner].name}
            {r.hits.length > 0 && (
              <span className="run-hits">
                🎯 {r.hits.length <= 2
                  ? r.hits.map((h) => `${itemName(h.item)} (${h.pos})`).join(", ")
                  : `${r.hits.length} items`}
              </span>
            )}
          </span>
        </React.Fragment>
      ))}
      {runs.length > SHOW_RUNS && (
        <button
          className="small link"
          onClick={(e) => {
            e.stopPropagation();
            setAll((v) => !v);
          }}
        >
          {all ? "show fewer" : `+${runs.length - SHOW_RUNS} more`}
        </button>
      )}
    </div>
  );
}

function PathCard({ path, rank, selected, onSelect, onFollow, ampuriUrl }) {
  const hits = path.steps.filter((s) => s.hit);
  // Steps render only when opened, and long hit lists start collapsed: long
  // paths × 10 cards is a lot of DOM.
  const [open, setOpen] = useState(false);
  const [allHits, setAllHits] = useState(false);
  const shownHits = allHits ? hits : hits.slice(0, SHOW_FIRST);
  return (
    <div className={`path ${selected ? "selected" : ""}`} onClick={onSelect}>
      <div className="path-head">
        <span className="rank">#{rank}</span>
        <span className="got">🎯 {path.appearances} appearance{path.appearances === 1 ? "" : "s"}</span>
        <span className="cost">{ticketText(path.tickets)}</span>
        {!path.verified && <span className="unverified">⚠ failed its re-check — don't follow</span>}
        <span className="spacer" />
        {selected ? <span className="on-table">shown on the table ↓</span> : <button className="small" onClick={onSelect}>Show on table</button>}
        <button
          className="primary small"
          onClick={(e) => {
            e.stopPropagation();
            onFollow();
          }}
        >
          I followed this path
        </button>
      </div>
      <Plan path={path} />
      <div className="path-hits">
        {shownHits.map((s) => (
          <span key={`${s.m}.${s.banner}`} className="hit">
            <b>{s.pos}</b> {itemName(s.item)} <span className="muted small">({BANNER_BY_ID[s.banner].name})</span>
          </span>
        ))}
        {hits.length > SHOW_FIRST && (
          <button
            className="small link"
            onClick={(e) => {
              e.stopPropagation();
              setAllHits((v) => !v);
            }}
          >
            {allHits ? "show fewer" : `+${hits.length - SHOW_FIRST} more`}
          </button>
        )}
      </div>
      <details onClick={(e) => e.stopPropagation()} onToggle={(e) => setOpen(e.currentTarget.open)}>
        <summary>
          {path.steps.length} roll{path.steps.length === 1 ? "" : "s"}, then your next roll is at {path.end.pos}
          {" · "}
          <a href={ampuriUrl(path)} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}>
            check on ampuri's tracker ↗
          </a>
        </summary>
        {open && <ol className="steps">
          {groupSteps(path.steps).map((g) => (
            <li key={g.from.m + "." + g.from.banner} className={g.from.hit ? "hit" : ""}>
              <b>{g.count > 1 ? `${g.from.pos}–${g.to.pos}` : g.from.pos}</b> · {BANNER_BY_ID[g.banner].name}
              {g.count > 1 ? ` ×${g.count}` : ` → ${itemName(g.from.item)}`}
              {g.from.rerolled && <span className="muted small"> (dupe reroll, jumps to {positionLabel(g.from.next)})</span>}
              {g.from.hit && " 🎯"}
            </li>
          ))}
        </ol>}
      </details>
    </div>
  );
}
