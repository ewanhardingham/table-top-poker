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
    const html = render("Peeking");

    expect(html).toContain("hole-card-curl-index");
    expect(html).toMatch(/hole-card-curl-index[^>]*left:0\.235em/);
    expect(html).toMatch(/hole-card-curl-index[^>]*bottom:0\.21em/);
  });

  it("keeps the remapped index off the class the flap rule suppresses", () => {
    const html = render("Peeking");
    const curl = /<span class="([^"]*hole-card-curl-index[^"]*)"/.exec(html);

    expect(curl).not.toBeNull();
    expect(curl?.[1]).not.toMatch(/\bcard-index\b/);
    expect(html).toMatch(/<div class="peel-back[\s\S]*?class="card-index/);
  });

  it("suppresses the flap's inline display, not merely a class", () => {
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
    expect((html.match(/class="card-index/g) ?? []).length).toBe(2);
  });

  describe("leaving for the muck", () => {
    it("flies away face-up when that is the face it had", () => {
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
