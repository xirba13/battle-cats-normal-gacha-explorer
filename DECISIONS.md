# Decisions & Assumptions

Running log of non-obvious decisions, findings and assumptions behind the
Battle Cats Normal Gacha Explorer.

## Why a separate project

Planned first as a tab in Battle Cats Gacha Explorer, then split out: it needs
no server (all deterministic math on a seed), its UI is different (track table,
tickets), and the rare explorer lives on two long-lived branches (`master` local
/ `webapp` deployed) that would both have needed it. As a static site it's one
codebase on one branch that runs the same locally (`pnpm dev`) and hosted
(Vercel). Scaffold, palette, "link is the save file" and the path-search ideas
were taken from the rare explorer. The two may be merged later under one design.

## Mechanics (verified, not assumed)

- **RNG.** 32-bit xorshift (13, 17, 15). A roll advances the seed twice:
  `raritySeed % 10000` picks the tier from cumulative rates, then
  `slotSeed % pool.length` picks the item (repeated entries = higher odds).
- **Shared seed.** All six banners roll the same seed; switching banners never
  resets anything. Track A row k = seed state 2(k-1), track B row k = state
  2k-1 (half a roll ahead).
- **Dupe reroll.** On tiers marked `reroll`, if the canonical item equals your
  last item, the game re-picks: it removes that slot, advances the seed once and
  picks `seed % shrunkPool.length`, repeating while it's still the same item
  (godfat's `reroll_cat` in battle-cats-rolls `gacha.rb`). Each re-pick is a
  half roll, so an **odd** number switches track; pools with repeated items
  (Lucky Ticket, Lucky Ticket G) can need 2–3 re-picks; an even number lands on
  the *same* track.
- **ampuri is wrong on some multi-step re-picks.** Its shortcut records removed
  slots as indices of the already-shrunk pool but maps them back as if they were
  original indices, so it can "re-pick" a slot that's gone. Seed 3141592653, 8A
  Lucky Ticket G: godfat's rule gives 100K XP (β) after 2 re-picks → 10A; ampuri
  shows 11A after 4 re-picks (its removed list reads [2,1,1,0,1]) from a pool
  that only had 3 Catamin A. Same item, different landing position — which
  shifts everything after it. We follow godfat; the golden fixture lists the
  cell under `knownDifferences`.
- **Dupes cross banners.** The last item carries over between banners (by item
  id: "10K XP" on Catseye dupes "10K XP" on Lucky Ticket). ampuri's table only
  shows dupes within one banner column; the reachability and the search follow
  them across banners. Example (seed 3141592653, last item Cat Energy): rolling
  only Catseye is one fixed path (dupes included) that never lands on the Uber
  Rare Catseyes at 31B and 42A — 3 of them within 45 tickets. Mixing in Lucky
  Ticket lets the search choose where dupes happen: 6 Uber Rare Catseyes, with
  fewer normal tickets.
- **100K XP (β)** on Lucky Ticket G is a different item id from the 100K XP of
  other banners, so it never counts as a dupe of it (ampuri's note).
- **Notation.** `25AR` = the rerolled result of 25A (godfat's convention); a
  jump target with a trailing R (`→ 26BR`) means you'll reroll again there.

## Data provenance

- Pools/rates are ampuri's (`src/utils/bannerData.tsx`, last changed Nov 2023),
  re-entered as data in `src/engine/banners.js`. ampuri's repo has no license,
  so no code was copied; the engine is written from godfat's documented rules.
- **Golden test:** `tests/fixtures/ampuri_golden.json` is ampuri's rendered
  table for seeds 3141592653 (last item Cat Energy) and 2718281828 (none) × all
  six banners × both tracks × 40 rows = 960 cells, plus every reroll ampuri
  displays (item and jump target), seven of them multi-step re-picks. The engine
  reproduces all of them except the one documented ampuri error above. ampuri's
  links also carry the seed after each roll; one of them pins the xorshift.
  Earlier spot checks (on a player's seed, no longer in the repo): 1,200 cells
  of a 200-row table and an 11-roll highlight walk through two rerolls.
- After a "followed" path the new seed was checked against ampuri: starting
  ampuri from it shows exactly our table's next rows.
- Unverified: whether the 2023 pools still match the 2026 game. Re-check the
  in-game rate screens after updates.

## Search

- **Ranking (user decision):** most appearances (each copy counts), then fewest
  normal tickets, then fewest lucky + lucky G combined. Paths end at their last
  wanted item. Each banner spends only its own ticket kind.
- **Easiest plan among equals.** Remaining ties go to the most normal-ticket
  draws on the base banner (the user picks it; default Normal+), then the fewest
  runs of same-banner draws. "Any" drops the base, leaving the fewest switches.
  Both orders were compared on 8 seeds × 4 banner setups: base-first put 184
  normal draws off Normal+ against 480, but needed 246 runs against 100 (e.g.
  `N+×3 CE×3 N+×8 CE×1 LT×1 N+×1 CE×2 N+×1 CE×1` vs `CE×15 LT×1 CE×5`). The
  user's own example keeps filler on Normal+, so base-first is the default and
  "Any" is the other choice. Exactness needs one rule: a draw only starts a new
  run if it changes banner, so two partial paths ending on different banners
  are compared with a one-run margin (`covers`) — the search still matches the
  brute force on every tie. Beam passes pick partial paths by items/tickets
  alone and skip that margin: letting ease steer them cost items (9,999×3 fell
  from 6,213 to 5,098; 200/50/50 from 64 to 63).
- **Exact sweep.** Seed positions only move forward, so it's a DAG: sweep states
  in order keeping, per (state, last-item key), the partial paths not beaten on
  every count. Only the last item matters, and only when it equals a reroll-tier
  canonical item at the next state — so each state has ≤ 1 + banners keys.
  Partial paths are bucketed by (lucky, lucky G) usage so inserts stay cheap.
- **Why anytime.** With all three ticket kinds, every split of rolls between
  normal/lucky/lucky G is a different, incomparable partial path, so the exact
  frontier can be huge (a naive version didn't finish in 10 minutes at
  200/50/50). Pipeline: beam 48 (half the beam favours saving normal tickets,
  half saving lucky ones — this alone took the heavy case's quick answer from 53
  to 67 of 68) → beam 600 → exact sweep with the best score so far as a floor
  and an upper bound UB[state][rolls left] (ticket kinds relaxed), capped at
  3 s / 1.5M partial paths. Results say "proven optimal" only when the exact
  sweep completes.
- **Depth.** Each ticket kind accepts up to 9,999. The search covers every
  position the tickets can reach: it builds the track for the worst case (5 seed
  states per roll), runs the reachability, and cuts at the deepest reachable
  state. 9,999 of every kind reaches ~36,000 rows, under the 40,000-row safety
  cap (`MAX_ROWS`). The UB[state][rolls left] table grows as depth × tickets, so
  past 8M entries (~16 MB) it falls back to "unlimited rolls from here, capped by
  the rolls left" — looser but linear. Beam widths shrink (down to 2) for very
  deep inputs so the first answer stays quick.
- **Measured (Ryzen 7 2700X, `node scripts/bench.mjs`, seed 3141592653, base
  Normal+ where picked):** Catseye+Lucky 30/10: 14 ms; 4 banners 100/30: 90 ms;
  200 normal/50 lucky: 0.22 s; all five 50/15/15: 0.20 s; Catseye only, 1500
  normal: 65 ms — all proven optimal. All five 100/30/30 and 200/50/50: capped
  at ~0.7–1 s; 4 banners 1500/300: first answer 0.36 s, capped at ~2.8 s; 9,999
  of every kind: first answer 0.64 s, capped at ~3.4 s. ("All five" = every
  banner you can pick together, Normal+ standing in for Normal.) Earlier,
  with all six banners: the plan tie-breaks changed no item or ticket count,
  uncapped runs on the earlier seed confirmed the capped 100/30/30 and
  200/50/50 answers were the true optima, and 200/50/50 completed within a
  64 MB JS heap.
- **Safety nets:** every returned path is re-simulated from scratch
  (`verifyPath`); tests compare the search with a brute force over every roll
  sequence for small budgets (6 seeds × 8 banner/ticket mixes × 3 last items).

## UI

- **Normal or Normal+, not both (user decision).** Ticking one unticks the
  other (`toggleBanner`); a link with both keeps Normal+.
- **Appearances** use reachability with the *total* tickets of the selected
  banners' kinds (ticket split relaxed) — "could some roll sequence get here?".
  Whether they can be collected together within each budget is the paths' job.
- **Table depth "All my tickets"** = the deepest position the tickets your
  banners can use actually reach — no 999 cap (safety cap 40,000 rows; 9,999 of
  every kind reaches ~36,000). A first version guessed ~1.1 rows per ticket, but
  chained dupes reach much deeper with many banners (row 373 with 300 tickets;
  row 1,691 with 1,500). Tickets of a kind no picked banner uses don't count
  (they can't move the seed there).
- **Deep tracks stay small.** A cell is fully described by (tier, slot, dupe
  result), so cells are interned — one shared frozen object per combination,
  one pointer per cell — and reachability is a single Int32Array of
  (state × last-item slot). For 9,999 of every ticket kind that cut the track +
  reachability from 87 MB to ~10 MB (~0.25 s to build on desktop). Typing in the
  seed/ticket boxes waits 150 ms after the last keystroke before rebuilding.
- **Track table** is one table of half-rows: each position spans two, A starts
  on even half-rows and B on odd ones, so the tracks interleave and can't drift.
  Half-rows have a fixed height and cells don't wrap (≤ 2 lines), otherwise the
  browser distributes row-span heights unevenly and the stagger collapses.
- **Only the visible rows are drawn.** The fixed half-row height makes the table
  easy to window: draw the half-rows near the scroll position (plus a buffer)
  and stand in filler rows of the exact height for the rest. The window starts
  on an A position and ends after a B one, with the same spacer cells as the
  table's real top and bottom, so row spans stay intact. Columns get fixed
  widths (`<colgroup>` + `table-layout: fixed`) so they don't jump as rows
  change; long names are ellipsized (full text in the tooltip). The window
  follows `scroll` events — not requestAnimationFrame, which pauses in
  background tabs. At 1,691 rows only ~74 table rows exist in the page.
- **Responsiveness:** search in a Web Worker (terminated when inputs change),
  windowed table, path step lists rendered only when opened, long chip/hit lists
  start at 60 with "+N more". Measured in the production build as the longest
  gap between 10 ms timer ticks (idle baseline 16 ms) while switching inputs and
  scrolling the whole table: 45/10 tickets 23 ms, 200/50/50 47 ms, 1,200/300
  39 ms — no visible freeze. 9,999 of every kind: one ~0.35 s block while the
  track is built (measured at 37,000 rows with all six banners; five reach
  ~36,000), a few times longer on slow phones; moving that build to a worker
  is the next step if it matters.
- **Measuring note:** the Long Tasks API reports nothing in a hidden tab (it
  missed a deliberate 150 ms block in the hidden preview pane), which made an
  earlier "no task over 50 ms" claim unreliable. Use timer-gap probes instead.
- **State** lives in the URL hash (`#s=&last=&t=n.l.g&b=&base=&i=&d=&tab=`); actions
  that change the seed (follow a path, click an item) push a history entry so
  Back undoes them.

## Security

- **No server, nothing stored.** A static site: no backend, accounts, cookies,
  localStorage, analytics or third-party scripts. State lives in the URL hash,
  which browsers never send to the server.
- **XSS:** everything is rendered through React (text is escaped); there is no
  `dangerouslySetInnerHTML`, `innerHTML`, `eval` or string-built code. Links are
  constants or built with `URLSearchParams` from validated values, so no
  `javascript:` URLs can appear. External links use `rel="noreferrer"`.
- **Input validation:** every hash value is parsed against a whitelist (known
  item/banner ids, digits-only seed ≤ 2^32−1, tickets clamped to 0–9,999, depth
  and tab from fixed lists). Lookup tables have no prototype and ids are checked
  with `Object.hasOwn`, so links like `last=constructor` / `i=__proto__` are
  rejected (they used to pass the check, harmlessly — tested now).
- **Headers (vercel.json, also served by `pnpm preview`):** a strict CSP
  (`default-src 'self'`; scripts, styles, workers only from the site; no
  objects, base URI, forms or framing), `X-Frame-Options: DENY`, `nosniff`,
  `Referrer-Policy: no-referrer`, `Cross-Origin-Opener-Policy: same-origin` and
  a restrictive Permissions-Policy. Verified in the browser: the production
  build runs under them with no violations (worker, styles, table).
- **Self-DoS:** a crafted link can only make the visitor's own tab work hard;
  that's bounded by the 9,999-ticket and 40,000-row caps, the 3 s / 1.5M search
  budget and the worker (the page stays usable).
- **Dev/preview servers** listen on localhost only (Vite's dev server has had
  file-read bugs when exposed to a network). `pnpm audit`: no known
  vulnerabilities; pnpm runs no dependency install scripts except esbuild's.

## Not (yet) included

- Seed finding — linked to ampuri's finder instead.
- Item/ticket icons (text and rarity colours only for now).
- Regions other than BCEN.
- Multi-rolls: if the game offers them for normal tickets they're just
  consecutive single rolls on one banner, which the search already covers.
