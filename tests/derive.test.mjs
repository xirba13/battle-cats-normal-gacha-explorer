// What the tracker tab shows: table depth follows the tickets.
import { test } from "node:test";
import assert from "node:assert/strict";

import { deriveTracker, findAppearances } from "../src/derive.js";
import { MAX_ROWS } from "../src/engine/track.js";
import { emptyState } from "../src/urlstate.js";

const state = (patch) => ({ ...emptyState(), seed: "2718281828", ...patch });

test("auto depth follows the tickets past 999 rows", () => {
  const d = deriveTracker(state({ banners: ["np", "ce"], tickets: { normal: 1200, lucky: 0, luckyG: 0 } }));
  assert.ok(d.rows >= 1200, `a roll is at least one row, so 1200 tickets reach row 1200+ (got ${d.rows})`);
  assert.ok(d.rows <= MAX_ROWS);
  assert.equal(d.autoRows, d.rows);
});

test("9,999 of every ticket kind fits: about 37,000 rows, still under the safety cap", () => {
  const d = deriveTracker(state({
    banners: ["n", "np", "cf", "ce", "lt", "ltg"],
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
