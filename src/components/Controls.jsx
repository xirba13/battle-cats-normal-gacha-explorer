import React, { useEffect, useState } from "react";
import { BANNERS, ITEMS, TICKETS, TICKET_KEYS, bannerItems } from "../engine/banners.js";
import { MAX_TICKETS, clampTickets, parseSeed } from "../urlstate.js";

// Each item once, under the first banner that has it (for the last-item menu).
const LAST_ITEM_GROUPS = (() => {
  const seen = new Set();
  return BANNERS.map((b) => ({
    banner: b,
    items: bannerItems(b)
      .map((x) => x.id)
      .filter((id) => !seen.has(id) && seen.add(id))
      .sort((a, b) => ITEMS[a].name.localeCompare(ITEMS[b].name)),
  })).filter((g) => g.items.length);
})();

export default function Controls({ st, update }) {
  // Keep the typed text separate so a half-typed seed isn't rejected mid-typing.
  const [seedText, setSeedText] = useState(st.seed);
  useEffect(() => setSeedText(st.seed), [st.seed]);

  return (
    <div className="controls">
      <label className="field seed">
        <span>Normal-gacha seed</span>
        <input
          inputMode="numeric"
          value={seedText}
          placeholder="e.g. 2718281828"
          onChange={(e) => {
            const text = e.target.value.replace(/\D/g, "");
            setSeedText(text);
            const seed = parseSeed(text);
            if (seed || text === "") update({ seed });
          }}
        />
      </label>
      <label className="field last">
        <span>Last item you rolled</span>
        <select value={st.lastItem} onChange={(e) => update({ lastItem: e.target.value })}>
          <option value="">— none / not sure —</option>
          {LAST_ITEM_GROUPS.map(({ banner, items }) => (
            <optgroup key={banner.id} label={banner.name}>
              {items.map((id) => (
                <option key={id} value={id}>{ITEMS[id].name}</option>
              ))}
            </optgroup>
          ))}
        </select>
      </label>
      <div className="tickets">
        {TICKET_KEYS.map((k) => (
          <label key={k} className="field ticket">
            <span>
              <i className={`ticket-dot t-${k}`} /> {TICKETS[k].label}
            </span>
            <input
              type="number"
              min="0"
              max={MAX_TICKETS}
              value={st.tickets[k]}
              onChange={(e) => update((s) => ({ tickets: { ...s.tickets, [k]: clampTickets(e.target.value) } }))}
            />
          </label>
        ))}
      </div>
    </div>
  );
}
