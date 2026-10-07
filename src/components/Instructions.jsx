import React from "react";
import { DATA_SOURCE } from "../engine/banners.js";

const AMPURI = "https://ampuri.github.io/bc-normal-seed-tracking/";

export default function Instructions() {
  return (
    <div className="instructions">
      <h2>How it works</h2>
      <p className="notice">
        ⚠️ Experimental. Every path is re-simulated before it's shown, but check it on{" "}
        <a href={AMPURI} target="_blank" rel="noreferrer">ampuri's tracker</a> before spending tickets.
      </p>

      <h3>Before you start</h3>
      <ul>
        <li>
          <b>The normal gacha has its own seed</b>, separate from the rare gacha's. If you don't know it, find it
          with <a href={`${AMPURI}#/finder`} target="_blank" rel="noreferrer">ampuri's seed finder</a>.
        </li>
        <li>
          <b>All six banners share that seed:</b> rolling any of them moves the same track forward.
        </li>
        <li>
          <b>Each banner uses one kind of ticket:</b> Normal, Normal+, Catfruit and Catseye use normal tickets;
          Lucky Ticket uses lucky tickets; Lucky Ticket G uses lucky tickets G.
        </li>
        <li>
          <b>Last item you rolled</b> matters: if your next roll would give the same item again (on most common
          tiers), the game rerolls it and you switch track. Pick "none / not sure" if you don't know — only the
          very first roll can differ.
        </li>
      </ul>

      <h3>Using the tracker</h3>
      <ol>
        <li>Enter your <b>seed</b>, <b>last item</b> and how many <b>tickets</b> of each kind you have.</li>
        <li>
          <b>Banners:</b> tick the ones that are open in-game right now. With more than one normal-ticket banner,
          pick your <b>base banner</b> (e.g. Normal+): draws that just move you forward stay on it, and other banners
          are used only when that gets you more items or saves tickets. Pick <b>“Any”</b> instead for the plan with
          the fewest banner switches.
        </li>
        <li><b>Items:</b> tick what you want (e.g. Dark Catseye, Uber Rare Catseye, Catamin C).</li>
        <li>
          <b>Results:</b> where each item appears within reach of your tickets (e.g. 22A, 56B, 105AR), and the best
          paths. Each path starts with a short <b>plan</b> — how many draws to do on each banner, in order, e.g.
          “10× Normal+ → 1× Lucky Ticket → 9× Normal+ → 1× Catseye 🎯 Dark Catseye”. Pick a path to see which
          appearances it gets (green) and which it skips (struck through).
        </li>
        <li><b>Track table:</b> the selected path is shaded; the striped position is where you'll be after it.</li>
        <li>
          Roll the path in-game, then click <b>“I followed this path”</b>: your seed and last item are filled in and
          the tickets are subtracted. Rolled something else? Click the item you got in the table to move there.
        </li>
      </ol>

      <h3>How paths are ranked</h3>
      <ul>
        <li><b>Most appearances wins</b> — every copy counts (three Dark Catseyes = 3).</li>
        <li>Ties go to the path using <b>fewer normal tickets</b>, then fewer lucky + lucky G tickets combined.</li>
        <li>
          If paths are still equal, the <b>easiest to follow</b> wins: the most normal-ticket draws on your base
          banner, then the fewest banner switches. This never costs you an item or a ticket.
        </li>
        <li>A path ends at its last wanted item; it never spends tickets after that.</li>
        <li>
          Usually the result is proven optimal in well under a second. With lots of all three ticket kinds at once,
          the search stops after a few seconds and says so; the paths shown are still valid, just not proven best.
        </li>
      </ul>

      <h3>Reading the table</h3>
      <ul>
        <li>
          Track A is on the left, track B on the right, half a roll lower. A normal roll moves you one row down on
          the same track.
        </li>
        <li>
          A <b>dupe</b> line (e.g. “dupe Special Catseye → 13B”) is what that cell gives if your previous item was
          the same, and where you jump. An odd number of rerolls switches track; an <b>R</b> on a position (25AR)
          means its rerolled result. The dupe line is only shown when some sequence of rolls can actually get you
          there — including from a different banner, since your last item carries over.
        </li>
        <li>
          The table goes as deep as your tickets can reach (“All my tickets”; each ticket kind takes up to 9,999).
          Pick a smaller number of rows if you only want to look at the start.
        </li>
        <li>Faded cells are beyond what your tickets can reach.</li>
      </ul>

      <h3>Your data</h3>
      <p>
        Nothing is stored on any server — there isn't one. Everything you enter lives in the page link, so bookmark
        it to keep your seed, tickets and picks.
      </p>

      <h3>Credits</h3>
      <ul>
        <li>
          <a href="https://bc.godfat.org/help" target="_blank" rel="noreferrer">godfat</a> — the seed-tracking
          format and the reroll rules this follows.
        </li>
        <li>
          <a href={AMPURI} target="_blank" rel="noreferrer">ampuri</a> — the normal-gacha tracker this was checked
          against, and the banner pool data ({DATA_SOURCE}).
        </li>
        <li>
          <a href="https://www.reddit.com/user/JulietCat/" target="_blank" rel="noreferrer">/u/JulietCat</a> — the
          original research on how the seed works and the normal gacha's rarity tables.
        </li>
      </ul>
    </div>
  );
}
