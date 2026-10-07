// Path-search benchmark (not part of `pnpm test`):  node scripts/bench.mjs
// Prints how fast the quick answer arrives, whether the final one is proven
// optimal within the time budget, and how many partial paths it explored.
import { findPaths } from "../src/engine/search.js";

const SEED = 3141592653;
const SCENARIOS = [
  ["typical: Catseye + Lucky, 30 normal / 10 lucky", ["ce", "lt"], { normal: 30, lucky: 10 }, ["dark-catseye", "uber-rare-catseye"]],
  ["medium: 4 banners, 100 normal / 30 lucky", ["np", "cf", "ce", "lt"], { normal: 100, lucky: 30 }, ["dark-catseye", "uber-rare-catseye", "epic-catfruit", "treasure-radar"]],
  ["two ticket kinds, big: 200 normal / 50 lucky", ["np", "cf", "ce", "lt"], { normal: 200, lucky: 50 }, ["dark-catseye", "uber-rare-catseye", "epic-catfruit", "treasure-radar"]],
  ["all 6, 50 / 15 / 15", ["n", "np", "cf", "ce", "lt", "ltg"], { normal: 50, lucky: 15, luckyG: 15 }, ["dark-catseye", "uber-rare-catseye", "epic-catfruit", "catamin-c", "1m-xp"]],
  ["all 6, 100 / 30 / 30", ["n", "np", "cf", "ce", "lt", "ltg"], { normal: 100, lucky: 30, luckyG: 30 }, ["dark-catseye", "uber-rare-catseye", "epic-catfruit", "catamin-c", "1m-xp"]],
  ["heavy: all 6, 200 / 50 / 50", ["n", "np", "cf", "ce", "lt", "ltg"], { normal: 200, lucky: 50, luckyG: 50 }, ["dark-catseye", "uber-rare-catseye", "epic-catfruit", "catamin-c", "1m-xp"]],
  ["deep: Catseye only, 1500 normal", ["ce"], { normal: 1500 }, ["dark-catseye", "uber-rare-catseye"]],
  ["deep: 4 banners, 1500 normal / 300 lucky", ["np", "cf", "ce", "lt"], { normal: 1500, lucky: 300 }, ["dark-catseye", "uber-rare-catseye", "epic-catfruit", "treasure-radar"]],
  ["extreme: all 6, 9999 / 9999 / 9999", ["n", "np", "cf", "ce", "lt", "ltg"], { normal: 9999, lucky: 9999, luckyG: 9999 }, ["dark-catseye", "uber-rare-catseye", "epic-catfruit", "catamin-c", "1m-xp"]],
];

const budget = Number(process.argv[2]) || 3000;
for (const [name, bannerIds, tickets, targets] of SCENARIOS) {
  const t0 = performance.now();
  let quickMs = null;
  let quick = null;
  const res = findPaths(
    { seed: SEED, lastItem: "cat-energy", bannerIds, tickets, targets },
    {
      timeBudgetMs: budget,
      onUpdate: (r) => {
        if (quickMs === null) {
          quickMs = performance.now() - t0;
          quick = r.paths[0]?.appearances ?? 0;
        }
      },
    }
  );
  const best = res.paths[0];
  console.log(
    `${name}\n  first answer ${quickMs?.toFixed(0) ?? "-"} ms (${quick ?? "-"} appearances) | final ${res.stats.ms} ms, ` +
      `${res.exact ? "PROVEN optimal" : "best found (" + res.stats.phase + ")"}: ${best?.appearances ?? 0} appearances, ` +
      `tickets ${best ? `${best.tickets.normal}/${best.tickets.lucky}/${best.tickets.luckyG}` : "-"} | ${res.stats.labels} partial paths`
  );
}
