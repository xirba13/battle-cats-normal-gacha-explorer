// Path search: the most target appearances you can collect with your tickets.
//
// Ranking: most appearances (every copy counts — three Dark Catseyes = 3), then
// fewest normal tickets, then fewest lucky + lucky G tickets combined. Each
// banner spends only its own ticket kind (see banners.js). Among equally good
// paths, the easiest to follow wins: the most normal-ticket draws on your base
// banner (e.g. Normal+), then the fewest banner switches. Without a base banner
// it's just the fewest switches.
//
// Positions only move forward, so the search sweeps seed states in order and
// keeps, per (state, last-item key), the partial paths nobody beats on every
// count (appearances up; normal, lucky, lucky G used down). Partial paths are
// bucketed by their (lucky, lucky G) usage so inserting one is cheap.
//
// With all three ticket kinds and large budgets the exact sweep can take
// seconds-to-minutes, so findPaths is "anytime": quick beam passes first (fast,
// usually already optimal), then the exact sweep within a time/size budget. The
// result says whether it is proven optimal. The final paths then get a clean-up
// pass (polish), and every returned path is re-simulated from scratch before it
// is shown (same safety net as the rare-gacha explorer).

import { BANNER_BY_ID } from "./banners.js";
import { advance } from "./rng.js";
import { MAX_ROWS, buildTrack, outcome, positionLabel, reachability, rollCell } from "./track.js";

const TICKET_INDEX = { normal: 0, lucky: 1, luckyG: 2 };

export const DEFAULTS = { timeBudgetMs: 3000, maxLabels: 1_500_000, topK: 10 };

// The exact per-(state, rolls left) bound grows with depth × tickets; past this
// many entries (~16 MB) a cheaper, looser bound is used instead.
const BOUND_TABLE_LIMIT = 8_000_000;

const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));

// Easier plan first: fewer normal-ticket draws off the base banner (nb), then
// fewer runs of same-banner draws (sg). With no base banner nb is just the
// normal tickets used, already tied by then, so runs decide.
const byEase = (a, b) => a.nb - b.nb || a.sg - b.sg;

// Can partial path `a` replace `b` (same state, last-item key and lucky /
// lucky G usage) for every possible continuation? Strictly better appearances
// or normal tickets always wins. On an exact tie it comes down to the plan:
// a run only ends when the next draw changes banner, so a path ending on a
// different banner may still save one switch later — then it needs a margin.
// (`exact` off: just keep the easier one, so beam passes stay as lean as before.)
function covers(a, b, exact) {
  if (a.s < b.s || a.n > b.n) return false;
  if (a.s > b.s || a.n < b.n) return true;
  if (!exact || a.j === b.j) return byEase(a, b) <= 0;
  return a.nb < b.nb || (a.nb === b.nb && a.sg < b.sg);
}
// Better first: more appearances, fewer normal tickets, fewer lucky + lucky G.
// Beam passes pick partial paths by this alone (ease must never cost items).
const byValue = (a, b) => b.s - a.s || a.n - b.n || a.l + a.g - (b.l + b.g);
// Finished paths: the same, then the easier plan.
const byRank = (a, b) => byValue(a, b) || byEase(a, b);
// Alternative order for beam diversity: save lucky tickets first.
const byLuckyFirst = (a, b) => b.s - a.s || a.l + a.g - (b.l + b.g) || a.n - b.n;

export function prepare(input) {
  const seed = Number(input.seed) >>> 0;
  const budget = [input.tickets?.normal, input.tickets?.lucky, input.tickets?.luckyG].map((x) =>
    Math.max(0, Math.floor(Number(x) || 0))
  );
  const banners = (input.bannerIds || [])
    .map((id) => BANNER_BY_ID[id])
    .filter((b) => b && budget[TICKET_INDEX[b.ticket]] > 0);
  const targets = new Set(input.targets || []);
  const T = budget[0] + budget[1] + budget[2];
  if (!banners.length || !T || !targets.size) return null;

  // A roll moves 2 states plus one per dupe re-pick (at most 3 in these pools),
  // so 5 states per ticket can't be outrun. Then cut at the deepest state the
  // tickets actually reach: every move of the search lands inside it.
  const track = buildTrack(seed, banners, Math.min(5 * T + 4, 2 * MAX_ROWS + 8) + 8);
  const lastItem = input.lastItem || "";
  const reach = reachability(track, lastItem, banners.map(() => true));
  const { keyAt } = reach;
  const M = reach.deepest(T) + 1;
  const Tcap = Math.min(T, (M >> 1) + 2); // more rolls than this can't fit in M
  const cur = banners.map((b) => TICKET_INDEX[b.ticket]);
  const bound = upperBound(track, M, Tcap, targets);
  // Filler draws on normal tickets should stay on this banner when possible.
  const base = banners.findIndex((b) => b.id === input.baseBannerId && b.ticket === "normal");
  return { seed, lastItem, budget, banners, cur, targets, T, M, Tcap, bound, track, keyAt, base };
}

// bound(m, r): most appearances reachable from state m with r more rolls,
// relaxing ticket kinds and the last item (any banner, either result).
function upperBound(track, M, Tcap, targets) {
  // Every result possible at m, as flat [nextState, isTarget, ...] pairs.
  const results = (m) => {
    const out = [];
    for (const c of track.cells[m]) {
      out.push(m + 2, targets.has(c.item) ? 1 : 0);
      if (c.reroll) out.push(m + 2 + c.reroll.extra, targets.has(c.reroll.item) ? 1 : 0);
    }
    return out;
  };
  const W = Tcap + 1;
  if ((M + 1) * W <= BOUND_TABLE_LIMIT) {
    const UB = new Int16Array((M + 1) * W);
    for (let m = M - 1; m >= 0; m--) {
      const res = results(m);
      for (let r = 1; r <= Tcap; r++) {
        let top = 0;
        for (let k = 0; k < res.length; k += 2) {
          const v = res[k + 1] + (res[k] < M ? UB[res[k] * W + r - 1] : 0);
          if (v > top) top = v;
        }
        UB[m * W + r] = top;
      }
    }
    return (m, r) => UB[m * W + r];
  }
  // Huge inputs: unlimited rolls from m, capped by the rolls left (one item per
  // roll). Looser, but linear in depth.
  const inf = new Int32Array(M + 1);
  for (let m = M - 1; m >= 0; m--) {
    const res = results(m);
    let top = 0;
    for (let k = 0; k < res.length; k += 2) top = Math.max(top, res[k + 1] + (res[k] < M ? inf[res[k]] : 0));
    inf[m] = top;
  }
  return (m, r) => Math.min(r, inf[m]);
}

// One forward sweep. beam > 0 keeps only that many partial paths per
// (state, key) — fast, not guaranteed optimal. floor > 0 drops partial paths
// whose upper bound can't reach `floor` appearances.
export function sweep(P, { beam = 0, floor = 0, deadline = Infinity, maxLabels = Infinity, now = Date.now } = {}) {
  const { M, T, Tcap, bound, budget, cur, targets, track, keyAt, base } = P;
  const exactEase = beam === 0; // exact switch counting only in the exact sweep
  const G1 = budget[2] + 1;
  const buckets = new Array(M).fill(null);
  let ends = [];
  let created = 0;
  let completed = true;

  const insert = (m, key, lab) => {
    if (floor > 0 && lab.s + bound(m, Math.min(T - lab.n - lab.l - lab.g, Tcap)) < floor) return;
    let byKey = buckets[m];
    if (!byKey) buckets[m] = byKey = new Map();
    let byCell = byKey.get(key);
    if (!byCell) byKey.set(key, (byCell = new Map()));
    const ci = lab.l * G1 + lab.g;
    const list = byCell.get(ci);
    created++;
    if (!list) {
      byCell.set(ci, [lab]);
      return;
    }
    // Same (lucky, lucky G) usage: keep the (appearances, normal) Pareto front,
    // and on exact ties the easiest plans (see covers).
    for (const o of list) if (covers(o, lab, exactEase)) return;
    let w = 0;
    for (const o of list) if (!covers(lab, o, exactEase)) list[w++] = o;
    list.length = w;
    list.push(lab);
  };

  insert(0, keyAt(0, P.lastItem), { s: 0, n: 0, l: 0, g: 0, nb: 0, sg: 0, prev: null, m: -1, j: -1, rer: false, hit: false });

  let tick = 0;
  sweepLoop: for (let m = 0; m < M; m++) {
    const byKey = buckets[m];
    if (!byKey) continue;
    buckets[m] = null;
    const row = track.cells[m];
    for (const [key, byCell] of byKey) {
      let labs = [];
      for (const list of byCell.values()) for (const x of list) labs.push(x);
      if (beam && labs.length > beam) labs = pickBeam(labs, beam);
      for (const lab of labs) {
        if ((++tick & 1023) === 0 && (created > maxLabels || now() > deadline)) {
          completed = false;
          break sweepLoop;
        }
        if (lab.hit) {
          ends.push(lab);
          if (ends.length > 6000) ends = ends.sort(byRank).slice(0, 1500);
        }
        for (let j = 0; j < row.length; j++) {
          const c = cur[j];
          if ((c === 0 ? lab.n : c === 1 ? lab.l : lab.g) >= budget[c]) continue;
          const o = outcome(row[j], key);
          const m2 = m + o.advance;
          if (m2 >= M) continue;
          const hit = targets.has(o.item);
          insert(m2, keyAt(m2, o.item), {
            s: lab.s + (hit ? 1 : 0),
            n: lab.n + (c === 0 ? 1 : 0),
            l: lab.l + (c === 1 ? 1 : 0),
            g: lab.g + (c === 2 ? 1 : 0),
            nb: lab.nb + (c === 0 && j !== base ? 1 : 0),
            sg: lab.sg + (j !== lab.j ? 1 : 0),
            prev: lab, m, j, rer: o.rerolled, hit,
          });
        }
      }
    }
  }
  return { ends, created, completed };
}

// Half the beam by "save normal tickets", half by "save lucky tickets", so the
// beam doesn't burn one ticket kind early and starve later targets.
function pickBeam(labs, beam) {
  const half = beam >> 1;
  const a = labs.slice().sort(byValue);
  const b = labs.slice().sort(byLuckyFirst);
  const picked = new Set(a.slice(0, half));
  for (const x of b) {
    if (picked.size >= beam) break;
    picked.add(x);
  }
  for (const x of a) {
    if (picked.size >= beam) break;
    picked.add(x);
  }
  return [...picked];
}

// Best `topK` paths with distinct sets of collected appearances.
function rankPaths(P, ends, topK) {
  const sorted = ends.slice().sort((a, b) => byRank(a, b) || pathEnd(P, a) - pathEnd(P, b));
  const seen = new Set();
  const out = [];
  for (const e of sorted) {
    const hits = [];
    for (let x = e; x.prev; x = x.prev) if (x.hit) hits.push(`${x.m}.${x.j}.${x.rer ? 1 : 0}`);
    const sig = hits.join(",");
    if (seen.has(sig)) continue;
    seen.add(sig);
    out.push(toPath(P, e));
    if (out.length >= topK) break;
  }
  return out;
}

function pathEnd(P, lab) {
  const cell = P.track.cells[lab.m][lab.j];
  return lab.m + 2 + (lab.rer ? cell.reroll.extra : 0);
}

function toPath(P, lab) {
  const chain = [];
  for (let x = lab; x.prev; x = x.prev) chain.push(x);
  chain.reverse();
  const steps = chain.map((x) => {
    const cell = P.track.cells[x.m][x.j];
    const banner = P.banners[x.j];
    return {
      m: x.m,
      pos: positionLabel(x.m, x.rer),
      banner: banner.id,
      ticket: banner.ticket,
      item: x.rer ? cell.reroll.item : cell.item,
      rerolled: x.rer,
      hit: x.hit,
      next: x.m + 2 + (x.rer ? cell.reroll.extra : 0),
    };
  });
  const last = steps[steps.length - 1];
  return {
    appearances: lab.s,
    tickets: { normal: lab.n, lucky: lab.l, luckyG: lab.g },
    // How easy it is to follow: normal-ticket draws off the base banner, and
    // the number of runs of same-banner draws.
    ease: { offBase: lab.nb, runs: lab.sg },
    steps,
    end: { m: last.next, pos: positionLabel(last.next), seed: P.track.seeds[last.next], lastItem: last.item },
  };
}

// Re-simulate a path from scratch (independent of the search's bookkeeping):
// every step must start where the previous one ended and give the same item.
export function verifyPath(input, path) {
  const errors = [];
  let state = Number(input.seed) >>> 0;
  let m = 0;
  let last = input.lastItem || "";
  const used = { normal: 0, lucky: 0, luckyG: 0 };
  for (const [i, step] of path.steps.entries()) {
    const banner = BANNER_BY_ID[step.banner];
    if (!banner) return { ok: false, errors: [`step ${i + 1}: unknown banner ${step.banner}`] };
    while (m < step.m) {
      state = advance(state);
      m++;
    }
    if (m !== step.m) return { ok: false, errors: [`step ${i + 1}: starts at ${step.pos}, path is at ${positionLabel(m)}`] };
    const o = outcome(rollCell(state, banner), last);
    if (o.item !== step.item || o.rerolled !== step.rerolled) errors.push(`step ${i + 1} (${step.pos}): got ${o.item}, path says ${step.item}`);
    for (let k = 0; k < o.advance; k++) state = advance(state);
    m += o.advance;
    if (m !== step.next) errors.push(`step ${i + 1}: lands on ${positionLabel(m)}, path says ${positionLabel(step.next)}`);
    last = o.item;
    used[banner.ticket]++;
  }
  const t = input.tickets || {};
  for (const k of Object.keys(used)) if (used[k] > (Number(t[k]) || 0)) errors.push(`uses ${used[k]} ${k} tickets, only ${t[k] || 0} available`);
  if (path.end && (path.end.seed !== state || path.end.m !== m)) errors.push("end seed mismatch");
  return { ok: errors.length === 0, errors };
}

function result(P, input, ends, exact, stats, verify = true) {
  const paths = rankPaths(P, ends, stats.topK).map((p) => (verify ? { ...p, verified: verifyPath(input, p).ok } : p));
  return { paths, exact, stats };
}

// ---- Clean-up --------------------------------------------------------------
// When the search hits its limit (thousands of tickets), its paths have the
// right items and tickets but not always the easiest plan: say a Catseye detour
// that could be a Lucky Ticket draw, while an earlier lucky draw could have been
// on the base banner. polish() moves single draws to another banner when every
// other draw stays exactly as it was (it lands in the same place and the next
// draw rolls the same item, so the rest of the path can't change). A change is
// kept only if it makes the path strictly better by the ranking: same wanted
// items, then fewer normal tickets, fewer lucky + lucky G, fewer normal draws
// off the base banner, fewer banner switches. Two kinds of change:
//   - one draw to another banner (a detour onto the base banner, a normal draw
//     onto Lucky Ticket while lucky tickets are left, ...);
//   - a pair that trades ticket kinds: a normal draw becomes a lucky one and a
//     lucky draw elsewhere a normal one (a Catseye detour becomes a Lucky Ticket
//     draw, and an earlier lucky draw moves to Normal+).
// A proven-optimal best path has nothing left to fix.

// A move's change to the ranking key, packed into one small integer that sorts
// the same way: normal tickets (-1..1; lucky + lucky G always moves the other
// way), then normal draws off the base banner (-1..1), then banner runs (-2..2).
// Anything below NO_CHANGE is an improvement.
const moveCode = (dn, dOff, dRuns) => (dn + 1) * 15 + (dOff + 1) * 5 + dRuns + 2;
const NO_CHANGE = moveCode(0, 0, 0);

function polish(P, path) {
  const { track, banners, cur, base, targets, budget, lastItem } = P;
  const steps = path.steps.slice();
  const N = steps.length;
  const J = new Int8Array(N); // banner index of each draw
  const used = [0, 0, 0];
  for (let i = 0; i < N; i++) {
    J[i] = banners.findIndex((b) => b.id === steps[i].banner);
    used[cur[J[i]]]++;
  }
  const offBase = (j) => (cur[j] === 0 && j !== base ? 1 : 0);
  // Banner changes around draw i if it were on banner j.
  const edges = (i, j) => (i > 0 && J[i - 1] !== j ? 1 : 0) + (i + 1 < N && J[i + 1] !== j ? 1 : 0);

  // What draw i gives on banner j, or null if that would change any other draw.
  const tryMove = (i, j) => {
    const s = steps[i];
    if (s.hit || J[i] === j) return null;
    const o = outcome(track.cells[s.m][j], i ? steps[i - 1].item : lastItem);
    if (s.m + o.advance !== s.next || targets.has(o.item)) return null;
    const t = steps[i + 1];
    if (t) {
      const r = outcome(track.cells[t.m][J[i + 1]], o.item);
      if (r.item !== t.item || r.rerolled !== t.rerolled) return null;
    }
    return o;
  };
  // Best move of draw i onto a banner of ticket kind `kind`, or (kind -1) onto
  // any banner whose ticket kind still has tickets left.
  const bestMove = (i, kind) => {
    const j0 = J[i];
    let best = null;
    for (let j = 0; j < banners.length; j++) {
      const k = cur[j];
      if (kind >= 0 ? k !== kind : k !== cur[j0] && used[k] >= budget[k]) continue;
      const o = tryMove(i, j);
      if (!o) continue;
      const code = moveCode((k === 0) - (cur[j0] === 0), offBase(j) - offBase(j0), edges(i, j) - edges(i, j0));
      if (!best || code < best.code) best = { i, j, o, code };
    }
    return best;
  };

  // Draws next to a change get looked at again.
  let changes = 0;
  let touched = [];
  const queue = [];
  const queued = new Uint8Array(N);
  const touch = (i) => {
    for (let k = Math.max(0, i - 1); k <= Math.min(N - 1, i + 1); k++) {
      touched.push(k);
      if (!queued[k]) {
        queued[k] = 1;
        queue.push(k);
      }
    }
  };
  const apply = ({ i, j, o }) => {
    const b = banners[j];
    used[cur[J[i]]]--;
    used[cur[j]]++;
    J[i] = j;
    steps[i] = { ...steps[i], banner: b.id, ticket: b.ticket, item: o.item, rerolled: o.rerolled, pos: positionLabel(steps[i].m, o.rerolled) };
    changes++;
    touch(i);
  };
  const singles = () => {
    while (queue.length) {
      const i = queue.pop();
      queued[i] = 0;
      const m = bestMove(i, -1);
      if (m && m.code < NO_CHANGE) apply(m);
    }
  };
  for (let i = 0; i < N; i++) {
    queued[i] = 1;
    queue.push(i);
  }
  singles();

  // Pairs, per lucky ticket kind K: a K draw moves to a normal banner and a
  // normal draw (2+ steps away, so neither changes what the other relies on)
  // moves to a K banner. Ticket totals stay the same, so only [off base, runs]
  // change, each by a small integer: candidate moves sit in buckets by that
  // change (code % 15), and finding the best pair never rescans the path.
  for (const K of [1, 2]) {
    if (!cur.includes(K)) continue;
    // sides[0]: K draws -> a normal banner; sides[1]: normal draws -> a K banner.
    const sides = [[K, 0], [0, K]].map(([from, to]) => ({
      from, to, move: new Array(N).fill(null), buckets: Array.from({ length: 15 }, () => new Set()),
    }));
    const refresh = (i) => {
      for (const side of sides) {
        const old = side.move[i];
        if (old) side.buckets[old.code % 15].delete(i);
        const m = cur[J[i]] === side.from ? bestMove(i, side.to) : null;
        side.move[i] = m;
        if (m) side.buckets[m.code % 15].add(i);
      }
    };
    for (let i = 0; i < N; i++) refresh(i);
    touched = [];
    for (let guard = 0; guard < 4 * N; guard++) {
      const pair = bestPair(sides[0].buckets, sides[1].buckets);
      if (!pair) break;
      const [mx, my] = [sides[0].move[pair[0]], sides[1].move[pair[1]]];
      apply(mx);
      apply(my);
      singles();
      for (const k of touched) refresh(k);
      touched = [];
    }
  }

  if (!changes) return path;
  let runs = 0;
  let offBaseDraws = 0;
  for (let i = 0; i < N; i++) {
    if (i === 0 || J[i - 1] !== J[i]) runs++;
    offBaseDraws += offBase(J[i]);
  }
  return {
    ...path,
    steps,
    tickets: { normal: used[0], lucky: used[1], luckyG: used[2] },
    ease: { offBase: offBaseDraws, runs },
  };
}

// The best improving pair [x, y] from two sides' buckets (bucket = (off base
// change + 1) * 5 + runs change + 2): 2+ draws apart, smallest combined change.
// Null if no pair helps.
function bestPair(xb, yb) {
  let best = null;
  for (let bx = 0; bx < 15; bx++) {
    if (!xb[bx].size) continue;
    for (let by = 0; by < 15; by++) {
      if (!yb[by].size) continue;
      const off = Math.floor(bx / 5) + Math.floor(by / 5) - 2;
      const runs = (bx % 5) + (by % 5) - 4;
      if (off > 0 || (off === 0 && runs >= 0)) continue; // no better than now
      if (best && (off > best.off || (off === best.off && runs >= best.runs))) continue;
      const pair = farApart(xb[bx], yb[by]);
      if (pair) best = { pair, off, runs };
    }
  }
  return best && best.pair;
}

// Some x in X and y in Y at least 2 draws apart (a few of each are enough).
function farApart(X, Y) {
  let n = 0;
  for (const x of X) {
    let m = 0;
    for (const y of Y) {
      if (Math.abs(x - y) >= 2) return [x, y];
      if (++m === 4) break;
    }
    if (++n === 4) break;
  }
  return null;
}

// Polish the shown paths, re-check the changed (or never checked) ones from
// scratch, and re-rank: a polished path can overtake another.
function cleanUp(P, input, paths) {
  return paths
    .map((p) => {
      const q = polish(P, p);
      return q === p && p.verified !== undefined ? p : { ...q, verified: verifyPath(input, q).ok };
    })
    .sort((a, b) => byRank(toLabel(a), toLabel(b)));
}

// Anytime search. onUpdate(result) fires after the quick pass (and the wide
// one) so the UI can show a good answer immediately.
export function findPaths(input, options = {}) {
  const { timeBudgetMs, maxLabels, topK } = { ...DEFAULTS, ...options };
  const now = options.now || (() => (typeof performance !== "undefined" ? performance.now() : Date.now()));
  const onUpdate = options.onUpdate || (() => {});
  const t0 = now();
  const stats = (extra) => ({ topK, ms: Math.round(now() - t0), ...extra });

  const P = prepare(input);
  if (!P || P.bound(0, P.Tcap) === 0) return { paths: [], exact: true, stats: stats({ labels: 0 }) };
  const deadline = t0 + timeBudgetMs;
  // Beam widths shrink for very deep searches so the first answer stays quick.
  const work = P.M * 3 * P.banners.length;
  const quickBeam = clamp(Math.floor(3e6 / work), 2, 48);
  const wideBeam = clamp(Math.floor(3e7 / work), quickBeam, 600);

  const quick = sweep(P, { beam: quickBeam, deadline, now });
  let best = result(P, input, quick.ends, false, stats({ labels: quick.created, phase: "quick" }));
  onUpdate(best);

  const wide = sweep(P, { beam: wideBeam, deadline, now });
  const wideBest = result(P, input, wide.ends, false, stats({ labels: wide.created, phase: "wide" }));
  if (wideBest.paths.length && (!best.paths.length || byRank(toLabel(wideBest.paths[0]), toLabel(best.paths[0])) < 0)) {
    best = wideBest;
    onUpdate(best);
  }

  const floor = best.paths.length ? best.paths[0].appearances : 0;
  const exact = sweep(P, { floor, deadline, maxLabels, now });
  // The clean-up runs once, on the answer shown last, and checks what it
  // returns (options.polish: false skips it).
  const polishing = options.polish !== false;
  const found = exact.completed ? result(P, input, exact.ends, true, stats({}), !polishing) : best;
  const paths = polishing ? cleanUp(P, input, found.paths) : found.paths;
  return { paths, exact: exact.completed, stats: stats({ labels: exact.created, phase: exact.completed ? "exact" : "capped" }) };
}

const toLabel = (p) => ({
  s: p.appearances, n: p.tickets.normal, l: p.tickets.lucky, g: p.tickets.luckyG, nb: p.ease.offBase, sg: p.ease.runs,
});
