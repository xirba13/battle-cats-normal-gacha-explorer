# Battle Cats Normal Gacha Explorer

A static web app that seed-tracks the Battle Cats **normal gacha** — Normal,
Normal+, Catfruit, Catseye, Lucky Ticket and Lucky Ticket G — and finds the
ticket paths that collect the most of the items you want.

Companion to [Battle Cats Gacha Explorer](https://github.com/xirba13/battle-cats-gacha-explorer)
(the rare gacha). The normal gacha has its **own seed**, separate from the rare
gacha's.

> ⚠️ **Experimental.** Every path is re-simulated before it's shown, but check
> it on [ampuri's tracker](https://ampuri.github.io/bc-normal-seed-tracking/)
> before spending tickets.

**No server, no accounts, no database.** Everything runs in your browser and
your inputs live in the page link — bookmark it to keep them.

## What it does

1. **Banners** — tick the banners open in-game (Normal or Normal+, not both).
   They all share one seed, and each uses one kind of ticket:

   | Banner | Ticket |
   | --- | --- |
   | Normal, Normal+, Catfruit, Catseye | normal tickets |
   | Lucky Ticket | lucky tickets |
   | Lucky Ticket G | lucky tickets G |

   With several normal-ticket banners, pick a **base banner** (e.g. Normal+):
   draws that just move you forward stay on it, and other banners are used
   only when that gets more items or saves tickets. **Any** gives the plan with
   the fewest banner switches instead. With both normal and lucky tickets,
   **Save first** picks which kind plans keep: lucky tickets by default (normal
   tickets are spent first), or normal tickets.
2. **Items** — tick what you want (Dark Catseye, Catamin C, Epic Catfruit…).
3. **Results** — every appearance of those items your tickets can reach (e.g.
   `Dark Catseye: 22A, 56B, 105AR`), and the best paths. Each path starts with
   a short **plan** — how many draws on which banner, in order:
   `10× Normal+ → 1× Lucky Ticket → 9× Normal+ → 1× Catseye 🎯 Dark Catseye (20A)`,
   and the **NP and Rare Tickets** its draws give, per selected banner (a cat
   is 2 NP on Normal+ and 1 on Normal, a Li'l cat 1 NP on Lucky Ticket; every
   5 base upgrades from Normal / Normal+ are a Rare Ticket).
   Pick a path to see which appearances it gets and which it skips.
4. **Track table** — godfat/ampuri-style A/B tracks with the selected path
   highlighted, as deep as your tickets reach (each ticket kind takes up to
   9,999; all of them maxed is about 36,000 rows). Click an item to say "I
   rolled up to here".

After rolling a path in-game, **“I followed this path”** fills in your new seed
and last item and subtracts the tickets (Back undoes it).

### How paths are ranked

1. Most appearances (every copy counts — three Dark Catseyes = 3).
2. Then fewest tickets of the kind you **save first**: lucky + lucky G
   combined by default, or normal tickets.
3. Then fewest of the other kind.
4. Then the easiest plan to follow: most normal-ticket draws on your base
   banner, then fewest banner switches. This never costs an item or a ticket.

Paths end at their last wanted item. Dupe rerolls are followed **across
banners** (your last item carries over), which can open or close whole stretches
of the track.

## Prerequisites

- **Your normal-gacha seed.** Find it with
  [ampuri's seed finder](https://ampuri.github.io/bc-normal-seed-tracking/#/finder).
- **Your last rolled item** (or "none / not sure" — only the first roll can differ).
- **BCEN pools**, as published by ampuri's tracker (last changed there in Nov
  2023). If the game adds an item to a pool, results shift — see
  [Updating the pools](#updating-the-pools).
- **Where this disagrees with ampuri:** rarely, on Lucky Ticket / Lucky Ticket G
  dupes that need several re-picks, ampuri's table can land you one position off
  (details in [DECISIONS.md](DECISIONS.md)); this app follows godfat's rules.

## Running it

```bash
pnpm install
pnpm dev        # http://localhost:5174
pnpm test       # engine vs ampuri, brute-force search checks, URL state
pnpm build      # static site in dist/
pnpm preview    # serve dist/ at http://localhost:5175 with the production security headers
```

`node scripts/bench.mjs` prints search timings for light to extreme inputs.
Dev and preview servers only listen on your own machine.

## Deploying (Vercel)

It's a plain Vite static site: import the repo in Vercel, framework **Vite**,
build command `pnpm build`, output `dist`. No environment variables, no server
functions. (If Vercel picks an older pnpm than the `packageManager` field asks
for, set `ENABLE_EXPERIMENTAL_COREPACK=1`.) [`vercel.json`](vercel.json) adds
the security headers below; on another static host, copy them into its config.

## Performance

Everything runs on the visitor's device, so the heavy parts are built for slow
phones:

- The path search runs in a **Web Worker** and is **anytime**: a quick answer
  in a fraction of a second, then a proven-optimal one. On a 2018 desktop CPU,
  realistic inputs (one or two ticket kinds, even 200 normal + 50 lucky) are
  proven optimal in under 0.3 s.
- With large amounts of **all three** ticket kinds at once, or thousands of
  tickets, the exact search stops at a time/size limit (~3 s) and says so; the
  paths shown are still valid, usually optimal, just not proven. A clean-up
  pass then moves draws between banners where that keeps every item and makes
  the plan better by the ranking: e.g. spending normal tickets that were left
  over instead of lucky ones, or a Catseye detour that a lucky ticket can do
  instead, with an earlier lucky draw moving to Normal+.
- The track table only draws the rows near the screen. Measured in the
  production build, the page never stalls longer than ~50 ms for realistic
  inputs (even 1,200 normal + 300 lucky). The one exception is 9,999 of every
  ticket kind: building that ~36,000-row track blocks the page once for ~0.35 s
  on a desktop (longer on a slow phone).

## Security

- **No server and nothing stored** — no accounts, cookies, local storage,
  analytics or third-party scripts. Your inputs live only in the page link's
  `#…` part, which browsers never send to any server.
- **XSS:** all output goes through React's escaping; there is no raw-HTML
  injection, `eval` or code built from strings, and every value read from the
  link is checked against a whitelist (known items/banners, digits-only seed,
  tickets clamped to 0–9,999).
- **Headers** ([`vercel.json`](vercel.json)): a strict Content Security Policy
  (scripts, styles and workers only from this site; no framing, plugins, forms
  or base-URI changes), plus `nosniff`, `no-referrer`, `X-Frame-Options: DENY`,
  `Cross-Origin-Opener-Policy` and a restrictive Permissions-Policy.
- **Dependencies:** only React and Vite; `pnpm audit` reports no known
  vulnerabilities, and pnpm runs no install scripts except esbuild's.

Details in [DECISIONS.md](DECISIONS.md#security).

## Updating the pools

Pools and rates live in [`src/engine/banners.js`](src/engine/banners.js) — one
data file. After a game update, compare it with the in-game rate screens (or
ampuri's tracker), edit the item lists, and run `pnpm test`. The golden test
(`tests/fixtures/ampuri_golden.json`) is a snapshot of ampuri's tables; if
you intentionally change a pool, re-capture it from ampuri for the same seeds.

## Project layout

```
src/
  engine/
    rng.js            # xorshift32 (the game's gacha RNG)
    banners.js        # banner pools/rates, ticket kinds, item ids
    track.js          # positions (1A/1B…), rolls, dupe rerolls, reachability
    search.js         # path search (exact + anytime), path re-simulation
    search.worker.js  # runs the search off the main thread
  urlstate.js         # page link <-> state (the "save file")
  derive.js           # what the tracker tab shows, from the state
  components/         # inputs, pickers, results, track table, instructions
tests/                # node --test: engine, search (brute force), URL state
scripts/bench.mjs     # search timings
DECISIONS.md          # mechanics, data provenance, design choices
```

## Credits

- [godfat](https://bc.godfat.org/help) — the seed-tracking format and reroll
  rules (`reroll_cat`) this follows.
- [ampuri](https://ampuri.github.io/bc-normal-seed-tracking/) — the
  normal-gacha tracker this was verified against, and the banner pool data.
- [/u/JulietCat](https://www.reddit.com/user/JulietCat/) — the original research
  on the seed and the normal gacha's rarity tables.

## License

Released into the **public domain** under [The Unlicense](LICENSE). Game data
(item names, pools, rates) belongs to its owners; the Unlicense covers this
project's code.
