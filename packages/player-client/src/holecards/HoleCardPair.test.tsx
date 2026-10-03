import type { Card } from "@table-top-poker/protocol";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { selectHint } from "./coaching.js";
import { HintBlock, HoleCardPair } from "./HoleCardPair.js";
import type { CardActions } from "./ports.js";

const actions: CardActions = {
  foldLegal: true,
  checkLegal: true,
  showdownOpen: false,
  showLegal: false,
  muckLegal: false,
  pending: false,
  fold: () => undefined,
  muck: () => undefined,
  check: () => undefined,
  show: () => undefined,
};

const queenJack: readonly [Card, Card] = [
  { rank: "Q", suit: "diamonds" },
  { rank: "J", suit: "clubs" },
];

describe("HoleCardPair", () => {
  it("deals in face-down, with no rank or suit anywhere in the document", () => {
    const html = renderToStaticMarkup(
      <HoleCardPair
        cards={queenJack}
        locked={false}
        sealed={false}
        actions={actions}
      />,
    );

    expect(html).toMatch(/data-testid="hole-cards"/);
    expect(html).toContain('data-presentation="FaceDown"');
    expect((html.match(/data-face-down="true"/g) ?? []).length).toBe(2);
    expect(html).not.toContain("data-rank");
  });

  it("renders as a real focusable button with an accessible name", () => {
    const html = renderToStaticMarkup(
      <HoleCardPair
        cards={queenJack}
        locked={false}
        sealed={false}
        actions={actions}
      />,
    );

    expect(html).toMatch(/<button [^>]*type="button"/);
    expect(html).toContain(
      'aria-label="Your hole cards, face down. Activate to reveal them."',
    );
  });

  it("names the cards for a screen reader once they are revealed", () => {
    const html = renderToStaticMarkup(
      <HoleCardPair
        cards={queenJack}
        locked
        sealed={false}
        actions={actions}
      />,
    );

    expect(html).toContain(
      'aria-label="Your hole cards, Queen of diamonds and Jack of clubs"',
    );
  });

  it("renders a locked pair face-up and inert", () => {
    const html = renderToStaticMarkup(
      <HoleCardPair
        cards={queenJack}
        locked
        sealed={false}
        actions={actions}
      />,
    );

    expect(html).toContain('data-presentation="Revealed"');
    expect(html).toContain('data-rank="Q"');
    expect(html).toContain('data-rank="J"');
    expect((html.match(/data-face-down="false"/g) ?? []).length).toBe(2);
    expect(html).toContain('aria-disabled="true"');
    expect(html).not.toMatch(/<button[^>]*\sdisabled/);
  });

  it("renders the Absent presentation and no card pair for a seat holding nothing", () => {
    const html = renderToStaticMarkup(
      <HoleCardPair
        cards={null}
        locked={false}
        sealed={false}
        actions={actions}
      />,
    );

    expect(html).toMatch(/data-testid="no-hole-cards"/);
    expect(html).not.toMatch(/data-testid="hole-cards"/);
    expect(html).not.toContain("data-rank");
    expect(html).not.toContain("<button");
  });

  it("carries the bend affordance on both cards", () => {
    const html = renderToStaticMarkup(
      <HoleCardPair
        cards={queenJack}
        locked={false}
        sealed={false}
        actions={actions}
      />,
    );

    expect((html.match(/data-bend-zone="true"/g) ?? []).length).toBe(2);
  });

  it("does not offer the bend affordance on a locked pair", () => {
    const html = renderToStaticMarkup(
      <HoleCardPair
        cards={queenJack}
        locked
        sealed={false}
        actions={actions}
      />,
    );

    expect(html).not.toContain("data-bend-zone");
  });

  it("takes the whole gesture from the browser, so a drag is never a pan and a double-tap never a zoom", () => {
    const html = renderToStaticMarkup(
      <HoleCardPair
        cards={queenJack}
        locked={false}
        sealed={false}
        actions={actions}
      />,
    );

    expect(html).toContain("touch-action:none");
    expect(html).toContain("-webkit-touch-callout:none");
    expect(html).toContain("user-select:none");
    expect(html).toContain("-webkit-tap-highlight-color:transparent");
  });

  it("renders no hint while the pair is settled", () => {
    const html = renderToStaticMarkup(
      <HoleCardPair
        cards={queenJack}
        locked={false}
        sealed={false}
        actions={actions}
      />,
    );

    expect(html).not.toContain('data-testid="hole-cards-hint"');
  });

  it("stamps no Check confirmation over a pair that has not just checked", () => {
    const html = renderToStaticMarkup(
      <HoleCardPair
        cards={queenJack}
        locked={false}
        sealed={false}
        actions={actions}
      />,
    );

    expect(html).not.toContain('data-testid="check-stamp"');
    expect(html).not.toContain("CHECKED");
  });

  it("mounts the live region empty, before there is any news to put in it", () => {
    const html = renderToStaticMarkup(
      <HoleCardPair
        cards={queenJack}
        locked={false}
        sealed={false}
        actions={actions}
      />,
    );

    expect(html).toMatch(/<span role="status"[^>]*><\/span>/);
  });

  it("renders a hint's id and both of its lines", () => {
    const html = renderToStaticMarkup(
      <HintBlock
        hint={{
          id: "folding",
          line1: "Release to fold",
          line2: "Drag back to keep",
          announce: false,
        }}
      />,
    );

    expect(html).toContain('data-hint="folding"');
    expect(html).toContain("Release to fold");
    expect(html).toContain("Drag back to keep");
  });

  it("names the corner the bend affordance is actually drawn in", () => {
    const html = renderToStaticMarkup(
      <HoleCardPair
        cards={queenJack}
        locked={false}
        sealed={false}
        actions={actions}
      />,
    );
    const zone = /<span data-bend-zone="true"[^>]*style="([^"]*)"/.exec(html);
    const zoneStyle = zone?.[1];
    if (zoneStyle === undefined) throw new Error("no bend zone rendered");
    const sides = ["top", "bottom", "left", "right"].filter((side) =>
      new RegExp(`(^|;)${side}:`).test(zoneStyle),
    );

    const bendHint = selectHint(
      {
        presentation: "FaceDown",
        recognizer: "Idle",
        armed: false,
        locked: false,
        bendAxis: "left",
      },
      new Set(),
      {
        checkLegal: true,
        foldLegal: true,
        pending: false,
        locked: false,
        coarsePointer: true,
        quiet: true,
        checkConfirmed: false,
      },
    );

    expect(sides).toHaveLength(2);
    for (const side of sides) expect(bendHint?.line1).toContain(side);
  });
});
