import { describe, expect, it } from "vitest";
import React from "react";
import { renderToString } from "react-dom/server";
import { Card } from "./Card.js";

describe("Card", () => {
  it("renders face-down card when faceDown prop is true", () => {
    const html = renderToString(React.createElement(Card, { faceDown: true }));
    expect(html).toContain('data-testid="card-back"');
  });

  it("renders face-down card when rank or suit is missing", () => {
    const html = renderToString(React.createElement(Card, {}));
    expect(html).toContain('data-testid="card-back"');
  });

  it("renders face-up card with rank and suit when faceDown is false", () => {
    const html = renderToString(
      React.createElement(Card, { rank: "A", suit: "spades", faceDown: false }),
    );
    expect(html).toContain('data-testid="card-face"');
    expect(html).toContain('data-rank="A"');
    expect(html).toContain('data-suit="spades"');
    expect(html).toContain("♠");
  });
});
