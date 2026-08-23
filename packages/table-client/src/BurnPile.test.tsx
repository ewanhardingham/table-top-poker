import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { BurnPile } from "./BurnPile.js";

describe("BurnPile", () => {
  it("shows nothing before the first burn", () => {
    const html = renderToStaticMarkup(<BurnPile count={0} />);
    expect(html).toMatch(/data-burned="0"/);
    expect(html).not.toMatch(/data-face-down="true"/);
  });

  it("shows one face-down card per burn", () => {
    const html = renderToStaticMarkup(<BurnPile count={3} />);
    expect((html.match(/data-face-down="true"/g) ?? []).length).toBe(3);
  });

  it("burns nothing on a pile that mounts already stacked", () => {
    const html = renderToStaticMarkup(<BurnPile count={2} />);
    expect(html).not.toMatch(/data-testid="burn-flame"/);
  });

  it("keeps the pile out of the accessibility tree", () => {
    expect(renderToStaticMarkup(<BurnPile count={1} />)).toMatch(
      /aria-hidden="true"/,
    );
  });
});
