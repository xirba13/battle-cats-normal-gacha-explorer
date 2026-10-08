// Normal-gacha banners. All six share ONE seed (independent from the rare
// gacha's), so rolling any of them advances the same track. Each banner is paid
// with exactly one kind of ticket:
//   Normal, Normal+, Catfruit, Catseye -> normal tickets
//   Lucky Ticket                       -> lucky tickets
//   Lucky Ticket G                     -> lucky tickets G
//
// A roll picks a tier by `raritySeed % 10000` against the cumulative rates, then
// an item by `slotSeed % items.length` (repeated entries = higher odds). Only
// tiers with `reroll: true` re-pick when you'd get the same item twice in a row.
//
// Pool contents/rates as published by ampuri's normal seed tracker (pools last
// changed there in Nov 2023). If the game adds an item to a pool, every result
// after it shifts — re-check the in-game rate screens after big updates.
// Item names match ampuri's exactly (its `lastCat` URL parameter uses them).

export const DATA_SOURCE = "ampuri.github.io/bc-normal-seed-tracking (pools as of 2023-11)";

export const TICKETS = {
  normal: { label: "Normal tickets", short: "normal" },
  lucky: { label: "Lucky tickets", short: "lucky" },
  luckyG: { label: "Lucky tickets G", short: "lucky G" },
};
export const TICKET_KEYS = ["normal", "lucky", "luckyG"];

// Some draws give more than the item: each cat is NP (npPerCat below: 1 on
// Normal, 2 on Normal+, 1 for a Li'l cat on Lucky Ticket), and every 5 base
// upgrades from Normal / Normal+ are a Rare Ticket.
const BASIC_CATS = ["Cat", "Tank Cat", "Axe Cat", "Gross Cat", "Cow Cat", "Bird Cat", "Fish Cat", "Lizard Cat", "Titan Cat"];
const LIL_CATS = ["Li'l Titan Cat", "Li'l Lizard Cat", "Li'l Fish Cat", "Li'l Bird Cat", "Li'l Cow Cat", "Li'l Gross Cat",
  "Li'l Axe Cat", "Li'l Tank Cat", "Li'l Cat"];
const CATS = [...BASIC_CATS, "Superfeline", ...LIL_CATS];
const UPGRADES = ["Cat Cannon Attack", "Cat Cannon Charge", "Worker Cat Rate", "Worker Cat Wallet", "Base Defense", "Research", "Accounting", "Study", "Cat Energy"];

const RAW_BANNERS = [
  {
    id: "n", name: "Normal", ticket: "normal", npPerCat: 1,
    tiers: [{ rarity: "common", rate: 10000, reroll: true, items: [...BASIC_CATS, ...UPGRADES] }],
  },
  {
    id: "np", name: "Normal+", ticket: "normal", npPerCat: 2,
    tiers: [{ rarity: "common", rate: 10000, reroll: true, items: [...BASIC_CATS, "Superfeline", ...UPGRADES] }],
  },
  {
    id: "cf", name: "Catfruit", ticket: "normal",
    tiers: [
      { rarity: "common", rate: 400, reroll: false, items: ["5K XP"] },
      {
        rarity: "rare", rate: 2000, reroll: true,
        items: ["Speed Up", "Cat CPU", "10K XP", "30K XP", "50K XP", "Purple Catfruit Seed", "Red Catfruit Seed",
          "Blue Catfruit Seed", "Green Catfruit Seed", "Yellow Catfruit Seed"],
      },
      {
        rarity: "super", rate: 7000, reroll: false,
        items: ["Rich Cat", "Cat Jobs", "Sniper the Cat", "100K XP", "200K XP", "Purple Catfruit", "Red Catfruit",
          "Blue Catfruit", "Green Catfruit", "Yellow Catfruit"],
      },
      { rarity: "uber", rate: 600, reroll: false, items: ["Treasure Radar", "500K XP", "Epic Catfruit"] },
    ],
  },
  {
    id: "ce", name: "Catseye", ticket: "normal",
    tiers: [
      { rarity: "common", rate: 500, reroll: false, items: ["5K XP"] },
      { rarity: "rare", rate: 6900, reroll: true, items: ["10K XP", "30K XP", "Special Catseye", "Rare Catseye"] },
      { rarity: "super", rate: 2000, reroll: false, items: ["100K XP", "Super Rare Catseye"] },
      { rarity: "uber", rate: 500, reroll: false, items: ["Uber Rare Catseye"] },
      { rarity: "legend", rate: 100, reroll: false, items: ["Dark Catseye"] },
    ],
  },
  {
    id: "lt", name: "Lucky Ticket", ticket: "lucky", npPerCat: 1,
    tiers: [
      {
        rarity: "rare", rate: 7400, reroll: true,
        items: [...LIL_CATS, "Speed Up", "Speed Up", "Speed Up", "Cat CPU", "Cat CPU",
          "10K XP", "10K XP", "10K XP", "30K XP", "30K XP", "30K XP"],
      },
      { rarity: "super", rate: 2100, reroll: false, items: ["Rich Cat", "Cat Jobs", "Sniper the Cat"] },
      { rarity: "uber", rate: 500, reroll: false, items: ["Treasure Radar"] },
    ],
  },
  {
    id: "ltg", name: "Lucky Ticket G", ticket: "luckyG",
    tiers: [
      // "100K XP (β)" has a different item id from the 100K XP of other banners,
      // so it never counts as a dupe of it.
      { rarity: "rare", rate: 5100, reroll: true, items: ["Catamin A", "Catamin A", "Catamin A", "100K XP (β)", "100K XP (β)", "100K XP (β)"] },
      { rarity: "super", rate: 3500, reroll: false, items: ["Catamin B", "Catamin B", "Catamin B", "500K XP"] },
      { rarity: "uber", rate: 1400, reroll: false, items: ["Catamin C", "Catamin C", "Catamin C", "1M XP"] },
    ],
  },
];

// Stable URL-safe id per item name ("Li'l Cat" -> "lil-cat", "100K XP (β)" -> "100k-xp-beta").
export function itemId(name) {
  return name
    .toLowerCase()
    .replace(/β/g, "beta")
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function finish(raw) {
  let cum = 0;
  const tiers = raw.tiers.map((t) => {
    cum += t.rate;
    return { ...t, items: t.items.map(itemId), cum };
  });
  if (cum !== 10000) throw new Error(`${raw.id}: tier rates sum to ${cum}, expected 10000`);
  return { id: raw.id, name: raw.name, ticket: raw.ticket, npPerCat: raw.npPerCat ?? 0, tiers, cum: tiers.map((t) => t.cum) };
}

export const BANNERS = RAW_BANNERS.map(finish);
// Lookup tables have no prototype, so ids from a link like "constructor" or
// "__proto__" are simply unknown instead of hitting Object.prototype.
export const BANNER_BY_ID = Object.assign(Object.create(null), Object.fromEntries(BANNERS.map((b) => [b.id, b])));

export const UPGRADES_PER_RARE_TICKET = 5;

// Every distinct item: id -> { id, name, kind } (kind: "cat" / "upgrade" for
// the Normal / Normal+ ones, "item" for everything else).
export const ITEMS = Object.create(null);
for (const raw of RAW_BANNERS) {
  for (const tier of raw.tiers) {
    for (const name of tier.items) {
      const id = itemId(name);
      if (!ITEMS[id]) ITEMS[id] = { id, name, kind: UPGRADES.includes(name) ? "upgrade" : CATS.includes(name) ? "cat" : "item" };
    }
  }
}

export const itemName = (id) => ITEMS[id]?.name ?? id;

// Per-banner item list for pickers: rarest tier first, each item with its
// per-roll chance on that banner (repeated entries add up).
export function bannerItems(banner) {
  const out = [];
  for (const tier of [...banner.tiers].reverse()) {
    const counts = new Map();
    for (const id of tier.items) counts.set(id, (counts.get(id) || 0) + 1);
    for (const [id, n] of counts) {
      out.push({ id, rarity: tier.rarity, chance: (tier.rate * n) / tier.items.length / 100 });
    }
  }
  return out;
}
