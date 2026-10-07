// Path-search tests. The brute force below tries EVERY sequence of rolls for
// small ticket counts; the search must find the same best path.

import { test } from "node:test";
import assert from "node:assert/strict";

import { BANNER_BY_ID } from "../src/engine/banners.js";
import { advance } from "../src/engine/rng.js";
import { outcome, positionLabel, rollCell } from "../src/engine/track.js";
import { findPaths, verifyPath } from "../src/engine/search.js";

// Best path over all roll sequences, ranked like the app: most appearances,
// fewest normal, fewest lucky + lucky G, then the easiest plan — fewest
// normal-ticket draws off the base banner, then fewest runs of same-banner draws.
function bruteForce({ seed, lastItem, bannerIds, tickets, targets, baseBannerId }) {
  const banners = bannerIds.map((id) => BANNER_BY_ID[id]);
  const wanted = new Set(targets);
  const seeds = [seed >>> 0];
  const seedAt = (m) => {
    while (seeds.length <= m) seeds.push(advance(seeds[seeds.length - 1]));
    return seeds[m];
  };
  const key = (c) => [-c.s, c.n, c.l + c.g, c.offBase, c.runs];
  const better = (a, b) => {
    if (!b) return true;
    const ka = key(a);
    const kb = key(b);
    for (let i = 0; i < ka.length; i++) if (ka[i] !== kb[i]) return ka[i] < kb[i];
    return false;
  };
  let best = null;
  const used = { normal: 0, lucky: 0, luckyG: 0 };
  const walk = (m, last, s, prevBanner, runs, offBase) => {
    if (s > 0) {
      const cand = { s, n: used.normal, l: used.lucky, g: used.luckyG, runs, offBase };
      if (better(cand, best)) best = cand;
    }
    for (const b of banners) {
      if (used[b.ticket] >= (tickets[b.ticket] || 0)) continue;
      const o = outcome(rollCell(seedAt(m), b), last);
      used[b.ticket]++;
      walk(m + o.advance, o.item, s + (wanted.has(o.item) ? 1 : 0), b.id,
        runs + (b.id !== prevBanner ? 1 : 0), offBase + (b.ticket === "normal" && b.id !== baseBannerId ? 1 : 0));
      used[b.ticket]--;
    }
  };
  walk(0, lastItem, 0, null, 0, 0);
  return best;
}

const CASES = [
  { bannerIds: ["ce", "lt"], tickets: { normal: 5, lucky: 3, luckyG: 0 }, targets: ["rare-catseye", "30k-xp", "speed-up", "super-rare-catseye"], baseBannerId: "ce" },
  { bannerIds: ["np", "ce", "lt", "ltg"], tickets: { normal: 3, lucky: 2, luckyG: 2 }, targets: ["special-catseye", "catamin-b", "lil-cat", "superfeline", "10k-xp"], baseBannerId: "np" },
  { bannerIds: ["cf", "ce", "lt"], tickets: { normal: 4, lucky: 3, luckyG: 0 }, targets: ["cat-cpu", "speed-up", "100k-xp", "rare-catseye"], baseBannerId: "cf" },
  { bannerIds: ["n", "ltg"], tickets: { normal: 4, lucky: 0, luckyG: 4 }, targets: ["catamin-a", "catamin-b", "cat-energy", "study"], baseBannerId: "n" },
  { bannerIds: ["lt", "ltg"], tickets: { normal: 0, lucky: 4, luckyG: 3 }, targets: ["30k-xp", "10k-xp", "catamin-c", "100k-xp-beta"], baseBannerId: "" },
  // Several normal-ticket banners: here the base banner and switches decide ties.
  { bannerIds: ["n", "np", "ce", "lt"], tickets: { normal: 5, lucky: 1, luckyG: 0 }, targets: ["rare-catseye", "super-rare-catseye", "superfeline"], baseBannerId: "np" },
  { bannerIds: ["np", "cf", "ce"], tickets: { normal: 6, lucky: 0, luckyG: 0 }, targets: ["special-catseye", "cat-cpu", "100k-xp"], baseBannerId: "cf" },
  // No base banner ("Any"): just the fewest switches.
  { bannerIds: ["n", "np", "cf", "lt"], tickets: { normal: 5, lucky: 1, luckyG: 0 }, targets: ["cat-cpu", "superfeline", "speed-up"], baseBannerId: "" },
];
const SEEDS = [3141592653, 2718281828, 12345, 987654321, 42, 4000000007];

test("search finds the brute-force optimum, including the easiest plan among equals", () => {
  let compared = 0;
  for (const seed of SEEDS) {
    for (const [i, c] of CASES.entries()) {
      for (const lastItem of ["", "30k-xp", "catamin-a"]) {
        const input = { seed, lastItem, ...c };
        const bf = bruteForce(input);
        const res = findPaths(input, { timeBudgetMs: 60_000 });
        const where = `seed ${seed} case ${i} last '${lastItem}'`;
        assert.equal(res.exact, true, where);
        if (!bf) {
          assert.equal(res.paths.length, 0, where);
          continue;
        }
        const top = res.paths[0];
        assert.deepEqual(
          [top.appearances, top.tickets.normal, top.tickets.lucky + top.tickets.luckyG, top.ease.offBase, top.ease.runs],
          [bf.s, bf.n, bf.l + bf.g, bf.offBase, bf.runs],
          where
        );
        compared++;
      }
    }
  }
  assert.ok(compared > 90, `compared ${compared} cases`);
});

test("filler draws stay on your base banner", () => {
  // Same input, two base banners: the best paths are equally good, but each
  // keeps its filler on the chosen banner.
  const input = { seed: 2718281828, lastItem: "", bannerIds: ["n", "np", "lt"], tickets: { normal: 12, lucky: 1 }, targets: ["treasure-radar"] };
  for (const base of ["n", "np"]) {
    const [p] = findPaths({ ...input, baseBannerId: base }).paths;
    const normalDraws = p.steps.filter((s) => s.ticket === "normal");
    assert.ok(normalDraws.length > 0, "needs some normal-ticket filler");
    assert.ok(normalDraws.every((s) => s.banner === base), `base ${base}: ${p.steps.map((s) => s.banner).join(",")}`);
    assert.equal(p.ease.offBase, 0);
  }
});

test("a base banner keeps filler on it; without one the plan switches banners the least", () => {
  const input = { seed: 3141592653, lastItem: "", bannerIds: ["n", "np", "ce", "lt"], tickets: { normal: 30, lucky: 3 }, targets: ["dark-catseye"] };
  const [onBase] = findPaths({ ...input, baseBannerId: "np" }).paths;
  const [any] = findPaths({ ...input, baseBannerId: "" }).paths;
  const offNp = (p) => p.steps.filter((s) => s.ticket === "normal" && s.banner !== "np").length;
  const plan = (p) => p.steps.map((s) => s.banner).join(",");
  // Equally good on items and tickets either way...
  assert.deepEqual([any.appearances, any.tickets], [onBase.appearances, onBase.tickets]);
  // ...but one stays on Normal+ more, the other switches banners less.
  assert.ok(offNp(onBase) < offNp(any), `${plan(onBase)} vs ${plan(any)}`);
  assert.ok(any.ease.runs < onBase.ease.runs, `${plan(onBase)} vs ${plan(any)}`);
});

test("every returned path re-simulates, respects each ticket budget, and ends on a target", () => {
  const input = {
    seed: 3141592653, lastItem: "cat-energy", bannerIds: ["np", "cf", "ce", "lt", "ltg"],
    tickets: { normal: 40, lucky: 12, luckyG: 6 },
    targets: ["dark-catseye", "uber-rare-catseye", "epic-catfruit", "treasure-radar", "catamin-c"],
  };
  const res = findPaths(input);
  assert.ok(res.paths.length > 1);
  const sigs = new Set();
  for (const p of res.paths) {
    assert.ok(verifyPath(input, p).ok, verifyPath(input, p).errors.join("; "));
    assert.equal(p.verified, true);
    assert.ok(p.steps.at(-1).hit, "a path must end on its last target");
    assert.equal(p.appearances, p.steps.filter((s) => s.hit).length);
    for (const s of p.steps) assert.equal(s.ticket, BANNER_BY_ID[s.banner].ticket);
    const used = { normal: 0, lucky: 0, luckyG: 0 };
    for (const s of p.steps) used[s.ticket]++;
    assert.deepEqual(used, p.tickets);
    for (const k of Object.keys(used)) assert.ok(used[k] <= input.tickets[k], k);
    const sig = p.steps.filter((s) => s.hit).map((s) => `${s.pos}/${s.banner}`).join(",");
    assert.ok(!sigs.has(sig), "paths must collect distinct appearance sets");
    sigs.add(sig);
  }
  // Ranked: appearances desc, then normal tickets asc.
  for (let i = 1; i < res.paths.length; i++) {
    const a = res.paths[i - 1];
    const b = res.paths[i];
    assert.ok(a.appearances > b.appearances || (a.appearances === b.appearances && a.tickets.normal <= b.tickets.normal));
  }
});

test("lucky tickets only roll Lucky Ticket, lucky G only Lucky Ticket G", () => {
  // No normal tickets: Catseye can't be rolled even though it's selected.
  const res = findPaths({
    seed: 2718281828, lastItem: "", bannerIds: ["ce", "lt", "ltg"],
    tickets: { normal: 0, lucky: 5, luckyG: 3 }, targets: ["dark-catseye", "treasure-radar", "catamin-c", "1m-xp"],
  });
  for (const p of res.paths) {
    assert.ok(p.steps.every((s) => s.banner !== "ce"));
    assert.ok(p.tickets.lucky <= 5 && p.tickets.luckyG <= 3 && p.tickets.normal === 0);
  }
});

test("one banner is one fixed path; a second banner steers around dupes", () => {
  // Seed 3141592653: rolling only Catseye (dupes included) never lands on the
  // Uber Rare Catseyes at 31B and 42A. Mixing in Lucky Ticket lets the search
  // pick where the dupes happen, and it collects twice as many.
  const base = { seed: 3141592653, lastItem: "cat-energy", targets: ["uber-rare-catseye"] };
  const hits = (p) => p.steps.filter((s) => s.hit).map((s) => s.pos);
  const alone = findPaths({ ...base, bannerIds: ["ce"], tickets: { normal: 45 } });
  const mixed = findPaths({ ...base, bannerIds: ["ce", "lt"], tickets: { normal: 45, lucky: 10 } });
  assert.ok(alone.exact && mixed.exact);
  assert.deepEqual(hits(alone.paths[0]), ["24B", "33B", "40B"]);
  assert.deepEqual(hits(mixed.paths[0]), ["24B", "31B", "33B", "40B", "46B", "47B"]);
  assert.ok(mixed.paths[0].tickets.normal < alone.paths[0].tickets.normal, "and it saves normal tickets");
});

test("the end seed is the seed right after the last roll (auto seed-fill)", () => {
  const input = { seed: 3141592653, lastItem: "cat-energy", bannerIds: ["np", "ce"], tickets: { normal: 30 }, targets: ["dark-catseye", "uber-rare-catseye"] };
  const [p] = findPaths(input).paths;
  const last = p.steps.at(-1);
  let s = input.seed;
  for (let i = 0; i < p.end.m; i++) s = advance(s);
  assert.equal(p.end.seed, s);
  assert.equal(p.end.m, last.next);
  assert.equal(p.end.pos, positionLabel(p.end.m));
  assert.equal(p.end.lastItem, last.item);
});

test("a capped search still returns verified paths, flagged as not proven optimal", () => {
  const input = {
    seed: 3141592653, lastItem: "cat-energy", bannerIds: ["n", "np", "cf", "ce", "lt", "ltg"],
    tickets: { normal: 120, lucky: 40, luckyG: 40 }, targets: ["dark-catseye", "uber-rare-catseye", "catamin-c", "1m-xp"],
  };
  const res = findPaths(input, { maxLabels: 2000 });
  assert.equal(res.exact, false);
  assert.ok(res.paths.length > 0 && res.paths.every((p) => p.verified));
});

test("paths go past row 999 when the tickets do", () => {
  const input = { seed: 2718281828, lastItem: "", bannerIds: ["ce"], tickets: { normal: 1500 }, targets: ["dark-catseye", "uber-rare-catseye"] };
  const res = findPaths(input);
  assert.equal(res.exact, true);
  const [best] = res.paths;
  assert.ok(best.steps.some((s) => (s.m >> 1) + 1 > 999), "best path should collect appearances beyond row 999");
  assert.ok(best.verified);
});

test("the biggest inputs stay within the time budget", () => {
  const input = {
    seed: 2718281828, lastItem: "", bannerIds: ["n", "np", "cf", "ce", "lt", "ltg"],
    tickets: { normal: 9999, lucky: 9999, luckyG: 9999 }, targets: ["dark-catseye", "catamin-c", "1m-xp"],
  };
  const t0 = performance.now();
  const res = findPaths(input, { timeBudgetMs: 800 });
  const ms = performance.now() - t0;
  assert.ok(ms < 4000, `took ${Math.round(ms)} ms`);
  assert.equal(res.exact, false);
  assert.ok(res.paths.length > 0 && res.paths.every((p) => p.verified));
});

test("nothing to do without banners, tickets or targets", () => {
  const base = { seed: 1, lastItem: "", bannerIds: ["ce"], tickets: { normal: 5 }, targets: ["dark-catseye"] };
  assert.deepEqual(findPaths({ ...base, bannerIds: [] }).paths, []);
  assert.deepEqual(findPaths({ ...base, tickets: {} }).paths, []);
  assert.deepEqual(findPaths({ ...base, targets: [] }).paths, []);
});
