// What the tracker tab shows: table depth follows the tickets.
import { test } from "node:test";
import assert from "node:assert/strict";

import { baseBannerId, deriveTracker, findAppearances, planRuns } from "../src/derive.js";
import { MAX_ROWS } from "../src/engine/track.js";
import { emptyState } from "../src/urlstate.js";

const state = (patch) => ({ ...emptyState(), seed: "2718281828", ...patch });

test("auto depth follows the tickets past 999 rows", () => {
  const d = deriveTracker(state({ banners: ["np", "ce"], tickets: { normal: 1200, lucky: 0, luckyG: 0 } }));
  assert.ok(d.rows >= 1200, `a roll is at least one row, so 1200 tickets reach row 1200+ (got ${d.rows})`);
  assert.ok(d.rows <= MAX_ROWS);
  assert.equal(d.autoRows, d.rows);
});

test("9,999 of every ticket kind fits: about 36,000 rows, still under the safety cap", () => {
  const d = deriveTracker(state({
    banners: ["np", "cf", "ce", "lt", "ltg"], // every banner you can pick together
    tickets: { normal: 9999, lucky: 9999, luckyG: 9999 },
  }));
  assert.equal(d.T, 29997);
  assert.ok(d.rows >= 29997, `a roll is at least one row (got ${d.rows})`);
  assert.ok(d.rows < MAX_ROWS, `the cap (${MAX_ROWS}) must not cut it short (got ${d.rows})`);
});

test("tickets the picked banners can't use don't deepen the table", () => {
  // 1000 lucky tickets but no Lucky Ticket banner: only the 50 normal count.
  const d = deriveTracker(state({ banners: ["ce"], tickets: { normal: 50, lucky: 1000, luckyG: 0 } }));
  assert.equal(d.T, 50);
  assert.ok(d.rows < 80, `got ${d.rows}`);
});

test("a manual depth wins over auto, and every appearance is within the auto depth", () => {
  const st = state({ banners: ["ce", "lt"], tickets: { normal: 300, lucky: 100, luckyG: 0 } });
  assert.equal(deriveTracker({ ...st, depth: 50 }).rows, 50);
  const d = deriveTracker(st);
  const apps = findAppearances(d, new Set(["dark-catseye", "uber-rare-catseye"]));
  assert.ok(apps.length > 0);
  for (const a of apps) assert.ok((a.m >> 1) + 1 <= d.rows, `appearance at row ${(a.m >> 1) + 1} beyond ${d.rows}`);
});

test("base banner: none for 'any', your pick if it's selected, else Normal+, Normal, or the first normal-ticket banner", () => {
  const base = (banners, pick = "") => baseBannerId({ ...emptyState(), banners, base: pick });
  assert.equal(base(["np", "ce", "lt"]), "np");
  assert.equal(base(["n", "ce"]), "n");
  assert.equal(base(["cf", "ce"]), "cf");
  assert.equal(base(["np", "ce"], "ce"), "ce");
  assert.equal(base(["np"], "ce"), "np"); // picked banner isn't selected
  assert.equal(base(["lt", "ltg"]), ""); // no normal-ticket banner at all
  assert.equal(base(["np", "ce"], "any"), ""); // fewest switches, no base
});

test("the plan groups consecutive draws on the same banner", () => {
  const step = (banner, ticket, pos, hit = false) => ({ banner, ticket, pos, hit, item: hit ? "dark-catseye" : "cat" });
  const steps = [
    step("np", "normal", "1A"), step("np", "normal", "2A"),
    step("lt", "lucky", "3A"),
    step("np", "normal", "4A"),
    step("ce", "normal", "5A", true),
  ];
  const runs = planRuns(steps);
  assert.deepEqual(runs.map((r) => `${r.count}x${r.banner}`), ["2xnp", "1xlt", "1xnp", "1xce"]);
  assert.equal(runs[0].from.pos, "1A");
  assert.equal(runs[0].to.pos, "2A");
  assert.equal(runs[1].ticket, "lucky");
  assert.deepEqual(runs[3].hits.map((h) => h.pos), ["5A"]);
  assert.deepEqual(planRuns([]), []);
});
