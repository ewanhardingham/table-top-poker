import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Card } from "./Card.js";

describe("Card", () => {
  it("renders a face-up card's rank and suit as data attributes", () => {
    const html = renderToStaticMarkup(<Card rank="A" suit="spades" />);
    expect(html).toContain('data-rank="A"');
    expect(html).toContain('data-suit="spades"');
    expect(html).toContain('data-face-down="false"');
  });

  it("renders face-down without exposing rank or suit in the markup", () => {
    const html = renderToStaticMarkup(<Card faceDown />);
    expect(html).not.toContain("data-rank");
    expect(html).not.toContain("data-suit");
    expect(html).toContain('data-face-down="true"');
    expect(html).toContain('data-card-back-design="deco"');
  });

  it("prints the index in both corners, the second rotated, as a real card is", () => {
    const html = renderToStaticMarkup(<Card rank="Q" suit="diamonds" />);
    expect(html.match(/class="card-index/g)).toHaveLength(2);
    expect(html).toContain("rotate(180deg)");
    expect(html.match(/Q/g)?.length).toBeGreaterThanOrEqual(2);
  });

  it("never renders an <img> element, for either face", () => {
    const faceUp = renderToStaticMarkup(<Card rank="K" suit="hearts" />);
    const faceDown = renderToStaticMarkup(<Card faceDown />);
    expect(faceUp).not.toContain("<img");
    expect(faceDown).not.toContain("<img");
  });
});
