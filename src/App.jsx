import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ITEMS, itemName } from "./engine/banners.js";
import { positionLabel } from "./engine/track.js";
import { buildHash, parseHash } from "./urlstate.js";
import { baseBannerId, deriveTracker, findAppearances, itemChances, ticketText } from "./derive.js";
import { useSearch } from "./useSearch.js";
import Controls from "./components/Controls.jsx";
import { BannerPicker, ItemPicker } from "./components/Pickers.jsx";
import { Appearances, PathList } from "./components/Results.jsx";
import TrackTable from "./components/TrackTable.jsx";
import Instructions from "./components/Instructions.jsx";

const TABS = [
  { id: "tracker", label: "Tracker" },
  { id: "help", label: "How it works" },
];
const AMPURI = "https://ampuri.github.io/bc-normal-seed-tracking/";

export default function App() {
  // The URL hash is the save file. Seed-changing actions push a history entry
  // so the browser's Back button undoes them; everything else replaces it.
  const [st, setSt] = useState(() => parseHash(window.location.hash));
  const pushNext = useRef(false);
  const [notice, setNotice] = useState(null);
  const [showDisclaimer, setShowDisclaimer] = useState(true);

  useEffect(() => {
    const hash = buildHash(st);
    if (hash === window.location.hash) return;
    if (pushNext.current) window.history.pushState(null, "", hash);
    else window.history.replaceState(null, "", hash);
    pushNext.current = false;
  }, [st]);

  useEffect(() => {
    const reload = () => setSt(parseHash(window.location.hash));
    window.addEventListener("popstate", reload);
    window.addEventListener("hashchange", reload);
    return () => {
      window.removeEventListener("popstate", reload);
      window.removeEventListener("hashchange", reload);
    };
  }, []);

  const update = useCallback((patch, { push = false } = {}) => {
    if (push) pushNext.current = true;
    setSt((s) => ({ ...s, ...(typeof patch === "function" ? patch(s) : patch) }));
  }, []);

  return (
    <div className="app">
      <header className="topbar">
        <div className="topbar-row">
          <h1>🍀 Battle Cats Normal Gacha Explorer</h1>
          <nav className="tabs">
            {TABS.map((t) => (
              <button key={t.id} className={st.tab === t.id ? "tab active" : "tab"} onClick={() => update({ tab: t.id })}>
                {t.label}
              </button>
            ))}
          </nav>
        </div>
        <Controls st={st} update={update} />
        {showDisclaimer && (
          <div className="disclaimer" onClick={() => setShowDisclaimer(false)}>
            ⚠️ <b>Experimental.</b> Check a path on <a href={AMPURI} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}>ampuri's tracker</a> before spending tickets. <i>(click to hide)</i>
          </div>
        )}
      </header>

      {notice && (
        <div className="notice-bar" onClick={() => setNotice(null)}>
          ✅ {notice} <i className="small">(click to dismiss)</i>
        </div>
      )}

      <main className="content">
        {st.tab === "help" ? <Instructions /> : <Tracker st={st} update={update} setNotice={setNotice} />}
      </main>
    </div>
  );
}

// The latest `value`, but only once it has stopped changing for `ms`.
function useDebounced(value, ms) {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setSettled(value), ms);
    return () => clearTimeout(id);
  }, [value, ms]);
  return settled;
}

function Tracker({ st, update, setNotice }) {
  // Typing a seed or ticket count rebuilds the whole track (37,000 rows at
  // 9,999 of every ticket), so wait until the typing pauses.
  const seed = useDebounced(st.seed, 150);
  const tickets = useDebounced(st.tickets, 150);
  // Only what deriveTracker reads (not items/tab), so picking items doesn't rebuild the track.
  const derived = useMemo(
    () => (seed ? deriveTracker({ ...st, seed, tickets }) : null),
    [seed, st.lastItem, st.banners, tickets, st.depth]
  );
  const targets = useMemo(() => new Set(st.items), [st.items]);
  const appearances = useMemo(() => (derived ? findAppearances(derived, targets) : []), [derived, targets]);
  const chances = useMemo(() => (derived ? itemChances(derived.banners) : new Map()), [derived]);

  const searchInput = useMemo(() => {
    if (!derived || !targets.size) return null;
    const bannerIds = derived.banners.filter((_, j) => derived.usable[j]).map((b) => b.id);
    if (!bannerIds.length) return null;
    return { seed: Number(seed), lastItem: st.lastItem, bannerIds, tickets, targets: st.items, baseBannerId: baseBannerId(st) };
  }, [derived, targets, seed, st.lastItem, tickets, st.items, st.banners, st.base]);
  const search = useSearch(searchInput);
  const [pathIndex, setPathIndex] = useState(0);
  useEffect(() => setPathIndex(0), [search.key]);
  const path = search.result?.paths[pathIndex] ?? null;

  // Stable callbacks (memoized table rows) that read the latest track.
  const latest = useRef(derived);
  latest.current = derived;

  const rollTo = useCallback((m, j, rerolled) => {
    const { track } = latest.current;
    const cell = track.cells[m][j];
    const next = m + 2 + (rerolled ? cell.reroll.extra : 0);
    const item = rerolled ? cell.reroll.item : cell.item;
    update({ seed: String(track.seeds[next]), lastItem: item }, { push: true });
    setNotice(
      `Moved past ${positionLabel(m, rerolled)} (${itemName(item)}): your seed is now ${track.seeds[next]}. ` +
        "Tickets weren't changed — adjust them if you spent any. Back undoes this."
    );
  }, [update, setNotice]);

  const followPath = (p) => {
    const ok = window.confirm(
      `Only do this after rolling the path in-game.\n\nYour seed becomes the one after ${p.steps.at(-1).pos}, ` +
        `your last item becomes ${itemName(p.end.lastItem)}, and ${ticketText(p.tickets)} are subtracted.`
    );
    if (!ok) return;
    update((s) => ({
      seed: String(p.end.seed),
      lastItem: p.end.lastItem,
      tickets: {
        normal: Math.max(0, s.tickets.normal - p.tickets.normal),
        lucky: Math.max(0, s.tickets.lucky - p.tickets.lucky),
        luckyG: Math.max(0, s.tickets.luckyG - p.tickets.luckyG),
      },
    }), { push: true });
    setNotice(`Path followed: your seed is now ${p.end.seed} (was ${p.end.pos}) and your last item is ${itemName(p.end.lastItem)}. Back undoes this.`);
  };

  const setDepth = (depth) => update({ depth });
  const tableRef = useRef(null);
  const jumpTo = (m) => {
    // Appearances are always within your tickets' reach, which "auto" covers.
    if (derived && (m >> 1) + 1 > derived.rows) setDepth("auto");
    setTimeout(() => tableRef.current?.scrollToState(m), 50);
  };

  const ampuriUrl = (p) => {
    const q = new URLSearchParams({
      seed: st.seed,
      banners: derived.banners.map((b) => b.id).join(","),
      rolls: String([100, 200, 500, 999].find((r) => r >= (p.end.m >> 1) + 2) ?? 999),
    });
    if (st.lastItem) q.set("lastCat", ITEMS[st.lastItem].name);
    return `${AMPURI}?${q}`;
  };

  return (
    <>
      {!st.seed && (
        <p className="notice">
          Enter your <b>normal-gacha seed</b> above to start. Don't know it? Use{" "}
          <a href={`${AMPURI}#/finder`} target="_blank" rel="noreferrer">ampuri's seed finder</a>.
        </p>
      )}
      <BannerPicker st={st} update={update} />
      {derived && <ItemPicker st={st} update={update} banners={derived.banners} />}
      {derived && st.items.length > 0 && derived.banners.length > 0 && (
        <section className="panel">
          <h3><span className="step">3</span> Results</h3>
          {derived.T === 0 ? (
            <p className="muted">Enter how many tickets you have for these banners.</p>
          ) : (
            <>
              <h4>Where your items are <span className="muted small">— within reach of your {derived.T} ticket{derived.T === 1 ? "" : "s"}</span></h4>
              <Appearances appearances={appearances} banners={derived.banners} chances={chances} path={path} onJump={jumpTo} />
              <h4>Best paths</h4>
              <PathList search={search} pathIndex={pathIndex} setPathIndex={setPathIndex} onFollow={followPath} ampuriUrl={ampuriUrl} />
            </>
          )}
        </section>
      )}
      {derived && derived.banners.length > 0 && (
        <TrackTable ref={tableRef} derived={derived} targets={targets} path={path} onRollTo={rollTo} depth={st.depth} setDepth={setDepth} />
      )}
    </>
  );
}
