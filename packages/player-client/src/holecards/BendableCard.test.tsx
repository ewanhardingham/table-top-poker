import type { Card } from "@table-top-poker/protocol";
import { motionValue } from "motion/react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { BendableCard } from "./BendableCard.js";

const appShellCss = readFileSync(
  new URL("../app-shell.css", import.meta.url),
  "utf8",
);

const queen: Card = { rank: "Q", suit: "diamonds" };

function render(
  presentation: "FaceDown" | "Peeking" | "Turning" | "Revealed" | "Leaving",
  leavingFaceUp = false,
) {
  return renderToStaticMarkup(
    <BendableCard
      card={queen}
      presentation={presentation}
      bend={motionValue(0)}
      tiltDegrees={0}
      leavingFaceUp={leavingFaceUp}
    />,
  );
}

describe("BendableCard", () => {
  it("carries no rank or suit at all while face down", () => {
    const html = render("FaceDown");

    expect(html).toContain('data-face-down="true"');
    expect(html).not.toContain("data-rank");
  });

  it("puts an index where the curl actually uncovers it", () => {
    // `react-peel` pins the back layer by the *horizontally flipped* corner, so
    // a bottom-right peel uncovers the face's bottom-left — where an ordinary
    // card carries no ink. Without this remapped copy a bend shows bare white
    // card, which is precisely the bug this asserts against.
    const html = render("Peeking");

    expect(html).toContain("hole-card-curl-index");
    expect(html).toMatch(/hole-card-curl-index[^>]*left:0\.235em/);
    expect(html).toMatch(/hole-card-curl-index[^>]*bottom:0\.21em/);
  });

  it("keeps the remapped index off the class the flap rule suppresses", () => {
    // `.peel-back .card-index { display: none }` in `app-shell.css` hides the
    // face's own corner indices on the lifted sheet, so that the rank is not
    // printed twice on it. The remapped index must not answer to that
    // selector — if it ever did, the flap would go blank again.
    const html = render("Peeking");
    const curl = /<span class="([^"]*hole-card-curl-index[^"]*)"/.exec(html);

    expect(curl).not.toBeNull();
    expect(curl?.[1]).not.toMatch(/\bcard-index\b/);
    // And the face's own indices really are in the flap, for the rule to bite.
    expect(html).toMatch(/<div class="peel-back[\s\S]*?class="card-index/);
  });

  it("suppresses the flap's inline display, not merely a class", () => {
    // These tests render to static markup, so no stylesheet is ever applied
    // and the rule cannot be observed working. What *can* be checked is the
    // thing that made an earlier attempt fail silently: `Card` sets `display`
    // inline, so an ordinary declaration loses to it however specific the
    // selector, and only `!important` actually suppresses the index.
    expect(render("Peeking")).toMatch(
      /class="card-index[^"]*"[^>]*display:flex/,
    );
    expect(appShellCss).toMatch(
      /\.peel-back \.card-index\s*\{\s*display:\s*none\s*!important/,
    );
  });

  it("drops the curl index once the card lies flat and face up", () => {
    const html = render("Revealed");

    expect(html).not.toContain("hole-card-curl-index");
    expect(html).toContain('data-rank="Q"');
    // The flat card keeps both its printed corners: the rule above is scoped
    // to the flap, and must not have reached the ordinary face.
    expect((html.match(/class="card-index/g) ?? []).length).toBe(2);
  });

  describe("leaving for the muck", () => {
    it("flies away face-up when that is the face it had", () => {
      // Flipping face-down inside a 280ms departure is illegible motion, and
      // the privacy boundary is the physical table rather than the flight (§7).
      const html = render("Leaving", true);

      expect(html).toContain('data-rank="Q"');
      expect(html).not.toContain('data-face-down="true"');
    });

    it("flies away face-down when that is the face it had", () => {
      const html = render("Leaving", false);

      expect(html).toContain('data-face-down="true"');
      expect(html).not.toContain("data-rank");
    });

    it("offers no bend affordance on the way out — the pair is inert", () => {
      for (const faceUp of [true, false]) {
        expect(render("Leaving", faceUp)).not.toContain("data-bend-zone");
      }
    });
  });
});
