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

    expect(html).toMatch(/^<button [^>]*type="button"/);
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
});
