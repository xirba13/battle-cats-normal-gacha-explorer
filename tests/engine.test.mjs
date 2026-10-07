// Engine tests: the seed math must reproduce ampuri's tracker exactly.
//   pnpm test   (node --test)

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { advance, seedSequence } from "../src/engine/rng.js";
import { BANNERS, BANNER_BY_ID, ITEMS, itemId, itemName } from "../src/engine/banners.js";
import { buildTrack, cellReach, outcome, positionLabel, reachability, stateOf } from "../src/engine/track.js";

const golden = JSON.parse(readFileSync(new URL("./fixtures/ampuri_golden.json", import.meta.url), "utf8"));

test("every cell matches ampuri's rendered table (both tracks, all 6 banners)", () => {
  // Cells where ampuri is wrong by godfat's rules: the fixture keeps ampuri's
  // value verbatim and we expect the documented one instead.
  const known = new Map(golden.knownDifferences.map((d) => [`${d.seed} ${d.cell} ${d.banner}`, d]));
  let cells = 0;
  let rerolls = 0;
  let multiRepicks = 0;
  for (const c of golden.cases) {
    const banners = golden.banners.map((id) => BANNER_BY_ID[id]);
    const track = buildTrack(c.seed, banners, 2 * c.A.length + 8);
    for (const [offset, side] of [[0, "A"], [1, "B"]]) {
      c[side].forEach((row, r) => {
        const m = 2 * r + offset;
        row.forEach((captured, j) => {
          const cell = track.cells[m][j];
          const where = `seed ${c.seed} ${positionLabel(m)} ${golden.banners[j]}`;
          const diff = known.get(`${c.seed} ${positionLabel(m)} ${golden.banners[j]}`);
          if (diff) assert.equal(captured, diff.ampuri, `${where}: fixture should keep ampuri's value`);
          const [canonical, rerolled, target] = (diff ? diff.expected : captured).split(">");
          assert.equal(itemName(cell.item), canonical, where);
          cells++;
          if (rerolled === undefined) return;
          rerolls++;
          assert.ok(cell.reroll, `${where}: expected a dupe reroll`);
          assert.equal(itemName(cell.reroll.item), rerolled, where);
          if (cell.reroll.extra > 1) multiRepicks++;
          const m2 = m + 2 + cell.reroll.extra;
          const dest = track.cells[m2][j];
          const rerollsAgain = Boolean(dest.reroll) && dest.item === cell.reroll.item;
          assert.equal(positionLabel(m2, rerollsAgain), target, `${where}: jump target`);
        });
      });
    }
  }
  assert.equal(cells, 2 * 2 * 40 * 6);
  assert.ok(rerolls > 50, `fixture should exercise rerolls (got ${rerolls})`);
  assert.ok(multiRepicks > 3, `fixture should exercise multi-step re-picks (got ${multiRepicks})`);
});

test("xorshift32 matches ampuri's own seeds", () => {
  // ampuri links each result with the seed after that roll; on seed 3141592653
  // the link of 24A Lucky Ticket carries 4059219439.
  const seeds = seedSequence(3141592653, 64);
  assert.equal(seeds[stateOf("24A") + 2], 4059219439);
  assert.equal(advance(0xffffffff) >>> 0, advance(0xffffffff)); // stays unsigned
});

test("position labels round-trip", () => {
  for (const [m, label] of [[0, "1A"], [1, "1B"], [2, "2A"], [3, "2B"], [208, "105A"]]) {
    assert.equal(positionLabel(m), label);
    assert.equal(stateOf(label), m);
  }
  assert.equal(positionLabel(208, true), "105AR");
});

test("banner data is consistent", () => {
  for (const b of BANNERS) assert.equal(b.cum[b.cum.length - 1], 10000, b.id);
  // Distinct names never collapse to one id, and the β 100K XP is its own item.
  const names = Object.values(ITEMS).map((i) => i.name);
  assert.equal(new Set(names.map(itemId)).size, names.length);
  assert.notEqual(itemId("100K XP (β)"), itemId("100K XP"));
  assert.equal(BANNER_BY_ID.lt.ticket, "lucky");
  assert.equal(BANNER_BY_ID.ltg.ticket, "luckyG");
  for (const id of ["n", "np", "cf", "ce"]) assert.equal(BANNER_BY_ID[id].ticket, "normal");
});

test("a dupe rerolls only on reroll tiers, and only after the same item", () => {
  const track = buildTrack(3141592653, [BANNER_BY_ID.ce], 60);
  // 5A Catseye is 30K XP (reroll tier); after a 30K XP it rerolls to 10K XP and
  // jumps half a roll, to 6B.
  const cell = track.cells[stateOf("5A")][0];
  assert.equal(cell.item, "30k-xp");
  assert.deepEqual(outcome(cell, "30k-xp"), { item: "10k-xp", rerolled: true, advance: 3 });
  assert.deepEqual(outcome(cell, "dark-catseye"), { item: "30k-xp", rerolled: false, advance: 2 });
  // 23B Catseye is Dark Catseye (no reroll tier): never rerolls.
  const dark = track.cells[stateOf("23B")][0];
  assert.equal(dark.item, "dark-catseye");
  assert.equal(dark.reroll, null);
});

test("pools with repeated items can need several re-picks (godfat's reroll_cat)", () => {
  const track = buildTrack(3141592653, [BANNER_BY_ID.ltg], 60);
  // 14A Lucky Ticket G gives 100K XP (β); duped, it takes 3 re-picks (odd:
  // switches track), landing on 16B.
  assert.deepEqual(track.cells[stateOf("14A")][0].reroll, { item: "catamin-a", extra: 3 });
  // 8A gives Catamin A; duped, 2 re-picks (even: same track) -> 10A. ampuri
  // shows 11A here because its shortcut can re-pick a removed slot (see
  // knownDifferences in the fixture).
  assert.deepEqual(track.cells[stateOf("8A")][0].reroll, { item: "100k-xp-beta", extra: 2 });
});

test("reachability follows dupes across banners", () => {
  // The last item carries over between banners (10K XP / 30K XP exist on both
  // Catseye and Lucky Ticket), so rolling Lucky Ticket must unlock Catseye
  // rerolls that rolling Catseye alone never reaches. ampuri's per-column view
  // can't show these; the path search needs them.
  const rerollable = (bannerIds) => {
    const banners = bannerIds.map((id) => BANNER_BY_ID[id]);
    const track = buildTrack(3141592653, banners, 220);
    const reach = reachability(track, "cat-energy", banners.map(() => true));
    const found = new Set();
    for (let m = 0; m < 200; m++) if (Number.isFinite(cellReach(track, reach, m, 0).rerolled)) found.add(m);
    return found;
  };
  const alone = rerollable(["ce"]);
  const withLucky = rerollable(["ce", "lt"]);
  for (const m of alone) assert.ok(withLucky.has(m), `${positionLabel(m)} lost by adding a banner`);
  const extra = [...withLucky].filter((m) => !alone.has(m));
  assert.ok(extra.length > 0, "expected Catseye rerolls reachable only through Lucky Ticket");
});
