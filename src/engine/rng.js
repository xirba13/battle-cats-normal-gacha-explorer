// The game's gacha RNG: 32-bit xorshift (13, 17, 15) on an unsigned seed — the
// same generator godfat documents for the rare gacha. A roll consumes two steps
// (rarity, then slot); each dupe re-pick consumes one more (a "half roll").
export function advance(seed) {
  let s = seed >>> 0;
  s ^= s << 13;
  s >>>= 0;
  s ^= s >>> 17;
  s ^= s << 15;
  return s >>> 0;
}

// seeds[0] = seed, seeds[i] = seed advanced i times.
export function seedSequence(seed, count) {
  const seeds = new Uint32Array(count);
  seeds[0] = seed >>> 0;
  for (let i = 1; i < count; i++) seeds[i] = advance(seeds[i - 1]);
  return seeds;
}
