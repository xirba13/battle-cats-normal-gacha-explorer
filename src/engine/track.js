// Track model: what every banner gives at every seed position, and which
// (position, last item) combinations a player can actually be in.
//
// Positions are seed-state indices m: m = 0 is the current seed. Track A row k
// is state 2(k-1) and track B row k is state 2k-1 (B is half a roll ahead).
// A normal roll moves m by 2 (same track, next row). A dupe reroll moves it by
// 2 + extra, where `extra` is the number of re-picks — an odd count switches
// track, exactly like godfat's rare-gacha tracks.

import { advance, seedSequence } from "./rng.js";

// Safety cap only: tables and searches go as deep as your tickets reach, and
// 9,999 of every ticket kind reaches about row 36,300. The table renders just
// the rows on screen, so depth costs little in the page.
export const MAX_ROWS = 40000;

export function positionLabel(m, rerolled = false) {
  return `${(m >> 1) + 1}${m & 1 ? "B" : "A"}${rerolled ? "R" : ""}`;
}

// Inverse of positionLabel ("12B" -> 23). Returns -1 for bad input.
export function stateOf(label) {
  const match = /^(\d+)([AB])$/.exec(label);
  if (!match) return -1;
  return 2 * (Number(match[1]) - 1) + (match[2] === "B" ? 1 : 0);
}

// Cells are interned: a cell is fully described by its tier, slot and dupe
// result, so each combination is one shared, frozen object and a 36,000-row
// track costs one pointer per cell instead of an object each.
const tierCells = new WeakMap(); // tier -> cells indexed by (slot, reroll slot, extra)
function internCell(tier, slot, rerollSlot, extra) {
  let cache = tierCells.get(tier);
  if (!cache) tierCells.set(tier, (cache = []));
  const key = (slot * (tier.items.length + 1) + rerollSlot + 1) * 8 + extra;
  let cell = cache[key];
  if (!cell) {
    cell = Object.freeze({
      rarity: tier.rarity,
      item: tier.items[slot],
      reroll: rerollSlot >= 0 ? Object.freeze({ item: tier.items[rerollSlot], extra }) : null,
    });
    cache[key] = cell;
  }
  return cell;
}

const repickPool = []; // reused scratch list of slots (no allocation per cell)

// Roll `banner` from seed state `stateSeed`. Returns the canonical result and,
// for reroll tiers, what you'd get instead if it duplicated your last item.
export function rollCell(stateSeed, banner) {
  const raritySeed = advance(stateSeed);
  const score = raritySeed % 10000;
  let t = 0;
  while (score >= banner.cum[t]) t++;
  const tier = banner.tiers[t];
  const slotSeed = advance(raritySeed);
  const slot = slotSeed % tier.items.length;
  const item = tier.items[slot];

  let rerollSlot = -1;
  let extra = 0;
  if (tier.reroll) {
    // godfat's reroll_cat: remove the duplicated slot, re-pick from the shrunk
    // pool with the next seed, and repeat while it's still the same item (pools
    // with repeated entries can need several re-picks).
    repickPool.length = 0;
    for (let i = 0; i < tier.items.length; i++) repickPool.push(i);
    let seed = slotSeed;
    let pick = slot;
    let picked = slot;
    while (tier.items[picked] === item && repickPool.length > 1) {
      repickPool.splice(pick, 1);
      seed = advance(seed);
      extra++;
      pick = seed % repickPool.length;
      picked = repickPool[pick];
    }
    if (tier.items[picked] !== item) rerollSlot = picked;
    else extra = 0;
  }
  return internCell(tier, slot, rerollSlot, extra);
}

// What a roll on `cell` gives when your previous item was `lastItem`.
export function outcome(cell, lastItem) {
  if (cell.reroll && lastItem === cell.item) {
    return { item: cell.reroll.item, rerolled: true, advance: 2 + cell.reroll.extra };
  }
  return { item: cell.item, rerolled: false, advance: 2 };
}

// Cells for `banners` at seed states [0, states). `seeds` has headroom so the
// seed after any roll inside the table can be read back (auto seed-fill).
export function buildTrack(seed, banners, states) {
  const seeds = seedSequence(seed, states + 32);
  const cells = new Array(states);
  for (let m = 0; m < states; m++) cells[m] = banners.map((b) => rollCell(seeds[m], b));
  return { seed: seed >>> 0, seeds, banners, states, cells };
}

// Fewest rolls to reach each (state, last item), from the current seed and last
// item, rolling only `usable` banners. Ticket kinds are not split here (that's
// the path search's job) — this answers "is this cell reachable?".
//
// Only the last item can trigger a dupe, and only if it equals the canonical
// item of a reroll tier at the position you're on. So at state m every other
// last item behaves the same: the "key" is that item or "" — at most one key
// per banner. Keys are stored as slots (0 = "", j + 1 = banner j's item) in one
// typed array, so deep tracks stay small.
export function reachability(track, lastItem, usable) {
  const { states, cells } = track;
  const width = (cells[0]?.length ?? 0) + 1;
  const rolls = new Int32Array(states * width).fill(-1); // -1 = unreachable
  const slotOf = (m, item) => {
    if (item && m < states) {
      const row = cells[m];
      for (let j = 0; j < row.length; j++) if (usable[j] && row[j].reroll && row[j].item === item) return j + 1;
    }
    return 0;
  };
  const keyAt = (m, item) => (slotOf(m, item) ? item : "");
  if (states > 0) rolls[slotOf(0, lastItem || "")] = 0;
  for (let m = 0; m < states; m++) {
    const row = cells[m];
    for (let s = 0; s < width; s++) {
      const r = rolls[m * width + s];
      if (r < 0) continue;
      const key = s === 0 ? "" : row[s - 1].item;
      for (let j = 0; j < row.length; j++) {
        if (!usable[j]) continue;
        const o = outcome(row[j], key);
        const m2 = m + o.advance;
        if (m2 >= states) continue;
        const i2 = m2 * width + slotOf(m2, o.item);
        if (rolls[i2] < 0 || r + 1 < rolls[i2]) rolls[i2] = r + 1;
      }
    }
  }
  return {
    width,
    rolls,
    slotOf,
    keyAt,
    // Deepest state some sequence of at most `maxRolls` rolls lands on.
    deepest(maxRolls) {
      for (let m = states - 1; m > 0; m--) {
        for (let s = 0; s < width; s++) {
          const r = rolls[m * width + s];
          if (r >= 0 && r <= maxRolls) return m;
        }
      }
      return 0;
    },
  };
}

// Fewest rolls needed before rolling cell (m, j) to get its canonical result,
// and its rerolled result. Infinity = can't happen with these banners.
export function cellReach(track, reach, m, j) {
  const cell = track.cells[m][j];
  const { width, rolls } = reach;
  const dupeSlot = cell.reroll ? reach.slotOf(m, cell.item) : 0;
  let canonical = Infinity;
  let rerolled = Infinity;
  for (let s = 0; s < width; s++) {
    const r = rolls[m * width + s];
    if (r < 0) continue;
    if (dupeSlot && s === dupeSlot) rerolled = r;
    else if (r < canonical) canonical = r;
  }
  return { canonical, rerolled };
}
