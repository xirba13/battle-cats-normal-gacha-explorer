// What the tracker tab shows, derived from the saved state (pure functions).

import { BANNERS, bannerItems } from "./engine/banners.js";
import { MAX_ROWS, buildTrack, cellReach, reachability } from "./engine/track.js";

export function deriveTracker(st) {
  const banners = BANNERS.filter((b) => st.banners.includes(b.id));
  const usable = banners.map((b) => st.tickets[b.ticket] > 0);
  // Only tickets the selected banners can spend count towards how far you reach.
  const kinds = new Set(banners.filter((_, j) => usable[j]).map((b) => b.ticket));
  const T = [...kinds].reduce((sum, k) => sum + st.tickets[k], 0);
  // A roll moves at most 5 seed states (2 + up to 3 dupe re-picks).
  const budgetStates = Math.min(5 * T + 4, 2 * MAX_ROWS + 12);
  const manualRows = st.depth === "auto" ? 0 : st.depth;
  const track = buildTrack(Number(st.seed), banners, Math.max(budgetStates + 16, 2 * manualRows + 8, 48));
  const reach = reachability(track, st.lastItem, usable);
  // Auto depth = the deepest position your tickets can actually reach. Chained
  // dupes add half rows, so with many banners this can be well past one row per
  // ticket.
  const autoRows = Math.min(MAX_ROWS, Math.max(20, (reach.deepest(T) >> 1) + 3));
  const rows = manualRows || autoRows;
  return { banners, usable, T, rows, autoRows, track, reach };
}

// Every appearance of a wanted item that your tickets can reach, in position
// order. `rolls` = fewest rolls needed before it.
export function findAppearances({ track, reach, usable, T }, targets) {
  const out = [];
  if (!targets.size || !T) return out;
  for (let m = 0; m < track.states; m++) {
    track.cells[m].forEach((cell, j) => {
      if (!usable[j]) return;
      const r = cellReach(track, reach, m, j);
      if (r.canonical <= T - 1 && targets.has(cell.item)) {
        out.push({ m, j, rerolled: false, item: cell.item, rolls: r.canonical });
      }
      if (cell.reroll && r.rerolled <= T - 1 && targets.has(cell.reroll.item)) {
        out.push({ m, j, rerolled: true, item: cell.reroll.item, rolls: r.rerolled });
      }
    });
  }
  return out;
}

// Lowest per-roll chance of each item across the given banners (rarest first
// when listing).
export function itemChances(banners) {
  const best = new Map();
  for (const b of banners) {
    for (const { id, chance } of bannerItems(b)) {
      if (!best.has(id) || chance < best.get(id)) best.set(id, chance);
    }
  }
  return best;
}

export function formatChance(pct) {
  return `${Number(pct.toFixed(2))}%`;
}

export function ticketText(t) {
  const parts = [];
  if (t.normal) parts.push(`${t.normal} normal`);
  if (t.lucky) parts.push(`${t.lucky} lucky`);
  if (t.luckyG) parts.push(`${t.luckyG} lucky G`);
  return parts.length ? `${parts.join(" + ")} ticket${t.normal + t.lucky + t.luckyG === 1 ? "" : "s"}` : "no tickets";
}

// Group a path's steps for display: plain rolls on the same banner collapse
// into one line ("12A–15A · Lucky Ticket ×4"); hits and dupes stay separate.
export function groupSteps(steps) {
  const out = [];
  for (const s of steps) {
    const prev = out[out.length - 1];
    const plain = !s.hit && !s.rerolled;
    if (plain && prev && prev.plain && prev.banner === s.banner && prev.lastNext === s.m) {
      prev.count++;
      prev.to = s;
      prev.lastNext = s.next;
    } else {
      out.push({ plain, banner: s.banner, from: s, to: s, count: 1, lastNext: s.next });
    }
  }
  return out;
}
