import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AllInRow } from "./AllInRow.js";
import { allInChoices } from "./actions/allIn.js";

const noop = () => undefined;

const split = allInChoices(
  ["fold", "call", "raise", "allInCall", "allInRaise"],
  true,
);
const whole = allInChoices(
  ["fold", "call", "raise", "allInCall", "allInRaise"],
  false,
);

describe("AllInRow", () => {
  it("renders nothing when no all-in is on offer", () => {
    const html = renderToStaticMarkup(
      <AllInRow choices={[]} armed={null} pending={false} onPress={noop} />,
    );

    expect(html).toBe("");
  });

  it("offers both forks once another seat is all in", () => {
    const html = renderToStaticMarkup(
      <AllInRow choices={split} armed={null} pending={false} onPress={noop} />,
    );

    expect(html).toContain("All-in call");
    expect(html).toContain("All-in raise");
    expect(html).toContain('data-testid="action-allInCall"');
    expect(html).toContain('data-testid="action-allInRaise"');
  });

  it("offers a single wide all in while nobody has shoved", () => {
    const html = renderToStaticMarkup(
      <AllInRow choices={whole} armed={null} pending={false} onPress={noop} />,
    );

    expect(html).toContain("All in");
    expect(html).not.toContain('data-testid="action-allInCall"');
  });

  it("asks for a confirm on the armed choice only", () => {
    const html = renderToStaticMarkup(
      <AllInRow
        choices={split}
        armed="allInCall"
        pending={false}
        onPress={noop}
      />,
    );

    expect(html).toMatch(
      /data-testid="action-allInCall"[^>]*data-armed="true"/,
    );
    expect(html).toMatch(
      /data-testid="action-allInRaise"[^>]*data-armed="false"/,
    );
    expect(html).toContain("Confirm");
  });

  it("disables every choice while an action is in flight", () => {
    const html = renderToStaticMarkup(
      <AllInRow choices={split} armed={null} pending={true} onPress={noop} />,
    );

    expect(html).toMatch(/data-testid="action-allInCall"[^>]*disabled/);
    expect(html).toMatch(/data-testid="action-allInRaise"[^>]*disabled/);
  });
});
