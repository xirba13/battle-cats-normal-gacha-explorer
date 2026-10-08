// The page link is the save file (same idea as the rare-gacha explorer): seed,
// last item, tickets, banners, wanted items and the open tab live in the URL
// hash, so bookmarking or sharing the link keeps everything. Nothing is stored
// anywhere else. Ids are [a-z0-9-] so the hash stays readable, e.g.
//   #s=2718281828&last=cat-energy&t=30.10.0&b=np,ce,lt&base=np&i=dark-catseye

import { BANNERS, BANNER_BY_ID, ITEMS, TICKET_KEYS } from "./engine/banners.js";

export const DEPTHS = ["auto", 50, 100, 200, 500, 999];
export const TABS = ["tracker", "help"];
export const MAX_TICKETS = 9999; // per ticket kind

export function emptyState() {
  return {
    seed: "",
    lastItem: "",
    tickets: { normal: 0, lucky: 0, luckyG: 0 },
    banners: [],
    base: "", // banner for filler draws on normal tickets ("" = default, "any" = fewest switches)
    save: "lucky", // tickets plans save first: "lucky" (and lucky G) or "normal"
    items: [],
    depth: "auto",
    tab: "tracker",
  };
}

const list = (s) => [...new Set((s || "").split(",").filter(Boolean))];
const known = (table, id) => Object.hasOwn(table, id); // own keys only, never Object.prototype's
const bannerOrder = (ids) => BANNERS.map((b) => b.id).filter((id) => ids.includes(id));

// Normal and Normal+ can't both be picked (user decision): ticking one unticks
// the other, and a link with both keeps Normal+.
export function toggleBanner(banners, id) {
  if (banners.includes(id)) return banners.filter((x) => x !== id);
  const rival = id === "n" ? "np" : id === "np" ? "n" : "";
  return [...banners.filter((x) => x !== rival), id];
}

export function parseSeed(text) {
  const digits = String(text ?? "").trim();
  if (!/^\d{1,10}$/.test(digits)) return "";
  const n = Number(digits);
  return n <= 0xffffffff ? String(n) : "";
}

export function parseHash(hash) {
  const p = new URLSearchParams(String(hash || "").replace(/^#/, ""));
  const st = emptyState();
  st.seed = parseSeed(p.get("s"));
  const last = p.get("last") || "";
  if (known(ITEMS, last)) st.lastItem = last;
  const t = (p.get("t") || "").split(".");
  TICKET_KEYS.forEach((k, i) => {
    const n = parseInt(t[i], 10);
    if (Number.isFinite(n) && n >= 0) st.tickets[k] = Math.min(n, MAX_TICKETS);
  });
  st.banners = bannerOrder(list(p.get("b")).filter((id) => known(BANNER_BY_ID, id)));
  if (st.banners.includes("np")) st.banners = st.banners.filter((id) => id !== "n"); // see toggleBanner
  const base = p.get("base") || "";
  if (base === "any" || (known(BANNER_BY_ID, base) && BANNER_BY_ID[base].ticket === "normal")) st.base = base;
  if (p.get("save") === "normal") st.save = "normal";
  st.items = list(p.get("i")).filter((id) => known(ITEMS, id));
  const d = Number(p.get("d"));
  if (DEPTHS.includes(d)) st.depth = d;
  const tab = p.get("tab");
  if (TABS.includes(tab)) st.tab = tab;
  return st;
}

export function buildHash(st) {
  const parts = [];
  if (st.seed) parts.push(`s=${st.seed}`);
  if (st.lastItem) parts.push(`last=${st.lastItem}`);
  parts.push(`t=${TICKET_KEYS.map((k) => st.tickets[k] || 0).join(".")}`);
  if (st.banners.length) parts.push(`b=${bannerOrder(st.banners).join(",")}`);
  if (st.base) parts.push(`base=${st.base}`);
  if (st.save === "normal") parts.push("save=normal");
  if (st.items.length) parts.push(`i=${st.items.join(",")}`);
  if (st.depth !== "auto") parts.push(`d=${st.depth}`);
  if (st.tab !== "tracker") parts.push(`tab=${st.tab}`);
  return `#${parts.join("&")}`;
}

export function clampTickets(n) {
  return Math.min(MAX_TICKETS, Math.max(0, Math.floor(Number(n) || 0)));
}
