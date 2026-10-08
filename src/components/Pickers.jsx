import React from "react";
import { BANNERS, TICKETS, bannerItems, itemName } from "../engine/banners.js";
import { baseBannerId, formatChance } from "../derive.js";
import { toggleBanner } from "../urlstate.js";

export function TicketBadge({ kind }) {
  return <span className={`ticket-badge t-${kind}`}>{TICKETS[kind].short}</span>;
}

export function BannerPicker({ st, update }) {
  const toggle = (id) => update((s) => ({ banners: toggleBanner(s.banners, id) }));
  const normalBanners = BANNERS.filter((b) => b.ticket === "normal" && st.banners.includes(b.id));
  const luckyBanners = BANNERS.filter((b) => b.ticket !== "normal" && st.banners.includes(b.id));
  return (
    <section className="panel">
      <h3><span className="step">1</span> Banners you can roll</h3>
      <div className="chips">
        {BANNERS.map((b) => {
          const on = st.banners.includes(b.id);
          return (
            <label key={b.id} className={`chip ${on ? "on" : ""}`}>
              <input type="checkbox" checked={on} onChange={() => toggle(b.id)} />
              {b.name} <TicketBadge kind={b.ticket} />
              {on && !st.tickets[b.ticket] && <span className="warn small"> — 0 {TICKETS[b.ticket].short} tickets</span>}
            </label>
          );
        })}
      </div>
      <p className="muted small">Normal and Normal+ can't both be picked: ticking one unticks the other.</p>
      {normalBanners.length > 1 && (
        <label className="base-pick">
          Base banner for normal tickets
          <select value={st.base === "any" ? "any" : baseBannerId(st)} onChange={(e) => update({ base: e.target.value })}>
            {normalBanners.map((b) => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
            <option value="any">Any — fewest banner switches</option>
          </select>
          <span className="muted small">
            {st.base === "any"
              ? "Plans switch banners as little as possible."
              : "Draws that just move you forward stay on it; other banners only when that gets more items or saves tickets."}
          </span>
        </label>
      )}
      {normalBanners.length > 0 && luckyBanners.length > 0 && (
        <label className="base-pick">
          Save first
          <select value={st.save} onChange={(e) => update({ save: e.target.value })}>
            <option value="lucky">Lucky tickets</option>
            <option value="normal">Normal tickets</option>
          </select>
          <span className="muted small">
            {st.save === "normal"
              ? "Plans spend lucky tickets first, and normal tickets only where they're needed."
              : "Plans spend normal tickets first, and lucky tickets only where they're needed."}
          </span>
        </label>
      )}
    </section>
  );
}

export function ItemPicker({ st, update, banners }) {
  if (!banners.length) return null;
  const wanted = new Set(st.items);
  const toggle = (id) =>
    update((s) => ({ items: s.items.includes(id) ? s.items.filter((x) => x !== id) : [...s.items, id] }));
  return (
    <section className="panel">
      <h3>
        <span className="step">2</span> Items you want
        <span className="muted small"> {wanted.size} selected</span>
        {wanted.size > 0 && <button className="small link" onClick={() => update({ items: [] })}>clear</button>}
      </h3>
      <p className="muted small">Rarest first, with the chance per roll on that banner. An item ticked in one banner counts on every banner that has it.</p>
      <div className="item-groups">
        {banners.map((b) => (
          <div key={b.id} className="item-group">
            <h4>{b.name} <TicketBadge kind={b.ticket} /></h4>
            {bannerItems(b).map(({ id, rarity, chance }) => (
              <label key={id} className={`item-option r-${rarity}`}>
                <input type="checkbox" checked={wanted.has(id)} onChange={() => toggle(id)} />
                <span className="swatch" />
                <span className="name">{itemName(id)}</span>
                <span className="muted small">{formatChance(chance)}</span>
              </label>
            ))}
          </div>
        ))}
      </div>
    </section>
  );
}
