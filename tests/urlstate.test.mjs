// The URL hash is the save file: it must round-trip and shrug off junk.
import { test } from "node:test";
import assert from "node:assert/strict";

import { buildHash, clampTickets, emptyState, parseHash, parseSeed } from "../src/urlstate.js";

test("state round-trips through the hash", () => {
  const st = {
    ...emptyState(),
    seed: "3141592653",
    lastItem: "cat-energy",
    tickets: { normal: 30, lucky: 10, luckyG: 2 },
    banners: ["ce", "lt"],
    base: "ce",
    items: ["dark-catseye", "100k-xp-beta"],
    depth: 200,
    tab: "help",
  };
  const hash = buildHash(st);
  assert.equal(hash, "#s=3141592653&last=cat-energy&t=30.10.2&b=ce,lt&base=ce&i=dark-catseye,100k-xp-beta&d=200&tab=help");
  assert.deepEqual(parseHash(hash), st);
});

test("an empty hash gives the defaults, and defaults stay out of the hash", () => {
  assert.deepEqual(parseHash(""), emptyState());
  assert.equal(buildHash(emptyState()), "#t=0.0.0");
});

test("junk is dropped instead of breaking the page", () => {
  const st = parseHash("#s=99999999999&last=not-an-item&t=-3.x.7&b=zz,lt,ce,lt&i=dark-catseye,nope&d=123&tab=admin");
  assert.equal(st.seed, "");
  assert.equal(st.lastItem, "");
  assert.deepEqual(st.tickets, { normal: 0, lucky: 0, luckyG: 7 });
  assert.deepEqual(st.banners, ["ce", "lt"]); // known only, deduped, in banner order
  assert.deepEqual(st.items, ["dark-catseye"]);
  assert.equal(st.depth, "auto");
  assert.equal(st.tab, "tracker");
});

test("the base banner must be a normal-ticket banner, or 'any'", () => {
  assert.equal(parseHash("#base=np").base, "np");
  assert.equal(parseHash("#base=any").base, "any");
  assert.equal(buildHash({ ...emptyState(), base: "any" }), "#t=0.0.0&base=any");
  assert.equal(parseHash("#base=lt").base, ""); // lucky tickets have their own banner
  assert.equal(parseHash("#base=__proto__").base, "");
  assert.equal(parseHash("#base=nope").base, "");
});

test("JavaScript's built-in object keys aren't accepted as items or banners", () => {
  const st = parseHash("#last=constructor&i=__proto__,toString,hasOwnProperty,dark-catseye&b=constructor,__proto__,ce");
  assert.equal(st.lastItem, "");
  assert.deepEqual(st.items, ["dark-catseye"]);
  assert.deepEqual(st.banners, ["ce"]);
  assert.equal(parseHash("#last=__proto__").lastItem, "");
});

test("every ticket kind accepts up to 9,999", () => {
  assert.deepEqual(parseHash("#t=9999.9999.9999").tickets, { normal: 9999, lucky: 9999, luckyG: 9999 });
  assert.deepEqual(parseHash("#t=12000.10000.99999").tickets, { normal: 9999, lucky: 9999, luckyG: 9999 });
  assert.equal(clampTickets(1e9), 9999);
  assert.equal(clampTickets(-5), 0);
  assert.equal(clampTickets("abc"), 0);
});

test("seeds are unsigned 32-bit", () => {
  assert.equal(parseSeed("4294967295"), "4294967295");
  assert.equal(parseSeed("4294967296"), "");
  assert.equal(parseSeed(" 0042 "), "42");
  assert.equal(parseSeed("12a"), "");
});
