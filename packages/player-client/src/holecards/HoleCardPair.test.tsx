import type { Card } from "@table-top-poker/protocol";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { HoleCardPair } from "./HoleCardPair.js";
import type { CardActions } from "./ports.js";

const actions: CardActions = {
  foldLegal: true,
  checkLegal: true,
  pending: false,
  fold: () => undefined,
  check: () => undefined,
};

const queenJack: readonly [Card, Card] = [
  { rank: "Q", suit: "diamonds" },
  { rank: "J", suit: "clubs" },
];

describe("HoleCardPair", () => {
  it("deals in face-down, with no rank or suit anywhere in the document", () => {
    const html = renderToStaticMarkup(
      <HoleCardPair cards={queenJack} locked={false} actions={actions} />,
    );

    expect(html).toMatch(/data-testid="hole-cards"/);
    expect(html).toContain('data-presentation="FaceDown"');
    expect((html.match(/data-face-down="true"/g) ?? []).length).toBe(2);
    expect(html).not.toContain("data-rank");
  });

  it("renders as a real focusable button with an accessible name", () => {
    const html = renderToStaticMarkup(
      <HoleCardPair cards={queenJack} locked={false} actions={actions} />,
    );

    expect(html).toMatch(/<button [^>]*type="button"/);
    expect(html).toContain(
      'aria-label="Your hole cards, face down. Activate to reveal them."',
    );
  });

  it("names the cards for a screen reader once they are revealed", () => {
    const html = renderToStaticMarkup(
      <HoleCardPair cards={queenJack} locked actions={actions} />,
    );

    expect(html).toContain(
      'aria-label="Your hole cards, Queen of diamonds and Jack of clubs"',
    );
  });

  it("renders a locked pair face-up and inert", () => {
    const html = renderToStaticMarkup(
      <HoleCardPair cards={queenJack} locked actions={actions} />,
    );

    expect(html).toContain('data-presentation="Revealed"');
    expect(html).toContain('data-rank="Q"');
    expect(html).toContain('data-rank="J"');
    expect((html.match(/data-face-down="false"/g) ?? []).length).toBe(2);
    expect(html).toContain('aria-disabled="true"');
    // Inert, but still in the tab order with its name intact: at showdown
    // that name is where a screen-reader user reads their own hand.
    expect(html).not.toMatch(/<button[^>]*\sdisabled/);
  });

  it("renders the Absent presentation and no card pair for a seat holding nothing", () => {
    const html = renderToStaticMarkup(
      <HoleCardPair cards={null} locked={false} actions={actions} />,
    );

    expect(html).toMatch(/data-testid="no-hole-cards"/);
    expect(html).not.toMatch(/data-testid="hole-cards"/);
    expect(html).not.toContain("data-rank");
    expect(html).not.toContain("<button");
  });

  it("carries the bend affordance on both cards", () => {
    // The recognizer hit-tests this attribute, so the classifier never needs
    // to know where the corner is drawn.
    const html = renderToStaticMarkup(
      <HoleCardPair cards={queenJack} locked={false} actions={actions} />,
    );

    expect((html.match(/data-bend-zone="true"/g) ?? []).length).toBe(2);
  });

  it("does not offer the bend affordance on a locked pair", () => {
    const html = renderToStaticMarkup(
      <HoleCardPair cards={queenJack} locked actions={actions} />,
    );

    expect(html).not.toContain("data-bend-zone");
  });

  it("takes the whole gesture from the browser, so a drag is never a pan and a double-tap never a zoom", () => {
    const html = renderToStaticMarkup(
      <HoleCardPair cards={queenJack} locked={false} actions={actions} />,
    );

    expect(html).toContain("touch-action:none");
    expect(html).toContain("-webkit-touch-callout:none");
    expect(html).toContain("user-select:none");
  });

  it("renders no hint while the pair is settled", () => {
    const html = renderToStaticMarkup(
      <HoleCardPair cards={queenJack} locked={false} actions={actions} />,
    );

    expect(html).not.toContain('data-testid="hole-cards-hint"');
  });

  // The confirmation is transient, so a settled pair claiming a Check just
  // landed would be a lie. The other half of this — that the stamp *does*
  // arrive on a gesture Check, and takes the sighted hint's place when it
  // does — needs a rendered double-tap, which is the DOM test layer #156 is
  // still deciding on.
  it("stamps no Check confirmation over a pair that has not just checked", () => {
    const html = renderToStaticMarkup(
      <HoleCardPair cards={queenJack} locked={false} actions={actions} />,
    );

    expect(html).not.toContain('data-testid="check-stamp"');
    expect(html).not.toContain("CHECKED");
  });

  it("mounts the live region empty, before there is any news to put in it", () => {
    const html = renderToStaticMarkup(
      <HoleCardPair cards={queenJack} locked={false} actions={actions} />,
    );

    // A live region inserted along with its own text is not reliably
    // announced, so the region has to be here first — with nothing in it.
    expect(html).toMatch(/<span role="status"[^>]*><\/span>/);
  });
});
