import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { BurnPile } from "./BurnPile.js";

/**
 * These render without a DOM, which is also the shape of the no-WebGL
 * fallback: whatever cannot animate the burn still has to show what it leaves.
 */
describe("BurnPile", () => {
  it("shows nothing before the first burn", () => {
    const html = renderToStaticMarkup(<BurnPile count={0} />);
    expect(html).toMatch(/data-burned="0"/);
    expect(html).not.toContain('data-testid="burn-ash"');
  });

  it("reports the count it was given, whatever it can render", () => {
    expect(renderToStaticMarkup(<BurnPile count={3} />)).toMatch(
      /data-burned="3"/,
    );
  });

  it("leaves more ash as the hand burns its way through", () => {
    const opacity = (count: number) =>
      Number(
        /opacity:([\d.]+)/.exec(
          renderToStaticMarkup(<BurnPile count={count} />),
        )?.[1] ?? "0",
      );
    expect(opacity(3)).toBeGreaterThan(opacity(1));
  });

  it("keeps the pile out of the accessibility tree", () => {
    expect(renderToStaticMarkup(<BurnPile count={1} />)).toMatch(
      /aria-hidden="true"/,
    );
  });

  it("falls back to settled ash rather than a canvas it cannot drive", () => {
    const html = renderToStaticMarkup(<BurnPile count={2} />);
    expect(html).not.toContain('data-testid="burn-canvas"');
    expect(html).toContain('data-testid="burn-ash"');
  });
});
